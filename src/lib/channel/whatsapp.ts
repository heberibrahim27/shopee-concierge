/**
 * Fábrica do conector de WhatsApp.
 *  - WHATSAPP_PROVIDER=outbox -> fila no banco + programa local gratuito
 *    (ver outbox.ts e tools/whatsapp-sender).
 *  - qualquer outro valor (ou ausente) -> Z-API, o comportamento original
 *    (assinatura encerrada em out/2026; fica só como caminho de volta).
 */
import type { ChannelConnector } from "./types";
import { createZApiConnector } from "./zapi";
import { createOutboxConnector } from "./outbox";

export function whatsappProvider(): "outbox" | "zapi" {
  return process.env.WHATSAPP_PROVIDER === "outbox" ? "outbox" : "zapi";
}

/** Há provedor de WhatsApp configurado no ambiente? */
export function whatsappConfigured(): boolean {
  return whatsappProvider() === "outbox" ? true : Boolean(process.env.ZAPI_INSTANCE_ID);
}

export function createWhatsAppConnector(): ChannelConnector {
  return whatsappProvider() === "outbox" ? createOutboxConnector() : createZApiConnector();
}

/**
 * Link de convite do grupo (https://chat.whatsapp.com/...).
 * `WHATSAPP_GROUP_INVITE_URL` tem prioridade e é obrigatório no modo outbox
 * (o sender local não responde a perguntas em tempo real). Na Z-API é
 * buscado ao vivo, pra acompanhar se o grupo for recriado.
 */
export async function getGroupInviteLink(groupId: string): Promise<string> {
  const fixed = process.env.WHATSAPP_GROUP_INVITE_URL;
  if (fixed) return fixed;

  if (whatsappProvider() === "outbox") {
    throw new Error("WHATSAPP_GROUP_INVITE_URL não configurado (obrigatório com WHATSAPP_PROVIDER=outbox).");
  }

  const resp = await fetch(
    `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/group-invitation-link/${groupId}`,
    { headers: { "Client-Token": process.env.ZAPI_CLIENT_TOKEN ?? "" } }
  );
  const json = await resp.json();
  if (!resp.ok || !json?.invitationLink) throw new Error(`sem invitationLink: ${JSON.stringify(json)}`);
  return json.invitationLink as string;
}
