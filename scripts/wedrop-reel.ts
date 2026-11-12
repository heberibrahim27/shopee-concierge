/**
 * Posta no Instagram (Reel) um vídeo do pack da WeDrop, marcado com o
 * produto equivalente da API de AFILIADO da Shopee (de OUTRO vendedor --
 * a Shopee não paga comissão sobre a própria loja do Heber, e o Heber marca
 * o produto à mão no celular depois, já que a API não marca produto).
 * Critério (Heber, 2026-11-12: "pegue as comissões mais altas"): entre os
 * produtos que SÃO o mesmo item do vídeo, vence a maior comissão.
 *
 *   npx tsx scripts/wedrop-reel.ts --listar
 *   npx tsx scripts/wedrop-reel.ts --varrer                       (ranqueia todos os vídeos pela comissão)
 *   npx tsx scripts/wedrop-reel.ts --dry <número|trecho>          (só mostra o casamento, salva quadro e foto)
 *   npx tsx scripts/wedrop-reel.ts --postar <número|trecho> [--escolha 2]
 *
 * Fluxo do --postar: casa o produto -> gera link de afiliado -> sobe o vídeo
 * pro bucket público reels-media -> Windsor create_video_post -> grava em
 * social_posts (reel) -> apaga o vídeo do bucket -> anota em _postados.json.
 * Nada é postado sem --postar.
 *
 * Observação: os nomes dos arquivos e o _indice.csv do pack vieram com letras
 * acentuadas corrompidas (U+FFFD). Onde existe, usa-se o nome correto do
 * anúncio (_candidatos-por-texto.csv); onde não, as palavras corrompidas
 * entram como PREFIXO ("Extens�vel" -> "extens"), nunca são jogadas fora --
 * senão sobra só "lixeira cozinha" e o programa casaria com saco de lixo.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { getDb } from "../src/lib/db/client";
import { searchProductsByKeyword, generateAffiliateShortLink } from "../src/lib/shopee/queries";
import { ShopeeSortType, type ShopeeProductOffer } from "../src/lib/shopee/types";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../src/lib/db/snapshots";
import { productNameTokens } from "../src/lib/growth/productDedupe";

const PACK_DIR = process.env.WEDROP_PACK_DIR || "D:\\WEDROP-pack-videos";
const LEDGER = path.join(PACK_DIR, "_postados.json");
const CACHE = path.join(PACK_DIR, "_matches.json");
const SCRATCH = process.env.SCRATCH_DIR || path.join(process.env.TEMP || ".", "wedrop-reel");
const OWN_SHOP_ID = "337479662"; // Loja Para O Lar -- nunca é candidata (sem comissão)
const IG_ACCOUNT_ID = process.env.WINDSOR_INSTAGRAM_ACCOUNT_ID || "17841471469860803";
const BUCKET = "reels-media";
const BAD = "\uFFFD";

// Cortes de qualidade do produto de afiliado (mesma régua do grupo/IG).
const MIN_RATING = 4.6;
const MIN_SALES = 100;
const MIN_COVERAGE = 0.7; // fração das palavras do título que o anúncio precisa conter (garante o MESMO produto)

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const argVal = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find((a) => !a.startsWith("--") && a !== argVal("--escolha"));

// ---------- vídeos ----------
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith(".mp4")) out.push(p);
  }
  return out;
}

function readJson(file: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function pending(all: string[]): string[] {
  const ledger = readJson(LEDGER);
  return all.filter((f) => !ledger[path.basename(f)]);
}

/** "Batedeira Elétrica 127V com Balde 2L - Preta - 1wu7ZPWl.mp4" -> "Batedeira Elétrica 127V com Balde 2L - Preta" */
function titleFromFile(file: string): string {
  let t = path.basename(file).replace(/\.mp4$/i, "");
  t = t.replace(/\s-\s[0-9A-Za-z_-]{6,10}$/, ""); // sufixo de id
  t = t.replace(/[-_]+/g, (m, off) => (/\s/.test(t[off - 1] ?? "") ? m : " ")); // slugs: hífen vira espaço
  return t.replace(/\s+/g, " ").trim();
}

/** Id do vídeo (8 primeiros caracteres do id do Drive) que o downloader pôs no fim do nome. */
function videoKey(file: string): string | null {
  const m = path.basename(file).match(/\s-\s([0-9A-Za-z_-]{8})\.mp4$/i);
  return m ? m[1] : null;
}

