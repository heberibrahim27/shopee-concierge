/**
 * Ladrilhos de categoria pra grade da Home — inclui as categorias já
 * publicadas (com produto de verdade, `available: true`) e as próximas da
 * fila de expansão (ver CONTINUIDADE.md), mostradas esmaecidas com "em
 * breve" até a coleta do Growth OS preencher cada uma. Evita repetir o
 * problema já resolvido com os marketplaces: nunca linkar pra uma página
 * vazia/quebrada.
 */
export interface CategoryTile {
  slug: string;
  label: string;
  /** Caminho da imagem pronta (ícone + rótulo já desenhados) em /public. */
  image: string | null;
  available: boolean;
  /** Só a categoria "outros" foge do padrão /categoria/[slug]. */
  href?: string;
}

export const CATEGORY_TILES: CategoryTile[] = [
  { slug: "casa", label: "Casa", image: "/icones-categorias/casa.jpg", available: true },
  { slug: "eletronicos", label: "Eletrônicos", image: "/icones-categorias/eletronicos.jpg", available: true },
  { slug: "ferramentas", label: "Ferramentas", image: "/icones-categorias/ferramentas.jpg", available: true },
  { slug: "beleza", label: "Beleza", image: "/icones-categorias/beleza.jpg", available: true },
  { slug: "moda", label: "Moda", image: "/icones-categorias/moda.jpg", available: true },
  // Sem imagem nova ainda (o lote do ChatGPT trouxe Bebês/Brinquedos
  // separados no lugar de "Infantil") — mantém o ícone antigo até decidir
  // se Infantil vira dois assuntos ou ganha uma arte própria.
  { slug: "infantil", label: "Infantil", image: null, available: true },

  // 1º lote da expansão (ver CONTINUIDADE.md) — coletado e publicado em 2026-09-15 (25 produtos cada).
  { slug: "esporte", label: "Esporte", image: "/icones-categorias/esporte.jpg", available: true },
  { slug: "automotivo", label: "Automotivo", image: "/icones-categorias/automotivo.jpg", available: true },
  { slug: "saude", label: "Saúde", image: "/icones-categorias/saude.jpg", available: true },
  { slug: "pet", label: "Pet", image: "/icones-categorias/pet.jpg", available: true },
  { slug: "games", label: "Games", image: "/icones-categorias/games.jpg", available: true },

  // 2º lote — coletado e publicado em 2026-09-15 (25 produtos cada).
  { slug: "papelaria", label: "Papelaria", image: "/icones-categorias/papelaria.jpg", available: true },
  { slug: "brinquedos", label: "Brinquedos", image: "/icones-categorias/brinquedos.jpg", available: true },
  { slug: "bebes", label: "Bebês", image: "/icones-categorias/bebes.jpg", available: true },

  // 3º lote
  { slug: "alimentos", label: "Alimentos", image: "/icones-categorias/alimentos.jpg", available: false },
  { slug: "moveis", label: "Móveis", image: "/icones-categorias/moveis.jpg", available: false },
  { slug: "viagem", label: "Viagem", image: "/icones-categorias/viagem.jpg", available: false },
  { slug: "livros", label: "Livros", image: "/icones-categorias/livros.jpg", available: false },

  { slug: "outros", label: "Outros", image: "/icones-categorias/outros.jpg", available: true, href: "/categorias" },
];
