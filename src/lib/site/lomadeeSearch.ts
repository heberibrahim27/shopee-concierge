/**
 * Busca AO VIVO na Lomadee (rede multi-loja: Americanas, Submarino,
 * Extra, Sawary etc.) — complemento da página `/busca`, ao lado da busca
 * ao vivo na Shopee (liveSearch.ts). A API de produtos da Lomadee aceita
 * `search` (mesmo endpoint que o cron source-lomadee usa pra ingestão).
 *
 * Custo: zero em dinheiro (API grátis pra afiliado), mas o limite real é
 * 60 req/60s por chave, compartilhado com o cron. Por isso:
 *  - o resultado de cada termo fica cacheado 6h (`unstable_cache`) — a
 *    mesma busca repetida não bate na API de novo;
 *  - o nome da loja (GET /affiliate/brands/{id}) fica cacheado 7 dias e
 *    só é resolvido pra um punhado de lojas distintas por busca;
 *  - o link de afiliado NÃO é gerado aqui (seria 1 chamada por
 *    resultado). Ele é gerado só no clique, em `/go/lomadee` — 1 chamada
 *    por clique real, não por resultado exibido.
 */
import { unstable_cache } from "next/cache";
import { fetchLomadeeBrandById, fetchLomadeeProducts } from "../lomadee/client";
import { toCatalogItem } from "../lomadee/ingest";
import { isRelevantTitle } from "./liveSearch";

export interface LomadeeLiveProduct {
  id: string;
  organizationId: string;
  storeName: string | null;
  storeSlug: string | null;
  productName: string;
  imageUrl: string;
  price: number;
  listPrice: number | null;
  productUrl: string;
}

const MAX_RESULTS = 12;
const MAX_DISTINCT_BRAND_LOOKUPS = 6;
const SEARCH_CACHE_SECONDS = 6 * 3600;
const BRAND_CACHE_SECONDS = 7 * 24 * 3600;

function hasLomadeeEnv(): boolean {
  return Boolean(process.env.LOMADEE_API_KEY);
}

function getCachedBrand(organizationId: string): Promise<{ name: string; slug: string } | null> {
  return unstable_cache(
    async () => {
      try {
        const { data } = await fetchLomadeeBrandById(organizationId);
        return { name: data.name, slug: data.slug };
      } catch {
        return null;
      }
    },
    ["lomadee-brand", organizationId],
    { revalidate: BRAND_CACHE_SECONDS }
  )();
}

async function queryLomadee(term: string): Promise<LomadeeLiveProduct[]> {
  const { data } = await fetchLomadeeProducts({ isAvailable: true, search: term, limit: 24 });

  const items = data
    .map((product) => ({ product, item: toCatalogItem(product) }))
    .filter((x): x is { product: (typeof data)[number]; item: NonNullable<ReturnType<typeof toCatalogItem>> } =>
      Boolean(x.item) && isRelevantTitle(term, x.item!.productName)
    )
    .slice(0, MAX_RESULTS);

  const distinctOrgs = Array.from(new Set(items.map((x) => x.item.organizationId))).slice(
    0,
    MAX_DISTINCT_BRAND_LOOKUPS
  );
  const brands = new Map<string, { name: string; slug: string } | null>();
  await Promise.all(
    distinctOrgs.map(async (orgId) => {
      brands.set(orgId, await getCachedBrand(orgId));
    })
  );

  return items.map(({ item }) => {
    const brand = brands.get(item.organizationId) ?? null;
    return {
      id: item.lomadeeProductId,
      organizationId: item.organizationId,
      storeName: brand?.name ?? null,
      storeSlug: brand?.slug ?? null,
      productName: item.productName,
      imageUrl: item.imageUrl,
      price: item.price,
      listPrice: item.basePrice,
      productUrl: item.productUrl,
    };
  });
}

/** Nunca derruba a página de busca: sem chave ou com erro, devolve []. */
export async function searchLomadeeLive(term: string): Promise<LomadeeLiveProduct[]> {
  const cleaned = term.trim();
  if (!hasLomadeeEnv() || cleaned.length < 2) return [];

  const cacheKey = cleaned.toLowerCase().slice(0, 100);
  try {
    return await unstable_cache(() => queryLomadee(cleaned), ["lomadee-search", cacheKey], {
      revalidate: SEARCH_CACHE_SECONDS,
    })();
  } catch (err) {
    console.error(`[busca] Lomadee ao vivo falhou pra "${cleaned}":`, err);
    return [];
  }
}
