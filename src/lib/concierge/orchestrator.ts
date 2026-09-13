/**
 * Orquestrador do concierge — a única peça que fala com o núcleo inteiro.
 * Recebe uma IncomingMessage já normalizada (não sabe se veio de Z-API,
 * Instagram, etc.) e devolve o texto a responder + o chatId de destino.
 *
 * Número dedicado (12/09/2026): qualquer foto recebida fora de uma sessão
 * aberta já dispara a busca direto, sem precisar de gatilho em texto — ver
 * comentário em handleIncomingMessage. Texto puro (sem foto e sem sessão
 * aberta) que não seja o gatilho agora também dispara uma busca por nome
 * de produto (13/09/2026, pedido do Ibrahim) — ver processTextQuery.
 *
 * Roteador de confiança: depois do ranking normal (modelo econômico),
 * decide se escala pro modelo avançado (ver confidenceRouter.ts +
 * expertVision.ts) antes de responder. Isso só entra quando o modelo
 * econômico não teve certeza suficiente — a maioria das fotos deve
 * continuar resolvida só com ele, que é bem mais barato.
 *
 * Sessão persistida no Supabase (13/09/2026, ver session.ts +
 * db/conciergeSessions.ts) — antes era um Map em memória que não
 * sobrevivia entre instâncias serverless da Vercel, fazendo a conversa
 * "resetar" quando a resposta demorava um pouco mais. Continua sendo 1
 * linha por conversa (nunca um histórico), então não "enche o banco".
 */
import { IncomingMessage } from "../channel/types";
import type { ChannelConnector } from "../channel/types";
import { getSession, setSession, isTriggerPhrase, ConciergeSession } from "./session";
import { recognizeProductImage, ImageObservation } from "./recognize";
import { searchProductsByKeyword } from "../shopee/queries";
import type { ShopeeProductOffer } from "../shopee/types";
import { hasMinimumCandidateQuality, rankCandidates, RankedCandidate } from "./rank";
import { compareCandidatesVisually, VisualCompareOutcome } from "./compare";
import { recordVisualCompareOutcome, isVisualCompareDegraded } from "./visualHealth";
import {
  buildReplyMessage,
  buildRefinementReply,
  computeShownItemIds,
  ReplyPart,
  RefinementIntent,
  TEXTO_SEM_MAIS_OPCOES,
  TEXTO_CONFIRMAR_REFINAMENTO,
  TEXTO_MODO_SEGURO_VISUAL,
} from "./reply";
import { decideEscalation } from "./confidenceRouter";
import { consultExpertVision, ExpertVerdict } from "./expertVision";
import { CONCIERGE_CONFIG } from "./config";

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

// Aviso de "procurando" só é mandado se a busca por foto ainda não tiver
// terminado depois desse tempo — pedido do Ibrahim: não vale a pena mandar
// esse aviso quando o resultado já vem rápido (13/09/2026).
const INTERIM_NOTICE_DELAY_MS = 4000;
const TEXTO_BUSCANDO =
  "🔎 Já estou procurando esse produto na Shopee.\n\nVou comparar preço, avaliações e vendas pra separar as melhores opções.";

// Textos puros que não devem virar busca de produto (13/09/2026) — sem essa
// lista, qualquer "oi"/"obrigado" mandado pro número viraria uma pesquisa
// de produto sem sentido nenhum na Shopee.
const TEXTOS_IGNORADOS = new Set([
  "oi",
  "ola",
  "olá",
  "bom dia",
  "boa tarde",
  "boa noite",
  "obrigado",
  "obrigada",
  "valeu",
  "blz",
  "beleza",
  "ok",
  "okay",
  "tchau",
  "tudo bem",
  "tudo bom",
]);

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove acentos pra comparar com TEXTOS_IGNORADOS
}

function isIgnorableText(text: string | undefined): boolean {
  if (!text) return true;
  const normalized = normalizeText(text);
  return normalized.length < 3 || TEXTOS_IGNORADOS.has(normalized);
}

/**
 * Detecta pedido de refinamento ("mais barata"/"melhor qualidade"/"mais
 * parecida") — bug real reportado pelo Ibrahim (13/09/2026): a mensagem de
 * fechamento (TEXTO_FECHAMENTO em reply.ts) oferece essas 3 opções, mas até
 * agora nenhum código tratava a resposta — caía direto em processTextQuery
 * e virava uma busca literal sem sentido na Shopee (ex: "mais parecida"
 * puxando um livro com "parecidas" no título).
 *
 * Só dispara quando a sessão tem `lastSearch` (busca recente pra refinar) —
 * ver handleIncomingMessage. Match por substring simples (normalizado, sem
 * acento) é suficiente aqui: são poucas frases-gatilho, e a pessoa
 * geralmente responde curto ("quero mais barata", "tem mais parecida?").
 */
