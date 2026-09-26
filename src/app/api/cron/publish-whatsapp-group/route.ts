import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { createZApiConnector } from "../../../../lib/channel/zapi";
import { getPlatformInfo } from "../../../../lib/site/platforms";
import { computeDemandSignal, type DemandSignal } from "../../../../lib/growth/demandSignal";
import { generateEvidenceCopy } from "../../../../lib/growth/offerCopy";
import { scrapeFeaturedProduct } from "../../../../lib/mercadolivre/scrape";
import { isDuplicateOfPosted, type PostedProductRecord } from "../../../../lib/growth/productDedupe";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Publica automaticamente uma oferta por execução no grupo real do
 * WhatsApp "Descontos Chegando #GR42" (pedido do Heber, 2026-09-21):
 * link de afiliado + foto do produto (direto por URL, sem baixar nada)
 * + texto gerado + link de convite do grupo no rodapé, pra quem
 * compartilhar a mensagem já levar gente pro grupo.
 *
 * Fluxo de dedupe/seleção é o mesmo do Instagram (pickNextCandidate em
 * publish-product/route.ts) — filtro de "já postado" DENTRO da query
 * SQL, antes do corte por score (bug real corrigido em 2026-09-21,
 * mesma lição aplicada aqui desde o início). Stream independente do
 * Instagram: post_type='whatsapp' no social_posts, então o mesmo
 * produto pode aparecer nos dois canais sem se atrapalharem.
 */

// Grupo real "Descontos Chegando #GR42" — achado via GET .../chats
// (Z-API) e confirmado com group-metadata (128 participantes, 2 admins,
// 2026-09-21). ID de grupo na Z-API, não telefone.
const WHATSAPP_GROUP_ID = process.env.ZAPI_DESCONTOS_GROUP_ID || "120363368934404281-group";

type Candidate = {
  dealCandidateId: string;
  productId: string;
  productName: string;
  platform: string;
  categorySlug: string | null;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number;
  offerLink: string;
  baseScore: number;
};

// Heber (2026-09-22, urgente): "só mandou quase o dia todo produtos de
// farmácia uruguai, eu pedi pra divulgar não pra só divulgar ele" — o
// boost proposital da Farmácia Uruguai (score fixo 95, alguns até
// 998/999) vence QUALQUER produto comum da Shopee (~85-90) também,
// não só o Awin. Resultado real medido num dia: 37 de 52 posts (71%)
// eram Farmácia Uruguai. A rotação por categoria abaixo já limita muito
// a frequência de qualquer origem sozinha, mas a trava dedicada continua
// como rede de segurança (a preferência continua real, só não pode virar
// exclusividade).
const FARMACIA_ORIGEM = "loja-propria-farmacia-uruguai";
const FARMACIA_ROTATION_STREAK = 2;

function isFarmaciaRow(row: any): boolean {
  return row.score_breakdown?.origem === FARMACIA_ORIGEM;
}

// Achado real (2026-09-24, investigando com o Heber "Mercado livre não
// tem mais postagens?"): Nike/Kabum/Olympikus (feed Awin) e Mercado
// Livre estavam realmente travados desde a madrugada — a reserva de
// vaga antiga (streak de 4 Shopee seguidos) até disparava certo, mas o
// dedupe por nome (isDuplicateOfPosted, commit e911bd7) comparava
// candidatos de QUALQUER plataforma contra o histórico de QUALQUER
// plataforma. "Tênis Nike Flex Runner" e "Tênis Olympikus Angel" batiam
// >=0.6 de similaridade contra os dezenas de tênis Shopee genéricos já
// postados (mesma categoria "esporte", tokens genéricos como
// "tenis"/"feminino"/"infantil") e ficavam permanentemente bloqueados —
// confirmado ao vivo: os 50 candidatos Awin de maior score vinham 100%
// DUP, zero elegível, toda vez. O dedupe nasceu pra pegar "mesmo produto
// físico, vendedor diferente" DENTRO da Shopee — nunca deveria comparar
// Nike com Shopee, são catálogos diferentes. Correção: escopar dedupe
// por "bucket" de marketplace (nike/kabum/olympikus juntos, já que
// dividem o mesmo feed Awin e podem ter duplicata real entre si).
const AWIN_PLATFORMS = new Set(["nike", "kabum", "olympikus"]);
function platformBucket(platform: string): string {
  return AWIN_PLATFORMS.has(platform) ? "awin" : platform;
}

