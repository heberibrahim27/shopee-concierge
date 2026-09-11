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
 *
 * SEM BANCO DE DADOS, DE PROPÓSITO: a sessão (getSession/setSession) é só
 * um Map em memória — nenhum dado de cliente precisa ficar guardado, o
 * objetivo aqui é só indicar o link. O problema é que esse Map não
 * sobrevive entre instâncias serverless diferentes da Vercel, então o
 * fluxo em 2 mensagens ("Quero encontrar" → esperar → foto solta) pode
 * falhar silenciosamente se a segunda mensagem cair numa instância que
 * não viu a primeira. Por isso o caminho GARANTIDO é a foto já chegar
 * com o gatilho na própria legenda (1 mensagem só, resolvida inteira
 * numa única invocação, sem depender de nada guardado entre mensagens);
 * o fluxo de 2 mensagens continua funcionando como bônus melhor-esforço.
 */
import { IncomingMessage } from "../channel/types";
import { getSession, setSession, isTriggerPhrase, ConciergeSession } from "./session";
import { recognizeProductImage } from "./recognize";
import { searchProductsByKeyword } from "../shopee/queries";
import { rankCandidates, RankedCandidate } from "./rank";
import { compareCandidatesVisually } from "./compare";
import { buildReplyMessage, ReplyPart } from "./reply";
import { decideEscalation } from "./confidenceRouter";
import { consultExpertVision } from "./expertVision";

export interface OrchestratorResult {
  chatId: string;
  replyText: string | null; // null = não é assunto do concierge, não responder
  /**
   * Quando presente, é a resposta a mandar (na ordem do array) — usada pra
   * mandar a foto real de cada produto (ver reply.ts). Quando ausente, quem
   * chama usa só `replyText` (caso simples: pergunta, aviso, pedido de foto).
   */
  replyParts?: ReplyPart[];
}

const SEARCH_LIMIT_PER_TERM = 20;
const MAX_SEARCH_TERMS = 4;
const SHORTLIST_FOR_VISUAL_COMPARISON = 8; // controla custo/latência da comparação visual

/**
 * Quando o modelo avançado (perito) confirma um match, o roteador já
 * escalou justamente porque o ranking econômico estava em dúvida — então
 * os candidatos que o perito NÃO confirmou são um "não, esse eu não
 * confio" implícito (ele viu a foto e as mesmas opções, e não escolheu).
 * Por isso aqui a lista final vira só os confirmados (reordenados pela
 * preferência do perito), em vez de completar até 3 com sobra do ranking
 * antigo — melhor mandar 1 opção certa do que 3 quando 2 são de categoria
 * errada (foi exatamente o bug relatado: bateder de argamassa certo +
 * 2 misturadores de bebida errados só pra "completar 3").
 */
function applyExpertVerdict(
  candidates: RankedCandidate[],
  bestCandidateIds: string[]
): RankedCandidate[] {
  if (bestCandidateIds.length === 0) return candidates;
  const idSet = new Set(bestCandidateIds);
  const confirmed: RankedCandidate[] = candidates
    .filter((c) => idSet.has(c.offer.itemId))
    .map((c) => ({ ...c, matchType: "modelo_identificado" as const }));
  // preserva a ordem em que o modelo avançado listou os IDs confirmados
  confirmed.sort((a, b) => bestCandidateIds.indexOf(a.offer.itemId) - bestCandidateIds.indexOf(b.offer.itemId));
  // se por algum motivo nenhum id confirmado bateu com a lista atual
  // (não devia acontecer, mas não custa ser defensivo), não fica sem nada
  return confirmed.length > 0 ? confirmed : candidates;
}

/**
 * Processa uma mensagem que já tem foto (seja o caminho garantido — foto
 * com o gatilho na legenda, resolvido numa invocação só — seja o caminho
 * melhor-esforço de 2 mensagens que depende da sessão em memória ter
 * sobrevivido). Não depende de nada além do que chega em `msg`.
 */
