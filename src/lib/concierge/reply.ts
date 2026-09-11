import { generateAffiliateShortLink } from "../shopee/queries";
import { RankedCandidate, MatchType } from "./rank";

const MATCH_LABEL: Record<MatchType, string> = {
  modelo_identificado: "modelo identificado",
  alternativa_funcional: "alternativa equivalente",
  semelhante_visual: "opção parecida (não confirmada 100%)",
};

/**
 * Uma "parte" da resposta, na ordem em que devem ser enviadas pro chat.
 * "image" manda a foto real do produto (offer.imageUrl) com a legenda —
 * pedido do Ibrahim pra ver o produto, não só ler o nome/link — e "text"
 * é usado quando não há imagem disponível ou não há candidato nenhum.
 */
export type ReplyPart =
  | { type: "text"; text: string }
  | { type: "image"; imageUrl: string; caption: string };

/**
 * Monta a resposta com até 3 opções, cada uma como uma mensagem de imagem
 * (foto real do produto na Shopee) com legenda contendo nome, preço, tipo
 * de correspondência e link de afiliado próprio (subId identifica
 * canal/sessão pra depois medir cliques por conversa).
 *
 * subIds: token curto e simples (a Shopee rejeita valores compostos/longos).
 */
export async function buildReplyMessage(params: {
  candidates: RankedCandidate[];
  chatId: string;
}): Promise<ReplyPart[]> {
  const top = params.candidates.slice(0, 3);

  if (top.length === 0) {
    return [
      {
        type: "text",
        text:
          "Não achei uma opção boa o suficiente pra essa foto ainda. " +
          "Pode mandar outro ângulo, uma foto da etiqueta, ou me dizer marca/tamanho se souber?",
      },
    ];
  }

  const parts: ReplyPart[] = [];
  for (const [i, candidate] of top.entries()) {
    const { offer, matchType } = candidate;
    const subId = `s${i + 1}`;
    let link = offer.offerLink;
    try {
      const generated = await generateAffiliateShortLink({
        originUrl: offer.productLink,
        subIds: [subId],
      });
      link = generated.shortLink;
    } catch {
      // se falhar a geração de link próprio, cai pro offerLink já pronto
    }

    // só menciona a nota quando há venda suficiente pra ela ter algum
    // significado real — pra produto muito novo/pouco vendido, a Shopee
    // às vezes retorna uma nota que não reflete avaliação de comprador
    // nenhuma ainda (a página do produto mostra "Nenhuma Avaliação Ainda")
    const rating = parseFloat(offer.ratingStar || "0");
    const notaTexto = offer.sales >= 10 && rating > 0 ? `, nota ${offer.ratingStar}` : "";

    const caption = `${offer.productName} — R$${offer.priceMin} (${MATCH_LABEL[matchType]}${notaTexto})\n${link}`;

    parts.push(
      offer.imageUrl
        ? { type: "image", imageUrl: offer.imageUrl, caption }
        : { type: "text", text: caption }
    );
  }

  return parts;
}