export function detectRefinementIntent(text: string | undefined): RefinementIntent | null {
  if (!text) return null;
  const normalized = normalizeText(text);
  if (normalized.includes("barat")) return "barata";
  if (normalized.includes("qualidade") || normalized.includes("melhor avaliad")) return "qualidade";
  if (normalized.includes("parecid") || normalized.includes("similar") || normalized.includes("igual")) {
    return "parecida";
  }
  return null;
}

// Bug real (13/09/2026): o Ibrahim respondeu só "Quero" ao fechamento que
// oferece as 3 opções de refinamento, sem dizer QUAL — isso não batia
// detectRefinementIntent (não tem "barat"/"qualidade"/"parecid" nenhum) e
// caía direto em processTextQuery, virando uma busca literal por "Quero" na
// Shopee. Uma confirmação genérica como essa, quando existe uma busca
// recente pra refinar (session.lastSearch), merece uma pergunta de volta —
// não uma pesquisa sem sentido.
const CONFIRMACOES_AMBIGUAS = new Set([
  "quero",
  "sim",
  "quero sim",
  "quero uma",
  "quero isso",
  "isso",
  "isso mesmo",
  "essa",
  "esse",
  "pode",
  "pode sim",
  "manda",
  "manda ai",
  "manda ver",
  "manda essa",
  "claro",
  "positivo",
]);

export function isAmbiguousRefinementConfirmation(text: string | undefined): boolean {
  if (!text) return false;
  return CONFIRMACOES_AMBIGUAS.has(normalizeText(text));
}

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
 * Decide o que fazer com `candidates` depois de consultar o perito
 * (expertVision.ts), separado em função própria pra dar pra testar sem
 * bater em API nenhuma.
 *
 * Bug real (13/09/2026, recorrência): quando escalamos SÓ porque a
 * comparação visual da 1ª passada falhou (`semSinalVisual` — o matchType de
 * `candidates` veio inteiro do fallback textual de rank.ts, nunca
 * verificado de verdade contra a foto), e o perito não confirma nenhum
 * candidato nem pede esclarecimento (status "uncertain" sem pergunta), o
 * código antigo simplesmente MANTINHA esse `candidates` não verificado —
 * foi assim que uma bermuda jeans rasgada continuou aparecendo como "menor
 * preço" mesmo depois de escalar. Se a ÚNICA razão de escalar foi a falta
 * de sinal visual, "o perito não confirmou nada" significa que não sobrou
 * nenhum sinal de relevância confiável nenhum — mais seguro esvaziar
 * `candidates` (cai no "ainda não encontrei uma opção segura") do que
 * arriscar mostrar de novo um produto de categoria errada.
 *
 * Quando escalamos por outro motivo (confiança/score, não falta de sinal
 * visual), `candidates` já tinha alguma comparação visual real por trás —
 * aí sim vale manter o melhor esforço do modelo econômico se o perito
 * também ficar em dúvida.
 */
export function resolveEscalatedCandidates(params: {
  candidates: RankedCandidate[];
  verdict: Pick<ExpertVerdict, "status" | "bestCandidateIds" | "needsUserClarification" | "suggestedQuestion">;
  semSinalVisual: boolean;
}): RankedCandidate[] {
  const { candidates, verdict, semSinalVisual } = params;

  if (verdict.status === "match" && verdict.bestCandidateIds.length > 0) {
    return applyExpertVerdict(candidates, verdict.bestCandidateIds);
  }
  if (verdict.needsUserClarification && verdict.suggestedQuestion) {
    // esclarecimento é tratado por quem chama (via expertNeededClarification)
    // — aqui só não mexe na lista, ela nem chega a ser usada nesse caso
    return candidates;
  }
  if (semSinalVisual) {
    return [];
  }
  // escalado por outro motivo (confiança/score) e perito ficou em dúvida
  // sem pergunta útil: segue com o ranking econômico mesmo assim (melhor
  // esforço, nunca trava a resposta)
  return candidates;
}

/**
 * Decide se vale reabrir a busca com um termo novo sugerido pelo perito,
 * em vez de desistir direto quando `resolveEscalatedCandidates` esvaziou
 * os candidatos (13/09/2026, sugestão do debate técnico com o ChatGPT):
 * escalar pro perito com a MESMA shortlist ruim nem sempre resolve — se a
 * busca inicial trouxe candidato de categoria errada, o perito só confirma
 * com mais certeza que estão errados. Quando ele sugere um termo melhor
 * (`ExpertVerdict.suggestedSearchTerm`), vale tentar UMA busca nova antes
 * de responder "não encontrei" — nunca encadeia (só 1 retry por request,
 * ver `alreadyRetried`), e nunca quando o caso é de pedir esclarecimento
 * ao cliente (esse já tem seu próprio fluxo, não é "busca errada").
 *
 * Função pura (só decide, não busca nada) pra dar pra testar sem rede.
 */