/** videoId(8) -> nome correto do anúncio da loja (melhor pontuação), de _candidatos-por-texto.csv */
let candidateNames: Map<string, string> | null = null;
function listingNameFor(file: string): string | null {
  if (!candidateNames) {
    candidateNames = new Map();
    const best = new Map<string, number>();
    try {
      const rows = fs.readFileSync(path.join(PACK_DIR, "_candidatos-por-texto.csv"), "utf8").split(/\r?\n/).slice(1);
      for (const r of rows) {
        const p = r.split(";");
        if (p.length < 7) continue;
        const score = parseFloat(p[0]);
        const key = (p[3] || "").slice(0, 8);
        const name = p.slice(6).join(";").trim();
        if (!key || !name || name.includes(BAD)) continue; // só nomes sem corrupção
        if (!best.has(key) || score > best.get(key)!) {
          best.set(key, score);
          candidateNames.set(key, name);
        }
      }
    } catch {
      /* sem o CSV, usa só o nome do arquivo */
    }
  }
  const k = videoKey(file);
  return k ? candidateNames.get(k) ?? null : null;
}

// ---------- casamento com a API de afiliado ----------
const GENERIC = new Set([
  "kit", "pecas", "peca", "unidades", "unidade", "novo", "nova", "ugc", "narrado", "prova", "visual", "facil", "montar",
  "preto", "preta", "branco", "branca", "cinza", "azul", "verde", "rosa", "vermelho", "vermelha", "amarelo", "amarela",
  "sortido", "sortida", "roxo", "roxa", "marrom", "bege", "dourado", "dourada", "prata", "grande", "pequeno", "pequena", "media",
]);

type Spec = { exact: string[]; prefixes: string[]; numbers: string[]; query: string };

/** Números de 2+ dígitos do texto; "1,80m" vira "180" pra casar com "180cm". */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  const plain = text.replace(/(\d)[.,](\d)/g, "$1$2");
  for (const n of plain.match(/\d{2,}/g) ?? []) out.add(n);
  // Medidas com unidade, normalizadas (3L != 13L; 1,80m == 180cm; 500ml == 0.5L):
  const norm = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  for (const m of norm.matchAll(/(\d+(?:[.,]\d+)?)\s*(litros?|ml|l|cm|mm|m|kg|g|v|w|pecas?|pcs?)(?![a-z])/g)) {
    let v = parseFloat(m[1].replace(",", "."));
    let u = m[2];
    if (/^litros?$/.test(u)) u = "l";
    else if (u === "ml") { v /= 1000; u = "l"; }
    else if (u === "m") { v *= 100; u = "cm"; }
    else if (u === "mm") { v /= 10; u = "cm"; }
    else if (u === "g") { v /= 1000; u = "kg"; }
    else if (/^(pecas?|pcs?)$/.test(u)) u = "pc";
    if (Number.isFinite(v)) out.add(`${Math.round(v * 1000) / 1000}${u}`);
  }
  return out;
}

function buildSpec(title: string): Spec {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  for (const w of title.split(/\s+/)) {
    const i = w.indexOf(BAD);
    if (i >= 0) {
      const pre = w.slice(0, i).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      if (pre.length >= 3) prefixes.add(pre);
      continue;
    }
    for (const t of productNameTokens(w)) if (!GENERIC.has(t) && !/\d/.test(t)) exact.add(t); // números ficam na regra própria
  }
  return { exact: [...exact], prefixes: [...prefixes], numbers: [...numbersIn(title)], query: [...exact].slice(0, 6).join(" ") };
}

type Match = { offer: ShopeeProductOffer; coverage: number; rank: number };

