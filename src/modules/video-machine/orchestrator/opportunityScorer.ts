import type { SupabaseClient } from "@supabase/supabase-js";
import { guessCategorySlug } from "../../../lib/site/categorize";

/**
 * Opportunity Scorer — segunda metade do "Motor 4" (debate sobre
 * crescimento de seguidores, 2026-09-22, ver CONTINUIDADE.md). Pega os
 * sinais de demanda reais que o Concierge grava a cada busca no
 * WhatsApp (`concierge_growth_signal`) e decide se existe uma
 * categoria "quente" o bastante pra a Máquina de Vídeos priorizar
 * antes de cair no critério normal (desconto/comissão).
 *
 * Decisão de design (2026-09-22): em vez de virar um novo peso no
 * `rankingWeights` da Skill04 (mexeria no vocabulário fechado de sinal
 * da SPEC — discoveryCommercial/freshness/novelty/categoryPriority/
 * historicalPerformance — e no hash de determinismo do kernel), isso
 * entra como um filtro OPCIONAL de categoria (`allowedCategorySlugs`)
 * que já existe no contrato de `ProductDiscoveryInput`. Zero mudança
 * no kernel; quando não há sinal quente o suficiente, o comportamento
 * é idêntico ao de hoje (undefined = sem restrição).
 *
 * `category_slug` gravado pelo Concierge vem em texto livre da IA de
 * visão (ex.: "tenis", "cafeteira") — não bate com a taxonomia fechada
 * do site, por isso passa por `guessCategorySlug` (mesmo classificador
 * usado no ingest da Lomadee) antes de agregar.
 */

export type HotCategory = {
  categorySlug: string;
  distinctSearchers: number;
  sampleProductNames: string[];
};

const WINDOW_HOURS = 48;
const MIN_DISTINCT_SEARCHERS = 3;

export async function computeHotCategory(db: SupabaseClient): Promise<HotCategory | null> {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("concierge_growth_signal")
    .select("chat_id_hash, category_slug, product_name")
    .gte("created_at", since)
    .limit(500);
  if (error || !data || data.length === 0) return null;

  const byCategory = new Map<string, { searchers: Set<string>; productNames: string[] }>();
  for (const row of data as any[]) {
    const raw = row.category_slug || row.product_name;
    if (!raw) continue;
    const slug = guessCategorySlug(raw);
    const bucket = byCategory.get(slug) ?? { searchers: new Set<string>(), productNames: [] };
    bucket.searchers.add(row.chat_id_hash);
    if (row.product_name && bucket.productNames.length < 5) bucket.productNames.push(row.product_name);
    byCategory.set(slug, bucket);
  }

  let best: HotCategory | null = null;
  for (const [slug, bucket] of byCategory.entries()) {
    const count = bucket.searchers.size;
    if (count < MIN_DISTINCT_SEARCHERS) continue;
    if (!best || count > best.distinctSearchers) {
      best = { categorySlug: slug, distinctSearchers: count, sampleProductNames: bucket.productNames };
    }
  }
  return best;
}