export function shouldRetryWithSuggestedTerm(params: {
  candidatesAfterVerdict: RankedCandidate[];
  verdict: Pick<ExpertVerdict, "needsUserClarification" | "suggestedSearchTerm">;
  alreadyRetried: boolean;
}): string | null {
  const { candidatesAfterVerdict, verdict, alreadyRetried } = params;
  if (alreadyRetried) return null;
  if (verdict.needsUserClarification) return null;
  if (candidatesAfterVerdict.length > 0) return null;
  return verdict.suggestedSearchTerm ?? null;
}

/**
 * Preserva os primeiros resultados utilizáveis da Shopee antes de qualquer
 * filtro textual ou visual. Os termos de busca vêm do mais específico para o
 * mais genérico e a API já responde por relevância, então manter essa ordem
 * fornece um conjunto pequeno e relevante para a visão avaliar sem
 * eliminar candidatos só porque o título não contém a frase exata.
 */
export function buildPreVisualShortlist(
  offers: ShopeeProductOffer[],
  limit = SHORTLIST_FOR_VISUAL_COMPARISON
): ShopeeProductOffer[] {
  const seen = new Set<string>();
  const shortlist: ShopeeProductOffer[] = [];

  for (const offer of offers) {
    if (shortlist.length >= limit) break;
    if (seen.has(offer.itemId) || !hasMinimumCandidateQuality(offer)) continue;
    seen.add(offer.itemId);
    shortlist.push(offer);
  }

  return shortlist;
}

/**
 * Monta a lista que o perito realmente vai receber. A comparação visual
 * econômica pode rejeitar todos os itens e deixar `candidates` vazio; nesse
 * caso ainda precisamos enviar ao modelo avançado o shortlist anterior ao
 * filtro para que ele faça uma segunda avaliação de verdade.
 *
 * Os metadados sintéticos existem apenas para satisfazer RankedCandidate —
 * consultExpertVision usa somente `offer`. Esses itens só podem voltar para
 * a resposta quando o perito confirmar explicitamente um itemId.
 */
export function selectExpertCandidates(params: {
  candidates: RankedCandidate[];
  preVisualShortlist: ShopeeProductOffer[];
}): RankedCandidate[] {
  if (params.candidates.length > 0) return params.candidates;
  return params.preVisualShortlist.map((offer) => ({
    offer,
    matchType: "semelhante_visual",
    score: 0,
  }));
}

/**
 * Ponto único de chamada do perito, com a dependência injetável para o
 * teste de regressão comprovar o payload sem consumir a API da OpenAI.
 */
export async function consultExpertWithFallback(
  params: {
    photoUrl: string;
    observation: ImageObservation;
    candidates: RankedCandidate[];
    preVisualShortlist: ShopeeProductOffer[];
  },
  consult: typeof consultExpertVision = consultExpertVision
): Promise<{
  verdict: ExpertVerdict;
  expertCandidates: RankedCandidate[];
  usedPreVisualShortlist: boolean;
}> {
  const expertCandidates = selectExpertCandidates(params);
  const usedPreVisualShortlist = params.candidates.length === 0 && expertCandidates.length > 0;
  const verdict = await consult({
    photoUrl: params.photoUrl,
    observation: params.observation,
    candidates: expertCandidates,
  });
  return { verdict, expertCandidates, usedPreVisualShortlist };
}

/**
 * Quando o perito pede outra busca, os produtos novos ainda precisam chegar
 * a ele caso a comparação econômica rejeite todos. Sem esta segunda revisão,
 * o retry podia encontrar produtos corretos e mesmo assim terminar vazio.
 * A função é injetável para testar a chamada sem consumir a API.
 */
export async function recoverRetryCandidatesWithExpert(
  params: {
    photoUrl: string;
    observation: ImageObservation;
    candidates: RankedCandidate[];
    preVisualShortlist: ShopeeProductOffer[];
  },
  consult: typeof consultExpertVision = consultExpertVision
): Promise<{
  candidates: RankedCandidate[];
  expertResult: Awaited<ReturnType<typeof consultExpertWithFallback>> | null;
}> {
  if (params.candidates.length > 0 || params.preVisualShortlist.length === 0) {
    return { candidates: params.candidates, expertResult: null };
  }

  const expertResult = await consultExpertWithFallback(params, consult);
  const expertConfirmedKnownCandidate =
    expertResult.verdict.status === "match" &&
    expertResult.verdict.bestCandidateIds.some((id) =>
      expertResult.expertCandidates.some((candidate) => candidate.offer.itemId === id)
    );

  if (!expertConfirmedKnownCandidate) {
    return { candidates: [], expertResult };
  }

  return {
    candidates: resolveEscalatedCandidates({
      candidates: expertResult.expertCandidates,
      verdict: expertResult.verdict,
      semSinalVisual: true,
    }),
    expertResult,
  };
}

