import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 05 — Análise de Oferta/Comissão. Fonte normativa: SPEC.md neste
 * mesmo diretório. Calibrações COMMISSION_RATE_SIGNAL_V1/
 * COMMISSION_VALUE_SIGNAL_V1 congeladas como constantes (calibradas
 * sobre 790 offer_snapshots não-nulos, 2026-09-17) — nunca recalculadas
 * em runtime.
 */

type Anchor = { raw: number; score: number };

const COMMISSION_RATE_SIGNAL_V1: Anchor[] = [
  { raw: 0.0, score: 0 },
  { raw: 0.03, score: 25 },
  { raw: 0.07, score: 50 },
  { raw: 0.11, score: 75 },
  { raw: 0.14, score: 90 },
  { raw: 0.1855, score: 95 },
  { raw: 0.28, score: 100 },
];
const COMMISSION_VALUE_SIGNAL_V1: Anchor[] = [
  { raw: 0.0, score: 0 },
  { raw: 0.9, score: 25 },
  { raw: 1.8, score: 50 },
  { raw: 3.99, score: 75 },
  { raw: 7.76, score: 90 },
  { raw: 12.54, score: 95 },
  { raw: 86.69, score: 100 },
];

type SignalCalibration = {
  calibrationId: string;
  calibrationVersion: string;
  signalKind: "COMMISSION_RATE" | "COMMISSION_VALUE";
  population: "OFFER_SNAPSHOTS_NON_NULL";
  sampleSize: number;
  calibratedAt: string;
  anchors: Anchor[];
};

const COMMISSION_RATE_CALIBRATION: SignalCalibration = {
  calibrationId: "commission-rate-signal-v1",
  calibrationVersion: "COMMISSION_RATE_SIGNAL_V1",
  signalKind: "COMMISSION_RATE",
  population: "OFFER_SNAPSHOTS_NON_NULL",
  sampleSize: 790,
  calibratedAt: "2026-09-17T00:00:00.000Z",
  anchors: COMMISSION_RATE_SIGNAL_V1,
};
const COMMISSION_VALUE_CALIBRATION: SignalCalibration = {
  calibrationId: "commission-value-signal-v1",
  calibrationVersion: "COMMISSION_VALUE_SIGNAL_V1",
  signalKind: "COMMISSION_VALUE",
  population: "OFFER_SNAPSHOTS_NON_NULL",
  sampleSize: 790,
  calibratedAt: "2026-09-17T00:00:00.000Z",
  anchors: COMMISSION_VALUE_SIGNAL_V1,
};

function calibrationHash(c: SignalCalibration): string {
  return `CALIBRATION_SNAPSHOT_V1:sha256:${canonicalHash("CALIBRATION_SNAPSHOT_V1", { ...c })}`;
}
const COMMISSION_RATE_CALIBRATION_REF = {
  calibrationId: COMMISSION_RATE_CALIBRATION.calibrationId,
  calibrationVersion: COMMISSION_RATE_CALIBRATION.calibrationVersion,
  calibrationHash: calibrationHash(COMMISSION_RATE_CALIBRATION),
};
const COMMISSION_VALUE_CALIBRATION_REF = {
  calibrationId: COMMISSION_VALUE_CALIBRATION.calibrationId,
  calibrationVersion: COMMISSION_VALUE_CALIBRATION.calibrationVersion,
  calibrationHash: calibrationHash(COMMISSION_VALUE_CALIBRATION),
};

function interpolate(anchors: Anchor[], raw: number): number {
  if (raw <= anchors[0].raw) return anchors[0].score;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (raw <= b.raw) return a.score + ((raw - a.raw) / (b.raw - a.raw)) * (b.score - a.score);
  }
  return anchors[anchors.length - 1].score;
}
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export type OfferExclusionReason =
  | "OFFER_DATA_STALE"
  | "COMMISSION_DATA_UNAVAILABLE"
  | "COMMISSION_DATA_INVALID"
  | "COMMISSION_DATA_INCONSISTENT"
  | "DISCOUNT_DATA_UNAVAILABLE"
  | "DISCOUNT_DATA_INVALID"
  | "COMMISSION_RATE_BELOW_MINIMUM"
  | "COMMISSION_VALUE_BELOW_MINIMUM"
  | "DISCOUNT_BELOW_MINIMUM"
  | "RANKING_SIGNAL_UNAVAILABLE";

