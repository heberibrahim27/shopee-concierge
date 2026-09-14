/**
 * Link de afiliado usado nas páginas públicas do site.
 *
 * Fase 1: reusa o `offer_link` já gravado no snapshot pelo pipeline do
 * Growth OS (gerado uma vez, na coleta) — a página pública NUNCA chama
 * `generateAffiliateShortLink` ao vivo (ver ARQUITETURA-SITE.md, seção 3).
 *
 * Tracking por origem (home/categoria/produto/instagram) ficou de fora
 * desta fase de propósito: os subIds da Shopee só aceitam tokens CURTOS e
 * SIMPLES (ex: "wa", "s1") — a API rejeita valores compostos como
 * "site_produto_airfryer" (erro [11001] Params Error: invalid sub id, ver
 * comentário em src/lib/shopee/queries.ts). Pra rastrear origem de verdade
 * é preciso gerar, no momento da COLETA (Growth OS), um link curto por
 * combinação de subIds curtos (ex: ["site"], ["site","cat"]) e guardar
 * cada um — não gerar sob demanda na página. Ver CONTINUIDADE.md.
 */
export const AFFILIATE_LINK_REL = "sponsored noopener noreferrer";

export function getProductAffiliateHref(offerLink: string | null): string | null {
  return offerLink;
}
