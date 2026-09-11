export interface ShopeeProductOffer {
  itemId: string;
  productName: string;
  priceMin: string;
  priceMax: string;
  commissionRate: string;
  commission: string;
  sales: number;
  ratingStar: string;
  priceDiscountRate: number;
  imageUrl: string;
  shopId: string;
  shopName: string;
  shopType: number;
  productLink: string;
  offerLink: string;
  periodStartTime?: number;
  periodEndTime?: number;
}

export interface ProductOfferV2Response {
  productOfferV2: {
    nodes: ShopeeProductOffer[];
    pageInfo: {
      page: number;
      limit: number;
      hasNextPage: boolean;
    };
  };
}

export interface GenerateShortLinkResponse {
  generateShortLink: {
    shortLink: string;
    longLink: string;
  };
}

/** sortType aceito pela productOfferV2 */
export enum ShopeeSortType {
  RELEVANCE_DESC = 1, // só funciona junto com keyword
  ITEM_SOLD_DESC = 2,
  PRICE_DESC = 3,
  PRICE_ASC = 4,
  COMMISSION_DESC = 5,
}
