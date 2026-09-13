/**
 * Teste standalone (sem API real) pro bug real de 11/09/2026: foto de uma
 * lata de cera de carnaúba, cuja embalagem tem escrito "ACABAMENTOS" — esse
 * termo genérico virou keyword de busca, e produtos de categoria totalmente
 * diferente (torneira, moldura de teto) que também têm "acabamento" no nome
 * entraram no ranking e venceram nas categorias nota/venda, sem a
 * comparação visual rodar (map vazio, como quando falta OPENAI_API_KEY).
 *
 * Roda com: npx tsx scripts/test-rank.ts
 */
import { rankCandidates, pickHighlightedCandidates } from "../src/lib/concierge/rank";
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
  observado: "lata de cera de carnaúba para texturas/acabamentos",
  hipotese: "cera de carnaúba para acabamento de parede",
  naoIdentificado: [],
  termosDeBusca: ["cera de carnaúba", "cera para textura", "acabamento"],
};

const candidates: ShopeeProductOffer[] = [
  offer({
    itemId: "cera-1",
    productName: "Cera de Carnaúba T1 (Grau Cosméticos)",
    priceMin: "16.65",
    sales: 40,
    ratingStar: "5",
  }),
  offer({
    itemId: "torneira-1",
    productName: "Kit Acabamento Registro C 36 Metal Padrão Deca 1/2 3/4 Acabamento Cromado",
    priceMin: "19.98",
    sales: 5000,
    ratingStar: "5",
  }),
  offer({
    itemId: "moldura-1",
    productName: "moldura com acabamento roda teto com acabamento - isopor",
    priceMin: "99.9",
    sales: 20000,
    ratingStar: "4.8",
  }),
];

// sem comparação visual (map vazio) — reproduz o cenário real do bug
const ranked = rankCandidates(candidates, observation, new Map());
const highlights = pickHighlightedCandidates(ranked);

