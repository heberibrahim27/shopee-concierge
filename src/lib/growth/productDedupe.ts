/**
 * Detecta "mesmo produto físico, vendedor diferente" no grupo do WhatsApp.
 *
 * Achado real (Heber, 2026-09-24, sobre a repetição no grupo: "mesmo
 * produto, de vendedor diferente"): o dedupe existente (pickNextCandidate
 * em publish-whatsapp-group/route.ts) só bloqueia por `product_id` — e na
 * Shopee cada vendedor que anuncia o MESMO produto físico tem seu próprio
 * `shopee_item_id`/`product_id`, então esse dedupe nunca pega o caso.
 * A API productOfferV2 não tem GTIN/modelo/marca estruturado (só
 * `productName` livre + `shopId` — ver src/lib/shopee/types.ts), então a
 * única forma de reconhecer "mesmo produto" entre vendedores diferentes é
 * comparar o NOME por similaridade de tokens, não por igualdade exata
 * (cada vendedor escreve o título do jeito que quer).
 *
 * Deliberadamente NÃO usa preço como filtro: o motivo de existir
 * comparação entre lojas é justamente que o MESMO produto pode ter preço
 * bem diferente entre vendedores (um mais caro, um mais barato) — exigir
 * preço parecido faria o dedupe furar exatamente no caso mais comum.
 */

// Ruído comum de título de anúncio na Shopee — não ajuda a identificar O
// PRODUTO, só polui a comparação (achado testando nomes reais do catálogo).
const FILLER_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "ou", "a", "o", "as", "os", "com", "sem",
  "para", "pra", "em", "no", "na", "un", "unidade", "unidades", "pc", "pct",
  "kit", "novo", "nova", "original", "originais", "premium", "importado",
  "importada", "oferta", "promocao", "promocional", "frete", "gratis", "envio",
  "imediato", "pronta", "entrega", "top", "linha", "modelo", "cor", "cores",
  "tamanho", "tamanhos",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function productNameTokens(productName: string): Set<string> {
  const normalized = stripAccents(productName).toLowerCase();
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return new Set(words.filter((w) => w.length > 2 && !FILLER_WORDS.has(w)));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Achado testando nomes reais do catálogo: 0.6 pega variações de título
// do mesmo produto ("Fogão 4 Bocas Mesa de Vidro Grade Ferro Bivolt" vs
// "Fogão de Mesa 4 Bocas Vidro Temperado Grade Ferro 220v") sem confundir
// produtos genuinamente diferentes da mesma categoria.
export const DUPLICATE_NAME_THRESHOLD = 0.6;

export interface PostedProductRecord {
  productName: string;
  categorySlug: string | null;
}

/**
 * true se `candidateName`/`candidateCategorySlug` é o mesmo produto físico
 * de algum item em `posted` — mesma categoria (evita colisão de token
 * genérico entre categorias diferentes) e similaridade de nome alta.
 */
export function isDuplicateOfPosted(
  candidateName: string,
  candidateCategorySlug: string | null,
  posted: PostedProductRecord[]
): boolean {
  const candidateTokens = productNameTokens(candidateName);
  if (candidateTokens.size === 0) return false;
  for (const record of posted) {
    if (record.categorySlug !== candidateCategorySlug) continue;
    const similarity = jaccardSimilarity(candidateTokens, productNameTokens(record.productName));
    if (similarity >= DUPLICATE_NAME_THRESHOLD) return true;
  }
  return false;
}
