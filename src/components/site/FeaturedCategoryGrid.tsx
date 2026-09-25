import { CATEGORY_TILES } from "../../lib/site/categoryTiles";

/**
 * Seção "Explore por categoria" da home -- ladrilho com foto real de
 * produto + rótulo + subtítulo curto. Achado real 2026-09-26 (mockup do
 * Heber): substitui o antigo ladrilho ícone+texto só aqui na home; a
 * navegação por ícone continua igual em /categoria/[slug]
 * (CategoryGrid.tsx). Dados (foto recortada + subtítulo) vêm de
 * CATEGORY_TILES (lib/site/categoryTiles.ts) -- mesma fonte usada em
 * /categorias, pra nunca divergir.
 *
 * Ordem: pedido do Heber pra seguir volume de busca real na Shopee --
 * pesquisa real (não painel oficial da Shopee, agregada de fontes de
 * mercado/blog, ver memória) aponta tecnologia/celular como categoria
 * historicamente mais buscada, casa em seguida, moda antes de beleza
 * nessa listagem específica. Curadoria de 6 categorias em destaque; as
 * outras 12 ficam em /categorias.
 */
const FEATURED_SLUGS = ["eletronicos", "casa", "moda", "beleza", "esporte", "infantil"];

export function FeaturedCategoryGrid() {
  const tiles = FEATURED_SLUGS.map((slug) => CATEGORY_TILES.find((t) => t.slug === slug)).filter(
    (t): t is NonNullable<typeof t> => Boolean(t)
  );

  return (
    <div className="dc-featured-cat-grid">
      {tiles.map((cat) => (
        <a key={cat.slug} href={`/categoria/${cat.slug}`} className="dc-featured-cat-tile">
          <div className="dc-featured-cat-photo">
            {cat.photoUrl ? <img src={cat.photoUrl} alt={cat.label} loading="lazy" /> : null}
          </div>
          <div className="dc-featured-cat-text">
            <span className="dc-featured-cat-label">{cat.label}</span>
            <span className="dc-featured-cat-subtitle">{cat.subtitle}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
