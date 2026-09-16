import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../lib/db/client";

/**
 * Redirecionamento "âncora fixa" pro produto mais recente publicado no
 * Instagram/Pinterest — é pra onde o QR code e o bio-link sempre apontam.
 * O destino muda sozinho a cada novo post (via /api/cron/publish-product),
 * sem precisar trocar o link em lugar nenhum.
 */
export async function GET(request: NextRequest) {
  const db = getDbFresh();

  const { data: post } = await db
    .from("social_posts")
    .select(
      "id, deal_candidate_id, deal_candidates(offer_snapshot_id, product_id, offer_snapshots(offer_link, product_link), products(product_name))"
    )
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // @ts-expect-error -- shape vem do join acima, tipagem do supabase-js não infere aninhado
  const offerLink: string | undefined = post?.deal_candidates?.offer_snapshots?.offer_link;
  // @ts-expect-error -- idem
  const productName: string | undefined = post?.deal_candidates?.products?.product_name;

  if (!offerLink) {
    return NextResponse.redirect(new URL("/", request.url), { status: 307 });
  }

  await db.from("click_events").insert({
    platform: "shopee",
    product_name: productName?.slice(0, 300) ?? null,
    source: "instagram_hoje",
  });

  return NextResponse.redirect(offerLink, { status: 307 });
}
