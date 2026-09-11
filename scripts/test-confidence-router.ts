/**
 * Teste manual do roteador de confiança — não chama nenhuma API (nem
 * OpenAI, nem Shopee), só monta cenários fixos e confere se
 * decideEscalation() escala ou não como esperado.
 *
 * Uso: npm run test:router
 */
import { decideEscalation } from "../src/lib/concierge/confidenceRouter";
import { ImageObservation } from "../src/lib/concierge/recognize";
import { RankedCandidate } from "../src/lib/concierge/rank";
import { ShopeeProductOffer } from "../src/lib/shopee/types";

function fakeOffer(itemId: string, overrides: Partial<ShopeeProductOffer> = {}): ShopeeProductOffer {
  return {
    itemId,
    productName: `Produto ${itemId}`,
    priceMin: "100",
    priceMax: "100",
    commissionRate: "0.1",
    commission: "10",
    sales: 50,
    ratingStar: "4.8",
    priceDiscountRate: 0,
    imageUrl: "https://example.com/img.jpg",
    shopId: "1",
    shopName: "Loja",
    shopType: 1,
    productLink: "https://shopee.com.br/produto",
    offerLink: "https://s.shopee.com.br/abc",
    ...overrides,
  };
}

function fakeObservation(overrides: Partial<ImageObservation> = {}): ImageObservation {
  return {
    observado: "tênis preto com logo branco",
    hipotese: "tênis esportivo",
    naoIdentificado: [],
    termosDeBusca: ["tenis esportivo preto"],
    ...overrides,
  };
}

interface Case {
  nome: string;
  observation: ImageObservation;
  ranked: RankedCandidate[];
  esperaEscalar: boolean;
}

const casos: Case[] = [
  {
    nome: "confiança geral baixa -> escala",
    observation: fakeObservation({ confiancaGeral: 0.4 }),
    ranked: [{ offer: fakeOffer("1"), matchType: "alternativa_funcional", score: 50 }],
    esperaEscalar: true,
  },
  {
    nome: "sem candidato nenhum -> escala",
    observation: fakeObservation({ confiancaGeral: 0.9 }),
    ranked: [],
    esperaEscalar: true,
  },
  {
    nome: "melhor candidato só 'semelhante_visual' -> escala",
    observation: fakeObservation({ confiancaGeral: 0.9 }),
    ranked: [{ offer: fakeOffer("1"), matchType: "semelhante_visual", score: 50 }],
    esperaEscalar: true,
  },
  {
    nome: "candidatos muito próximos em score -> escala",
    observation: fakeObservation({ confiancaGeral: 0.9 }),
    ranked: [
      { offer: fakeOffer("1"), matchType: "alternativa_funcional", score: 50 },
      { offer: fakeOffer("2"), matchType: "alternativa_funcional", score: 48 },
    ],
    esperaEscalar: true,
  },
  {
    nome: "confiança alta + candidato claro -> NÃO escala",
    observation: fakeObservation({ confiancaGeral: 0.92 }),
    ranked: [
      { offer: fakeOffer("1"), matchType: "modelo_identificado", score: 80 },
      { offer: fakeOffer("2"), matchType: "alternativa_funcional", score: 40 },
    ],
    esperaEscalar: false,
  },
  {
    nome: "confiança intermediária + candidato claro -> NÃO escala",
    observation: fakeObservation({ confiancaGeral: 0.75 }),
    ranked: [
      { offer: fakeOffer("1"), matchType: "alternativa_funcional", score: 60 },
      { offer: fakeOffer("2"), matchType: "semelhante_visual", score: 20 },
    ],
    esperaEscalar: false,
  },
];

let falhas = 0;
for (const caso of casos) {
  const decisao = decideEscalation(caso.observation, caso.ranked);
  const ok = decisao.escalate === caso.esperaEscalar;
  if (!ok) falhas++;
  console.log(
    `${ok ? "OK " : "FALHOU "} ${caso.nome} -> escalate=${decisao.escalate} (motivo: ${decisao.motivo})`
  );
}

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam.`);
  process.exit(1);
} else {
  console.log("\nTodos os casos passaram.");
}
