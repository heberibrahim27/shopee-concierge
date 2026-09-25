import { Header } from "../components/site/Header";
import { Footer } from "../components/site/Footer";
import { FeaturedCategoryGrid } from "../components/site/FeaturedCategoryGrid";
import { ProductGrid } from "../components/site/ProductGrid";
import { CouponSection } from "../components/site/CouponSection";
import { getCachedTodayPosts } from "../lib/site/catalog";
import { getCachedCoupons } from "../lib/site/coupons";
import { GUIDES } from "../lib/site/guides";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Home = o que saiu no Instagram nas últimas 24h (pedido do Heber:
  // "sempre atualizando" é o próprio diferencial do site agora que a
  // automação posta 20x/dia). Produtos publicados fora desse fluxo (ex:
  // Awin/Nike/Olympikus) continuam visíveis nas categorias, só não
  // aparecem mais aqui.
  const [offers, coupons] = await Promise.all([getCachedTodayPosts(), getCachedCoupons()]);

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

        {/* Reordenado 2026-09-26 (mockup novo do Heber: categoria vem
            ANTES dos produtos, "a categoria fica em cima dos produtos").
            Reordenação anterior (2026-09-25, crítica do ChatGPT) já tinha
            posto produto antes de banner/cupom -- essa parte continua
            valendo, só a posição relativa categoria x produto mudou. */}
        <section className="dc-section" style={{ paddingBlock: "10px 4px" }}>
          <div className="dc-coupon-section-head">
            <h2 className="dc-icon-inline">⚡ Explore por categoria</h2>
            <a className="dc-coupon-see-all" href="/categorias">
              Ver todas →
            </a>
          </div>
          <FeaturedCategoryGrid />
        </section>

        <section className="dc-section" style={{ paddingBlock: "6px 4px" }}>
          <h2 className="dc-icon-inline">
            <img src="/OFERTAS-ICON.png" alt="" aria-hidden="true" className="dc-offers-icon" />
            Ofertas de hoje
          </h2>
          <ProductGrid
            products={offers}
            emptyMessage="Ainda não temos ofertas publicadas aqui — em breve. Enquanto isso, manda uma foto no WhatsApp que a gente procura na hora."
            layout="scroll"
          />
        </section>

        {/* Achado real (2026-09-25): Heber não viu os guias porque não
            tinham NENHUM ponto de entrada visível na home -- só rodapé
            (texto pequeno) e fim de 2 páginas de categoria. */}
        <section className="dc-section">
          <h2 className="dc-icon-inline">📖 Guias de compra</h2>
          <div className="dc-guide-list">
            {GUIDES.map((guide) => (
              <a key={guide.slug} className="dc-guide-list-item" href={`/guia/${guide.slug}`}>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
              </a>
            ))}
          </div>
        </section>

        <CouponSection coupons={coupons.slice(0, 4)} showViewAll={coupons.length > 4} />
      </main>
      <Footer />
    </>
  );
}
