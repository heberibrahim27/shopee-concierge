import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { ProductGrid } from "../../components/site/ProductGrid";
import { searchProducts } from "../../lib/site/catalog";

export const metadata = { title: "Busca" };

/**
 * Busca sobre o catálogo JÁ PUBLICADO (site_catalog), nunca ao vivo na
 * Shopee — ver ARQUITETURA-SITE.md. Se não achar nada aqui, o CTA de
 * WhatsApp (no Footer) cobre a busca "de verdade" via foto/IA.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const term = searchParams.q ?? "";
  const results = term.trim().length >= 2 ? await searchProducts(term) : [];

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>{term ? `Resultados pra "${term}"` : "Busca"}</h1>
        </section>
        <section className="dc-section">
          <ProductGrid
            products={results}
            emptyMessage="Não achamos nada com esse termo no nosso catálogo ainda — manda uma foto no WhatsApp que a gente procura na hora."
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
