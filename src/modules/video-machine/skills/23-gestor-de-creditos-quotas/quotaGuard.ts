import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 23 — Gestor de Créditos/Quotas. Fonte normativa: SPEC.md neste
 * mesmo diretório.
 *
 * ESCOPO REDUZIDO deliberadamente (ver comentário no topo da migration
 * 20260920110000): implementa só REQUEST AUTHORIZATION → RESERVE
 * (o "QuotaGuard" que Skills 07/08 já citam como pré-requisito).
 * QuotaExecutionClaim, effect evidence, usage/billing evidence e
 * settlement ficam NOT_IMPLEMENTED — sem consumidor real (Skills
 * 11/12/14/15/20) ainda em código, implementar essa máquina às cegas
 * repetiria o erro que "kernel repair" já corrigiu antes.
 */

export type QuotaUnit = "MONEY" | "OPERATION_COUNT" | "CREDIT" | "COMPUTE_UNIT" | "PROCESSING_SECOND" | "STORAGE_BYTE" | "EGRESS_BYTE";
export type QuotaAuthorizationClass = "EXECUTION_SPEND" | "PROCESSING_OPERATION" | "PROVIDER_OPERATION";

export type QuotaOperationIdentityInput = {
  tenantId: string;
  jobId: string;
  attemptNumber: number;
  providerKey: string;
  modelKey?: string;
  inputArtifactId: string;
  inputArtifactHash: string;
  requestPayloadHash: string;
};

export type QuotaAuthorizationInput = {
  tenantId: string;
  authorizationClass: QuotaAuthorizationClass;
  operationIdentity: QuotaOperationIdentityInput;
  requestedResources: Array<{ unit: QuotaUnit; amount: string }>;
  quotaPolicyKey: string;
};

export type QuotaJobContext = { trustedTenantId: string };

export type QuotaAuthorizationOutcome =
  | { outcome: "AUTHORIZED"; authorizationId: string; reservationId: string; authorizationHash: string; validUntil?: string }
  | { outcome: "DENIED"; authorizationId: string; deniedReasons: string[]; authorizationHash: string }
  | { outcome: "BLOCKED"; blockReason: string }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

function operationIdentityHash(op: QuotaOperationIdentityInput): string {
  return `QUOTA_OPERATION_IDENTITY_V1:sha256:${canonicalHash("QUOTA_OPERATION_IDENTITY_V1", {
    tenantId: op.tenantId,
    jobId: op.jobId,
    attemptNumber: op.attemptNumber,
    providerKey: op.providerKey,
    modelKey: op.modelKey ?? null,
    inputArtifactId: op.inputArtifactId,
    inputArtifactHash: op.inputArtifactHash,
    requestPayloadHash: op.requestPayloadHash,
  })}`;
}

