import { SiteCoupon } from "../../lib/site/coupons";
import { estimatePriceWithCoupon, parseCouponRule, ruleMatchesProduct } from "../../lib/site/couponRules";
import { formatPriceBRL } from "../../lib/site/format";
import { CouponCard } from "./CouponCard";

/**
 * "Cupom que pode valer nessa compra" — página de produto. Cruza os cupons
 * ativos da MESMA loja da oferta em destaque com o nome do produto (ver
 * couponRules.ts): cupom com escopo de marca/linha só aparece quando a
 * marca está no nome do produto; cupom genérico da loja aparece com aviso.
 * Mostra o preço estimado depois do cupom quando a regra permite calcular
 * — sempre rotulado como estimativa, sem frete, sujeito às condições da
 * loja. Nunca afirma elegibilidade (não estamos no checkout da loja).
 */
export function pickCouponsForProduct(params: {
  coupons: SiteCoupon[];
  storeSlug: string;
  productName: string;
  price: number | null;
  limit?: number;
}): Array<{ coupon: SiteCoupon; match: "specific" | "generic"; estimated: number | null }> {
  const { coupons, storeSlug, productName, price, limit = 3 } = params;
  const out: Array<{ coupon: SiteCoupon; match: "specific" | "generic"; estimated: number | null }> = [];
  for (const coupon of coupons) {
    if (coupon.platform !== storeSlug) continue;
    const rule = parseCouponRule({ title: coupon.title, description: coupon.description, code: coupon.code });
    const match = ruleMatchesProduct(rule, productName);
    if (match === "no") continue;
    // Preço estimado só quando a marca/linha do cupom está no nome do
    // produto; cupom genérico ("produtos selecionados") mostra "pode
    // valer" sem número -- estimar ali seria prometer desconto que a loja
    // aplica só em parte do catálogo.
    const estimated = match === "specific" && price !== null ? estimatePriceWithCoupon(rule, price) : null;
    out.push({ coupon, match, estimated });
  }
  // Específico (marca no nome do produto) antes de genérico; entre iguais, maior economia.
  out.sort((a, b) => {
    if (a.match !== b.match) return a.match === "specific" ? -1 : 1;
    return (a.estimated ?? Infinity) - (b.estimated ?? Infinity);
  });
  const specific = out.filter((o) => o.match === "specific");
  const generic = out.filter((o) => o.match === "generic");
  // Sem cupom específico, no máximo 2 genéricos (senão toda página Kabum vira vitrine de cupom).
  return [...specific, ...generic].slice(0, specific.length > 0 ? limit : Math.min(limit, 2));
}

export function ProductCoupons({
  coupons,
  storeSlug,
  storeLabel,
  productName,
  price,
}: {
  coupons: SiteCoupon[];
  storeSlug: string;
  storeLabel: string;
  productName: string;
  price: number | null;
}) {
  const picks = pickCouponsForProduct({ coupons, storeSlug, productName, price });
  if (picks.length === 0) return null;
  const best = picks.find((p) => p.estimated !== null);

  return (
    <div className="dc-product-coupons">
      <p className="dc-compare-title">
        {picks.length === 1 ? "Cupom que pode valer nessa compra" : "Cupons que podem valer nessa compra"}
      </p>
      {best && price !== null && best.estimated !== null ? (
        <p className="dc-product-coupons-estimate">
          Preço estimado com cupom: <strong>{formatPriceBRL(best.estimated)}</strong>
          <span> (sem frete; confira as condições na {storeLabel})</span>
        </p>
      ) : (
        <p className="dc-product-coupons-estimate">
          Pode valer pra este produto, mas a {storeLabel} decide a elegibilidade no carrinho.
        </p>
      )}
      <div className="dc-coupon-grid">
        {picks.map(({ coupon }) => (
          <CouponCard key={coupon.id} coupon={coupon} />
        ))}
      </div>
      <a className="dc-coupon-see-all" href={`/cupom/${storeSlug}`}>
        Todos os cupons da {storeLabel} →
      </a>
    </div>
  );
}
