/**
 * Configuração central do roteador de confiança — nada aqui é fixo no
 * código por acaso: são os números que vamos calibrar com dado real
 * depois de rodar em produção (telemetria em orchestrator.ts).
 *
 * Todos os valores têm um default sensato mas podem ser sobrescritos por
 * variável de ambiente na Vercel, sem precisar de deploy novo de código.
 */

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CONCIERGE_CONFIG = {
  /**
   * confiancaGeral >= STRONG: segue direto com o resultado do modelo
   * econômico, sem escalar pro modelo avançado.
   */
  confidenceStrong: envFloat("CONCIERGE_CONFIDENCE_STRONG", 0.85),

  /**
   * confiancaGeral < WEAK: escala direto pro modelo avançado (baixa
   * confiança já na primeira análise, nem vale gastar com a busca antes).
   * Entre WEAK e STRONG: decide olhando os candidatos da Shopee também
   * (ver confidenceRouter.ts).
   */
  confidenceWeak: envFloat("CONCIERGE_CONFIDENCE_WEAK", 0.65),

  /**
   * Modelo usado como "perito" no escalonamento — GPT-6 Astra (lançado
   * 03/09/2026), bem mais caro que o modelo econômico (~$10/M tokens de
   * entrada, ~$50/M de saída), por isso só entra quando o roteador decide
   * que precisa.
   */
  expertModel: process.env.CONCIERGE_EXPERT_MODEL ?? "gpt-6-astra",

  /** Quantos candidatos (no máx.) mandar pro modelo avançado comparar. */
  expertCandidateLimit: Math.max(
    1,
    Math.round(envFloat("CONCIERGE_EXPERT_CANDIDATE_LIMIT", 8))
  ),
} as const;