async function findMatches(title: string): Promise<Match[]> {
  const spec = buildSpec(title);
  const total = spec.exact.length + spec.prefixes.length;
  if (spec.exact.length === 0 || total < 2) return [];
  // A API de afiliado responde "System Error [10000]" de forma intermitente e por consulta
  // (achado 2026-11-12: "cadeira camping dobravel tela" quebra, "cadeira camping dobravel"
  // funciona) -- por isso várias versões, da mais específica pra mais curta, e o resultado
  // de qualquer uma que responder entra no pool.
  const words = spec.exact;
  const queries = [...new Set([words.slice(0, 6).join(" "), words.slice(0, 4).join(" "), words.slice(0, 3).join(" ")])].filter(Boolean);
  const seen = new Map<string, ShopeeProductOffer>();
  let okCalls = 0; // consultas que a API respondeu (mesmo com 0 resultados); só repete se TODAS deram erro
  for (let round = 0; round < 3 && okCalls === 0; round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, 2500)); // a API some por instantes; tenta de novo
    for (const [qi, keyword] of queries.entries()) {
      const sorts = qi === 0 ? [ShopeeSortType.ITEM_SOLD_DESC, ShopeeSortType.RELEVANCE_DESC] : [ShopeeSortType.ITEM_SOLD_DESC];
      for (const sortType of sorts) {
        try {
          const offers = await searchProductsByKeyword({ keyword, limit: 30, sortType });
          okCalls++;
          for (const o of offers) seen.set(String(o.itemId), { ...o, itemId: String(o.itemId), shopId: String(o.shopId) });
        } catch {
          /* consulta recusada: as outras versões cobrem */
        }
      }
    }
  }
  // Se NENHUMA consulta foi respondida, a API estava fora -- isso NÃO é "não existe produto equivalente".
  if (okCalls === 0) throw new Error("API de afiliado da Shopee indisponível agora (todas as consultas deram erro)");
  const out: Match[] = [];
  for (const o of seen.values()) {
    if (String(o.shopId) === OWN_SHOP_ID) continue;
    const rating = Number(o.ratingStar ?? 0);
    const sales = o.sales ?? 0;
    const price = Number(o.priceMin ?? 0);
    if (rating < MIN_RATING || sales < MIN_SALES || price <= 0) continue;
    const nameTokens = productNameTokens(o.productName);
    const tokenList = [...nameTokens];
    const hitExact = spec.exact.filter((t) => nameTokens.has(t)).length;
    const hitPrefix = spec.prefixes.filter((p) => tokenList.some((t) => t.startsWith(p))).length;
    const coverage = (hitExact + hitPrefix) / total;
    if (coverage < MIN_COVERAGE) continue;
    // Trava de "mesmo produto": (1) todo número do título (778 litros, 180cm, 127V) tem
    // de aparecer no anúncio; (2) o tipo do produto (1ª palavra) tem de estar no começo do
    // nome do anúncio -- senão "piscina 778 L" casa com piscina infantil e "árvore de Natal"
    // com festão.
    const offerNums = numbersIn(o.productName);
    if (!spec.numbers.every((n) => offerNums.has(n))) continue;
    const head = spec.exact[0];
    const firstTokens = [...productNameTokens(o.productName)].slice(0, 4);
    if (head && !firstTokens.includes(head)) continue;
    const commission = Number(o.commissionRate ?? 0);
    // "pegue as comissões mais altas": comissão manda; cobertura e vendas só desempatam.
    const rank = commission * 1000 + coverage * 10 + Math.log10(sales + 1);
    out.push({ offer: o, coverage, rank });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 5);
}

function describe(m: Match, i: number): string {
  const o = m.offer;
  return `  [${i + 1}] item ${o.itemId} | cobertura ${(m.coverage * 100).toFixed(0)}% | R$${o.priceMin} | comissão ${(Number(o.commissionRate ?? 0) * 100).toFixed(0)}% | ${o.sales} vendas | nota ${o.ratingStar} | ${o.shopName}\n      ${o.productName.slice(0, 110)}`;
}

