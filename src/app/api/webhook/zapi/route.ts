/**
 * Endpoint que a Z-API chama a cada mensagem recebida no número.
 *
 * IMPORTANTE (isolamento do BancaZAP): esta instância Z-API já tinha um
 * webhook real configurado em "Ao receber" apontando pro backend do
 * BancaZAP (bzapprime.com.br) — confirmado em 10/09/2026 direto no painel
 * da Z-API. Pra não quebrar isso, este endpoint SEMPRE repassa o payload
 * bruto pro webhook original do BancaZAP (fire-and-forget, não bloqueia
 * nem depende da resposta dele), além de rodar a lógica do concierge.
 * Isso é o que permite trocar o campo "Ao receber" da Z-API pra apontar
 * só pra cá, sem tirar nada do BancaZAP do ar.
 *
 * BANCAZAP_FORWARD_WEBHOOK_URL precisa estar configurada com a URL
 * completa que estava em "Ao receber" antes da troca (com o token na
 * query string). Sem essa variável, o repasse é pulado (log de aviso).
 */
import { NextRequest, NextResponse } from "next/server";
import { createZApiConnector } from "@/lib/channel/zapi";
import { handleIncomingMessage } from "@/lib/concierge/orchestrator";
import { isDuplicate } from "@/lib/dedupe";

const connector = createZApiConnector();

async function forwardToBancaZap(rawBody: unknown, ownHost: string | null): Promise<void> {
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
    const result = await handleIncomingMessage(incoming);
    if (result.replyText) {
      await connector.sendText({ chatId: result.chatId, text: result.replyText });
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
