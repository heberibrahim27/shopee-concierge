/**
 * Webhook oficial de mensagens do Instagram (Graph API da Meta).
 *
 * Fluxo: alguém responde uma Story nossa com "QUERO" (isso vira uma
 * mensagem direta pro nosso Instagram, confirmado ao vivo em 2026-09-17
 * abrindo a caixa de entrada) → a Meta chama este endpoint via POST →
 * detectamos a palavra-chave → respondemos com o link de /hoje.
 *
 * Setup necessário no developers.facebook.com (ver CONTINUIDADE.md):
 * 1. App com o produto "Instagram" configurado, vinculado à página/conta
 *    @descontoschegando.
 * 2. Token de página com permissão `instagram_manage_messages`, salvo em
 *    INSTAGRAM_PAGE_ACCESS_TOKEN.
 * 3. Webhook apontando pra esta URL, assinando o campo "messages",
 *    verify token = INSTAGRAM_WEBHOOK_VERIFY_TOKEN.
 *
 * A API em si é gratuita (sem cobrança por mensagem) — confirmado
 * 2026-09-17.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendInstagramMessage } from "@/lib/channel/instagramGraph";
import { isDuplicate } from "@/lib/dedupe";

export const runtime = "nodejs";
export const maxDuration = 30;

const KEYWORD = "quero";
const REPLY_TEXT =
  "Prontinho! 🎁 Aqui está o link com a oferta e todas as ofertas de hoje: https://descontochegando.com.br/hoje";

interface InstagramMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

interface InstagramWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; messaging?: InstagramMessagingEvent[] }>;
}

// GET: verificação do webhook exigida pela Meta ao configurar a URL —
// devolve hub.challenge se o verify_token bater com o nosso.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "verify_token inválido" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as InstagramWebhookBody;

  if (body.object !== "instagram") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const text = event.message?.text;
      const mid = event.message?.mid;

      // is_echo = mensagem que NÓS mandamos (o próprio webhook nos
      // notifica disso) — nunca responder a nós mesmos.
      if (!senderId || !text || event.message?.is_echo) continue;
      if (mid && isDuplicate(mid)) continue;
      if (!text.toLowerCase().includes(KEYWORD)) continue;

      try {
        await sendInstagramMessage({ recipientId: senderId, text: REPLY_TEXT });
      } catch (err) {
        console.error("[webhook/instagram] falha ao responder:", err);
      }
    }
  }

  // sempre 200 rápido — a Meta re-tenta em loop se não receber 200
  return NextResponse.json({ ok: true });
}