/**
 * Roda uma pesquisa completa (ranking + escalonamento + resposta) a partir
 * de um `ImageObservation` já pronto e de uma lista de termos de busca —
 * compartilhado pelo caminho de foto e pelo caminho de texto puro.
 */
/**
 * Uma rodada de busca+ranking+comparação visual, isolada em função própria
 * pra dar pra chamar de novo (retry com termo sugerido pelo perito, ver
 * shouldRetryWithSuggestedTerm) sem duplicar a lógica.
 *
 * Modo seguro (13/09/2026, sugestão do debate técnico com o ChatGPT): antes
 * de gastar com a comparação visual, checa se ela está sistemicamente
 * degradada numa janela recente (ver visualHealth.ts) — se estiver,
 * `degraded: true` sinaliza pro chamador responder com transparência em
 * vez de arriscar (ou de escalar pro perito, que tende a falhar pela mesma
 * causa, ex: rate limit da OpenAI).
 */
async function searchRankAndCompare(params: {
  observation: ImageObservation;
  terms: string[];
  imageUrl?: string;
}): Promise<{
  candidates: RankedCandidate[];
  preVisualShortlist: ShopeeProductOffer[];
  visualOutcome: VisualCompareOutcome;
  matchCount: number;
  shortlistSize: number;
  resultCount: number;
  degraded: boolean;
}> {
  const { observation, terms, imageUrl } = params;

  const results = await Promise.all(
    terms.map((keyword) => searchProductsByKeyword({ keyword, limit: SEARCH_LIMIT_PER_TERM }))
  );
  const resultCount = results.flat().length;

  // Preserva a ordem de relevância da Shopee e aplica apenas requisitos
  // operacionais (link, imagem, preço e histórico mínimo). A relevância
  // semântica é decidida depois pela comparação visual. Usar rankCandidates
  // aqui descartava tudo quando o título não continha exatamente o primeiro
  // termo de busca, deixando tanto o modelo econômico quanto o perito sem
  // nenhuma imagem apesar de a Shopee ter retornado dezenas de produtos.
  const shortlist = buildPreVisualShortlist(results.flat());

  if (!imageUrl || shortlist.length === 0) {
    return {
      candidates: rankCandidates(shortlist, observation),
      preVisualShortlist: shortlist,
      visualOutcome: { status: "sem_candidatos" },
      matchCount: 0,
      shortlistSize: shortlist.length,
      resultCount,
      degraded: false,
    };
  }

  if (await isVisualCompareDegraded()) {
    return {
      candidates: rankCandidates(shortlist, observation),
      preVisualShortlist: shortlist,
      visualOutcome: { status: "sem_candidatos" },
      matchCount: 0,
      shortlistSize: shortlist.length,
      resultCount,
      degraded: true,
    };
  }

  const { matches, outcome } = await compareCandidatesVisually({ photoUrl: imageUrl, observation, candidates: shortlist });
  await recordVisualCompareOutcome(outcome);

  return {
    candidates: rankCandidates(shortlist, observation, matches),
    preVisualShortlist: shortlist,
    visualOutcome: outcome,
    matchCount: matches.size,
    shortlistSize: shortlist.length,
    resultCount,
    degraded: false,
  };
}

