import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { searchProductsByKeyword, generateAffiliateShortLink } from "../../../../lib/shopee/queries";
import { ShopeeSortType, type ShopeeProductOffer } from "../../../../lib/shopee/types";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../../../../lib/db/snapshots";
import { scoreOffer, DEFAULT_HARD_CUTS } from "../../../../lib/growth/dealScoring";
import { buildProductSlug } from "../../../../lib/site/slug";
import { notifyCatalogUpdate } from "../../../../lib/site/notifyRevalidate";
import { isDuplicateOfPosted, type PostedProductRecord } from "../../../../lib/growth/productDedupe";
import { KEYWORD_POOL } from "../../../../lib/growth/keywordPool";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Abastecimento dedicado do grupo do WhatsApp (achado 2026-10-08, Heber:
 * "o grupo não mandou mais mensagens desde 8:30, apenas cupons").
 *
 * Diagnóstico medido: o grupo consome até ~78 posts/dia, mas `source-deals`
 * só cria ~30 candidatos/dia e SEMPRE olha a página 1 das mesmas 10
 * keywords (top 10 mais vendidos) -- depois de uma rotação do pool, os
 * resultados repetem e nenhum produto novo entra. Resultado real: dos 227
 * candidatos Shopee ainda não postados, 187 eram o mesmo produto de outro
 * vendedor (dedupe por nome, que o Heber exige), 40 passavam de R$150 e
 * 0 eram postáveis.
 *
 * Aqui: mesmas keywords, mas varrendo PÁGINAS MAIS FUNDAS a cada ciclo
 * completo do pool (1-3, depois 4-6, 7-9, 10-12), só produto barato (teto
 * do grupo), já com nota/vendas reais, que ainda não exista no catálogo e
 * que não seja clone por nome de algo já postado no grupo. Cria o
 * deal_candidate + link de afiliado + publica no site, igual source-deals.
 * Roda 2x/dia (`?slot=0|1`) com janelas de keyword diferentes.
 */

const KEYWORDS_PER_RUN = 12;
const PAGES_PER_WINDOW = 3;
const PAGE_WINDOWS = 4; // páginas 1-3, 4-6, 7-9, 10-12 -- depois volta pra 1
const PAGE_LIMIT = 20;
const PRICE_CEILING = 150; // mesmo teto do grupo (GROUP_PRICE_CEILING em publish-whatsapp-group)
const MIN_RATING = 4.5;
const MIN_SALES = 50;
const MAX_NEW_PER_RUN = 120;
const CONCURRENCY = 6;

