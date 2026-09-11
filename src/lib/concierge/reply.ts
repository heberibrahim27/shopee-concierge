import { generateAffiliateShortLink } from "../shopee/queries";
import { RankedCandidate, MatchType } from "./rank";

const MATCH_LABEL: Record<MatchType, string> = {
  modelo_identificado: "modelo identificado",
  alternativa_funcional: "alternativa equivalente",
  semelhante_visual: "opção parecida (não confirmada 100%)",
};

/**
 * Monta a mensagem de resposta com até 3 opções, cada uma com link
 * de afiliado próprio (subId identifica canal/sessão pra depois medir
 * cliques por conversa).
 *
 * subIds: token curto e simples (a Shopee rejeita valores compostos/longos).
 */
export async function buildReplyMessage(params: {
  candidates: RankedCandidate[];
  chatId: string;
}): Promise<string> {
  const top = params.candidates.slice(0, 3);

  if (top.length === 0) {
    return (
      "Não achei uma opção boa o suficiente pra essa foto ainda. " +
      "Pode mandar outro ângulo, uma foto da etiqueta, ou me dizer marca/tamanho se souber?"
    );
  }

  const lines: string[] = [];
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

    lines.push(
      `${i + 1}. ${offer.productName} — R$${offer.priceMin} (${MATCH_LABEL[matchType]}${notaTexto})\n${link}`
    );
  }

  return `Achei essas opções na Shopee:\n\n${lines.join("\n\n")}`;
}
