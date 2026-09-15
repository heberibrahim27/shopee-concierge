/**
 * Busca AO VIVO na Shopee — só usada na página `/busca`, como
 * complemento aos resultados curados (site_catalog). O cliente que
 * pesquisa já quer comprar; se não temos o produto publicado/validado,
 * perder a venda é pior do que mostrar um resultado que não passou pelo
 * placar completo do Growth OS. Ainda assim aplica um filtro leve
 * (nota/vendas) pra não deixar passar vendedor claramente ruim.
 */
import { searchProductsByKeyword } from "../shopee/queries";
import { ShopeeProductOffer } from "../shopee/types";

export interface LiveProduct {
  itemId: string;
  productName: string;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number | null;
  ratingStar: number | null;
  sales: number | null;
  offerLink: string;
}

const MAX_RESULTS = 12;

/** Nota abaixo de 4 com pelo menos uma avaliação real = fora. Sem nota
 * ainda (0) passa — produto novo não é a mesma coisa que produto ruim. */
function isDecentOffer(offer: ShopeeProductOffer): boolean {
  const rating = Number(offer.ratingStar);
  return !(Number.isFinite(rating) && rating > 0 && rating < 4);
}

function mapOffer(offer: ShopeeProductOffer): LiveProduct {
  return {
    itemId: offer.itemId,
    productName: offer.productName,
    imageUrl: offer.imageUrl,
    priceMin: Number(offer.priceMin),
    priceDiscountRate: offer.priceDiscountRate ?? null,
    ratingStar: offer.ratingStar ? Number(offer.ratingStar) : null,
    sales: offer.sales ?? null,
    offerLink: offer.offerLink,
  };
}

export async function searchShopeeLive(term: string): Promise<LiveProduct[]> {
  if (term.trim().length < 2) return [];
  if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) return [];

  try {
    const offers = await searchProductsByKeyword({ keyword: term.trim(), limit: 20 });
    return offers.filter(isDecentOffer).map(mapOffer).slice(0, MAX_RESULTS);
  } catch (err) {
    console.error("[busca] Falha na busca ao vivo na Shopee:", err);
    return [];
  }
}
