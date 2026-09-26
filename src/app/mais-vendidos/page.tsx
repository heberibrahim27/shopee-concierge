import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CategoryGrid } from "../../components/site/CategoryGrid";
import { ProductGrid } from "../../components/site/ProductGrid";
import { Breadcrumb } from "../../components/site/Breadcrumb";
import { getCachedBestSellers } from "../../lib/site/catalog";

/**
 * Página dedicada de "Mais Vendidos" (Heber, 2026-09-26: "'Mais vendidos'
 * não é uma categoria ainda... vamos transformar em categoria?") -- até
 * aqui só existia como seção da home (24 itens, sem página própria pra
 * navegar/indexar). Cruza TODAS as categorias por venda real, por isso
 * fica fora de `/categoria/[slug]` (que filtra por `category_slug`) e
 * vira rota própria, linkada pelo ladrilho "Mais Vendidos" em
 * CATEGORY_TILES (mesmo grid que toda categoria normal).
 */
export const metadata = {
  title: "Mais Vendidos",
  description: "Os produtos mais vendidos de verdade (vendas reais da Shopee/Awin), de todas as categorias, escolhidos pelo Desconto Chegando.",
  alternates: { canonical: "/mais-vendidos" },
};

export default async function MaisVendidosPage() {
  const products = await getCachedBestSellers(48);

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Mais Vendidos" }]} />
          <h1>🏆 Mais Vendidos</h1>
        </section>
        <section className="dc-section">
          <CategoryGrid activeSlug="mais-vendidos" />
        </section>
        <section className="dc-section">
          <ProductGrid
            products={products}
            emptyMessage="Ainda não temos dado de vendas suficiente aqui — em breve."
          />
        </section>
        <a className="dc-back-link" href="/">
          ← Voltar pra Home
        </a>
      </main>
      <Footer />
    </>
  );
}
