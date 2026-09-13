/**
 * Teste standalone (sem API real, sem Supabase) pro bug real reportado pelo
 * Ibrahim em 13/09/2026: a mensagem de fechamento do bot oferecia "mais
 * barata"/"melhor qualidade"/"mais parecida", mas nenhum código tratava
 * essa resposta — ela caía direto na busca de texto puro (processTextQuery)
 * e virava uma pesquisa literal sem sentido na Shopee.
 *
 * Cobre as duas peças da correção:
 *  - detectRefinementIntent (orchestrator.ts): reconhece as frases de
 *    refinamento e NÃO confunde uma busca de texto normal com um pedido de
 *    refinamento.
 *  - buildRefinementReply (reply.ts): reordena os candidatos já rankeados
 *    da busca anterior pelo critério pedido, nunca repete um item já
 *    mostrado, e sinaliza pool vazio corretamente.
 *
 * Roda com: npx tsx scripts/test-refinement-flow.ts
 */
import { detectRefinementIntent } from "../src/lib/concierge/orchestrator";
import { buildRefinementReply, computeShownItemIds } from "../src/lib/concierge/reply";
import { rankCandidates } from "../src/lib/concierge/rank";
import { ImageObservation } from "../src/lib/concierge/recognize";
import { ShopeeProductOffer } from "../src/lib/shopee/types";

function offer(partial: Partial<ShopeeProductOffer> & { itemId: string; productName: string }): ShopeeProductOffer {
  return {
    priceMin: "10",
    priceMax: "10",
    commissionRate: "0.1",
    commission: "1",
    sales: 100,
    ratingStar: "4.5",
    priceDiscountRate: 0,
    imageUrl: "https://example.com/img.jpg",
    shopId: "1",
    shopName: "loja",
    shopType: 1,
    productLink: "https://shopee.com.br/produto",
    offerLink: "https://shopee.com.br/oferta",
    ...partial,
  };
}

const observation: ImageObservation = {
  observado: "bermuda de academia tactel branca",
  hipotese: "bermuda esportiva",
  naoIdentificado: [],
  termosDeBusca: ["bermuda tactel"],
};

let failed = false;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "OK  " : "FAIL"} ${desc}`);
  if (!ok) failed = true;
}

async function main() {
  // --- detectRefinementIntent -------------------------------------------
  check("'mais parecida' é reconhecida como refinamento (o bug real)", detectRefinementIntent("Mais parecida") === "parecida");
  check("'tem uma mais parecida?' também é reconhecida", detectRefinementIntent("tem uma mais parecida?") === "parecida");
  check("'mais barata' é reconhecida", detectRefinementIntent("quero mais barata") === "barata");
  check("'melhor qualidade' é reconhecida", detectRefinementIntent("prefiro de melhor qualidade") === "qualidade");
  check("'melhor avaliada' também conta como qualidade", detectRefinementIntent("a melhor avaliada") === "qualidade");
  check("texto solto sem gatilho não é refinamento", detectRefinementIntent("tenis de corrida azul") === null);
  check("texto vazio não é refinamento", detectRefinementIntent(undefined) === null);

  // --- buildRefinementReply -----------------------------------------------
  const barata = offer({ itemId: "barata", productName: "Bermuda Tactel Basica", priceMin: "39" });
  const cara = offer({ itemId: "cara", productName: "Bermuda Tactel Premium", priceMin: "89" });
  const notaAlta = offer({ itemId: "nota-alta", productName: "Bermuda Tactel Pro", priceMin: "60", ratingStar: "4.9", sales: 5000 });
  const notaBaixa = offer({ itemId: "nota-baixa", productName: "Bermuda Tactel Simples", priceMin: "55", ratingStar: "4.0", sales: 30 });

  const candidates = rankCandidates([barata, cara, notaAlta, notaBaixa], observation, new Map());
  const shown = new Set(computeShownItemIds(candidates).slice(0, 1)); // simula "1º já mostrado"

  const refinoBarata = await buildRefinementReply({ candidates, excludeItemIds: shown, intent: "barata" });
  // o item escolhido não pode ser um dos já mostrados, e deve ser o de
  // menor preço dentre os restantes
  const poolBarata = candidates.filter((c) => !shown.has(c.offer.itemId));
  const esperadoBarata = [...poolBarata].sort((a, b) => parseFloat(a.offer.priceMin) - parseFloat(b.offer.priceMin))[0];
  check("refinamento 'barata' nunca repete item já mostrado", !shown.has(refinoBarata.shownItemIds[0]));
  check("refinamento 'barata' é de fato o mais barato restante", refinoBarata.shownItemIds[0] === esperadoBarata.offer.itemId);

  const refinoQualidade = await buildRefinementReply({ candidates, excludeItemIds: shown, intent: "qualidade" });
  const poolQualidade = candidates.filter((c) => !shown.has(c.offer.itemId));
  const esperadoQualidade = [...poolQualidade].sort((a, b) => {
    const ra = parseFloat(a.offer.ratingStar || "0");
    const rb = parseFloat(b.offer.ratingStar || "0");
    return rb !== ra ? rb - ra : b.offer.sales - a.offer.sales;
  })[0];
  check("refinamento 'qualidade' escolhe a melhor nota/venda restante", refinoQualidade.shownItemIds[0] === esperadoQualidade.offer.itemId);

  const refinoParecida = await buildRefinementReply({ candidates, excludeItemIds: shown, intent: "parecida" });
  check(
    "refinamento 'parecida' escolhe o próximo da ordem de relevância (sem repetir)",
    !shown.has(refinoParecida.shownItemIds[0]) && refinoParecida.parts.length > 0
  );

  // pool vazio: já mostramos todos os candidatos possíveis
  const todosMostrados = new Set(candidates.map((c) => c.offer.itemId));
  const semMaisOpcoes = await buildRefinementReply({ candidates, excludeItemIds: todosMostrados, intent: "barata" });
  check(
    "sem mais candidatos pra mostrar, buildRefinementReply devolve vazio (orchestrator usa TEXTO_SEM_MAIS_OPCOES)",
    semMaisOpcoes.parts.length === 0 && semMaisOpcoes.shownItemIds.length === 0
  );

  if (failed) {
    console.error("\nAlgum caso falhou.");
    process.exit(1);
  } else {
    console.log("\nTodos os casos passaram.");
  }
}

main();
