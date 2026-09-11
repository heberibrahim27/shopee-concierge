/**
 * Orquestrador do concierge — a única peça que fala com o núcleo inteiro.
 * Recebe uma IncomingMessage já normalizada (não sabe se veio de Z-API,
 * Instagram, etc.) e devolve o texto a responder + o chatId de destino.
 *
 * Isolamento do BancaZAP: mensagens que não têm o gatilho e não estão
 * numa sessão já aberta do concierge são simplesmente ignoradas aqui —
 * elas continuam sendo tratadas por qualquer automação normal que já
 * exista pro número (fora deste projeto).
 *
 * Roteador de confiança: depois do ranking normal (modelo econômico),
 * decide se escala pro modelo avançado (ver confidenceRouter.ts +
 * expertVision.ts) antes de responder. Isso só entra quando o modelo
 * econômico não teve certeza suficiente — a maioria das fotos deve
 * continuar resolvida só com ele, que é bem mais barato.
 */
import { IncomingMessage } from "../channel/types";
import { getSession, setSession, isTriggerPhrase } from "./session";
import { recognizeProductImage } from "./recognize";
import { searchProductsByKeyword } from "../shopee/queries";
import { rankCandidates, RankedCandidate } from "./rank";
import { compareCandidatesVisually } from "./compare";
import { buildReplyMessage } from "./reply";
import { decideEscalation } from "./confidenceRouter";
import { consultExpertVision } from "./expertVision";

export interface OrchestratorResult {
  chatId: string;
  replyText: string | null; // null = não é assunto do concierge, não responder
}

const SEARCH_LIMIT_PER_TERM = 20;
const MAX_SEARCH_TERMS = 4;
const SHORTLIST_FOR_VISUAL_COMPARISON = 8; // controla custo/latência da comparação visual

/**
 * Reordena os candidatos colocando os itemIds confirmados pelo modelo
 * avançado primeiro (marcados como "modelo_identificado", já que agora
 * têm confirmação extra), mantendo o resto do ranking como estava depois
 * — pra sempre ter opção de sobra caso os IDs confirmados sejam poucos.
 */
function applyExpertVerdict(
  candidates: RankedCandidate[],
  bestCandidateIds: string[]
): RankedCandidate[] {
  if (bestCandidateIds.length === 0) return candidates;
  const idSet = new Set(bestCandidateIds);
  const confirmed: RankedCandidate[] = [];
  const rest: RankedCandidate[] = [];
  for (const c of candidates) {
    if (idSet.has(c.offer.itemId)) {
      confirmed.push({ ...c, matchType: "modelo_identificado" });
    } else {
      rest.push(c);
    }
  }
  // preserva a ordem em que o modelo avançado listou os IDs confirmados
  confirmed.sort((a, b) => bestCandidateIds.indexOf(a.offer.itemId) - bestCandidateIds.indexOf(b.offer.itemId));
  return [...confirmed, ...rest];
}

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

    let candidates = rankCandidates(shortlist, observation, visualComparisons);

    // Roteador de confiança: só escala pro modelo avançado quando o
    // resultado do modelo econômico não é confiável o suficiente.
    const decision = decideEscalation(observation, candidates);
    let escalatedConfidence: number | undefined;
    let expertNeededClarification = false;

    if (decision.escalate && msg.imageUrl) {
      const verdict = await consultExpertVision({
        photoUrl: msg.imageUrl,
        observation,
        candidates,
      });
      escalatedConfidence = verdict.confidence;

      if (verdict.status === "match" && verdict.bestCandidateIds.length > 0) {
        candidates = applyExpertVerdict(candidates, verdict.bestCandidateIds);
      } else if (verdict.needsUserClarification && verdict.suggestedQuestion) {
        expertNeededClarification = true;
        setSession({
          ...session,
          status: "awaiting_clarification",
          observation,
          pendingQuestion: verdict.suggestedQuestion,
        });
        // observabilidade mínima (sem banco ainda — ver plano de logs)
        console.log(
          "[concierge][observability]",
          JSON.stringify({
            requestId: msg.messageId,
            confiancaGeral: observation.confiancaGeral,
            escalou: true,
            motivoEscalonamento: decision.motivo,
            modeloAvancado: "expert",
            confiancaFinal: escalatedConfidence,
            precisouEsclarecimento: true,
          })
        );
        return { chatId: msg.chatId, replyText: verdict.suggestedQuestion };
      }
      // status "uncertain" sem pergunta útil: segue com o ranking do
      // modelo econômico mesmo assim (melhor esforço, nunca trava a resposta)
    }

    const replyText = await buildReplyMessage({ candidates, chatId: msg.chatId });

    console.log(
      "[concierge][observability]",
      JSON.stringify({
        requestId: msg.messageId,
        confiancaGeral: observation.confiancaGeral,
        categoria: observation.categoria,
        termosPesquisa: terms,
        quantidadeResultadosShopee: results.flat().length,
        escalou: decision.escalate,
        motivoEscalonamento: decision.motivo,
        modeloAvancado: decision.escalate ? "expert" : undefined,
        confiancaFinal: escalatedConfidence ?? observation.confiancaGeral,
        precisouEsclarecimento: expertNeededClarification,
        produtosEnviados: candidates.slice(0, 3).map((c) => c.offer.itemId),
      })
    );

    // encerra a sessão do concierge — próxima interação exige novo gatilho
    setSession({ chatId: msg.chatId, status: "idle", updatedAt: Date.now() });

    return { chatId: msg.chatId, replyText };
  }

  return { chatId: msg.chatId, replyText: null };
}
