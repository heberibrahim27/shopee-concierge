/**
 * Favoritos são só conveniência local (sem conta de usuário na Fase 1) —
 * guardados no localStorage do navegador. Guardamos um retrato mínimo do
 * produto (não só o slug) pra página /favoritos conseguir montar os cards
 * sem precisar de outra consulta ao servidor.
 */
export interface FavoriteProduct {
  slug: string;
  productName: string;
  imageUrl: string | null;
  priceMin: number | null;
  priceDiscountRate: number | null;
  ratingStar: number | null;
  sales: number | null;
}

const STORAGE_KEY = "dc-favoritos";

function readAll(): Record<string, FavoriteProduct> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Formato antigo (array de slugs) ou qualquer coisa que não seja um
    // objeto plano — descarta em vez de corromper o novo formato.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, FavoriteProduct>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, FavoriteProduct>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage indisponível (modo privado etc.) — só não persiste.
  }
}

export function isFavorite(slug: string): boolean {
  return slug in readAll();
}

/** Alterna e devolve o novo estado (true = virou favorito). */
export function toggleFavorite(product: FavoriteProduct): boolean {
  const current = readAll();
  const next = { ...current };
  const wasActive = product.slug in next;
  if (wasActive) {
    delete next[product.slug];
  } else {
    next[product.slug] = product;
  }
  writeAll(next);
  return !wasActive;
}

export function listFavorites(): FavoriteProduct[] {
  return Object.values(readAll());
}
