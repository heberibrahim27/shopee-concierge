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
const CHEAP_POOL = 40;
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

// Achado real (Heber, 2026-09-25, print do "Veja também" na página de um
// repetidor Wi-Fi de R$89,90): mostrava monitor de R$10 mil como
// "parecido". Causa raiz de duas camadas:
//  1) o pool principal são os 120 produtos mais RECENTES da categoria
//     (recência, não preço) -- num momento em que a rotação do cron
//     acabou de atualizar um lote de eletrônico caro, o pool podia não
//     ter NADA barato (confirmado ao vivo: os 120 mais recentes de
//     "eletronicos" não tinham nenhum item abaixo de R$5.859, mesmo a
//     categoria inteira tendo item a partir de R$4,24).
//  2) o fallback antigo ("se não achar produto na faixa de preço, usa
//     qualquer candidato mesmo assim") preenchia com o que sobrava do
//     MESMO pool recente, não importa o preço.
// Corrigido em duas partes: faixa de preço progressiva (2x -> 3x -> 6x)
// sobre o pool de recência primeiro; se nem assim achar o suficiente,
// busca um SEGUNDO pool direto do banco, ordenado por preço ascendente
// (não recência) -- garante achado barato de verdade mesmo quando o
// pool recente monopolizou em eletrônico caro. Heber, na sequência do
// debate: "quero produto bom e barato" / "achadinhos não tem produto de
// 10 mil" -- o fallback final NUNCA volta pro "mais próximo em preço
// que sobrou" (foi exatamente isso que causou o bug).
async function queryCheapCategoryPool(categorySlug: string): Promise<SiteProduct[]> {
  if (!hasSupabaseEnv()) return [];
  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select(SITE_CATALOG_COLUMNS)
    .eq("category_slug", categorySlug)
    .not("price_min", "is", null)
    .not("image_url", "is", null)
    .order("price_min", { ascending: true })
    .limit(CHEAP_POOL);
  if (error) throw new Error(`Falha ao buscar os mais baratos de ${categorySlug}: ${error.message}`);
  return dedupeByGroup((data ?? []).map(mapRow));
}

function getCachedCheapCategoryPool(categorySlug: string): Promise<SiteProduct[]> {
  return unstable_cache(() => queryCheapCategoryPool(categorySlug), ["related-cheap-pool", categorySlug], {
    tags: [`category:${categorySlug}`],
    revalidate: 3600,
  })();
}

const PRICE_RANGE_STEPS = [2, 3, 6];

/** Nota real abaixo de 4 fica de fora; sem nota ainda (novo no catálogo) passa -- mesmo corte de isDecentOffer em liveSearch.ts. */
function isDecentRating(p: SiteProduct): boolean {
  return !(p.ratingStar !== null && p.ratingStar > 0 && p.ratingStar < 4);
}

function excludeSelfAndSiblings(pool: SiteProduct[], product: SiteProduct): SiteProduct[] {
  return pool.filter(
    (p) => p.id !== product.id && p.slug !== product.slug && (!product.groupId || p.groupId !== product.groupId)
  );
}

/** Seleção pura (testável sem banco): mesma categoria já garantida pelos pools. */
export function pickRelated(
  pool: SiteProduct[],
  product: SiteProduct,
  limit = LIMIT,
  cheapPool: SiteProduct[] = []
): SiteProduct[] {
  const price = product.priceMin;
  const candidates = excludeSelfAndSiblings(pool, product);
  if (price === null || price <= 0) return candidates.slice(0, limit);

  for (const multiplier of PRICE_RANGE_STEPS) {
    const inRange = candidates.filter(
      (p) => p.priceMin !== null && p.priceMin >= price / multiplier && p.priceMin <= price * multiplier
    );
    if (inRange.length >= limit) {
      return inRange
        .sort((a, b) => Math.abs((a.priceMin ?? 0) - price) - Math.abs((b.priceMin ?? 0) - price))
        .slice(0, limit);
    }
  }

  const cheapCandidates = excludeSelfAndSiblings(cheapPool, product);
  const fallbackPool = cheapCandidates.length > 0 ? cheapCandidates : candidates;
  return fallbackPool
    .filter((p) => p.priceMin !== null && isDecentRating(p))
    .sort((a, b) => (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity))
    .slice(0, limit);
}

export async function getRelatedProducts(product: SiteProduct): Promise<SiteProduct[]> {
  if (!product.categorySlug) return [];
  // Achado real (2026-09-25): buscar o pool barato só "se precisar" tem
  // um bug sutil -- o próprio fallback do pool de recência já preenche
  // `limit` itens (mesmo que caros), então "já tenho `limit` itens" nunca
  // detecta que a correspondência por PREÇO falhou. Busca os dois pools
  // sempre (cache por categoria, reaproveitado entre produtos -- custo
  // real baixo) e deixa pickRelated decidir.
  const [pool, cheapPool] = await Promise.all([
    getCachedCategoryPool(product.categorySlug),
    getCachedCheapCategoryPool(product.categorySlug),
  ]);
  return pickRelated(pool, product, LIMIT, cheapPool);
}
