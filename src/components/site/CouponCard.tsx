import { SiteCoupon } from "../../lib/site/coupons";
import { getPlatformInfo } from "../../lib/site/platforms";
import { AFFILIATE_LINK_REL } from "../../lib/site/affiliateLink";
import { TrackedOfferLink } from "./TrackedOfferLink";

function formatEndsAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return `Válido até ${date.toLocaleDateString("pt-BR")}`;
}

export function CouponCard({ coupon }: { coupon: SiteCoupon }) {
  // "lomadee" é o valor genérico gravado quando a marca não foi resolvida
  // na ingestão — nesse caso o nome do anunciante é o rótulo certo, não
  // o nome da rede de afiliados.
  const info = coupon.platform && coupon.platform !== "lomadee" ? getPlatformInfo(coupon.platform) : null;
  const endsLabel = formatEndsAt(coupon.endsAt);

  return (
    <div className="dc-coupon-card">
      {info ? (
        <span className="dc-coupon-badge" style={{ background: info.color, color: info.textColor }}>
          {info.label}
        </span>
      ) : (
        <span className="dc-coupon-badge">{coupon.advertiserName}</span>
      )}
      <p className="dc-coupon-title">{coupon.title}</p>
      {coupon.code ? (
        <div className="dc-coupon-code">
          <span>Cupom</span>
          <strong>{coupon.code}</strong>
        </div>
      ) : null}
      {endsLabel ? <p className="dc-coupon-ends">{endsLabel}</p> : null}
      <TrackedOfferLink
        className="dc-coupon-cta"
        platform={coupon.platform ?? "awin"}
        productName={coupon.title}
        source="cupom"
        href={coupon.urlTracking}
        target="_blank"
        rel={AFFILIATE_LINK_REL}
      >
        {coupon.code ? "Usar cupom" : "Aproveitar"}
      </TrackedOfferLink>
    </div>
  );
}
