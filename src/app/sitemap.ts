import { MetadataRoute } from "next";
import { SITE_CATEGORIES } from "../lib/site/categories";
import { getCachedIndexableProducts, listViablePriceCategoryPages } from "../lib/site/catalog";
import { GUIDES } from "../lib/site/guides";

const SITE_URL = "https://descontochegando.com.br";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, pricePages] = await Promise.all([getCachedIndexableProducts(), listViablePriceCategoryPages()]);

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
    { url: `${SITE_URL}/guia`, changeFrequency: "weekly" as const, priority: 0.6 },
    { url: `${SITE_URL}/lojas-parceiras`, changeFrequency: "weekly" as const, priority: 0.5 },
    // Conteúdo editorial real (ver lib/site/guides.ts) -- sempre
    // indexável, diferente do gate de produto: é texto original de
    // verdade, não risco de página fina.
    ...GUIDES.map((guide) => ({
      url: `${SITE_URL}/guia/${guide.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
    // SEO_INDEX_GATE v1 (ver getCachedIndexableProducts em
    // lib/site/catalog.ts) -- "estar no catálogo" != "valer a pena
    // indexar". Bug real corrigido 2026-09-25 (achado pelo ChatGPT): a
    // primeira versão filtrava os "24 produtos mais recentes" em vez de
    // buscar o conjunto indexável de verdade, o que zerava o sitemap
    // sempre que essa janela recente ficasse dominada por produto sem
    // sinal (ex: backfill da Kabum). Agora busca os indexáveis direto.
    // `lastModified` usa `priceCheckedAt` (captura real de preço), não
    // `updatedAt` (também é tocado por processos que não mudam a página).
    ...products.map((product) => ({
      url: `${SITE_URL}/produto/${product.slug}`,
      lastModified: product.priceCheckedAt ?? product.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
