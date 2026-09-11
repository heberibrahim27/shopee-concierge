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

if (failed) {
  console.error("\nAlgum caso falhou.");
  process.exit(1);
} else {
  console.log("\nTodos os casos passaram.");
}