export type OfferAnalysisResultStatus = "OK" | "PARTIAL" | "NO_ELIGIBLE_OFFERS" | "OFFER_DATA_STALE";

export type OfferAnalysisInput = {
  tenantId: string;
  runId: string;
  discoveryResultId: string;
  offerAnalysisPolicyKey: string;
};

export type OfferAnalysisJobContext = { jobId: string; attemptNumber: number; trustedTenantId: string };

export type OfferAnalysisOutcome =
  | { outcome: "SUCCEEDED"; resultId: string; resultStatus: OfferAnalysisResultStatus }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

type CandidateEval = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;
  sourceDiscoveryRawRank: number;
  sourceDiscoveryFinalPosition: number;
  eligible: boolean;
  exclusionReasons: OfferExclusionReason[];
  offerScore?: number;
  economicRank?: number;
  signals: { commissionRate?: number; commissionValue?: number; discount?: number };
};

export async function analyzeOffers(
  db: SupabaseClient,
  input: OfferAnalysisInput,
  jobContext: OfferAnalysisJobContext
): Promise<OfferAnalysisOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "DISCOVERY_RESULT_NOT_ANALYZABLE" };

  const { data: existing, error: existingErr } = await db
    .from("video_machine_offer_analysis_result")
    .select("result_id, result_status")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();
  if (existingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (existing) return { outcome: "SUCCEEDED", resultId: existing.result_id, resultStatus: existing.result_status as OfferAnalysisResultStatus };

  const { data: discovery, error: discoveryErr } = await db
    .from("video_machine_product_discovery_result")
    .select("*")
    .eq("result_id", input.discoveryResultId)
    .maybeSingle();
  if (discoveryErr) return { outcome: "RETRYABLE_ERROR", errorCode: "DISCOVERY_RESULT_READ_FAILED" };
  if (!discovery) return { outcome: "FATAL_ERROR", errorCode: "DISCOVERY_RESULT_NOT_ANALYZABLE" };
  if (discovery.tenant_id !== jobContext.trustedTenantId || discovery.run_id !== input.runId) {
    return { outcome: "FATAL_ERROR", errorCode: "DISCOVERY_RESULT_NOT_ANALYZABLE" };
  }
  if (!["OK", "PARTIAL"].includes(discovery.result_status)) {
    return { outcome: "FATAL_ERROR", errorCode: "DISCOVERY_RESULT_NOT_ANALYZABLE" };
  }

  const authoritative: any[] = [...discovery.primary_candidates, ...discovery.alternate_candidates];
  if (authoritative.length === 0) return { outcome: "FATAL_ERROR", errorCode: "DISCOVERY_RESULT_NOT_ANALYZABLE" };

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_offer_analysis_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.offerAnalysisPolicyKey)
    .maybeSingle();
  if (bindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!binding) return { outcome: "FATAL_ERROR", errorCode: "OFFER_ANALYSIS_POLICY_BINDING_NOT_FOUND" };

  const { data: policy, error: policyErr } = await db
    .from("video_machine_offer_analysis_policy")
    .select("*")
    .eq("policy_id", binding.active_policy_id)
    .maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policy) return { outcome: "FATAL_ERROR", errorCode: "OFFER_ANALYSIS_POLICY_NOT_FOUND" };
  if (policy.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "OFFER_ANALYSIS_POLICY_TENANT_MISMATCH" };

  const weights: { commissionRate?: number; commissionValue?: number; discount?: number } = policy.ranking_weights;
  const activeWeight = Object.values(weights).reduce((s, w) => s + (w && w > 0 ? w : 0), 0);
  if (activeWeight <= 0) return { outcome: "FATAL_ERROR", errorCode: "INVALID_OFFER_ANALYSIS_POLICY" };

  const offerAnalysisPolicySnapshotHash = canonicalHash("OFFER_ANALYSIS_POLICY_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    maxSnapshotAgeSeconds: policy.max_snapshot_age_seconds,
    minCommissionRateFraction: policy.min_commission_rate_fraction ?? null,
    minCommissionValueBRL: policy.min_commission_value_brl ?? null,
    minDiscountRatePercent: policy.min_discount_rate_percent ?? null,
    rankingWeights: weights,
    calibrationRefs: policy.calibration_refs,
  });

  const candidateSetHash = `OFFER_CANDIDATE_SET_V1:sha256:${canonicalHash("OFFER_CANDIDATE_SET_V1", {
    candidates: authoritative.map((c) => ({ productId: c.productId, dealCandidateId: c.dealCandidateId, sourceOfferSnapshotId: c.sourceOfferSnapshotId, finalPosition: c.finalPosition })),
  })}`;

  const analysisReadAt = new Date();
  const snapshotIds = [...new Set(authoritative.map((c) => c.sourceOfferSnapshotId))];
  const { data: snapshots, error: snapshotsErr } = await db
    .from("offer_snapshots")
    .select("id, captured_at, price_min, price_max, price_discount_rate, commission_rate, commission")
    .in("id", snapshotIds);
  if (snapshotsErr) return { outcome: "RETRYABLE_ERROR", errorCode: "OFFER_SNAPSHOT_READ_FAILED" };
  const snapshotsById = new Map((snapshots ?? []).map((s) => [s.id, s]));

  const requiresDiscount = policy.min_discount_rate_percent != null || (weights.discount ?? 0) > 0;

  const evaluations: CandidateEval[] = [];
  let freshCandidateCount = 0;
  for (const c of authoritative) {
    const snapshot = snapshotsById.get(c.sourceOfferSnapshotId);
    const reasons: OfferExclusionReason[] = [];
    const ageSeconds = snapshot ? Math.max(0, (analysisReadAt.getTime() - new Date(snapshot.captured_at).getTime()) / 1000) : Infinity;
    const fresh = ageSeconds <= policy.max_snapshot_age_seconds;
    if (fresh) freshCandidateCount += 1;
    if (!fresh) reasons.push("OFFER_DATA_STALE");

    const rate = snapshot?.commission_rate != null ? Number(snapshot.commission_rate) : null;
    const value = snapshot?.commission != null ? Number(snapshot.commission) : null;
    const priceMin = snapshot?.price_min != null ? Number(snapshot.price_min) : null;
    const discount = snapshot?.price_discount_rate != null ? Number(snapshot.price_discount_rate) : null;

    if (rate == null || value == null) {
      reasons.push("COMMISSION_DATA_UNAVAILABLE");
    } else if (rate < 0 || rate > 1 || value < 0 || priceMin == null) {
      reasons.push("COMMISSION_DATA_INVALID");
    } else {
      const expected = Math.round(priceMin * rate * 100) / 100;
      if (Math.abs(value - expected) > 0.01) reasons.push("COMMISSION_DATA_INCONSISTENT");
    }

    if (requiresDiscount) {
      if (discount == null) reasons.push("DISCOUNT_DATA_UNAVAILABLE");
      else if (discount < 0 || discount > 100) reasons.push("DISCOUNT_DATA_INVALID");
    }

    const hasFactErrors = reasons.some((r) => ["COMMISSION_DATA_UNAVAILABLE", "COMMISSION_DATA_INVALID", "COMMISSION_DATA_INCONSISTENT", "DISCOUNT_DATA_UNAVAILABLE", "DISCOUNT_DATA_INVALID"].includes(r));
    if (!hasFactErrors) {
      if (policy.min_commission_rate_fraction != null && rate! < Number(policy.min_commission_rate_fraction)) reasons.push("COMMISSION_RATE_BELOW_MINIMUM");
      if (policy.min_commission_value_brl != null && value! < Number(policy.min_commission_value_brl)) reasons.push("COMMISSION_VALUE_BELOW_MINIMUM");
      if (policy.min_discount_rate_percent != null && discount != null && discount < Number(policy.min_discount_rate_percent)) reasons.push("DISCOUNT_BELOW_MINIMUM");
    }

    const signals: CandidateEval["signals"] = {};
    if (!hasFactErrors) {
      if ((weights.commissionRate ?? 0) > 0) signals.commissionRate = round6(clamp(interpolate(COMMISSION_RATE_SIGNAL_V1, rate!), 0, 100));
      if ((weights.commissionValue ?? 0) > 0) signals.commissionValue = round6(clamp(interpolate(COMMISSION_VALUE_SIGNAL_V1, value!), 0, 100));
      if ((weights.discount ?? 0) > 0 && discount != null) signals.discount = round6(clamp(discount, 0, 100));
    }

    evaluations.push({
      productId: c.productId,
      dealCandidateId: c.dealCandidateId,
      sourceOfferSnapshotId: c.sourceOfferSnapshotId,
      sourceDiscoveryRawRank: c.rawRank,
      sourceDiscoveryFinalPosition: c.finalPosition,
      eligible: reasons.length === 0,
      exclusionReasons: reasons,
      signals,
    });
  }

  const eligibleCandidateCount = evaluations.filter((e) => e.eligible).length;

  let resultStatus: OfferAnalysisResultStatus;
  if (freshCandidateCount === 0) resultStatus = "OFFER_DATA_STALE";
  else if (eligibleCandidateCount === 0) resultStatus = "NO_ELIGIBLE_OFFERS";
  else resultStatus = "OK";

  const targetPrimaryCount = discovery.requested_count;
  const targetAlternateCount = discovery.alternate_count;

  if (resultStatus === "OFFER_DATA_STALE" || resultStatus === "NO_ELIGIBLE_OFFERS") {
    return persist(db, input, jobContext, policy, offerAnalysisPolicySnapshotHash, candidateSetHash, analysisReadAt, {
      resultStatus,
      targetPrimaryCount,
      targetAlternateCount,
      primaryCandidates: [],
      alternateCandidates: [],
      analyzedCandidateCount: evaluations.length,
      freshCandidateCount,
      eligibleCandidateCount,
      rankingSnapshot: evaluations,
    });
  }

  const eligible = evaluations.filter((e) => e.eligible);
  for (const e of eligible) {
    let weighted = 0;
    if ((weights.commissionRate ?? 0) > 0) {
      if (e.signals.commissionRate == null) e.exclusionReasons.push("RANKING_SIGNAL_UNAVAILABLE");
      else weighted += e.signals.commissionRate * weights.commissionRate!;
    }
    if ((weights.commissionValue ?? 0) > 0) {
      if (e.signals.commissionValue == null) e.exclusionReasons.push("RANKING_SIGNAL_UNAVAILABLE");
      else weighted += e.signals.commissionValue * weights.commissionValue!;
    }
    if ((weights.discount ?? 0) > 0) {
      if (e.signals.discount == null) e.exclusionReasons.push("RANKING_SIGNAL_UNAVAILABLE");
      else weighted += e.signals.discount * weights.discount!;
    }
    if (e.exclusionReasons.includes("RANKING_SIGNAL_UNAVAILABLE")) {
      e.eligible = false;
    } else {
      e.offerScore = round6(weighted / activeWeight);
    }
  }

  const finalEligible = eligible.filter((e) => e.eligible);
  const trueEligibleCount = evaluations.filter((e) => e.eligible).length;

  if (trueEligibleCount === 0) {
    return persist(db, input, jobContext, policy, offerAnalysisPolicySnapshotHash, candidateSetHash, analysisReadAt, {
      resultStatus: "NO_ELIGIBLE_OFFERS",
      targetPrimaryCount,
      targetAlternateCount,
      primaryCandidates: [],
      alternateCandidates: [],
      analyzedCandidateCount: evaluations.length,
      freshCandidateCount,
      eligibleCandidateCount: trueEligibleCount,
      rankingSnapshot: evaluations,
    });
  }

  finalEligible.sort((a, b) => {
    if (b.offerScore! !== a.offerScore!) return b.offerScore! - a.offerScore!;
    if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1;
    if (a.dealCandidateId !== b.dealCandidateId) return a.dealCandidateId < b.dealCandidateId ? -1 : 1;
    return a.sourceOfferSnapshotId < b.sourceOfferSnapshotId ? -1 : 1;
  });
  finalEligible.forEach((e, i) => (e.economicRank = i + 1));

  const primary = finalEligible.slice(0, targetPrimaryCount);
  const alternates = finalEligible.slice(targetPrimaryCount, targetPrimaryCount + targetAlternateCount);
  resultStatus = primary.length === targetPrimaryCount ? "OK" : "PARTIAL";

  return persist(db, input, jobContext, policy, offerAnalysisPolicySnapshotHash, candidateSetHash, analysisReadAt, {
    resultStatus,
    targetPrimaryCount,
    targetAlternateCount,
    primaryCandidates: primary.map((e, i) => toRankedRef(e, i + 1)),
    alternateCandidates: alternates.map((e, i) => toRankedRef(e, primary.length + i + 1)),
    analyzedCandidateCount: evaluations.length,
    freshCandidateCount,
    eligibleCandidateCount: trueEligibleCount,
    rankingSnapshot: evaluations,
  });
}

