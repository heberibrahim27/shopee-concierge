/**
 * Seção "Explore por categoria" da home -- ladrilho com foto real de
 * produto (o mais vendido daquela categoria, ver getCachedFeaturedCategoryPhotos)
 * + rótulo + subtítulo curto. Achado real 2026-09-26 (mockup do Heber):
 * substitui o antigo ladrilho ícone+texto só aqui na home; a navegação
 * por ícone continua igual em /categoria/[slug] (CategoryGrid.tsx).
 */
const FEATURED_CATEGORIES = [
  { slug: "eletronicos", label: "Eletrônicos", subtitle: "Fones, celulares e mais" },
  { slug: "casa", label: "Casa", subtitle: "Cozinha e decoração" },
  { slug: "beleza", label: "Beleza", subtitle: "Maquiagem, skincare e mais" },
  { slug: "moda", label: "Moda", subtitle: "Roupas, bolsas e acessórios" },
  { slug: "esporte", label: "Esporte", subtitle: "Tênis, academia e lazer" },
  { slug: "infantil", label: "Infantil", subtitle: "Brinquedos, quarto e mais" },
];

export function FeaturedCategoryGrid({
  photos,
}: {
  photos: Record<string, { imageUrl: string; productName: string }>;
}) {
  return (
    <div className="dc-featured-cat-grid">
      {FEATURED_CATEGORIES.map((cat) => {
        const photo = photos[cat.slug];
        return (
          <a key={cat.slug} href={`/categoria/${cat.slug}`} className="dc-featured-cat-tile">
            <div className="dc-featured-cat-photo">
              {photo ? <img src={photo.imageUrl} alt="" loading="lazy" /> : null}
            </div>
            <div className="dc-featured-cat-text">
              <span className="dc-featured-cat-label">{cat.label}</span>
              <span className="dc-featured-cat-subtitle">{cat.subtitle}</span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
