/**
 * Publicação direta no Telegram (Bot API oficial, sem Windsor -- não tem
 * conector telegram na Windsor, confirmado 2026-09-25). Gratuito, sem
 * CNPJ, 100% servidor. Precisa de TELEGRAM_BOT_TOKEN (criado uma vez via
 * @BotFather) e o bot precisa ser admin do canal de destino. Ver memória
 * project_multichannel_automation_research.
 */

const TELEGRAM_API = "https://api.telegram.org";

function requireToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN não configurado -- peça pro Heber criar o bot via @BotFather e adicionar como variável de ambiente."
    );
  }
  return token;
}

export interface TelegramPhotoPost {
  chatId: string; // ex: "@descontoschegando" ou "-100123456789"
  photoUrl: string;
  caption: string;
  buttonText?: string;
  buttonUrl?: string;
}

/**
 * Publica uma foto com legenda (e opcionalmente um botão de link) num
 * canal/grupo onde o bot é admin. Retorna o message_id publicado.
 */
export async function postTelegramPhoto(post: TelegramPhotoPost): Promise<number> {
  const token = requireToken();
  const body: Record<string, unknown> = {
    chat_id: post.chatId,
    photo: post.photoUrl,
    caption: post.caption,
    parse_mode: "HTML",
  };
  if (post.buttonText && post.buttonUrl) {
    body.reply_markup = {
      inline_keyboard: [[{ text: post.buttonText, url: post.buttonUrl }]],
    };
  }
  const resp = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok || !json?.ok) {
    throw new Error(`Telegram sendPhoto falhou: ${JSON.stringify(json)}`);
  }
  return json.result.message_id;
}