function dayOfYear(): number {
  return Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const slot = Number(request.nextUrl.searchParams.get("slot") ?? "0") === 1 ? 1 : 0;
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  // Janela de keywords avança a cada execução; a janela de PÁGINAS só
  // avança quando o pool de keywords completa um ciclo (senão repetiria
  // exatamente os mesmos resultados da rodada anterior).
  const runIndex = dayOfYear() * 2 + slot;
  const startKeyword = (runIndex * KEYWORDS_PER_RUN) % KEYWORD_POOL.length;
  const cycleIndex = Math.floor((runIndex * KEYWORDS_PER_RUN) / KEYWORD_POOL.length);
  const firstPage = 1 + PAGES_PER_WINDOW * (cycleIndex % PAGE_WINDOWS);
  const keywords = Array.from({ length: KEYWORDS_PER_RUN }, (_, i) => KEYWORD_POOL[(startKeyword + i) % KEYWORD_POOL.length]);

  const seen = new Set<string>();
  const found: ShopeeProductOffer[] = [];
  for (const keyword of keywords) {
    for (let page = firstPage; page < firstPage + PAGES_PER_WINDOW; page++) {
      try {
        const offers = await searchProductsByKeyword({ keyword, page, limit: PAGE_LIMIT, sortType: ShopeeSortType.ITEM_SOLD_DESC });
        if (offers.length === 0) break;
        for (const o of offers) {
          const itemId = String(o.itemId);
          if (seen.has(itemId)) continue;
          seen.add(itemId);
          found.push({ ...o, itemId, shopId: String(o.shopId) });
        }
        if (offers.length < PAGE_LIMIT) break;
      } catch (err) {
        console.error(`[cron/source-group-fill] falha "${keyword}" p${page}:`, err);
        break;
      }
    }
  }

  // Só barato + qualidade real comprovada (nota/vendas) -- é o perfil do grupo.
  const qualified = found.filter((o) => {
    const price = Number(o.priceMin ?? 0);
    return price > 0 && price <= PRICE_CEILING && Number(o.ratingStar ?? 0) >= MIN_RATING && (o.sales ?? 0) >= MIN_SALES;
  });

  // Já no catálogo? (dedupe por shopee_item_id -- não recria candidato de produto conhecido)
  const existing = new Set<string>();
  const ids = qualified.map((o) => o.itemId);
  for (let i = 0; i < ids.length; i += 400) {
    const { data } = await db.from("products").select("shopee_item_id").in("shopee_item_id", ids.slice(i, i + 400));
    for (const r of data ?? []) existing.add(String(r.shopee_item_id));
  }
  const fresh = qualified.filter((o) => !existing.has(o.itemId));

  // Clone por nome de algo já postado no grupo (mesmo produto, outro vendedor)
  // nunca chegaria a ser postado -- não vale gerar candidato/link pra ele.
  const { data: hist } = await db
    .from("social_posts")
    .select("deal_candidates(products(product_name, platform, category_slug))")
    .eq("post_type", "whatsapp")
    .eq("status", "posted");
  const shopeeHistory: PostedProductRecord[] = (hist ?? [])
    .map((r: any) => r.deal_candidates?.products)
    .filter((p: any) => p && (p.platform ?? "shopee") === "shopee")
    .map((p: any) => ({ productName: p.product_name, categorySlug: p.category_slug ?? null }));
  // categorySlug só é conhecido depois de persistir; compara sem escopo de categoria
  // no pré-filtro (mais conservador: só descarta quando o nome já bate com algo postado em
  // qualquer categoria), o dedupe fino por categoria continua rodando na hora do post.
  const looseHistory: PostedProductRecord[] = shopeeHistory.map((h) => ({ productName: h.productName, categorySlug: null }));
  const toCreate = fresh
    .filter((o) => !isDuplicateOfPosted(o.productName, null, looseHistory))
    .slice(0, MAX_NEW_PER_RUN);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      slot,
      keywords,
      paginas: `${firstPage}-${firstPage + PAGES_PER_WINDOW - 1}`,
      coletados: found.length,
      qualificados: qualified.length,
      novosNoCatalogo: fresh.length,
      aposDedupeNome: toCreate.length,
      amostra: toCreate.slice(0, 5).map((o) => `${o.productName.slice(0, 60)} R$${o.priceMin}`),
    });
  }

  const weekToken = `gf${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  let published = 0;
  const failed: string[] = [];
  await inBatches(toCreate, CONCURRENCY, async (offer) => {
    try {
      const { productId, snapshotId } = await persistOfferSnapshot(offer);
      const slug = buildProductSlug(offer.productName, offer.itemId);
      const { error: updateError } = await db
        .from("products")
        .update({ slug, site_published: true, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateError) throw new Error(updateError.message);

      const scored = scoreOffer(offer, DEFAULT_HARD_CUTS);
      const dc = await createDealCandidate({
        productId,
        offerSnapshotId: snapshotId,
        status: "discovered",
        score: scored.score.total,
        scoreBreakdown: scored.score as unknown as Record<string, unknown>,
      });
      const subIds = ["wg", "p1", weekToken, "auto"];
      const link = await generateAffiliateShortLink({ originUrl: offer.productLink || offer.offerLink, subIds });
      await saveAffiliateLink({ dealCandidateId: dc.id, originUrl: offer.productLink || offer.offerLink, subIds, shortLink: link.shortLink, longLink: link.longLink });
      published++;
    } catch (err) {
      failed.push(`${offer.itemId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  if (published > 0) {
    await notifyCatalogUpdate({ productSlug: "source-group-fill", categorySlug: null }).catch((e) =>
      console.error("[cron/source-group-fill] revalidate falhou:", e)
    );
  }

  return NextResponse.json({
    ok: true,
    slot,
    paginas: `${firstPage}-${firstPage + PAGES_PER_WINDOW - 1}`,
    keywords,
    coletados: found.length,
    qualificados: qualified.length,
    novosNoCatalogo: fresh.length,
    criados: published,
    falhas: failed.slice(0, 10),
  });
}
