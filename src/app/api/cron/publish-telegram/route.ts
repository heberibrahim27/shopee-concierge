import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { sendPhoto } from "../../../../lib/telegram/client";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kabum primeiro de propósito: é a categoria (hardware/notebook/periférico)
// que validamos como real formato funcionando no Telegram (ver memória
// project_telegram_channel_real_example — canal real "Bench Promos" na
// mesma categoria, dezenas de posts/dia, sem o teto que já bateu no
// Instagram). Shopee entra como fallback quando não sobrar Kabum elegível.
const PRIORITY_PLATFORMS = ["kabum", "shopee"];

type Candidate = {
  productId: string;
  productName: string;
  platform: string;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number;
  offerLink: string;
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function pickNextCandidate(db: ReturnType<typeof getDbFresh>): Promise<Candidate | null> {
  const { data: alreadyPosted } = await db.from("telegram_posts").select("product_id");
  const postedIds = [...new Set((alreadyPosted ?? []).map((r: any) => r.product_id).filter(Boolean))];

  for (const platform of PRIORITY_PLATFORMS) {
    // TS2589 (type instantiation excessively deep) se reatribuir `query`
    // condicionalmente antes do .order/.limit — construindo tudo numa
    // cadeia só evita o problema (mesmo builder do Supabase-js).
    const exclusion = postedIds.length > 0 ? `(${postedIds.join(",")})` : "(00000000-0000-0000-0000-000000000000)";
    const { data, error } = await db
      .from("site_catalog")
      .select("id, product_name, platform, image_url, price_min, price_discount_rate, offer_link")
      .eq("platform", platform)
      .not("price_min", "is", null)
      .not("image_url", "is", null)
      .not("offer_link", "is", null)
      .not("id", "in", exclusion)
      .order("price_discount_rate", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error || !data || data.length === 0) continue;

    const row = data[0] as any;
    return {
      productId: row.id,
      productName: row.product_name,
      platform: row.platform,
      imageUrl: row.image_url,
      priceMin: Number(row.price_min),
      priceDiscountRate: Number(row.price_discount_rate ?? 0),
      offerLink: row.offer_link,
    };
  }
  return null;
}

function buildCaption(c: Candidate): string {
  // Formato validado no canal real que pesquisamos (Bench Promos): título
  // curto + preço em destaque, sem inventar specs/cupom que não temos por
  // produto — só o que é dado real (ver project_telegram_channel_real_example).
  const price = c.priceMin.toFixed(2).replace(".", ",");
  const lines = [`🔥 ${escapeHtml(c.productName)} - R$ ${price} 🔥`];
  if (c.priceDiscountRate > 0) {
    lines.push(`\n💥 ${Math.round(c.priceDiscountRate)}% OFF`);
  }
  // Link direto de afiliado, não o /go -- o /go tem risco real de preview
  // de link não testado nesse tipo de app (mesma cautela já aplicada ao
  // WhatsApp, ver project_click_tracking_redirect na memória: "WhatsApp
  // deliberadamente não usa /go, risco de preview-card, precisa testar
  // antes"). Mesma regra vale aqui até testar de verdade no Telegram.
  lines.push(`\n🔗 <a href="${escapeHtml(c.offerLink)}">Ver oferta</a>`);
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  // Fail-closed, mesmo padrão dos outros crons (ver SEC-025-CRON-PRODUCTION-AUTH
  // no CONTINUIDADE.md): CRON_SECRET ausente sempre rejeita.
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDbFresh();
  const candidate = await pickNextCandidate(db);
  if (!candidate) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sem candidato novo" });
  }

  try {
    const { messageId } = await sendPhoto(buildCaption(candidate), candidate.imageUrl);
    await db.from("telegram_posts").insert({
      product_id: candidate.productId,
      message_id: messageId,
      status: "posted",
    });
    return NextResponse.json({ ok: true, productId: candidate.productId, messageId });
  } catch (err: any) {
    await db.from("telegram_posts").insert({
      product_id: candidate.productId,
      status: "failed",
      error: String(err?.message ?? err),
    });
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
