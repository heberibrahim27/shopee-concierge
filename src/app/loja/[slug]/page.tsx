import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { Breadcrumb } from "../../../components/site/Breadcrumb";
import { CouponSection } from "../../../components/site/CouponSection";
import { ProductGrid } from "../../../components/site/ProductGrid";
import { getPlatformInfo } from "../../../lib/site/platforms";
import {
  getCachedStoreDirectory,
  getCachedStoreProducts,
  getStore,
  getStoreCoupons,
  isStorePageIndexable,
} from "../../../lib/site/stores";

/**
 * Página de loja ("ofertas kabum") — as ofertas mais recentes de uma loja
 * no comparador + os cupons ativos dela. Só pede indexação quando tem
 * catálogo de verdade (STORE_PAGE_MIN_PRODUCTS_TO_INDEX); loja que só
 * tem cupom fica noindex,follow e aponta pra /cupom/[loja].
 */
export async function generateStaticParams() {
  const directory = await getCachedStoreDirectory();
  return directory.filter((store) => store.productCount > 0).map((store) => ({ slug: store.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const store = await getStore(params.slug);
  if (!store) return {};
  return {
    title: `Ofertas ${store.label}`,
    description:
      store.productCount > 0
        ? `${store.productCount.toLocaleString("pt-BR")} produtos da ${store.label} com preço comparado a outras lojas pelo Desconto Chegando.`
        : `Cupons e promoções da ${store.label} verificados pelo Desconto Chegando.`,
    alternates: { canonical: `/loja/${store.slug}` },
    robots: isStorePageIndexable(store) ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  const store = await getStore(params.slug);
  if (!store) notFound();

  const [products, coupons] = await Promise.all([
    store.productCount > 0 ? getCachedStoreProducts(store.slug) : Promise.resolve([]),
    getStoreCoupons(store.slug),
  ]);
  if (products.length === 0 && coupons.length === 0) notFound();

  const info = getPlatformInfo(store.slug);
  const comparedCount = products.filter((p) => p.otherOffers && p.otherOffers.length > 0).length;

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb
            items={[
              { label: "Início", href: "/" },
              { label: "Lojas parceiras", href: "/lojas-parceiras" },
              { label: store.label },
            ]}
          />
          <h1 className="dc-icon-inline">
            <span className="dc-partner-badge" style={{ background: info.color, color: info.textColor }}>
              {store.label}
            </span>
            Ofertas {store.label}
          </h1>
          <p style={{ color: "var(--dc-text-muted)", fontSize: 14, marginTop: -8, marginBottom: 12 }}>
            {store.productCount > 0
              ? `${store.productCount.toLocaleString("pt-BR")} produtos da ${store.label} no comparador.`
              : `Cupons e promoções da ${store.label}.`}
            {comparedCount > 0
              ? ` Nesta página, ${comparedCount} ${comparedCount === 1 ? "já tem" : "já têm"} o mesmo produto comparado em outra loja — o card mostra onde está mais barato.`
              : ""}
          </p>
        </section>

        {coupons.length > 0 ? (
          <>
            <CouponSection coupons={coupons.slice(0, 8)} />
            <section className="dc-section" style={{ paddingTop: 0 }}>
              <a className="dc-coupon-see-all" href={`/cupom/${store.slug}`}>
                Todos os cupons da {store.label} ({coupons.length}) →
              </a>
            </section>
          </>
        ) : null}

        {products.length > 0 ? (
          <section className="dc-section">
            <h2>Últimas ofertas</h2>
            <ProductGrid products={products} emptyMessage="" />
          </section>
        ) : null}

        <section className="dc-section dc-guide">
          <h2>Como a {store.label} entra no placar</h2>
          <p className="dc-guide-compare-note">
            Em toda página de produto, a oferta em destaque é sempre a de menor preço real entre as lojas que
            acompanhamos — nunca uma loja &quot;favorita&quot;. Compra, entrega, troca e garantia são direto com a{" "}
            {store.label}. Quando você compra por um link nosso, podemos receber uma comissão da loja, sem custo a
            mais pra você e sem mudar a ordem dos resultados.{" "}
            <a href="/lojas-parceiras">Veja todas as lojas que comparamos</a>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
