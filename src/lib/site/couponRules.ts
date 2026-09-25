/**
 * Regras estruturadas de cupom extraídas do texto (título + descrição) —
 * base do "preço estimado com cupom" na página de produto e da linha de
 * condições no card. As redes (Awin/Lomadee/Shopee) não entregam campo
 * estruturado de valor mínimo/teto/escopo: só texto livre. Lido do banco
 * real em 2026-09-26 antes de escrever os padrões: "12% OFF em produtos
 * Apple selecionados", "R$50 de desconto em produtos selecionados", "20%
 * OFF na compra de 2 Peças", "Em compras acima de R$ 499", "Use o cupom:
 * EXTRA20" (código no título, coluna code vazia).
 *
 * Revisão 2026-09-26 (4 pontos do revisor, todos confirmados no dado):
 *  - "produtos de VGA" é CATEGORIA, não marca -- os 17 produtos Kabum com
 *    "vga" no nome são adaptadores/cabos/monitores, nenhuma placa de vídeo.
 *    Escopo capturado com "de" vira `scopeKind: "category"` e NÃO casa com
 *    produto por substring; só escopo de marca ("produtos JBL", "produtos
 *    da Sacy", "linha PlayNinja") casa.
 *  - "selecionados", "itens da promoção", "na compra de 2 peças" etc.
 *    marcam `eligibilityRestricted`: o cupom pode valer, mas NÃO se calcula
 *    preço -- os dados não sustentam.
 *  - "só hoje", "relâmpago", "tempo limitado" marcam `validityUnknown`.
 *  - A Awin grava `endDate = data da busca + 366 dias` (início 1 ano antes)
 *    quando a campanha não tem fim de verdade: `isAwinOpenEnded` reconhece
 *    exatamente esse marcador, sem esconder validade real distante.
 *
 * Funções puras, sem banco: testáveis com tsx.
 */
export interface CouponRule {
  percentOff: number | null;
  amountOff: number | null;
  /** Valor mínimo de compra em reais, quando o texto diz. */
  minPurchase: number | null;
  /** Teto do desconto em reais ("limitado a R$20"), quando o texto diz. */
  maxDiscount: number | null;
  /** Termos de escopo em minúsculas sem acento. Vazio = genérico ou desconhecido. */
  scopeTerms: string[];
  /** "brand" casa com nome de produto; "category" não (palavra de categoria aparece em produto errado). */
  scopeKind: "brand" | "category" | "none";
  /** Texto restringe a itens selecionados / promoção / quantidade: pode valer, mas sem estimar preço. */
  eligibilityRestricted: boolean;
  /** Texto diz "só hoje", "relâmpago", "tempo limitado": validade não confiável. */
  validityUnknown: boolean;
  /** Código encontrado no texto quando a coluna `code` veio vazia. */
  codeFromText: string | null;
}

const GENERIC_SCOPE = new Set([
  "selecionados", "selecionadas", "promocao", "oferta", "ofertas", "desconto", "site", "loja", "compras",
  "compra", "pecas", "peca", "produtos", "produto", "itens", "item", "todos", "toda", "todo", "linha",
  "categoria", "carrinho", "pedido", "aplicativo", "app",
]);

const SCOPE_STOP = new Set([
  "selecionados", "selecionadas", "usando", "aproveite", "oferta", "valido", "valida", "com", "no", "na",
  "e", "ou", "por", "para", "ate", "so", "promocao", "relampago", "nao", "perca",
]);

const RESTRICTION_PATTERNS = [
  /selecionad[oa]s/,
  /itens da promocao/,
  /produtos da promocao/,
  /participantes/,
  /na compra de \d+/,
  /comprando \d+/,
  /em \d+ pecas/,
  /a partir de \d+ (?:pecas|unidades|itens)/,
  /kit/,
  /primeira compra/,
  /novos clientes/,
  /clientes? vip/,
];

const VALIDITY_PATTERNS = [/so hoje/, /relampago/, /tempo limitado/, /enquanto durarem/, /ultimas? (?:horas|unidades)/];

