/**
 * Lista fixa de categorias do site. Deliberadamente um array em código, não
 * uma tabela no banco — é uma taxonomia pequena que muda raramente, e
 * manter em código evita uma junção a mais em toda query pública.
 */
export interface SiteCategory {
  slug: string;
  label: string;
  emoji: string;
}

export const SITE_CATEGORIES: SiteCategory[] = [
  { slug: "casa", label: "Casa", emoji: "🏠" },
  { slug: "eletronicos", label: "Eletrônicos", emoji: "🔌" },
  { slug: "ferramentas", label: "Ferramentas", emoji: "🛠️" },
  { slug: "beleza", label: "Beleza", emoji: "💄" },
  { slug: "moda", label: "Moda", emoji: "👕" },
  { slug: "infantil", label: "Infantil", emoji: "🧸" },
];

export function getCategoryBySlug(slug: string): SiteCategory | undefined {
  return SITE_CATEGORIES.find((category) => category.slug === slug);
}
