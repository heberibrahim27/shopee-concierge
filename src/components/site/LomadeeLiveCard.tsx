import { LomadeeLiveProduct } from "../../lib/site/lomadeeSearch";
import { formatPriceBRL } from "../../lib/site/format";
import { getPlatformInfo } from "../../lib/site/platforms";
import { CartIcon } from "./icons";

/**
 * Card de resultado puxado ao vivo da Lomadee (não passou pela curadoria
 * do Growth OS) — mesmo espírito do LiveProductCard da Shopee: sem selo
 * de menor preço, sem favorito, e o link não vai pra `/produto/[slug]`.
 *
 * O clique vai por `/go/lomadee`, que gera o link de afiliado NA HORA
 * (1 chamada por clique) e registra em click_events do lado do servidor
 * — por isso é um <a> simples, sem o beacon do TrackedOfferLink (senão
 * o mesmo clique contaria duas vezes).
 */
export function LomadeeLiveCard({ product }: { product: LomadeeLiveProduct }) {
  const price = formatPriceBRL(product.price);
  const hasListPrice = product.listPrice !== null && product.listPrice > product.price;
  const originalPrice = hasListPrice ? formatPriceBRL(product.listPrice as number) : null;
  const discountRate = hasListPrice
    ? Math.round((1 - product.price / (product.listPrice as number)) * 100)
    : null;
  const store = product.storeSlug ? getPlatformInfo(product.storeSlug) : null;
  const storeLabel = product.storeName ?? store?.label ?? "loja parceira";
  const storeColor = product.storeSlug && store ? store.color : "#14110c";

  const params = new URLSearchParams({
    u: product.productUrl,
    org: product.organizationId,
    n: product.productName.slice(0, 200),
  });
  if (product.storeSlug) params.set("s", product.storeSlug);

  return (
    <a
      className="dc-card"
      href={`/go/lomadee?${params.toString()}`}
      target="_blank"
      rel="noopener noreferrer sponsored"
    >
      <div className="dc-card-image">
        {discountRate !== null && discountRate >= 15 ? (
          <span className="dc-card-badge price">-{discountRate}%</span>
        ) : null}
        <img src={product.imageUrl} alt={product.productName} loading="lazy" />
      </div>
      <div className="dc-card-body">
        <p className="dc-card-title">{product.productName}</p>
        <span className="dc-card-live-badge" style={{ color: storeColor }}>
          Direto da {storeLabel} agora
        </span>
        <div className="dc-card-prices">
          {originalPrice ? <span className="dc-card-price-original">{originalPrice}</span> : null}
          {price ? <div className="dc-card-price">{price}</div> : null}
        </div>
        <span className="dc-card-cta">
          <CartIcon size={14} />
          Ver na {storeLabel}
        </span>
      </div>
    </a>
  );
}
