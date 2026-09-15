import { getDb } from "../db/client";

/**
 * Registra uma busca real de usuário (termo + total de resultados achados,
 * catálogo curado + Shopee ao vivo somados) pra alimentar o bloco "Buscas
 * sem resultado" do /admin. Nunca deve derrubar a página de busca.
 */
export async function logSearchEvent(term: string, resultsCount: number): Promise<void> {
  try {
    const db = getDb();
    await db.from("search_events").insert({ term: term.trim().slice(0, 200), results_count: resultsCount });
  } catch (err) {
    console.error("[search-log] falha ao registrar busca:", err);
  }
}
