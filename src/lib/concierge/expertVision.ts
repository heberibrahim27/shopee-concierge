/**
 * "Perito" final — só é chamado quando o roteador de confiança
 * (confidenceRouter.ts) decide que o modelo econômico não teve certeza
 * suficiente. Usa um modelo de visão mais forte (configurável, default
 * GPT-6 Astra — ver config.ts) pra comparar a foto ORIGINAL do cliente
 * com os melhores candidatos encontrados na Shopee.
 *
 * Bem mais caro que o modelo econômico usado em recognize.ts/compare.ts
 * — por isso só entra aqui, nunca em toda foto.
 *
 * NOTA: a chamada usa a mesma API (chat.completions) já usada no resto
 * do projeto, no mesmo formato de conteúdo multimodal (image_url). GPT-6
 * Astra é um modelo novo (lançado 03/09/2026) — antes de depender disso
 * de verdade em produção, valha a pena confirmar na documentação da
 * OpenAI se o formato de chamada é exatamente esse ou se o modelo espera
 * a Responses API / outro formato de conteúdo. Se a chamada falhar por
 * incompatibilidade, o fallback abaixo evita que isso derrube a resposta
 * inteira — só significa que o cliente recebe o melhor palpite do modelo
 * econômico em vez do parecer do perito.
 */
import OpenAI from "openai";
import { ImageObservation } from "./recognize";
import { RankedCandidate } from "./rank";
import { CONCIERGE_CONFIG } from "./config";

export interface ExpertVerdict {
  status: "match" | "uncertain";
  bestCandidateIds: string[];
  confidence: number; // 0-1
  reason?: string;
  needsUserClarification: boolean;
  suggestedQuestion?: string;
  /**
   * Adicionado em 13/09/2026 (sugestão do debate técnico com o ChatGPT):
   * antes, quando a shortlist inteira estava errada (busca inicial trouxe
   * candidato ruim), escalar pro perito só rejulgava os MESMOS candidatos
   * — se estavam errados, o perito só confirma com mais certeza que estão
   * errados, sem chance de achar o produto certo. Quando o perito suspeita
   * que um termo de busca diferente encontraria o produto certo (sem
   * precisar perguntar nada ao cliente), sugere esse termo aqui — o
   * orquestrador faz UMA nova rodada de busca com ele antes de desistir
   * (ver orchestrator.ts, shouldRetryWithSuggestedTerm/searchAndReply).
   */
  suggestedSearchTerm?: string;
}

const SYSTEM_PROMPT = `Você é o revisor final de um sistema que sugere produtos parecidos com uma foto enviada por um cliente.
Compare a foto ORIGINAL com os produtos candidatos e determine quais são visual e semanticamente mais compatíveis.
NÃO force uma escolha caso as evidências sejam insuficientes — nesse caso, é melhor pedir outra foto/informação do que arriscar uma sugestão ruim.
Responda em JSON estrito com um destes formatos:
{"status":"match","best_candidate_ids":["id1","id2"],"confidence":0.0-1.0,"reason":"frase curta"}
ou, se precisar de uma informação do cliente pra decidir:
{"status":"uncertain","confidence":0.0-1.0,"needs_user_clarification":true,"suggested_question":"pergunta curta e natural para o cliente"}
ou, se NENHUM candidato remotamente corresponde à foto (a busca trouxe produto de categoria/estilo errado) e você suspeita que um termo de busca diferente encontraria o produto certo, sem precisar perguntar nada ao cliente:
{"status":"uncertain","confidence":0.0-1.0,"needs_user_clarification":false,"suggested_search_term":"termo curto e específico em português pra tentar de novo"}`;

/**
 * @param photoUrl foto original do cliente (não a versão redimensionada)
 * @param observation resultado da primeira análise (recognize.ts)
 * @param candidates melhores candidatos já rankeados (rank.ts) — só os
 *   top N (ver CONCIERGE_CONFIG.expertCandidateLimit) são enviados, pra
 *   não gastar tokens à toa
 */
export async function consultExpertVision(params: {
  photoUrl: string;
  observation: ImageObservation;
  candidates: RankedCandidate[];
}): Promise<ExpertVerdict> {
  const { photoUrl, observation, candidates } = params;
  const shortlist = candidates.slice(0, CONCIERGE_CONFIG.expertCandidateLimit);

  const fallback: ExpertVerdict = {
    status: "uncertain",
    bestCandidateIds: [],
    confidence: 0,
    needsUserClarification: false,
  };

  if (shortlist.length === 0) return fallback;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const client = new OpenAI({ apiKey });

  const candidateContent = shortlist.flatMap(({ offer }) => [
    {
      type: "text" as const,
      text: `itemId: ${offer.itemId} | nome: ${offer.productName} | preço: R$${offer.priceMin}`,
    },
    { type: "image_url" as const, image_url: { url: offer.imageUrl } },
  ]);

  try {
    const completion = await client.chat.completions.create({
      model: CONCIERGE_CONFIG.expertModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Primeira análise (modelo econômico): observado="${observation.observado}", ` +
                `hipótese="${observation.hipotese}", categoria="${observation.categoria ?? ""}", ` +
                `marca="${observation.marca ?? "não identificada"}", modelo="${observation.modelo ?? "não identificado"}".` +
                (observation.exigenciaUsuario ? ` Pedido do cliente: ${observation.exigenciaUsuario}.` : ""),
            },
            { type: "text", text: "Foto original do cliente:" },
            { type: "image_url", image_url: { url: photoUrl } },
            { type: "text", text: "Candidatos encontrados na Shopee:" },
            ...candidateContent,
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    if (parsed.status === "match") {
      return {
        status: "match",
        bestCandidateIds: Array.isArray(parsed.best_candidate_ids)
          ? parsed.best_candidate_ids.map(String)
          : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
        needsUserClarification: false,
      };
    }

    return {
      status: "uncertain",
      bestCandidateIds: [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      needsUserClarification: Boolean(parsed.needs_user_clarification),
      suggestedQuestion:
        typeof parsed.suggested_question === "string" ? parsed.suggested_question : undefined,
      suggestedSearchTerm:
        typeof parsed.suggested_search_term === "string" && parsed.suggested_search_term.trim()
          ? parsed.suggested_search_term.trim()
          : undefined,
    };
  } catch (err) {
    // erro de API/parsing não pode travar a resposta inteira — quem chama
    // cai pro ranking do modelo econômico como já fazia antes
    console.error("[concierge] falha ao consultar modelo avançado:", err);
    return fallback;
  }
}
