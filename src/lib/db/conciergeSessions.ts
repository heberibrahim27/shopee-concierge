/**
 * Sessão do concierge persistida no Supabase — substitui o Map em memória
 * que existia em session.ts.
 *
 * Por que: o Map em memória não sobrevive entre instâncias serverless
 * diferentes da Vercel, então uma resposta um pouco mais lenta (ou uma
 * segunda mensagem caindo numa instância que nunca viu a primeira) fazia
 * a conversa "resetar" do nada, mesmo dentro da janela de 30 minutos.
 * Pedido explícito do Ibrahim (13/09/2026): guardar o contexto por um
 * tempo antes de expirar, mas sem "encher o banco".
 *
 * Não enche o banco: é UMA linha por chat_id (upsert, nunca insert por
 * mensagem) — o tamanho da tabela é o número de conversas ativas, não o
 * número de mensagens trocadas. Ver migration
 * supabase/migrations/*_create_concierge_sessions.sql.
 *
 * Resiliente a falha do Supabase: se ler falhar, trata como sessão nova
 * (idle) em vez de derrubar a resposta; se salvar falhar, só loga — o
 * cliente ainda recebe a resposta normal, só perde a continuidade da
 * sessão nessa mensagem específica.
 */
import { getDb } from "./client";

export type ConciergeSessionStatus =
  | "idle" // fora do fluxo do concierge
  | "awaiting_photo" // gatilho recebido, esperando a foto
  | "awaiting_clarification" // já reconheceu algo, esperando resposta de uma pergunta
  | "processing"; // buscando/rankeando na Shopee

export interface ConciergeSessionRow {
  chatId: string;
  status: ConciergeSessionStatus;
  observation?: unknown;
  pendingQuestion?: string;
  imageUrl?: string;
  updatedAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min de inatividade encerra a sessão

interface ConciergeSessionDbRow {
  chat_id: string;
  status: ConciergeSessionStatus;
  observation: unknown;
  pending_question: string | null;
  image_url: string | null;
  updated_at: string;
}

export async function getConciergeSession(chatId: string): Promise<ConciergeSessionRow> {
  const fresh: ConciergeSessionRow = { chatId, status: "idle", updatedAt: Date.now() };

  try {
    const db = getDb();
    const { data, error } = await db
      .from("concierge_sessions")
      .select("chat_id, status, observation, pending_question, image_url, updated_at")
      .eq("chat_id", chatId)
      .maybeSingle<ConciergeSessionDbRow>();

    if (error) {
      console.error("[concierge][session] falha ao ler sessão, tratando como nova:", error.message);
      return fresh;
    }
    if (!data) return fresh;

    const updatedAt = new Date(data.updated_at).getTime();
    if (Date.now() - updatedAt >= SESSION_TTL_MS) return fresh;

    return {
      chatId,
      status: data.status,
      observation: data.observation ?? undefined,
      pendingQuestion: data.pending_question ?? undefined,
      imageUrl: data.image_url ?? undefined,
      updatedAt,
    };
  } catch (err) {
    // ex: SUPABASE_URL/SERVICE_ROLE_KEY ausente — nunca derruba o fluxo
    console.error("[concierge][session] erro inesperado lendo sessão, tratando como nova:", err);
    return fresh;
  }
}

export async function setConciergeSession(session: ConciergeSessionRow): Promise<void> {
  try {
    const db = getDb();
    const { error } = await db.from("concierge_sessions").upsert({
      chat_id: session.chatId,
      status: session.status,
      observation: session.observation ?? null,
      pending_question: session.pendingQuestion ?? null,
      image_url: session.imageUrl ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("[concierge][session] falha ao salvar sessão (segue sem persistir):", error.message);
    }
  } catch (err) {
    console.error("[concierge][session] erro inesperado salvando sessão (segue sem persistir):", err);
  }
}
