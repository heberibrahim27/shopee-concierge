import { MetadataRoute } from "next";
import { SITE_CATEGORIES } from "../lib/site/categories";
import { getCachedHomeOffers, listViablePriceCategoryPages } from "../lib/site/catalog";

const SITE_URL = "https://descontochegando.com.br";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, pricePages] = await Promise.all([getCachedHomeOffers(), listViablePriceCategoryPages()]);

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...SITE_CATEGORIES.map((category) => ({
      url: `${SITE_URL}/categoria/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...pricePages.map(({ slug, preco }) => ({
      url: `${SITE_URL}/categoria/${slug}/ate-${preco}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...products.map((product) => ({
      url: `${SITE_URL}/produto/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
