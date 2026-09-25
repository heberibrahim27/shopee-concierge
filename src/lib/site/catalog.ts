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
  /** Timestamp real da última captura de preço dessa oferta específica
   * (`offer_snapshots.captured_at`, via `site_catalog.snapshot_captured_at`)
   * -- diferente de `updatedAt`, que é só o `updated_at` genérico da linha
   * do produto (pode mudar por edição de categoria/slug, não reflete
   * checagem de preço real). Usar SEMPRE este campo pro selo de
   * "preço atualizado há X" -- ver correção do ChatGPT 2026-09-25. */
  priceCheckedAt: string | null;
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
  "id, slug, product_name, category_slug, platform, group_id, highlight_reason, image_url, price_min, price_max, price_discount_rate, rating_star, sales, offer_link, updated_at, snapshot_captured_at";

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
    priceCheckedAt: (row.snapshot_captured_at as string | null) ?? null,
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

// Páginas de intenção de compra por categoria + faixa de preço (ex:
// "achados de casa até R$50") -- pedido do ChatGPT na revisão do plano
// de receita (Fase 1: SEO de intenção, não só verificar Search
// Console). Só os limiares abaixo, escolhidos por serem os mesmos já
// usados no conteúdo do Instagram (achado-cozedor etc, "ABAIXO DE R$
// 40"-like) -- generateStaticParams (ver page.tsx) decide quais
// combinações categoria+limiar têm produto real o suficiente antes de
// gerar a página, pra não criar conteúdo raso.
export const PRICE_THRESHOLDS = [30, 50, 100] as const;

async function queryCategoryProductsUnderPrice(categorySlug: string, maxPrice: number): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("category_slug", categorySlug)
    .lte("price_min", maxPrice)
    .order("price_discount_rate", { ascending: false, nullsFirst: false })
    .limit(48);

  if (error) throw new Error(`Falha ao buscar categoria ${categorySlug} até R$${maxPrice}: ${error.message}`);
  return dedupeByGroup((data ?? []).map(mapRow));
}

export function getCachedCategoryUnderPrice(categorySlug: string, maxPrice: number): Promise<SiteProduct[]> {
  return unstable_cache(
    () => queryCategoryProductsUnderPrice(categorySlug, maxPrice),
    ["category-price", categorySlug, String(maxPrice)],
    { tags: [`category:${categorySlug}`], revalidate: FALLBACK_REVALIDATE_SECONDS }
  )();
}

/** Mínimo de produto real pra valer a pena gerar a página -- evita conteúdo raso. */
const MIN_PRODUCTS_FOR_PRICE_PAGE = 6;

