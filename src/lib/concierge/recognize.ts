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
  termosDeBusca: string[]; // 4-6 consultas curtas e complementares (fan-out visual)
  atributosVisuais?: string[]; // detalhes discriminantes: formato, construção, padrão, acabamento
  faixaPrecoEstimadaBRL?: { min: number; max: number }; // estimativa de faixa de preço em reais, só quando dá pra chutar com alguma confiança pelo tipo/acabamento do produto — usada só pra não sugerir opção 5x mais cara/barata, nunca tratada como spec confirmada
  /**
   * Preço em reais que aparece ESCRITO e legível na própria foto (ex: a
   * pessoa manda um print de um anúncio/vitrine já mostrando "R$147,25") —
   * diferente de faixaPrecoEstimadaBRL, que é um CHUTE pelo tipo de produto.
   * Quando presente, é um sinal muito mais forte (é o preço que a pessoa
   * está de olho, não uma estimativa) e o ranking passa a penalizar bem
   * mais forte candidatos fora dessa faixa (ver rank.ts) — evita sugerir
   * produto 2-3x mais caro que o que a pessoa mostrou (bug real: mandou
   * print de um conversor de TV a R$147 e o bot sugeriu 3 opções entre
   * R$197 e R$399, todas mais caras, porque não havia preço-âncora nenhum
   * puxando o ranking pro valor certo).
   */
  precoVisivelNaFotoBRL?: number;

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

  /**
   * Atributos estruturados adicionados em 13/09/2026 (sugestão do debate
   * técnico com o ChatGPT sobre o bug da bermuda jeans aparecendo pra uma
   * foto de bermuda tactel): quando a comparação visual real não roda
   * (sem sinal visual nenhum, ver compare.ts/rank.ts), o fallback textual
   * antigo só batia substring do termo de busca no nome do produto — sinal
   * fraco demais, que deixava passar produtos de material/uso claramente
   * incompatíveis só por compartilharem palavras genéricas ("bermuda
   * branca"). Esses 2 campos alimentam um bloqueio duro em rank.ts: um
   * candidato cujo nome bate um material/uso de um GRUPO diferente do
   * observado na foto é descartado, mesmo que o termo de busca bata.
   * Só preenchidos quando dá pra estimar com alguma confiança pela foto —
   * nunca inventados.
   */
  materialProvavel?: string; // material/acabamento aparente (ex: "tactel", "jeans", "couro", "algodão")
  usoOuEstilo?: string; // uso/estilo aparente (ex: "esportivo", "casual", "social", "praia")
}

const SYSTEM_PROMPT = `Você ajuda a identificar produtos a partir de uma foto para buscar equivalentes na Shopee (Brasil).
Responda em JSON estrito com os campos: observado, hipotese, naoIdentificado (array), exigenciaUsuario (opcional), perguntaEsclarecimento (opcional, só se realmente necessário), atributosVisuais (array de 2 a 6 detalhes discriminantes visíveis, como formato, camadas, construção, padrão e acabamento), termosDeBusca (array de 4 a 6 consultas COMPLEMENTARES de 2 a 6 palavras em português para a Shopee; faça fan-out com sinônimos usados em anúncios e combine separadamente categoria, função, cor e construção visual — por exemplo, uma camada interna aparente em short esportivo deve gerar também uma consulta com "2 em 1"; nunca transforme todos os atributos em uma única frase longa), precoVisivelNaFotoBRL (opcional, número em reais — SÓ quando a própria foto mostra um preço escrito e legível, como um print de anúncio/vitrine/etiqueta de preço, ex: "R$147,25" vira 147.25; nunca invente um valor que não esteja escrito na foto), faixaPrecoEstimadaBRL (opcional, objeto {min, max} em reais — se precoVisivelNaFotoBRL estiver presente, use uma faixa ESTREITA ancorada nele, tipo min=70% e max=130% desse valor; senão, só inclua se der pra estimar uma faixa plausível pelo tipo/acabamento/complexidade aparente do produto, e nesse caso pode ser uma faixa mais larga; se não der pra estimar com nenhuma confiança, omita o campo), categoria (curta, ex: "tenis", "cafeteira"), marca (opcional, só se estiver visível/legível na foto), modelo (opcional, só se estiver visível/legível na foto), cor (opcional), textoVisivel (array de texto/logo legível na foto, opcional), materialProvavel (opcional, curto, ex: "tactel", "jeans", "couro", "algodão" — só quando der pra estimar pela textura/aparência da foto), usoOuEstilo (opcional, curto, ex: "esportivo", "casual", "social", "praia" — só quando der pra estimar pelo contexto/corte aparente), confiancaCategoria, confiancaMarca, confiancaModelo e confiancaGeral (todos números de 0 a 1 — confiancaMarca/confiancaModelo devem ser 0 ou omitidos quando marca/modelo não foram identificados).
Regras: nunca invente marca, modelo, dimensão ou material que não esteja visível ou dito pelo usuário — isso vai em naoIdentificado, e a confiança correspondente deve ser baixa/zero. Só inclua perguntaEsclarecimento se a foto tiver mais de um objeto plausível, ou se a compatibilidade/tamanho for essencial e não puder ser assumida. faixaPrecoEstimadaBRL (sem preço visível) é uma estimativa grosseira pra evitar sugestões muito fora da faixa, nunca uma promessa de preço. confiancaGeral reflete o quanto você confia na identificação como um todo (categoria + marca/modelo quando aplicável) — seja honesto e conservador, não infle esse número.`;

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
    atributosVisuais: Array.isArray(parsed.atributosVisuais)
      ? parsed.atributosVisuais.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))
      : undefined,
    precoVisivelNaFotoBRL:
      typeof parsed.precoVisivelNaFotoBRL === "number" && Number.isFinite(parsed.precoVisivelNaFotoBRL) && parsed.precoVisivelNaFotoBRL > 0
        ? parsed.precoVisivelNaFotoBRL
        : undefined,
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
    materialProvavel:
      typeof parsed.materialProvavel === "string" && parsed.materialProvavel.trim()
        ? parsed.materialProvavel
        : undefined,
    usoOuEstilo:
      typeof parsed.usoOuEstilo === "string" && parsed.usoOuEstilo.trim() ? parsed.usoOuEstilo : undefined,
    confiancaCategoria: clampConfidence(parsed.confiancaCategoria),
    confiancaMarca: clampConfidence(parsed.confiancaMarca),
    confiancaModelo: clampConfidence(parsed.confiancaModelo),
    confiancaGeral: clampConfidence(parsed.confiancaGeral),
  };
}