// ---------- legenda ----------
function brl(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function buildCaption(offer: ShopeeProductOffer, shortLink: string): string {
  const name = offer.productName.length > 90 ? offer.productName.slice(0, 87).trimEnd() + "..." : offer.productName;
  return `${name}\n\n💰 A partir de ${brl(Number(offer.priceMin))} na Shopee\n🔗 Link: ${shortLink}\n\n👇 Entra no grupo de ofertas (link na bio)\n\n#promocao #achadinhos #shopee #ofertas`;
}

// ---------- Windsor / Instagram ----------
function extractMediaId(resp: any): string | null {
  if (typeof resp?.result === "string") {
    const m = resp.result.match(/Media id:\s*(\d+)/i);
    if (m) return m[1];
  }
  return resp?.id ?? resp?.media_id ?? resp?.data?.id ?? resp?.data?.media_id ?? null;
}

async function windsorVideoPost(videoUrl: string, caption: string): Promise<any> {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY não configurada.");
  const resp = await fetch(`https://connectors.windsor.ai/instagram/actions?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: IG_ACCOUNT_ID, action: "create_video_post", params: { video_url: videoUrl, caption, share_to_feed: true } }),
  });
  const json: any = await resp.json().catch(() => null);
  if (!resp.ok || json?.error) throw new Error(`Windsor create_video_post falhou (${resp.status}): ${JSON.stringify(json)}`);
  return json;
}

function resolveVideo(sel: string, all: string[]): string {
  if (fs.existsSync(sel)) return sel;
  if (/^\d+$/.test(sel)) {
    const f = pending(all)[Number(sel) - 1];
    if (!f) throw new Error(`não existe o vídeo número ${sel} (veja --listar)`);
    return f;
  }
  // Cada letra do trecho pode casar com a própria letra (sem acento) OU com o caractere corrompido.
  const norm = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const escapeRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = [...norm(sel)].map((c) => (/[a-z0-9]/.test(c) ? `(?:${c}|${BAD})` : escapeRe(c))).join("");
  const re = new RegExp(pattern);
  const hits = all.filter((f) => re.test(norm(path.relative(PACK_DIR, f))));
  if (hits.length === 0) throw new Error(`nenhum vídeo bate com "${sel}"`);
  if (hits.length > 1) throw new Error(`"${sel}" bate com ${hits.length} vídeos (use o número de --listar):\n${hits.slice(0, 8).join("\n")}`);
  return hits[0];
}

/**
 * O título do ARQUIVO manda (é o produto do vídeo: tamanho, voltagem, cor). O nome
 * do anúncio da loja (casado por texto parecido, pode ser outro tamanho/cor) só
 * serve pra CONSERTAR o acento de palavras corrompidas: "Autom�tica" -> "Automática"
 * quando o anúncio tem uma palavra de mesmo tamanho que começa igual.
 */
function searchTitle(file: string): { title: string; fonte: string } {
  const fileTitle = titleFromFile(file);
  const listing = listingNameFor(file);
  if (!listing || !fileTitle.includes(BAD)) return { title: fileTitle, fonte: "nome do arquivo" };
  const norm = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const listingWords = listing.split(/\s+/);
  let repaired = 0;
  const title = fileTitle
    .split(/\s+/)
    .map((w) => {
      const i = w.indexOf(BAD);
      if (i < 0) return w;
      const pre = norm(w.slice(0, i));
      const hit = listingWords.find((lw) => lw.length === w.length && norm(lw).startsWith(pre));
      if (hit) {
        repaired++;
        return hit;
      }
      return w;
    })
    .join(" ");
  return { title, fonte: repaired ? `nome do arquivo (${repaired} acento(s) consertado(s) pelo anúncio)` : "nome do arquivo" };
}

/** Folha de conferência: quadro do vídeo + foto de cada candidato, lado a lado (candidato [1] logo após o quadro). */
async function makeSheet(file: string, matches: Match[], sheet: string): Promise<void> {
  fs.mkdirSync(path.dirname(sheet), { recursive: true });
  const frame = sheet.replace(/\.jpg$/, "-quadro.jpg");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "3", "-i", file, "-frames:v", "1", "-q:v", "3", frame]);
  const inputs = [frame];
  for (const [i, m] of matches.entries()) {
    if (!m.offer.imageUrl) continue;
    const img = await fetch(m.offer.imageUrl);
    const p = sheet.replace(/\.jpg$/, `-c${i + 1}.jpg`);
    fs.writeFileSync(p, Buffer.from(await img.arrayBuffer()));
    inputs.push(p);
  }
  const filters = inputs.map((_, i) => (i === 0 ? `[0]scale=-2:420[v0]` : `[${i}]scale=420:420:force_original_aspect_ratio=decrease,pad=420:420:(ow-iw)/2:(oh-ih)/2:white[v${i}]`));
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs.flatMap((f) => ["-i", f]), "-filter_complex", `${filters.join(";")};${inputs.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${inputs.length}`, "-frames:v", "1", "-q:v", "4", sheet]);
}

async function main() {
  const all = walk(PACK_DIR);
  const ledger = readJson(LEDGER);

  if (flag("--listar")) {
    const pend = pending(all);
    console.log(`${all.length} vídeos baixados | ${all.length - pend.length} já postados | ${pend.length} pendentes`);
    pend.slice(0, 60).forEach((f, i) => console.log(`${String(i + 1).padStart(3)}. ${path.relative(PACK_DIR, f)}`));
    return;
  }

  if (flag("--varrer")) {
    const cache = readJson(CACHE);
    // refaz os que deram erro de API; "sem equivalente" confirmado (melhor = null, sem erro) fica.
    const todo = pending(all).filter((f) => !cache[path.basename(f)] || cache[path.basename(f)].erro);
    console.log(`varrendo ${todo.length} vídeos novos (${Object.keys(cache).length} já no cache)...`);
    let n = 0;
    for (const f of todo) {
      const { title, fonte } = searchTitle(f);
      try {
        const ms = await findMatches(title);
        const b = ms[0];
        cache[path.basename(f)] = {
          video: path.relative(PACK_DIR, f),
          titulo: title,
          fonte,
          melhor: b
            ? { itemId: String(b.offer.itemId), nome: b.offer.productName.slice(0, 100), preco: Number(b.offer.priceMin), comissao: Number(b.offer.commissionRate ?? 0), vendas: b.offer.sales, nota: b.offer.ratingStar, loja: b.offer.shopName, cobertura: b.coverage }
            : null,
        };
      } catch (e: any) {
        cache[path.basename(f)] = { video: path.relative(PACK_DIR, f), titulo: title, erro: String(e?.message ?? e).slice(0, 120) };
      }
      if (++n % 10 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
        console.log(`  ${n}/${todo.length}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    const ranked = Object.values(cache).filter((c: any) => c.melhor).sort((a: any, b: any) => b.melhor.comissao - a.melhor.comissao);
    const semMatch = Object.values(cache).filter((c: any) => !c.melhor).length;
    console.log(`\n${ranked.length} vídeos com produto de afiliado equivalente | ${semMatch} sem equivalente (ficam de fora)`);
    console.log("\nTOP 25 por comissão:");
    ranked.slice(0, 25).forEach((c: any, i: number) => console.log(`${String(i + 1).padStart(2)}. ${(c.melhor.comissao * 100).toFixed(0)}% R$${c.melhor.preco} ${c.melhor.vendas}v | ${c.titulo.slice(0, 46)}  =>  ${c.melhor.nome.slice(0, 55)}`));
    return;
  }

  // ---------- fila aprovada (5 Reels/dia, cada produto conferido a olho antes) ----------
  const FILA_DIR = path.join(SCRATCH, "fila");
  const FILA_JSON = path.join(FILA_DIR, "fila.json");
  const APPROVED = path.join(PACK_DIR, "_aprovados.json");
  const REJECTED = path.join(PACK_DIR, "_rejeitados.json");

  if (flag("--fila")) {
    // Pega os N vídeos de MAIOR comissão ainda não tratados e monta uma folha de conferência de cada.
    const n = Number(argVal("--fila") ?? 5);
    const cache = readJson(CACHE);
    const approved = readJson(APPROVED);
    const rejected = readJson(REJECTED);
    const ranked = Object.entries(cache)
      .filter(([k, c]: [string, any]) => c.melhor && !ledger[k] && !approved[k] && !rejected[k])
      .sort((a: any, b: any) => b[1].melhor.comissao - a[1].melhor.comissao)
      .slice(0, n);
    fs.mkdirSync(FILA_DIR, { recursive: true });
    const fila: Record<string, Match[]> = readJson(FILA_JSON);
    let idx = 0;
    for (const [k, c] of ranked as [string, any][]) {
      idx++;
      const f = path.join(PACK_DIR, c.video);
      const { title } = searchTitle(f);
      let ms: Match[] = [];
      try {
        ms = await findMatches(title);
      } catch (e: any) {
        console.log(`${idx}. ${c.video}: ${String(e?.message ?? e)} -- pulei`);
        continue;
      }
      if (ms.length === 0) {
        console.log(`${idx}. ${c.video}: nenhum candidato passou nos cortes (com as regras novas de medida) -- pulei`);
        continue;
      }
      fila[k] = ms;
      const sheet = path.join(FILA_DIR, `${String(idx).padStart(2, "0")}.jpg`);
      await makeSheet(f, ms, sheet);
      console.log(`\n${idx}. ${c.video}\n   título: ${title}\n   folha: ${sheet}`);
      ms.forEach((m, i) => console.log(describe(m, i)));
    }
    fs.writeFileSync(FILA_JSON, JSON.stringify(fila));
    console.log("\nConfira as folhas. Depois: --aprovar <trecho> <item>  ou  --rejeitar <trecho>");
    return;
  }

  if (flag("--aprovar")) {
    const i = args.indexOf("--aprovar");
    const sel = args[i + 1];
    const itemId = args[i + 2];
    if (!sel || !itemId) throw new Error("uso: --aprovar <trecho do vídeo> <código do item>");
    const f = resolveVideo(sel, all);
    const k = path.basename(f);
    const hit = (readJson(FILA_JSON)[k] as Match[] | undefined)?.find((m) => String(m.offer.itemId) === itemId);
    if (!hit) throw new Error(`o item ${itemId} não está na fila deste vídeo (rode --fila)`);
    const approved = readJson(APPROVED);
    approved[k] = { video: path.relative(PACK_DIR, f), offer: hit.offer, aprovadoEm: new Date().toISOString() };
    fs.writeFileSync(APPROVED, JSON.stringify(approved, null, 1));
    console.log(`aprovado: ${k} -> ${hit.offer.productName.slice(0, 70)} (${(Number(hit.offer.commissionRate ?? 0) * 100).toFixed(0)}%)`);
    return;
  }

  if (flag("--rejeitar")) {
    const f = resolveVideo(args[args.indexOf("--rejeitar") + 1], all);
    const rejected = readJson(REJECTED);
    rejected[path.basename(f)] = "nenhum candidato é o mesmo produto do vídeo";
    fs.writeFileSync(REJECTED, JSON.stringify(rejected, null, 1));
    console.log("rejeitado (não volta pra fila):", path.basename(f));
    return;
  }

  if (flag("--proximo")) {
    const approved = readJson(APPROVED);
    const next = Object.entries(approved)
      .filter(([k]) => !ledger[k])
      .sort((a: any, b: any) => String(a[1].aprovadoEm).localeCompare(String(b[1].aprovadoEm)))[0] as [string, any] | undefined;
    if (!next) {
      console.log("Nenhum vídeo aprovado na fila. Rode --fila e aprove alguns.");
      process.exitCode = 3;
      return;
    }
    const f = path.join(PACK_DIR, next[1].video);
    console.log("Postando o próximo aprovado:", next[1].video);
    await publishReel(f, next[1].offer as ShopeeProductOffer, ledger);
    return;
  }

  if (!target) throw new Error('informe o vídeo: --dry <número|trecho> ou --postar <número|trecho>');

  const file = resolveVideo(target, all);
  const { title, fonte } = searchTitle(file);
  console.log("Vídeo :", path.relative(PACK_DIR, file));
  console.log(`Título: ${title}  (${fonte})`);
  if (ledger[path.basename(file)]) console.log("ATENÇÃO: esse vídeo já foi postado:", JSON.stringify(ledger[path.basename(file)]));

  // --item <código>: posta o produto que foi CONFERIDO no --dry (guardado em last-dry.json),
  // sem depender de uma nova busca (a API de afiliado é intermitente e a ordem pode mudar).
  const LAST = path.join(SCRATCH, "last-dry.json");
  const wantedItem = argVal("--item");
  let matches: Match[] = [];
  if (wantedItem) {
    const last = readJson(LAST);
    const saved: Match[] | undefined = last[path.basename(file)];
    const hit = saved?.find((m) => String(m.offer.itemId) === wantedItem);
    if (!hit) throw new Error(`o item ${wantedItem} não está no último --dry deste vídeo; rode --dry de novo`);
    matches = [hit];
  } else {
    matches = await findMatches(title);
    if (matches.length > 0) {
      fs.mkdirSync(SCRATCH, { recursive: true });
      const last = readJson(LAST);
      last[path.basename(file)] = matches;
      fs.writeFileSync(LAST, JSON.stringify(last));
    }
  }
  if (matches.length === 0) {
    console.log("\nNenhum produto de afiliado passou nos cortes (nota ≥ 4.6, ≥ 100 vendas, ≥ 70% das palavras do título). NÃO posto.");
    process.exitCode = 2;
    return;
  }
  console.log(`\nMelhores produtos de afiliado (${matches.length}):`);
  matches.forEach((m, i) => console.log(describe(m, i)));

  fs.mkdirSync(SCRATCH, { recursive: true });
  const framePath = path.join(SCRATCH, "frame.jpg");
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "3", "-i", file, "-frames:v", "1", "-q:v", "3", framePath]);
    console.log("\nQuadro do vídeo salvo em:", framePath);
  } catch {
    console.log("(não consegui extrair o quadro do vídeo)");
  }
  const chosen = matches[Number(argVal("--escolha") ?? 1) - 1];

  // Folha de conferência: quadro do vídeo + foto de cada candidato, lado a lado (1º = [1], 2º = [2]...).
  // Só comparar palavras acerta a CATEGORIA, não o produto -- é o olho que confirma.
  try {
    const inputs = [framePath];
    for (const [i, m] of matches.entries()) {
      if (!m.offer.imageUrl) continue;
      const img = await fetch(m.offer.imageUrl);
      const p = path.join(SCRATCH, `c${i + 1}.jpg`);
      fs.writeFileSync(p, Buffer.from(await img.arrayBuffer()));
      inputs.push(p);
    }
    const n = inputs.length;
    const filters = inputs.map((_, i) => (i === 0 ? `[0]scale=-2:420[v0]` : `[${i}]scale=420:420:force_original_aspect_ratio=decrease,pad=420:420:(ow-iw)/2:(oh-ih)/2:white[v${i}]`));
    const sheet = path.join(SCRATCH, "folha.jpg");
    execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs.flatMap((f) => ["-i", f]), "-filter_complex", `${filters.join(";")};${inputs.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${n}`, "-frames:v", "1", "-q:v", "4", sheet]);
    console.log("Folha de conferência (quadro + candidatos [1]..[" + (n - 1) + "] da esquerda p/ direita):", sheet);
  } catch (e: any) {
    console.log("(não consegui montar a folha de conferência:", String(e?.message ?? e).slice(0, 120) + ")");
  }

  if (!flag("--postar")) {
    console.log(`\n(modo --dry: nada foi postado. Para postar: --postar ${target} [--escolha N])`);
    return;
  }

  // ----- postar -----
  await publishReel(file, chosen.offer, ledger);
}

