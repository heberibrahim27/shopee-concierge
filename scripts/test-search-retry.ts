/**
 * Teste standalone (sem rede) pra shouldRetryWithSuggestedTerm —
 * sugestão do debate técnico com o ChatGPT (13/09/2026): escalar pro
 * perito com a MESMA shortlist ruim nem sempre resolve; quando ele sugere
 * um termo de busca melhor, vale reabrir a busca UMA vez antes de
 * desistir.
 *
 * Roda com: npx tsx scripts/test-search-retry.ts
 */
import { shouldRetryWithSuggestedTerm } from "../src/lib/concierge/orchestrator";
import { RankedCandidate } from "../src/lib/concierge/rank";
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
    ratingStar: "4.5",
    priceDiscountRate: 0,
    imageUrl: "https://example.com/img.jpg",
    shopId: "1",
    shopName: "loja",
    shopType: 1,
    productLink: "https://shopee.com.br/produto",
    offerLink: "https://shopee.com.br/oferta",
  };
}

const umCandidato: RankedCandidate[] = [{ offer: offer("x"), matchType: "alternativa_funcional", score: 10 }];

let failed = false;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "OK  " : "FAIL"} ${desc}`);
  if (!ok) failed = true;
}

check(
  "candidatos vazios + perito sugere termo novo -> reabre busca",
  shouldRetryWithSuggestedTerm({
    candidatesAfterVerdict: [],
    verdict: { needsUserClarification: false, suggestedSearchTerm: "bermuda tactel masculina" },
    alreadyRetried: false,
  }) === "bermuda tactel masculina"
);

check(
  "candidatos vazios mas perito NÃO sugeriu termo -> não reabre",
  shouldRetryWithSuggestedTerm({
    candidatesAfterVerdict: [],
    verdict: { needsUserClarification: false, suggestedSearchTerm: undefined },
    alreadyRetried: false,
  }) === null
);

check(
  "ainda sobrou candidato -> não reabre (não tinha motivo)",
  shouldRetryWithSuggestedTerm({
    candidatesAfterVerdict: umCandidato,
    verdict: { needsUserClarification: false, suggestedSearchTerm: "outro termo" },
    alreadyRetried: false,
  }) === null
);

check(
  "precisa de esclarecimento do cliente -> não reabre (fluxo próprio, não é 'busca errada')",
  shouldRetryWithSuggestedTerm({
    candidatesAfterVerdict: [],
    verdict: { needsUserClarification: true, suggestedSearchTerm: "outro termo" },
    alreadyRetried: false,
  }) === null
);

check(
  "já tentou reabrir uma vez -> nunca encadeia um segundo retry",
  shouldRetryWithSuggestedTerm({
    candidatesAfterVerdict: [],
    verdict: { needsUserClarification: false, suggestedSearchTerm: "outro termo" },
    alreadyRetried: true,
  }) === null
);

if (failed) {
  console.error("\nAlgum caso falhou.");
  process.exit(1);
} else {
  console.log("\nTodos os casos passaram.");
}
