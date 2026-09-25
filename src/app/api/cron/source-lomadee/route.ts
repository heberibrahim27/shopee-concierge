import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { fetchLomadeeCampaigns, fetchLomadeeProducts, fetchLomadeeBrandById, LomadeeCampaign } from "../../../../lib/lomadee/client";
import { toCatalogItem, persistLomadeeProduct } from "../../../../lib/lomadee/ingest";
import { createDealCandidate } from "../../../../lib/db/snapshots";
import { SITE_CATEGORIES } from "../../../../lib/site/categories";
import { guessCategorySlug } from "../../../../lib/site/categorize";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Ingestão diária da Lomadee (rede de afiliados multi-loja — Americanas,
 * Submarino, Extra, Sawary, Casa do Fitness etc., canal
 * descontochegando.com.br verificado 2026-09-22, ver CONTINUIDADE.md).
 * Duas fontes na mesma API:
 *
 * 1. Cupons/ofertas (campaigns) — já vêm com link de afiliado pronto em
 *    channels[].shortUrls (a API gera automaticamente pro nosso canal),
 *    grava na mesma tabela `coupons` que a Awin usa (coluna própria
 *    `lomadee_campaign_id`, UUID, não cabe no `promotion_id` bigint da
 *    Awin).
 * 2. Produtos (catálogo) — NÃO vem com link pronto; cada produto exige
 *    1 chamada própria em POST /affiliate/shortener/url (type:"Custom").
 *    Rate limit real da Lomadee é 60 req/60s por chave, por isso o lote
 *    de produtos é pequeno (20/execução) — 1 call de listagem + até 20
 *    calls de shortener por execução, bem dentro do limite.
 */

/**
 * campaigns/products só devolvem `organizationId` (UUID) — o nome real
 * da loja (pro badge do cupom, ver CouponCard.tsx) exige uma chamada
 * própria em GET /affiliate/brands/{id}. Cache em memória por execução
 * evita repetir a chamada pra marcas que aparecem em várias campanhas.
 */
function makeBrandResolver() {
  const cache = new Map<string, { name: string; slug: string } | null>();
  return async function resolveBrand(organizationId: string): Promise<{ name: string; slug: string } | null> {
    if (cache.has(organizationId)) return cache.get(organizationId)!;
    try {
      const { data } = await fetchLomadeeBrandById(organizationId);
      const resolved = { name: data.name, slug: data.slug };
      cache.set(organizationId, resolved);
      return resolved;
    } catch {
      cache.set(organizationId, null);
      return null;
    }
  };
}

async function ingestCoupons(resolveBrand: ReturnType<typeof makeBrandResolver>) {
  const db = getDb();
  let campaigns: LomadeeCampaign[] = [];
  try {
    const resp = await fetchLomadeeCampaigns({ types: "GenericCoupon,PersonalCoupon,Offer", status: "onTime", limit: 20 });
    campaigns = resp.data;
  } catch (err) {
    return { publicados: 0, falhas: [`fetchLomadeeCampaigns: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const falhas: string[] = [];
  let publicados = 0;
  const activeCampaignIds: string[] = [];

  for (const c of campaigns) {
    const link = c.channels?.[0]?.shortUrls?.[0];
    if (!link) continue; // sem link pro nosso canal (marca restrita) — pula

    const brand = await resolveBrand(c.organizationId);

    const { error } = await db.from("coupons").upsert(
      {
        lomadee_campaign_id: c.id,
        lomadee_organization_id: c.organizationId,
        advertiser_name: brand?.name ?? c.name,
        platform: brand?.slug ?? "lomadee",
        title: c.name,
        description: c.description ?? null,
        code: c.code ?? null,
        url_tracking: link,
        starts_at: c.period?.startAt ?? null,
        ends_at: c.period?.endAt ?? null,
        status: "active",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lomadee_campaign_id" }
    );
    if (error) {
      falhas.push(`${c.id}: ${error.message}`);
      continue;
    }
    activeCampaignIds.push(c.id);
    publicados++;
  }

  // Expira (marca inactive) cupons Lomadee que já não vêm mais como "onTime"
  // na API -- mesma lógica do cron da Awin (source-coupons). Achado real
  // 2026-09-25: sem isso, um cupom sem ends_at (12,5% dos cupons Lomadee
  // hoje) ficava visível pra sempre mesmo que a campanha real tivesse
  // acabado, porque o filtro de exibição só olhava data, nunca status.
  if (activeCampaignIds.length > 0) {
    await db
      .from("coupons")
      .update({ status: "expired" })
      .eq("status", "active")
      .not("lomadee_campaign_id", "is", null)
      .not("lomadee_campaign_id", "in", `(${activeCampaignIds.join(",")})`);
  }

  return { publicados, falhas };
}

async function ingestProducts(limit: number, resolveBrand: ReturnType<typeof makeBrandResolver>) {
  let products;
  try {
    const resp = await fetchLomadeeProducts({ isAvailable: true, limit });
    products = resp.data;
  } catch (err) {
    return { publicados: [] as string[], falhas: [`fetchLomadeeProducts: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const publicados: string[] = [];
  const falhas: string[] = [];

  for (const product of products) {
    const item = toCatalogItem(product);
    if (!item) continue;
    try {
      const categorySlug = guessCategorySlug(item.productName);
      const category = SITE_CATEGORIES.find((c) => c.slug === categorySlug)?.label ?? "Casa";
      const brand = await resolveBrand(item.organizationId);
      const persisted = await persistLomadeeProduct({ item, platform: brand?.slug ?? "lomadee", category, categorySlug });
      if (!persisted) continue; // canal restrito pra essa marca, sem link de afiliado
      await createDealCandidate({ productId: persisted.productId, offerSnapshotId: persisted.snapshotId, status: "discovered", score: 60 });
      publicados.push(item.lomadeeProductId);
    } catch (err) {
      falhas.push(`${product.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { publicados, falhas };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const resolveBrand = makeBrandResolver();
  const [coupons, products] = await Promise.all([ingestCoupons(resolveBrand), ingestProducts(20, resolveBrand)]);

  return NextResponse.json({ ok: true, coupons, products });
}
