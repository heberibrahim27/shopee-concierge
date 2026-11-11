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
 * 4. Chave secreta do app (Configurações do app → Básico → "Chave Secreta
 *    do Aplicativo"), salva em INSTAGRAM_APP_SECRET — usada pra validar
 *    a assinatura X-Hub-Signature-256 que a Meta manda em todo POST.
 *
 * A API em si é gratuita (sem cobrança por mensagem) — confirmado
 * 2026-09-17.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendInstagramMessage, sendPrivateReplyToComment } from "@/lib/channel/instagramGraph";
import { isDuplicate } from "@/lib/dedupe";
import { getDbFresh } from "@/lib/db/client";

// A Meta assina o corpo bruto do POST com o App Secret (HMAC SHA-256) e
// manda o resultado no header X-Hub-Signature-256. Sem validar isso,
// qualquer um que descubra a URL pode mandar payload falso pro webhook.
function hasValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export const runtime = "nodejs";
export const maxDuration = 30;

const KEYWORD = "quero";
const FALLBACK_REPLY_TEXT =
  "Prontinho! 🎁 Aqui está o link com a oferta e todas as ofertas de hoje: https://descontochegando.com.br/hoje";

interface InstagramMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    // Presente quando a mensagem é resposta a um Story nosso — é o media
    // id do Story, o mesmo valor que a Windsor devolveu quando postamos
    // (ver extractMediaId em src/app/api/cron/publish-product/route.ts).
    // É assim que sabemos QUAL produto a pessoa quis dizer "quero", sem
    // precisar caçar manualmente qual Story ela respondeu.
    reply_to?: { story?: { id?: string; url?: string } };
  };
}

// Acha o produto do Story respondido (via social_posts.media_id) e monta
// uma resposta com o link de afiliado específico dele. Sem match (Story
// antigo, apagado, ou resposta fora do nosso fluxo automático), cai pro
// link genérico de /hoje.
async function buildReplyText(storyMediaId: string | undefined): Promise<string> {
  if (!storyMediaId) return FALLBACK_REPLY_TEXT;

  try {
    const db = getDbFresh();
    const { data } = await db
      .from("social_posts")
      .select("deal_candidates(products(product_name), offer_snapshots(offer_link))")
      .eq("media_id", storyMediaId)
      .eq("post_type", "story")
      .maybeSingle();

    const dc = (data as any)?.deal_candidates;
    const link = dc?.offer_snapshots?.offer_link;
    const name = dc?.products?.product_name;
    if (link) {
      return `Prontinho! 🎁 Aqui está o link do ${name ?? "produto"}: ${link}`;
    }
  } catch (err) {
    console.error("[webhook/instagram] falha ao buscar produto do story:", err);
  }
  return FALLBACK_REPLY_TEXT;
}

// Evento de COMENTARIO (campo "comments" do webhook): chega em entry[].changes[].
interface InstagramCommentChange {
  field?: string;
  value?: {
    id?: string; // id do comentario
    text?: string;
    parent_id?: string; // presente quando e resposta a outro comentario
    from?: { id?: string; username?: string };
    media?: { id?: string; media_product_type?: string };
  };
}

interface InstagramWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; messaging?: InstagramMessagingEvent[]; changes?: InstagramCommentChange[] }>;
}

// Resposta por DM a comentario pedindo o link. DESLIGADO por padrao: so
// liga com INSTAGRAM_COMMENT_DM=1, depois que o app da Meta estiver ativo
// (fora do modo de desenvolvimento) e o campo "comments" assinado -- antes
// disso a Meta so entrega comentarios de contas testadoras.
const COMMENT_DM_ENABLED = process.env.INSTAGRAM_COMMENT_DM === "1";

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Palavras que significam "me manda o link". Comentario so de elogio ou
// emoji nao dispara nada (nao queremos DM pra todo mundo que comentar).
const COMMENT_TRIGGER = /\b(quero+|link|onde|comprar|compro|manda|mande|passa|passe|me envia|envia|valor|preco)\b/;

// Produto do POST comentado (feed/reel) pelo media_id guardado em
// social_posts; sem match cai no link generico de /hoje.
async function buildCommentReplyText(mediaId: string | undefined): Promise<string> {
  if (!mediaId) return FALLBACK_REPLY_TEXT;
  try {
    const db = getDbFresh();
    const { data } = await db
      .from("social_posts")
      .select("deal_candidates(products(product_name), offer_snapshots(offer_link))")
      .eq("media_id", mediaId)
      .limit(1);
    const dc = (data as any)?.[0]?.deal_candidates;
    const link = dc?.offer_snapshots?.offer_link;
    const name = dc?.products?.product_name;
    if (link) return `Oi! 🎁 Aqui está o link do ${name ?? "produto"}: ${link}`;
  } catch (err) {
    console.error("[webhook/instagram] falha ao buscar produto do post:", err);
  }
  return FALLBACK_REPLY_TEXT;
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
  const rawBody = await request.text();

  if (!hasValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    console.error("[webhook/instagram] assinatura invalida ou ausente");
    return NextResponse.json({ ok: false, error: "assinatura inválida" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as InstagramWebhookBody;

  if (body.object !== "instagram") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  for (const entry of body.entry ?? []) {
    if (COMMENT_DM_ENABLED) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments") continue;
        const v = change.value;
        const commentId = v?.id;
        const text = v?.text;
        // Ignora: comentario sem texto, resposta a outro comentario, e o
        // PROPRIO comentario da conta (o publish-product comenta nos posts).
        if (!commentId || !text || v?.parent_id) continue;
        if (v?.from?.id && v.from.id === entry.id) continue;
        if (isDuplicate(`c:${commentId}`)) continue;
        if (!COMMENT_TRIGGER.test(normalize(text))) continue;
        try {
          await sendPrivateReplyToComment({ commentId, text: await buildCommentReplyText(v?.media?.id) });
        } catch (err) {
          console.error("[webhook/instagram] falha ao responder comentario:", err);
        }
      }
    }
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
        const replyText = await buildReplyText(event.message?.reply_to?.story?.id);
        await sendInstagramMessage({ recipientId: senderId, text: replyText });
      } catch (err) {
        console.error("[webhook/instagram] falha ao responder:", err);
      }
    }
  }

  // sempre 200 rápido — a Meta re-tenta em loop se não receber 200
  return NextResponse.json({ ok: true });
}
