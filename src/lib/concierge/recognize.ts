/**
 * Reconhecimento de imagem — separa Observado / Hipótese / Não-identificado
 * / Exigência-do-usuário, exatamente como combinado no debate (nunca deixar
 * uma hipótese visual virar especificação inventada na resposta).
 *
 * Usa OpenAI (já é o provedor de IA usado nos outros produtos — ver stack).
 * Custo aproximado: alguns centavos de dólar por foto processada (chamada
 * de visão + geração das queries de busca) — pequeno, mas real; ainda
 * precisa de OPENAI_API_KEY configurada.
 *
 * Campos de marca/modelo/cor/texto visível + confiança foram adicionados
 * pra alimentar o roteador de confiança (ver confidenceRouter.ts) — esse
 * modelo econômico continua sendo a PRIMEIRA análise, só que agora dá
 * sinal suficiente pra decidir se precisa escalar pro modelo avançado.
 */
import OpenAI from "openai";

export interface ImageObservation {
  observado: string; // o que dá pra ver na foto, sem interpretar
  hipotese: string; // interpretação mais provável (categoria/uso)
  naoIdentificado: string[]; // marca, modelo, dimensão etc. que não dá pra saber pela foto
  exigenciaUsuario?: string; // o que a pessoa pediu no texto, se pediu algo específico
  perguntaEsclarecimento?: string; // pergunta curta a fazer antes de buscar, se houver ambiguidade real
  termosDeBusca: string[]; // 2-4 termos de busca pra tentar na Shopee (específico -> genérico)
  faixaPrecoEstimadaBRL?: { min: number; max: number }; // estimativa de faixa de preço em reais, só quando dá pra chutar com alguma confiança pelo tipo/acabamento do produto — usada só pra não sugerir opção 5x mais cara/barata, nunca tratada como spec confirmada

  // Campos novos (roteador de confiança):
  categoria?: string; // categoria geral do produto (ex: "tenis", "cafeteira")
  marca?: string; // só quando visível/legível na foto — nunca inferida
  modelo?: string; // só quando visível/legível na foto — nunca inferida
  cor?: string;
  textoVisivel?: string[]; // texto/logo legível na foto (ex: "AIR", "NIKE")
  confiancaCategoria?: number; // 0-1
  confiancaMarca?: number; // 0-1 (0 ou ausente se marca não identificada)
  confiancaModelo?: number; // 0-1 (0 ou ausente se modelo não identificado)
  confiancaGeral?: number; // 0-1 — sinal principal usado pelo roteador de confiança
}

const SYSTEM_PROMPT = `Você ajuda a identificar produtos a partir de uma foto para buscar equivalentes na Shopee (Brasil).
Responda em JSON estrito com os campos: observado, hipotese, naoIdentificado (array), exigenciaUsuario (opcional), perguntaEsclarecimento (opcional, só se realmente necessário), termosDeBusca (array de 2 a 4 termos curtos em português, do mais específico ao mais genérico, pra usar como keyword de busca), faixaPrecoEstimadaBRL (opcional, objeto {min, max} em reais — só inclua se der pra estimar uma faixa plausível pelo tipo/acabamento/complexidade aparente do produto; se não der pra estimar com alguma confiança, omita esse campo), categoria (curta, ex: "tenis", "cafeteira"), marca (opcional, só se estiver visível/legível na foto), modelo (opcional, só se estiver visível/legível na foto), cor (opcional), textoVisivel (array de texto/logo legível na foto, opcional), confiancaCategoria, confiancaMarca, confiancaModelo e confiancaGeral (todos números de 0 a 1 — confiancaMarca/confiancaModelo devem ser 0 ou omitidos quando marca/modelo não foram identificados).
Regras: nunca invente marca, modelo, dimensão ou material que não esteja visível ou dito pelo usuário — isso vai em naoIdentificado, e a confiança correspondente deve ser baixa/zero. Só inclua perguntaEsclarecimento se a foto tiver mais de um objeto plausível, ou se a compatibilidade/tamanho for essencial e não puder ser assumida. faixaPrecoEstimadaBRL é uma estimativa grosseira pra evitar sugestões muito fora da faixa, nunca uma promessa de preço. confiancaGeral reflete o quanto você confia na identificação como um todo (categoria + marca/modelo quando aplicável) — seja honesto e conservador, não infle esse número.`;

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

  const clampConfidence = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;

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
    categoria: typeof parsed.categoria === "string" ? parsed.categoria : undefined,
    marca: typeof parsed.marca === "string" && parsed.marca.trim() ? parsed.marca : undefined,
    modelo: typeof parsed.modelo === "string" && parsed.modelo.trim() ? parsed.modelo : undefined,
    cor: typeof parsed.cor === "string" ? parsed.cor : undefined,
    textoVisivel: Array.isArray(parsed.textoVisivel) ? parsed.textoVisivel : undefined,
    confiancaCategoria: clampConfidence(parsed.confiancaCategoria),
    confiancaMarca: clampConfidence(parsed.confiancaMarca),
    confiancaModelo: clampConfidence(parsed.confiancaModelo),
    confiancaGeral: clampConfidence(parsed.confiancaGeral),
  };
}