export async function requestQuotaAuthorization(db: SupabaseClient, input: QuotaAuthorizationInput, jobContext: QuotaJobContext): Promise<QuotaAuthorizationOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "QUOTA_TENANT_MISMATCH" };

  const { data: policyBinding, error: policyBindingErr } = await db
    .from("video_machine_quota_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.quotaPolicyKey)
    .maybeSingle();
  if (policyBindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "QUOTA_POLICY_LOOKUP_TRANSIENT_ERROR" };
  if (!policyBinding) return { outcome: "BLOCKED", blockReason: "QUOTA_POLICY_NOT_CONFIGURED" };

  const { data: policy, error: policyErr } = await db.from("video_machine_quota_policy").select("*").eq("policy_id", policyBinding.active_policy_id).maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "QUOTA_POLICY_LOOKUP_TRANSIENT_ERROR" };
  if (!policy || policy.tenant_id !== jobContext.trustedTenantId) return { outcome: "BLOCKED", blockReason: "QUOTA_POLICY_NOT_CONFIGURED" };
  if (policy.authorization_class !== input.authorizationClass) return { outcome: "FATAL_ERROR", errorCode: "QUOTA_POLICY_HASH_MISMATCH" };

  const policyBindingResolutionHash = `QUOTA_POLICY_BINDING_RESOLUTION_V1:sha256:${canonicalHash("QUOTA_POLICY_BINDING_RESOLUTION_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    authorizationClass: policy.authorization_class,
    operationCountLimit: policy.operation_count_limit ?? null,
    operationCountWindow: policy.operation_count_window ?? null,
    monetaryControl: policy.monetary_control,
    authorizationValidity: policy.authorization_validity,
  })}`;

  const opHash = operationIdentityHash(input.operationIdentity);
  const authorizationRequestKey = `${input.tenantId}:${input.operationIdentity.jobId}:${input.operationIdentity.attemptNumber}:${input.authorizationClass}`;
  const requestHash = `QUOTA_AUTHORIZATION_REQUEST_V1:sha256:${canonicalHash("QUOTA_AUTHORIZATION_REQUEST_V1", {
    tenantId: input.tenantId,
    authorizationClass: input.authorizationClass,
    subjectHash: opHash, // V1: QuotaAuthorizationSubject colapsado em operationIdentityHash (nenhum consumidor real exige diferenciação ainda)
    requestedResources: input.requestedResources,
    policyBindingResolutionHash,
    authorizationRequestKey,
  })}`;

  const authorizationId = crypto.randomUUID();
  const authorizationHash = `QUOTA_AUTHORIZATION_V1:sha256:${canonicalHash("QUOTA_AUTHORIZATION_V1", { authorizationId, requestHash })}`;

  let validUntil: string | null = null;
  if (policy.authorization_validity?.mode === "TTL") {
    validUntil = new Date(Date.now() + policy.authorization_validity.ttlSeconds * 1000).toISOString();
  }

  const monetary = policy.monetary_control ?? { mode: "NOT_APPLICABLE" };

  const { data: rpcResult, error: rpcErr } = await db.rpc("video_machine_quota_authorize", {
    p_tenant_id: input.tenantId,
    p_authorization_class: input.authorizationClass,
    p_authorization_request_key: authorizationRequestKey,
    p_request_hash: requestHash,
    p_operation_identity_hash: opHash,
    p_requested_resources: input.requestedResources,
    p_operation_count_limit: policy.operation_count_limit ?? null,
    p_operation_count_window: policy.operation_count_window ?? null,
    p_monetary_mode: monetary.mode,
    p_monetary_limit: monetary.mode === "HARD_LIMIT" ? monetary.hardLimitAmount : null,
    p_monetary_window: monetary.mode === "HARD_LIMIT" ? monetary.window : null,
    p_valid_until: validUntil,
    p_authorization_id: authorizationId,
    p_authorization_hash: authorizationHash,
  });
  if (rpcErr) return { outcome: "RETRYABLE_ERROR", errorCode: "QUOTA_CAPACITY_TRANSACTION_TRANSIENT_ERROR" };

  const result = rpcResult as any;
  if (result.conflict === true) return { outcome: "FATAL_ERROR", errorCode: "QUOTA_AUTHORIZATION_REQUEST_REPLAY_CONFLICT" };
  if (result.hardLimitExposureUnknown === true) return { outcome: "BLOCKED", blockReason: "QUOTA_UNKNOWN_COST_BLOCKED_BY_POLICY" };

  if (result.decision === "DENIED") {
    return { outcome: "DENIED", authorizationId: result.authorizationId, deniedReasons: result.deniedReasons ?? [], authorizationHash: result.authorizationHash };
  }
  return { outcome: "AUTHORIZED", authorizationId: result.authorizationId, reservationId: result.reservationId, authorizationHash: result.authorizationHash, validUntil: result.validUntil ?? undefined };
}

export type ReleaseReason = "CANCELLED_BEFORE_CLAIM" | "AUTHORIZATION_EXPIRED_UNUSED";

export async function releaseReservation(db: SupabaseClient, reservationId: string, reason: ReleaseReason): Promise<{ outcome: "RELEASED" } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string }> {
  const { data, error } = await db.rpc("video_machine_quota_release_reservation", { p_reservation_id: reservationId, p_reason: reason });
  if (error) return { outcome: "RETRYABLE_ERROR", errorCode: "QUOTA_RESERVATION_PERSISTENCE_TRANSIENT_ERROR" };
  const result = data as any;
  if (result.error === "NOT_FOUND") return { outcome: "FATAL_ERROR", errorCode: "QUOTA_RESERVATION_REPLAY_CONFLICT" };
  if (result.error === "QUOTA_INVALID_STATE_TRANSITION") return { outcome: "FATAL_ERROR", errorCode: "QUOTA_INVALID_STATE_TRANSITION" };
  return { outcome: "RELEASED" };
}

/**
 * Resolve a decisão efetiva de uma autorização já materializada,
 * liberando automaticamente reservations HELD cujo validUntil já
 * passou sem claim — cobre o teste "authorization expirada sem claim
 * é liberada como unused" sem exigir um worker dedicado (mesma
 * permissão que o SPEC dá: "expiração pode ser detectada por
 * tentativa de claim, reconciliação periódica, retry de job...").
 */
export async function resolveEffectiveAuthorizationDecision(db: SupabaseClient, authorizationId: string): Promise<{ decision: "AUTHORIZED" | "DENIED" | "EXPIRED"; reservationId?: string } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string }> {
  const { data: auth, error } = await db.from("video_machine_quota_authorization").select("*").eq("authorization_id", authorizationId).maybeSingle();
  if (error) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!auth) return { outcome: "FATAL_ERROR", errorCode: "QUOTA_AUTHORIZATION_REPLAY_CONFLICT" };
  if (auth.decision !== "AUTHORIZED") return { decision: auth.decision };
  if (!auth.valid_until || new Date(auth.valid_until).getTime() > Date.now()) return { decision: "AUTHORIZED", reservationId: auth.reservation_id };

  const released = await releaseReservation(db, auth.reservation_id, "AUTHORIZATION_EXPIRED_UNUSED");
  if (released.outcome === "FATAL_ERROR" || released.outcome === "RETRYABLE_ERROR") return released;
  await db.from("video_machine_quota_authorization").update({ decision: "EXPIRED" }).eq("authorization_id", authorizationId);
  return { decision: "EXPIRED" };
}
