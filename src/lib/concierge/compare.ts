/**
 * Comparação visual REAL entre a foto do usuário e as imagens dos produtos
 * candidatos encontrados na Shopee.
 *
 * Antes disso, o matchType era decidido só por um match textual grosseiro
 * (termosDeBusca dentro do productName) — por isso resultados como "achou
 * 3 ventiladores de teto" apareciam mesmo quando nenhum se parecia de fato
 * com o que a pessoa mandou (estilo, preço, acabamento bem diferentes).
 * Essa etapa manda a foto original + as fotos dos candidatos pro mesmo
 * modelo de visão e pede uma comparação honesta produto a produto.
 *
 * Resultado tipado (13/09/2026, sugestão do debate técnico com o ChatGPT
 * sobre a correção do bug da bermuda jeans x tactel): antes, QUALQUER
 * situação em que a comparação não "confirmava" nada virava o MESMO Map
 * vazio — sem/nunca chamou (sem OPENAI_API_KEY), erro de API, JSON
 * inválido, timeout e "rodou e não achou nada parecido de verdade" eram
 * todos indistinguíveis. Isso escondia problema de infraestrutura atrás
 * de "não achei" e impedia alertar sobre degradação real (ver
 * visualHealth.ts, que usa esse `outcome` pra decidir modo seguro). Agora
 * `outcome` sempre diz por quê o Map pode estar vazio/incompleto — o Map
 * em si não muda, quem consome ele (rank.ts) continua igual.
 */
import OpenAI from "openai";
import { ShopeeProductOffer } from "../shopee/types";
import { ImageObservation } from "./recognize";
import { MatchType } from "./rank";
import { CONCIERGE_CONFIG } from "./config";

export interface VisualComparison {
  matchType: MatchType | "nao_relacionado";
  motivo?: string; // frase curta explicando a diferença, útil pra depurar
}

export type VisualCompareFailureReason = "erro_api" | "resposta_invalida" | "timeout";

export type VisualCompareOutcome =
  | { status: "ok" } // chamou a API e processou a resposta normalmente (pode ter 0 matches — não achou nada parecido de verdade, isso é resultado válido, não falha)
  | { status: "sem_candidatos" } // nada pra comparar (busca não trouxe nada) — não é uma tentativa real, não conta pra saúde/métrica
  | { status: "sem_chave" } // OPENAI_API_KEY ausente — falha de configuração, não vale retry
  | { status: "falhou"; reason: VisualCompareFailureReason; retryable: boolean; detail: string };

export interface VisualCompareRunResult {
  matches: Map<string, VisualComparison>;
  outcome: VisualCompareOutcome;
}

const SYSTEM_PROMPT = `Você compara uma foto de referência (o que a pessoa quer encontrar) com fotos de produtos candidatos de um marketplace.
Pra cada candidato (identificado por "itemId"), classifique com honestidade:
- "modelo_identificado": praticamente o mesmo produto (mesma marca/modelo visível, ou visualmente idêntico em detalhes).
- "alternativa_funcional": mesma categoria e função, estilo/acabamento parecido, mas não é o mesmo produto exato.
- "semelhante_visual": mesma categoria geral, mas estilo, formato, faixa de preço aparente ou acabamento visivelmente diferentes.
- "nao_relacionado": categoria diferente do que foi pedido, ou nem parece o mesmo tipo de produto — não deveria ser sugerido.
Responda em JSON estrito: { "resultados": [ { "itemId": "...", "matchType": "...", "motivo": "frase curta" } ] }, um item por candidato recebido, na mesma ordem.`;

class VisualCompareTimeoutError extends Error {}

export async function compareCandidatesVisually(params: {
  photoUrl: string;
  observation: ImageObservation;
  candidates: ShopeeProductOffer[];
}): Promise<VisualCompareRunResult> {
  const { photoUrl, observation, candidates } = params;
  const matches = new Map<string, VisualComparison>();

  if (candidates.length === 0) return { matches, outcome: { status: "sem_candidatos" } };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // sem chave, não dá pra comparar — quem chama decide o que fazer
    // (o comportamento antigo, baseado em texto, continua como fallback)
    return { matches, outcome: { status: "sem_chave" } };
  }

  const client = new OpenAI({ apiKey });

  const candidateContent = candidates.flatMap((c) => [
    {
      type: "text" as const,
      text: `itemId: ${c.itemId} | nome: ${c.productName} | preço: R$${c.priceMin}`,
    },
    { type: "image_url" as const, image_url: { url: c.imageUrl } },
  ]);

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        model: process.env.CONCIERGE_VISION_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Foto de referência (o que a pessoa quer encontrar). ` +
                  `Observado: ${observation.observado}. Hipótese: ${observation.hipotese}.` +
                  (observation.exigenciaUsuario ? ` Pedido da pessoa: ${observation.exigenciaUsuario}.` : ""),
              },
              { type: "image_url", image_url: { url: photoUrl } },
              { type: "text", text: "Candidatos a comparar:" },
              ...candidateContent,
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new VisualCompareTimeoutError("comparação visual excedeu o tempo limite")),
          CONCIERGE_CONFIG.visualCompareTimeoutMs
        );
      }),
    ]);

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { resultados?: Array<{ itemId: string; matchType: string; motivo?: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      // JSON inválido é uma causa DIFERENTE de erro de rede/API — separado
      // aqui pra dar pra monitorar cada uma (ver visualHealth.ts)
      console.error("[concierge][compare] resposta da comparação visual não é JSON válido:", parseErr);
      return {
        matches,
        outcome: {
          status: "falhou",
          reason: "resposta_invalida",
          retryable: true,
          detail: parseErr instanceof Error ? parseErr.message : String(parseErr),
        },
      };
    }

    const resultados = parsed.resultados ?? [];
    for (const r of resultados) {
      const matchType =
        r.matchType === "modelo_identificado" ||
        r.matchType === "alternativa_funcional" ||
        r.matchType === "semelhante_visual" ||
        r.matchType === "nao_relacionado"
          ? r.matchType
          : "semelhante_visual";
      matches.set(r.itemId, { matchType, motivo: r.motivo });
    }

    return { matches, outcome: { status: "ok" } };
  } catch (err) {
    // se a comparação visual falhar (erro de API, timeout etc.), devolve
    // Map vazio — quem chama cai pro comportamento textual antigo em vez
    // de travar a resposta inteira. Bug real (13/09/2026): essa falha era
    // TOTALMENTE silenciosa (catch vazio) — impossível saber, só olhando a
    // resposta errada, se a comparação visual rodou e errou ou se nem
    // chegou a rodar. Logando o motivo real agora, com causa classificada.
    if (err instanceof VisualCompareTimeoutError) {
      console.error("[concierge][compare]", err.message);
      return { matches, outcome: { status: "falhou", reason: "timeout", retryable: true, detail: err.message } };
    }
    console.error("[concierge][compare] comparação visual falhou, caindo pro fallback textual:", err);
    return {
      matches,
      outcome: {
        status: "falhou",
        reason: "erro_api",
        retryable: true,
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
