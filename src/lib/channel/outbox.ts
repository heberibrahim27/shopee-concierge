/**
 * Conector WhatsApp "fila": em vez de chamar um serviço pago (Z-API), grava a
 * mensagem em `whatsapp_outbox`. Quem envia de fato é o programa local
 * tools/whatsapp-sender (Baileys, gratuito), que lê a fila e manda pelo
 * WhatsApp do dono. Ligado por WHATSAPP_PROVIDER=outbox.
 *
 * Consequência: "enviado" aqui significa "entrou na fila". Se o computador
 * do sender estiver desligado, as mensagens esperam e expiram em 3h (o
 * sender descarta o que ficou velho, pra não soltar oferta atrasada).
 *
 * `sendLink` não tem card de prévia customizado: manda a foto com a
 * mensagem na legenda.
 */
import { getDbFresh } from "../db/client";
import type { ChannelConnector, IncomingMessage, OutgoingImageMessage, OutgoingLinkMessage, OutgoingMessage } from "./types";

async function enqueue(row: { chat_id: string; kind: "text" | "image"; text?: string; image_url?: string; caption?: string }): Promise<void> {
  const { error } = await getDbFresh().from("whatsapp_outbox").insert(row);
  if (error) throw new Error(`Falha ao enfileirar mensagem de WhatsApp: ${error.message}`);
}

export function createOutboxConnector(): ChannelConnector {
  return {
    name: "outbox-whatsapp",

    // O bot de reconhecimento por foto (webhook) não roda nesse modo.
    parseIncoming(_rawBody: unknown): IncomingMessage | null {
      return null;
    },

    async sendText(msg: OutgoingMessage): Promise<void> {
      await enqueue({ chat_id: msg.chatId, kind: "text", text: msg.text });
    },

    async sendImage(msg: OutgoingImageMessage): Promise<void> {
      await enqueue({ chat_id: msg.chatId, kind: "image", image_url: msg.imageUrl, caption: msg.caption ?? "" });
    },

    async sendLink(msg: OutgoingLinkMessage): Promise<void> {
      await enqueue({ chat_id: msg.chatId, kind: "image", image_url: msg.imageUrl, caption: msg.message });
    },
  };
}