async function searchAndReply(params: {
  observation: ImageObservation;
  terms: string[];
  imageUrl?: string;
  chatId: string;
  messageId: string;
}): Promise<{ replyParts: ReplyPart[]; candidates: RankedCandidate[] }> {
  const { observation, terms, imageUrl, chatId, messageId } = params;

  const round1 = await searchRankAndCompare({ observation, terms, imageUrl });

  if (round1.degraded) {
    console.log(
      "[concierge][observability]",
      JSON.stringify({ requestId: messageId, modoSeguro: true, motivo: "comparacao_visual_degradada" })
    );
    return { replyParts: [{ type: "text", text: TEXTO_MODO_SEGURO_VISUAL }], candidates: [] };
  }

  let candidates = round1.candidates;

  // Sem sinal visual real apesar de ter foto (comparação falhou/não achou
  // nada) e ainda assim tinha candidato pra comparar — o matchType de todo
  // mundo em `candidates` veio só do fallback textual, mais fraco. Ver
  // motivo "comparacao_visual_indisponivel" em confidenceRouter.ts.
  const semSinalVisual =
    Boolean(imageUrl) && round1.shortlistSize > 0 && (round1.visualOutcome.status !== "ok" || round1.matchCount === 0);

  const decision = decideEscalation(observation, candidates, { semSinalVisual });
  let escalatedConfidence: number | undefined;
  let expertNeededClarification: { question: string } | null = null;
  let buscaReaberta = false;
  let expertCandidateCount = 0;
  let expertUsedPreVisualShortlist = false;
  let expertStatus: ExpertVerdict["status"] | undefined;
  let expertSuggestedSearchTerm: string | undefined;
  let retryDiagnostics:
    | {
        term: string;
        resultCount: number;
        shortlistSize: number;
        visualOutcome: VisualCompareOutcome;
        candidateCountAfterVisual: number;
        expertConsulted: boolean;
        expertCandidateCount: number;
        expertStatus?: ExpertVerdict["status"];
        expertConfidence?: number;
      }
    | undefined;

  if (decision.escalate && imageUrl) {
    const expertResult = await consultExpertWithFallback({
      photoUrl: imageUrl,
      observation,
      candidates,
      preVisualShortlist: round1.preVisualShortlist,
    });
    const { verdict, expertCandidates } = expertResult;
    expertCandidateCount = expertCandidates.length;
    expertUsedPreVisualShortlist = expertResult.usedPreVisualShortlist;
    expertStatus = verdict.status;
    expertSuggestedSearchTerm = verdict.suggestedSearchTerm;
    escalatedConfidence = verdict.confidence;

    if (verdict.needsUserClarification && verdict.suggestedQuestion) {
      expertNeededClarification = { question: verdict.suggestedQuestion };
    } else {
      // Um match explícito pode recuperar itens rejeitados pelo modelo
      // econômico. Se o perito ficar incerto ou devolver IDs que não existem
      // no shortlist enviado, preservamos a lista pós-filtro (inclusive vazia).
      const expertConfirmedKnownCandidate =
        verdict.status === "match" &&
        verdict.bestCandidateIds.some((id) =>
          expertCandidates.some((candidate) => candidate.offer.itemId === id)
        );
      const candidatesForVerdict = expertConfirmedKnownCandidate ? expertCandidates : candidates;
      candidates = resolveEscalatedCandidates({
        candidates: candidatesForVerdict,
        verdict,
        semSinalVisual,
      });

      const retryTerm = shouldRetryWithSuggestedTerm({
        candidatesAfterVerdict: candidates,
        verdict,
        alreadyRetried: false,
      });
      if (retryTerm) {
        buscaReaberta = true;
        const round2 = await searchRankAndCompare({
          observation,
          terms: [retryTerm, ...terms].slice(0, MAX_SEARCH_TERMS),
          imageUrl,
        });
        if (!round2.degraded) {
          candidates = round2.candidates;
          const retryRecovery = await recoverRetryCandidatesWithExpert({
            photoUrl: imageUrl,
            observation,
            candidates,
            preVisualShortlist: round2.preVisualShortlist,
          });
          candidates = retryRecovery.candidates;

          const retryVerdict = retryRecovery.expertResult?.verdict;
          if (retryVerdict) {
            escalatedConfidence = retryVerdict.confidence;
            if (retryVerdict.needsUserClarification && retryVerdict.suggestedQuestion) {
              expertNeededClarification = { question: retryVerdict.suggestedQuestion };
            }
          }

          retryDiagnostics = {
            term: retryTerm,
            resultCount: round2.resultCount,
            shortlistSize: round2.shortlistSize,
            visualOutcome: round2.visualOutcome,
            candidateCountAfterVisual: round2.candidates.length,
            expertConsulted: Boolean(retryRecovery.expertResult),
            expertCandidateCount: retryRecovery.expertResult?.expertCandidates.length ?? 0,
            expertStatus: retryVerdict?.status,
            expertConfidence: retryVerdict?.confidence,
          };
        }
      }
    }
  }

  if (expertNeededClarification) {
    console.log(
      "[concierge][observability]",
      JSON.stringify({
        requestId: messageId,
        confiancaGeral: observation.confiancaGeral,
        semSinalVisual,
        escalou: true,
        motivoEscalonamento: decision.motivo,
        modeloAvancado: "expert",
        candidatosEnviadosAoPerito: expertCandidateCount,
        peritoUsouShortlistPreVisual: expertUsedPreVisualShortlist,
        statusPerito: expertStatus,
        termoSugeridoPeloPerito: expertSuggestedSearchTerm,
        retry: retryDiagnostics,
        confiancaFinal: escalatedConfidence,
        precisouEsclarecimento: true,
      })
    );
    // sinaliza esclarecimento via replyParts vazio + campo especial não
    // existe — tratado pelo chamador (processPhotoMessage) checando antes
    throw new ClarificationNeeded(expertNeededClarification.question);
  }

  const replyParts = await buildReplyMessage({ candidates, chatId });

  console.log(
    "[concierge][observability]",
    JSON.stringify({
      requestId: messageId,
      confiancaGeral: observation.confiancaGeral,
      semSinalVisual,
      visualOutcome: round1.visualOutcome,
      categoria: observation.categoria,
      termosPesquisa: terms,
      quantidadeResultadosShopee: round1.resultCount,
      escalou: decision.escalate,
      motivoEscalonamento: decision.motivo,
      modeloAvancado: decision.escalate ? "expert" : undefined,
      candidatosEnviadosAoPerito: decision.escalate ? expertCandidateCount : undefined,
      peritoUsouShortlistPreVisual: decision.escalate ? expertUsedPreVisualShortlist : undefined,
      statusPerito: expertStatus,
      termoSugeridoPeloPerito: expertSuggestedSearchTerm,
      retry: retryDiagnostics,
      confiancaFinal: escalatedConfidence ?? observation.confiancaGeral,
      precisouEsclarecimento: false,
      buscaReaberta,
      produtosEnviados: candidates.slice(0, 3).map((c) => c.offer.itemId),
    })
  );

  return { replyParts, candidates };
}

