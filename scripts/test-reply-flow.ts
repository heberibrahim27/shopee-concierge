/**
 * Teste standalone (sem API real) pras mudanças de conversa/comportamento
 * pedidas pelo Ibrahim em 13/09/2026:
 *  - detectClearPick só dispara quando o destaque é de verdade (confirmado,
 *    nota alta, muita venda, vantagem clara de score sobre o 2º).
 *  - buildReplyMessage lidera com "essa é a que eu escolheria" nesse caso,
 *    e cai no fluxo de 3 critérios (menor preço/melhor avaliada/mais
 *    vendida) quando não há destaque claro.
 *  - sem candidato nenhum, cai na mensagem de "não encontrei" nova.
 *
 * generateAffiliateShortLink tenta a API real da Shopee e falha neste
 * sandbox (sem rede/credencial) — o próprio reply.ts já trata isso caindo
 * pro offerLink, então isso não quebra o teste (só testamos a ESTRUTURA
 * da resposta, não o conteúdo do link).
 *
 * Roda com: npx tsx scripts/test-reply-flow.ts
 */
import { rankCandidates, detectClearPick } from "../src/lib/concierge/rank";
import { buildReplyMessage } from "../src/lib/concierge/reply";
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
  observado: "tenis de corrida azul",
  hipotese: "tenis esportivo",
  naoIdentificado: [],
  termosDeBusca: ["tenis corrida"],
};

let failed = false;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "OK  " : "FAIL"} ${desc}`);
  if (!ok) failed = true;
}

async function main() {
  // Cenário 1: destaque claro (nota alta, muita venda, vantagem de score) —
  // sem comparação visual (map vazio força fallback textual em rank.ts, que
  // classifica como "alternativa_funcional" quando bate o termo específico;
  // usamos productName batendo o termo pra isso funcionar)
  const clearWinner = offer({
    itemId: "top-1",
    productName: "Tenis Corrida Confortavel Premium",
    priceMin: "150",
    sales: 5000,
    ratingStar: "4.9",
  });
  const distant = offer({
    itemId: "distante-1",
    productName: "Tenis Corrida Simples",
    priceMin: "180",
    sales: 20,
    ratingStar: "4.2",
  });

  // detectClearPick exige matchType "modelo_identificado", que só vem de
  // comparação visual real (ou do veredito do perito) — nunca do fallback
  // textual (que só produz "alternativa_funcional"/"nao_relacionado"), por
  // isso simulamos aqui o resultado que compare.ts teria dado.
  const visualComparisons = new Map([
    ["top-1", { matchType: "modelo_identificado" as const }],
    ["distante-1", { matchType: "alternativa_funcional" as const }],
  ]);
  const rankedClear = rankCandidates([clearWinner, distant], observation, visualComparisons);
  const clearPick = detectClearPick(rankedClear);
  check("destaque claro é detectado quando a vantagem é grande", clearPick?.offer.itemId === "top-1");

  const replyClear = await buildReplyMessage({ candidates: rankedClear, chatId: "5511999999999" });
  const clearTexts = replyClear.filter((p) => p.type === "text").map((p) => (p as { text: string }).text);
  check(
    "resposta com destaque claro lidera com 'essa é a que eu escolheria'",
    clearTexts.some((t) => t.includes("Essa é a que eu escolheria"))
  );
  check(
    "resposta com destaque claro tem uma imagem RECOMENDADA",
    replyClear.some((p) => p.type === "image" && (p as { caption: string }).caption.includes("RECOMENDADA"))
  );
  check("resposta com destaque claro termina com o fechamento padrão", clearTexts.some((t) => t.includes("uma mais barata")));

  // Cenário 2: dois candidatos próximos em score — sem destaque claro, cai
  // no fluxo de 3 critérios (comportamento anterior)
  const parecido1 = offer({ itemId: "p1", productName: "Tenis Corrida Basico A", priceMin: "100", sales: 200, ratingStar: "4.6" });
  const parecido2 = offer({ itemId: "p2", productName: "Tenis Corrida Basico B", priceMin: "105", sales: 210, ratingStar: "4.6" });

  const rankedNormal = rankCandidates([parecido1, parecido2], observation, new Map());
  check("sem destaque claro quando os candidatos estão próximos", detectClearPick(rankedNormal) === null);

  const replyNormal = await buildReplyMessage({ candidates: rankedNormal, chatId: "5511999999999" });
  const normalTexts = replyNormal.filter((p) => p.type === "text").map((p) => (p as { text: string }).text);
  check("resposta sem destaque usa a intro padrão de 3 critérios", normalTexts.some((t) => t.includes("Separei as que mais valem a pena")));
  check(
    "resposta sem destaque usa os rótulos em maiúsculo",
    replyNormal.some((p) => p.type === "image" && (p as { caption: string }).caption.includes("MENOR PREÇO"))
  );

  // Cenário 3: nenhum candidato — mensagem de "não encontrei" nova
  const replyEmpty = await buildReplyMessage({ candidates: [], chatId: "5511999999999" });
  check(
    "sem candidato nenhum usa a nova mensagem de 'ainda não encontrei'",
    replyEmpty.length === 1 && replyEmpty[0].type === "text" && (replyEmpty[0] as { text: string }).text.includes("Ainda não encontrei")
  );

  if (failed) {
    console.error("\nAlgum caso falhou.");
    process.exit(1);
  } else {
    console.log("\nTodos os casos passaram.");
  }
}

main();
