/**
 * Cliente mínimo pra Bot API do Telegram — sem SDK, é só um POST simples
 * e bem documentado (ver memória project_telegram_channel_real_example).
 * Preparado antes do bot existir: sem TELEGRAM_BOT_TOKEN configurado,
 * `sendPhoto` lança um erro claro em vez de falhar silenciosamente.
 */
const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramSendResult {
  messageId: string;
}

export async function sendPhoto(caption: string, photoUrl: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID não configurados — peça pro Heber criar o bot via @BotFather, adicionar como admin do canal e mandar o token."
    );
  }

  const resp = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.ok) {
    throw new Error(`Telegram sendPhoto falhou (${resp.status}): ${JSON.stringify(json)}`);
  }
  return { messageId: String(json.result.message_id) };
}
