import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CATEGORY_TILES } from "../../lib/site/categoryTiles";

export const metadata = {
  title: "Categorias",
  description: "Todas as categorias de produtos do Desconto Chegando.",
};

/**
 * Achado real 2026-09-26 (Heber pediu o mesmo tratamento da home): usa
 * as mesmas fotos reais recortadas (fundo removido) de CATEGORY_TILES,
 * mesma classe CSS do ladrilho (.dc-featured-cat-tile), só que numa
 * grade que quebra linha (dc-cat-page-grid) em vez de rolagem -- aqui é
 * a listagem completa, scroll horizontal não faz sentido pra 18 itens.
 */
export default function CategoriasPage() {
  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Categorias</h1>
        </section>
        <section className="dc-section">
          <div className="dc-cat-page-grid">
            {CATEGORY_TILES.filter((tile) => tile.slug !== "outros").map((tile) => (
              <a key={tile.slug} href={`/categoria/${tile.slug}`} className="dc-featured-cat-tile">
                <div className="dc-featured-cat-photo">
                  {tile.photoUrl ? <img src={tile.photoUrl} alt={tile.label} loading="lazy" /> : null}
                </div>
                <div className="dc-featured-cat-text">
                  <span className="dc-featured-cat-label">{tile.label}</span>
                  <span className="dc-featured-cat-subtitle">{tile.subtitle}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
