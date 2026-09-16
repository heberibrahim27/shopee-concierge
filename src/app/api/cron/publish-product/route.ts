import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SITE_URL = "https://descontochegando.com.br";
const WINDSOR_ENDPOINT = "https://connectors.windsor.ai/instagram/actions";
// Conta @descontoschegando — ver reference_shopee_concierge_infra na memória do projeto.
const IG_ACCOUNT_ID = process.env.WINDSOR_INSTAGRAM_ACCOUNT_ID || "17841471469860803";

type Candidate = {
  dealCandidateId: string;
  productName: string;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number;
  offerLink: string;
};

async function pickNextCandidate(db: ReturnType<typeof getDbFresh>): Promise<Candidate | null> {
  const { data, error } = await db
    .from("deal_candidates")
    .select(
      "id, score, products(product_name), offer_snapshots(image_url, price_min, price_discount_rate, offer_link)"
    )
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error || !data) return null;

  const { data: alreadyPosted } = await db.from("social_posts").select("deal_candidate_id");
  const postedIds = new Set((alreadyPosted ?? []).map((r) => r.deal_candidate_id));

  for (const row of data as any[]) {
    if (postedIds.has(row.id)) continue;
    const snap = row.offer_snapshots;
    if (!snap?.image_url || !snap?.offer_link || snap.price_min == null) continue;
    return {
      dealCandidateId: row.id,
      productName: row.products?.product_name ?? "Oferta imperdível",
      imageUrl: snap.image_url,
      priceMin: Number(snap.price_min),
      priceDiscountRate: Number(snap.price_discount_rate ?? 0),
      offerLink: snap.offer_link,
    };
  }
  return null;
}

function buildTemplateUrl(c: Candidate, variant: "feed" | "story"): string {
  const por = c.priceMin.toFixed(2).replace(".", ",");
  const params = new URLSearchParams({
    img: c.imageUrl,
    title: c.productName,
    por,
    variant,
  });
  // Regra conservadora de/por: só mostra "de" se a razão implícita for < 2.5x.
  if (c.priceDiscountRate > 0) {
    const original = c.priceMin / (1 - c.priceDiscountRate / 100);
    if (original / c.priceMin < 2.5) {
      params.set("de", original.toFixed(2).replace(".", ","));
    }
  }
  return `${SITE_URL}/api/story-template?${params.toString()}`;
}

async function windsorAction(action: string, params: Record<string, unknown>) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "WINDSOR_API_KEY não configurada — peça pro Heber pegar a chave no painel do Windsor.ai e adicionar como variável de ambiente."
    );
  }
  const resp = await fetch(`${WINDSOR_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: IG_ACCOUNT_ID, action, params }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(`Windsor ${action} falhou (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDbFresh();
  const candidate = await pickNextCandidate(db);
  if (!candidate) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sem candidato novo" });
  }

  const feedImageUrl = buildTemplateUrl(candidate, "feed");
  const storyImageUrl = buildTemplateUrl(candidate, "story");
  const caption = `${candidate.productName}\n\n#promocao #achadinhos #shopee #achadosdashopee`;

  const results: Record<string, unknown> = { candidate: candidate.dealCandidateId };

  // 1) Post no feed (pra poder comentar o link embaixo)
  let feedMediaId: string | null = null;
  try {
    const feedResp: any = await windsorAction("create_image_post", { image_url: feedImageUrl, caption });
    feedMediaId = feedResp?.id ?? feedResp?.media_id ?? null;
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "feed",
      image_url: feedImageUrl,
      caption,
      status: "posted",
      media_id: feedMediaId,
      posted_at: new Date().toISOString(),
    });
    results.feed = { ok: true, mediaId: feedMediaId };
  } catch (err: any) {
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "feed",
      image_url: feedImageUrl,
      caption,
      status: "failed",
      error: String(err?.message ?? err),
    });
    results.feed = { ok: false, error: String(err?.message ?? err) };
  }

  // 2) Comenta o link de afiliado no post recém-criado (técnica "link no primeiro comentário")
  if (feedMediaId) {
    try {
      await windsorAction("create_comment", {
        media_id: feedMediaId,
        message: `Link: ${candidate.offerLink}`,
      });
      await db
        .from("social_posts")
        .update({ comment_posted: true })
        .eq("deal_candidate_id", candidate.dealCandidateId)
        .eq("post_type", "feed");
      results.comment = { ok: true };
    } catch (err: any) {
      results.comment = { ok: false, error: String(err?.message ?? err) };
    }
  }

  // 3) Story (sem legenda — o QR code + "comente EU QUERO" já vêm na própria imagem)
  try {
    const storyResp: any = await windsorAction("create_story", { image_url: storyImageUrl });
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "story",
      image_url: storyImageUrl,
      status: "posted",
      media_id: storyResp?.id ?? storyResp?.media_id ?? null,
      posted_at: new Date().toISOString(),
    });
    results.story = { ok: true };
  } catch (err: any) {
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "story",
      image_url: storyImageUrl,
      status: "failed",
      error: String(err?.message ?? err),
    });
    results.story = { ok: false, error: String(err?.message ?? err) };
  }

  return NextResponse.json({ ok: true, ...results });
}
