import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 04 — Descoberta de Produtos. Fonte normativa: SPEC.md neste
 * mesmo diretório. MVP: eligibleSourceStatuses=["discovered"] (100% do
 * pool real hoje), novelty/categoryPriority/historicalPerformance
 * tratados como estruturalmente UNAVAILABLE (nenhuma fonte
 * tenant-scoped versionada existe ainda) — peso positivo nesses sinais
 * é FATAL_ERROR (INVALID_SELECTION_POLICY), exatamente como o SPEC exige.
 */

export type ProductReusePolicy = "NEVER_REUSE" | "COOLDOWN" | "ALLOW";
export type ProductUsageEvidenceKind = "MATERIALIZED" | "PRIMARY_PUBLISHED";
export type ProductDiscoveryResultStatus = "OK" | "PARTIAL" | "NO_ELIGIBLE_CANDIDATES" | "CANDIDATE_POOL_STALE";

export type ProductExclusionReason =
  | "NO_IMAGE"
  | "CATEGORY_NOT_ALLOWED"
  | "CATEGORY_EXCLUDED"
  | "SOURCE_STATUS_NOT_ALLOWED"
  | "SOURCE_DATA_STALE"
  | "PREVIOUSLY_USED"
  | "REUSE_COOLDOWN_ACTIVE"
  | "PREVIOUSLY_PUBLISHED_ANY_CONTENT"
  | "EXPLICITLY_EXCLUDED"
  | "RANKING_SIGNAL_UNAVAILABLE";

export type ProductDiscoveryInput = {
  tenantId: string;
  runId: string;
  requestedCount: number;
  alternateCount: number;
  allowedCategorySlugs?: string[];
  excludedCategorySlugs?: string[];
  excludedProductIds?: string[];
  selectionPolicyKey: string;
  discoveryContext?: { categorySlug?: string; campaignKey?: string; publicationTargetKey?: string };
};

export type DiscoverProductsJobContext = {
  jobId: string;
  attemptNumber: number;
  trustedTenantId: string;
};

export type DiscoverProductsOutcome =
  | { outcome: "SUCCEEDED"; resultId: string; resultStatus: ProductDiscoveryResultStatus }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

type RankingWeights = {
  discoveryCommercial?: number;
  freshness?: number;
  novelty?: number;
  categoryPriority?: number;
  historicalPerformance?: number;
};

type CandidateEval = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;
  productGroupId?: string;
  sourceCandidateStatus: string;
  eligible: boolean;
  exclusionReasons: ProductExclusionReason[];
  discoveryScore?: number;
  rank?: number;
  skippedForDiversification: boolean;
  diversificationReason?: "SAME_PRODUCT" | "SAME_PRODUCT_GROUP" | "CATEGORY_LIMIT";
  signals: { discoveryCommercial?: number; freshness?: number };
  categorySlug?: string;
  sourceScoreBreakdown?: { quedaHistorica: number; notaEAvaliacoes: number; vendas: number; comissao: number; confiancaHistorico: number; total: number };
  sourceScore?: number;
};

const UNAVAILABLE_SIGNALS = ["novelty", "categoryPriority", "historicalPerformance"] as const;

