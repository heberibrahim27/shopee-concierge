/**
 * Regressão do bug em que o roteador marcava "expert", mas o Astra não era
 * chamado: rankCandidates descartava todos os itens como nao_relacionado e
 * consultExpertVision recebia [], acionando seu retorno antecipado.
 *
 * Roda com: npm run test:expert-fallback
 */
import assert from "node:assert/strict";
import {
  consultExpertWithFallback,
  resolveEscalatedCandidates,
  selectExpertCandidates,
} from "../src/lib/concierge/orchestrator";
import { RankedCandidate } from "../src/lib/concierge/rank";
import { ImageObservation } from "../src/lib/concierge/recognize";
import { ShopeeProductOffer } from "../src/lib/shopee/types";

function offer(itemId: string): ShopeeProductOffer {
  return {
    itemId,
    productName: `Produto ${itemId}`,
    priceMin: "10",
    priceMax: "10",
    commissionRate: "0.1",
    commission: "1",
    sales: 100,
    ratingStar: "4.8",
    priceDiscountRate: 0,
    imageUrl: `https://example.com/${itemId}.jpg`,
    shopId: "1",
    shopName: "Loja",
    shopType: 1,
    productLink: `https://shopee.com.br/${itemId}`,
    offerLink: `https://s.shopee.com.br/${itemId}`,
  };
}

async function main() {
  const preVisualShortlist = [offer("bermuda-certa"), offer("bermuda-errada")];
  const expertInput = selectExpertCandidates({ candidates: [], preVisualShortlist });

  assert.deepEqual(
    expertInput.map((candidate) => candidate.offer.itemId),
    ["bermuda-certa", "bermuda-errada"],
    "candidates vazio deve cair para o shortlist anterior ao filtro visual"
  );
  assert.ok(expertInput.every((candidate) => candidate.score === 0));

  const ranked: RankedCandidate[] = [
    { offer: offer("ja-confirmado"), matchType: "modelo_identificado", score: 80 },
  ];
  assert.equal(
    selectExpertCandidates({ candidates: ranked, preVisualShortlist })[0],
    ranked[0],
    "ranking pós-filtro não vazio continua sendo a entrada preferida"
  );
  assert.deepEqual(selectExpertCandidates({ candidates: [], preVisualShortlist: [] }), []);

  const observation: ImageObservation = {
    observado: "bermuda esportiva",
    hipotese: "bermuda de academia",
    naoIdentificado: [],
    termosDeBusca: ["bermuda academia"],
  };
  let receivedByExpert: RankedCandidate[] | undefined;
  const expertCall = await consultExpertWithFallback(
    {
      photoUrl: "https://example.com/foto-cliente.jpg",
      observation,
      candidates: [],
      preVisualShortlist,
    },
    async (params) => {
      receivedByExpert = params.candidates;
      return {
        status: "match",
        bestCandidateIds: ["bermuda-certa"],
        confidence: 0.91,
        needsUserClarification: false,
      };
    }
  );
  assert.deepEqual(
    receivedByExpert?.map((candidate) => candidate.offer.itemId),
    ["bermuda-certa", "bermuda-errada"],
    "a função consultora deve receber candidatos reais, não []"
  );
  assert.equal(expertCall.usedPreVisualShortlist, true);

  const confirmadoPeloPerito = resolveEscalatedCandidates({
    candidates: expertInput,
    verdict: expertCall.verdict,
    semSinalVisual: false,
  });
  assert.deepEqual(confirmadoPeloPerito.map((candidate) => candidate.offer.itemId), ["bermuda-certa"]);
  assert.equal(confirmadoPeloPerito[0].matchType, "modelo_identificado");

  const incertoMantemPosFiltroVazio = resolveEscalatedCandidates({
    candidates: [],
    verdict: {
      status: "uncertain",
      bestCandidateIds: [],
      needsUserClarification: false,
    },
    semSinalVisual: false,
  });
  assert.deepEqual(incertoMantemPosFiltroVazio, []);

  console.log("OK: shortlist pré-visual chega ao perito e só volta com confirmação explícita.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
