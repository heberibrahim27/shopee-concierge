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
 */
import OpenAI from "openai";
import { ShopeeProductOffer } from "../shopee/types";
import { ImageObservation } from "./recognize";
import { MatchType } from "./rank";

export interface VisualComparison {
  matchType: MatchType | "nao_relacionado";
  motivo?: string; // frase curta explicando a diferença, útil pra depurar
}

const SYSTEM_PROMPT = `Você compara uma foto de referência (o que a pessoa quer encontrar) com fotos de produtos candidatos de um marketplace.
Pra cada candidato (identificado por "itemId"), classifique com honestidade:
- "modelo_identificado": praticamente o mesmo produto (mesma marca/modelo visível, ou visualmente idêntico em detalhes).
- "alternativa_funcional": mesma categoria e função, estilo/acabamento parecido, mas não é o mesmo produto exato.
- "semelhante_visual": mesma categoria geral, mas estilo, formato, faixa de preço aparente ou acabamento visivelmente diferentes.
- "nao_relacionado": categoria diferente do que foi pedido, ou nem parece o mesmo tipo de produto — não deveria ser sugerido.
Responda em JSON estrito: { "resultados": [ { "itemId": "...", "matchType": "...", "motivo": "frase curta" } ] }, um item por candidato recebido, na mesma ordem.`;

export async function compareCandidatesVisually(params: {
  photoUrl: string;
  observation: ImageObservation;
  candidates: ShopeeProductOffer[];
}): Promise<Map<string, VisualComparison>> {
  const { photoUrl, observation, candidates } = params;
  const result = new Map<string, VisualComparison>();

  if (candidates.length === 0) return result;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // sem chave, não dá pra comparar — quem chama decide o que fazer
    // (o comportamento antigo, baseado em texto, continua como fallback)
    return result;
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
    const completion = await client.chat.completions.create({
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
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const resultados: Array<{ itemId: string; matchType: string; motivo?: string }> =
      parsed.resultados ?? [];

    for (const r of resultados) {
      const matchType =
        r.matchType === "modelo_identificado" ||
        r.matchType === "alternativa_funcional" ||
        r.matchType === "semelhante_visual" ||
        r.matchType === "nao_relacionado"
          ? r.matchType
          : "semelhante_visual";
      result.set(r.itemId, { matchType, motivo: r.motivo });
    }
  } catch (err) {
    // se a comparação visual falhar (erro de API, JSON inválido etc.),
    // devolve mapa vazio — quem chama cai pro comportamento textual antigo
    // em vez de travar a resposta inteira. Bug real (13/09/2026): essa
    // falha era TOTALMENTE silenciosa (catch vazio) — impossível saber, só
    // olhando a resposta errada, se a comparação visual rodou e errou ou se
    // nem chegou a rodar. Logando o motivo real agora.
    console.error("[concierge][compare] comparação visual falhou, caindo pro fallback textual:", err);
  }

  return result;
}
