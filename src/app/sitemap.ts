import { MetadataRoute } from "next";
import { SITE_CATEGORIES } from "../lib/site/categories";
import { getCachedHomeOffers } from "../lib/site/catalog";

const SITE_URL = "https://descontochegando.com.br";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getCachedHomeOffers();

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...SITE_CATEGORIES.map((category) => ({
      url: `${SITE_URL}/categoria/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${SITE_URL}/produto/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