/** Sinal interno pra "precisa perguntar antes de responder" sair de dentro de searchAndReply. */
class ClarificationNeeded extends Error {
  constructor(public question: string) {
    super(question);
  }
}

/**
 * Processa uma mensagem que já tem foto (seja o caminho garantido — foto
 * com o gatilho na legenda, resolvido numa invocação só — seja o caminho
 * melhor-esforço de 2 mensagens que depende da sessão persistida ter
 * sobrevivido). Não depende de nada além do que chega em `msg`.
 *
 * `connector`, quando presente, é usado só pra mandar o aviso de "🔎 já
 * estou procurando" se a busca demorar mais que INTERIM_NOTICE_DELAY_MS —
 * o retorno da função continua sendo a resposta final de qualquer forma.
 */
async function processPhotoMessage(
  msg: IncomingMessage,
  session: ConciergeSession,
  connector?: ChannelConnector
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

  await setSession({ ...session, status: "processing", imageUrl: effectiveImageUrl });

  let interimTimer: ReturnType<typeof setTimeout> | undefined;
  if (connector) {
    interimTimer = setTimeout(() => {
      connector
        .sendText({ chatId: msg.chatId, text: TEXTO_BUSCANDO })
        .catch((err) => console.error("[concierge] falha ao mandar aviso de busca em andamento:", err));
    }, INTERIM_NOTICE_DELAY_MS);
  }

  try {
    const observation = await recognizeProductImage({
      imageUrl: effectiveImageUrl ?? "",
      userText: effectiveUserText,
    });

    // Foto ilegível (13/09/2026): quando a IA praticamente não conseguiu
    // observar nada de útil (nem categoria, nem pergunta de esclarecimento
    // pra tentar avançar), é melhor pedir uma foto melhor do que rodar uma
    // busca com dado quase vazio — caso diferente de "ambíguo" (esse
    // continua indo pra pergunta de esclarecimento ou pro roteador de
    // confiança normalmente).
    const imagemIlegivel =
      !observation.perguntaEsclarecimento &&
      !observation.categoria &&
      (!observation.observado || observation.observado.trim().length < 3);

    if (imagemIlegivel) {
      await setSession({ chatId: msg.chatId, status: "idle", updatedAt: Date.now() });
      return {
        chatId: msg.chatId,
        replyText:
          "Não consegui identificar bem o produto nessa foto. 📸\n\n" +
          "Tenta mandar uma foto um pouco mais próxima ou mostrando melhor o produto.\n\n" +
          "Se tiver etiqueta, marca ou modelo, uma foto disso ajuda bastante.",
      };
    }

    if (observation.perguntaEsclarecimento) {
      await setSession({
        ...session,
        status: "awaiting_clarification",
        observation,
        pendingQuestion: observation.perguntaEsclarecimento,
        imageUrl: effectiveImageUrl,
      });
      const identificado = observation.categoria ?? observation.hipotese;
      const prefixo = identificado ? `👀 Parece ser ${identificado}.\n\n` : "👀 Quero ter certeza antes de procurar.\n\n";
      return {
        chatId: msg.chatId,
        replyText: `${prefixo}Só preciso confirmar uma coisa antes de procurar:\n\n${observation.perguntaEsclarecimento}`,
      };
    }

    const terms = observation.termosDeBusca.slice(0, MAX_SEARCH_TERMS);

    let outcome: { replyParts: ReplyPart[]; candidates: RankedCandidate[] };
    try {
      outcome = await searchAndReply({
        observation,
        terms,
        imageUrl: effectiveImageUrl,
        chatId: msg.chatId,
        messageId: msg.messageId,
      });
    } catch (err) {
      if (err instanceof ClarificationNeeded) {
        await setSession({
          ...session,
          status: "awaiting_clarification",
          observation,
          pendingQuestion: err.question,
          imageUrl: effectiveImageUrl,
        });
        return {
          chatId: msg.chatId,
          replyText: `👀 Acho que encontrei, mas quero ter certeza.\n\n${err.question}`,
        };
      }
      throw err;
    }

    // Sessão volta pra idle (próxima foto/gatilho abre um fluxo novo), mas
    // guarda a busca (candidatos rankeados + o que já foi mostrado) pra
    // permitir um pedido de refinamento logo em seguida ("mais barata"/
    // "melhor qualidade"/"mais parecida") sem bater na Shopee de novo — ver
    // detectRefinementIntent/processRefinement mais abaixo.
    await setSession({
      chatId: msg.chatId,
      status: "idle",
      updatedAt: Date.now(),
      lastSearch: {
        candidates: outcome.candidates,
        shownItemIds: computeShownItemIds(outcome.candidates),
        imageUrl: effectiveImageUrl,
      },
    });

    return { chatId: msg.chatId, replyText: null, replyParts: outcome.replyParts };
  } finally {
    if (interimTimer) clearTimeout(interimTimer);
  }
}

