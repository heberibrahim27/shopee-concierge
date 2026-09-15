import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { ProductGrid } from "../../components/site/ProductGrid";
import { LiveProductCard } from "../../components/site/LiveProductCard";
import { SortBar } from "../../components/site/SortBar";
import { searchProducts } from "../../lib/site/catalog";
import { searchShopeeLive } from "../../lib/site/liveSearch";
import { parseSortOption } from "../../lib/site/sort";
import { logSearchEvent } from "../../lib/site/searchLog";

export const metadata = { title: "Busca" };

/**
 * Quem pesquisa já quer comprar — por isso a busca não fica só no
 * catálogo curado (site_catalog): se faltar aqui, complementa com busca
 * ao vivo na Shopee (ver liveSearch.ts) pra não perder a venda. O
 * catálogo curado continua vindo primeiro/em destaque; o resultado ao
 * vivo aparece depois, marcado como tal (não passou pelo Growth OS).
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const term = searchParams.q ?? "";
  const hasTerm = term.trim().length >= 2;
  const sort = parseSortOption(searchParams.sort);

  const [results, liveResults] = hasTerm
    ? await Promise.all([searchProducts(term, sort), searchShopeeLive(term, sort)])
    : [[], []];

  const nothingFound = hasTerm && results.length === 0 && liveResults.length === 0;

  if (hasTerm) {
    await logSearchEvent(term, results.length + liveResults.length);
  }

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>{term ? `Resultados pra "${term}"` : "Busca"}</h1>
        </section>

        {hasTerm && !nothingFound ? <SortBar term={term} active={sort} /> : null}

        {results.length > 0 ? (
          <section className="dc-section">
            <ProductGrid products={results} emptyMessage="" />
          </section>
        ) : null}

        {liveResults.length > 0 ? (
          <section className="dc-section">
            <h2>{results.length > 0 ? "Mais opções direto da Shopee" : "Direto da Shopee agora"}</h2>
            <div className="dc-grid">
              {liveResults.map((product) => (
                <LiveProductCard key={product.itemId} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {nothingFound || !hasTerm ? (
          <section className="dc-section">
            <p className="dc-empty">
              Não achamos nada com esse termo — manda uma foto no WhatsApp que a gente procura na
              hora.
            </p>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
