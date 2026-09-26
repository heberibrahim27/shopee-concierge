/**
 * Backfill único (não é cron) pra publicar de uma vez o feed inteiro de
 * "Mais Vendidos" da Shopee (`getBestSellerOffers`, listType=2) no site --
 * pedido do Heber (2026-09-26, depois do print da aba "Mais Procurados"/
 * "Mais Vendidos" do app Shopee Affiliate): "Da pra subir tudo pro site?
 * Os mais vendidos de cada categoria... Sobe tudo, atualiza a home e as
 * categorias!". Até aqui esse feed só entrava via `source-deals`
 * competindo pelas 25 vagas do dia contra a busca por palavra-chave --
 * isso publica TODO o feed de uma vez (paginação confirmada real até
 * ~489 itens únicos antes de repetir, ver investigação ao vivo).
 *
 * Corte de qualidade diferente do `dealScoring` padrão: SEM o mínimo de
 * desconto (`minPriceDiscountRate`). Esse corte existe pra sourcing por
 * palavra-chave, onde desconto alto é o único sinal disponível pra um
 * produto ainda não testado -- aqui o produto já É comprovado (milhares
 * de vendas reais, nota real), exigir desconto também penalizaria
 * best-seller genuíno que não precisa de desconto pra vender. Mantém só
 * nota >= 4.5 e vendas >= 50 (mesmos números do `DEFAULT_HARD_CUTS`).
 *
 * Roda com: npx tsx scripts/backfill-bestseller-feed.ts
 */
import "dotenv/config";
import { getDb } from "../src/lib/db/client";
import { getBestSellerOffers, generateAffiliateShortLink } from "../src/lib/shopee/queries";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../src/lib/db/snapshots";
import { guessCategorySlug } from "../src/lib/site/categorize";
import { buildProductSlug } from "../src/lib/site/slug";
import { ShopeeProductOffer } from "../src/lib/shopee/types";

const MAX_PAGES = 12;
const PAGE_LIMIT = 50;
const MIN_RATING = 4.5;
const MIN_SALES = 50;
const CONCURRENCY = 8;

function passesQualityBar(offer: ShopeeProductOffer): boolean {
  const rating = Number(offer.ratingStar ?? 0);
  const sales = offer.sales ?? 0;
  return rating >= MIN_RATING && sales >= MIN_SALES;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function main() {
  const db = getDb();

  const seen = new Set<string>();
  const allOffers: ShopeeProductOffer[] = [];
  let emptyStreak = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const offers = await getBestSellerOffers({ page, limit: PAGE_LIMIT });
    if (offers.length === 0) break;
    let newCount = 0;
    for (const o of offers) {
      const itemId = String(o.itemId);
      if (!seen.has(itemId)) {
        seen.add(itemId);
        newCount++;
        allOffers.push({ ...o, itemId, shopId: String(o.shopId) });
      }
    }
    console.log(`página ${page}: ${offers.length} itens, ${newCount} novos, total=${allOffers.length}`);
    if (newCount === 0) {
      emptyStreak++;
      if (emptyStreak >= 2) break;
    } else emptyStreak = 0;
  }

  const qualified = allOffers.filter(passesQualityBar);
  console.log(`\n${allOffers.length} coletados, ${qualified.length} passam nota>=${MIN_RATING} e vendas>=${MIN_SALES}`);

  const byCategory = new Map<string, number>();
  for (const o of qualified) byCategory.set(guessCategorySlug(o.productName), (byCategory.get(guessCategorySlug(o.productName)) || 0) + 1);
  console.log("Distribuição:", Object.fromEntries(byCategory));

  const existingIds = new Set<string>();
  const itemIds = qualified.map((o) => o.itemId);
  for (let i = 0; i < itemIds.length; i += 500) {
    const chunk = itemIds.slice(i, i + 500);
    const { data } = await db.from("products").select("shopee_item_id").in("shopee_item_id", chunk);
    for (const r of data ?? []) existingIds.add(String(r.shopee_item_id));
  }
  console.log(`${existingIds.size} já existiam no catálogo (dedupe por shopee_item_id) -- serão pulados.`);

  const toProcess = qualified.filter((o) => !existingIds.has(o.itemId));
  console.log(`${toProcess.length} produtos novos a processar.\n`);

  let published = 0;
  let failed = 0;
  const affectedCategories = new Set<string>();
  const weekToken = `bs${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  await inBatches(toProcess, CONCURRENCY, async (offer) => {
    try {
      const { productId, snapshotId } = await persistOfferSnapshot(offer);
      const slug = buildProductSlug(offer.productName, offer.itemId);
      const categorySlug = guessCategorySlug(offer.productName);
      const { error: updateError } = await db
        .from("products")
        .update({ slug, site_published: true, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateError) throw new Error(updateError.message);

      const dc = await createDealCandidate({ productId, offerSnapshotId: snapshotId, status: "discovered" });
      const subIds = ["bs", "p1", weekToken, "auto"];
      const link = await generateAffiliateShortLink({ originUrl: offer.productLink || offer.offerLink, subIds });
      await saveAffiliateLink({ dealCandidateId: dc.id, originUrl: offer.productLink || offer.offerLink, subIds, shortLink: link.shortLink, longLink: link.longLink });

      affectedCategories.add(categorySlug);
      published++;
      if (published % 25 === 0) console.log(`${published} publicados...`);
    } catch (err) {
      failed++;
      console.error(`falha ${offer.itemId} (${offer.productName.slice(0, 40)}):`, err instanceof Error ? err.message : err);
    }
  });

  console.log(`\nConcluído: ${published} publicados, ${failed} falhas, ${existingIds.size} já existiam.`);

  const baseUrl = process.env.SITE_BASE_URL;
  const secret = process.env.REVALIDATION_SECRET;
  if (baseUrl && secret) {
    const tags = ["home", ...affectedCategories];
    for (const categorySlug of tags) {
      try {
        const res = await fetch(`${baseUrl}/api/internal/revalidate-catalog`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ event: "product_updated", productSlug: "backfill-bestseller-feed", categorySlug: categorySlug === "home" ? null : categorySlug }),
        });
        console.log(`revalidado ${categorySlug} -> ${res.status}`);
      } catch (e) {
        console.error(`falha revalidando ${categorySlug}:`, e);
      }
    }
  } else {
    console.log("SITE_BASE_URL/REVALIDATION_SECRET ausentes localmente -- cache expira sozinho em até 1h.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
