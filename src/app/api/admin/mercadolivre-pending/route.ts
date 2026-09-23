import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../middleware";
import { getDbFresh } from "../../../../lib/db/client";
import { scrapeFeaturedProduct } from "../../../../lib/mercadolivre/scrape";
import { persistMercadoLivreProduct } from "../../../../lib/mercadolivre/ingest";
import { createDealCandidate } from "../../../../lib/db/snapshots";
import { SITE_CATEGORIES } from "../../../../lib/site/categories";
import { guessCategorySlug } from "../../../../lib/site/categorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MERCADOLIVRE_SCORE = 68.5;

/** Lista as pendências da varredura semanal (ver cron/mercadolivre-discovery) pro Heber ver no /admin o que falta gerar link. */
export async function GET(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getDbFresh();
  const { data, error } = await db
    .from("mercadolivre_pending_picks")
    .select("id, title, product_url, current_price, category_slug, value_score, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pending: data ?? [] });
}

/**
 * Recebe de volta os links `meli.la` que o Heber gerou em lote (mesma
 * ordem das URLs que ele colou no gerador da própria Mercado Livre —
 * `body.links[i]` corresponde ao pending pick de `body.pickIds[i]`,
 * pareamento por posição porque o gerador da ML não devolve nenhum ID
 * pra casar de volta). Ingera cada um pelo mesmo pipeline manual já
 * comprovado (scrapeFeaturedProduct + persistMercadoLivreProduct +
 * createDealCandidate).
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const pickIds = Array.isArray(body?.pickIds) ? (body.pickIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const links = Array.isArray(body?.links) ? (body.links as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (pickIds.length === 0 || pickIds.length !== links.length) {
    return NextResponse.json({ ok: false, error: "pickIds e links ausentes ou de tamanhos diferentes" }, { status: 400 });
  }

  const db = getDbFresh();
  const ingeridos: string[] = [];
  const falhas: Array<{ pickId: string; erro: string }> = [];

  for (let i = 0; i < pickIds.length; i++) {
    const pickId = pickIds[i];
    const meliLaLink = links[i].trim();
    try {
      let parsed: URL;
      try {
        parsed = new URL(meliLaLink);
      } catch {
        falhas.push({ pickId, erro: "URL inválida" });
        continue;
      }
      if (!(parsed.hostname === "meli.la" || parsed.hostname.endsWith(".mercadolivre.com.br"))) {
        falhas.push({ pickId, erro: "domínio não permitido (só meli.la/mercadolivre.com.br)" });
        continue;
      }

      const scraped = await scrapeFeaturedProduct(meliLaLink);
      if (!scraped) {
        falhas.push({ pickId, erro: "não deu pra extrair produto do link" });
        continue;
      }

      const categorySlug = guessCategorySlug(scraped.title);
      const category = SITE_CATEGORIES.find((c) => c.slug === categorySlug)?.label ?? "Casa";
      const persisted = await persistMercadoLivreProduct({ affiliateUrl: meliLaLink, scraped, category, categorySlug });
      await createDealCandidate({ productId: persisted.productId, offerSnapshotId: persisted.snapshotId, status: "discovered", score: MERCADOLIVRE_SCORE });

      await db
        .from("mercadolivre_pending_picks")
        .update({ status: "ingested", meli_la_link: meliLaLink, linked_at: new Date().toISOString() })
        .eq("id", pickId);

      ingeridos.push(scraped.title);
    } catch (err) {
      falhas.push({ pickId, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, ingeridos, falhas });
}
