import { SiteProduct } from "../../lib/site/catalog";
import {
  formatOriginalPriceBRL,
  formatPriceBRL,
  formatRating,
  formatSales,
  formatSavingsBRL,
} from "../../lib/site/format";
import { AwardIcon, CartIcon, StarIcon } from "./icons";
import { FavoriteButton } from "./FavoriteButton";
import { getPlatformInfo } from "../../lib/site/platforms";

export function ProductCard({ product }: { product: SiteProduct }) {
  const price = formatPriceBRL(product.priceMin);
  const originalPrice = formatOriginalPriceBRL(product.priceMin, product.priceDiscountRate);
  const savings = formatSavingsBRL(product.priceMin, product.priceDiscountRate);
  const rating = formatRating(product.ratingStar);
  const sales = formatSales(product.sales);

  return (
    <a className="dc-card" href={`/produto/${product.slug}`}>
      <div className="dc-card-image">
        {product.priceDiscountRate && product.priceDiscountRate >= 15 ? (
          <span className="dc-card-badge price">-{Math.round(product.priceDiscountRate)}%</span>
        ) : null}
        <FavoriteButton
          product={{
            slug: product.slug,
            productName: product.productName,
            imageUrl: product.imageUrl,
            priceMin: product.priceMin,
            priceDiscountRate: product.priceDiscountRate,
            ratingStar: product.ratingStar,
            sales: product.sales,
          }}
        />
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
        {product.platform === "shopee" ? (
          <span className="dc-card-best-price">
            <AwardIcon size={12} />
            Menor preço encontrado
          </span>
        ) : product.highlightReason ? (
          <span className="dc-card-best-price">
            <AwardIcon size={12} />
            {product.highlightReason}
          </span>
        ) : null}
        <div className="dc-card-prices">
          {originalPrice ? <span className="dc-card-price-original">{originalPrice}</span> : null}
          {price ? <div className="dc-card-price">{price}</div> : null}
        </div>
        {savings ? <span className="dc-card-savings">Economize {savings}</span> : null}
        {product.otherOffers && product.otherOffers.length > 0 ? (
          <div className="dc-card-other-offers">
            {product.otherOffers.map((offer) => {
              const info = getPlatformInfo(offer.platform);
              const offerPrice = formatPriceBRL(offer.priceMin);
              if (!offerPrice) return null;
              return (
                <span key={offer.platform} className="dc-card-other-offer">
                  <span
                    className="dc-card-other-offer-badge"
                    style={{ background: info.color, color: info.textColor }}
                  >
                    {info.label}
                  </span>
                  {offerPrice}
                </span>
              );
            })}
          </div>
        ) : null}
        <span className="dc-card-cta">
          <CartIcon size={14} />
          Ver melhor oferta
        </span>
      </div>
    </a>
  );
}
