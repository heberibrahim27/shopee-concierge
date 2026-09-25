/**
 * Buscas populares (chips na página /busca sem termo): termos reais dos
 * últimos 30 dias em `search_events` que tiveram resultado, agrupados
 * sem distinção de maiúsculas, com pelo menos 2 buscas. Hoje são poucos
 * (5 termos distintos no mês) -- a seção só aparece quando existir
 * termo repetido, e cresce sozinha com o tráfego. Custo zero.
 */
import { unstable_cache } from "next/cache";
import { getDb } from "../db/client";

const DAYS = 30;
const MIN_COUNT = 2;
const LIMIT = 8;

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function queryPopularSearches(): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];
  const db = getDb();
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const { data, error } = await db
    .from("search_events")
    .select("term, results_count")
    .gte("created_at", since)
    .gt("results_count", 0)
    .limit(2000);
  if (error) {
    console.error("[busca] buscas populares falhou:", error.message);
    return [];
  }
  return aggregatePopular((data ?? []).map((r) => String(r.term ?? "")));
}

/** Agregação pura (testável sem banco). */
export function aggregatePopular(terms: string[], minCount = MIN_COUNT, limit = LIMIT): string[] {
  const counts = new Map<string, number>();
  for (const raw of terms) {
    const term = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (term.length < 3 || term.length > 40) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

export function getCachedPopularSearches(): Promise<string[]> {
  return unstable_cache(queryPopularSearches, ["popular-searches"], { revalidate: 6 * 3600 })();
}