export function normalizeText(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function parseMoney(raw: string): number | null {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseCouponRule(params: { title: string; description?: string | null; code?: string | null }): CouponRule {
  const text = `${params.title} ${params.description ?? ""}`.replace(/\s+/g, " ").trim();
  const norm = normalizeText(text);

  const pct = /(\d{1,2})\s*%\s*(?:off|de desconto|desconto)/i.exec(norm);
  const amount = /r\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:off|de desconto|desconto)/i.exec(norm);
  const min =
    /(?:acima de|a partir de|apartir de|minimo de|minima de)\s*r\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i.exec(norm);
  const cap = /(?:limitado a|limitada a|teto de|maximo de)\s*r\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i.exec(norm);

  let codeFromText: string | null = null;
  if (!params.code) {
    const m = /cupom:?\s+([A-Z][A-Z0-9]{3,19})\b/.exec(text);
    if (m) codeFromText = m[1];
  }

  // Escopo. Grupo 1 = preposição usada ("de" → categoria; "da/do/das/dos"
  // ou nenhuma → marca), grupo 2 = termo.
  const scopeTerms: string[] = [];
  let scopeKind: CouponRule["scopeKind"] = "none";
  const scopeRe = /(?:produtos|itens|pecas|linha|colecao)\s+(?:(d[aeo]s?)\s+)?(?:linha\s+)?([a-z0-9]+(?:\s+[a-z0-9]+)?)/g;
  let sm: RegExpExecArray | null;
  while ((sm = scopeRe.exec(norm)) !== null) {
    const prep = sm[1] ?? "";
    const words = sm[2].split(" ").filter((w) => !SCOPE_STOP.has(w));
    const first = words[0] ?? "";
    if (!first || GENERIC_SCOPE.has(first) || first.length < 2) continue;
    const term = GENERIC_SCOPE.has(words[1] ?? "") ? first : words.slice(0, 2).join(" ").trim();
    scopeTerms.push(term);
    const kind: CouponRule["scopeKind"] = prep === "de" ? "category" : "brand";
    // Se qualquer captura for categoria, o cupom inteiro é tratado como categoria (mais conservador).
    scopeKind = scopeKind === "category" || kind === "category" ? "category" : "brand";
  }

  return {
    percentOff: pct ? Number(pct[1]) : null,
    amountOff: amount ? parseMoney(amount[1]) : null,
    minPurchase: min ? parseMoney(min[1]) : null,
    maxDiscount: cap ? parseMoney(cap[1]) : null,
    scopeTerms: Array.from(new Set(scopeTerms)),
    scopeKind,
    eligibilityRestricted: RESTRICTION_PATTERNS.some((re) => re.test(norm)),
    validityUnknown: VALIDITY_PATTERNS.some((re) => re.test(norm)),
    codeFromText,
  };
}

/** Linha curta de condições pro card ("12% OFF · em Apple · itens selecionados"). */
export function describeRule(rule: CouponRule): string | null {
  const parts: string[] = [];
  if (rule.percentOff) parts.push(`${rule.percentOff}% OFF`);
  else if (rule.amountOff) parts.push(`R$${formatBRLShort(rule.amountOff)} OFF`);
  if (rule.scopeTerms.length > 0) parts.push(`em ${rule.scopeTerms.map(labelScope).join(", ")}`);
  if (rule.minPurchase) parts.push(`a partir de R$${formatBRLShort(rule.minPurchase)}`);
  if (rule.maxDiscount) parts.push(`limitado a R$${formatBRLShort(rule.maxDiscount)}`);
  if (rule.eligibilityRestricted) parts.push("itens selecionados");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * O cupom pode valer pra este produto?
 *  - "specific": escopo de MARCA e a marca está no nome do produto;
 *  - "generic": sem escopo (cupom de loja inteira / desconhecido);
 *  - "no": marca não bate, ou escopo é de categoria (não dá pra casar por nome).
 * Nunca afirma elegibilidade: é "pode valer".
 */
export function ruleMatchesProduct(rule: CouponRule, productName: string): "specific" | "generic" | "no" {
  if (rule.scopeKind === "category") return "no";
  if (rule.scopeTerms.length === 0) return "generic";
  const name = normalizeText(productName);
  return rule.scopeTerms.some((t) => new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`).test(name)) ? "specific" : "no";
}

/**
 * Preço estimado depois do cupom. null quando não dá pra sustentar o
 * número: sem valor no texto, abaixo do mínimo, ou elegibilidade
 * restrita ("itens selecionados" -- a loja decide quais).
 */
export function estimatePriceWithCoupon(rule: CouponRule, price: number): number | null {
  if (!(price > 0)) return null;
  if (rule.eligibilityRestricted) return null;
  if (rule.minPurchase && price < rule.minPurchase) return null;
  // Conta em centavos pra ser determinística (é estimativa: 1 centavo de
  // arredondamento não muda a decisão de ninguém).
  const priceCents = Math.round(price * 100);
  let discountCents = 0;
  if (rule.percentOff) discountCents = Math.round((priceCents * rule.percentOff) / 100);
  else if (rule.amountOff) discountCents = Math.round(rule.amountOff * 100);
  else return null;
  if (rule.maxDiscount) discountCents = Math.min(discountCents, Math.round(rule.maxDiscount * 100));
  const finalCents = priceCents - discountCents;
  return finalCents > 0 ? finalCents / 100 : null;
}

/**
 * Marcador da Awin pra campanha sem fim: endDate = data da busca + 365/366
 * dias (conferido no banco: 9 cupons Kabum com fim 2027-09-26, busca
 * 2026-09-25, início 2025-09-19). Tolerância de 2 dias. Validade real
 * distante (ex.: 2026-12-21 da Brinox) NÃO cai aqui.
 */
export function isAwinOpenEnded(endsAt: string | null, fetchedAt: string | null): boolean {
  if (!endsAt || !fetchedAt) return false;
  const days = (new Date(endsAt).getTime() - new Date(fetchedAt).getTime()) / 86400_000;
  return Math.abs(days - 365.5) <= 2.5;
}

function formatBRLShort(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

/** Marca curta (até 4 letras) em caixa alta ("JBL"), o resto capitalizado ("Apple"). */
function labelScope(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length <= 4 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
