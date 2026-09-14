/**
 * Acesso a dados do site público. Lê SEMPRE de `site_catalog` (view que já
 * traz o snapshot mais recente por produto — ver migration
 * 20260914120000), nunca da API da Shopee ao vivo: um pico de crawler do
 * Google ou tráfego do Instagram não pode virar chamada pra Shopee.
 * Ver ARQUITETURA-SITE.md, seções 3 e 6.
 *
 * Cache: unstable_cache com tags por entidade (product:<slug>,
 * category:<slug>, home:offers). `revalidate` é só rede de segurança — a
 * invalidação principal é sob demanda, disparada pelo Growth OS via
 * POST /api/internal/revalidate-catalog (ver esse route handler).
 */
import { unstable_cache } from "next/cache";
import { getDb } from "../db/client";

export interface SiteProduct {
  id: string;
  slug: string;
  productName: string;
  categorySlug: string | null;
  platform: string;
  highlightReason: string | null;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceDiscountRate: number | null;
  ratingStar: number | null;
  sales: number | null;
  offerLink: string | null;
  updatedAt: string;
}

const FALLBACK_REVALIDATE_SECONDS = 3600;

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const SITE_CATALOG_COLUMNS =
  "id, slug, product_name, category_slug, platform, highlight_reason, image_url, price_min, price_max, price_discount_rate, rating_star, sales, offer_link, updated_at";

function mapRow(row: Record<string, unknown>): SiteProduct {
  return {
    id: String(row.id),
    slug: String(row.slug),
    productName: String(row.product_name),
    categorySlug: (row.category_slug as string | null) ?? null,
    platform: String(row.platform ?? "shopee"),
    highlightReason: (row.highlight_reason as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    priceMin: row.price_min === null || row.price_min === undefined ? null : Number(row.price_min),
    priceMax: row.price_max === null || row.price_max === undefined ? null : Number(row.price_max),
    priceDiscountRate:
      row.price_discount_rate === null || row.price_discount_rate === undefined
        ? null
        : Number(row.price_discount_rate),
    ratingStar: row.rating_star === null || row.rating_star === undefined ? null : Number(row.rating_star),
    sales: row.sales === null || row.sales === undefined ? null : Number(row.sales),
    offerLink: (row.offer_link as string | null) ?? null,
    updatedAt: String(row.updated_at),
  };
}

async function queryHomeOffers(): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .order("snapshot_captured_at", { ascending: false })
    .limit(24);

  if (error) throw new Error(`Falha ao buscar ofertas da home: ${error.message}`);
  return (data ?? []).map(mapRow);
}

async function queryCategoryProducts(categorySlug: string): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("category_slug", categorySlug)
    .order("snapshot_captured_at", { ascending: false })
    .limit(48);

  if (error) throw new Error(`Falha ao buscar categoria ${categorySlug}: ${error.message}`);
  return (data ?? []).map(mapRow);
}

async function queryProductBySlug(slug: string): Promise<SiteProduct | null> {
  if (!hasSupabaseEnv()) return null;

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar produto ${slug}: ${error.message}`);
  return data ? mapRow(data) : null;
}

async function querySearch(term: string): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv() || term.trim().length < 2) return [];

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .ilike("product_name", `%${term.trim()}%`)
    .order("snapshot_captured_at", { ascending: false })
    .limit(24);

  if (error) throw new Error(`Falha na busca "${term}": ${error.message}`);
  return (data ?? []).map(mapRow);
}

export function getCachedHomeOffers(): Promise<SiteProduct[]> {
  return unstable_cache(queryHomeOffers, ["home-offers"], {
    tags: ["home:offers"],
    revalidate: FALLBACK_REVALIDATE_SECONDS,
  })();
}

export function getCachedCategory(categorySlug: string): Promise<SiteProduct[]> {
  return unstable_cache(
    () => queryCategoryProducts(categorySlug),
    ["category", categorySlug],
    { tags: [`category:${categorySlug}`], revalidate: FALLBACK_REVALIDATE_SECONDS }
  )();
}

export function getCachedProduct(slug: string): Promise<SiteProduct | null> {
  return unstable_cache(() => queryProductBySlug(slug), ["product", slug], {
    tags: [`product:${slug}`],
    revalidate: FALLBACK_REVALIDATE_SECONDS,
  })();
}

/** Busca não é cacheada por tag — é resultado de uma query livre do visitante. */
export function searchProducts(term: string): Promise<SiteProduct[]> {
  return querySearch(term);
}
