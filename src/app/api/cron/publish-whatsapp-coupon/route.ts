import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { createZApiConnector } from "../../../../lib/channel/zapi";
import { getPlatformInfo, getAdvertiserLogo } from "../../../../lib/site/platforms";
import { parseCouponRule, describeRule } from "../../../../lib/site/couponRules";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Publica um cupom real por execução no MESMO grupo do WhatsApp usado por
 * publish-whatsapp-group/route.ts (produtos) — pedido do Heber
 * (2026-09-25): "envio de cupons no grupo, podemos??".
 *
 * Cadência bem mais baixa que o cron de produto (10 em 10 min) de
 * propósito: cupom muda pouco no dia a dia (mesmos ~40 ativos por
 * semanas) — postar toda hora repetiria a MESMA lição de hoje mais cedo
 * (grupo virou spam de uma única origem, ver GROUP_PRICE_CEILING e
 * BUCKET_ROTATION_STREAK no cron irmão). Reaproveita: mesmo grupo
 * (WHATSAPP_GROUP_ID), mesmo conector Z-API (sendLink, card de prévia),
 * mesma tabela de dedupe (social_posts — post_type='whatsapp-coupon' fica
 * num universo separado de post_type='whatsapp', nunca se cruzam).
 *
 * Só cupom com código real (da coluna ou extraído do texto, mesma lógica
 * de coupons.ts) e SEM restrição de elegibilidade — "pode valer, mas a
 * loja decide no carrinho" precisa da nuance do card do site; numa
 * mensagem direta do grupo isso vira promessa que a gente não sustenta.
 */

const WHATSAPP_GROUP_ID = process.env.ZAPI_DESCONTOS_GROUP_ID || "120363368934404281-group";

type EligibleCoupon = {
  id: string;
  advertiserName: string;
  /** Rótulo de exibição -- "KaBuM!" em vez do "Kabum BR" cru do feed Awin quando a plataforma tem info mapeada (platforms.ts); senão cai no advertiserName mesmo. */
  displayName: string;
  platform: string | null;
  title: string;
  description: string | null;
  code: string;
  urlTracking: string;
  ruleLine: string | null;
};

