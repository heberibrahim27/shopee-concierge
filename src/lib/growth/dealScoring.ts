/**
 * Cortes e score inicial de "deal candidate". Composição original vinha
 * da seção 7.3 do Plano Diretor (Descontos_Chegando_Plano_Diretor.docx),
 * revisada de verdade em 2026-09-24 (ver nota abaixo em `scoreOffer`).
 *
 * IMPORTANTE — limitação conhecida da primeira coleta (Etapa 1):
 * um dos cortes do plano depende de HISTÓRICO MULTI-DIA, que só existe a
 * partir da Etapa 3 (Confiança e verificação de preço): "Histórico": 7
 * dias distintos ou 10 observações. Numa primeira coleta (1 única
 * leitura por produto) esse corte NUNCA passa de verdade — por isso não
 * é tratado como corte eliminatório aqui ainda, e o campo
 * `confiancaHistorico` do score fica fixo em 0 (nenhuma confiança de
 * histórico ainda) e é excluído do denominador de normalização (ver
 * `maxAchievable`). Os candidatos selecionados aqui devem ficar com
 * status "discovered", nunca "verified" ou "eligible" — esses status só
 * se aplicam depois que o pipeline de histórico (Etapa 3) rodar de
 * verdade sobre eles.
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
  /** 0-25 — posição de preço contra OUTROS resultados da MESMA busca (ver nota em scoreOffer). null quando não tinha comparável suficiente. */
  precoRelativoComparaveis: number | null;
  notaEAvaliacoes: number; // 0-25
  vendas: number; // 0-30
  confiancaHistorico: number; // 0-15 (fixo em 0 na primeira coleta)
  comissao: number; // 0-5
  /** Soma dos pesos das dimensões que RÉALMENTE tinham dado pra calcular nesta oferta (ver nota abaixo sobre normalização). */
  maxAchievable: number;
  total: number; // normalizado pra 0-100 mesmo quando alguma dimensão ficou de fora
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
 *
 * @param cohortMedianPrice Mediana de preço dos OUTROS resultados da
 * MESMA busca por palavra-chave (calculado por quem chama, ver
 * `source-deals/route.ts`) — usado pra `precoRelativoComparaveis`.
 * Omitir quando não há comparáveis suficientes (< 4 resultados na
 * busca); nesse caso a dimensão fica de fora do score (não vira 0
 * escondido, é excluída do denominador — mesma lógica de
 * `confiancaHistorico`).
 */
export function scoreOffer(offer: ShopeeProductOffer, cuts: HardCuts = DEFAULT_HARD_CUTS, cohortMedianPrice?: number): ScoredCandidate {
  const discountRate = offer.priceDiscountRate ?? 0;
  const rating = Number(offer.ratingStar ?? "0");
  const sales = offer.sales ?? 0;
  const commissionRate = Number(offer.commissionRate ?? "0");
  const priceMin = Number(offer.priceMin ?? "0");

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
  // Histórico: não avaliado aqui (ver nota no topo do arquivo).

  // Composição (revisada 2026-09-24 — achado real do Heber, duas
  // rodadas seguidas):
  //
  // 1ª correção: "não vejo produto que tá vendendo no orgânico ter que
  // dar 50% de desconto pra vender" — o peso original (40 de 100) do
  // desconto sozinho dominava tanto que produto com venda/nota
  // excelentes e desconto moderado nunca passava.
  //
  // 2ª correção, mais funda: "quando eu subo um produto na Shopee eu
  // coloco o preço dele cheio e dou o desconto pra aparecer no topo das
  // pesquisas, isso é estratégia que sellers usam". Ou seja, o campo
  // `priceDiscountRate` não é um sinal de valor real — é um número que
  // o PRÓPRIO SELLER infla e desconta de propósito pra ranquear melhor
  // no algoritmo da Shopee. Continuar pontuando por ele é premiar quem
  // jogou melhor esse jogo, não quem tem o preço genuinamente melhor.
  //
  // Removido como dimensão de score (continua existindo só como CORTE
  // mínimo em `cuts.minPriceDiscountRate`, filtro leve, não nota).
  // Substituído por `precoRelativoComparaveis`: preço deste item contra
  // a MEDIANA dos outros resultados da MESMA busca por palavra-chave —
  // ex. "tv 64 polegadas" traz ~10 TVs comparáveis na mesma chamada,
  // sem custo extra de API. Uma TV a R$3k quando as outras da mesma
  // busca custam R$5k é oportunidade real, differente de "desconto de
  // 50%" que o próprio seller decidiu mostrar.
  let precoRelativoComparaveis: number | null = null;
  if (cohortMedianPrice && cohortMedianPrice > 0 && priceMin > 0) {
    const pctAbaixoDaMediana = ((cohortMedianPrice - priceMin) / cohortMedianPrice) * 100; // negativo = mais caro que a mediana
    precoRelativoComparaveis = clamp((pctAbaixoDaMediana / 40) * 25, 0, 25); // 40%+ abaixo da mediana = pontuação máxima; acima da mediana = 0, nunca negativo
  }
  const notaEAvaliacoes = clamp(((rating - 3) / 2) * 25, 0, 25); // nota 3.0->0, 5.0->25
  const vendas = clamp((Math.log10(sales + 1) / Math.log10(5000)) * 30, 0, 30); // escala log, 5000 vendas = máximo
  const confiancaHistorico = 0; // fixo — ver nota no topo. EXCLUÍDO do denominador abaixo, não fica de peso morto.
  const comissao = clamp((commissionRate / 0.20) * 5, 0, 5); // API usa fração: 0.20 = 20%

  // Normaliza pela soma dos pesos das dimensões que RÉALMENTE deram pra
  // medir nesta oferta — produto sem histórico OU sem comparáveis
  // suficientes é julgado pelo que dá pra saber sobre ele hoje, não
  // penalizado por um dado que não existe.
  const weights = { precoRelativoComparaveis: 25, notaEAvaliacoes: 25, vendas: 30, confiancaHistorico: 15, comissao: 5 };
  const hasHistoricalConfidence = confiancaHistorico > 0; // sempre false hoje — documentado, não escondido
  const maxAchievable =
    (precoRelativoComparaveis !== null ? weights.precoRelativoComparaveis : 0) +
    weights.notaEAvaliacoes +
    weights.vendas +
    weights.comissao +
    (hasHistoricalConfidence ? weights.confiancaHistorico : 0);
  const rawSum = (precoRelativoComparaveis ?? 0) + notaEAvaliacoes + vendas + confiancaHistorico + comissao;
  const total = Math.round((rawSum / maxAchievable) * 100 * 100) / 100;

  return {
    offer,
    passesHardCuts: failedCuts.length === 0,
    failedCuts,
    score: { precoRelativoComparaveis, notaEAvaliacoes, vendas, confiancaHistorico, comissao, maxAchievable, total },
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
 *
 * @param cohortMedianPriceByItemId Mediana de preço da busca de origem
 * de cada oferta, por itemId (ver `source-deals/route.ts`) — repassado
 * pra `scoreOffer` calcular `precoRelativoComparaveis`.
 */
export function selectTopCandidates(
  offers: ShopeeProductOffer[],
  limit = 3,
  cuts: HardCuts = DEFAULT_HARD_CUTS,
  cohortMedianPriceByItemId?: Map<string, number>
): ScoredCandidate[] {
  return offers
    .map((o) => scoreOffer(o, cuts, cohortMedianPriceByItemId?.get(o.itemId)))
    .filter((c) => c.passesHardCuts && c.passesScoreGate)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);
}
