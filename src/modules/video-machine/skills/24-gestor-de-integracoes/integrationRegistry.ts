import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 24 — Gestor de Integrações. Fonte normativa: SPEC.md neste
 * mesmo diretório.
 *
 * ESCOPO REDUZIDO deliberadamente (ver comentário no topo da migration
 * 20260920120000): implementa só IntegrationBinding +
 * IntegrationCredentialHandleRef via ENV_BACKED_CREDENTIAL_RESOLVER —
 * literalmente o runtime V1 que o próprio SPEC prescreve.
 * IntegrationCapabilityEvidence, rotação de credencial e health check
 * completo ficam NOT_IMPLEMENTED (sem consumidor real hoje).
 *
 * REGRA CRÍTICA: resolveCredentialHandle() é a ÚNICA função deste
 * módulo que pode ver o valor do secret. Nunca logar, nunca persistir,
 * nunca incluir em nenhum objeto que atravesse um hash canônico ou uma
 * resposta de API.
 */

export type ProviderResourceKind = "ACCOUNT" | "PAGE" | "INSTANCE" | "APP" | "PROJECT" | "WORKSPACE" | "OTHER";
export type ProviderResourceIsolation = "DEDICATED" | "SHARED_EXTERNAL_RESOURCE" | "UNKNOWN";
export type IntegrationLifecycleStatus = "CONFIGURED" | "ACTIVE" | "SUSPENDED" | "DISABLED" | "REVOKED";

export type IntegrationBinding = {
  integrationBindingId: string;
  tenantId: string;
  providerKey: string;
  providerResource: { providerResourceId: string; resourceKind: ProviderResourceKind };
  resourceIsolation: ProviderResourceIsolation;
  bindingHash: string;
  lifecycleStatus: IntegrationLifecycleStatus;
};

export type IntegrationCredentialHandleRef = {
  authority: "SKILL24";
  integrationBindingId: string;
  integrationBindingHash: string;
  credentialHandleId: string;
  handleHash: string;
};

export type ResolveBindingOutcome = { outcome: "RESOLVED"; binding: IntegrationBinding } | { outcome: "BLOCKED"; blockReason: string } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string };

export async function resolveIntegrationBinding(db: SupabaseClient, tenantId: string, providerKey: string): Promise<ResolveBindingOutcome> {
  const { data: binding, error } = await db.from("video_machine_integration_binding").select("*").eq("tenant_id", tenantId).eq("provider_key", providerKey).maybeSingle();
  if (error) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_BINDING_LOOKUP_TRANSIENT_ERROR" };
  if (!binding) return { outcome: "BLOCKED", blockReason: "INTEGRATION_BINDING_NOT_CONFIGURED" };

  const { data: runtime, error: runtimeErr } = await db.from("video_machine_integration_binding_runtime_state").select("*").eq("integration_binding_id", binding.integration_binding_id).maybeSingle();
  if (runtimeErr) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_BINDING_LOOKUP_TRANSIENT_ERROR" };
  const lifecycleStatus: IntegrationLifecycleStatus = runtime?.lifecycle_status ?? "CONFIGURED";

  if (lifecycleStatus === "SUSPENDED") return { outcome: "BLOCKED", blockReason: "INTEGRATION_BINDING_SUSPENDED" };
  if (lifecycleStatus === "DISABLED") return { outcome: "BLOCKED", blockReason: "INTEGRATION_BINDING_DISABLED" };
  if (lifecycleStatus === "REVOKED") return { outcome: "BLOCKED", blockReason: "INTEGRATION_BINDING_REVOKED" };

  return {
    outcome: "RESOLVED",
    binding: {
      integrationBindingId: binding.integration_binding_id,
      tenantId: binding.tenant_id,
      providerKey: binding.provider_key,
      providerResource: { providerResourceId: binding.provider_resource_id, resourceKind: binding.resource_kind },
      resourceIsolation: binding.resource_isolation,
      bindingHash: binding.binding_hash,
      lifecycleStatus,
    },
  };
}

