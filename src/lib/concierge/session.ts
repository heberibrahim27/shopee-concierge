/**
 * Estado de conversa por chat, com isolamento explícito do fluxo normal
 * do BancaZAP: uma foto recebida no número não vira pedido de compra
 * sozinha — precisa do gatilho.
 *
 * Implementação em memória (serve pro piloto/teste fechado). Pra produção
 * real com múltiplas instâncias/serverless, troque o Map por uma tabela
 * no Supabase (chat_id, status, dados, updated_at) — a interface abaixo
 * (getSession/setSession) foi pensada pra isso ser só uma troca de
 * implementação, sem mudar quem chama.
 */

export const TRIGGER_PHRASE =
  process.env.CONCIERGE_TRIGGER_PHRASE?.toUpperCase() ?? "QUERO ENCONTRAR";

export type SessionStatus =
  | "idle" // fora do fluxo do concierge — ignorar, é tráfego normal do BancaZAP
  | "awaiting_photo" // gatilho recebido, esperando a foto
  | "awaiting_clarification" // já reconheceu algo, esperando resposta de uma pergunta
  | "processing"; // buscando/rankeando na Shopee

export interface ConciergeSession {
  chatId: string;
  status: SessionStatus;
  /** Observações estruturadas acumuladas nesta conversa (ver recognize.ts) */
  observation?: unknown;
  pendingQuestion?: string;
  updatedAt: number;
}

const sessions = new Map<string, ConciergeSession>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min de inatividade encerra a sessão

export function getSession(chatId: string): ConciergeSession {
  const existing = sessions.get(chatId);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    return existing;
  }
  const fresh: ConciergeSession = { chatId, status: "idle", updatedAt: Date.now() };
  sessions.set(chatId, fresh);
  return fresh;
}

export function setSession(session: ConciergeSession): void {
  session.updatedAt = Date.now();
  sessions.set(session.chatId, session);
}

export function isTriggerPhrase(text: string | undefined): boolean {
  if (!text) return false;
  return text.trim().toUpperCase().includes(TRIGGER_PHRASE);
}
