/**
 * Descoberta de produto real na Mercado Livre — achado real (2026-09-24,
 * Heber: "a variedade que tem é ainda mercado livre, não entendi ainda
 * pq a divulgalinks consegue fazer isso e nós não"). A resposta: a
 * ML tem uma página pública `/ofertas` com milhares de produtos reais,
 * filtrável por categoria oficial da própria plataforma, sem precisar
 * de OAuth nem chave de API nenhuma — bem diferente do beco sem saída
 * da API privada (`items/{id}` dá 403 mesmo autenticado, ver
 * scrape.ts). A página renderiza um blob de estado (`_n.ctx.r=...`,
 * framework "nordic" da própria ML) que É JSON válido de verdade
 * (confirmado testando `JSON.parse` direto, ao contrário do blob da
 * página de produto individual usada em scrape.ts, que é object
 * literal solto) — dá pra extrair título/preço/nota/vendas de forma
 * estruturada, sem regex frágil.
 */

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type OfertaItem = {
  itemId: string;
  title: string;
  url: string;
  currentPrice: number;
  previousPrice: number | null;
  discountLabel: string | null; // "49% OFF" — auto-declarado pelo seller, NUNCA usado como sinal de valor (ver dealScoring.ts) — só exibido/logado.
  rating: number | null;
  salesApprox: number | null;
  position: number;
};

/** Categorias oficiais da Mercado Livre com produto suficiente pra valer a busca — mapeadas manualmente pro slug do nosso site (guessCategorySlug ainda roda em cima do título, isso aqui só filtra a busca). */
export const ML_CATEGORY_IDS: Record<string, string> = {
  casa: "MLB1574", // "Casa, Móveis e Decoração"
  ferramentas: "MLB1500", // "Construção" (ML não separa ferramentas de construção)
  eletronicos: "MLB1051", // "Celulares e Telefones" — eletrônicos em geral ficam espalhados, celular é o maior volume
  beleza: "MLB1246",
  brinquedos: "MLB1132",
  bebes: "MLB1384",
  alimentos: "MLB1403",
  papelaria: "MLB1368", // "Arte, Papelaria e Armarinho"
  automotivo: "MLB5672", // "Acessórios para Veículos"
};

function extractJsonStateBlob(html: string): unknown | null {
  const marker = "_n.ctx.r=";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const contentStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = contentStart; i < html.length; i++) {
    const ch = html[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(html.slice(contentStart, end));
  } catch {
    return null;
  }
}

function parseReview(altText: string | undefined): { rating: number | null; salesApprox: number | null } {
  if (!altText) return { rating: null, salesApprox: null };
  const ratingMatch = altText.match(/Classificação ([\d.,]+) de 5 estrelas/);
  const salesMatch = altText.match(/Mais de ([\d.,]+)\s*(mil)?\s*produtos? vendidos?/i);
  const rating = ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null;
  let salesApprox: number | null = null;
  if (salesMatch) {
    const base = Number(salesMatch[1].replace(".", "").replace(",", "."));
    salesApprox = salesMatch[2] ? base * 1000 : base;
  }
  return { rating, salesApprox };
}

/**
 * Busca uma página de `/ofertas` (48 itens por página — limite fixo da
 * própria ML) filtrada por categoria opcional. `offset` pagina (0, 48,
 * 96...) — `paging.total`/`primaryResults` no retorno bruto dizem até
 * onde dá pra ir (raramente mais que ~1000 resultados navegáveis).
 */
export async function scrapeOfertas(params: { categoryId?: string; offset?: number } = {}): Promise<OfertaItem[]> {
  const url = new URL("https://www.mercadolivre.com.br/ofertas");
  if (params.categoryId) url.searchParams.set("category", params.categoryId);
  if (params.offset) url.searchParams.set("offset", String(params.offset));

  const resp = await fetch(url.toString(), { headers: { "User-Agent": BROWSER_UA, Accept: "text/html" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${url}`);
  const html = await resp.text();

  const state = extractJsonStateBlob(html) as
    | { appProps?: { pageProps?: { data?: { items?: unknown[] } } } }
    | null;
  const items = state?.appProps?.pageProps?.data?.items;
  if (!Array.isArray(items)) return [];

  const result: OfertaItem[] = [];
  for (const raw of items) {
    const item = raw as any;
    const components: any[] = item?.card?.components ?? [];
    const title = components.find((c) => c.id === "title")?.title?.text;
    const priceComp = components.find((c) => c.id === "price_v2")?.price;
    const currentPrice = priceComp?.current_price?.value;
    const rawUrl = item?.card?.metadata?.url;
    const itemId = item?.card?.metadata?.id;
    if (!title || typeof currentPrice !== "number" || !rawUrl || !itemId) continue;

    const previousPrice = priceComp?.price_labels?.[0]?.values?.[0]?.price?.value ?? null;
    const discountLabel = priceComp?.discount_polylabel?.values?.[0]?.pill?.text ?? null;
    const reviewAlt = components.find((c) => c.id === "review_compacted")?.review_compacted?.alt_text;
    const { rating, salesApprox } = parseReview(reviewAlt);

    result.push({
      itemId,
      title,
      url: rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`,
      currentPrice,
      previousPrice,
      discountLabel,
      rating,
      salesApprox,
      position: item?.position ?? result.length + 1,
    });
  }
  return result;
}

/**
 * Mesma filosofia de `precoRelativoComparaveis` em dealScoring.ts —
 * preço contra a MEDIANA da própria página (mesma categoria, resultados
 * reais comparáveis), não contra o "de/por" que o seller decide
 * mostrar. Devolve os itens ordenados do melhor achado pro pior, com o
 * campo `valueScore` (0-100) anexado.
 */
export function rankOfertasByRelativeValue(items: OfertaItem[]): Array<OfertaItem & { valueScore: number }> {
  if (items.length < 4) return items.map((i) => ({ ...i, valueScore: 0 }));
  const prices = items.map((i) => i.currentPrice).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return items
    .map((item) => {
      const pctAbaixoDaMediana = ((median - item.currentPrice) / median) * 100;
      const precoScore = Math.max(0, Math.min(40, (pctAbaixoDaMediana / 40) * 40)); // 40%+ abaixo da mediana = máximo
      const ratingScore = item.rating != null ? Math.max(0, Math.min(35, ((item.rating - 3) / 2) * 35)) : 0;
      const salesScore = item.salesApprox != null ? Math.max(0, Math.min(25, (Math.log10(item.salesApprox + 1) / Math.log10(5000)) * 25)) : 0;
      return { ...item, valueScore: Math.round((precoScore + ratingScore + salesScore) * 100) / 100 };
    })
    .sort((a, b) => b.valueScore - a.valueScore);
}
