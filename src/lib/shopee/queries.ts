import { shopeeGraphQL } from "./client";
import {
  ProductOfferV2Response,
  GenerateShortLinkResponse,
  ShopeeProductOffer,
  ShopeeSortType,
} from "./types";

const PRODUCT_FIELDS = `
  itemId
  productName
  priceMin
  priceMax
  commissionRate
  commission
  sales
  ratingStar
  priceDiscountRate
  imageUrl
  shopId
  shopName
  shopType
  productLink
  offerLink
  periodStartTime
  periodEndTime
`;

/**
 * A API da Shopee devolve itemId/shopId como números em alguns ambientes,
 * apesar do contrato GraphQL e dos tipos locais declararem texto. Modelos de
 * visão devolvem esses mesmos IDs em JSON como strings; normalizar na borda
 * evita que um match real seja perdido por `123 !== "123"`.
 */
export function normalizeShopeeProductOfferIds(offer: ShopeeProductOffer): ShopeeProductOffer {
  return {
    ...offer,
    itemId: String(offer.itemId),
    shopId: String(offer.shopId),
  };
}

/**
 * Busca produtos por palavra-chave na Shopee (productOfferV2).
 * keyword é obrigatório para usar RELEVANCE_DESC.
 */
export async function searchProductsByKeyword(params: {
  keyword: string;
  page?: number;
  limit?: number;
  sortType?: ShopeeSortType;
}): Promise<ShopeeProductOffer[]> {
  const { keyword, page = 1, limit = 20, sortType = ShopeeSortType.RELEVANCE_DESC } = params;

  const query = `
    query SearchProducts($keyword: String, $page: Int, $limit: Int, $sortType: Int) {
      productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType) {
        nodes { ${PRODUCT_FIELDS} }
        pageInfo { page limit hasNextPage }
      }
    }
  `;

  const data = await shopeeGraphQL<ProductOfferV2Response>({
    query,
    variables: { keyword, page, limit, sortType },
  });

  return data.productOfferV2.nodes.map(normalizeShopeeProductOfferIds);
}

/**
 * Gera um link curto de afiliado já atribuído à conta configurada.
 * subIds: no máx. 5, tokens curtos/simples (ex: "wa", "s1") — a Shopee
 * rejeita valores longos/compostos (erro [11001] Params Error: invalid sub id).
 */
export async function generateAffiliateShortLink(params: {
  originUrl: string;
  subIds?: string[];
}): Promise<{ shortLink: string; longLink: string }> {
  const { originUrl, subIds = [] } = params;

  const mutation = `
    mutation GenLink($originUrl: String!, $subIds: [String!]) {
      generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) {
        shortLink
        longLink
      }
    }
  `;

  const data = await shopeeGraphQL<GenerateShortLinkResponse>({
    query: mutation,
    variables: { originUrl, subIds },
  });

  return data.generateShortLink;
}
