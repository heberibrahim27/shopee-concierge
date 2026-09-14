/**
 * Chamado pelo pipeline de sourcing (Growth OS) depois de gravar um
 * snapshot novo, pra manter o preço no site sempre atualizado sem esperar
 * o fallback de tempo (`revalidate: 3600` em src/lib/site/catalog.ts —
 * ver ARQUITETURA-SITE.md, seção 6). Só dispara pra produto já publicado
 * no site (`site_published`); nunca gera invalidação pra produto que não
 * aparece publicamente.
 *
 * `SITE_BASE_URL`/`REVALIDATION_SECRET` ausentes = no-op silencioso — o
 * pipeline de sourcing roda fora do ambiente do site (script standalone
 * via tsx) e não pode quebrar por falta dessas variáveis.
 */
export interface CatalogUpdateEvent {
  productSlug: string;
  categorySlug?: string | null;
}

export async function notifyCatalogUpdate(event: CatalogUpdateEvent): Promise<void> {
  const baseUrl = process.env.SITE_BASE_URL;
  const secret = process.env.REVALIDATION_SECRET;
  if (!baseUrl || !secret) return;

  try {
    const response = await fetch(`${baseUrl}/api/internal/revalidate-catalog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        event: "product_updated",
        productSlug: event.productSlug,
        categorySlug: event.categorySlug ?? undefined,
        // qualquer produto publicado que mudou pode alterar a ordenação
        // de "Ofertas de hoje" (ordenada por snapshot mais recente).
        affectsHome: true,
      }),
    });

    if (!response.ok) {
      console.error(
        `[site][revalidate] falhou (${response.status}) pro produto ${event.productSlug}`
      );
    }
  } catch (error) {
    console.error(`[site][revalidate] erro de rede pro produto ${event.productSlug}`, error);
  }
}
