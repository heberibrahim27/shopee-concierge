/**
 * Implementação do ChannelConnector para a Z-API (WhatsApp).
 *
 * Tudo que é específico da instância (id, token, client-token) vem de
 * variável de ambiente. Pra trocar de instância Z-API no futuro (ex:
 * separar do número do BancaZAP), basta trocar essas 3 variáveis — não
 * precisa mudar nenhuma linha de código aqui nem no núcleo.
 *
 * Formato exato do payload do webhook pode variar por tipo de evento;
 * ajuste parseIncoming conforme os payloads reais que chegarem no seu
 * endpoint (log o rawBody nas primeiras mensagens de teste).
 */
import { ChannelConnector, IncomingMessage, OutgoingImageMessage, OutgoingMessage } from "./types";

interface ZApiEnv {
  instanceId: string;
  token: string;
  clientToken: string;
}

function getZApiEnv(): ZApiEnv {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !token || !clientToken) {
    throw new Error(
      "ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN não configurados no ambiente (.env)."
    );
  }
  return { instanceId, token, clientToken };
}

/**
 * Payload típico de webhook de mensagem recebida da Z-API.
 * Confira o payload real no seu endpoint e ajuste os campos se necessário —
 * a Z-API pode variar o formato entre "ReceivedCallback" e outros eventos.
 */
interface ZApiWebhookBody {
  isStatusReply?: boolean;
  fromMe?: boolean;
  messageId?: string;
  phone?: string;
  momment?: number; // sic — a Z-API usa "momment" mesmo
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string };
}

export function createZApiConnector(): ChannelConnector {
  return {
    name: "zapi-whatsapp",

    parseIncoming(rawBody: unknown): IncomingMessage | null {
      const body = rawBody as ZApiWebhookBody;
      if (!body || !body.phone || !body.messageId) return null;

      return {
        channel: "zapi-whatsapp",
        chatId: body.phone,
        messageId: body.messageId,
        fromMe: Boolean(body.fromMe),
        text: body.text?.message ?? body.image?.caption,
        imageUrl: body.image?.imageUrl,
        timestamp: body.momment ?? Date.now(),
      };
    },

    async sendText(msg: OutgoingMessage): Promise<void> {
      const env = getZApiEnv();
      const url = `https://api.z-api.io/instances/${env.instanceId}/token/${env.token}/send-text`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": env.clientToken,
        },
        body: JSON.stringify({ phone: msg.chatId, message: msg.text }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Falha ao enviar mensagem via Z-API (${resp.status}): ${body}`);
      }
    },

    async sendImage(msg: OutgoingImageMessage): Promise<void> {
      const env = getZApiEnv();
      const url = `https://api.z-api.io/instances/${env.instanceId}/token/${env.token}/send-image`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": env.clientToken,
        },
        body: JSON.stringify({
          phone: msg.chatId,
          image: msg.imageUrl,
          caption: msg.caption,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Falha ao enviar imagem via Z-API (${resp.status}): ${body}`);
      }
    },
  };
}
