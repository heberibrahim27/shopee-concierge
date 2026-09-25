import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { ProductGrid } from "../../components/site/ProductGrid";
import { LiveProductCard } from "../../components/site/LiveProductCard";
import { LomadeeLiveCard } from "../../components/site/LomadeeLiveCard";
import { SortBar } from "../../components/site/SortBar";
import { searchCatalog } from "../../lib/site/catalogSearch";
import { searchShopeeLive } from "../../lib/site/liveSearch";
import { searchLomadeeLive } from "../../lib/site/lomadeeSearch";
import { getCachedPopularSearches } from "../../lib/site/popularSearches";
import { CouponCard } from "../../components/site/CouponCard";
import { getCachedAllActiveCoupons } from "../../lib/site/coupons";
import { findStoreInTerm, hasCouponIntent } from "../../lib/site/couponIntent";
import { getCachedStoreDirectory, storeSlugForCoupon } from "../../lib/site/stores";
import { parseSortOption } from "../../lib/site/sort";
import { logSearchEvent } from "../../lib/site/searchLog";

export const metadata = { title: "Busca" };

/**
 * Quem pesquisa já quer comprar — por isso a busca não fica só no
 * catálogo curado (site_catalog): se faltar aqui, complementa com busca
 * ao vivo na Shopee (ver liveSearch.ts) e nas lojas da Lomadee (ver
 * lomadeeSearch.ts) pra não perder a venda. O catálogo curado continua
 * vindo primeiro/em destaque (agora com full text do Postgres, ver
 * catalogSearch.ts); o resultado ao vivo aparece depois, marcado como
 * tal (não passou pelo Growth OS).
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const term = searchParams.q ?? "";
  const hasTerm = term.trim().length >= 2;
  const sort = parseSortOption(searchParams.sort);

  const [results, liveResults, lomadeeResults] = hasTerm
    ? await Promise.all([searchCatalog(term, sort), searchShopeeLive(term, sort), searchLomadeeLive(term)])
    : [[], [], []];
  // Chips de buscas populares só quando não há termo (ou nada foi achado):
  // termos reais de outros visitantes, ver lib/site/popularSearches.ts.
  const popular = !hasTerm || (results.length === 0 && liveResults.length === 0 && lomadeeResults.length === 0)
    ? await getCachedPopularSearches()
    : [];

  const nothingFound =
    hasTerm && results.length === 0 && liveResults.length === 0 && lomadeeResults.length === 0;

  // Intenção de cupom ("cupom", "cupom kabum"): a busca é de produto, e
  // "cupom" casava só com impressora de cupom (achado do Heber, 26/09).
  // Mostra os cupons ANTES dos produtos; se o termo cita uma loja com
  // cupom ativo, só os dela e o atalho pra /cupom/[loja].
  const couponIntent = hasTerm && hasCouponIntent(term);
  const [directory, allCoupons] = couponIntent
    ? await Promise.all([getCachedStoreDirectory(), getCachedAllActiveCoupons()])
    : [[], []];
  const intentStore = couponIntent ? findStoreInTerm(term, directory) : null;
  const intentCoupons = !couponIntent
    ? []
    : intentStore
      ? allCoupons.filter((c) => storeSlugForCoupon(c) === intentStore.slug)
      : [...allCoupons].sort((a, b) => Number(Boolean(b.code)) - Number(Boolean(a.code))).slice(0, 6);
  const storesWithCoupons = directory.filter((s) => s.couponCount > 0);

  if (hasTerm) {
    await logSearchEvent(term, results.length + liveResults.length + lomadeeResults.length);
  }

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>{term ? `Resultados pra "${term}"` : "Busca"}</h1>
        </section>

        {couponIntent ? (
          <section className="dc-section">
            <h2 className="dc-icon-inline">
              🏷️ {intentStore ? `Cupons ${intentStore.label}` : "Cupons ativos"}
            </h2>
            {intentCoupons.length > 0 ? (
              <div className="dc-coupon-grid">
                {intentCoupons.map((coupon) => (
                  <CouponCard key={coupon.id} coupon={coupon} />
                ))}
              </div>
            ) : (
              <p className="dc-empty">
                {intentStore
                  ? `Nenhum cupom ativo da ${intentStore.label} agora.`
                  : "Nenhum cupom ativo agora."}
              </p>
            )}
            <p style={{ marginTop: 12 }}>
              <a className="dc-coupon-see-all" href={intentStore ? `/cupom/${intentStore.slug}` : "/cupons"}>
                {intentStore ? `Todos os cupons da ${intentStore.label} →` : "Ver todos os cupons →"}
              </a>
            </p>
            {!intentStore && storesWithCoupons.length > 0 ? (
              <div className="dc-price-filter-row" style={{ marginTop: 10 }}>
                {storesWithCoupons.map((store) => (
                  <a key={store.slug} href={`/cupom/${store.slug}`} className="dc-price-filter-pill">
                    {store.label} ({store.couponCount})
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasTerm && !nothingFound ? <SortBar term={term} active={sort} /> : null}

        {couponIntent && results.length > 0 ? (
          <h2 className="dc-section" style={{ paddingBottom: 0 }}>Produtos com esse termo</h2>
        ) : null}

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

        {lomadeeResults.length > 0 ? (
          <section className="dc-section">
            <h2>Em outras lojas parceiras agora</h2>
            <div className="dc-grid">
              {lomadeeResults.map((product) => (
                <LomadeeLiveCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {(nothingFound && intentCoupons.length === 0) || !hasTerm ? (
          <section className="dc-section">
            <p className="dc-empty">
              {hasTerm
                ? "Não achamos nada com esse termo — manda uma foto no WhatsApp que a gente procura na hora."
                : "Digite o que você procura, ou manda uma foto no WhatsApp que a gente procura na hora."}
            </p>
            {popular.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--dc-text-muted)", margin: "0 0 8px" }}>
                  O que outras pessoas buscaram
                </p>
                <div className="dc-price-filter-row">
                  {popular.map((t) => (
                    <a key={t} href={`/busca?q=${encodeURIComponent(t)}`} className="dc-price-filter-pill">
                      {t}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
