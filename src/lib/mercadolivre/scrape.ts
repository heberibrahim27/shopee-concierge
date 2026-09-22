/**
 * Mercado Livre não tem API pública com preço de produto de terceiro —
 * testado de verdade com app OAuth registrado e autorizado (2026-09-15,
 * ver FEITO.md): `products/search`/`products/{id}` não têm campo de
 * preço, `products/{id}/items` só funciona pra anúncio da própria
 * conta, `items/{id}` dá 403 mesmo autenticado. Confirmado de novo ao
 * vivo (2026-09-22, sem auth): mesmo 403.
 *
 * Único caminho real: os links curtos de afiliado (`meli.la/...`) do
 * canal do Heber redirecionam pra uma "página de recomendação"
 * (recommendations-landings-fe, framework Nordic da própria Mercado
 * Livre) que destaca UM produto principal — nome/preço/foto vêm
 * embutidos no HTML renderizado (meta og:title/og:image + um bloco JS
 * de estado da página, `_n.ctx.r = {...}`). Scraping de HTML é
 * inerentemente frágil (quebra se a Mercado Livre mudar o layout),
 * mas é a única fonte de preço real que existe hoje — decisão do
 * Heber (2026-09-22) de aceitar essa fragilidade em vez de ficar sem
 * Mercado Livre.
 */

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type ScrapedFeaturedProduct = {
  title: string;
  imageUrl: string;
  currentPrice: number;
  previousPrice: number | null;
};

/**
 * O produto em destaque é sempre o primeiro bloco `"price"` com
 * `"column":1` logo após título+vendedor no HTML — confirmado
 * comparando 2 ocorrências do mesmo produto na mesma página (a
 * destacada tinha `column:1`, uma recomendada mais abaixo não tinha).
 * Nunca faz parse do blob JS inteiro como JSON (é um object literal
 * arbitrário, não JSON válido) — só regex localizado nessa janela.
 */
function extractPrice(html: string): { currentPrice: number; previousPrice: number | null } | null {
  const anchorIdx = html.indexOf('"column":1,"price":{');
  if (anchorIdx === -1) return null;
  const window = html.slice(anchorIdx, anchorIdx + 500);
  const currentMatch = window.match(/"current_price":\{"value":([0-9.]+)/);
  if (!currentMatch) return null;
  const previousMatch = window.match(/"previous_price":\{"value":([0-9.]+)/);
  return {
    currentPrice: Number(currentMatch[1]),
    previousPrice: previousMatch ? Number(previousMatch[1]) : null,
  };
}

export async function scrapeFeaturedProduct(affiliateUrl: string): Promise<ScrapedFeaturedProduct | null> {
  const resp = await fetch(affiliateUrl, {
    redirect: "follow",
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${affiliateUrl}`);
  const html = await resp.text();

  const titleMatch = html.match(/property="og:title" content="([^"]+)"/);
  const imageMatch = html.match(/property="og:image" content="([^"]+)"/);
  const price = extractPrice(html);
  if (!titleMatch || !imageMatch || !price) return null;

  return {
    title: decodeHtmlEntities(titleMatch[1]),
    imageUrl: imageMatch[1],
    currentPrice: price.currentPrice,
    previousPrice: price.previousPrice,
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
