/**
 * "Veja também" na página de produto: produtos da MESMA categoria com
 * preço parecido (entre metade e o dobro), excluindo o próprio produto e
 * os irmãos do mesmo group_id (já aparecem em "Compare em outras lojas").
 * Ordena pelo preço mais próximo. Zero custo: mesma view site_catalog,
 * cache por categoria (tag category:<slug>, invalidada pelo Growth OS).
 *
 * Por que importa: página de produto hoje era beco sem saída (produto →
 * CTA → sai do site). Link interno pra produto parecido segura quem não
 * gostou do preço e dá ao Google o grafo interno que as páginas "finas"
 * da Kabum não tinham.
 */
import { unstable_cache } from "next/cache";
import { getDb } from "../db/client";
import { SITE_CATALOG_COLUMNS, SiteProduct, dedupeByGroup, mapRow } from "./catalog";

const POOL = 120;
const LIMIT = 6;

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function queryCategoryPool(categorySlug: string): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];
  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("category_slug", categorySlug)
    .not("price_min", "is", null)
    .not("image_url", "is", null)
    .order("snapshot_captured_at", { ascending: false })
    .limit(POOL);
  if (error) throw new Error(`Falha ao buscar relacionados de ${categorySlug}: ${error.message}`);
  return dedupeByGroup((data ?? []).map(mapRow));
}

function getCachedCategoryPool(categorySlug: string): Promise<SiteProduct[]> {
  return unstable_cache(() => queryCategoryPool(categorySlug), ["related-pool", categorySlug], {
    tags: [`category:${categorySlug}`],
    revalidate: 3600,
  })();
}

/** Seleção pura (testável sem banco): mesma categoria já garantida pelo pool. */
export function pickRelated(pool: SiteProduct[], product: SiteProduct, limit = LIMIT): SiteProduct[] {
  const price = product.priceMin;
  const candidates = pool.filter(
    (p) => p.id !== product.id && p.slug !== product.slug && (!product.groupId || p.groupId !== product.groupId)
  );
  if (price === null || price <= 0) return candidates.slice(0, limit);

  const inRange = candidates.filter((p) => p.priceMin !== null && p.priceMin >= price * 0.5 && p.priceMin <= price * 2);
  const ranked = (inRange.length >= limit ? inRange : candidates).sort(
    (a, b) => Math.abs((a.priceMin ?? 0) - price) - Math.abs((b.priceMin ?? 0) - price)
  );
  return ranked.slice(0, limit);
}

export async function getRelatedProducts(product: SiteProduct): Promise<SiteProduct[]> {
  if (!product.categorySlug) return [];
  const pool = await getCachedCategoryPool(product.categorySlug);
  return pickRelated(pool, product);
}
