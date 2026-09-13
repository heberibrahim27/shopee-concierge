/**
 * Cortes e score inicial de "deal candidate", exatamente conforme a
 * seção 7.3 do Plano Diretor (Descontos_Chegando_Plano_Diretor.docx).
 *
 * IMPORTANTE — limitação conhecida da primeira coleta (Etapa 1):
 * dois dos cinco cortes do plano dependem de HISTÓRICO MULTI-DIA, que só
 * existe a partir da Etapa 3 (Confiança e verificação de preço):
 *   - "Histórico": 7 dias distintos ou 10 observações.
 *   - "Verificação": duas leituras consistentes.
 * Numa primeira coleta (1 única leitura por produto) esses dois cortes
 * NUNCA passam de verdade — por isso não são tratados como corte
 * eliminatório aqui ainda, e o campo `historicalConfidence` do score fica
 * fixo em 0 (nenhuma confiança de histórico ainda). Os candidatos
 * selecionados aqui devem ficar com status "discovered", nunca
 * "verified" ou "eligible" — esses status só se aplicam depois que o
 * pipeline de histórico (Etapa 3) rodar de verdade sobre eles.
 */
import { ShopeeProductOffer } from "../shopee/types";

export interface HardCuts {
  minPriceDiscountRate: number; // % — regra inicial: 15
  minRatingStar: number; // regra inicial: 4.5
  minSales: number; // placeholder genérico até termos corte por categoria
}

export const DEFAULT_HARD_CUTS: HardCuts = {
  minPriceDiscountRate: 15,
  minRatingStar: 4.5,
  // O plano diz "mínimo por categoria, não usar corte único para tudo".
  // Sem categorização automática ainda, 50 vendas é um piso conservador
  // só pra não deixar passar item sem nenhuma tração real — deve ser
  // revisto assim que houver categorização (Etapa 2/3).
  minSales: 50,
};

export interface ScoreBreakdown {
  quedaHistorica: number; // 0-40 (proxy: priceDiscountRate — ver nota acima)
  notaEAvaliacoes: number; // 0-25
  vendas: number; // 0-20
  confiancaHistorico: number; // 0-10 (fixo em 0 na primeira coleta)
  comissao: number; // 0-5
  total: number; // 0-100
}

export interface ScoredCandidate {
  offer: ShopeeProductOffer;
  passesHardCuts: boolean;
  failedCuts: string[];
  score: ScoreBreakdown;
  passesScoreGate: boolean; // score.total >= 75
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Aplica os cortes e calcula o score de um ShopeeProductOffer.
 * Não decide sozinho quem "passa" pra publicação — isso é responsabilidade
 * de quem chama (Etapa 1 só seleciona 3 candidatos pra apresentar evidência
 * e pedir revisão humana, não publica nada automaticamente).
 */
export function scoreOffer(offer: ShopeeProductOffer, cuts: HardCuts = DEFAULT_HARD_CUTS): ScoredCandidate {
  const discountRate = offer.priceDiscountRate ?? 0;
  const rating = Number(offer.ratingStar ?? "0");
  const sales = offer.sales ?? 0;
  const commissionRate = Number(offer.commissionRate ?? "0");

  const failedCuts: string[] = [];
  if (discountRate < cuts.minPriceDiscountRate) {
    failedCuts.push(`queda de preço ${discountRate}% < ${cuts.minPriceDiscountRate}%`);
  }
  if (rating < cuts.minRatingStar) {
    failedCuts.push(`nota ${rating} < ${cuts.minRatingStar}`);
  }
  if (sales < cuts.minSales) {
    failedCuts.push(`vendas ${sales} < ${cuts.minSales}`);
  }
  // Histórico e Verificação: não avaliados aqui (ver nota no topo do arquivo).

  // Composição: 40 queda histórica + 25 nota/avaliações + 20 vendas +
  // 10 confiança do histórico + 5 comissão.
  const quedaHistorica = clamp((discountRate / 50) * 40, 0, 40); // 50%+ de desconto = pontuação máxima
  const notaEAvaliacoes = clamp(((rating - 3) / 2) * 25, 0, 25); // nota 3.0->0, 5.0->25
  const vendas = clamp((Math.log10(sales + 1) / Math.log10(5000)) * 20, 0, 20); // escala log, 5000 vendas = máximo
  const confiancaHistorico = 0; // fixo — ver nota no topo
  const comissao = clamp((commissionRate / 0.20) * 5, 0, 5); // API usa fração: 0.20 = 20%

  const total = Math.round((quedaHistorica + notaEAvaliacoes + vendas + confiancaHistorico + comissao) * 100) / 100;

  return {
    offer,
    passesHardCuts: failedCuts.length === 0,
    failedCuts,
    score: { quedaHistorica, notaEAvaliacoes, vendas, confiancaHistorico, comissao, total },
    passesScoreGate: total >= 75,
  };
}

/**
 * Ordena por score desc e devolve só os que passam nos cortes duros E no
 * score mínimo (75/100 — seção 7.3: "só publica quando todos os cortes
 * passam"), limitado a `limit` (Etapa 1: 3 candidatos).
 *
 * Correção (revisão do Codex, 13/09/2026): a versão anterior só filtrava
 * `passesHardCuts`, deixando o corte de score sem efeito — uma oferta com
 * score abaixo de 75 podia acabar virando link. Agora os dois filtros são
 * obrigatórios.
 */
export function selectTopCandidates(
  offers: ShopeeProductOffer[],
  limit = 3,
  cuts: HardCuts = DEFAULT_HARD_CUTS
): ScoredCandidate[] {
  return offers
    .map((o) => scoreOffer(o, cuts))
    .filter((c) => c.passesHardCuts && c.passesScoreGate)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);
}