let failed = false;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "OK  " : "FAIL"} ${desc}`);
  if (!ok) failed = true;
}

check(
  "torneira e moldura são descartadas (nao_relacionado, só batem termo genérico)",
  !ranked.some((r) => r.offer.itemId === "torneira-1" || r.offer.itemId === "moldura-1")
);

check("sobra só a cera de carnaúba no ranking", ranked.length === 1 && ranked[0].offer.itemId === "cera-1");

check(
  "todas as categorias escolhidas apontam pra cera de carnaúba (não pra torneira/moldura)",
  highlights.every((h) => h.candidate.offer.itemId === "cera-1")
);

check("pelo menos 1 destaque foi gerado", highlights.length >= 1);

// --- Bug real de 13/09/2026: comparação visual PARCIAL ---------------------
// Foto de uma bermuda de academia tactel branca. A comparação visual rodou e
// confirmou a bermuda certa, mas um vaso de planta e um livro religioso
// ficaram de fora da resposta do modelo (imagem que falhou ao carregar,
// resposta truncada etc.) — mesmo assim entraram no ranking final, porque o
// código tratava "sem entrada no mapa" igual a "comparação nunca rodou" e
// caía no fallback textual, que bateu um termo genérico ("branca") no nome
// dos dois. Corrigido em rank.ts (hasAnyVisualSignal): quando o mapa tem
// PELO MENOS 1 resultado real, quem fica de fora é descartado direto, nunca
// mais recebe o benefício da dúvida do fallback textual.
const observationBermuda: ImageObservation = {
  observado: "bermuda de academia tactel branca",
  hipotese: "bermuda esportiva",
  naoIdentificado: [],
  termosDeBusca: ["branca"], // termo bem genérico de propósito, pra provar que o discard não depende dele
};

const candidatesBermuda: ShopeeProductOffer[] = [
  offer({ itemId: "bermuda-certa", productName: "Bermuda Tactel Academia Masculina Branca", sales: 500, ratingStar: "4.7" }),
  offer({ itemId: "vaso-planta", productName: "Vaso Decorativo Branca Para Plantas Suculentas", sales: 8000, ratingStar: "4.9" }),
  offer({ itemId: "livro-religioso", productName: "Bíblia Sagrada Capa Branca Letra Grande", sales: 12000, ratingStar: "5" }),
];

// só a bermuda tem veredito do modelo de visão — os outros dois "sumiram"
// da resposta (cenário real: imagem não carregou / resposta incompleta)
const visualParcial = new Map([["bermuda-certa", { matchType: "modelo_identificado" as const }]]);

const rankedParcial = rankCandidates(candidatesBermuda, observationBermuda, visualParcial);

check(
  "com comparação visual parcial, item sem veredito é descartado (não usa fallback textual)",
  !rankedParcial.some((r) => r.offer.itemId === "vaso-planta" || r.offer.itemId === "livro-religioso")
);
check(
  "com comparação visual parcial, a bermuda confirmada permanece",
  rankedParcial.length === 1 && rankedParcial[0].offer.itemId === "bermuda-certa"
);

// --- Bug real de 13/09/2026: recorrência com comparação visual TOTALMENTE
// ausente (mapa vazio) ---------------------------------------------------
// A mesma foto de bermuda de academia tactel branca, mas dessa vez a
// comparação visual falhou por completo (erro de API etc., mapa vazio) —
// caiu no fallback textual, que usa o termo de busca MAIS específico
// (termosDeBusca[0]). "bermuda branca" (categoria + cor, só 2 palavras)
// bate literalmente no nome de uma bermuda JEANS RASGADA completamente
// diferente, porque nome.includes() só olha substring, não estilo — foi
// exatamente isso que apareceu como "menor preço" pro Ibrahim. rank.ts
// sozinho não consegue distinguir "termo específico" de "termo genérico
// que só parece específico" (um termo de 2 palavras pode ser tão válido
// quanto esse foi inválido, ver caso "tenis corrida" em test-reply-flow.ts)
// — por isso o candidato AINDA passa pelo fallback textual aqui...
const observationBermuda2Palavras: ImageObservation = {
  observado: "bermuda de academia tactel branca",
  hipotese: "bermuda esportiva",
  naoIdentificado: [],
  termosDeBusca: ["bermuda branca", "bermuda tactel branca academia"],
};

const candidatesBermuda2: ShopeeProductOffer[] = [
  offer({
    itemId: "bermuda-jeans-errada",
    productName: "Bermuda branca rascada e preto rascada Especial, gigante 50-56 Qualidade",
    sales: 217,
    ratingStar: "4.7",
  }),
];

// mapa vazio: comparação visual falhou por completo (cenário real do bug)
const rankedSemVisual = rankCandidates(candidatesBermuda2, observationBermuda2Palavras, new Map());

check(
  "sem sinal visual, o fallback textual ainda pode 'confirmar' um candidato errado (esperado)",
  rankedSemVisual.length === 1 && rankedSemVisual[0].offer.itemId === "bermuda-jeans-errada"
);
// ...a defesa de verdade pra esse caso é escalar pro modelo avançado antes
// de confiar nesse resultado — ver scripts/test-confidence-router.ts
// ("sem sinal visual... -> escala") e scripts/test-escalation-outcome.ts
// (o que o orquestrador faz com o veredito do perito nesse cenário).

// --- Correção adicional de 13/09/2026 (debate técnico com o ChatGPT):
// quando a foto TEM material/uso estruturado extraído (materialProvavel/
// usoOuEstilo, ver recognize.ts), o mesmo cenário acima já é bloqueado
// AQUI mesmo, no fallback textual — sem precisar esperar a escalada pro
// perito. "tactel" (grupo esportivo) e "rascada"/jeans (categoria/estilo
// bem diferente) não compartilham grupo de material conhecido... o nome
// do produto não tem a palavra "jeans" escrita, mas tem "rascada", que não
// está em nenhum grupo — nesse caso o bloqueio por MATERIAL não pega (os
// dois lados precisam bater um grupo conhecido pra contar como conflito).
// Por isso o teste abaixo usa um produto que bate um grupo conhecido
// (jeans) de propósito, pra provar que o bloqueio funciona quando a
// informação estrutural existe dos dois lados — a defesa por escalada
// continua sendo a rede de segurança pros casos (como o de cima) em que
// não dá pra inferir isso com confiança.
const candidatesBermudaJeansExplicita: ShopeeProductOffer[] = [
  offer({
    itemId: "bermuda-jeans-explicita",
    productName: "Bermuda Jeans Branca Masculina Rasgada Slim",
    sales: 217,
    ratingStar: "4.7",
  }),
];

const rankedComMaterial = rankCandidates(
  candidatesBermudaJeansExplicita,
  { ...observationBermuda2Palavras, materialProvavel: "tactel" },
  new Map()
);

check(
  "com materialProvavel extraído da foto, bermuda jeans é bloqueada mesmo batendo o termo genérico",
  rankedComMaterial.length === 0
);

// mesma ideia pro eixo de uso/estilo (ex: uma sandália de praia pra uma
// busca de "sapato social preto" batendo só a cor)
const rankedComUso = rankCandidates(
  [offer({ itemId: "chinelo-praia", productName: "Chinelo de Praia Preto Havaianas Slim", sales: 900, ratingStar: "4.8" })],
  {
    observado: "sapato social preto de couro",
    hipotese: "sapato social",
    naoIdentificado: [],
    termosDeBusca: ["preto"],
    usoOuEstilo: "social",
  },
  new Map()
);

check(
  "com usoOuEstilo extraído da foto, chinelo de praia é bloqueado mesmo batendo só a cor",
  rankedComUso.length === 0
);

// Fan-out visual: entre produtos da mesma classe, a nota contínua de
// similaridade precisa ordenar pela proximidade da imagem antes dos sinais
// comerciais, como numa busca visual.
const visualComSimilaridade = new Map([
  ["visual-distante", { matchType: "alternativa_funcional" as const, similarity: 0.2 }],
  ["visual-proximo", { matchType: "alternativa_funcional" as const, similarity: 0.9 }],
]);
const rankedPorSimilaridade = rankCandidates(
  [
    offer({ itemId: "visual-distante", productName: "Bermuda branca distante" }),
    offer({ itemId: "visual-proximo", productName: "Bermuda branca próxima" }),
  ],
  observationBermuda,
  visualComSimilaridade
);
check(
  "similaridade visual contínua ordena candidatos equivalentes",
  rankedPorSimilaridade[0]?.offer.itemId === "visual-proximo"
);

const runtimeNumericId = 998877 as unknown as string;
const rankedComIdNumerico = rankCandidates(
  [offer({ itemId: runtimeNumericId, productName: "Bermuda branca 2 em 1" })],
  observationBermuda,
  new Map([["998877", { matchType: "modelo_identificado" as const, similarity: 0.95 }]])
);
check(
  "comparação visual textual casa com itemId numérico recebido da Shopee",
  String(rankedComIdNumerico[0]?.offer.itemId) === "998877"
);

if (failed) {
  console.error("\nAlgum caso falhou.");
  process.exit(1);
} else {
  console.log("\nTodos os casos passaram.");
}