async function processPhotoMessage(
  msg: IncomingMessage,
  session: ConciergeSession
): Promise<OrchestratorResult> {
  // Foto efetiva: a que chegou agora, ou (se essa mensagem é a resposta de
  // uma pergunta de esclarecimento sem foto nova) a foto original guardada
  // na sessão. Sem isso, uma resposta só em texto ("SDS", por exemplo)
  // chamaria o reconhecimento sem imagem nenhuma.
  const effectiveImageUrl = msg.imageUrl ?? session.imageUrl;

  // Se é resposta de esclarecimento, dá pro reconhecimento o contexto da
  // pergunta feita + a resposta da pessoa, em vez de só o texto solto —
  // assim ele reavalia com a informação nova, não do zero.
  const effectiveUserText =
    session.status === "awaiting_clarification" && session.pendingQuestion
      ? `Pergunta feita antes: "${session.pendingQuestion}". Resposta da pessoa agora: "${msg.text ?? ""}".`
      : msg.text;

  setSession({ ...session, status: "processing", imageUrl: effectiveImageUrl });

  const observation = await recognizeProductImage({
    imageUrl: effectiveImageUrl ?? "",
    userText: effectiveUserText,
  });

  if (observation.perguntaEsclarecimento) {
    setSession({
      ...session,
      status: "awaiting_clarification",
      observation,
      pendingQuestion: observation.perguntaEsclarecimento,
      imageUrl: effectiveImageUrl,
    });
    return {
      chatId: msg.chatId,
      replyText: `${observation.perguntaEsclarecimento}\n\n(se eu não responder rápido, manda de novo a foto com "quero encontrar" + sua resposta na legenda, tipo: "quero encontrar, SDS")`,
    };
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

  const visualComparisons = effectiveImageUrl
    ? await compareCandidatesVisually({
        photoUrl: effectiveImageUrl,
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

  if (decision.escalate && effectiveImageUrl) {
    const verdict = await consultExpertVision({
      photoUrl: effectiveImageUrl,
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
        imageUrl: effectiveImageUrl,
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
      return {
        chatId: msg.chatId,
        replyText: `${verdict.suggestedQuestion}\n\n(se eu não responder rápido, manda de novo a foto com "quero encontrar" + sua resposta na legenda, tipo: "quero encontrar, SDS")`,
      };
    }
    // status "uncertain" sem pergunta útil: segue com o ranking do
    // modelo econômico mesmo assim (melhor esforço, nunca trava a resposta)
  }

  const replyParts = await buildReplyMessage({ candidates, chatId: msg.chatId });

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

  return { chatId: msg.chatId, replyText: null, replyParts };
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

    // Caminho GARANTIDO: gatilho + foto já chegaram juntos (foto com
    // "Quero encontrar" na legenda) — resolve tudo nesta única invocação,
    // sem depender de nenhum estado guardado entre mensagens.
    if (msg.imageUrl) {
      return processPhotoMessage(msg, session);
    }

    // Só o texto do gatilho chegou — pede a foto e marca a sessão como
    // bônus melhor-esforço (pode falhar se a próxima mensagem cair numa
    // instância serverless diferente; por isso a orientação já reforça
    // o caminho garantido pra próxima vez).
    setSession({ ...session, status: "awaiting_photo" });
    return {
      chatId: msg.chatId,
      replyText:
        "Pode mandar a foto do que você tá procurando (se puder, já escreva \"quero encontrar\" na legenda da foto — assim eu garanto que não vou perder o pedido). Eu acho as melhores opções na Shopee.",
    };
  }

  if (session.status === "awaiting_photo" || session.status === "awaiting_clarification") {
    if (!msg.imageUrl && session.status === "awaiting_photo") {
      return {
        chatId: msg.chatId,
        replyText: "Ainda preciso da foto — pode mandar?",
      };
    }

    return processPhotoMessage(msg, session);
  }

  return { chatId: msg.chatId, replyText: null };
}
