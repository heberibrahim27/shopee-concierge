import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CATEGORY_TILES } from "../../lib/site/categoryTiles";
import { CATEGORY_ICONS } from "../../components/site/icons";

export const metadata = {
  title: "Categorias",
  description: "Todas as categorias de produtos do Desconto Chegando.",
};

export default function CategoriasPage() {
  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Categorias</h1>
        </section>
        <section className="dc-section">
          <div className="dc-category-grid">
            {CATEGORY_TILES.filter((tile) => tile.slug !== "outros").map((tile) => {
              const href = tile.href ?? `/categoria/${tile.slug}`;
              const FallbackIcon = tile.image ? null : CATEGORY_ICONS[tile.slug];

              const inner = tile.image ? (
                <img
                  src={tile.image}
                  alt={tile.label}
                  className={`dc-cat-page-img${tile.available ? "" : " dc-cat-tile-dim"}`}
                />
              ) : (
                <span className={`dc-cat-tile-fallback${tile.available ? "" : " dc-cat-tile-dim"}`}>
                  {FallbackIcon ? <FallbackIcon size={26} /> : null}
                  <span>{tile.label}</span>
                </span>
              );

              if (tile.available) {
                return (
                  <a key={tile.slug} href={href} className="dc-cat-page-tile">
                    {inner}
                  </a>
                );
              }

              return (
                <span key={tile.slug} className="dc-cat-page-tile" title={`${tile.label} — em breve`}>
                  {inner}
                  <span className="dc-cat-tile-soon-badge">em breve</span>
                </span>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