// Pedido explícito do Heber (2026-09-24), com exemplo dado por ele:
// "Shopee tv / ML tv / Shopee geladeira / ML geladeira / Shopee tênis /
// ML tênis / Awin tênis / Shopee eletroportáteis / ML eletroportáteis /
// Shopee cozinha / ML cozinha... vai rodando por categoria que tem
// demais" — em vez de correr score global (Shopee sempre vence) ou
// depender de streak, cada (categoria, marketplace) tem seu próprio
// "último postado em", e a cada execução escolhe o par mais
// desatualizado entre os que têm candidato disponível de verdade. Isso
// reproduz a sequência que ele descreveu organicamente, sem hardcode de
// ordem fixa de categoria.
const MARKETPLACE_ROTATION_ORDER = ["shopee", "mercadolivre", "awin"];
const CANDIDATE_POOL_LIMIT = 400;

// Heber (2026-09-25, urgente -- irmão reclamou no grupo real): "grupo de
// achadinhos é de produtos baratos". A atualização do catálogo Kabum criou
// dezenas de pares (categoria, awin) nunca postados antes -- a rotação por
// par mais desatualizado (acima) prioriza esses pares corretamente pela
// própria lógica, só que isso significou ~12h seguidas de só Kabum,
// maioria sem price_discount_rate real (score cai no fallback ~85 fixo) e
// caro (iPad R$5.899, Apple Watch R$7.399, iPhone R$11.699 -- nada
// "achadinho"). Teto de preço pra manter o grupo fiel ao que ele é.
// R$150 cobre os achados reais que já rodavam (Shopee/ML de R$7 a R$196,
// Farmácia Uruguai até R$129,90) sem abrir pra catálogo cheio de
// eletrônico caro; ajustar aqui se o valor certo for outro.
const GROUP_PRICE_CEILING = 150;

function withinPriceCeiling(row: any): boolean {
  const price = row.offer_snapshots?.price_min;
  return price != null && Number(price) <= GROUP_PRICE_CEILING;
}

// Heber (2026-09-25, mesmo dia do teto de preço acima): "só tem produtos
// da Awin no grupo, cadê a Shopee?" -- o teto resolveu "caro", não
// resolveu "só uma origem". Causa: o backfill do catálogo Kabum criou
// pares (categoria, awin) nunca postados em massa; "nunca postado" vence
// QUALQUER par já postado (linha 306+ abaixo), e Shopee/ML têm histórico
// recente em quase toda categoria -- então awin ganha a prioridade de
// "mais desatualizado" toda vez, em toda categoria, até o catálogo
// inteiro ser revisitado (pode levar dias). Mesmo padrão já usado pra
// farmácia (FARMACIA_ROTATION_STREAK acima): depois de N posts seguidos
// do mesmo bucket de marketplace, força o próximo a vir de outro.
const BUCKET_ROTATION_STREAK = 3;

// Achado real (2026-09-26, Heber: "só tá mandando coisas da Awin no
// grupo... tá foda" / "quero Shopee maioria, as outras ocasionalmente"
// -- debatido com o ChatGPT antes de implementar). Duas causas juntas:
// (1) bug real -- o FALLBACK (rerankWithDemand sobre o pool inteiro,
// linha ~380 abaixo) ignorava forceNonBucket completamente, então
// mesmo com a trava de streak ligada, toda vez que o loop principal
// não achava par elegível fora do bucket forçado, o fallback
// reranqueava TUDO por score e devolvia Kabum de novo -- uma porta dos
// fundos que anulava a trava. Corrigido: o fallback agora filtra o
// bucket forçado também, só volta pra ele se o pool filtrado ficar
// vazio de verdade. (2) streak sozinho não GARANTE maioria (só evita
// sequência longa) -- adicionada regra de proporção real: numa janela
// dos últimos 5 posts, pelo menos 3 precisam ser Shopee; se cair
// abaixo disso, força a escolha pra dentro do bucket Shopee
// especificamente (prioridade mais alta que o streak-guard, que continua
// como refinamento secundário).
const MIN_SHOPEE_IN_LAST_5 = 3;
const SHOPEE_WINDOW = 5;

