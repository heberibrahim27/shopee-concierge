/**
 * Envio de mensagem via API do Instagram (Instagram Messaging) — usado
 * pelo webhook em src/app/api/webhook/instagram/route.ts pra responder
 * quem comenta "QUERO" na resposta de um Story (ou comenta num post).
 * Gratuito (sem cobrança por mensagem, diferente do WhatsApp Business
 * API — confirmado em 2026-09-17).
 *
 * O token em INSTAGRAM_PAGE_ACCESS_TOKEN é do tipo "Instagram User token"
 * (começa com `IGAA...`, gerado pelo login direto do Instagram). Esse tipo
 * SÓ vale em graph.instagram.com -- em graph.facebook.com a Meta responde
 * "Cannot parse access token" (achado 2026-11-11: o código antigo chamava
 * graph.facebook.com, então nenhuma resposta teria saído nem pra testers).
 */
const GRAPH_HOST = "https://graph.instagram.com";
const GRAPH_VERSION = "v21.0";

function getInstagramAccessToken(): string {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "INSTAGRAM_PAGE_ACCESS_TOKEN não configurado no ambiente (.env) — gere no developers.facebook.com."
    );
  }
  return token;
}

async function postMessage(body: Record<string, unknown>): Promise<void> {
  const token = getInstagramAccessToken();
  const resp = await fetch(`${GRAPH_HOST}/${GRAPH_VERSION}/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Falha ao enviar mensagem via Instagram API (${resp.status}): ${text}`);
  }
}

/** DM normal, pra quem já abriu conversa (ex.: respondeu um Story). */
export async function sendInstagramMessage(params: { recipientId: string; text: string }): Promise<void> {
  await postMessage({ recipient: { id: params.recipientId }, message: { text: params.text } });
}

/**
 * "Resposta privada" a um COMENTÁRIO: manda uma DM pra quem comentou, sem
 * a pessoa ter aberto conversa antes. Regras da Meta: uma resposta privada
 * por comentário e só dentro de 7 dias do comentário.
 */
export async function sendPrivateReplyToComment(params: { commentId: string; text: string }): Promise<void> {
  await postMessage({ recipient: { comment_id: params.commentId }, message: { text: params.text } });
}
