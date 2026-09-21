/**
 * Acha o mesmo produto físico na Shopee a partir de um produto da Awin
 * (hoje só usado pra Kabum, pedido do Heber 2026-09-21: "quero no site
 * os produtos da Kabum comparando preços com o MESMO produto na
 * Shopee").
 *
 * Não existe código de barras em comum entre as duas fontes — a Shopee
 * não expõe GTIN/EAN em nenhum campo do productOfferV2 (confirmado por
 * introspecção do schema GraphQL ao vivo, 2026-09-21: nenhum dos 24
 * campos disponíveis é código de barras).
 *
 * MPN sozinho NÃO basta: testado ao vivo, MPN puramente numérico e
 * curto (ex: "75682", "19118") colide por acaso com SKU interno de
 * produtos completamente diferentes na Shopee (achou "Pijama Lupo" e
 * peça de carro casando com acessório de PC só pelo número). Por isso
 * exige DOIS sinais juntos — MPN E marca aparecendo no título da
 * Shopee — mais um teto de razão de preço (produto genuinamente igual
 * não deveria ter preço 2,5x+ diferente; isso também pegou um caso real
 * de kit/bundle diferente que passava nos dois sinais de texto).
 */
import { searchProductsByKeyword } from "../shopee/queries";
import { ShopeeSortType } from "../shopee/types";
import type { ShopeeProductOffer } from "../shopee/types";

const MAX_PRICE_RATIO = 2.5;

function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function findShopeeMatchByMpn(params: {
  mpn: string;
  brand: string | null;
  referencePrice: number;
}): Promise<ShopeeProductOffer | null> {
  const mpn = params.mpn.trim();
  const brand = params.brand?.trim() ?? "";
  // Sem marca com tamanho razoável, não tem segundo sinal pra confirmar
  // — não arrisca linkar produto errado só pelo MPN.
  if (mpn.length < 4 || brand.length < 3) return null;

  const normalizedMpn = normalizeCode(mpn);
  const normalizedBrand = normalizeCode(brand);

  let candidates: ShopeeProductOffer[];
  try {
    candidates = await searchProductsByKeyword({
      keyword: mpn,
      limit: 20,
      sortType: ShopeeSortType.RELEVANCE_DESC,
    });
  } catch {
    return null;
  }

  const matches = candidates.filter((c) => {
    const normalizedName = normalizeCode(c.productName);
    if (!normalizedName.includes(normalizedMpn) || !normalizedName.includes(normalizedBrand)) return false;
    const price = Number(c.priceMin);
    if (!Number.isFinite(price) || price <= 0) return false;
    const ratio = price > params.referencePrice ? price / params.referencePrice : params.referencePrice / price;
    return ratio <= MAX_PRICE_RATIO;
  });
  if (matches.length === 0) return null;

  return matches.reduce((cheapest, c) => (Number(c.priceMin) < Number(cheapest.priceMin) ? c : cheapest));
}
