/**
 * Motor de copy baseado em evidência — substitui o antigo "produto +
 * preço -> pede pra IA escrever algo persuasivo", que sempre saía
 * genérico (Heber, 2026-09-22: "a mesma nota generica que voces deram
 * aos produtos"). Debate real com o Heber e o ChatGPT no mesmo dia:
 *
 * - Heber quer técnica de venda de verdade (curiosidade, senso de
 *   "sair ganhando"), texto maior com narrativa, CTA forte — pra
 *   maximizar CLIQUE (Shopee paga comissão em qualquer compra dentro
 *   de 7 dias do clique, não só no produto anunciado).
 * - Mas nem ele quer enganar ninguém: "nem eu quero enganar ninguem,
 *   quero usar tecnicas de venda... mas preciso que cliquem no link".
 *
 * Solução: a IA nunca decide sozinha O QUE alegar. Ela recebe um
 * `reasonCode` + números reais (evidence) já calculados por
 * demandSignal.ts, e só escreve COMO apresentar esses fatos. Depois do
 * texto pronto, o Claim Firewall barra qualquer frase de escassez/
 * urgência que não tenha o reasonCode correspondente — mesmo que a IA
 * tente colar uma por conta própria.
 */
import OpenAI from "openai";
import type { DemandReasonCode, DemandSignal } from "./demandSignal";

export type OfferReasonCode = DemandReasonCode | "PLAIN_DISCOUNT";

export type CopyInput = {
  productName: string;
  priceMin: number;
  priceDiscountRate: number;
  platformLabel: string; // ex: "na Shopee"
  demand: DemandSignal;
};

// Frases de escassez/urgência que só podem sair se o reasonCode
// correspondente estiver realmente presente — Heber e eu concordamos
// que isso é a linha vermelha (2026-09-22: "nem eu quero enganar
// ninguem"). Regex case-insensitive, cobre variação comum de emoji/
// pontuação ao redor.
const CLAIM_LICENSES: Array<{ pattern: RegExp; requiresReasonCode: OfferReasonCode[] }> = [
  { pattern: /últimas? unidades?/i, requiresReasonCode: [] }, // nunca licenciado — não temos dado de estoque
  { pattern: /estoque (acabando|limitado|baixo)/i, requiresReasonCode: [] },
  { pattern: /s[oó] hoje/i, requiresReasonCode: [] }, // nunca — não temos prazo real de cupom hoje
  { pattern: /vai acabar/i, requiresReasonCode: [] },
  { pattern: /promo[cç][aã]o rel[aâ]mpago/i, requiresReasonCode: [] },
  { pattern: /menor pre[cç]o( da internet| de todos)?/i, requiresReasonCode: ["LOWEST_TRACKED_PRICE"] },
  { pattern: /(vendas? (disparou|disparando|acelerou)|todo mundo (comprando|comprou))/i, requiresReasonCode: ["SALES_ACCELERATION"] },
  { pattern: /mais vendido/i, requiresReasonCode: ["SALES_ACCELERATION"] },
  { pattern: /corre antes que acabe/i, requiresReasonCode: [] },
];

/** Remove/neutraliza qualquer alegação não licenciada pelo reasonCode real desta oferta. Nunca deixa passar por confiar "a IA provavelmente respeitou o prompt". */
export function enforceClaimFirewall(text: string, reasonCode: OfferReasonCode): string {
  let safe = text;
  for (const claim of CLAIM_LICENSES) {
    if (claim.pattern.test(safe) && !claim.requiresReasonCode.includes(reasonCode)) {
      // Corta a frase inteira que contém a alegação proibida, não só a
      // palavra — evita deixar um pedaço de frase quebrado no meio do
      // texto.
      safe = safe
        .split(/\n/)
        .map((line) => (claim.pattern.test(line) ? "" : line))
        .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
        .join("\n");
    }
  }
  return safe.trim();
}

function pickReasonCode(demand: DemandSignal): OfferReasonCode {
  return demand.reasonCode ?? "PLAIN_DISCOUNT";
}

