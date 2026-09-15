/**
 * Ordenação da busca — compartilhada entre o catálogo curado
 * (site_catalog) e a busca ao vivo na Shopee, pra manter os mesmos
 * rótulos/opções nos dois lados do resultado.
 */
export type SortOption = "relevancia" | "vendidos" | "avaliacao" | "preco";

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevancia", label: "Relevância" },
  { value: "vendidos", label: "Mais vendidos" },
  { value: "avaliacao", label: "Melhor avaliação" },
  { value: "preco", label: "Menor preço" },
];

export function parseSortOption(value: string | undefined): SortOption {
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as SortOption) : "relevancia";
}