type PostedRecord = {
  productId: string;
  productName: string;
  categorySlug: string | null;
  platform: string;
  postedAt: string;
};

async function fetchPostedHistory(db: ReturnType<typeof getDbFresh>): Promise<PostedRecord[]> {
  const { data } = await db
    .from("social_posts")
    .select("posted_at, deal_candidates(product_id, products(product_name, platform, category_slug))")
    .eq("post_type", "whatsapp")
    .eq("status", "posted")
    .order("posted_at", { ascending: false });
  return (data ?? [])
    .map((r: any) => {
      const p = r.deal_candidates?.products;
      const productId = r.deal_candidates?.product_id;
      if (!p || !productId) return null;
      return {
        productId,
        productName: p.product_name,
        categorySlug: p.category_slug ?? null,
        platform: p.platform ?? "shopee",
        postedAt: r.posted_at,
      };
    })
    .filter((r): r is PostedRecord => r !== null);
}

function candidateFromRow(row: any): Candidate | null {
  const snap = row.offer_snapshots;
  if (!snap?.image_url || !snap?.offer_link || snap.price_min == null) return null;
  return {
    dealCandidateId: row.id,
    productId: row.product_id,
    productName: row.products?.product_name ?? "Oferta imperdível",
    platform: row.products?.platform ?? "shopee",
    categorySlug: row.products?.category_slug ?? null,
    imageUrl: snap.image_url,
    priceMin: Number(snap.price_min),
    priceDiscountRate: Number(snap.price_discount_rate ?? 0),
    offerLink: snap.offer_link,
    baseScore: Number(row.score ?? 0),
  };
}

