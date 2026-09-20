import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 22 — Gestor de Conta/Tenant. Fonte normativa: SPEC.md neste
 * mesmo diretório. Auditoria confirmou multi-tenant como aspiracional —
 * V1 implementa só os dois fluxos reais hoje (INTERNAL_JOB,
 * LEGACY_ADMIN_SESSION), via adapter LEGACY_SINGLE_TENANT_CONFIGURATION.
 * AUTHENTICATED_USER_SESSION/PROVIDER_ACCOUNT_INGRESS ficam fora desta
 * fase — dependem de auth real / Skill24, sem consumidor hoje.
 */

export type TenantCapability = "TENANT_ADMIN" | "APPROVAL_REVIEW" | "PIPELINE_OPERATE" | "INTERNAL_REPORT_VIEW" | "EXTERNAL_REPORT_DELIVER";
export type ActorIdentityKind = "LEGACY_SHARED_ADMIN_SESSION" | "USER" | "SERVICE";
export type ActorIdentityAssurance = "SHARED_CREDENTIAL" | "NAMED_AUTHENTICATED_USER" | "TRUSTED_INTERNAL_SERVICE";

export type TrustedTenantContext = {
  tenantId: string;
  tenantStatus: "ACTIVE" | "SUSPENDED" | "DISABLED";
  actor: { actorId: string; kind: ActorIdentityKind; assurance: ActorIdentityAssurance; identityHash: string };
  capabilities: TenantCapability[];
  source: "INTERNAL_JOB" | "LEGACY_ADMIN_SESSION";
  actorBindingHash?: string;
  resolutionHash: string;
};

export type TenantContextResolutionInput = { source: "INTERNAL_JOB"; trustedJobTenantId: string } | { source: "LEGACY_ADMIN_SESSION"; validatedAuthEvidenceRef: string };

export type TenantContextOutcome =
  | { outcome: "RESOLVED"; context: TrustedTenantContext }
  | { outcome: "BLOCKED"; blockReason: string }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

function actorIdentityHash(actorId: string, kind: string, assurance: string): string {
  return `ACTOR_IDENTITY_V1:sha256:${canonicalHash("ACTOR_IDENTITY_V1", { actorId, kind, assurance })}`;
}

