/**
 * Seção "Explore por categoria" da home -- ladrilho com foto real de
 * produto + rótulo + subtítulo curto. Achado real 2026-09-26 (mockup do
 * Heber): substitui o antigo ladrilho ícone+texto só aqui na home; a
 * navegação por ícone continua igual em /categoria/[slug]
 * (CategoryGrid.tsx).
 *
 * Fotos CURADAS À MÃO + fundo removido de verdade (não filtro de brilho
 * -- essa era a tentativa anterior, o Heber apontou que "cinza claro não
 * é branco"). Cada produto foi recortado (remoção de fundo real, ver
 * public/categorias-produtos/*.png, RGBA de verdade) e fica sobre o
 * branco do PRÓPRIO card -- assim as 6 ficam idênticas de verdade, não
 * dependem do fundo variável de cada foto original. Produto de origem
 * de cada PNG documentado abaixo pra rastreabilidade.
 *
 * Ordem: pedido do Heber pra seguir volume de busca real na Shopee --
 * pesquisa real (não painel oficial da Shopee, agregada de fontes de
 * mercado/blog, ver memória) aponta tecnologia/celular como categoria
 * historicamente mais buscada, casa em seguida, moda antes de beleza
 * nessa listagem específica.
 */
const FEATURED_CATEGORIES = [
  {
    slug: "eletronicos",
    label: "Eletrônicos",
    subtitle: "Fones, carregadores e mais",
    imageUrl: "/categorias-produtos/eletronicos.png",
    alt: "Carregador e cabo USB-C",
  },
  {
    slug: "casa",
    label: "Casa",
    subtitle: "Cozinha e decoração",
    imageUrl: "/categorias-produtos/casa.png",
    alt: "Chaleira elétrica inox",
  },
  {
    slug: "moda",
    label: "Moda",
    subtitle: "Acessórios e mais",
    imageUrl: "/categorias-produtos/moda.png",
    alt: "Relógio digital",
  },
  {
    slug: "beleza",
    label: "Beleza",
    subtitle: "Cuidados e estilo",
    imageUrl: "/categorias-produtos/beleza.png",
    alt: "Chapinha prancha de cabelo profissional",
  },
  {
    slug: "esporte",
    label: "Esporte",
    subtitle: "Tênis e academia",
    imageUrl: "/categorias-produtos/esporte.png",
    alt: "Tênis Nike Downshifter",
  },
  {
    slug: "infantil",
    label: "Infantil",
    subtitle: "Brinquedos e mais",
    imageUrl: "/categorias-produtos/infantil.png",
    alt: "Patinete infantil 3 rodas",
  },
];

export function FeaturedCategoryGrid() {
  return (
    <div className="dc-featured-cat-grid">
      {FEATURED_CATEGORIES.map((cat) => (
        <a key={cat.slug} href={`/categoria/${cat.slug}`} className="dc-featured-cat-tile">
          <div className="dc-featured-cat-photo">
            <img src={cat.imageUrl} alt={cat.alt} loading="lazy" />
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
