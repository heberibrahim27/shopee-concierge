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
import { SortOption } from "./sort";

export interface SiteProduct {
  id: string;
  slug: string;
  productName: string;
  categorySlug: string | null;
  platform: string;
  /** Produtos com o mesmo group_id são o mesmo item físico em marketplaces
   * diferentes — null quando ninguém ainda linkou esse produto a um grupo
   * (comportamento padrão hoje: cada produto aparece sozinho). */
  groupId: string | null;
  highlightReason: string | null;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceDiscountRate: number | null;
  ratingStar: number | null;
  sales: number | null;
  offerLink: string | null;
  updatedAt: string;
  /** Só preenchido em listagens (busca/categoria/home) quando o produto tem
   * outras ofertas no mesmo group_id — mostra um mini comparativo no card
   * sem precisar clicar (a página de produto já mostra o comparativo
   * completo). Nunca inclui a própria oferta escolhida como principal. */
  otherOffers?: { platform: string; priceMin: number | null }[];
}

/**
 * Uma listagem (busca/categoria/home) nunca deve mostrar o mesmo produto
 * físico duas vezes (uma por marketplace) como se fossem itens diferentes —
 * isso é o que causava "produto com preço mais alto na tela, preço menor só
 * aparece se clicar". Agrupa por `group_id`, mantém só a oferta mais barata
 * como card principal (mesma regra de "sempre a de menor preço real" da
 * página de produto) e anexa até 3 outras ofertas do grupo pra mostrar um
 * mini comparativo direto no card. Produtos sem group_id passam direto.
 */
function dedupeByGroup(rows: SiteProduct[]): SiteProduct[] {
  const order: SiteProduct[] = [];
  const groupFirstIndex = new Map<string, number>();
  const groupSiblings = new Map<string, SiteProduct[]>();

  for (const row of rows) {
    if (!row.groupId) {
      order.push(row);
      continue;
    }
    const siblings = groupSiblings.get(row.groupId) ?? [];
    siblings.push(row);
    groupSiblings.set(row.groupId, siblings);
    if (!groupFirstIndex.has(row.groupId)) {
      groupFirstIndex.set(row.groupId, order.length);
      order.push(row); // placeholder — substituído abaixo
    }
  }

  for (const [groupId, index] of groupFirstIndex) {
    const siblings = groupSiblings.get(groupId)!;
    const sorted = [...siblings].sort(
      (a, b) => (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity)
    );
    const [cheapest, ...rest] = sorted;
    order[index] = {
      ...cheapest,
      otherOffers: rest.slice(0, 3).map((r) => ({ platform: r.platform, priceMin: r.priceMin })),
    };
  }

  return order;
}

const FALLBACK_REVALIDATE_SECONDS = 3600;

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const SITE_CATALOG_COLUMNS =
  "id, slug, product_name, category_slug, platform, group_id, highlight_reason, image_url, price_min, price_max, price_discount_rate, rating_star, sales, offer_link, updated_at";

function mapRow(row: Record<string, unknown>): SiteProduct {
  return {
    id: String(row.id),
    slug: String(row.slug),
    productName: String(row.product_name),
    categorySlug: (row.category_slug as string | null) ?? null,
    platform: String(row.platform ?? "shopee"),
    groupId: (row.group_id as string | null) ?? null,
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
  return dedupeByGroup((data ?? []).map(mapRow));
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
  return dedupeByGroup((data ?? []).map(mapRow));
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

/** Coluna + direção da `site_catalog` pra cada opção de ordenação da busca. */
function sortColumn(sort: SortOption): { column: string; ascending: boolean } {
  switch (sort) {
    case "vendidos":
      return { column: "sales", ascending: false };
    case "avaliacao":
      return { column: "rating_star", ascending: false };
    case "preco":
      return { column: "price_min", ascending: true };
    default:
      return { column: "snapshot_captured_at", ascending: false };
  }
}

async function querySearch(term: string, sort: SortOption): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv() || term.trim().length < 2) return [];

  const db = getDb();
  const { column, ascending } = sortColumn(sort);
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .ilike("product_name", `%${term.trim()}%`)
    .order(column, { ascending, nullsFirst: false })
    .limit(24);

  if (error) throw new Error(`Falha na busca "${term}": ${error.message}`);
  return dedupeByGroup((data ?? []).map(mapRow));
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
export function searchProducts(term: string, sort: SortOption = "relevancia"): Promise<SiteProduct[]> {
  return querySearch(term, sort);
}

/**
 * Outras ofertas do MESMO produto físico (mesmo group_id), em outra
 * plataforma — pra montar o quadro "compare em outras lojas" na página de
 * produto. Enquanto nada for linkado a um grupo (padrão hoje), retorna
 * lista vazia e a seção simplesmente não aparece — nunca mostra preço
 * inventado de loja que não temos dado real.
 */
async function queryGroupOffers(groupId: string, excludeSlug: string): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("group_id", groupId)
    .neq("slug", excludeSlug);

  if (error) throw new Error(`Falha ao buscar ofertas do grupo ${groupId}: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export function getCachedGroupOffers(groupId: string, excludeSlug: string): Promise<SiteProduct[]> {
  return unstable_cache(() => queryGroupOffers(groupId, excludeSlug), ["group-offers", groupId, excludeSlug], {
    tags: [`group:${groupId}`],
    revalidate: FALLBACK_REVALIDATE_SECONDS,
  })();
}