function toRankedRef(e: CandidateEval, finalPosition: number) {
  return {
    productId: e.productId,
    dealCandidateId: e.dealCandidateId,
    sourceOfferSnapshotId: e.sourceOfferSnapshotId,
    sourceDiscoveryFinalPosition: e.sourceDiscoveryFinalPosition,
    offerScore: e.offerScore,
    economicRank: e.economicRank,
    finalPosition,
  };
}

async function persist(
  db: SupabaseClient,
  input: OfferAnalysisInput,
  jobContext: OfferAnalysisJobContext,
  policy: { policy_id: string; policy_version: string },
  offerAnalysisPolicySnapshotHash: string,
  candidateSetHash: string,
  analysisReadAt: Date,
  data: {
    resultStatus: OfferAnalysisResultStatus;
    targetPrimaryCount: number;
    targetAlternateCount: number;
    primaryCandidates: ReturnType<typeof toRankedRef>[];
    alternateCandidates: ReturnType<typeof toRankedRef>[];
    analyzedCandidateCount: number;
    freshCandidateCount: number;
    eligibleCandidateCount: number;
    rankingSnapshot: CandidateEval[];
  }
): Promise<OfferAnalysisOutcome> {
  const { data: inserted, error } = await db
    .from("video_machine_offer_analysis_result")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      discovery_result_id: input.discoveryResultId,
      result_status: data.resultStatus,
      target_primary_count: data.targetPrimaryCount,
      target_alternate_count: data.targetAlternateCount,
      primary_candidates: data.primaryCandidates,
      alternate_candidates: data.alternateCandidates,
      analyzed_candidate_count: data.analyzedCandidateCount,
      fresh_candidate_count: data.freshCandidateCount,
      eligible_candidate_count: data.eligibleCandidateCount,
      offer_analysis_policy_id: policy.policy_id,
      offer_analysis_policy_version: policy.policy_version,
      offer_analysis_policy_snapshot_hash: offerAnalysisPolicySnapshotHash,
      commission_rate_calibration_ref: COMMISSION_RATE_CALIBRATION_REF,
      commission_value_calibration_ref: COMMISSION_VALUE_CALIBRATION_REF,
      analysis_read_at: analysisReadAt.toISOString(),
      candidate_set_hash: candidateSetHash,
      ranking_snapshot: data.rankingSnapshot,
    })
    .select("result_id")
    .single();

  if (error?.code === "23505") {
    const { data: raced } = await db
      .from("video_machine_offer_analysis_result")
      .select("result_id, result_status")
      .eq("job_id", jobContext.jobId)
      .eq("attempt_number", jobContext.attemptNumber)
      .single();
    if (raced) return { outcome: "SUCCEEDED", resultId: raced.result_id, resultStatus: raced.result_status as OfferAnalysisResultStatus };
    return { outcome: "FATAL_ERROR", errorCode: "OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT" };
  }
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  return { outcome: "SUCCEEDED", resultId: inserted.result_id, resultStatus: data.resultStatus };
}