/** Combinações (categoria, limiar) com produto real o suficiente, pra generateStaticParams. */
export async function listViablePriceCategoryPages(): Promise<Array<{ slug: string; preco: number }>> {
  if (!hasSupabaseEnv()) return [];
  const db = getDb();
  const viable: Array<{ slug: string; preco: number }> = [];
  for (const threshold of PRICE_THRESHOLDS) {
    const { data, error } = await db
      .from("site_catalog")
      .select("category_slug")
      .lte("price_min", threshold)
      .not("category_slug", "is", null);
    if (error || !data) continue;
    const counts = new Map<string, number>();
    for (const row of data as any[]) {
      const slug = row.category_slug as string;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    for (const [slug, count] of counts) {
      if (count >= MIN_PRODUCTS_FOR_PRICE_PAGE) viable.push({ slug, preco: threshold });
    }
  }
  return viable;
}

// Link interno da página de categoria normal pras páginas de intenção
// de compra (ver project_price_intent_seo_pages na memória) -- sem
// isso elas só existiam via sitemap, nenhum visitante real chegava
// nelas navegando. Cacheado igual ao resto (tag category:<slug>).
async function queryViablePriceThresholdsForCategory(categorySlug: string): Promise<number[]> {
  if (!hasSupabaseEnv()) return [];
  const db = getDb();
  const viable: number[] = [];
  for (const threshold of PRICE_THRESHOLDS) {
    const { count, error } = await db
      .from("site_catalog")
      .select("id", { count: "exact", head: true })
      .eq("category_slug", categorySlug)
      .lte("price_min", threshold);
    if (!error && (count ?? 0) >= MIN_PRODUCTS_FOR_PRICE_PAGE) viable.push(threshold);
  }
  return viable;
}

export function getCachedViablePriceThresholds(categorySlug: string): Promise<number[]> {
  return unstable_cache(
    () => queryViablePriceThresholdsForCategory(categorySlug),
    ["category-price-thresholds", categorySlug],
    { tags: [`category:${categorySlug}`], revalidate: FALLBACK_REVALIDATE_SECONDS }
  )();
}

// Selo de "menor preço dos últimos N dias" -- pedido do Heber ao ver um
// mockup de referência com esse selo. Só entra no ar porque `offer_snapshots`
// já guarda captura real de preço por produto desde 13/09 (não é um
// número inventado pra "parecer confiável"). N é o número real de dias
// cobertos por esse produto especificamente (pode ser bem menor que 30
// pra produto que entrou recente no catálogo), nunca um valor fixo.
export interface ProductPriceHistory {
  lowestPrice: number | null;
  daysTracked: number;
}

async function queryProductPriceHistory(productId: string): Promise<ProductPriceHistory> {
  if (!hasSupabaseEnv()) return { lowestPrice: null, daysTracked: 0 };

  const db = getDb();
  const { data, error } = await db
    .from("offer_snapshots")
    .select("price_min, captured_at")
    .eq("product_id", productId)
    .not("price_min", "is", null)
    .order("captured_at", { ascending: true });

  if (error || !data || data.length === 0) return { lowestPrice: null, daysTracked: 0 };

  const prices = (data as { price_min: number; captured_at: string }[]).map((r) => Number(r.price_min));
  const lowestPrice = Math.min(...prices);
  const oldestCapturedAt = new Date(data[0].captured_at).getTime();
  const daysTracked = Math.max(1, Math.round((Date.now() - oldestCapturedAt) / (24 * 60 * 60 * 1000)));

  return { lowestPrice, daysTracked };
}

export function getCachedProductPriceHistory(productId: string): Promise<ProductPriceHistory> {
  return unstable_cache(
    () => queryProductPriceHistory(productId),
    ["product-price-history", productId],
    { tags: [`product-history:${productId}`], revalidate: FALLBACK_REVALIDATE_SECONDS }
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

/**
 * Produtos postados no Instagram nas últimas 24h (ver
 * `/api/cron/publish-product`) — usado pela página `/hoje`, que era um
 * redirect fixo pro último produto e virou uma listagem de verdade
 * (pedido do Heber: com 20 posts/dia, um redirect só mostra 1 produto
 * aleatório, ninguém vê o resto). Janela é ROLANTE (últimas 24h a partir
 * de agora), igual ao Story sumir 24h depois de postado — não reseta à
 * meia-noite. É também o link que a resposta automática do Instagram
 * manda pra quem comenta "QUERO" no Story. Depois de 24h o produto some
 * daqui mas continua na categoria dele no site. Um mesmo produto gera 2
 * linhas em `social_posts` (feed + story) — deduplica por slug, mantendo
 * a ordem do post mais recente primeiro.
 */
async function queryTodayPosts(): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("social_posts")
    .select("posted_at, deal_candidates(products(slug))")
    .eq("status", "posted")
    .gte("posted_at", since)
    .order("posted_at", { ascending: false });

  if (error) throw new Error(`Falha ao buscar posts de hoje: ${error.message}`);

  const slugsInOrder: string[] = [];
  const seen = new Set<string>();
  for (const row of (data ?? []) as any[]) {
    const slug = row.deal_candidates?.products?.slug as string | undefined;
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      slugsInOrder.push(slug);
    }
  }
  if (slugsInOrder.length === 0) return [];

  const { data: catalogRows, error: catalogError } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .in("slug", slugsInOrder);

  if (catalogError) throw new Error(`Falha ao buscar catálogo dos posts de hoje: ${catalogError.message}`);

  const bySlug = new Map((catalogRows ?? []).map((row) => [String(row.slug), mapRow(row)]));
  return slugsInOrder.map((slug) => bySlug.get(slug)).filter((p): p is SiteProduct => Boolean(p));
}

export function getCachedTodayPosts(): Promise<SiteProduct[]> {
  return unstable_cache(queryTodayPosts, ["today-posts"], {
    tags: ["today:posts"],
    revalidate: 300,
  })();
}
