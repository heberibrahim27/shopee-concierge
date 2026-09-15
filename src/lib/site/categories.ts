/**
 * Lista fixa de categorias do site. Deliberadamente um array em código, não
 * uma tabela no banco — é uma taxonomia pequena que muda raramente, e
 * manter em código evita uma junção a mais em toda query pública.
 */
export interface SiteCategory {
  slug: string;
  label: string;
}

export const SITE_CATEGORIES: SiteCategory[] = [
  { slug: "casa", label: "Casa" },
  { slug: "eletronicos", label: "Eletrônicos" },
  { slug: "ferramentas", label: "Ferramentas" },
  { slug: "beleza", label: "Beleza" },
  { slug: "moda", label: "Moda" },
  { slug: "infantil", label: "Infantil" },
  { slug: "esporte", label: "Esporte" },
  { slug: "automotivo", label: "Automotivo" },
  { slug: "saude", label: "Saúde" },
  { slug: "pet", label: "Pet" },
  { slug: "games", label: "Games" },
  { slug: "papelaria", label: "Papelaria" },
  { slug: "brinquedos", label: "Brinquedos" },
  { slug: "bebes", label: "Bebês" },
  { slug: "alimentos", label: "Alimentos" },
  { slug: "moveis", label: "Móveis" },
  { slug: "viagem", label: "Viagem" },
  { slug: "livros", label: "Livros" },
];

export function getCategoryBySlug(slug: string): SiteCategory | undefined {
  return SITE_CATEGORIES.find((category) => category.slug === slug);
}
