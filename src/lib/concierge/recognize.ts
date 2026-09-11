/**
 * Reconhecimento de imagem — separa Observado / Hipótese / Não-identificado
 * / Exigência-do-usuário, exatamente como combinado no debate (nunca deixar
 * uma hipótese visual virar especificação inventada na resposta).
 *
 * Usa OpenAI (já é o provedor de IA usado nos outros produtos — ver stack).
 * Custo aproximado: alguns centavos de dólar por foto processada (chamada
 * de visão + geração das queries de busca) — pequeno, mas real; ainda
 * precisa de OPENAI_API_KEY configurada.
 */
import OpenAI from "openai";

export interface ImageObservation {
  observado: string; // o que dá pra ver na foto, sem interpretar
  hipotese: string; // interpretação mais provável (categoria/uso)
  naoIdentificado: string[]; // marca, modelo, dimensão etc. que não dá pra saber pela foto
  exigenciaUsuario?: string; // o que a pessoa pediu no texto, se pediu algo específico
  perguntaEsclarecimento?: string; // pergunta curta a fazer antes de buscar, se houver ambiguidade real
  termosDeBusca: string[]; // 1-3 termos de busca pra tentar na Shopee
  faixaPrecoEstimadaBRL?: { min: number; max: number }; // estimativa de faixa de preço em reais, só quando dá pra chutar com alguma confiança pelo tipo/acabamento do produto — usada só pra não sugerir opção 5x mais cara/barata, nunca tratada como spec confirmada
}

const SYSTEM_PROMPT = `Você ajuda a identificar produtos a partir de uma foto para buscar equivalentes na Shopee (Brasil).
Responda em JSON estrito com os campos: observado, hipotese, naoIdentificado (array), exigenciaUsuario (opcional), perguntaEsclarecimento (opcional, só se realmente necessário), termosDeBusca (array de 1 a 3 termos curtos em português, pra usar como keyword de busca), faixaPrecoEstimadaBRL (opcional, objeto {min, max} em reais — só inclua se der pra estimar uma faixa plausível pelo tipo/acabamento/complexidade aparente do produto; se não der pra estimar com alguma confiança, omita esse campo).
Regras: nunca invente marca, modelo, dimensão ou material que não esteja visível ou dito pelo usuário — isso vai em naoIdentificado. Só inclua perguntaEsclarecimento se a foto tiver mais de um objeto plausível, ou se a compatibilidade/tamanho for essencial e não puder ser assumida. faixaPrecoEstimadaBRL é uma estimativa grosseira pra evitar sugestões muito fora da faixa, nunca uma promessa de preço.`;

export async function recognizeProductImage(params: {
  imageUrl: string;
  userText?: string;
}): Promise<ImageObservation> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no ambiente (.env).");
  }
  const client = new OpenAI({ apiKey });

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
            text: params.userText
              ? `Mensagem da pessoa: "${params.userText}"`
              : "A pessoa só mandou a foto, sem texto.",
          },
          { type: "image_url", image_url: { url: params.imageUrl } },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);

  return {
    observado: parsed.observado ?? "",
    hipotese: parsed.hipotese ?? "",
    naoIdentificado: parsed.naoIdentificado ?? [],
    exigenciaUsuario: parsed.exigenciaUsuario,
    perguntaEsclarecimento: parsed.perguntaEsclarecimento,
    termosDeBusca: parsed.termosDeBusca ?? [],
    faixaPrecoEstimadaBRL:
      parsed.faixaPrecoEstimadaBRL &&
      typeof parsed.faixaPrecoEstimadaBRL.min === "number" &&
      typeof parsed.faixaPrecoEstimadaBRL.max === "number"
        ? parsed.faixaPrecoEstimadaBRL
        : undefined,
  };
}