export async function discoverProducts(
  db: SupabaseClient,
  input: ProductDiscoveryInput,
  jobContext: DiscoverProductsJobContext
): Promise<DiscoverProductsOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) {
    return { outcome: "FATAL_ERROR", errorCode: "INVALID_DISCOVERY_INPUT" };
  }
  if (input.allowedCategorySlugs && input.excludedCategorySlugs) {
    const excludedSet = new Set(input.excludedCategorySlugs);
    if (input.allowedCategorySlugs.some((s) => excludedSet.has(s))) {
      return { outcome: "FATAL_ERROR", errorCode: "INVALID_DISCOVERY_INPUT" };
    }
  }

  // S14 — idempotência: existe -> reutiliza, NUNCA recalcula pra comparar.
  const { data: existing, error: existingErr } = await db
    .from("video_machine_product_discovery_result")
    .select("result_id, result_status")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();
  if (existingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (existing) {
    return { outcome: "SUCCEEDED", resultId: existing.result_id, resultStatus: existing.result_status as ProductDiscoveryResultStatus };
  }

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_product_selection_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.selectionPolicyKey)
    .maybeSingle();
  if (bindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!binding) return { outcome: "FATAL_ERROR", errorCode: "SELECTION_POLICY_BINDING_NOT_FOUND" };

  const { data: policy, error: policyErr } = await db
    .from("video_machine_product_selection_policy")
    .select("*")
    .eq("policy_id", binding.active_policy_id)
    .maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policy) return { outcome: "FATAL_ERROR", errorCode: "SELECTION_POLICY_NOT_FOUND" };
  if (policy.tenant_id !== jobContext.trustedTenantId) {
    return { outcome: "FATAL_ERROR", errorCode: "SELECTION_POLICY_TENANT_MISMATCH" };
  }

  const weights: RankingWeights = policy.ranking_weights;
  for (const signal of UNAVAILABLE_SIGNALS) {
    if ((weights[signal] ?? 0) > 0) return { outcome: "FATAL_ERROR", errorCode: "INVALID_SELECTION_POLICY" };
  }
  if (policy.reuse_policy === "COOLDOWN" && !policy.cooldown_seconds) {
    return { outcome: "FATAL_ERROR", errorCode: "INVALID_SELECTION_POLICY" };
  }

  const eligibleSourceStatuses: string[] = policy.eligible_source_statuses ?? ["discovered"];
  const selectionPolicySnapshotHash = canonicalHash("PRODUCT_SELECTION_POLICY_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    reusePolicy: policy.reuse_policy,
    cooldownSeconds: policy.cooldown_seconds ?? null,
    minimumUsageEvidenceKind: policy.minimum_usage_evidence_kind,
    maxSnapshotAgeSeconds: policy.max_snapshot_age_seconds,
    excludeIfPreviouslyPublishedAsAnyContent: policy.exclude_if_previously_published_as_any_content,
    eligibleSourceStatuses,
    rankingWeights: weights,
    diversificationRules: policy.diversification_rules ?? {},
  });

  const poolReadAt = new Date();

  const { data: dealCandidates, error: poolErr } = await db
    .from("deal_candidates")
    .select("id, product_id, offer_snapshot_id, status, score, score_breakdown");
  if (poolErr) return { outcome: "RETRYABLE_ERROR", errorCode: "POOL_READ_FAILED" };
  const poolCandidateCount = dealCandidates?.length ?? 0;

  if (poolCandidateCount === 0) {
    return persistResult(db, input, jobContext, policy, selectionPolicySnapshotHash, {
      resultStatus: "NO_ELIGIBLE_CANDIDATES",
      poolCandidateCount: 0,
      evaluatedCount: 0,
      freshCandidateCount: 0,
      eligibleCount: 0,
      poolReadAt,
      rankingSnapshot: [],
      primaryCandidates: [],
      alternateCandidates: [],
    });
  }

  const productIds = [...new Set(dealCandidates!.map((d) => d.product_id))];
  const snapshotIds = [...new Set(dealCandidates!.map((d) => d.offer_snapshot_id))];

  const { data: products, error: productsErr } = await db
    .from("products")
    .select("id, category_slug, group_id")
    .in("id", productIds);
  if (productsErr) return { outcome: "RETRYABLE_ERROR", errorCode: "POOL_READ_FAILED" };
  const productsById = new Map((products ?? []).map((p) => [p.id, p]));

  const { data: snapshots, error: snapshotsErr } = await db
    .from("offer_snapshots")
    .select("id, captured_at, image_url")
    .in("id", snapshotIds);
  if (snapshotsErr) return { outcome: "RETRYABLE_ERROR", errorCode: "POOL_READ_FAILED" };
  const snapshotsById = new Map((snapshots ?? []).map((s) => [s.id, s]));

  let reuseEvidenceByProduct: Map<string, string> | null = null; // productId -> most recent qualifying usedAt (ISO)
  if (policy.reuse_policy !== "ALLOW") {
    const qualifyingKinds: ProductUsageEvidenceKind[] =
      policy.minimum_usage_evidence_kind === "MATERIALIZED" ? ["MATERIALIZED", "PRIMARY_PUBLISHED"] : ["PRIMARY_PUBLISHED"];
    const { data: evidence, error: evidenceErr } = await db
      .from("video_machine_product_usage_evidence")
      .select("product_id, used_at")
      .eq("tenant_id", jobContext.trustedTenantId)
      .in("product_id", productIds)
      .in("usage_kind", qualifyingKinds)
      .order("used_at", { ascending: false });
    if (evidenceErr) return { outcome: "RETRYABLE_ERROR", errorCode: "REUSE_HISTORY_READ_FAILED" };
    reuseEvidenceByProduct = new Map();
    for (const e of evidence ?? []) {
      if (!reuseEvidenceByProduct.has(e.product_id)) reuseEvidenceByProduct.set(e.product_id, e.used_at);
    }
  }

  let legacyExposedProductIds: Set<string> | null = null;
  if (policy.exclude_if_previously_published_as_any_content) {
    const { data: exposed, error: exposedErr } = await db
      .from("social_posts")
      .select("deal_candidate_id")
      .in(
        "deal_candidate_id",
        dealCandidates!.map((d) => d.id)
      );
    if (exposedErr) return { outcome: "RETRYABLE_ERROR", errorCode: "LEGACY_EXPOSURE_READ_FAILED" };
    const exposedDealCandidateIds = new Set((exposed ?? []).map((r) => r.deal_candidate_id));
    legacyExposedProductIds = new Set(
      dealCandidates!.filter((d) => exposedDealCandidateIds.has(d.id)).map((d) => d.product_id)
    );
  }

  const evaluations: CandidateEval[] = [];
  let freshCandidateCount = 0;
  const excludedProductIds = new Set(input.excludedProductIds ?? []);
  const allowedSet = input.allowedCategorySlugs ? new Set(input.allowedCategorySlugs) : null;
  const excludedSet = input.excludedCategorySlugs ? new Set(input.excludedCategorySlugs) : null;

  for (const dc of dealCandidates!) {
    const product = productsById.get(dc.product_id);
    const snapshot = snapshotsById.get(dc.offer_snapshot_id);
    const reasons: ProductExclusionReason[] = [];

    const ageSeconds = snapshot ? Math.max(0, (poolReadAt.getTime() - new Date(snapshot.captured_at).getTime()) / 1000) : Infinity;
    const fresh = ageSeconds <= policy.max_snapshot_age_seconds;
    if (fresh) freshCandidateCount += 1;

    if (!snapshot?.image_url) reasons.push("NO_IMAGE");
    if (!fresh) reasons.push("SOURCE_DATA_STALE");

    const categorySlug: string | undefined = product?.category_slug ?? undefined;
    if (allowedSet) {
      if (!categorySlug || !allowedSet.has(categorySlug)) reasons.push("CATEGORY_NOT_ALLOWED");
    }
    if (excludedSet && categorySlug && excludedSet.has(categorySlug)) reasons.push("CATEGORY_EXCLUDED");
    if (!eligibleSourceStatuses.includes(dc.status)) reasons.push("SOURCE_STATUS_NOT_ALLOWED");
    if (excludedProductIds.has(dc.product_id)) reasons.push("EXPLICITLY_EXCLUDED");

    if (reuseEvidenceByProduct) {
      const usedAt = reuseEvidenceByProduct.get(dc.product_id);
      if (usedAt) {
        if (policy.reuse_policy === "NEVER_REUSE") {
          reasons.push("PREVIOUSLY_USED");
        } else if (policy.reuse_policy === "COOLDOWN") {
          const ageMs = poolReadAt.getTime() - new Date(usedAt).getTime();
          if (ageMs < policy.cooldown_seconds * 1000) reasons.push("REUSE_COOLDOWN_ACTIVE");
        }
      }
    }
    if (legacyExposedProductIds?.has(dc.product_id)) reasons.push("PREVIOUSLY_PUBLISHED_ANY_CONTENT");

    const breakdown = dc.score_breakdown as CandidateEval["sourceScoreBreakdown"] | null;
    const signals: CandidateEval["signals"] = {};
    if ((weights.discoveryCommercial ?? 0) > 0) {
      if (!breakdown) {
        reasons.push("RANKING_SIGNAL_UNAVAILABLE");
      } else {
        const allowedPoints = breakdown.quedaHistorica + breakdown.notaEAvaliacoes + breakdown.vendas;
        signals.discoveryCommercial = clamp((allowedPoints / 85) * 100, 0, 100);
      }
    }
    if ((weights.freshness ?? 0) > 0 && fresh) {
      signals.freshness = clamp(100 * (1 - ageSeconds / policy.max_snapshot_age_seconds), 0, 100);
    }

    evaluations.push({
      productId: dc.product_id,
      dealCandidateId: dc.id,
      sourceOfferSnapshotId: dc.offer_snapshot_id,
      productGroupId: product?.group_id ?? undefined,
      sourceCandidateStatus: dc.status,
      eligible: reasons.length === 0,
      exclusionReasons: reasons,
      skippedForDiversification: false,
      signals,
      categorySlug,
      sourceScoreBreakdown: breakdown ?? undefined,
      sourceScore: dc.score != null ? Number(dc.score) : undefined,
    });
  }

  const eligibleCount = evaluations.filter((e) => e.eligible).length;

  let resultStatus: ProductDiscoveryResultStatus;
  if (freshCandidateCount === 0) {
    resultStatus = "CANDIDATE_POOL_STALE";
  } else if (eligibleCount === 0) {
    resultStatus = "NO_ELIGIBLE_CANDIDATES";
  } else {
    resultStatus = "OK"; // ajustado pra PARTIAL abaixo se necessário
  }

  if (resultStatus === "CANDIDATE_POOL_STALE" || resultStatus === "NO_ELIGIBLE_CANDIDATES") {
    return persistResult(db, input, jobContext, policy, selectionPolicySnapshotHash, {
      resultStatus,
      poolCandidateCount,
      evaluatedCount: evaluations.length,
      freshCandidateCount,
      eligibleCount,
      poolReadAt,
      rankingSnapshot: evaluations,
      primaryCandidates: [],
      alternateCandidates: [],
    });
  }

  const totalActiveWeight = Object.values(weights).reduce((sum, w) => sum + (w && w > 0 ? w : 0), 0);
  const eligible = evaluations.filter((e) => e.eligible);
  for (const e of eligible) {
    let weighted = 0;
    if ((weights.discoveryCommercial ?? 0) > 0) weighted += (e.signals.discoveryCommercial ?? 0) * weights.discoveryCommercial!;
    if ((weights.freshness ?? 0) > 0) weighted += (e.signals.freshness ?? 0) * weights.freshness!;
    e.discoveryScore = totalActiveWeight > 0 ? weighted / totalActiveWeight : 0;
  }
  eligible.sort((a, b) => {
    if (b.discoveryScore! !== a.discoveryScore!) return b.discoveryScore! - a.discoveryScore!;
    if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
    if (a.dealCandidateId !== b.dealCandidateId) return a.dealCandidateId < b.dealCandidateId ? -1 : 1;
    return a.sourceOfferSnapshotId < b.sourceOfferSnapshotId ? -1 : 1;
  });
  eligible.forEach((e, i) => (e.rank = i + 1));

  const diversification = policy.diversification_rules ?? {};
  const seenProductIds = new Set<string>();
  const seenGroupIds = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const selected: CandidateEval[] = [];

  for (const e of eligible) {
    if (selected.length >= input.requestedCount + input.alternateCount) break;
    if (seenProductIds.has(e.productId)) {
      e.skippedForDiversification = true;
      e.diversificationReason = "SAME_PRODUCT";
      continue;
    }
    if (diversification.avoidSameProductGroup && e.productGroupId && seenGroupIds.has(e.productGroupId)) {
      e.skippedForDiversification = true;
      e.diversificationReason = "SAME_PRODUCT_GROUP";
      continue;
    }
    if (diversification.maxPerCategory && e.categorySlug) {
      const count = categoryCounts.get(e.categorySlug) ?? 0;
      if (count >= diversification.maxPerCategory) {
        e.skippedForDiversification = true;
        e.diversificationReason = "CATEGORY_LIMIT";
        continue;
      }
    }
    seenProductIds.add(e.productId);
    if (e.productGroupId) seenGroupIds.add(e.productGroupId);
    if (e.categorySlug) categoryCounts.set(e.categorySlug, (categoryCounts.get(e.categorySlug) ?? 0) + 1);
    selected.push(e);
  }

  const primary = selected.slice(0, input.requestedCount);
  const alternates = selected.slice(input.requestedCount, input.requestedCount + input.alternateCount);
  resultStatus = primary.length === input.requestedCount ? "OK" : "PARTIAL";

  return persistResult(db, input, jobContext, policy, selectionPolicySnapshotHash, {
    resultStatus,
    poolCandidateCount,
    evaluatedCount: evaluations.length,
    freshCandidateCount,
    eligibleCount,
    poolReadAt,
    rankingSnapshot: evaluations,
    primaryCandidates: primary.map((e, i) => toSelectedRef(e, i + 1)),
    alternateCandidates: alternates.map((e, i) => toSelectedRef(e, primary.length + i + 1)),
  });
}

