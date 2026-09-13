/**
 * Teste standalone (sem API real) pra resolveEscalatedCandidates em
 * orchestrator.ts — o que o orquestrador faz com os candidatos depois de
 * consultar o perito (expertVision.ts), pro caso do bug real de
 * recorrência (13/09/2026): bermuda jeans rasgada continuou aparecendo como
 * "menor preço" mesmo depois de escalar pro modelo avançado, porque quando
 * o perito ficava em dúvida (status "uncertain" sem pergunta), o código
 * antigo simplesmente MANTINHA os candidatos não verificados de antes.
 *
 * Regra corrigida: se escalamos SÓ por falta de sinal visual
 * (semSinalVisual — o matchType dos candidatos veio inteiro do fallback
 * textual, nunca comparado de verdade com a foto) e o perito não confirma
 * nada, não sobrou nenhum sinal confiável — esvazia a lista (cai no "ainda
 * não encontrei"). Se escalamos por outro motivo (confiança/score, com
 * comparação visual real por trás), mantém o melhor esforço de antes.
 *
 * Roda com: npx tsx scripts/test-escalation-outcome.ts
 */
import { resolveEscalatedCandidates } from "../src/lib/concierge/orchestrator";
import { RankedCandidate } from "../src/lib/concierge/rank";
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

const candidatoErrado: RankedCandidate = {
  offer: offer({ itemId: "bermuda-jeans-errada", productName: "Bermuda branca rascada" }),
  matchType: "alternativa_funcional",
  score: 60,
};
const candidatoCerto: RankedCandidate = {
  offer: offer({ itemId: "bermuda-certa", productName: "Bermuda Tactel Academia" }),
  matchType: "modelo_identificado",
  score: 90,
};

let failed = false;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "OK  " : "FAIL"} ${desc}`);
  if (!ok) failed = true;
}

// Caso 1 (o bug real): escalado só por falta de sinal visual, perito fica em
// dúvida sem confirmar nada e sem pedir esclarecimento -> esvazia a lista
const r1 = resolveEscalatedCandidates({
  candidates: [candidatoErrado],
  verdict: { status: "uncertain", bestCandidateIds: [], needsUserClarification: false },
  semSinalVisual: true,
});
check("sem sinal visual + perito não confirma nada -> lista fica vazia (não mostra produto errado)", r1.length === 0);

// Caso 2: escalado por confiança/score (COM sinal visual real por trás),
// perito fica em dúvida -> mantém o ranking econômico (melhor esforço)
const r2 = resolveEscalatedCandidates({
  candidates: [candidatoErrado],
  verdict: { status: "uncertain", bestCandidateIds: [], needsUserClarification: false },
  semSinalVisual: false,
});
check(
  "COM sinal visual + perito em dúvida -> mantém o ranking econômico (melhor esforço)",
  r2.length === 1 && r2[0].offer.itemId === "bermuda-jeans-errada"
);

// Caso 3: perito confirma um candidato específico -> usa o veredito dele,
// mesmo com semSinalVisual true (a confirmação explícita do perito sempre vale)
const r3 = resolveEscalatedCandidates({
  candidates: [candidatoErrado, candidatoCerto],
  verdict: { status: "match", bestCandidateIds: ["bermuda-certa"], needsUserClarification: false },
  semSinalVisual: true,
});
check(
  "perito confirma um candidato -> usa só ele, mesmo sem sinal visual da 1ª passada",
  r3.length === 1 && r3[0].offer.itemId === "bermuda-certa"
);

if (failed) {
  console.error("\nAlgum caso falhou.");
  process.exit(1);
} else {
  console.log("\nTodos os casos passaram.");
}
