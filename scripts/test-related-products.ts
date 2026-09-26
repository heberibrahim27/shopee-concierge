/**
 * Testa pickRelated (src/lib/site/related.ts) com casos sintéticos --
 * função pura, sem banco. Achado real (Heber, 2026-09-25, print de um
 * repetidor Wi-Fi de R$89,90 mostrando monitor de R$10 mil como "Veja
 * também"): o fallback antigo, sem achar produto de preço parecido,
 * preenchia com QUALQUER candidato da categoria. Corrigido com faixa de
 * preço progressiva (2x -> 3x -> 6x) que nunca abandona o filtro de
 * preço -- na faixa mais larga ainda só entra quem tá dentro dela, mesmo
 * que sobre menos que o limite.
 *
 * Roda com: npx tsx scripts/test-related-products.ts
 */
import { pickRelated } from "../src/lib/site/related";
import type { SiteProduct } from "../src/lib/site/catalog";

let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}`, detail ?? "");
  }
}

function product(overrides: Partial<SiteProduct>): SiteProduct {
  return {
    id: overrides.id ?? "id",
    slug: overrides.slug ?? overrides.id ?? "slug",
    productName: overrides.productName ?? "Produto",
    categorySlug: "eletronicos",
    platform: "shopee",
    groupId: null,
    highlightReason: null,
    description: null,
    imageUrl: "https://x/img.jpg",
    priceMin: overrides.priceMin ?? 100,
    priceMax: null,
    priceDiscountRate: null,
    ratingStar: null,
    sales: null,
    offerLink: "https://x",
    updatedAt: new Date().toISOString(),
    priceCheckedAt: null,
    otherOffers: undefined,
    ...overrides,
  };
}

// Caso real (achado ao vivo, 2026-09-25): repetidor R$89,90, pool de
// RECÊNCIA (120 mais recentes de "eletronicos") 100% eletrônico caro
// (R$5k-14k) -- nada perto do preço nem na faixa mais larga (6x). Sem
// pool barato: cai pro mais barato QUE SOBROU no próprio pool recente
// (ainda caro, mas nunca "mais próximo" -- era o bug antigo).
{
  const target = product({ id: "target", priceMin: 89.9 });
  const pool = [
    product({ id: "a", priceMin: 10099.99 }),
    product({ id: "b", priceMin: 10199.99, ratingStar: 4.5 }),
    product({ id: "c", priceMin: 10199.99 }),
    product({ id: "d", priceMin: 10399.99 }),
    product({ id: "e", priceMin: 5859.9, ratingStar: 3 }), // nota ruim -- fica de fora
    product({ id: "f", priceMin: 6165.9 }),
  ];
  const result = pickRelated([target, ...pool], target);
  check(
    "sem pool barato -> cai pro mais barato do que sobrou (nunca 'mais próximo')",
    result.length === 5 && result[0].id === "f" && !result.some((p) => p.id === "e"),
    result.map((p) => p.id)
  );
}

// Mesmo caso, mas com o SEGUNDO pool (query separada por preço
// ascendente, ver getRelatedProducts) disponível -- achado ao vivo real
// (2026-09-25): a categoria inteira tinha item a partir de R$4,24, mas
// os 120 mais recentes não tinham nada abaixo de R$5.859. É esse pool
// que garante "bom e barato" de verdade, não o de recência.
{
  const target = product({ id: "target", priceMin: 89.9 });
  const expensivePool = [
    product({ id: "a", priceMin: 10099.99 }),
    product({ id: "b", priceMin: 10199.99 }),
  ];
  const cheapPool = [
    product({ id: "barato1", priceMin: 4.24 }),
    product({ id: "barato2", priceMin: 12.9, ratingStar: 2 }), // nota ruim -- fica de fora
    product({ id: "barato3", priceMin: 19.9 }),
    product({ id: "barato4", priceMin: 29.9 }),
    product({ id: "barato5", priceMin: 39.9 }),
    product({ id: "barato6", priceMin: 49.9 }),
    product({ id: "barato7", priceMin: 59.9 }),
  ];
  const result = pickRelated([target, ...expensivePool], target, 6, cheapPool);
  check(
    "com pool barato disponível -> usa ele, nunca o eletrônico caro",
    result.length === 6 &&
      !result.some((p) => p.id === "a" || p.id === "b" || p.id === "barato2") &&
      result[0].id === "barato1",
    result.map((p) => p.id)
  );
}

// Caso normal: pool tem gente de preço parecido de verdade -- comportamento antigo continua igual.
{
  const target = product({ id: "target", priceMin: 100 });
  const pool = [
    product({ id: "a", priceMin: 90 }),
    product({ id: "b", priceMin: 110 }),
    product({ id: "c", priceMin: 150 }),
    product({ id: "d", priceMin: 80 }),
    product({ id: "e", priceMin: 120 }),
    product({ id: "f", priceMin: 95 }),
    product({ id: "g", priceMin: 5000 }), // fora de qualquer faixa, não deve aparecer
  ];
  const result = pickRelated([target, ...pool], target);
  check("preço parecido disponível -> 6 resultados, nenhum fora de faixa", result.length === 6 && result.every((p) => p.priceMin! <= 200));
}

// Caso intermediário: só acha o suficiente alargando pra 3x, não em 2x.
{
  const target = product({ id: "target", priceMin: 100 });
  const pool = [
    product({ id: "a", priceMin: 90 }), // dentro de 2x
    product({ id: "b", priceMin: 250 }), // só dentro de 3x
    product({ id: "c", priceMin: 280 }),
    product({ id: "d", priceMin: 290 }),
    product({ id: "e", priceMin: 270 }),
    product({ id: "f", priceMin: 260 }),
    product({ id: "g", priceMin: 9000 }), // fora até de 6x
  ];
  const result = pickRelated([target, ...pool], target);
  check(
    "alarga pra 3x quando 2x não tem 6 -> pega os 6 dentro de 3x, exclui o de 9000",
    result.length === 6 && !result.some((p) => p.id === "g"),
    result.map((p) => p.priceMin)
  );
}

// Exclui o próprio produto e irmãos do mesmo group_id.
{
  const target = product({ id: "target", priceMin: 100, groupId: "g1" });
  const pool = [
    product({ id: "sibling", priceMin: 100, groupId: "g1" }),
    product({ id: "self-dup", priceMin: 100, slug: "target" }), // mesmo slug do target
    product({ id: "ok", priceMin: 100 }),
  ];
  const result = pickRelated([target, ...pool], target);
  check(
    "exclui o próprio produto (por id/slug) e irmãos de group_id",
    result.length === 1 && result[0].id === "ok",
    result.map((p) => p.id)
  );
}

console.log(failed === 0 ? "\nALL OK" : `\n${failed} FALHA(S)`);
process.exit(failed === 0 ? 0 : 1);
