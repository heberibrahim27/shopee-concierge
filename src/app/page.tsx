import { Header } from "../components/site/Header";
import { Footer } from "../components/site/Footer";
import { SearchBox } from "../components/site/SearchBox";
import { CategoryChips } from "../components/site/CategoryChips";
import { ProductGrid } from "../components/site/ProductGrid";
import { getCachedHomeOffers } from "../lib/site/catalog";

export default async function HomePage() {
  const offers = await getCachedHomeOffers();

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <span className="dc-eyebrow">Comparador de preços · Shopee</span>
          <h1>Ache o produto certo pelo melhor custo-benefício.</h1>
          <SearchBox />
        </section>

        <section className="dc-section">
          <h2>Categorias</h2>
          <CategoryChips />
        </section>

        <section className="dc-section">
          <h2>🔥 Ofertas de hoje</h2>
          <ProductGrid
            products={offers}
            emptyMessage="Ainda não temos ofertas publicadas aqui — em breve. Enquanto isso, manda uma foto no WhatsApp que a gente procura na hora."
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
