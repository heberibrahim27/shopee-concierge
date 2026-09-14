/**
 * Slug público de produto: nome legível + sufixo curto derivado do
 * shopee_item_id. O sufixo é determinístico (mesmo item sempre gera o
 * mesmo sufixo) e garante que a URL nunca colide nem muda se o vendedor
 * renomear o produto na Shopee depois — ver ARQUITETURA-SITE.md, seção 5.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Hash curto e determinístico (djb2) — sem dependência externa. */
export function shortIdFromSeed(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return (hash >>> 0).toString(36).slice(0, 5);
}

export function buildProductSlug(productName: string, shopeeItemId: string): string {
  return `${slugify(productName)}-${shortIdFromSeed(shopeeItemId)}`;
}
