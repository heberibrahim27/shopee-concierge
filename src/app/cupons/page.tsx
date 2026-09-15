import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CouponCard } from "../../components/site/CouponCard";
import { getCachedCoupons } from "../../lib/site/coupons";

export const metadata = { title: "Cupons" };

export default async function CuponsPage() {
  const coupons = await getCachedCoupons();

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Cupons e promoções</h1>
        </section>

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
