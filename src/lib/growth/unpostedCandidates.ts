/**
 * Busca candidatos ainda não postados, em ordem de score, SEM mandar a
 * lista de "já postados" dentro da URL da consulta.
 *
 * Achado real (2026-10-04, Heber: "só cupons no grupo tem alguns dias"):
 * o grupo ficou 4 dias sem postar produto porque o filtro de exclusão ia
 * como `.not("product_id", "in", "(id1,id2,...)")` -- com 634 produtos já
 * postados (~37 chars cada) a URL passou de ~23KB, estourou o limite do
 * PostgREST/proxy e a consulta INTEIRA falhou com `fetch failed`. O código
 * engolia o erro (`error || !data ? []`) e devolvia lista vazia, que
 * virava "sem candidato novo" -- sem log, sem alarme, e piorando a cada
 * post (mesmo bug latente em publish-product, que ainda usa a lista de
 * todos os canais). Aqui a exclusão é feita em memória, paginando por
 * score até juntar `want` linhas elegíveis.
 */
export async function fetchUnpostedByScore(
  buildQuery: () => any,
  postedProductIds: Set<string>,
  want: number,
  opts: { pageSize?: number; maxPages?: number; label?: string } = {}
): Promise<any[]> {
  const pageSize = opts.pageSize ?? 1000; // teto padrão de linhas por request no PostgREST
  const maxPages = opts.maxPages ?? 15;
  const collected: any[] = [];

  for (let page = 0; page < maxPages && collected.length < want; page++) {
    const { data, error } = await buildQuery()
      .order("score", { ascending: false, nullsFirst: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) {
      console.error(`[fetchUnpostedByScore${opts.label ? `:${opts.label}` : ""}] falha na página ${page}:`, error.message);
      break;
    }
    const rows = (data ?? []) as any[];
    for (const row of rows) {
      if (postedProductIds.has(row.product_id)) continue;
      collected.push(row);
      if (collected.length >= want) break;
    }
    if (rows.length < pageSize) break; // última página
  }
  return collected;
}
