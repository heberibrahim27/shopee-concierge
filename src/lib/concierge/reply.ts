import { generateAffiliateShortLink } from "../shopee/queries";
import { ShopeeProductOffer } from "../shopee/types";
import { RankedCandidate, pickHighlightedCandidates, detectClearPick } from "./rank";

// Rótulo usado quando a comparação visual não confirmou o produto com
// confiança (matchType "semelhante_visual") — as outras duas categorias
// de match (modelo_identificado, alternativa_funcional) já implicam
// relevância suficiente e não precisam de ressalva. Reescrito em
// 13/09/2026 pra soar como ressalva natural, não como aviso técnico
// ("não confirmada 100%" soava a limitação de sistema).
const OPCAO_PARECIDA_TEXTO = "\n(pode não ser exatamente o mesmo modelo)";

const TEXTO_SEM_OPCAO_BOA =
  "🤔 Ainda não encontrei uma opção que eu tenha segurança de te indicar.\n\n" +
  "Se puder, manda outra foto do produto — de outro ângulo, da etiqueta ou da marca — que eu tento de novo.\n\n" +
  "Se souber o nome, modelo ou tamanho, pode mandar também.";

const TEXTO_INTRO_PADRAO =
  "✅ Encontrei boas opções para esse produto.\n\nSeparei as que mais valem a pena entre os resultados que encontrei:";

const TEXTO_INTRO_RECOMENDACAO = "✅ Encontrei boas opções para esse produto.\n\n👉 Essa é a que eu escolheria:";

const TEXTO_OUTRAS_OPCOES = "Outras opções:";

const TEXTO_FECHAMENTO =
  "Se quiser, também posso procurar uma mais barata, uma de melhor qualidade ou uma mais parecida com a sua foto. 🔎";

/**
 * Uma "parte" da resposta, na ordem em que devem ser enviadas pro chat.
 * "image" manda a foto real do produto (offer.imageUrl) com a legenda —
 * pedido do Ibrahim pra ver o produto, não só ler o nome/link — e "text"
 * é usado quando não há imagem disponível ou não há candidato nenhum.
 */
export type ReplyPart =
  | { type: "text"; text: string }
  | { type: "image"; imageUrl: string; caption: string };

async function linkFor(offer: ShopeeProductOffer, subId: string): Promise<string> {
  try {
    const generated = await generateAffiliateShortLink({
      originUrl: offer.productLink,
      subIds: [subId],
    });
    return generated.shortLink;
  } catch {
    // se falhar a geração de link próprio, cai pro offerLink já pronto
    return offer.offerLink;
  }
}

/**
 * Legenda de um produto no formato "cartão" pedido pelo Ibrahim — linhas
 * curtas, separadas, fáceis de ler no WhatsApp (nunca um parágrafo corrido).
 *
 * NOTA: a Shopee só devolve `ratingStar` e `sales` — não existe um campo
 * separado de "quantidade de avaliações" na API. Por isso toda opção usa
 * "vendidos" como métrica de volume (nunca inventamos uma contagem de
 * avaliações que a API não fornece). Nota só aparece quando há venda
 * suficiente pra ela significar algo real (mesma trava de antes — produto
 * novo/pouco vendido às vezes vem com nota sem avaliação nenhuma por trás).
 */
function buildCaption(label: string, candidate: RankedCandidate, link: string): string {
  const { offer, matchType } = candidate;
  const rating = parseFloat(offer.ratingStar || "0");
  const notaConfiavel = offer.sales >= 10 && rating > 0;
  const linhaNotaVendas = notaConfiavel
    ? `⭐ ${offer.ratingStar} • ${offer.sales} vendidos`
    : `🛒 ${offer.sales} vendidos`;
  const ressalva = matchType === "semelhante_visual" ? OPCAO_PARECIDA_TEXTO : "";

  return `${label}\n\n${offer.productName}\n\nR$ ${offer.priceMin}\n\n${linhaNotaVendas}\n\n👉 ${link}${ressalva}`;
}

function toPart(offer: ShopeeProductOffer, caption: string): ReplyPart {
  return offer.imageUrl ? { type: "image", imageUrl: offer.imageUrl, caption } : { type: "text", text: caption };
}

/**
 * Monta a resposta com as opções encontradas.
 *
 * Dois modos, decididos por `detectClearPick` (rank.ts):
 *  - Recomendação única: um candidato se destaca de verdade (confirmado,
 *    nota alta, muita venda, vantagem clara de score) — o bot lidera com
 *    "essa é a que eu escolheria" e mostra até 2 alternativas depois.
 *  - Três critérios (comportamento anterior): sem destaque claro, manda
 *    até 3 produtos DISTINTOS com critério explícito — 💰 menor preço,
 *    ⭐ melhor avaliada, 🔥 mais vendida — sempre dentro do conjunto já
 *    filtrado por relevância visual (pickHighlightedCandidates em rank.ts).
 *
 * subIds: token curto e simples (a Shopee rejeita valores compostos/longos).
 */
export async function buildReplyMessage(params: {
  candidates: RankedCandidate[];
  chatId: string;
}): Promise<ReplyPart[]> {
  const { candidates } = params;
  const clearPick = detectClearPick(candidates);

  if (clearPick) {
    const highlights = pickHighlightedCandidates(candidates).filter(
      (h) => h.candidate.offer.itemId !== clearPick.offer.itemId
    );

    if (highlights.length === 0) {
      // não deveria acontecer (clearPick também é o topo do ranking geral),
      // mas por segurança cai pro fluxo de 3 critérios normal
      return buildThreeCriteriaReply(candidates);
    }

    const parts: ReplyPart[] = [{ type: "text", text: TEXTO_INTRO_RECOMENDACAO }];

    const linkRecomendado = await linkFor(clearPick.offer, "s1");
    parts.push(toPart(clearPick.offer, buildCaption("✅ RECOMENDADA", clearPick, linkRecomendado)));

    parts.push({ type: "text", text: TEXTO_OUTRAS_OPCOES });
    for (const [i, { label, candidate }] of highlights.slice(0, 2).entries()) {
      const link = await linkFor(candidate.offer, `s${i + 2}`);
      parts.push(toPart(candidate.offer, buildCaption(label, candidate, link)));
    }

    parts.push({ type: "text", text: TEXTO_FECHAMENTO });
    return parts;
  }

  return buildThreeCriteriaReply(candidates);
}

async function buildThreeCriteriaReply(candidates: RankedCandidate[]): Promise<ReplyPart[]> {
  const highlights = pickHighlightedCandidates(candidates);

  if (highlights.length === 0) {
    return [{ type: "text", text: TEXTO_SEM_OPCAO_BOA }];
  }

  const parts: ReplyPart[] = [{ type: "text", text: TEXTO_INTRO_PADRAO }];

  for (const [i, { label, candidate }] of highlights.entries()) {
    const link = await linkFor(candidate.offer, `s${i + 1}`);
    parts.push(toPart(candidate.offer, buildCaption(label, candidate, link)));
  }

  parts.push({ type: "text", text: TEXTO_FECHAMENTO });
  return parts;
}
