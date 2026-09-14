export function formatPriceBRL(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatSales(sales: number | null): string | null {
  if (sales === null || sales <= 0) return null;
  if (sales >= 1000) return `+${Math.floor(sales / 1000)} mil vendidos`;
  return `${sales} vendidos`;
}

export function formatRating(rating: number | null): string | null {
  if (rating === null || rating <= 0) return null;
  return rating.toFixed(1).replace(".", ",");
}

/**
 * Preço "de" estimado a partir do desconto informado pela própria Shopee
 * (priceDiscountRate) — não é um valor inventado, é o preço atual dividido
 * de volta pela taxa de desconto real da oferta.
 */
export function formatOriginalPriceBRL(
  priceMin: number | null,
  discountRate: number | null
): string | null {
  if (priceMin === null || !discountRate || discountRate <= 0 || discountRate >= 100) return null;
  const original = priceMin / (1 - discountRate / 100);
  return formatPriceBRL(original);
}

/** Quanto o preço atual economiza do "de" (mesma base do priceDiscountRate real da Shopee). */
export function formatSavingsBRL(priceMin: number | null, discountRate: number | null): string | null {
  if (priceMin === null || !discountRate || discountRate <= 0 || discountRate >= 100) return null;
  const original = priceMin / (1 - discountRate / 100);
  return formatPriceBRL(original - priceMin);
}