async function fetchAvailableCandidateRows(db: ReturnType<typeof getDbFresh>, postedProductIds: string[]): Promise<any[]> {
  // `!inner` garante que products vem sempre presente (nunca null) —
  // necessário pro agrupamento por categoria/plataforma abaixo.
  let query = db
    .from("deal_candidates")
    .select(
      "id, score, score_breakdown, product_id, products!inner(product_name, platform, category_slug), offer_snapshots(image_url, price_min, price_discount_rate, offer_link)"
    )
    // Nunca reconsidera um candidato marcado "unavailable" (re-checagem
    // de disponibilidade real, ver GET abaixo) — sem isso o candidato
    // indisponível voltaria a competir de novo a cada execução do cron.
    .neq("status", "unavailable");
  if (postedProductIds.length > 0) {
    query = query.not("product_id", "in", `(${postedProductIds.join(",")})`);
  }
  const { data, error } = await query
    .order("score", { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_POOL_LIMIT);
  return error || !data ? [] : (data as any[]);
}

/**
 * Agrupa o pool (já ordenado por score desc) por par (categoria, bucket
 * de marketplace) — cada grupo mantém a ordem de score, então o primeiro
 * de cada grupo já é o melhor candidato daquele par.
 */
function groupByCategoryAndBucket(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const categorySlug = row.products?.category_slug;
    if (!categorySlug) continue;
    const platform = row.products?.platform ?? "shopee";
    const key = `${categorySlug}::${platformBucket(platform)}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Epoch ms da última vez que cada par (categoria, bucket) foi postado — ausente = nunca. */
function lastPostedAtByCategoryBucket(history: PostedRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of history) {
    if (!record.categorySlug) continue;
    const key = `${record.categorySlug}::${platformBucket(record.platform)}`;
    const ts = new Date(record.postedAt).getTime();
    const existing = map.get(key);
    if (existing === undefined || ts > existing) map.set(key, ts);
  }
  return map;
}

// Achado real (2026-09-22, debate com o Heber): a seleção era puro
// `score DESC`, sem NENHUM fator de categoria — por isso o grupo
// repetia sempre TV/celular/tablet, mesmo com o catálogo tendo 18
// categorias. O Heber corrigiu minha primeira ideia (limitar frequência
// de post): "vc tem que pensar em achar o produto bom, não em diminuir
// os envios". A solução não é round-robin forçado (isso também é
// artificial) — é uma PENALIDADE que cresce com a exposição recente da
// categoria, deixando uma categoria saturada perder pra uma categoria
// descansada mesmo com score um pouco menor, sem nunca travar uma
// categoria realmente excepcional.
const SATURATION_WINDOW = 12;
const SATURATION_PENALTY_PER_RECENT_POST = 6;

async function categorySaturationPenalties(db: ReturnType<typeof getDbFresh>): Promise<Map<string, number>> {
  const { data } = await db
    .from("social_posts")
    .select("deal_candidates(products(category_slug))")
    .eq("post_type", "whatsapp")
    .order("posted_at", { ascending: false })
    .limit(SATURATION_WINDOW);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const slug = (row as any).deal_candidates?.products?.category_slug;
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const penalties = new Map<string, number>();
  for (const [slug, count] of counts) penalties.set(slug, count * SATURATION_PENALTY_PER_RECENT_POST);
  return penalties;
}

/**
 * Re-ranqueia os candidatos pré-filtrados (top 50 por score bruto)
 * somando o sinal de demanda real (demandSignal.ts — preço/venda
 * comparado ao longo do tempo, não só o desconto que a Shopee informa)
 * e subtraindo a penalidade de saturação de categoria. Só calcula
 * demanda pros primeiros CANDIDATE_EVAL_LIMIT (custo de 1 query extra
 * por candidato) — são os que já têm chance real de vencer mesmo assim.
 */
const CANDIDATE_EVAL_LIMIT = 20;

async function rerankWithDemand(
  db: ReturnType<typeof getDbFresh>,
  rows: any[],
  postedHistory: PostedProductRecord[]
): Promise<Array<{ row: any; candidate: Candidate; demand: DemandSignal; effectiveScore: number }>> {
  const penalties = await categorySaturationPenalties(db);
  const evaluated: Array<{ row: any; candidate: Candidate; demand: DemandSignal; effectiveScore: number }> = [];
  for (const row of rows.slice(0, CANDIDATE_EVAL_LIMIT)) {
    const candidate = candidateFromRow(row);
    if (!candidate) continue;
    if (isDuplicateOfPosted(candidate.productName, candidate.categorySlug, postedHistory)) continue;
    const demand = await computeDemandSignal(db, candidate.productId);
    const penalty = candidate.categorySlug ? penalties.get(candidate.categorySlug) ?? 0 : 0;
    evaluated.push({ row, candidate, demand, effectiveScore: candidate.baseScore + demand.demandBonus - penalty });
  }
  evaluated.sort((a, b) => b.effectiveScore - a.effectiveScore);
  return evaluated;
}

type Pick = { candidate: Candidate; demand: DemandSignal };

async function pickNextCandidate(db: ReturnType<typeof getDbFresh>, excludeProductIds: string[] = []): Promise<Pick | null> {
  // Achado real (Heber, 2026-09-24: a repetição que ele via no grupo era
  // "mesmo produto, de vendedor diferente") -- product_id sozinho não
  // pega isso, porque na Shopee cada vendedor do MESMO produto físico tem
  // seu próprio product_id. `postedHistory` (nome + categoria + PLATAFORMA
  // de tudo já postado, sem janela de tempo -- exclusão permanente,
  // pedido dele: "já mandou uma vez aguarda... não tem pq tá repetindo")
  // alimenta isDuplicateOfPosted SEMPRE escopado por bucket de
  // marketplace (ver platformBucket acima) -- nunca compara Nike com
  // Shopee, só dentro do mesmo catálogo.
  const postedHistory = await fetchPostedHistory(db);
  const postedProductIds = [
    ...new Set([...postedHistory.map((r) => r.productId), ...excludeProductIds]),
  ];

  const { data: recentFarmacia } = await db
    .from("social_posts")
    .select("deal_candidates(score_breakdown)")
    .eq("post_type", "whatsapp")
    .order("posted_at", { ascending: false })
    .limit(FARMACIA_ROTATION_STREAK);
  const forceNonFarmacia =
    (recentFarmacia ?? []).length === FARMACIA_ROTATION_STREAK &&
    (recentFarmacia ?? []).every((r: any) => r.deal_candidates?.score_breakdown?.origem === FARMACIA_ORIGEM);

  // postedHistory já vem ordenado por posted_at desc (fetchPostedHistory) --
  // os N mais recentes são só um slice, sem query extra.
  const recentBuckets = postedHistory.slice(0, BUCKET_ROTATION_STREAK).map((r) => platformBucket(r.platform));
  const forceNonBucket =
    recentBuckets.length === BUCKET_ROTATION_STREAK && recentBuckets.every((b) => b === recentBuckets[0])
      ? recentBuckets[0]
      : null;

  // Regra principal de proporção (ver nota em MIN_SHOPEE_IN_LAST_5) --
  // maior prioridade que forceNonBucket: se a janela não bate o mínimo
  // de Shopee, força Shopee especificamente, não só "outro bucket".
  const last5Buckets = postedHistory.slice(0, SHOPEE_WINDOW).map((r) => platformBucket(r.platform));
  const nonShopeeInLast5 = last5Buckets.filter((b) => b !== "shopee").length;
  const forceShopee = last5Buckets.length === SHOPEE_WINDOW && nonShopeeInLast5 >= SHOPEE_WINDOW - MIN_SHOPEE_IN_LAST_5;

  const rows = (await fetchAvailableCandidateRows(db, postedProductIds)).filter(withinPriceCeiling);
  const groups = groupByCategoryAndBucket(rows);
  const lastPosted = lastPostedAtByCategoryBucket(postedHistory);

  // Par (categoria, bucket) mais desatualizado primeiro -- nunca postado
  // (ausente do mapa) vence qualquer par já postado alguma vez. Isso
  // reproduz organicamente a sequência que o Heber descreveu ("Shopee tv
  // / ML tv / Shopee geladeira / ML geladeira / Shopee tênis / ML tênis /
  // Awin tênis / ...") sem precisar de uma ordem fixa hardcoded.
  const marketplaceOrderIndex = (bucket: string) => {
    const idx = MARKETPLACE_ROTATION_ORDER.indexOf(bucket);
    return idx === -1 ? MARKETPLACE_ROTATION_ORDER.length : idx;
  };
  const pairs = [...groups.keys()].sort((a, b) => {
    const lastA = lastPosted.get(a) ?? -Infinity;
    const lastB = lastPosted.get(b) ?? -Infinity;
    if (lastA !== lastB) return lastA - lastB;
    // Empate (ambos nunca postados) -- agrupa pela mesma categoria e
    // desempata pela ordem Shopee -> Mercado Livre -> Awin, pra reproduzir
    // "Shopee tv, ML tv, Shopee geladeira, ML geladeira..." em vez de uma
    // ordem arbitrária vinda da ordenação global por score.
    const [catA, bucketA] = a.split("::");
    const [catB, bucketB] = b.split("::");
    if (catA !== catB) return catA.localeCompare(catB);
    return marketplaceOrderIndex(bucketA) - marketplaceOrderIndex(bucketB);
  });

  for (const key of pairs) {
    const bucket = key.split("::")[1];
    if (forceShopee && bucket !== "shopee") continue;
    if (!forceShopee && forceNonBucket && bucket === forceNonBucket) continue;
    const bucketHistory = postedHistory.filter((r) => platformBucket(r.platform) === bucket);
    for (const row of groups.get(key)!) {
      if (forceNonFarmacia && isFarmaciaRow(row)) continue;
      const candidate = candidateFromRow(row);
      if (!candidate) continue;
      if (isDuplicateOfPosted(candidate.productName, candidate.categorySlug, bucketHistory)) continue;
      return { candidate, demand: await computeDemandSignal(db, candidate.productId) };
    }
  }

  // Nenhum par (categoria, bucket) teve candidato elegível (catálogo
  // momentaneamente esgotado em todas as combinações) -- último recurso,
  // ranking por score/demanda sobre o pool inteiro, só pra garantir que a
  // execução não fica sem postar nada.
  //
  // Achado real (2026-09-26, ver nota em MIN_SHOPEE_IN_LAST_5): esse
  // fallback ERA a porta dos fundos que anulava forceNonBucket -- ele
  // reranqueava o pool INTEIRO por score, sem filtro nenhum, e Kabum
  // vencia de novo. Agora filtra pelo mesmo bucket exigido pelo loop
  // principal antes de reranquear; só usa o pool sem filtro se a
  // restrição deixar zero linhas (rede de segurança final, pra nunca
  // ficar sem postar nada).
  // Achado real no MESMO teste (dry-run confirmou "sem candidato" mesmo
  // com 391 Shopee elegíveis disponíveis): rerankWithDemand chama
  // isDuplicateOfPosted com o HISTÓRICO INTEIRO (todas as redes), não
  // escopado por bucket como o loop principal já faz (bucketHistory) --
  // mesma classe de bug documentada em 2026-09-24 ("nunca deveria
  // comparar Nike com Shopee"), só que no caminho do fallback. Com a
  // sequência real de hoje sendo 10+ produtos Kabum de eletrônicos
  // seguidos, os 20 melhores candidatos Shopee avaliados (CANDIDATE_EVAL_LIMIT)
  // colidiam por nome genérico de categoria contra esse histórico Kabum
  // e todos ficavam bloqueados. Escopa o histórico passado pro fallback
  // pelo mesmo bucket forçado, mesma lição do loop principal.
  const bucketOf = (row: any) => platformBucket(row.products?.platform ?? "shopee");
  let fallbackRows = rows;
  let fallbackHistory = postedHistory;
  if (forceShopee) {
    const filtered = rows.filter((r) => bucketOf(r) === "shopee");
    if (filtered.length > 0) fallbackRows = filtered;
    fallbackHistory = postedHistory.filter((r) => platformBucket(r.platform) === "shopee");
  } else if (forceNonBucket) {
    const filtered = rows.filter((r) => bucketOf(r) !== forceNonBucket);
    if (filtered.length > 0) fallbackRows = filtered;
    fallbackHistory = postedHistory.filter((r) => platformBucket(r.platform) !== forceNonBucket);
  }

  const ranked = await rerankWithDemand(db, fallbackRows, fallbackHistory);
  if (ranked.length > 0) return { candidate: ranked[0].candidate, demand: ranked[0].demand };
  return null;
}

// Substituído em 2026-09-22 pelo motor de copy baseado em evidência
// (src/lib/growth/offerCopy.ts) — debate real com o Heber: ele quer
// técnica de venda de verdade (curiosidade, "sair ganhando"), texto
// maior com narrativa, fechando com CTA forte, mas "nem eu quero
// enganar ninguem". O texto de abertura agora nasce de um reasonCode +
// evidência real (queda de preço medida nos nossos próprios snapshots,
// aceleração de venda real, ou menor preço já visto) em vez de "produto
// + preço -> gera algo persuasivo", que sempre saía genérico demais.

// Achado real (Heber, 2026-09-23, colou uma mensagem real do grupo): a
// IA convergia sempre pra "Galera, vocês não vão acreditar...", mesmo
// com evidência real diferente por trás cada vez. Além do prompt pedir
// variedade estrutural (ver offerCopy.ts), mostra pra IA as aberturas
// REAIS usadas nos últimos posts, pra ela evitar repetir o padrão.
const RECENT_OPENINGS_WINDOW = 6;

async function fetchRecentOpenings(db: ReturnType<typeof getDbFresh>): Promise<string[]> {
  const { data } = await db
    .from("social_posts")
    .select("caption")
    .eq("post_type", "whatsapp")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(RECENT_OPENINGS_WINDOW);
  return (data ?? [])
    .map((row: any) => String(row.caption ?? "").split("\n")[0]?.trim())
    .filter(Boolean);
}

function buildPriceLines(candidate: Candidate): { formatted: string; plain: string } {
  const por = candidate.priceMin.toFixed(2).replace(".", ",");
  let formatted = `Por apenas *R$ ${por}* 🔥`;
  let plain = `Por apenas R$ ${por}`;
  if (candidate.priceDiscountRate > 0) {
    const original = candidate.priceMin / (1 - candidate.priceDiscountRate / 100);
    if (original / candidate.priceMin < 2.5) {
      const de = original.toFixed(2).replace(".", ",");
      const off = Math.round(candidate.priceDiscountRate);
      formatted = `De ~R$ ${de}~ por *R$ ${por}* 🔥 (${off}% OFF)`;
      plain = `De R$ ${de} por R$ ${por} (${off}% OFF)`;
    }
  }
  return { formatted, plain };
}

// Card de prévia (send-link, ver GET abaixo) exige que o `message` termine
// com o mesmo `linkUrl` enviado -- por isso o link de convite do grupo
// (que também queremos manter) sobe pra antes do bloco final da oferta,
// que fecha a mensagem com o link do produto sozinho.
async function buildMessage(
  candidate: Candidate,
  demand: DemandSignal,
  inviteLink: string,
  recentOpenings: string[]
): Promise<{ message: string; linkDescription: string; trackedLink: string }> {
  const { formatted: priceLine, plain: priceLinePlain } = buildPriceLines(candidate);

  const platformLabel = getPlatformInfo(candidate.platform).ctaPreposition; // ex: "na Shopee", "no KaBuM!"
  const { text: narrative } = await generateEvidenceCopy(
    {
      productName: candidate.productName,
      priceMin: candidate.priceMin,
      priceDiscountRate: candidate.priceDiscountRate,
      platformLabel,
      demand,
    },
    recentOpenings
  );

  // REVERTIDO (2026-09-25) -- tinha passado pelo redirecionador /go pra
  // fechar o buraco de atribuição de clique social (o card de prévia em
  // si não quebrava, confirmado lendo zapi.ts). Mas Heber pediu pra
  // reverter mesmo assim, decisão de negócio dele: "melhor levar logo
  // para o produto do que ter que clicar para o site, isso pode perder
  // a venda por clique" -- prioriza conversão direta sobre o dado extra
  // de qual canal social gerou o clique. Mesma lógica já aplicada no
  // Instagram (ver publish-product/route.ts) -- link direto de novo.
  const trackedLink = candidate.offerLink;

  const message = [
    narrative,
    "",
    `*${candidate.productName}*`,
    priceLine,
    "",
    "📲 Bora convidar a galera? É só clicar:",
    inviteLink,
    "",
    `🛒 Oferta ${platformLabel} — clica aqui:`,
    trackedLink,
  ].join("\n");

  return { message, linkDescription: priceLinePlain, trackedLink };
}

// Pedido do Heber (2026-09-21): "mandava de 10 em 10 min das 8 até as 21
// horas" (horário de Brasília, a mesma automação antiga). Um cron
// literal por horário (79 entradas) estourava o limite de 100 crons por
// projeto da Vercel (já tínhamos 23) — em vez disso, o cron roda de 10
// em 10 minutos o dia INTEIRO (`*/10 * * * *`, 1 entrada só) e a rota
// decide aqui se está dentro da janela. Brasil (Bahia, sem horário de
// verão) = UTC-3 fixo, então 8h–21h BRT = 11h–23h59 UTC.
function isWithinSendingWindow(now = new Date()): boolean {
  const hourUtc = now.getUTCHours();
  return hourUtc >= 11 && hourUtc <= 23;
}

export async function GET(request: NextRequest) {
  // Fail-closed, mesmo padrão dos outros crons.
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("dryRun") !== "1" && !isWithinSendingWindow()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "fora do horário de envio (8h-21h Brasília)" });
  }

  const db = getDbFresh();

  // Achado real (Heber, 2026-09-24: "vai saber quando o produto não tá
  // mais disponivel?"): produto de Mercado Livre pode sair de estoque
  // ou ser removido entre o momento da descoberta (scraping de /ofertas
  // ou lote colado manualmente) e o momento de ser escolhido pra
  // postar — pode levar dias. Antes de mandar pro grupo, re-verifica ao
  // vivo (mesma raspagem usada na ingestão, scrapeFeaturedProduct) —
  // se não achar mais preço/produto válido na página, marca o
  // deal_candidate como indisponível (não aparece mais pra ninguém) e
  // tenta o próximo da fila, até 3 tentativas. Shopee não passa por
  // essa checagem — o link de afiliado é gerado na hora da descoberta e
  // o candidato já nasce com todos os cortes de qualidade aplicados no
  // mesmo dia, risco de defasagem bem menor.
  const MAX_AVAILABILITY_RETRIES = 3;
  const excludeProductIds: string[] = [];
  let candidate: Candidate | null = null;
  let demand: DemandSignal | null = null;
  for (let attempt = 0; attempt < MAX_AVAILABILITY_RETRIES; attempt++) {
    const picked = await pickNextCandidate(db, excludeProductIds);
    if (!picked) break;
    if (picked.candidate.platform !== "mercadolivre") {
      candidate = picked.candidate;
      demand = picked.demand;
      break;
    }
    const stillAvailable = await scrapeFeaturedProduct(picked.candidate.offerLink).then((r) => r !== null).catch(() => false);
    if (stillAvailable) {
      candidate = picked.candidate;
      demand = picked.demand;
      break;
    }
    console.warn(`[publish-whatsapp-group] produto ML indisponível, pulando: ${picked.candidate.productName} (${picked.candidate.offerLink})`);
    await db.from("deal_candidates").update({ status: "unavailable" }).eq("id", picked.candidate.dealCandidateId);
    excludeProductIds.push(picked.candidate.productId);
  }
  if (!candidate || !demand) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sem candidato novo (ou todos indisponíveis)" });
  }

  const zapi = createZApiConnector();

  // Link de convite buscado ao vivo (não hardcoded) — se o grupo for
  // resetado/recriado, o link muda e não pode ficar velho na mensagem.
  let inviteLink: string;
  try {
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN;
    const resp = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/group-invitation-link/${WHATSAPP_GROUP_ID}`,
      { headers: { "Client-Token": clientToken ?? "" } }
    );
    const json = await resp.json();
    if (!resp.ok || !json?.invitationLink) throw new Error(`sem invitationLink: ${JSON.stringify(json)}`);
    inviteLink = json.invitationLink;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `falha ao buscar link de convite: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const recentOpenings = await fetchRecentOpenings(db);
  const { message: caption, linkDescription, trackedLink } = await buildMessage(candidate, demand, inviteLink, recentOpenings);

  // Modo de pré-visualização — monta tudo (candidato real, link de
  // convite real) mas não manda a mensagem de verdade. Útil pra
  // conferir o texto antes de soltar pro grupo real (128 pessoas).
  if (request.nextUrl.searchParams.get("dryRun") === "1") {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      candidate: candidate.dealCandidateId,
      productName: candidate.productName,
      categorySlug: candidate.categorySlug,
      reasonCode: demand.reasonCode,
      demandEvidence: demand.evidence,
      imageUrl: candidate.imageUrl,
      linkDescription,
      caption,
    });
  }

  try {
    // Pedido do Heber (2026-09-24, 1a tentativa): tirar a imagem anexada
    // do grupo porque obrigava o pessoal a baixar pra ver. Troquei pra
    // sendText puro primeiro, mas a Z-API send-text NÃO gera prévia de
    // link nenhuma (confirmado: Heber mandou print do grupo real sem
    // nenhum card, só o link sublinhado cru) — o endpoint não tem
    // nenhum parâmetro de preview. A Z-API tem um endpoint dedicado pra
    // isso, send-link, que monta o card de prévia de verdade (imagem
    // pequena + título + descrição, com controle de tamanho via
    // linkType) sem anexar a foto como mídia — é o que realmente resolve
    // o pedido dele.
    await zapi.sendLink({
      chatId: WHATSAPP_GROUP_ID,
      message: caption,
      imageUrl: candidate.imageUrl,
      linkUrl: trackedLink,
      title: candidate.productName,
      linkDescription,
      // Heber (2026-09-24, depois de ver o card real no grupo): pediu
      // foto maior. "large" ainda é a prévia nativa do WhatsApp (thumbnail
      // buscado pelo próprio canal, sem anexar mídia) -- não é o mesmo
      // peso do sendImage antigo, só exibe o card maior no chat.
      linkSize: "large",
    });
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "whatsapp",
      image_url: candidate.imageUrl,
      caption,
      status: "posted",
      posted_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, candidate: candidate.dealCandidateId, productName: candidate.productName });
  } catch (err) {
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "whatsapp",
      image_url: candidate.imageUrl,
      caption,
      status: "failed",
      error: String(err instanceof Error ? err.message : err),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
