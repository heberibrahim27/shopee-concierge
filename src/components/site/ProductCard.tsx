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

export function ProductCard({
  product,
  compact = false,
}: {
  product: SiteProduct;
  /** true no carrossel horizontal (achado real 2026-09-26, print do Heber:
   * nota/vendas + comparação de outras lojas variam muito de card pra
   * card, e numa única fileira flex a altura de TODOS os cards segue o
   * mais "cheio" -- deixava um respiro grande embaixo dos cards simples.
   * Compacto omite os blocos mais variáveis; comparação completa continua
   * na página do produto, não é informação perdida. */
  compact?: boolean;
}) {
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
        {!compact && (rating || sales) ? (
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
        {!compact && product.platform === "shopee" ? (
          <span className="dc-card-best-price">
            <AwardIcon size={12} />
            Menor preço encontrado
          </span>
        ) : !compact && product.highlightReason ? (
          <span className="dc-card-best-price">
            <AwardIcon size={12} />
            {product.highlightReason}
          </span>
        ) : null}
        <div className="dc-card-prices">
          {/* Preço riscado fora do modo compacto: em card estreito (carrossel)
              risco + preço não cabem numa linha só e quebram pra 2, um dos
              fatores reais de variação de altura -- o selo "Economize" logo
              abaixo já comunica o desconto sem precisar do risco. */}
          {!compact && originalPrice ? <span className="dc-card-price-original">{originalPrice}</span> : null}
          {price ? <div className="dc-card-price">{price}</div> : null}
        </div>
        {savings ? <span className="dc-card-savings">Economize {savings}</span> : null}
        {!compact && product.otherOffers && product.otherOffers.length > 0 ? (
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