function evidenceLine(reasonCode: OfferReasonCode, input: CopyInput): string {
  const { evidence } = input.demand;
  const price = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
  switch (reasonCode) {
    case "SALES_ACCELERATION":
      return `Este produto vendeu ${evidence.salesDelta} unidades nas últimas ${evidence.daysSinceLastSnapshot} dia(s) monitorado(s) — ritmo ${evidence.accelerationMultiplier?.toFixed(1)}x acima da média histórica dele (${evidence.avgDailySalesVelocity?.toFixed(1)} vendas/dia em média).`;
    case "REAL_PRICE_DROP":
      return `O preço caiu de ${price(evidence.priceDaysAgo ?? 0)} para ${price(evidence.priceNow)} nos últimos ${evidence.daysSincePriceRef} dias (queda real de ${Math.abs(evidence.priceChangePct ?? 0).toFixed(0)}%, medida comparando nossos próprios snapshots, não é o desconto que a loja mostra).`;
    case "LOWEST_TRACKED_PRICE":
      return `É o menor preço que registramos para este produto desde que começamos a acompanhá-lo (${evidence.snapshotCount} verificações).`;
    case "PLAIN_DISCOUNT":
    default:
      return input.priceDiscountRate > 0
        ? `A própria loja está anunciando ${Math.round(input.priceDiscountRate)}% de desconto no preço original.`
        : `Preço atual: ${price(input.priceMin)}.`;
  }
}

function fallbackTemplate(reasonCode: OfferReasonCode, input: CopyInput): string {
  switch (reasonCode) {
    case "SALES_ACCELERATION":
      return `Gente, esse aqui tá voando 🔥\n${evidenceLine("SALES_ACCELERATION", input)} Alguma coisa boa esse povo viu...`;
    case "REAL_PRICE_DROP":
      return `Rastreamos esse item todos os dias — ${evidenceLine("REAL_PRICE_DROP", input)}`;
    case "LOWEST_TRACKED_PRICE":
      return `Esse chamou nossa atenção de verdade: ${evidenceLine("LOWEST_TRACKED_PRICE", input)}`;
    case "PLAIN_DISCOUNT":
    default:
      return `Separei esse achadinho pra vocês hoje 👀 ${evidenceLine("PLAIN_DISCOUNT", input)}`;
  }
}

/**
 * Gera só o TRECHO NARRATIVO (abertura + contexto) — preço, produto e
 * CTA continuam formatados à parte em buildMessage (publish-whatsapp-
 * group/route.ts), pra manter o formato visual (negrito, linha de
 * preço) consistente mesmo quando a IA falha.
 */
export async function generateEvidenceCopy(input: CopyInput): Promise<{ text: string; reasonCode: OfferReasonCode }> {
  const reasonCode = pickReasonCode(input.demand);
  const evidence = evidenceLine(reasonCode, input);
  const fallback = () => fallbackTemplate(reasonCode, input);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: enforceClaimFirewall(fallback(), reasonCode), reasonCode };

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 140,
      messages: [
        {
          role: "system",
          content:
            "Você escreve o trecho de abertura de uma mensagem de WhatsApp pra um grupo de ofertas (Descontos Chegando). Objetivo: gerar curiosidade real e vontade de clicar no link, usando técnica de venda de verdade — mas SÓ pode afirmar o que está no FATO fornecido, nunca invente estoque, prazo, urgência ou popularidade que não foi dita. Soe como uma pessoa real escrevendo pros amigos, 2-4 frases curtas, pode usar 1-2 emoji, sem parecer anúncio formal nem IA. Não inclua preço nem nome do produto (isso já vai formatado à parte). Não use aspas. Responda só o texto.",
        },
        { role: "user", content: `Fato real sobre esta oferta: ${evidence}\n\nProduto: ${input.productName}` },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return { text: enforceClaimFirewall(fallback(), reasonCode), reasonCode };
    return { text: enforceClaimFirewall(text, reasonCode), reasonCode };
  } catch (err) {
    console.error("[offerCopy] falha ao gerar copy via IA, usando fallback:", err);
    return { text: enforceClaimFirewall(fallback(), reasonCode), reasonCode };
  }
}
