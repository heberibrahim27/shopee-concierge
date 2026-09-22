/**
 * Transforma produtos crus da API da Lomadee em linhas prontas pra
 * gravar em products/offer_snapshots — mesmo formato que o pipeline da
 * Awin usa (src/lib/awin/ingest.ts), só que a fonte é a API REST da
 * Lomadee em vez do datafeed CSV.
 *
 * A API de produtos da Lomadee não devolve link de afiliado pronto
 * (diferente de campaigns, que já vem com channels[].shortUrls) — cada
 * produto precisa de 1 chamada própria em POST /affiliate/shortener/url
 * (type:"Custom") pra virar link rastreado. Por isso o ingest é limitado
 * por lote (rate limit real: 60 req/60s por chave).
 */
import { getDb } from "../db/client";
import { notifyCatalogUpdate } from "../site/notifyRevalidate";
import { buildProductSlug } from "../site/slug";
import { LomadeeProduct, shortenLomadeeUrl } from "./client";

export interface LomadeeCatalogItem {
  lomadeeProductId: string;
  organizationId: string;
  productName: string;
  price: number;
  basePrice: number | null;
  imageUrl: string;
  productUrl: string;
}

/**
 * Menor preço entre as opções do produto (pode ter várias, ex.: cor/
 * tamanho) — mesma lógica de "pega a variante mais barata" da Awin.
 *
 * Dois desvios reais da documentação, confirmados testando ao vivo
 * (2026-09-22): `option.available` não existe nos dados reais (sempre
 * `undefined` — filtrar por ele zera o catálogo inteiro, então não
 * filtra por isso, só por ter preço > 0); e `pricing[].price` já vem
 * em reais, não em centavos como a doc descreve (ex.: bateria de
 * notebook real com `price: 143.42`, claramente R$143,42 — R$1,43
 * seria absurdo pro produto).
 */
export function cheapestAvailableOption(product: LomadeeProduct): { price: number; listPrice: number | null } | null {
  let best: { price: number; listPrice: number | null } | null = null;
  for (const option of product.options ?? []) {
    for (const p of option.pricing ?? []) {
      if (!(p.price > 0)) continue;
      if (!best || p.price < best.price) best = { price: p.price, listPrice: p.listPrice > p.price ? p.listPrice : null };
    }
  }
  return best;
}

export function toCatalogItem(product: LomadeeProduct): LomadeeCatalogItem | null {
  if (!product.available) return null;
  // "#N/A" é lixo real de qualidade de dado visto no catálogo (feed com
  // nome ausente) — não vale publicar produto sem nome de verdade.
  if (!product.name || product.name.trim() === "#N/A") return null;
  const priced = cheapestAvailableOption(product);
  if (!priced) return null;
  const imageUrl = product.images?.[0]?.url;
  if (!imageUrl || !product.url) return null;

  return {
    lomadeeProductId: product.id,
    organizationId: product.organizationId,
    productName: product.name,
    price: priced.price,
    basePrice: priced.listPrice,
    imageUrl,
    productUrl: product.url,
  };
}

export async function persistLomadeeProduct(params: {
  item: LomadeeCatalogItem;
  platform: string;
  category: string;
  categorySlug: string;
}): Promise<{ productId: string; snapshotId: string; slug: string } | null> {
  const shortened = await shortenLomadeeUrl({
    organizationId: params.item.organizationId,
    type: "Custom",
    url: params.item.productUrl,
  });
  const offerLink = shortened[0]?.shortUrls?.[0];
  if (!offerLink) return null; // canal restrito pra essa marca (ver `message`) — não publica sem link de afiliado real

  const db = getDb();
  const externalId = `LOMADEE-${params.item.lomadeeProductId}`;
  const slug = buildProductSlug(params.item.productName, externalId);

  const { data: product, error: productError } = await db
    .from("products")
    .upsert(
      {
        shopee_item_id: externalId,
        product_name: params.item.productName,
        platform: params.platform,
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
  if (productError || !product) throw new Error(`Falha ao gravar produto Lomadee ${externalId}: ${productError?.message}`);

  const discountRate =
    params.item.basePrice && params.item.basePrice > params.item.price
      ? Math.round((1 - params.item.price / params.item.basePrice) * 100)
      : null;

  const { data: snapshot, error: snapshotError } = await db
    .from("offer_snapshots")
    .insert({
      product_id: product.id,
      price_min: params.item.price,
      price_max: params.item.price,
      price_discount_rate: discountRate,
      image_url: params.item.imageUrl,
      product_link: params.item.productUrl,
      offer_link: offerLink,
      raw: params.item as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (snapshotError || !snapshot) throw new Error(`Falha ao gravar snapshot Lomadee ${externalId}: ${snapshotError?.message}`);

  await notifyCatalogUpdate({ productSlug: slug, categorySlug: params.categorySlug }).catch((e) =>
    console.error(`[lomadee][revalidate] falhou pra ${slug}`, e)
  );

  return { productId: product.id, snapshotId: snapshot.id, slug };
}
