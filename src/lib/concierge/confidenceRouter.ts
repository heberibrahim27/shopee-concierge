/**
 * Roteador de confiança — decide se o resultado do modelo econômico
 * (recognize.ts + compare.ts/rank.ts) já é bom o suficiente pra responder,
 * ou se precisa escalar pro modelo avançado (ver expertVision.ts).
 *
 * Critérios de escalonamento (baseados no que foi combinado com o Astra):
 *  - confiança geral da primeira análise abaixo do threshold "fraco";
 *  - nenhum candidato relevante sobrou depois do ranking;
 *  - o melhor candidato só é "parecido" (nunca chegou a "alternativa" ou
 *    "modelo identificado") — sinal de que a busca/comparação não achou
 *    nada realmente compatível;
 *  - os dois melhores candidatos estão muito próximos em score, ou seja,
 *    o ranking não tem um vencedor claro.
 *
 * Os thresholds vêm de config.ts (configuráveis por env var) — nada fixo
 * aqui de propósito, pra dar pra calibrar depois com dado real.
 */
import { ImageObservation } from "./recognize";
import { RankedCandidate } from "./rank";
import { CONCIERGE_CONFIG } from "./config";

export interface RouterDecision {
  escalate: boolean;
  motivo: string;
}

// margem mínima de score entre o 1º e o 2º candidato pra considerar que
// há um vencedor claro (evita escalar por diferença insignificante)
const MIN_SCORE_MARGIN = 8;

export function decideEscalation(
  observation: ImageObservation,
  ranked: RankedCandidate[]
): RouterDecision {
  const confianca = observation.confiancaGeral;

  if (typeof confianca === "number" && confianca < CONCIERGE_CONFIG.confidenceWeak) {
    return { escalate: true, motivo: `confianca_inicial_baixa (${confianca.toFixed(2)})` };
  }

  if (ranked.length === 0) {
    return { escalate: true, motivo: "nenhum_candidato_relevante" };
  }

  const top = ranked[0];
  const second = ranked[1];

  if (top.matchType === "semelhante_visual") {
    return { escalate: true, motivo: "melhor_candidato_so_semelhante" };
  }

  if (second && Math.abs(top.score - second.score) < MIN_SCORE_MARGIN) {
    return { escalate: true, motivo: "candidatos_muito_proximos" };
  }

  if (typeof confianca === "number" && confianca >= CONCIERGE_CONFIG.confidenceStrong) {
    return { escalate: false, motivo: `confianca_forte (${confianca.toFixed(2)})` };
  }

  if (typeof confianca === "number" && confianca < CONCIERGE_CONFIG.confidenceStrong) {
    // zona intermediária: já tem candidato com correspondência boa e sem
    // ambiguidade de ranking — aceita, mas registra que foi zona cinzenta
    return { escalate: false, motivo: `confianca_intermediaria_aceita (${confianca.toFixed(2)})` };
  }

  // confiancaGeral ausente (ex: chamador antigo/teste) — decide só pelos
  // sinais do ranking, já cobertos acima; se chegou até aqui, aceita
  return { escalate: false, motivo: "sem_confianca_informada_ranking_ok" };
}
