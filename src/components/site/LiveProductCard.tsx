import { LiveProduct } from "../../lib/site/liveSearch";
import {
  formatOriginalPriceBRL,
  formatPriceBRL,
  formatRating,
  formatSales,
  formatSavingsBRL,
} from "../../lib/site/format";
import { CartIcon, StarIcon } from "./icons";
import { PLATFORM_INFO } from "../../lib/site/platforms";

/**
 * Card de resultado puxado ao vivo da Shopee (não passou pela curadoria
 * do Growth OS) — por isso nunca usa o selo "Menor preço encontrado" nem
 * o favorito (produto sem identidade estável no nosso banco), e o link
 * vai direto pra Shopee em vez de `/produto/[slug]`.
 */
export function LiveProductCard({ product }: { product: LiveProduct }) {
  const price = formatPriceBRL(product.priceMin);
  const originalPrice = formatOriginalPriceBRL(product.priceMin, product.priceDiscountRate);
  const savings = formatSavingsBRL(product.priceMin, product.priceDiscountRate);
  const rating = formatRating(product.ratingStar);
  const sales = formatSales(product.sales);
  const shopee = PLATFORM_INFO.shopee;

  return (
    <a className="dc-card" href={product.offerLink} target="_blank" rel="noopener noreferrer sponsored">
      <div className="dc-card-image">
        {product.priceDiscountRate && product.priceDiscountRate >= 15 ? (
          <span className="dc-card-badge price">-{Math.round(product.priceDiscountRate)}%</span>
        ) : null}
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.productName} loading="lazy" />
        ) : null}
      </div>
      <div className="dc-card-body">
        <p className="dc-card-title">{product.productName}</p>
        {rating || sales ? (
          <div className="dc-card-meta dc-icon-inline">
            {rating ? (
              <span className="dc-icon-inline">
                <StarIcon size={12} style={{ color: "var(--dc-green-deep)" }} />
                {rating}
              </span>
            ) : null}
            {rating && sales ? " • " : ""}
            {sales ?? ""}
          </div>
        ) : null}
        <span className="dc-card-live-badge" style={{ color: shopee.color }}>
          Direto da {shopee.label} agora
        </span>
        <div className="dc-card-prices">
          {originalPrice ? <span className="dc-card-price-original">{originalPrice}</span> : null}
          {price ? <div className="dc-card-price">{price}</div> : null}
        </div>
        {savings ? <span className="dc-card-savings">Economize {savings}</span> : null}
        <span className="dc-card-cta">
          <CartIcon size={14} />
          Ver na {shopee.label}
        </span>
      </div>
    </a>
  );
}