async function fetchEligibleCoupons(db: ReturnType<typeof getDbFresh>): Promise<EligibleCoupon[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("coupons")
    .select("id, advertiser_name, platform, title, description, code, url_tracking, ends_at")
    .eq("status", "active")
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`);
  if (error) throw new Error(`Falha ao buscar cupons: ${error.message}`);

  const eligible: EligibleCoupon[] = [];
  for (const row of (data ?? []) as any[]) {
    const rule = parseCouponRule({ title: row.title, description: row.description, code: row.code });
    if (rule.eligibilityRestricted) continue;
    const code = row.code ?? rule.codeFromText;
    if (!code) continue;
    const advertiserName = String(row.advertiser_name);
    const platform = (row.platform as string | null) ?? null;
    const displayName = platform && platform !== "lomadee" ? getPlatformInfo(platform).label : advertiserName;
    eligible.push({
      id: String(row.id),
      advertiserName,
      displayName,
      platform,
      title: String(row.title),
      description: (row.description as string | null) ?? null,
      code,
      urlTracking: String(row.url_tracking),
      ruleLine: describeRule(rule),
    });
  }
  return eligible;
}

async function fetchPostedCouponHistory(
  db: ReturnType<typeof getDbFresh>
): Promise<{ couponId: string; advertiserName: string; postedAt: string }[]> {
  const { data, error } = await db
    .from("social_posts")
    .select("posted_at, coupons(id, advertiser_name)")
    .eq("post_type", "whatsapp-coupon")
    .eq("status", "posted")
    .order("posted_at", { ascending: false });
  if (error) throw new Error(`Falha ao buscar histórico de cupons postados: ${error.message}`);
  return (data ?? [])
    .map((row: any) => {
      const coupon = row.coupons;
      if (!coupon?.id) return null;
      return { couponId: String(coupon.id), advertiserName: String(coupon.advertiser_name), postedAt: row.posted_at };
    })
    .filter((r): r is { couponId: string; advertiserName: string; postedAt: string } => r !== null);
}

/** Par (loja, cupom nunca postado) primeiro; entre lojas, a que ficou mais tempo sem aparecer vence — mesma ideia de "par mais desatualizado" do cron de produto, sem competir com ele (universo de dedupe separado). */
function pickNextCoupon(
  eligible: EligibleCoupon[],
  history: { couponId: string; advertiserName: string; postedAt: string }[]
): EligibleCoupon | null {
  const postedCouponIds = new Set(history.map((h) => h.couponId));
  const lastPostedByAdvertiser = new Map<string, number>();
  for (const h of history) {
    const ts = new Date(h.postedAt).getTime();
    const existing = lastPostedByAdvertiser.get(h.advertiserName);
    if (existing === undefined || ts > existing) lastPostedByAdvertiser.set(h.advertiserName, ts);
  }

  const candidates = eligible.filter((c) => !postedCouponIds.has(c.id));
  const pool = candidates.length > 0 ? candidates : eligible; // catálogo esgotado -- último recurso, repete o mais antigo
  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    const lastA = lastPostedByAdvertiser.get(a.advertiserName) ?? -Infinity;
    const lastB = lastPostedByAdvertiser.get(b.advertiserName) ?? -Infinity;
    return lastA - lastB;
  })[0];
}

function buildImageUrl(coupon: EligibleCoupon): string {
  const baseUrl = (process.env.SITE_BASE_URL || "https://descontochegando.com.br").replace(/\/$/, "");
  const info = coupon.platform && coupon.platform !== "lomadee" ? getPlatformInfo(coupon.platform) : null;
  const logoPath = info?.logoUrl ?? getAdvertiserLogo(coupon.advertiserName)?.logoUrl ?? "/LOGO.png";
  return `${baseUrl}${logoPath}`;
}

function buildMessage(coupon: EligibleCoupon, inviteLink: string): { message: string; linkDescription: string } {
  // Nomes como "KaBuM!" já terminam em exclamação -- evita "KaBuM!!".
  const storeExclaim = coupon.displayName.endsWith("!") ? coupon.displayName : `${coupon.displayName}!`;
  const lines = [
    `🎟️ Cupom real na ${storeExclaim}`,
    "",
    coupon.ruleLine ? `*${coupon.ruleLine}*` : `*${coupon.title}*`,
    `Código: *${coupon.code}*`,
    "",
    "📲 Bora convidar a galera? É só clicar:",
    inviteLink,
    "",
    `🛒 Usar o cupom na ${coupon.displayName} — clica aqui:`,
    coupon.urlTracking,
  ];
  return { message: lines.join("\n"), linkDescription: coupon.ruleLine ?? coupon.title };
}

function isWithinSendingWindow(now = new Date()): boolean {
  const hourUtc = now.getUTCHours();
  return hourUtc >= 11 && hourUtc <= 23;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  if (!dryRun && !isWithinSendingWindow()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "fora do horário de envio (8h-21h Brasília)" });
  }

  const db = getDbFresh();
  const [eligible, history] = await Promise.all([fetchEligibleCoupons(db), fetchPostedCouponHistory(db)]);
  const coupon = pickNextCoupon(eligible, history);
  if (!coupon) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sem cupom elegível (código real, sem restrição de elegibilidade)" });
  }

  const zapi = createZApiConnector();

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

  const { message: caption, linkDescription } = buildMessage(coupon, inviteLink);
  const imageUrl = buildImageUrl(coupon);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      couponId: coupon.id,
      advertiserName: coupon.advertiserName,
      code: coupon.code,
      imageUrl,
      caption,
    });
  }

  try {
    await zapi.sendLink({
      chatId: WHATSAPP_GROUP_ID,
      message: caption,
      imageUrl,
      linkUrl: coupon.urlTracking,
      title: `Cupom ${coupon.displayName}`,
      linkDescription,
      linkSize: "large",
    });
    // Achado real (2026-09-26, Heber: "o cupom que está mandando no
    // grupo só tem esse de ônibus"): esse insert falhava em silêncio há
    // dias (constraint do banco desatualizada, ver migration
    // 20260926171500) porque o resultado nunca era checado -- a
    // mensagem saía certa no grupo, mas o dedupe nunca era gravado, e o
    // mesmo cupom (primeiro elegível da lista) ganhava a rotação pra
    // sempre. Loga o erro agora em vez de engolir silenciosamente --
    // nunca deve travar a resposta (a mensagem já foi enviada de
    // verdade nesse ponto).
    const { error: insertError } = await db.from("social_posts").insert({
      coupon_id: coupon.id,
      post_type: "whatsapp-coupon",
      image_url: imageUrl,
      caption,
      status: "posted",
      posted_at: new Date().toISOString(),
    });
    if (insertError) console.error("[publish-whatsapp-coupon] falha ao gravar dedupe (mensagem já foi enviada):", insertError.message);
    return NextResponse.json({ ok: true, couponId: coupon.id, advertiserName: coupon.advertiserName });
  } catch (err) {
    const { error: insertError } = await db.from("social_posts").insert({
      coupon_id: coupon.id,
      post_type: "whatsapp-coupon",
      image_url: imageUrl,
      caption,
      status: "failed",
      error: String(err instanceof Error ? err.message : err),
    });
    if (insertError) console.error("[publish-whatsapp-coupon] falha ao gravar status de erro:", insertError.message);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