export async function createIntegrationBinding(
  db: SupabaseClient,
  input: { tenantId: string; providerKey: string; providerResourceId: string; resourceKind: ProviderResourceKind; resourceIsolation: ProviderResourceIsolation; envVarName: string; lifecycleStatus?: IntegrationLifecycleStatus }
): Promise<{ outcome: "CREATED"; integrationBindingId: string; credentialHandleId: string } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string }> {
  const bindingHash = `INTEGRATION_BINDING_V1:sha256:${canonicalHash("INTEGRATION_BINDING_V1", {
    tenantId: input.tenantId,
    providerKey: input.providerKey,
    providerResource: { providerResourceId: input.providerResourceId, resourceKind: input.resourceKind },
    resourceIsolation: input.resourceIsolation,
  })}`;

  const { data: binding, error } = await db
    .from("video_machine_integration_binding")
    .insert({ tenant_id: input.tenantId, provider_key: input.providerKey, provider_resource_id: input.providerResourceId, resource_kind: input.resourceKind, resource_isolation: input.resourceIsolation, binding_hash: bindingHash })
    .select("integration_binding_id")
    .single();
  if (error?.code === "23505") return { outcome: "FATAL_ERROR", errorCode: "INTEGRATION_CROSS_TENANT_BINDING" };
  if (error || !binding) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_STATE_PERSISTENCE_TRANSIENT_ERROR" };

  await db.from("video_machine_integration_binding_runtime_state").insert({ integration_binding_id: binding.integration_binding_id, lifecycle_status: input.lifecycleStatus ?? "CONFIGURED" });

  const handleHash = `INTEGRATION_CREDENTIAL_HANDLE_REF_V1:sha256:${canonicalHash("INTEGRATION_CREDENTIAL_HANDLE_REF_V1", { integrationBindingId: binding.integration_binding_id, integrationBindingHash: bindingHash })}`;
  const { data: handle, error: handleErr } = await db
    .from("video_machine_credential_handle")
    .insert({ tenant_id: input.tenantId, integration_binding_id: binding.integration_binding_id, env_var_name: input.envVarName, handle_hash: handleHash })
    .select("credential_handle_id")
    .single();
  if (handleErr || !handle) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_STATE_PERSISTENCE_TRANSIENT_ERROR" };

  await db.from("video_machine_credential_revision").insert({ credential_handle_id: handle.credential_handle_id, revision_key: "v1", status: "ACTIVE" });

  return { outcome: "CREATED", integrationBindingId: binding.integration_binding_id, credentialHandleId: handle.credential_handle_id };
}

export type ResolveCredentialOutcome = { outcome: "RESOLVED"; secretValue: string; credentialRevisionId: string } | { outcome: "BLOCKED"; blockReason: string } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string };

/**
 * Só esta função lê process.env do provider e retorna o valor bruto —
 * chamar imediatamente antes do uso (Skill11/16/17), nunca cedo,
 * nunca cachear o retorno, nunca logar `secretValue`.
 */
export async function resolveCredentialHandle(db: SupabaseClient, tenantId: string, credentialHandleId: string): Promise<ResolveCredentialOutcome> {
  const { data: handle, error } = await db.from("video_machine_credential_handle").select("*").eq("credential_handle_id", credentialHandleId).maybeSingle();
  if (error) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_CREDENTIAL_RESOLVER_TRANSIENT_ERROR" };
  if (!handle) return { outcome: "FATAL_ERROR", errorCode: "INTEGRATION_CREDENTIAL_HANDLE_MISMATCH" };
  if (handle.tenant_id !== tenantId) return { outcome: "FATAL_ERROR", errorCode: "INTEGRATION_TENANT_MISMATCH" };

  const { data: revision, error: revErr } = await db.from("video_machine_credential_revision").select("*").eq("credential_handle_id", credentialHandleId).eq("status", "ACTIVE").maybeSingle();
  if (revErr) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_CREDENTIAL_RESOLVER_TRANSIENT_ERROR" };
  if (!revision) return { outcome: "BLOCKED", blockReason: "INTEGRATION_ACTIVE_CREDENTIAL_REVISION_MISSING" };

  const secretValue = process.env[handle.env_var_name];
  if (!secretValue) return { outcome: "BLOCKED", blockReason: "INTEGRATION_CREDENTIAL_NOT_CONFIGURED" };

  const resolutionHash = `CREDENTIAL_RESOLUTION_RECORD_V1:sha256:${canonicalHash("CREDENTIAL_RESOLUTION_RECORD_V1", { tenantId, credentialHandleId, credentialRevisionId: revision.credential_revision_id })}`;
  await db.from("video_machine_credential_resolution_record").insert({ tenant_id: tenantId, credential_handle_id: credentialHandleId, credential_revision_id: revision.credential_revision_id, resolution_hash: resolutionHash });

  return { outcome: "RESOLVED", secretValue, credentialRevisionId: revision.credential_revision_id };
}

export async function revokeCredential(db: SupabaseClient, credentialHandleId: string): Promise<{ outcome: "REVOKED" } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string }> {
  const { data: revision, error } = await db.from("video_machine_credential_revision").select("credential_revision_id").eq("credential_handle_id", credentialHandleId).eq("status", "ACTIVE").maybeSingle();
  if (error) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_CREDENTIAL_VALIDATION_TRANSIENT_ERROR" };
  if (!revision) return { outcome: "FATAL_ERROR", errorCode: "INTEGRATION_CREDENTIAL_LIFECYCLE_REPLAY_CONFLICT" };
  const { error: updateErr } = await db.from("video_machine_credential_revision").update({ status: "REVOKED" }).eq("credential_revision_id", revision.credential_revision_id);
  if (updateErr) return { outcome: "RETRYABLE_ERROR", errorCode: "INTEGRATION_STATE_PERSISTENCE_TRANSIENT_ERROR" };
  return { outcome: "REVOKED" };
}