/**
 * Busca direto por nome de produto, sem foto nenhuma (13/09/2026, pedido
 * do Ibrahim: "também consigo procurar assim"). Mais simples que o
 * caminho de foto — sem reconhecimento de imagem nem comparação visual,
 * já que não há foto pra comparar — mas reaproveita o mesmo ranking e a
 * mesma montagem de resposta.
 */
async function processTextQuery(msg: IncomingMessage): Promise<OrchestratorResult> {
  const keyword = (msg.text ?? "").trim();

  const observation: ImageObservation = {
    observado: "",
    hipotese: "",
    naoIdentificado: [],
    termosDeBusca: [keyword],
  };

  const { replyParts, candidates } = await searchAndReply({
    observation,
    terms: [keyword],
    chatId: msg.chatId,
    messageId: msg.messageId,
  });

  // Mesma lógica de processPhotoMessage: guarda a busca pra permitir
  // refinamento ("mais barata" etc.) numa próxima mensagem sem foto nenhuma.
  await setSession({
    chatId: msg.chatId,
    status: "idle",
    updatedAt: Date.now(),
    lastSearch: {
      candidates,
      shownItemIds: computeShownItemIds(candidates),
    },
  });

  return {
    chatId: msg.chatId,
    replyText: `Também consigo procurar assim. 🔎\n\nVou buscar ${keyword} e separar as melhores opções pra você.`,
    replyParts,
  };
}

/**
 * Responde a um pedido de refinamento ("mais barata"/"melhor qualidade"/
 * "mais parecida") reaproveitando os candidatos já rankeados da busca
 * anterior guardados em `session.lastSearch` — ver buildRefinementReply em
 * reply.ts. Sem isso, essa resposta caía em processTextQuery e virava uma
 * busca literal sem sentido na Shopee (bug real reportado pelo Ibrahim em
 * 13/09/2026, ver TEXTO_FECHAMENTO em reply.ts).
 */
async function processRefinement(
  msg: IncomingMessage,
  session: ConciergeSession,
  intent: RefinementIntent
): Promise<OrchestratorResult> {
  const lastSearch = session.lastSearch;
  if (!lastSearch) {
    // não deveria acontecer (só chamamos isso quando lastSearch existe no
    // chamador), mas por segurança cai pro fluxo de busca por texto normal
    // em vez de travar a resposta
    return processTextQuery(msg);
  }

  const { parts, shownItemIds } = await buildRefinementReply({
    candidates: lastSearch.candidates as RankedCandidate[],
    excludeItemIds: new Set(lastSearch.shownItemIds),
    intent,
  });

  if (parts.length === 0) {
    // já mostramos tudo que tinha nessa busca — encerra o refinamento em
    // vez de repetir um produto já visto
    await setSession({ chatId: msg.chatId, status: "idle", updatedAt: Date.now() });
    return { chatId: msg.chatId, replyText: TEXTO_SEM_MAIS_OPCOES };
  }

  await setSession({
    chatId: msg.chatId,
    status: "idle",
    updatedAt: Date.now(),
    lastSearch: {
      ...lastSearch,
      shownItemIds: [...lastSearch.shownItemIds, ...shownItemIds],
    },
  });

  return { chatId: msg.chatId, replyText: null, replyParts: parts };
}

