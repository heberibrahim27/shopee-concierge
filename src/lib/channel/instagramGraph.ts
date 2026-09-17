/**
 * Envio de mensagem via Graph API da Meta (Instagram Messaging) — usado
 * pelo webhook em src/app/api/webhook/instagram/route.ts pra responder
 * quem comenta "QUERO" na resposta de um Story. Gratuito (sem cobrança
 * por mensagem, diferente do WhatsApp Business API — confirmado em
 * 2026-09-17).
 *
 * Requer um token de página com permissão `instagram_manage_messages`,
 * gerado no developers.facebook.com pro App vinculado à conta
 * @descontoschegando.
 */
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

export async function sendInstagramMessage(params: { recipientId: string; text: string }): Promise<void> {
  const token = getInstagramAccessToken();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: params.recipientId },
      message: { text: params.text },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Falha ao enviar mensagem via Instagram Graph API (${resp.status}): ${body}`);
  }
}
