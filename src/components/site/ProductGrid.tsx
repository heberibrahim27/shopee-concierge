import { SiteProduct } from "../../lib/site/catalog";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  products,
  emptyMessage,
  layout = "grid",
}: {
  products: SiteProduct[];
  emptyMessage: string;
  /** "scroll" = rolagem horizontal (pedido do Heber 2026-09-25 pra "Ofertas
   * de hoje", que cresceu demais pra grid vertical) — o resto do site
   * continua em grid normal. */
  layout?: "grid" | "scroll";
}) {
  if (products.length === 0) {
    return <p className="dc-empty">{emptyMessage}</p>;
  }

  return (
    <div className={layout === "scroll" ? "dc-grid-scroll" : "dc-grid"}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
