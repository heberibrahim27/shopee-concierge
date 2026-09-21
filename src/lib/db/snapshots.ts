/**
 * Persistência de produtos + snapshots de oferta vindos do
 * productOfferV2 (ver src/lib/shopee/queries.ts).
 *
 * Uso típico (Etapa 1): pra cada ShopeeProductOffer retornado de uma
 * busca, chamar `persistOfferSnapshot` — isso garante o produto
 * cadastrado em `products` (upsert por shopee_item_id) e insere uma
 * linha nova, imutável, em `offer_snapshots`.
 */
import { getDb } from "./client";
import { ShopeeProductOffer } from "../shopee/types";
import { notifyCatalogUpdate } from "../site/notifyRevalidate";

export async function persistOfferSnapshot(
  offer: ShopeeProductOffer
): Promise<{ productId: string; snapshotId: string }> {
  const db = getDb();

  const { data: product, error: productError } = await db
    .from("products")
    .upsert(
      {
        shopee_item_id: offer.itemId,
        shop_id: offer.shopId,
        shop_name: offer.shopName,
        product_name: offer.productName,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopee_item_id" }
    )
    .select("id, slug, category_slug, site_published")
    .single();

  if (productError || !product) {
    throw new Error(
      `Falha ao gravar produto ${offer.itemId}: ${productError?.message}`
    );
  }

  const { data: snapshot, error: snapshotError } = await db
    .from("offer_snapshots")
    .insert({
      product_id: product.id,
      price_min: numOrNull(offer.priceMin),
      price_max: numOrNull(offer.priceMax),
      price_discount_rate: offer.priceDiscountRate ?? null,
      commission_rate: numOrNull(offer.commissionRate),
      commission: numOrNull(offer.commission),
      sales: offer.sales ?? null,
      rating_star: numOrNull(offer.ratingStar),
      image_url: offer.imageUrl ?? null,
      product_link: offer.productLink ?? null,
      offer_link: offer.offerLink ?? null,
      period_start_time: offer.periodStartTime
        ? new Date(offer.periodStartTime * 1000).toISOString()
        : null,
      period_end_time: offer.periodEndTime
        ? new Date(offer.periodEndTime * 1000).toISOString()
        : null,
      raw: offer,
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(
      `Falha ao gravar snapshot de ${offer.itemId}: ${snapshotError?.message}`
    );
  }

  // Mantém o preço no site sempre atualizado — só notifica produto já
  // publicado (ver src/lib/site/notifyRevalidate.ts). Nunca deixa uma
  // falha de rede/config aqui derrubar o pipeline de sourcing.
  if (product.site_published && product.slug) {
    await notifyCatalogUpdate({
      productSlug: product.slug,
      categorySlug: product.category_slug,
    }).catch((error) => {
      console.error(`[site][revalidate] notificação falhou pra ${product.slug}`, error);
    });
  }

  return { productId: product.id, snapshotId: snapshot.id };
}

export async function createDealCandidate(params: {
  productId: string;
  offerSnapshotId: string;
  status?: string;
  score?: number;
  scoreBreakdown?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const db = getDb();
  const { data, error } = await db
    .from("deal_candidates")
    .insert({
      product_id: params.productId,
      offer_snapshot_id: params.offerSnapshotId,
      status: params.status ?? "discovered",
      score: params.score ?? null,
      score_breakdown: params.scoreBreakdown ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao criar deal_candidate: ${error?.message}`);
  }
  return data;
}

export async function updateDealCandidateStatus(params: {
  id: string;
  status: string;
  rejectionReason?: string;
}): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from("deal_candidates")
    .update({
      status: params.status,
      rejection_reason: params.rejectionReason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    throw new Error(`Falha ao atualizar deal_candidate ${params.id}: ${error.message}`);
  }
}

export async function saveAffiliateLink(params: {
  dealCandidateId: string;
  originUrl: string;
  subIds: string[];
  shortLink: string;
  longLink: string;
}): Promise<{ id: string }> {
  const db = getDb();
  const { data, error } = await db
    .from("affiliate_links")
    .insert({
      deal_candidate_id: params.dealCandidateId,
      origin_url: params.originUrl,
      sub_ids: params.subIds,
      short_link: params.shortLink,
      long_link: params.longLink,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao gravar affiliate_link: ${error?.message}`);
  }
  return data;
}

/** Cria um product_group novo e linka os dois produtos a ele — é isso que liga um par (ex: Kabum + Shopee) como "mesmo produto físico" pro comparador do site (ver src/lib/site/catalog.ts, queryGroupOffers). */
export async function linkProductsToGroup(
  productIdA: string,
  productIdB: string
): Promise<{ groupId: string }> {
  const db = getDb();
  const { data: group, error: groupError } = await db
    .from("product_groups")
    .insert({})
    .select("id")
    .single();

  if (groupError || !group) {
    throw new Error(`Falha ao criar product_group: ${groupError?.message}`);
  }

  const { error: updateError } = await db
    .from("products")
    .update({ group_id: group.id })
    .in("id", [productIdA, productIdB]);

  if (updateError) {
    throw new Error(`Falha ao linkar produtos ao grupo ${group.id}: ${updateError.message}`);
  }

  return { groupId: group.id };
}

function numOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
