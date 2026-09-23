/**
 * Varredura semanal multi-categoria da Mercado Livre (pedido do Heber,
 * 2026-09-24: "monta esse fluxo pra rodar em outras categorias além de
 * ferramentas... podemos salvar em lote e atualizar semanalmente?").
 *
 * Achado real que molda o dedupe aqui: o link de afiliado gerado pelo
 * "Gerador de produtos recomendados" da ML tem um token ÚNICO por
 * geração — rodar esse fluxo de novo semana que vem no MESMO produto
 * gera um `meli.la` DIFERENTE, e `externalIdFromAffiliateUrl`
 * (ingest.ts) deriva o ID justamente desse link curto. Sem dedupe por
 * fora, o mesmo produto viraria uma linha nova toda semana. Como não
 * existe API real de produto (ver scrape.ts), o único identificador
 * estável que dá pra comparar ANTES de gastar uma geração de link é o
 * título — comparação exata, suficiente na nossa escala.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scrapeOfertas, rankOfertasByRelativeValue, ML_CATEGORY_IDS, type OfertaItem } from "./ofertas";

export type CategoryPick = OfertaItem & { valueScore: number; categorySlug: string };

export async function discoverWeeklyPicks(
  db: SupabaseClient,
  opts: { perCategory?: number; minValueScore?: number } = {}
): Promise<CategoryPick[]> {
  const perCategory = opts.perCategory ?? 3;
  const minValueScore = opts.minValueScore ?? 55; // mesmo piso conservador do MIN_DIVERSITY_SCORE (source-deals/route.ts)

  const { data: existing } = await db.from("products").select("product_name").eq("platform", "mercadolivre");
  const existingTitles = new Set((existing ?? []).map((p: any) => normalizeTitle(p.product_name)));

  const picks: CategoryPick[] = [];
  for (const [categorySlug, categoryId] of Object.entries(ML_CATEGORY_IDS)) {
    try {
      const items = await scrapeOfertas({ categoryId });
      const ranked = rankOfertasByRelativeValue(items);
      let addedForThisCategory = 0;
      for (const item of ranked) {
        if (addedForThisCategory >= perCategory) break;
        if (item.valueScore < minValueScore) break; // ranked desc — resto é pior ainda, pode parar
        if (existingTitles.has(normalizeTitle(item.title))) continue; // já temos esse produto, não gasta geração de link à toa
        picks.push({ ...item, categorySlug });
        existingTitles.add(normalizeTitle(item.title)); // evita pegar o "mesmo" item 2x se aparecer em categorias sobrepostas
        addedForThisCategory++;
      }
    } catch (err) {
      console.error(`[weeklyDiscovery] falha na categoria ${categorySlug} (${categoryId}):`, err);
    }
  }
  return picks;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