/**
 * Roteador de estado de conversa pendente — roda ANTES de qualquer
 * interpretação como busca de produto nova, sempre que existe uma busca
 * recente pra essa conversa (`session.lastSearch`). Extraído em função
 * própria em 13/09/2026 (sugestão do debate técnico com o ChatGPT): hoje
 * só trata pedido de refinamento ("mais barata"/"melhor qualidade"/"mais
 * parecida") e confirmação ambígua ("quero"/"sim"/"manda" sem dizer qual),
 * mas é o lugar certo pra crescer amanhã com outras frases dependentes de
 * contexto (ex: "esse", "aquele", "tem preto?") sem precisar reordenar
 * nada em handleIncomingMessage de novo.
 *
 * Devolve null quando a mensagem não é sobre a busca pendente — aí sim o
 * chamador segue pro parser de busca genérico (processTextQuery).
 */
async function resolvePendingConversationState(
  msg: IncomingMessage,
  session: ConciergeSession
): Promise<OrchestratorResult | null> {
  if (!session.lastSearch) return null;

  const intent = detectRefinementIntent(msg.text);
  if (intent) return processRefinement(msg, session, intent);

  // Confirmação genérica ("Quero", "sim"...) sem dizer qual das 3 opções —
  // pede pra especificar em vez de buscar isso literalmente na Shopee
  // (bug real, 13/09/2026, ver isAmbiguousRefinementConfirmation).
  if (isAmbiguousRefinementConfirmation(msg.text)) {
    return { chatId: msg.chatId, replyText: TEXTO_CONFIRMAR_REFINAMENTO };
  }

  return null;
}

export async function handleIncomingMessage(
  msg: IncomingMessage,
  connector?: ChannelConnector
): Promise<OrchestratorResult> {
  // nunca reagir a mensagens enviadas pelo próprio bot (evita loop)
  if (msg.fromMe) {
    return { chatId: msg.chatId, replyText: null };
  }

  const session = await getSession(msg.chatId);

  // Número dedicado ao concierge (12/09/2026): antes esse número era
  // compartilhado com o BancaZAP, e o gatilho de texto "QUERO ENCONTRAR"
  // existia pra não competir com a lógica dele. Agora que o repasse pro
  // BancaZAP foi desativado (ver route.ts, BANCAZAP_FORWARD_DISABLED) e o
  // número é só a vitrine pública (Instagram @descontoschegando), qualquer
  // foto recebida já dispara a busca direto, sem precisar de texto nenhum
  // na legenda — é a experiência que a pessoa espera ao ver "manda a foto
  // do produto" na bio. isTriggerPhrase/CONCIERGE_TRIGGER_PHRASE continuam
  // existindo só pra quem manda o gatilho em texto puro (sem foto ainda).
  if (session.status === "idle") {
    // Caminho principal: qualquer foto, com ou sem legenda, já resolve
    // tudo nesta única invocação — sem depender de nenhum estado guardado
    // entre mensagens.
    if (msg.imageUrl) {
      return processPhotoMessage(msg, session, connector);
    }

    if (isTriggerPhrase(msg.text)) {
      await setSession({ ...session, status: "awaiting_photo" });
      return {
        chatId: msg.chatId,
        replyText: "📸 Manda uma foto do produto que você procura.\n\nEu identifico o que é e busco na Shopee as melhores opções pra você. 🛍️",
      };
    }

    // Estado de conversa pendente (13/09/2026, bug real reportado pelo
    // Ibrahim) — precisa ser checado ANTES da busca de texto genérica
    // abaixo, senão "mais parecida"/"Quero" viram pesquisa literal sem
    // sentido na Shopee em vez de reaproveitar a busca já feita.
    const pendingStateReply = await resolvePendingConversationState(msg, session);
    if (pendingStateReply) return pendingStateReply;

    // Texto puro que não é o gatilho e não é conversa fiada (13/09/2026):
    // trata como busca direta por nome de produto.
    if (!isIgnorableText(msg.text)) {
      return processTextQuery(msg);
    }

    return { chatId: msg.chatId, replyText: null };
  }

  if (session.status === "awaiting_photo" || session.status === "awaiting_clarification") {
    if (!msg.imageUrl && session.status === "awaiting_photo") {
      return {
        chatId: msg.chatId,
        replyText: "Só falta a foto 📸\nManda aqui que eu procuro pra você.",
      };
    }

    return processPhotoMessage(msg, session, connector);
  }

  return { chatId: msg.chatId, replyText: null };
}
