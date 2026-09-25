/**
 * Ladrilhos de categoria pra grade da Home — inclui as categorias já
 * publicadas (com produto de verdade, `available: true`) e as próximas da
 * fila de expansão (ver CONTINUIDADE.md), mostradas esmaecidas com "em
 * breve" até a coleta do Growth OS preencher cada uma. Evita repetir o
 * problema já resolvido com os marketplaces: nunca linkar pra uma página
 * vazia/quebrada.
 *
 * `photoUrl`/`subtitle` (2026-09-26): foto real de produto recortada
 * (fundo removido de verdade, ver public/categorias-produtos/*.png) +
 * legenda curta, usadas pelo ladrilho no estilo novo (FeaturedCategoryGrid
 * na home, /categorias com o mesmo visual) — pedido do Heber pra bater
 * com o mockup em vez do ícone+texto antigo (`image`, ainda usado só na
 * navegação por ícone de /categoria/[slug], CategoryGrid.tsx).
 */
export interface CategoryTile {
  slug: string;
  label: string;
  /** Caminho da imagem pronta (ícone + rótulo já desenhados) em /public -- usado só em CategoryGrid.tsx (navegação de /categoria/[slug]). */
  image: string | null;
  /** Foto real de produto recortada (fundo removido), usada nos ladrilhos novos (home + /categorias). */
  photoUrl: string | null;
  subtitle: string;
  available: boolean;
  /** Só a categoria "outros" foge do padrão /categoria/[slug]. */
  href?: string;
}

export const CATEGORY_TILES: CategoryTile[] = [
  { slug: "eletronicos", label: "Eletrônicos", image: "/icones-categorias/eletronicos.jpg", photoUrl: "/categorias-produtos/eletronicos.png", subtitle: "Fones, carregadores e mais", available: true },
  { slug: "casa", label: "Casa", image: "/icones-categorias/casa.jpg", photoUrl: "/categorias-produtos/casa.png", subtitle: "Cozinha e decoração", available: true },
  { slug: "moda", label: "Moda", image: "/icones-categorias/moda.jpg", photoUrl: "/categorias-produtos/moda.png", subtitle: "Acessórios e mais", available: true },
  { slug: "beleza", label: "Beleza", image: "/icones-categorias/beleza.jpg", photoUrl: "/categorias-produtos/beleza.png", subtitle: "Cuidados e estilo", available: true },
  { slug: "esporte", label: "Esporte", image: "/icones-categorias/esporte.jpg", photoUrl: "/categorias-produtos/esporte.png", subtitle: "Tênis e academia", available: true },
  { slug: "infantil", label: "Infantil", image: null, photoUrl: "/categorias-produtos/infantil.png", subtitle: "Brinquedos e mais", available: true },

  // 1º lote da expansão (ver CONTINUIDADE.md) — coletado e publicado em 2026-09-15 (25 produtos cada).
  { slug: "ferramentas", label: "Ferramentas", image: "/icones-categorias/ferramentas.jpg", photoUrl: "/categorias-produtos/ferramentas.png", subtitle: "Furadeiras e mais", available: true },
  { slug: "automotivo", label: "Automotivo", image: "/icones-categorias/automotivo.jpg", photoUrl: "/categorias-produtos/automotivo.png", subtitle: "Acessórios pro carro", available: true },
  { slug: "saude", label: "Saúde", image: "/icones-categorias/saude.jpg", photoUrl: "/categorias-produtos/saude.png", subtitle: "Bem-estar e cuidados", available: true },
  { slug: "pet", label: "Pet", image: "/icones-categorias/pet.jpg", photoUrl: "/categorias-produtos/pet.png", subtitle: "Pra cães e gatos", available: true },
  { slug: "games", label: "Games", image: "/icones-categorias/games.jpg", photoUrl: "/categorias-produtos/games.png", subtitle: "Controles e acessórios", available: true },

  // 2º lote — coletado e publicado em 2026-09-15 (25 produtos cada).
  { slug: "papelaria", label: "Papelaria", image: "/icones-categorias/papelaria.jpg", photoUrl: "/categorias-produtos/papelaria.png", subtitle: "Cadernos e mais", available: true },
  { slug: "brinquedos", label: "Brinquedos", image: "/icones-categorias/brinquedos.jpg", photoUrl: "/categorias-produtos/brinquedos.png", subtitle: "Diversão garantida", available: true },
  { slug: "bebes", label: "Bebês", image: "/icones-categorias/bebes.jpg", photoUrl: "/categorias-produtos/bebes.png", subtitle: "Enxoval e cuidados", available: true },

  // 3º lote — coletado e publicado em 2026-09-15 (17/25/25/16 produtos).
  { slug: "alimentos", label: "Alimentos", image: "/icones-categorias/alimentos.jpg", photoUrl: "/categorias-produtos/alimentos.png", subtitle: "Suplementos e mais", available: true },
  { slug: "moveis", label: "Móveis", image: "/icones-categorias/moveis.jpg", photoUrl: "/categorias-produtos/moveis.png", subtitle: "Cadeiras e organização", available: true },
  { slug: "viagem", label: "Viagem", image: "/icones-categorias/viagem.jpg", photoUrl: "/categorias-produtos/viagem.png", subtitle: "Malas e acessórios", available: true },
  { slug: "livros", label: "Livros", image: "/icones-categorias/livros.jpg", photoUrl: "/categorias-produtos/livros.png", subtitle: "Leitura e planners", available: true },

  { slug: "outros", label: "Outros", image: "/icones-categorias/outros.jpg", photoUrl: null, subtitle: "", available: true, href: "/categorias" },
];
