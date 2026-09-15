import { SiteCoupon } from "../../lib/site/coupons";
import { CouponCard } from "./CouponCard";

/**
 * Bloco "Cupons em destaque" — só aparece quando existe cupom/promoção
 * real (ver src/lib/site/coupons.ts). Nunca inventa cupom nem mostra
 * desconto genérico sem fonte.
 */
export function CouponSection({ coupons, showViewAll }: { coupons: SiteCoupon[]; showViewAll?: boolean }) {
  if (coupons.length === 0) return null;

  return (
    <section className="dc-section dc-coupon-section">
      <div className="dc-coupon-section-head">
        <h2 className="dc-icon-inline">🏷️ Cupons em destaque</h2>
        {showViewAll ? (
          <a href="/cupons" className="dc-coupon-see-all">
            Ver todos
          </a>
        ) : null}
      </div>
      <div className="dc-coupon-grid">
        {coupons.map((coupon) => (
          <CouponCard key={coupon.id} coupon={coupon} />
        ))}
      </div>
    </section>
  );
}
