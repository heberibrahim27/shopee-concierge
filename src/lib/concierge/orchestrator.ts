/**
 * Orquestrador do concierge — a única peça que fala com o núcleo inteiro.
 * Recebe uma IncomingMessage já normalizada (não sabe se veio de Z-API,
 * Instagram, etc.) e devolve o texto a responder + o chatId de destino.
 *
 * Isolamento do BancaZAP: mensagens que não têm o gatilho e não estão
 * numa sessão já aberta do concierge são simplesmente ignoradas aqui —
 * elas continuam sendo tratadas por qualquer automação normal que já
 * exista pro número (fora deste projeto).
 */
import { IncomingMessage } from "../channel/types";
import { getSession, setSession, isTriggerPhrase } from "./session";
import { recognizeProductImage } from "./recognize";
import { searchProductsByKeyword } from "../shopee/queries";
import { rankCandidates } from "./rank";
import { compareCandidatesVisually } from "./compare";
import { buildReplyMessage } from "./reply";

export interface OrchestratorResult {
  chatId: string;
  replyText: string | null; // null = não é assunto do concierge, não responder
}

const SEARCH_LIMIT_PER_TERM = 20;
const MAX_SEARCH_TERMS = 3;
const SHORTLIST_FOR_VISUAL_COMPARISON = 8; // controla custo/latência da comparação visual

export async function handleIncomingMessage(
  msg: IncomingMessage
): Promise<OrchestratorResult> {
  // nunca reagir a mensagens enviadas pelo próprio bot (evita loop)
  if (msg.fromMe) {
    return { chatId: msg.chatId, replyText: null };
  }

  const session = getSession(msg.chatId);

  // Gatilho explícito liga o fluxo do concierge — fora dele, ignorar
  // (tráfego normal do BancaZAP no mesmo número não é afetado)
  if (session.status === "idle") {
    if (!isTriggerPhrase(msg.text)) {
      return { chatId: msg.chatId, replyText: null };
    }
    setSession({ ...session, status: "awaiting_photo" });
    return {
      chatId: msg.chatId,
      replyText: "Pode mandar a foto do que você tá procurando. Eu acho as melhores opções na Shopee.",
    };
  }

  if (session.status === "awaiting_photo" || session.status === "awaiting_clarification") {
    if (!msg.imageUrl && session.status === "awaiting_photo") {
      return {
        chatId: msg.chatId,
        replyText: "Ainda preciso da foto — pode mandar?",
      };
    }

    setSession({ ...session, status: "processing" });

    const observation = await recognizeProductImage({
      imageUrl: msg.imageUrl ?? "",
      userText: msg.text,
    });

    if (observation.perguntaEsclarecimento) {
      setSession({
        ...session,
        status: "awaiting_clarification",
        observation,
        pendingQuestion: observation.perguntaEsclarecimento,
      });
      return { chatId: msg.chatId, replyText: observation.perguntaEsclarecimento };
    }

    const terms = observation.termosDeBusca.slice(0, MAX_SEARCH_TERMS);
    const results = await Promise.all(
      terms.map((keyword) =>
        searchProductsByKeyword({ keyword, limit: SEARCH_LIMIT_PER_TERM })
      )
    );

    // 1ª passada: ranking heurístico (texto/nota/venda) só pra reduzir a
    // lista bruta a um shortlist pequeno antes de gastar com comparação
    // visual real (que é o sinal que realmente decide o que é parecido)
    const preliminary = rankCandidates(results.flat(), observation);
    const shortlist = preliminary.slice(0, SHORTLIST_FOR_VISUAL_COMPARISON).map((r) => r.offer);

    const visualComparisons = msg.imageUrl
      ? await compareCandidatesVisually({
          photoUrl: msg.imageUrl,
          observation,
          candidates: shortlist,
        })
      : undefined;

    const candidates = rankCandidates(shortlist, observation, visualComparisons);
    const replyText = await buildReplyMessage({ candidates, chatId: msg.chatId });

    // encerra a sessão do concierge — próxima interação exige novo gatilho
    setSession({ chatId: msg.chatId, status: "idle", updatedAt: Date.now() });

    return { chatId: msg.chatId, replyText };
  }

  return { chatId: msg.chatId, replyText: null };
}
