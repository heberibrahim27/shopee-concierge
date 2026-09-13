/**
 * Saúde da comparação visual — janela rolante simples (1 linha no
 * Supabase) pra detectar quando a comparação visual está SISTEMICAMENTE
 * degradada (rate limit da OpenAI, chave expirada/revogada, mudança no
 * formato de resposta da API) em vez de tratar cada falha isolada como um
 * evento pontual do fallback textual. Sugestão do debate técnico com o
 * ChatGPT (13/09/2026): "no_match legítimo != erro técnico" — sem separar
 * as duas coisas, um período de instabilidade parece só "a Shopee trazendo
 * candidato ruim" em vez de um problema de infraestrutura.
 *
 * Importante: isso NUNCA decide nada de negócio por request (isso
 * continua em confidenceRouter.ts, por request). Só decide MODO SEGURO —
 * pular a tentativa de comparação visual/escalonamento pro perito (que
 * também tende a falhar pela mesma causa, ex: rate limit da OpenAI) e
 * responder com transparência em vez de gastar caro só pra, de novo, não
 * achar nada — ver TEXTO_MODO_SEGURO_VISUAL em reply.ts.
 *
 * A lógica de decisão (nextHealthWindow/isDegraded) é pura e testável sem
 * rede/Supabase — só o I/O (record/isVisualCompareDegraded) toca o banco,
 * e é resiliente a falha dele (nunca derruba a resposta, trata como
 * saudável se não conseguir ler/escrever).
 */
import { getDb } from "../db/client";
import { VisualCompareOutcome } from "./compare";

export const VISUAL_HEALTH_WINDOW_MS = 10 * 60 * 1000; // 10 min de janela rolante
export const VISUAL_HEALTH_MIN_SAMPLE = 6; // não decide nada com poucas amostras
export const VISUAL_HEALTH_FAILURE_RATE_THRESHOLD = 0.6; // 60%+ de falha na janela = degradado

export interface VisualHealthWindow {
  windowStart: number; // epoch ms
  attempts: number;
  failures: number;
}

/** "sem_candidatos" não é uma tentativa real (não chegou a chamar a API) — não conta pra saúde. */
export function isCountableAttempt(outcome: VisualCompareOutcome): boolean {
  return outcome.status !== "sem_candidatos";
}

/**
 * Próximo estado da janela depois de um resultado novo — reseta a janela
 * sozinha por tempo (não precisa de job de limpeza), pura o suficiente pra
 * testar sem Supabase.
 */
export function nextHealthWindow(
  prev: VisualHealthWindow | null,
  outcome: VisualCompareOutcome,
  now: number
): VisualHealthWindow {
  const windowExpired = !prev || now - prev.windowStart >= VISUAL_HEALTH_WINDOW_MS;
  const base: VisualHealthWindow = windowExpired ? { windowStart: now, attempts: 0, failures: 0 } : prev;

  if (!isCountableAttempt(outcome)) return base;

  return {
    windowStart: base.windowStart,
    attempts: base.attempts + 1,
    failures: base.failures + (outcome.status === "ok" ? 0 : 1),
  };
}

/** true quando a janela atual tem amostra suficiente e taxa de falha alta o bastante pra considerar degradado. */
export function isDegraded(window: VisualHealthWindow | null, now: number): boolean {
  if (!window) return false;
  if (now - window.windowStart >= VISUAL_HEALTH_WINDOW_MS) return false; // janela velha, não decide com dado velho
  if (window.attempts < VISUAL_HEALTH_MIN_SAMPLE) return false;
  return window.failures / window.attempts >= VISUAL_HEALTH_FAILURE_RATE_THRESHOLD;
}

interface HealthDbRow {
  window_start: string;
  attempts: number;
  failures: number;
}

async function readWindow(): Promise<VisualHealthWindow | null> {
  const db = getDb();
  const { data, error } = await db
    .from("concierge_visual_health")
    .select("window_start, attempts, failures")
    .eq("id", 1)
    .maybeSingle<HealthDbRow>();
  if (error || !data) return null;
  return { windowStart: new Date(data.window_start).getTime(), attempts: data.attempts, failures: data.failures };
}

/** Registra o resultado de UMA tentativa de comparação visual na janela de saúde. Nunca lança — pior caso, só loga e segue sem métrica. */
export async function recordVisualCompareOutcome(outcome: VisualCompareOutcome): Promise<void> {
  if (!isCountableAttempt(outcome)) return;
  try {
    const prev = await readWindow();
    const next = nextHealthWindow(prev, outcome, Date.now());
    const db = getDb();
    const { error } = await db.from("concierge_visual_health").upsert({
      id: 1,
      window_start: new Date(next.windowStart).toISOString(),
      attempts: next.attempts,
      failures: next.failures,
    });
    if (error) console.error("[concierge][visual-health] falha ao salvar janela de saúde:", error.message);
  } catch (err) {
    console.error("[concierge][visual-health] erro inesperado registrando saúde (segue sem métrica):", err);
  }
}

/** true = circuito aberto, modo seguro. Resiliente: qualquer falha de leitura assume saudável (circuito fechado), nunca derruba a resposta. */
export async function isVisualCompareDegraded(): Promise<boolean> {
  try {
    const window = await readWindow();
    return isDegraded(window, Date.now());
  } catch (err) {
    console.error("[concierge][visual-health] erro inesperado lendo saúde (assume saudável):", err);
    return false;
  }
}
