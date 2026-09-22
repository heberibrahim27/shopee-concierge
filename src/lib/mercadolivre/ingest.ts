import { getDb } from "../db/client";
import { notifyCatalogUpdate } from "../site/notifyRevalidate";
import { buildProductSlug } from "../site/slug";
import { ScrapedFeaturedProduct } from "./scrape";

/**
 * Sem item ID público (não tem API), o identificador estável é
 * derivado do próprio link curto de afiliado — re-scrapear o mesmo
 * link sempre atualiza a mesma linha (upsert), nunca duplica.
 */
export function externalIdFromAffiliateUrl(affiliateUrl: string): string {
  const path = new URL(affiliateUrl).pathname.replace(/^\/+/, "");
  return `ML-${path}`;
}

export async function persistMercadoLivreProduct(params: {
  affiliateUrl: string;
  scraped: ScrapedFeaturedProduct;
  category: string;
  categorySlug: string;
}): Promise<{ productId: string; snapshotId: string; slug: string }> {
  const db = getDb();
  const externalId = externalIdFromAffiliateUrl(params.affiliateUrl);
  const slug = buildProductSlug(params.scraped.title, externalId);

  const { data: product, error: productError } = await db
    .from("products")
    .upsert(
      {
        shopee_item_id: externalId,
        product_name: params.scraped.title,
        platform: "mercadolivre",
        category: params.category,
        category_slug: params.categorySlug,
        slug,
        site_published: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopee_item_id" }
    )
    .select("id")
    .single();
  if (productError || !product) throw new Error(`Falha ao gravar produto Mercado Livre ${externalId}: ${productError?.message}`);

  const discountRate =
    params.scraped.previousPrice && params.scraped.previousPrice > params.scraped.currentPrice
      ? Math.round((1 - params.scraped.currentPrice / params.scraped.previousPrice) * 100)
      : null;

  const { data: snapshot, error: snapshotError } = await db
    .from("offer_snapshots")
    .insert({
      product_id: product.id,
      price_min: params.scraped.currentPrice,
      price_max: params.scraped.currentPrice,
      price_discount_rate: discountRate,
      image_url: params.scraped.imageUrl,
      product_link: params.affiliateUrl,
      // O próprio link curto de afiliado JÁ carrega o rastreamento do
      // canal do Heber (matt_tool=...) — não existe (nem precisa
      // existir) um "link gerado" separado, diferente de Awin/Lomadee.
      offer_link: params.affiliateUrl,
      raw: { scrapedAt: new Date().toISOString(), ...params.scraped },
    })
    .select("id")
    .single();
  if (snapshotError || !snapshot) throw new Error(`Falha ao gravar snapshot Mercado Livre ${externalId}: ${snapshotError?.message}`);

  await notifyCatalogUpdate({ productSlug: slug, categorySlug: params.categorySlug }).catch((e) =>
    console.error(`[mercadolivre][revalidate] falhou pra ${slug}`, e)
  );

  return { productId: product.id, snapshotId: snapshot.id, slug };
}