async function publishReel(file: string, offer: ShopeeProductOffer, ledger: Record<string, any>): Promise<void> {
  const db = getDb();
  const { productId, snapshotId } = await persistOfferSnapshot(offer);
  const token = `w${crypto.createHash("sha1").update(file).digest("hex").slice(0, 6)}`;
  const subIds = ["ig", "reel", "wd", token];
  const link = await generateAffiliateShortLink({ originUrl: offer.productLink || offer.offerLink, subIds });
  const dc = await createDealCandidate({
    productId,
    offerSnapshotId: snapshotId,
    status: "discovered",
    score: 80,
    scoreBreakdown: { origem: "wedrop-reel", video: path.basename(file) },
  });
  await saveAffiliateLink({ dealCandidateId: dc.id, originUrl: offer.productLink || offer.offerLink, subIds, shortLink: link.shortLink, longLink: link.longLink });

  const caption = buildCaption(offer, link.shortLink);
  console.log("\nLegenda:\n" + caption);

  const objectPath = `wedrop/${token}-${Date.now()}.mp4`;
  const up = await db.storage.from(BUCKET).upload(objectPath, fs.readFileSync(file), { contentType: "video/mp4", upsert: false });
  if (up.error) throw new Error(`upload falhou: ${up.error.message}`);
  const videoUrl = db.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  console.log("Vídeo hospedado (temporário):", videoUrl);

  try {
    const resp = await windsorVideoPost(videoUrl, caption);
    const mediaId = extractMediaId(resp);
    await db.from("social_posts").insert({
      deal_candidate_id: dc.id,
      post_type: "reel",
      image_url: offer.imageUrl,
      caption,
      status: "posted",
      media_id: mediaId,
      error: mediaId ? null : `sem media_id na resposta: ${JSON.stringify(resp).slice(0, 500)}`,
      posted_at: new Date().toISOString(),
    });
    ledger[path.basename(file)] = { postadoEm: new Date().toISOString(), mediaId, produto: offer.productName.slice(0, 80), shortLink: link.shortLink };
    fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
    console.log("\nPOSTADO no Instagram. media id:", mediaId, "| resposta:", JSON.stringify(resp).slice(0, 200));
  } catch (err: any) {
    await db.from("social_posts").insert({ deal_candidate_id: dc.id, post_type: "reel", image_url: offer.imageUrl, caption, status: "failed", error: String(err?.message ?? err).slice(0, 500) });
    console.error("\nFALHOU:", err?.message ?? err);
    process.exitCode = 1;
  } finally {
    await db.storage.from(BUCKET).remove([objectPath]);
    console.log("Vídeo temporário removido do bucket.");
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
