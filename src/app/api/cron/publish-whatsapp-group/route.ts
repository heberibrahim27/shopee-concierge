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

// Quantos posts seguidos de Shopee (sem intercalar outra loja) disparam
// a reserva de vaga — achado real (2026-09-22, pergunta do Heber): o
// score da Shopee (média 92, até 999 pra Farmácia Uruguai) sempre
// vence o teto do Nike/Olympikus/Kabum (85), então sem essa reserva
// eles nunca apareciam de verdade no grupo, mesmo sem filtro nenhum
// de plataforma na query.
const NON_SHOPEE_ROTATION_STREAK = 4;

// Heber (2026-09-22, urgente): "só mandou quase o dia todo produtos de
// farmácia uruguai, eu pedi pra divulgar não pra só divulgar ele" — o
// boost proposital da Farmácia Uruguai (score fixo 95, alguns até
// 998/999) vence QUALQUER produto comum da Shopee (~85-90) também,
// não só o Awin. Resultado real medido num dia: 37 de 52 posts (71%)
// eram Farmácia Uruguai. A rotação do Awin acima não resolve isso —
// ela só intercala Shopee-vs-outra-loja, e a Farmácia Uruguai é
// contada como Shopee. Precisa da própria trava, mais curta (a
// preferência continua real, só não pode virar exclusividade).
const FARMACIA_ORIGEM = "loja-propria-farmacia-uruguai";
const FARMACIA_ROTATION_STREAK = 2;

