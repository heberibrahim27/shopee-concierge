/**
 * Diretório de lojas do site — base das páginas `/loja/[slug]` (ofertas
 * de uma loja) e `/cupom/[loja]` (cupons de uma loja). Padrão de SEO de
 * comparador/cuponeiro real (Cuponomia, Promobit): "cupom kabum",
 * "ofertas kabum" são buscas com volume próprio, e hoje só existia a
 * listagem geral em /cupons.
 *
 * A identidade da loja vem de dois lugares que já existem:
 *  - `products.platform` (shopee, kabum, mercadolivre, nike, olympikus);
 *  - `coupons.platform` — slug da marca resolvido na ingestão (kabum,
 *    balaroti, sawary...) ou o valor genérico "lomadee" quando a marca
 *    não foi resolvida; nesse caso o slug sai do nome do anunciante.
 *
 * Nenhuma tabela nova: tudo é derivado do que os crons já gravam.
 */
import { unstable_cache } from "next/cache";
import { getDb } from "../db/client";
import {
  SITE_CATALOG_COLUMNS,
  SiteProduct,
  dedupeByGroup,
  getCachedPlatformStats,
  mapRow,
} from "./catalog";
import { SiteCoupon, getCachedAllActiveCoupons } from "./coupons";
import { PLATFORM_INFO } from "./platforms";
import { slugify } from "./slug";

export interface StoreEntry {
  slug: string;
  label: string;
  productCount: number;
  couponCount: number;
  couponsWithCode: number;
}

/** Slugs de plataforma que são só "rede", não loja de verdade. */
const NETWORK_PLATFORMS = new Set(["lomadee", "awin"]);

export function storeSlugForCoupon(coupon: SiteCoupon): string {
  if (coupon.platform && !NETWORK_PLATFORMS.has(coupon.platform)) return coupon.platform;
  return slugify(coupon.advertiserName) || "loja";
}

export function storeLabelForCoupon(coupon: SiteCoupon): string {
  if (coupon.platform && PLATFORM_INFO[coupon.platform]) return PLATFORM_INFO[coupon.platform].label;
  return coupon.advertiserName;
}

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function buildStoreDirectory(): Promise<StoreEntry[]> {
  const [stats, coupons] = await Promise.all([getCachedPlatformStats(), getCachedAllActiveCoupons()]);
  const byslug = new Map<string, StoreEntry>();

  for (const { platform, count } of stats) {
    byslug.set(platform, {
      slug: platform,
      label: PLATFORM_INFO[platform]?.label ?? platform,
      productCount: count,
      couponCount: 0,
      couponsWithCode: 0,
    });
  }

  for (const coupon of coupons) {
    const slug = storeSlugForCoupon(coupon);
    const entry = byslug.get(slug) ?? {
      slug,
      label: storeLabelForCoupon(coupon),
      productCount: 0,
      couponCount: 0,
      couponsWithCode: 0,
    };
    entry.couponCount += 1;
    if (coupon.code) entry.couponsWithCode += 1;
    byslug.set(slug, entry);
  }

  return Array.from(byslug.values()).sort(
    (a, b) => b.productCount + b.couponCount * 10 - (a.productCount + a.couponCount * 10)
  );
}

export function getCachedStoreDirectory(): Promise<StoreEntry[]> {
  return unstable_cache(buildStoreDirectory, ["store-directory"], {
    tags: ["coupons", "platform-stats"],
    revalidate: 3600,
  })();
}

export async function getStore(slug: string): Promise<StoreEntry | null> {
  const directory = await getCachedStoreDirectory();
  return directory.find((store) => store.slug === slug) ?? null;
}

export async function getStoreCoupons(slug: string): Promise<SiteCoupon[]> {
  const coupons = await getCachedAllActiveCoupons();
  return coupons.filter((coupon) => storeSlugForCoupon(coupon) === slug);
}

async function queryStoreProducts(platform: string): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("platform", platform)
    .order("snapshot_captured_at", { ascending: false })
    .limit(48);

  if (error) throw new Error(`Falha ao buscar produtos da loja ${platform}: ${error.message}`);
  return dedupeByGroup((data ?? []).map(mapRow));
}

export function getCachedStoreProducts(platform: string): Promise<SiteProduct[]> {
  return unstable_cache(() => queryStoreProducts(platform), ["store-products", platform], {
    tags: ["platform-stats"],
    revalidate: 3600,
  })();
}

/**
 * Gates de indexação (mesma filosofia do SEO_INDEX_GATE de produto: a
 * página existe e converte mesmo sem indexar; só pede index quando tem
 * conteúdo de verdade). Uma loja com 1 cupom é página fina — fica
 * noindex,follow até acumular.
 */
export const STORE_PAGE_MIN_PRODUCTS_TO_INDEX = 12;
export const COUPON_PAGE_MIN_COUPONS_TO_INDEX = 3;

export function isStorePageIndexable(store: StoreEntry): boolean {
  return store.productCount >= STORE_PAGE_MIN_PRODUCTS_TO_INDEX;
}

export function isCouponPageIndexable(store: StoreEntry): boolean {
  return store.couponCount >= COUPON_PAGE_MIN_COUPONS_TO_INDEX;
}

/** "setembro de 2026" — padrão de título de página de cupom ("Cupom X setembro 2026"). */
export function currentMonthLabel(): string {
  return new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}
