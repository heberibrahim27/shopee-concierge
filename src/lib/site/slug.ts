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

/**
 * Hash de reserva pra colisão real de slug (ver persistAwinProduct) —
 * usa o hash INTEIRO (sem cortar pros 5 primeiros dígitos). Achado real
 * (2026-09-24): dois IDs que só diferem no ÚLTIMO caractere (comum em
 * código de estilo Nike por cor, ex. "IF2894" vs "IF2895") colidem 100%
 * das vezes com shortIdFromSeed, porque o djb2 só espalha essa diferença
 * nos bits BAIXOS do hash, e slice(0,5) pega os dígitos ALTOS. Confirmado:
 * shortIdFromSeed("AWIN-IF2894") === shortIdFromSeed("AWIN-IF2895") === "t52ra".
 * Não dá pra trocar o hash de shortIdFromSeed direto: mudaria o slug (a
 * URL) de todo produto já publicado no próximo reprocessamento. Esse hash
 * de reserva só entra quando o insert normal já bateu de fato numa colisão.
 */
export function buildProductSlugFallback(productName: string, shopeeItemId: string): string {
  let hash = 5381;
  for (let i = 0; i < shopeeItemId.length; i++) {
    hash = (hash * 33) ^ shopeeItemId.charCodeAt(i);
  }
  return `${slugify(productName)}-${(hash >>> 0).toString(36)}`;
}
