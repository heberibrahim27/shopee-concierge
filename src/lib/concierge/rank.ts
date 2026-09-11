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
  // Quando a própria foto mostrava um preço legível (print de anúncio,
  // etiqueta), a faixa é ancorada num fato, não num chute — por isso a
  // penalidade por estar fora dela é bem mais forte (evita sugerir produto
  // 2-3x mais caro que o preço que a pessoa mostrou só porque tem mais
  // venda/nota; ver comentário em recognize.ts sobre o bug real que motivou isso)
  const priceIsAnchoredToVisiblePrice = typeof observation.precoVisivelNaFotoBRL === "number";
  const PRICE_PENALTY_MULTIPLIER = priceIsAnchoredToVisiblePrice ? 40 : 15;

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
        pricePenalty = ((faixa.min - price) / faixa.min) * PRICE_PENALTY_MULTIPLIER;
      } else if (price > faixa.max) {
        pricePenalty = ((price - faixa.max) / faixa.max) * PRICE_PENALTY_MULTIPLIER;
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

export interface HighlightedCandidate {
  label: string;
  candidate: RankedCandidate;
}

/**
 * Em vez de mandar os 3 melhores pelo score composto (que mistura relevância,
 * nota, venda e preço num número só — e por isso tendia a mandar 3 opções
 * parecidas, todas rotuladas só como "alternativa equivalente"), o Ibrahim
 * pediu pra mandar 3 opções com critério CLARO e diferente cada uma, pra
 * pessoa entender na hora por que aquela opção foi escolhida:
 *   1) menor preço
 *   2) melhor nota (desempate por quantidade de venda)
 *   3) mais vendida
 * Sempre dentro do conjunto já filtrado por relevância (o `ranked` recebido
 * aqui já veio de rankCandidates, que descarta "nao_relacionado" e itens sem
 * venda mínima) — nunca escolhe o mais barato/mais vendido geral, só entre o
 * que já faz sentido pra foto mandada.
 * Evita repetir o mesmo produto em duas categorias: se o mais barato também
 * for o mais vendido, por exemplo, a categoria "mais vendida" pula pro
 * próximo da lista que ainda não foi usado — assim a pessoa sempre recebe
 * até 3 produtos distintos, não o mesmo produto 2-3 vezes.
 */
export function pickHighlightedCandidates(ranked: RankedCandidate[]): HighlightedCandidate[] {
  const used = new Set<string>();

  const pick = (
    label: string,
    compare: (a: RankedCandidate, b: RankedCandidate) => number
  ): HighlightedCandidate | null => {
    const pool = ranked.filter((r) => !used.has(r.offer.itemId));
    if (pool.length === 0) return null;
    const best = [...pool].sort(compare)[0];
    used.add(best.offer.itemId);
    return { label, candidate: best };
  };

  const highlights: HighlightedCandidate[] = [];

  const porPreco = pick(
    "💰 Melhor preço",
    (a, b) => parseFloat(a.offer.priceMin) - parseFloat(b.offer.priceMin)
  );
  if (porPreco) highlights.push(porPreco);

  const porNota = pick("⭐ Melhor avaliada", (a, b) => {
    const ratingA = parseFloat(a.offer.ratingStar || "0");
    const ratingB = parseFloat(b.offer.ratingStar || "0");
    if (ratingB !== ratingA) return ratingB - ratingA;
    return b.offer.sales - a.offer.sales;
  });
  if (porNota) highlights.push(porNota);

  const porVendas = pick("🔥 Mais vendida", (a, b) => b.offer.sales - a.offer.sales);
  if (porVendas) highlights.push(porVendas);

  return highlights;
}
