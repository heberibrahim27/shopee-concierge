/**
 * Estado de conversa por chat, com isolamento explícito do fluxo normal
 * do BancaZAP: uma foto recebida no número não vira pedido de compra
 * sozinha — precisa do gatilho (ou já vir foto direto, ver orchestrator.ts).
 *
 * Persistência (13/09/2026): a sessão em si mora no Supabase agora — ver
 * src/lib/db/conciergeSessions.ts — pra sobreviver entre instâncias
 * serverless diferentes da Vercel (antes era um Map em memória, que se
 * perdia e fazia a conversa "resetar" quando a resposta demorava um
 * pouco mais ou a próxima mensagem caía numa instância diferente). Este
 * arquivo continua sendo a interface que o resto do concierge usa —
 * trocar a implementação de storage não muda quem chama.
 */
import {
  getConciergeSession,
  setConciergeSession,
  ConciergeSessionRow,
  ConciergeSessionStatus,
} from "../db/conciergeSessions";

export const TRIGGER_PHRASE =
  process.env.CONCIERGE_TRIGGER_PHRASE?.toUpperCase() ?? "QUERO ENCONTRAR";

export type SessionStatus = ConciergeSessionStatus;
export type ConciergeSession = ConciergeSessionRow;

export async function getSession(chatId: string): Promise<ConciergeSession> {
  return getConciergeSession(chatId);
}

export async function setSession(session: ConciergeSession): Promise<void> {
  await setConciergeSession(session);
}

export function isTriggerPhrase(text: string | undefined): boolean {
  if (!text) return false;
  return text.trim().toUpperCase().includes(TRIGGER_PHRASE);
}
