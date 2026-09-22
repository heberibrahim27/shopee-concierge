import { shopeeGraphQL } from "./client";
import {
  ConversionReportResponse,
  ProductOfferV2Response,
  GenerateShortLinkResponse,
  ShopeeConversion,
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
 * Busca produtos de UMA loja específica (productOfferV2 aceita `shopId`,
 * confirmado por introspecção ao vivo, 2026-09-21 — não documentado
 * publicamente, achado testando o schema real). Pedido do Heber: divulgar
 * como afiliado os produtos da própria loja "Farmácia Uruguai" na Shopee.
 * `shopId` vai como string na variável — mesma pegadinha do Int64 que já
 * pegou o conversionReport (a API não aceita number puro nesse campo).
 */
export async function searchProductsByShop(params: {
  shopId: string;
  page?: number;
  limit?: number;
  sortType?: ShopeeSortType;
}): Promise<ShopeeProductOffer[]> {
  const { shopId, page = 1, limit = 20, sortType = ShopeeSortType.ITEM_SOLD_DESC } = params;

  const query = `
    query SearchByShop($shopId: Int64, $page: Int, $limit: Int, $sortType: Int) {
      productOfferV2(shopId: $shopId, page: $page, limit: $limit, sortType: $sortType) {
        nodes { ${PRODUCT_FIELDS} }
        pageInfo { page limit hasNextPage }
      }
    }
  `;

  const data = await shopeeGraphQL<ProductOfferV2Response>({
    query,
    variables: { shopId, page, limit, sortType },
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

/**
 * Vendas reais atribuídas aos nossos links de afiliado, com comissão —
 * schema `conversionReport` descoberto por introspecção (não documentado
 * publicamente), confirmado ao vivo em 2026-09-17. `purchaseTimeStart`/
 * `purchaseTimeEnd` em epoch segundos; a API exige esses dois como STRING
 * na variável (Int64 escalar, mesma pegadinha do itemId/shopId).
 */
export async function getConversionReport(params: {
  purchaseTimeStart: number;
  purchaseTimeEnd: number;
  limit?: number;
}): Promise<ShopeeConversion[]> {
  const { purchaseTimeStart, purchaseTimeEnd, limit = 200 } = params;

  const query = `
    query ConversionReport($start: Int64, $end: Int64, $limit: Int) {
      conversionReport(purchaseTimeStart: $start, purchaseTimeEnd: $end, limit: $limit) {
        nodes {
          conversionId
          conversionStatus
          purchaseTime
          clickTime
          totalCommission
          orders { orderId }
        }
        pageInfo { hasNextPage scrollId }
      }
    }
  `;

  const data = await shopeeGraphQL<ConversionReportResponse>({
    query,
    variables: { start: String(purchaseTimeStart), end: String(purchaseTimeEnd), limit },
  });

  return data.conversionReport.nodes.map((n: any) => ({
    conversionId: String(n.conversionId),
    conversionStatus: n.conversionStatus,
    purchaseTime: n.purchaseTime,
    clickTime: n.clickTime,
    totalCommission: n.totalCommission,
    orderIds: (n.orders ?? []).map((o: any) => String(o.orderId)),
  }));
}
