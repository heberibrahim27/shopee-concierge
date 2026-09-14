/**
 * Endpoint que a Z-API chama a cada mensagem recebida no número.
 *
 * HISTÓRICO (isolamento do BancaZAP): esta instância Z-API já tinha um
 * webhook real configurado em "Ao receber" apontando pro backend do
 * BancaZAP (bzapprime.com.br) — confirmado em 10/09/2026 direto no painel
 * da Z-API. Pra não quebrar isso, este endpoint repassava SEMPRE o payload
 * bruto pro webhook original do BancaZAP (fire-and-forget), além de rodar
 * a lógica do concierge — permitindo trocar o campo "Ao receber" da Z-API
 * pra apontar só pra cá sem tirar o BancaZAP do ar.
 *
 * REPASSE DESATIVADO (12/09/2026, decisão do Ibrahim): esse número virou o
 * canal público do Shopee Concierge (divulgado na bio do Instagram
 * @descontoschegando). Gente estranha mandando foto de produto fazia o bot
 * do BancaZAP também tentar processar a mensagem como print de bilhete de
 * aposta (ex: respondia "Não consegui usar esse arquivo como print de
 * bilhete... Envie uma imagem JPG, PNG ou WEBP legível do bilhete"),
 * gerando resposta duplicada/confusa pro público do Concierge. Ver
 * `BANCAZAP_FORWARD_DISABLED` abaixo — o aviso automático de sinais pro
 * grupo "BancaZAP Prime | Sinais VIP" é um fluxo de SAÍDA separado,
 * disparado pelo próprio backend do BancaZAP quando uma aposta liquida, e
 * não depende deste repasse — continua funcionando normalmente.
 *
 * BANCAZAP_FORWARD_WEBHOOK_URL precisa estar configurada com a URL
 * completa que estava em "Ao receber" antes da troca (com o token na
 * query string). Sem essa variável, o repasse é pulado (log de aviso).
 */
import { NextRequest, NextResponse } from "next/server";
import { createZApiConnector } from "@/lib/channel/zapi";
import { handleIncomingMessage } from "@/lib/concierge/orchestrator";
import { isDuplicate } from "@/lib/dedupe";

// Sem isso, a function usa o limite padrão da Vercel pro plano do
// projeto — curto demais pro pipeline do concierge numa foto (reconhecer +
// buscar na Shopee + comparar visualmente +, às vezes, escalar pro perito e
// tentar de novo com um termo sugerido). Pede o máximo permitido pelo plano
// contratado; se o plano permitir menos que isso, a Vercel aplica o limite
// dele mesmo assim — não tem como isso piorar nada, só evita cortar a
// function no meio do processamento por causa de um número baixo padrão.
export const maxDuration = 60;

const connector = createZApiConnector();

// Chave única do desligamento (ver comentário no topo do arquivo). Pra
// reativar o repasse de mensagens recebidas pro bot do BancaZAP, é só virar
// pra `false` — não afeta em nada o aviso de sinais pro grupo VIP.
const BANCAZAP_FORWARD_DISABLED = true;

async function forwardToBancaZap(rawBody: unknown, ownHost: string | null): Promise<void> {
  if (BANCAZAP_FORWARD_DISABLED) {
    console.warn(
      "[concierge] repasse pro BancaZAP DESATIVADO (número agora é o canal público do Shopee Concierge) — ver BANCAZAP_FORWARD_DISABLED em route.ts."
    );
    return;
  }

  const url = process.env.BANCAZAP_FORWARD_WEBHOOK_URL;
  if (!url) {
    console.warn(
      "[concierge] BANCAZAP_FORWARD_WEBHOOK_URL não configurada — evento NÃO repassado pro BancaZAP."
    );
    return;
  }

  // Proteção contra loop infinito: se essa variável estiver (por engano)
  // apontando pro PRÓPRIO domínio deste projeto, repassar criaria uma
  // mensagem chamando a si mesma pra sempre (cada repasse gera um novo
  // POST nesta mesma rota, que repassa de novo, e de novo...). Isso já
  // aconteceu na prática (detectado via trace de "External APIs" na
  // Vercel: uma chamada de saída com destino no próprio domínio do
  // projeto) — em vez de só confiar que a variável está certa, o código
  // passa a se recusar a repassar pro próprio host, sempre.
  let targetHost: string | null = null;
  try {
    targetHost = new URL(url).host;
  } catch {
    console.error("[concierge] BANCAZAP_FORWARD_WEBHOOK_URL não é uma URL válida — repasse pulado.");
    return;
  }
  if (ownHost && targetHost === ownHost) {
    console.error(
      `[concierge] BANCAZAP_FORWARD_WEBHOOK_URL está apontando pro próprio domínio (${targetHost}) — repasse CANCELADO pra evitar loop infinito. Corrija essa variável na Vercel (precisa ser a URL do backend real do BancaZAP, ex: bzapprime.com.br).`
    );
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawBody),
    });
  } catch (err) {
    // não deixa uma falha no repasse derrubar o processamento do concierge
    console.error("[concierge] falha ao repassar evento pro BancaZAP:", err);
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.json();
  const ownHost = req.headers.get("host");

  // repassa SEMPRE, pra qualquer evento — o BancaZAP continua recebendo
  // exatamente o que recebia antes, independente do que o concierge faz
  const forwardPromise = forwardToBancaZap(rawBody, ownHost);

  const incoming = connector.parseIncoming(rawBody);
  if (!incoming) {
    await forwardPromise;
    // evento que não é mensagem (status, ack, etc.) — ignora sem erro
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (isDuplicate(incoming.messageId)) {
    await forwardPromise;
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await handleIncomingMessage(incoming, connector);

    // manda em ordem (não em paralelo) pra chegar no WhatsApp na sequência
    // certa: texto simples primeiro (ex: pergunta), senão as partes da
    // resposta com produto (foto + legenda de cada opção, ver reply.ts)
    if (result.replyText) {
      await connector.sendText({ chatId: result.chatId, text: result.replyText });
    }
    if (result.replyParts) {
      for (const part of result.replyParts) {
        if (part.type === "image") {
          await connector.sendImage({
            chatId: result.chatId,
            imageUrl: part.imageUrl,
            caption: part.caption,
          });
        } else {
          await connector.sendText({ chatId: result.chatId, text: part.text });
        }
      }
    }

    await forwardPromise;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[concierge] erro processando mensagem:", err);
    await forwardPromise;
    // não deixa o erro derrubar o webhook — a Z-API pode re-tentar em loop
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
