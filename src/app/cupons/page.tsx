import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CouponCard } from "../../components/site/CouponCard";
import { getCachedCoupons } from "../../lib/site/coupons";
import { getCachedStoreDirectory } from "../../lib/site/stores";

export function generateMetadata() {
  return {
    title: "Cupons de desconto verificados",
    description:
      "Cupons e promoções ativas de Kabum, Olympikus, Nike e lojas parceiras, verificados todo dia pelo Desconto Chegando.",
    alternates: { canonical: "/cupons" },
    robots: { index: true, follow: true },
  };
}

export default async function CuponsPage() {
  const [coupons, directory] = await Promise.all([getCachedCoupons(), getCachedStoreDirectory()]);
  const storesWithCoupons = directory.filter((store) => store.couponCount > 0);

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Cupons e promoções</h1>
        </section>

        {storesWithCoupons.length > 0 ? (
          <section className="dc-section" style={{ paddingBlock: "0 4px" }}>
            <div className="dc-price-filter-row">
              {storesWithCoupons.map((store) => (
                <a key={store.slug} href={`/cupom/${store.slug}`} className="dc-price-filter-pill">
                  {store.label} ({store.couponCount})
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {coupons.length > 0 ? (
          <section className="dc-section dc-coupon-grid">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </section>
        ) : (
          <section className="dc-section">
            <p className="dc-empty">
              Nenhum cupom ativo agora — manda uma foto no WhatsApp que a gente procura o melhor
              preço na hora.
            </p>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
