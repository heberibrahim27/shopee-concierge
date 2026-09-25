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
 * Funções puras, sem banco: testáveis com tsx.
 */
export interface CouponRule {
  /** Percentual de desconto (ex: 12) ou null. */
  percentOff: number | null;
  /** Valor fixo de desconto em reais (ex: 50) ou null. */
  amountOff: number | null;
  /** Valor mínimo de compra em reais, quando o texto diz. */
  minPurchase: number | null;
  /** Teto do desconto em reais ("limitado a R$20"), quando o texto diz. */
  maxDiscount: number | null;
  /** Termos de escopo (marca/linha) em minúsculas sem acento: ["apple"], ["jbl"]. Vazio = genérico ou desconhecido. */
  scopeTerms: string[];
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

  // Código escrito no texto ("use o cupom: EXTRA20", "cupom PRIMAVERAL") --
  // só maiúsculas/dígitos, 4 a 20 caracteres, pra não pegar palavra comum.
  let codeFromText: string | null = null;
  if (!params.code) {
    const m = /cupom:?\s+([A-Z][A-Z0-9]{3,19})\b/.exec(text);
    if (m) codeFromText = m[1];
  }

  // Escopo: "em produtos Apple selecionados", "produtos JBL.", "itens da
  // linha PlayNinja", "produtos de VGA", "produtos da Sacy".
  const scopeTerms: string[] = [];
  const scopeRe = /(?:produtos|itens|pecas|linha|colecao)\s+(?:d[aeo]s?\s+)?(?:linha\s+)?([a-z0-9]+(?:\s+[a-z0-9]+)?)/g;
  let sm: RegExpExecArray | null;
  while ((sm = scopeRe.exec(norm)) !== null) {
    const words = sm[1].split(" ").filter((w) => !SCOPE_STOP.has(w));
    const term = words.slice(0, 2).join(" ").trim();
    const first = words[0] ?? "";
    if (!first || GENERIC_SCOPE.has(first) || first.length < 2) continue;
    // Só a primeira palavra quando a segunda é genérica ("apple selecionados" já filtrado; "jbl oferta" idem).
    scopeTerms.push(GENERIC_SCOPE.has(words[1] ?? "") ? first : term);
  }

  return {
    percentOff: pct ? Number(pct[1]) : null,
    amountOff: amount ? parseMoney(amount[1]) : null,
    minPurchase: min ? parseMoney(min[1]) : null,
    maxDiscount: cap ? parseMoney(cap[1]) : null,
    scopeTerms: Array.from(new Set(scopeTerms)),
    codeFromText,
  };
}

/** Linha curta de condições pro card ("12% OFF · em Apple · a partir de R$100"). */
export function describeRule(rule: CouponRule): string | null {
  const parts: string[] = [];
  if (rule.percentOff) parts.push(`${rule.percentOff}% OFF`);
  else if (rule.amountOff) parts.push(`R$${formatBRLShort(rule.amountOff)} OFF`);
  if (rule.scopeTerms.length > 0) parts.push(`em ${rule.scopeTerms.map(labelScope).join(", ")}`);
  if (rule.minPurchase) parts.push(`a partir de R$${formatBRLShort(rule.minPurchase)}`);
  if (rule.maxDiscount) parts.push(`limitado a R$${formatBRLShort(rule.maxDiscount)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * O cupom pode valer pra este produto? Escopo vazio = genérico (pode
 * valer, mas com aviso); escopo preenchido exige que algum termo apareça
 * no nome do produto. Nunca afirma elegibilidade: é "pode valer".
 */
export function ruleMatchesProduct(rule: CouponRule, productName: string): "specific" | "generic" | "no" {
  if (rule.scopeTerms.length === 0) return "generic";
  const name = normalizeText(productName);
  return rule.scopeTerms.some((t) => name.includes(t)) ? "specific" : "no";
}

/** Preço estimado depois do cupom, ou null quando não dá pra estimar (sem valor, ou abaixo do mínimo). */
export function estimatePriceWithCoupon(rule: CouponRule, price: number): number | null {
  if (!(price > 0)) return null;
  if (rule.minPurchase && price < rule.minPurchase) return null;
  let discount = 0;
  if (rule.percentOff) discount = price * (rule.percentOff / 100);
  else if (rule.amountOff) discount = rule.amountOff;
  else return null;
  if (rule.maxDiscount) discount = Math.min(discount, rule.maxDiscount);
  const final = price - discount;
  return final > 0 ? Math.round(final * 100) / 100 : null;
}

function formatBRLShort(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

/** Marca curta (até 4 letras) em caixa alta ("JBL", "VGA"), o resto capitalizado ("Apple", "Playninja"). */
function labelScope(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length <= 4 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
