/**
 * Ranking do concierge — DIFERENTE do score comercial usado no plano antigo
 * de "oferta em massa". Aqui a ordem é:
 *   1) atender requisitos obrigatórios ditos pelo usuário (exigenciaUsuario)
 *   2) correspondência visual/funcional com o que foi observado na foto
 *      (comparação REAL de imagem via compareCandidatesVisually, quando
 *      disponível — ver compare.ts; cai pro heurístico textual só se a
 *      comparação visual não rodar, ex: sem OPENAI_API_KEY ou erro de API)
 *   3) proximidade da faixa de preço estimada, qualidade (nota) e preço
 *   4) comissão só como desempate entre opções igualmente úteis
 *
 * Cada resultado sai rotulado com o tipo de correspondência — nunca
 * "equivalente" sem essa confirmação. Candidatos marcados como
 * "nao_relacionado" pela comparação visual são descartados.
 */
import { ShopeeProductOffer } from "../shopee/types";
import { ImageObservation } from "./recognize";
import { VisualComparison } from "./compare";

export type MatchType = "modelo_identificado" | "alternativa_funcional" | "semelhante_visual";

export interface RankedCandidate {
  offer: ShopeeProductOffer;
  matchType: MatchType;
  score: number;
}

const MIN_SALES = 5; // remove itens sem histórico de venda nenhuma

export function rankCandidates(
  candidates: ShopeeProductOffer[],
  observation: ImageObservation,
  visualComparisons?: Map<string, VisualComparison>
): RankedCandidate[] {
  const filtered = candidates.filter((c) => {
    const hasEssentials = Boolean(c.productLink && c.offerLink && c.priceMin);
    const visual = visualComparisons?.get(c.itemId);
    if (visual?.matchType === "nao_relacionado") return false;
    return hasEssentials && c.sales >= MIN_SALES;
  });

  // Remove duplicado por loja+produto similar (dedupe simples por itemId)
  const seen = new Set<string>();
  const deduped = filtered.filter((c) => {
    if (seen.has(c.itemId)) return false;
    seen.add(c.itemId);
    return true;
  });

  const faixa = observation.faixaPrecoEstimadaBRL;

  const ranked = deduped.map((offer) => {
    const rating = parseFloat(offer.ratingStar || "0");
    const commission = parseFloat(offer.commission || "0");
    const price = parseFloat(offer.priceMin || "0");

    const visual = visualComparisons?.get(offer.itemId);
    const matchType: MatchType = visual
      ? (visual.matchType as MatchType)
      : observation.termosDeBusca.some((t) =>
          offer.productName.toLowerCase().includes(t.toLowerCase())
        )
      ? "alternativa_funcional"
      : "semelhante_visual";

    // bônus por tipo de correspondência (a comparação visual é o sinal
    // mais forte de relevância — precisa pesar mais que nota/comissão)
    const matchBonus =
      matchType === "modelo_identificado" ? 40 : matchType === "alternativa_funcional" ? 20 : 0;

    // penalidade por estar fora da faixa de preço estimada (quando houver
    // uma estimativa) — não descarta, só reordena pra priorizar o que faz
    // sentido de preço antes do que só bate a categoria
    let pricePenalty = 0;
    if (faixa && price > 0) {
      if (price < faixa.min) {
        pricePenalty = ((faixa.min - price) / faixa.min) * 15;
      } else if (price > faixa.max) {
        pricePenalty = ((price - faixa.max) / faixa.max) * 15;
      }
    }

    // score: relevância visual pesa mais; nota e demanda vêm depois;
    // comissão só como desempate
    const score =
      matchBonus +
      rating * 5 +
      Math.log10(offer.sales + 1) * 5 +
      commission * 0.5 -
      pricePenalty;

    return { offer, matchType, score };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
