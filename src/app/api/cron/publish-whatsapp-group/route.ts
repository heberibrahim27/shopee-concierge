import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { createZApiConnector } from "../../../../lib/channel/zapi";
import { getPlatformInfo } from "../../../../lib/site/platforms";

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
  productName: string;
  platform: string;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number;
  offerLink: string;
};

async function pickNextCandidate(db: ReturnType<typeof getDbFresh>): Promise<Candidate | null> {
  const { data: alreadyPosted } = await db
    .from("social_posts")
    .select("deal_candidates(product_id)")
    .eq("post_type", "whatsapp");
  const postedProductIds = [
    ...new Set(
      (alreadyPosted ?? [])
        .map((r: any) => r.deal_candidates?.product_id)
        .filter(Boolean)
    ),
  ];

  let query = db
    .from("deal_candidates")
    .select(
      "id, score, product_id, products(product_name, platform), offer_snapshots(image_url, price_min, price_discount_rate, offer_link)"
    );
  if (postedProductIds.length > 0) {
    query = query.not("product_id", "in", `(${postedProductIds.join(",")})`);
  }
  const { data, error } = await query.order("score", { ascending: false, nullsFirst: false }).limit(50);

  if (error || !data) return null;

  for (const row of data as any[]) {
    const snap = row.offer_snapshots;
    if (!snap?.image_url || !snap?.offer_link || snap.price_min == null) continue;
    return {
      dealCandidateId: row.id,
      productName: row.products?.product_name ?? "Oferta imperdível",
      platform: row.products?.platform ?? "shopee",
      imageUrl: snap.image_url,
      priceMin: Number(snap.price_min),
      priceDiscountRate: Number(snap.price_discount_rate ?? 0),
      offerLink: snap.offer_link,
    };
  }
  return null;
}

// Abertura casual, variando por mensagem — pedido do Heber (2026-09-21):
// "poderia ter algum texto pra não parecer IA, parecer alguém
// realmente mandando". Mesmo padrão de rotação já usado no comentário
// de "siga a página" do Instagram (publish-product/route.ts).
const CASUAL_OPENERS = [
  "Genteee, olha o que achei agora 👀",
  "Passando rapidinho pra deixar essa aqui 🙌",
  "Separei esse achadinho especial pra vocês:",
  "Essa tá valendo muito a pena, corre 🏃",
  "Oi pessoal! Esse aqui é bom demais:",
];

function buildMessage(candidate: Candidate, inviteLink: string): string {
  const por = candidate.priceMin.toFixed(2).replace(".", ",");
  let priceLine = `Por apenas *R$ ${por}* 🔥`;
  if (candidate.priceDiscountRate > 0) {
    const original = candidate.priceMin / (1 - candidate.priceDiscountRate / 100);
    if (original / candidate.priceMin < 2.5) {
      const de = original.toFixed(2).replace(".", ",");
      priceLine = `De ~R$ ${de}~ por *R$ ${por}* 🔥 (${Math.round(candidate.priceDiscountRate)}% OFF)`;
    }
  }

  const opener = CASUAL_OPENERS[Math.floor(Math.random() * CASUAL_OPENERS.length)];
  const platformLabel = getPlatformInfo(candidate.platform).ctaPreposition; // ex: "na Shopee", "no KaBuM!"

  return [
    opener,
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
  const candidate = await pickNextCandidate(db);
  if (!candidate) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sem candidato novo" });
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

  const caption = buildMessage(candidate, inviteLink);

  // Modo de pré-visualização — monta tudo (candidato real, link de
  // convite real) mas não manda a mensagem de verdade. Útil pra
  // conferir o texto antes de soltar pro grupo real (128 pessoas).
  if (request.nextUrl.searchParams.get("dryRun") === "1") {
    return NextResponse.json({ ok: true, dryRun: true, candidate: candidate.dealCandidateId, productName: candidate.productName, imageUrl: candidate.imageUrl, caption });
  }

  try {
    await zapi.sendImage({ chatId: WHATSAPP_GROUP_ID, imageUrl: candidate.imageUrl, caption });
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
