import { SiteProduct } from "../../lib/site/catalog";
import { formatPriceBRL, formatRating, formatSales } from "../../lib/site/format";

export function ProductCard({ product }: { product: SiteProduct }) {
  const price = formatPriceBRL(product.priceMin);
  const rating = formatRating(product.ratingStar);
  const sales = formatSales(product.sales);

  return (
    <a className="dc-card" href={`/produto/${product.slug}`}>
      <div className="dc-card-image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.productName} loading="lazy" />
        ) : null}
      </div>
      <div className="dc-card-body">
        {product.priceDiscountRate && product.priceDiscountRate >= 15 ? (
          <span className="dc-card-badge price">-{Math.round(product.priceDiscountRate)}%</span>
        ) : null}
        <p className="dc-card-title">{product.productName}</p>
        {price ? <div className="dc-card-price">{price}</div> : null}
        {rating || sales ? (
          <div className="dc-card-meta">
            {rating ? `⭐ ${rating}` : ""}
            {rating && sales ? " • " : ""}
            {sales ?? ""}
          </div>
        ) : null}
      </div>
    </a>
  );
}
