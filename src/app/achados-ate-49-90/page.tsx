import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CategoryGrid } from "../../components/site/CategoryGrid";
import { ProductGrid } from "../../components/site/ProductGrid";
import { Breadcrumb } from "../../components/site/Breadcrumb";
import { getCachedCheapFinds, CHEAP_FINDS_MAX_PRICE } from "../../lib/site/catalog";

/**
 * Página dedicada de "Achados até R$49,90" (Heber, 2026-09-26: "vamos
 * transformar em categoria?") -- mesmo caso do /mais-vendidos: cruza
 * todas as categorias por preço real (não desconto percentual inflado),
 * então fica fora de `/categoria/[slug]` e vira rota própria.
 */
export const metadata = {
  title: `Achados até R$${CHEAP_FINDS_MAX_PRICE.toFixed(2).replace(".", ",")}`,
  description: "Achadinhos com preço baixo de verdade (não só desconto percentual em cima de preço inflado), de todas as categorias.",
  alternates: { canonical: "/achados-ate-49-90" },
};

export default async function AchadosBaratosPage() {
  const products = await getCachedCheapFinds(48);

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Achados até R$49,90" }]} />
          <h1>💸 Achados até R$49,90</h1>
        </section>
        <section className="dc-section">
          <CategoryGrid activeSlug="achados-ate-49-90" />
        </section>
        <section className="dc-section">
          <ProductGrid
            products={products}
            emptyMessage="Ainda não temos achados nessa faixa de preço — em breve."
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
