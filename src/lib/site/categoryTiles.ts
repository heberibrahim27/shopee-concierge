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
 * legenda curta. Fonte única do ladrilho com foto usado na home,
 * `/categorias` e (desde 2026-09-25, pedido do Heber pra não ficar
 * inconsistente ao entrar numa categoria) também em /categoria/[slug]
 * (CategoryGrid.tsx) — o antigo ladrilho ícone+texto (campo `image`) foi
 * removido daqui, não tem mais consumidor.
 */
export interface CategoryTile {
  slug: string;
  label: string;
  /** Foto real de produto recortada (fundo removido), usada em todos os ladrilhos de categoria do site. */
  photoUrl: string | null;
  subtitle: string;
  available: boolean;
  /** Só a categoria "outros" foge do padrão /categoria/[slug]. */
  href?: string;
}

export const CATEGORY_TILES: CategoryTile[] = [
  { slug: "eletronicos", label: "Eletrônicos", photoUrl: "/categorias-produtos/eletronicos.png", subtitle: "Fones, carregadores e mais", available: true },
  { slug: "casa", label: "Casa", photoUrl: "/categorias-produtos/casa.png", subtitle: "Cozinha e decoração", available: true },
  { slug: "moda", label: "Moda", photoUrl: "/categorias-produtos/moda.png", subtitle: "Acessórios e mais", available: true },
  { slug: "beleza", label: "Beleza", photoUrl: "/categorias-produtos/beleza.png", subtitle: "Cuidados e estilo", available: true },
  { slug: "esporte", label: "Esporte", photoUrl: "/categorias-produtos/esporte.png", subtitle: "Tênis e academia", available: true },
  { slug: "infantil", label: "Infantil", photoUrl: "/categorias-produtos/infantil.png", subtitle: "Brinquedos e mais", available: true },

  // 1º lote da expansão (ver CONTINUIDADE.md) — coletado e publicado em 2026-09-15 (25 produtos cada).
  { slug: "ferramentas", label: "Ferramentas", photoUrl: "/categorias-produtos/ferramentas.png", subtitle: "Furadeiras e mais", available: true },
  { slug: "automotivo", label: "Automotivo", photoUrl: "/categorias-produtos/automotivo.png", subtitle: "Acessórios pro carro", available: true },
  { slug: "saude", label: "Saúde", photoUrl: "/categorias-produtos/saude.png", subtitle: "Bem-estar e cuidados", available: true },
  { slug: "pet", label: "Pet", photoUrl: "/categorias-produtos/pet.png", subtitle: "Pra cães e gatos", available: true },
  { slug: "games", label: "Games", photoUrl: "/categorias-produtos/games.png", subtitle: "Controles e acessórios", available: true },

  // 2º lote — coletado e publicado em 2026-09-15 (25 produtos cada).
  { slug: "papelaria", label: "Papelaria", photoUrl: "/categorias-produtos/papelaria.png", subtitle: "Cadernos e mais", available: true },
  { slug: "brinquedos", label: "Brinquedos", photoUrl: "/categorias-produtos/brinquedos.png", subtitle: "Diversão garantida", available: true },
  { slug: "bebes", label: "Bebês", photoUrl: "/categorias-produtos/bebes.png", subtitle: "Enxoval e cuidados", available: true },

  // 3º lote — coletado e publicado em 2026-09-15 (17/25/25/16 produtos).
  { slug: "alimentos", label: "Alimentos", photoUrl: "/categorias-produtos/alimentos.png", subtitle: "Suplementos e mais", available: true },
  { slug: "moveis", label: "Móveis", photoUrl: "/categorias-produtos/moveis.png", subtitle: "Cadeiras e organização", available: true },
  { slug: "viagem", label: "Viagem", photoUrl: "/categorias-produtos/viagem.png", subtitle: "Malas e acessórios", available: true },
  { slug: "livros", label: "Livros", photoUrl: "/categorias-produtos/livros.png", subtitle: "Leitura e planners", available: true },

  { slug: "outros", label: "Outros", photoUrl: null, subtitle: "", available: true, href: "/categorias" },
];