function toSelectedRef(e: CandidateEval, finalPosition: number) {
  return {
    productId: e.productId,
    dealCandidateId: e.dealCandidateId,
    sourceOfferSnapshotId: e.sourceOfferSnapshotId,
    rawRank: e.rank,
    finalPosition,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

async function persistResult(
  db: SupabaseClient,
  input: ProductDiscoveryInput,
  jobContext: DiscoverProductsJobContext,
  policy: { policy_id: string; policy_version: string },
  selectionPolicySnapshotHash: string,
  data: {
    resultStatus: ProductDiscoveryResultStatus;
    poolCandidateCount: number;
    evaluatedCount: number;
    freshCandidateCount: number;
    eligibleCount: number;
    poolReadAt: Date;
    rankingSnapshot: CandidateEval[];
    primaryCandidates: ReturnType<typeof toSelectedRef>[];
    alternateCandidates: ReturnType<typeof toSelectedRef>[];
  }
): Promise<DiscoverProductsOutcome> {
  const { data: inserted, error } = await db
    .from("video_machine_product_discovery_result")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      result_status: data.resultStatus,
      requested_count: input.requestedCount,
      alternate_count: input.alternateCount,
      primary_candidates: data.primaryCandidates,
      alternate_candidates: data.alternateCandidates,
      pool_candidate_count: data.poolCandidateCount,
      evaluated_count: data.evaluatedCount,
      fresh_candidate_count: data.freshCandidateCount,
      eligible_count: data.eligibleCount,
      selection_policy_id: policy.policy_id,
      selection_policy_version: policy.policy_version,
      selection_policy_snapshot_hash: selectionPolicySnapshotHash,
      pool_read_at: data.poolReadAt.toISOString(),
      ranking_snapshot: data.rankingSnapshot,
    })
    .select("result_id")
    .single();

  if (error?.code === "23505") {
    // DISCOVERY_RESULT_REPLAY_CONFLICT real (colisão de escrita concorrente) OU replay legítimo — relê pra decidir.
    const { data: raced } = await db
      .from("video_machine_product_discovery_result")
      .select("result_id, result_status")
      .eq("job_id", jobContext.jobId)
      .eq("attempt_number", jobContext.attemptNumber)
      .single();
    if (raced) return { outcome: "SUCCEEDED", resultId: raced.result_id, resultStatus: raced.result_status as ProductDiscoveryResultStatus };
    return { outcome: "FATAL_ERROR", errorCode: "DISCOVERY_RESULT_REPLAY_CONFLICT" };
  }
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };

  return { outcome: "SUCCEEDED", resultId: inserted.result_id, resultStatus: data.resultStatus };
}
