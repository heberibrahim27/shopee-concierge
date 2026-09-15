/**
 * Busca AO VIVO na Shopee — só usada na página `/busca`, como
 * complemento aos resultados curados (site_catalog). O cliente que
 * pesquisa já quer comprar; se não temos o produto publicado/validado,
 * perder a venda é pior do que mostrar um resultado que não passou pelo
 * placar completo do Growth OS. Ainda assim aplica um filtro leve
 * (nota/vendas) pra não deixar passar vendedor claramente ruim.
 */
import { searchProductsByKeyword } from "../shopee/queries";
import { ShopeeProductOffer, ShopeeSortType } from "../shopee/types";
import { SortOption } from "./sort";

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

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "para", "pra", "em", "a", "o",
  "as", "os", "um", "uma", "sem", "no", "na",
]);

/** A busca por palavra-chave da Shopee às vezes acha o termo em qualquer
 * parte (descrição, tag) e devolve acessório/peça avulsa em vez do produto
 * em si (ex: buscar "impressora térmica" trouxe "caneta de limpeza de
 * cabeça de impressão"). Exige que pelo menos uma palavra significativa da
 * busca apareça de verdade no título — filtro simples, mas evita a maior
 * parte do lixo fora de contexto sem arriscar cortar resultado bom. */
function isRelevantTitle(term: string, productName: string): boolean {
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return true; // termo curto/genérico demais pra filtrar com segurança
  const title = productName.toLowerCase();
  return words.some((w) => title.includes(w));
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

/** A API da Shopee não tem sortType pra "melhor avaliação" — nesse caso
 * pede em relevância e reordena no nosso lado pelos que vieram. */
function toShopeeSortType(sort: SortOption): ShopeeSortType {
  switch (sort) {
    case "vendidos":
      return ShopeeSortType.ITEM_SOLD_DESC;
    case "preco":
      return ShopeeSortType.PRICE_ASC;
    default:
      return ShopeeSortType.RELEVANCE_DESC;
  }
}

export async function searchShopeeLive(term: string, sort: SortOption = "relevancia"): Promise<LiveProduct[]> {
  if (term.trim().length < 2) return [];
  if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) return [];

  try {
    const offers = await searchProductsByKeyword({
      keyword: term.trim(),
      limit: 20,
      sortType: toShopeeSortType(sort),
    });
    let products = offers
      .filter(isDecentOffer)
      .filter((offer) => isRelevantTitle(term, offer.productName))
      .map(mapOffer);
    if (sort === "avaliacao") {
      products = products.sort((a, b) => (b.ratingStar ?? 0) - (a.ratingStar ?? 0));
    }
    return products.slice(0, MAX_RESULTS);
  } catch (err) {
    console.error("[busca] Falha na busca ao vivo na Shopee:", err);
    return [];
  }
}
