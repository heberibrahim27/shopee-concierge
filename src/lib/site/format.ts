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
