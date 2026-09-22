import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../middleware";
import { scrapeFeaturedProduct } from "../../../../lib/mercadolivre/scrape";
import { persistMercadoLivreProduct } from "../../../../lib/mercadolivre/ingest";
import { createDealCandidate } from "../../../../lib/db/snapshots";
import { SITE_CATEGORIES } from "../../../../lib/site/categories";
import { guessCategorySlug } from "../../../../lib/site/categorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_HOST_SUFFIXES = [".mercadolivre.com.br", "meli.la"];

/**
 * Sem API real de preço (ver src/lib/mercadolivre/scrape.ts), não tem
 * como fazer descoberta automática de produto novo — o Heber cola os
 * links de afiliado (meli.la/...) que já tem, um lote de cada vez, e
 * essa rota faz o scraping + ingestão real de cada um. Mesmo score fixo
 * do Awin (Nike/Olympikus/Kabum) — outra loja parceira de volume menor,
 * sem boost especial.
 */
const MERCADOLIVRE_SCORE = 68.5;

export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const urls = Array.isArray(body?.urls) ? (body.urls as unknown[]).filter((u): u is string => typeof u === "string") : [];
  if (urls.length === 0) return NextResponse.json({ ok: false, error: "urls ausente ou vazia" }, { status: 400 });

  const publicados: string[] = [];
  const falhas: Array<{ url: string; erro: string }> = [];

  for (const url of urls) {
    try {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        falhas.push({ url, erro: "URL inválida" });
        continue;
      }
      if (!ALLOWED_HOST_SUFFIXES.some((suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(suffix))) {
        falhas.push({ url, erro: "domínio não permitido (só meli.la/mercadolivre.com.br)" });
        continue;
      }

      const scraped = await scrapeFeaturedProduct(url);
      if (!scraped) {
        falhas.push({ url, erro: "não deu pra extrair produto do HTML (layout mudou ou página não é de produto)" });
        continue;
      }

      const categorySlug = guessCategorySlug(scraped.title);
      const category = SITE_CATEGORIES.find((c) => c.slug === categorySlug)?.label ?? "Casa";
      const persisted = await persistMercadoLivreProduct({ affiliateUrl: url, scraped, category, categorySlug });
      await createDealCandidate({ productId: persisted.productId, offerSnapshotId: persisted.snapshotId, status: "discovered", score: MERCADOLIVRE_SCORE });
      publicados.push(scraped.title);
    } catch (err) {
      falhas.push({ url, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, publicados, falhas });
}
