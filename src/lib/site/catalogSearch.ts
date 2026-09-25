/**
 * Busca de texto no catálogo curado (site_catalog) usando a função
 * `search_site_catalog` do Postgres (full text em português + trigram pra
 * erro de digitação — ver migration 20260926100000).
 *
 * Fica num módulo próprio, separado de catalog.ts, de propósito: a
 * página de produto e o histórico de preço estão sendo mexidos em
 * paralelo em catalog.ts (sessão de 2026-09-26), e a busca não precisa
 * tocar naquele arquivo além de reaproveitar mapRow/dedupeByGroup.
 *
 * Fallback: se a função ainda não existir no banco (migration não
 * aplicada) ou falhar, cai no `searchProducts` antigo (ilike) — a busca
 * nunca fica pior do que era.
 */
import { getDb } from "../db/client";
import {
  SITE_CATALOG_COLUMNS,
  SiteProduct,
  dedupeByGroup,
  mapRow,
  searchProducts,
} from "./catalog";
import { SortOption } from "./sort";

const RANKED_LIMIT = 48;

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Ordenação aplicada em memória sobre o conjunto já ranqueado (48
 * melhores casamentos). "relevancia" mantém a ordem do Postgres. */
function applySort(rows: SiteProduct[], sort: SortOption): SiteProduct[] {
  const byNumberDesc = (pick: (p: SiteProduct) => number | null) => (a: SiteProduct, b: SiteProduct) =>
    (pick(b) ?? -Infinity) - (pick(a) ?? -Infinity);

  switch (sort) {
    case "vendidos":
      return [...rows].sort(byNumberDesc((p) => p.sales));
    case "avaliacao":
      return [...rows].sort(byNumberDesc((p) => p.ratingStar));
    case "preco":
      return [...rows].sort((a, b) => (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity));
    default:
      return rows;
  }
}

export async function searchCatalog(term: string, sort: SortOption = "relevancia"): Promise<SiteProduct[]> {
  const cleaned = term.trim();
  if (!hasSupabaseEnv() || cleaned.length < 2) return [];

  const db = getDb();
  const { data: ranked, error: rankError } = await db.rpc("search_site_catalog", {
    p_term: cleaned,
    p_limit: RANKED_LIMIT,
  });

  if (rankError) {
    console.error(`[busca] search_site_catalog falhou, usando ilike: ${rankError.message}`);
    return searchProducts(cleaned, sort);
  }

  const rankedIds = ((ranked ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (rankedIds.length === 0) return [];

  const { data, error } = await db.from("site_catalog").select(SITE_CATALOG_COLUMNS).in("id", rankedIds);
  if (error) throw new Error(`Falha ao carregar resultados da busca "${cleaned}": ${error.message}`);

  // Reordena pela posição do ranking — `.in()` não preserva ordem.
  const position = new Map(rankedIds.map((id, index) => [id, index]));
  const rows = (data ?? [])
    .map(mapRow)
    .sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity));

  return applySort(dedupeByGroup(rows), sort).slice(0, 24);
}
