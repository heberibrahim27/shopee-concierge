import { SiteProduct } from "../../lib/site/catalog";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  products,
  emptyMessage,
}: {
  products: SiteProduct[];
  emptyMessage: string;
}) {
  if (products.length === 0) {
    return <p className="dc-empty">{emptyMessage}</p>;
  }

  return (
    <div className="dc-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
