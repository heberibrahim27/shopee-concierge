import { Header } from "../components/site/Header";
import { Footer } from "../components/site/Footer";
import { CategoryGrid } from "../components/site/CategoryGrid";
import { PromoBanner } from "../components/site/PromoBanner";
import { ProductGrid } from "../components/site/ProductGrid";
import { CouponSection } from "../components/site/CouponSection";
import { getCachedHomeOffers } from "../lib/site/catalog";
import { getCachedCoupons } from "../lib/site/coupons";

export default async function HomePage() {
  const [offers, coupons] = await Promise.all([getCachedHomeOffers(), getCachedCoupons()]);

  return (
    <>
      <Header />
      <main className="dc-shell">
        {/* H1 só pra SEO/acessibilidade — sem espaço visual entre o
            cabeçalho e o banner, como pedido. */}
        <h1 className="dc-sr-only">
          Desconto Chegando — comparador de preços da Shopee: ache o produto certo pelo melhor
          custo-benefício.
        </h1>

        <section className="dc-section" style={{ paddingBlock: "10px 4px" }}>
          <PromoBanner />
        </section>

        <CouponSection coupons={coupons.slice(0, 4)} showViewAll={coupons.length > 4} />

        <section className="dc-section" style={{ paddingBlock: "6px 4px" }}>
          <CategoryGrid />
        </section>

        <section className="dc-section">
          <h2 className="dc-icon-inline">
            <img src="/OFERTAS-ICON.png" alt="" aria-hidden="true" className="dc-offers-icon" />
            Ofertas de hoje
          </h2>
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
