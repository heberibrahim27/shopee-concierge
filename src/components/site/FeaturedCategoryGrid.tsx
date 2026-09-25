/**
 * Seção "Explore por categoria" da home -- ladrilho com foto real de
 * produto + rótulo + subtítulo curto. Achado real 2026-09-26 (mockup do
 * Heber): substitui o antigo ladrilho ícone+texto só aqui na home; a
 * navegação por ícone continua igual em /categoria/[slug]
 * (CategoryGrid.tsx).
 *
 * Fotos CURADAS À MÃO, não "mais vendido" automático -- achado real
 * testando a versão anterior (dinâmica por sales): o catálogo mistura
 * foto de estúdio limpa com banner de propaganda cheio de texto/selo/
 * modelo, e o mais vendido de cada categoria caía aleatoriamente em
 * qualquer um dos dois estilos, ficando visualmente inconsistente
 * (pedido do Heber: "fundo branco igual ao modelo", "apenas o produto
 * na imagem", "sem foto de pessoas"). Verificado uma a uma (baixei e
 * abri cada candidata) antes de fixar:
 * - Eletrônicos/Moda/Esporte: feed Kabum/Awin (Nike, Olympikus) já força
 *   `bg=white` na própria URL da imagem -- fundo branco garantido de
 *   verdade, não por sorte.
 * - Casa/Infantil: nenhum produto dessas categorias vem desse feed com
 *   fundo garantido; usada a melhor foto real disponível no catálogo
 *   (still single-produto, sem gente, sem banner de texto).
 * - Beleza: produto Shopee com fundo branco de estúdio conferido à mão.
 */
const FEATURED_CATEGORIES = [
  {
    slug: "eletronicos",
    label: "Eletrônicos",
    subtitle: "Fones, carregadores e mais",
    // Achado real: a imagem da Kabum/Awin (productserve.com) devolve 403
    // quando carregada direto do nosso domínio (bloqueio de hotlink) --
    // por isso essa categoria usa foto Shopee em vez do padrão bg=white
    // usado em Moda/Esporte.
    imageUrl: "https://cf.shopee.com.br/file/sg-11134201-7rbkw-lpcg9rytbas79a",
    alt: "Carregador e cabo USB-C",
  },
  {
    slug: "casa",
    label: "Casa",
    subtitle: "Cozinha e decoração",
    imageUrl: "https://cf.shopee.com.br/file/br-11134207-820lc-mreq8encuolh62",
    alt: "Chaleira elétrica inox",
    // Fundo real é cinza claro de estúdio, não branco puro (nenhum
    // produto de Casa no catálogo tem fundo branco garantido como
    // Kabum/Nike/Olympikus) -- clareado via filtro pra bater com o
    // branco das outras categorias, pedido direto do Heber.
    whiten: true,
  },
  {
    slug: "beleza",
    label: "Beleza",
    subtitle: "Cuidados e estilo",
    imageUrl: "https://cf.shopee.com.br/file/sg-11134201-824iy-mfiwdimgg3yi4e",
    alt: "Chapinha prancha de cabelo profissional",
  },
  {
    slug: "moda",
    label: "Moda",
    subtitle: "Acessórios e mais",
    // Achado real: roupa Nike/Olympikus no feed é sempre foto COM modelo
    // vestindo (pedido do Heber: "evite foto de pessoas") -- usado um
    // acessório sem gente em vez de peça de roupa.
    imageUrl: "https://cf.shopee.com.br/file/br-11134207-7r98o-m1zzq6l901gfa2",
    alt: "Relógio digital",
  },
  {
    slug: "esporte",
    label: "Esporte",
    subtitle: "Tênis e academia",
    // Nike hospeda a própria foto já com fundo limpo -- hotlink direto
    // funciona (diferente da Kabum via productserve, que bloqueia).
    imageUrl: "https://imgnike-a.akamaihd.net/1500x1500/110258ID_39faea10_d759_4e2d_a91b_3fb9a6d0c621_bgclean.jpg",
    alt: "Tênis Nike Downshifter",
  },
  {
    slug: "infantil",
    label: "Infantil",
    subtitle: "Brinquedos e mais",
    imageUrl: "https://cf.shopee.com.br/file/br-11134207-820lw-mpnps4fzbfuoca",
    alt: "Patinete infantil 3 rodas",
  },
];

export function FeaturedCategoryGrid() {
  return (
    <div className="dc-featured-cat-grid">
      {FEATURED_CATEGORIES.map((cat) => (
        <a key={cat.slug} href={`/categoria/${cat.slug}`} className="dc-featured-cat-tile">
          <div className="dc-featured-cat-photo">
            <img
              src={cat.imageUrl}
              alt={cat.alt}
              loading="lazy"
              style={cat.whiten ? { filter: "brightness(1.55) saturate(0.35) contrast(0.85)" } : undefined}
            />
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
