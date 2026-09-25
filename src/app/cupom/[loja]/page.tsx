import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { Breadcrumb } from "../../../components/site/Breadcrumb";
import { CouponCard } from "../../../components/site/CouponCard";
import { ProductGrid } from "../../../components/site/ProductGrid";
import {
  currentMonthLabel,
  getCachedStoreDirectory,
  getCachedStoreProducts,
  getStore,
  getStoreCoupons,
  isCouponPageIndexable,
} from "../../../lib/site/stores";

/**
 * Página de cupom por loja ("cupom kabum") — padrão de SEO de cuponeiro
 * real (Cuponomia). Só existe pra loja que tem cupom ativo de verdade
 * (generateStaticParams filtra), nunca mostra cupom inventado nem
 * "desconto genérico", e só pede indexação a partir de
 * COUPON_PAGE_MIN_COUPONS_TO_INDEX cupons ativos (página com 1 cupom é
 * conteúdo fino).
 */
export async function generateStaticParams() {
  const directory = await getCachedStoreDirectory();
  return directory.filter((store) => store.couponCount > 0).map((store) => ({ loja: store.slug }));
}

export async function generateMetadata({ params }: { params: { loja: string } }) {
  const store = await getStore(params.loja);
  if (!store || store.couponCount === 0) return {};
  const month = currentMonthLabel();
  return {
    title: `Cupom ${store.label} ${month}`,
    description: `${store.couponCount} ${store.couponCount === 1 ? "cupom ativo" : "cupons ativos"} da ${store.label} em ${month}, verificados todo dia pelo Desconto Chegando. Sem cupom vencido, sem código inventado.`,
    alternates: { canonical: `/cupom/${store.slug}` },
    robots: isCouponPageIndexable(store) ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function StoreCouponPage({ params }: { params: { loja: string } }) {
  const store = await getStore(params.loja);
  if (!store) notFound();

  const [coupons, products, directory] = await Promise.all([
    getStoreCoupons(store.slug),
    store.productCount > 0 ? getCachedStoreProducts(store.slug) : Promise.resolve([]),
    getCachedStoreDirectory(),
  ]);
  if (coupons.length === 0) notFound();

  const otherStoresWithCoupons = directory.filter((s) => s.slug !== store.slug && s.couponCount > 0).slice(0, 12);
  const withCode = coupons.filter((c) => c.code).length;

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb
            items={[
              { label: "Início", href: "/" },
              { label: "Cupons", href: "/cupons" },
              { label: store.label },
            ]}
          />
          <h1>Cupom {store.label}</h1>
          <p style={{ color: "var(--dc-text-muted)", fontSize: 14, marginTop: -8, marginBottom: 12 }}>
            {coupons.length} {coupons.length === 1 ? "cupom ativo" : "cupons ativos"} da {store.label} em{" "}
            {currentMonthLabel()}
            {withCode > 0 ? `, ${withCode} com código pra digitar no carrinho` : ", aplicados direto pelo link"}.
            A lista é verificada todo dia: cupom vencido sai sozinho.
          </p>
        </section>

        <section className="dc-section dc-coupon-grid">
          {coupons.map((coupon) => (
            <CouponCard key={coupon.id} coupon={coupon} />
          ))}
        </section>

        <section className="dc-section dc-guide">
          <h2>Como usar o cupom na {store.label}</h2>
          <ol>
            <li>Clique em &quot;Usar cupom&quot; (ou &quot;Aproveitar&quot;) — o link já leva pra loja com a promoção ativa.</li>
            <li>Se o cupom tiver código, copie e cole no campo de cupom do carrinho antes de fechar o pedido.</li>
            <li>Confira se o desconto apareceu no total. Cupom com regra (valor mínimo, categoria) mostra a condição na própria loja.</li>
          </ol>
          <p className="dc-guide-compare-note">
            Compra, entrega, troca e garantia são sempre direto com a {store.label}. Quando você compra por um link nosso, podemos receber uma comissão da loja — isso não muda o preço nem qual cupom aparece primeiro.
          </p>
        </section>

        {products.length > 0 ? (
          <section className="dc-section">
            <h2>Ofertas da {store.label} no comparador</h2>
            <ProductGrid products={products.slice(0, 12)} emptyMessage="" />
            <p style={{ marginTop: 12 }}>
              <a className="dc-coupon-see-all" href={`/loja/${store.slug}`}>
                Ver todas as ofertas da {store.label} →
              </a>
            </p>
          </section>
        ) : null}

        {otherStoresWithCoupons.length > 0 ? (
          <section className="dc-section">
            <h2>Cupons de outras lojas</h2>
            <div className="dc-price-filter-row">
              {otherStoresWithCoupons.map((s) => (
                <a key={s.slug} href={`/cupom/${s.slug}`} className="dc-price-filter-pill">
                  {s.label} ({s.couponCount})
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
