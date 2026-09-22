/**
 * Hosts reais de onde `offer_snapshots.image_url` já veio, confirmado
 * via query direta no Supabase (2026-09-22): cf.shopee.com.br (Shopee),
 * images2.productserve.com (proxy de imagem da Awin — Kabum/Olympikus/
 * Nike/etc), http2.mlstatic.com (Mercado Livre, fonte antiga/inativa,
 * mantido por segurança caso reative). Compartilhado entre as rotas que
 * fazem fetch server-side de uma foto de produto pra evitar SSRF.
 */
export const ALLOWED_PRODUCT_IMAGE_HOST_SUFFIXES = [".shopee.com.br", ".susercontent.com", ".productserve.com", ".mlstatic.com"];

export function isAllowedProductImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && ALLOWED_PRODUCT_IMAGE_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix));
}
