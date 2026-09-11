/**
 * Dedupe simples de eventos de webhook. A Z-API pode reenviar o mesmo
 * evento ou notificar mensagens do próprio número dependendo da config —
 * isso evita processar a mesma mensagem duas vezes.
 *
 * Em memória (ok pro piloto). Pra produção com múltiplas instâncias
 * serverless, troque por uma tabela no Supabase com unique constraint
 * em message_id + índice de expiração.
 */
const seen = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

export function isDuplicate(messageId: string): boolean {
  cleanup();
  if (seen.has(messageId)) return true;
  seen.set(messageId, Date.now());
  return false;
}

function cleanup() {
  const now = Date.now();
  for (const [id, ts] of seen) {
    if (now - ts > DEDUPE_TTL_MS) seen.delete(id);
  }
}