export async function resolveTenantContext(db: SupabaseClient, input: TenantContextResolutionInput): Promise<TenantContextOutcome> {
  const tenantId = input.source === "INTERNAL_JOB" ? input.trustedJobTenantId : undefined;

  if (input.source === "LEGACY_ADMIN_SESSION" && !input.validatedAuthEvidenceRef) {
    return { outcome: "FATAL_ERROR", errorCode: "TENANT_UNTRUSTED_AUTHORITY_ATTEMPT" };
  }

  // Fluxo LEGACY_ADMIN_SESSION resolve pro único tenant configurado
  // (adapter LEGACY_SINGLE_TENANT_CONFIGURATION) — não há um segundo
  // tenant real pra escolher hoje.
  let resolveTenantId = tenantId;
  if (input.source === "LEGACY_ADMIN_SESSION") {
    const { data: onlyTenant, error: onlyTenantErr } = await db.from("video_machine_tenant_config").select("tenant_id").limit(2);
    if (onlyTenantErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TENANT_CONTEXT_RESOLUTION_TRANSIENT_ERROR" };
    if (!onlyTenant || onlyTenant.length !== 1) return { outcome: "BLOCKED", blockReason: "TENANT_NOT_CONFIGURED" };
    resolveTenantId = onlyTenant[0].tenant_id;
  }

  const { data: tenant, error: tenantErr } = await db.from("video_machine_tenant_config").select("*").eq("tenant_id", resolveTenantId).maybeSingle();
  if (tenantErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TENANT_CONTEXT_RESOLUTION_TRANSIENT_ERROR" };
  if (!tenant) return { outcome: "BLOCKED", blockReason: "TENANT_NOT_CONFIGURED" };

  if (input.source === "INTERNAL_JOB") {
    const actorId = "service:video-machine-worker";
    const kind: ActorIdentityKind = "SERVICE";
    const assurance: ActorIdentityAssurance = "TRUSTED_INTERNAL_SERVICE";
    const identityHash = actorIdentityHash(actorId, kind, assurance);
    const capabilities: TenantCapability[] = ["PIPELINE_OPERATE"];
    const resolutionHash = `TRUSTED_TENANT_CONTEXT_V1:sha256:${canonicalHash("TRUSTED_TENANT_CONTEXT_V1", { tenantId: tenant.tenant_id, tenantStatus: tenant.status, actorIdentityHash: identityHash, capabilities, source: input.source })}`;
    return {
      outcome: "RESOLVED",
      context: { tenantId: tenant.tenant_id, tenantStatus: tenant.status, actor: { actorId, kind, assurance, identityHash }, capabilities, source: "INTERNAL_JOB", resolutionHash },
    };
  }

  // LEGACY_ADMIN_SESSION
  const actorId = "legacy-admin";
  const { data: bindingRows, error: bindingErr } = await db
    .from("video_machine_tenant_actor_binding")
    .select("*")
    .eq("tenant_id", tenant.tenant_id)
    .eq("actor_id", actorId)
    .order("binding_version", { ascending: false })
    .limit(1);
  if (bindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TENANT_CONTEXT_RESOLUTION_TRANSIENT_ERROR" };
  const binding = bindingRows?.[0];
  if (!binding) return { outcome: "BLOCKED", blockReason: "ACTOR_BINDING_NOT_FOUND" };
  if (binding.status === "SUSPENDED") return { outcome: "BLOCKED", blockReason: "ACTOR_BINDING_SUSPENDED" };
  if (binding.status === "REVOKED") return { outcome: "BLOCKED", blockReason: "ACTOR_BINDING_REVOKED" };

  const kind: ActorIdentityKind = binding.actor_kind;
  const assurance: ActorIdentityAssurance = binding.actor_assurance;
  const identityHash = actorIdentityHash(actorId, kind, assurance);
  const capabilities: TenantCapability[] = binding.capabilities;
  const resolutionHash = `TRUSTED_TENANT_CONTEXT_V1:sha256:${canonicalHash("TRUSTED_TENANT_CONTEXT_V1", { tenantId: tenant.tenant_id, tenantStatus: tenant.status, actorIdentityHash: identityHash, capabilities, source: input.source })}`;

  return {
    outcome: "RESOLVED",
    context: { tenantId: tenant.tenant_id, tenantStatus: tenant.status, actor: { actorId, kind, assurance, identityHash }, capabilities, source: "LEGACY_ADMIN_SESSION", actorBindingHash: binding.binding_hash, resolutionHash },
  };
}

export function assertTenantConsistency(context: TrustedTenantContext, payloadTenantId?: string): { outcome: "OK" } | { outcome: "FATAL_ERROR"; errorCode: string } {
  if (payloadTenantId !== undefined && payloadTenantId !== context.tenantId) return { outcome: "FATAL_ERROR", errorCode: "TENANT_CONTEXT_TENANT_MISMATCH" };
  return { outcome: "OK" };
}

export type TenantAuthorizationScope = { kind: "TENANT" } | { kind: "EXACT_ARTIFACT"; resourceRef: { artifactType: string; artifactId: string } };

export type TenantAuthorizationRequirement = {
  tenantId: string;
  capability: TenantCapability;
  authorizationScope: TenantAuthorizationScope;
  minimumActorAssurance?: "SHARED_CREDENTIAL" | "NAMED_AUTHENTICATED_USER";
};

export type TenantAuthorizationDecision = {
  tenantId: string;
  actorId: string;
  decision: "AUTHORIZED" | "DENIED";
  reason: "CAPABILITY_GRANTED" | "TENANT_SUSPENDED" | "TENANT_DISABLED" | "ACTOR_BINDING_INACTIVE" | "CAPABILITY_NOT_GRANTED" | "IDENTITY_ASSURANCE_INSUFFICIENT";
  authorizationScope: TenantAuthorizationScope;
  decisionHash: string;
};

const ASSURANCE_RANK: Record<ActorIdentityAssurance, number> = { SHARED_CREDENTIAL: 0, NAMED_AUTHENTICATED_USER: 1, TRUSTED_INTERNAL_SERVICE: 2 };

export async function authorizeCapability(db: SupabaseClient, requirement: TenantAuthorizationRequirement, context: TrustedTenantContext): Promise<{ outcome: "DECIDED"; decision: TenantAuthorizationDecision } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string }> {
  if (requirement.tenantId !== context.tenantId) return { outcome: "FATAL_ERROR", errorCode: "TENANT_CROSS_TENANT_BINDING" };

  let reason: TenantAuthorizationDecision["reason"];
  let decision: "AUTHORIZED" | "DENIED";

  if (context.tenantStatus === "SUSPENDED") {
    decision = "DENIED";
    reason = "TENANT_SUSPENDED";
  } else if (context.tenantStatus === "DISABLED") {
    decision = "DENIED";
    reason = "TENANT_DISABLED";
  } else if (!context.capabilities.includes(requirement.capability)) {
    decision = "DENIED";
    reason = "CAPABILITY_NOT_GRANTED";
  } else if (requirement.minimumActorAssurance && ASSURANCE_RANK[context.actor.assurance] < ASSURANCE_RANK[requirement.minimumActorAssurance]) {
    decision = "DENIED";
    reason = "IDENTITY_ASSURANCE_INSUFFICIENT";
  } else {
    decision = "AUTHORIZED";
    reason = "CAPABILITY_GRANTED";
  }

  const decisionHash = `TENANT_AUTHORIZATION_DECISION_V1:sha256:${canonicalHash("TENANT_AUTHORIZATION_DECISION_V1", {
    tenantId: context.tenantId,
    actorId: context.actor.actorId,
    actorIdentityHash: context.actor.identityHash,
    actorBindingHash: context.actorBindingHash ?? null,
    capability: requirement.capability,
    authorizationScope: requirement.authorizationScope as any,
    decision,
    reason,
  })}`;

  const { error } = await db.from("video_machine_tenant_authorization_decision").insert({
    tenant_id: context.tenantId,
    actor_id: context.actor.actorId,
    actor_identity_hash: context.actor.identityHash,
    actor_binding_hash: context.actorBindingHash ?? null,
    capability: requirement.capability,
    authorization_scope: requirement.authorizationScope,
    decision,
    reason,
    decision_hash: decisionHash,
  });
  if (error) return { outcome: "RETRYABLE_ERROR", errorCode: "TENANT_AUTHORIZATION_STORE_TRANSIENT_ERROR" };

  return { outcome: "DECIDED", decision: { tenantId: context.tenantId, actorId: context.actor.actorId, decision, reason, authorizationScope: requirement.authorizationScope, decisionHash } };
}