function isFarmaciaRow(row: any): boolean {
  return row.score_breakdown?.origem === FARMACIA_ORIGEM;
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

async function rankedCandidateRows(db: ReturnType<typeof getDbFresh>, postedProductIds: string[], excludeShopee = false): Promise<any[]> {
  // `!inner` é obrigatório aqui — sem ele, filtrar em `products.platform`
  // não restringe as LINHAS de deal_candidates, só zera o objeto
  // aninhado quando não bate (achado real testando: sem `!inner`, a
  // reserva de vaga nunca encontrava nada porque o top 50 por score já
  // vinha 100% Shopee ANTES do filtro cliente-side rodar em cima).
  let query = db
    .from("deal_candidates")
    .select(
      excludeShopee
        ? "id, score, score_breakdown, product_id, products!inner(product_name, platform, category_slug), offer_snapshots(image_url, price_min, price_discount_rate, offer_link)"
        : "id, score, score_breakdown, product_id, products(product_name, platform, category_slug), offer_snapshots(image_url, price_min, price_discount_rate, offer_link)"
    )
    // Nunca reconsidera um candidato marcado "unavailable" (re-checagem
    // de disponibilidade real, ver GET abaixo) — sem isso o candidato
    // indisponível voltaria a competir de novo a cada execução do cron.
    .neq("status", "unavailable");
  if (postedProductIds.length > 0) {
    query = query.not("product_id", "in", `(${postedProductIds.join(",")})`);
  }
  if (excludeShopee) {
    query = query.neq("products.platform", "shopee");
  }
  const { data, error } = await query.order("score", { ascending: false, nullsFirst: false }).limit(50);
  return error || !data ? [] : (data as any[]);
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
  // seu próprio product_id. `postedHistory` (nome + categoria de tudo já
  // postado, sem janela de tempo -- exclusão permanente, pedido dele: "já
  // mandou uma vez aguarda... não tem pq tá repetindo") alimenta
  // isDuplicateOfPosted em todo ponto de decisão abaixo.
  const { data: alreadyPosted } = await db
    .from("social_posts")
    .select("deal_candidates(product_id, products(product_name, category_slug))")
    .eq("post_type", "whatsapp")
    .eq("status", "posted");
  const postedProductIds = [
    ...new Set([
      ...(alreadyPosted ?? [])
        .map((r: any) => r.deal_candidates?.product_id)
        .filter(Boolean),
      ...excludeProductIds,
    ]),
  ];
  const postedHistory: PostedProductRecord[] = (alreadyPosted ?? [])
    .map((r: any) => r.deal_candidates?.products)
    .filter(Boolean)
    .map((p: any) => ({ productName: p.product_name, categorySlug: p.category_slug ?? null }));

  const streakWindow = Math.max(NON_SHOPEE_ROTATION_STREAK, FARMACIA_ROTATION_STREAK);
  const { data: recent } = await db
    .from("social_posts")
    .select("deal_candidates(products(platform), score_breakdown)")
    .eq("post_type", "whatsapp")
    .order("posted_at", { ascending: false })
    .limit(streakWindow);
  const recentRows = (recent ?? []).map((r: any) => r.deal_candidates);
  const lastNShopee = recentRows.slice(0, NON_SHOPEE_ROTATION_STREAK);
  const forceNonShopee = lastNShopee.length === NON_SHOPEE_ROTATION_STREAK && lastNShopee.every((r) => r?.products?.platform === "shopee");
  const lastNFarmacia = recentRows.slice(0, FARMACIA_ROTATION_STREAK);
  const forceNonFarmacia = lastNFarmacia.length === FARMACIA_ROTATION_STREAK && lastNFarmacia.every((r) => r?.score_breakdown?.origem === FARMACIA_ORIGEM);

  if (forceNonShopee) {
    const reservedRows = await rankedCandidateRows(db, postedProductIds, true);
    for (const row of reservedRows) {
      const candidate = candidateFromRow(row);
      if (!candidate) continue;
      if (isDuplicateOfPosted(candidate.productName, candidate.categorySlug, postedHistory)) continue;
      return { candidate, demand: await computeDemandSignal(db, candidate.productId) };
    }
    // Reserva não achou nada elegível fora da Shopee (pool vazio/sem
    // candidato válido) — cai pro ranking normal em vez de travar o
    // post daquela execução.
  }

  const rows = await rankedCandidateRows(db, postedProductIds);

  if (forceNonFarmacia) {
    const nonFarmaciaRows = rows.filter((row) => !isFarmaciaRow(row));
    const ranked = await rerankWithDemand(db, nonFarmaciaRows, postedHistory);
    if (ranked.length > 0) return { candidate: ranked[0].candidate, demand: ranked[0].demand };
    // Sem candidato elegível fora da Farmácia Uruguai (pool comum
    // esgotado no momento) — cai pro ranking normal abaixo.
  }

  const ranked = await rerankWithDemand(db, rows, postedHistory);
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

async function buildMessage(candidate: Candidate, demand: DemandSignal, inviteLink: string, recentOpenings: string[]): Promise<string> {
  const por = candidate.priceMin.toFixed(2).replace(".", ",");
  let priceLine = `Por apenas *R$ ${por}* 🔥`;
  if (candidate.priceDiscountRate > 0) {
    const original = candidate.priceMin / (1 - candidate.priceDiscountRate / 100);
    if (original / candidate.priceMin < 2.5) {
      const de = original.toFixed(2).replace(".", ",");
      priceLine = `De ~R$ ${de}~ por *R$ ${por}* 🔥 (${Math.round(candidate.priceDiscountRate)}% OFF)`;
    }
  }

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

  return [
    narrative,
    "",
    `*${candidate.productName}*`,
    priceLine,
    "",
    `🛒 Oferta ${platformLabel} — clica aqui:`,
    candidate.offerLink,
    "",
    "📲 Bora convidar a galera? É só clicar:",
    inviteLink,
  ].join("\n");
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
  const caption = await buildMessage(candidate, demand, inviteLink, recentOpenings);

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
      caption,
    });
  }

  try {
    // Pedido do Heber (2026-09-24): "as imagens do grupo pra o usuário
    // ver tem que baixar, quero a prévia do link mesmo pra não pesar o
    // celular do pessoal" — trocado de sendImage (mídia anexada, que o
    // WhatsApp obriga o destinatário a baixar pra ver em qualidade real)
    // pra sendText simples: o link do produto já vem primeiro no corpo
    // da mensagem (buildMessage), então o próprio WhatsApp gera o card
    // de prévia (thumbnail leve buscado pelo cliente) a partir da URL,
    // sem precisar enviar a foto como anexo.
    await zapi.sendText({ chatId: WHATSAPP_GROUP_ID, text: caption });
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
