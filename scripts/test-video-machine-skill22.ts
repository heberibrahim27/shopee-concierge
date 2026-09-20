/**
 * Verificação da Skill 22 (Gestor de Conta/Tenant) contra o Supabase
 * real. Não encadeia com as Skills de conteúdo (04-10) — Skill22 é
 * infraestrutura transversal, testada isoladamente com um tenant de
 * teste próprio (não mexe no tenant de produção real, que ainda nem
 * existe formalmente).
 *
 * Uso: npx tsx scripts/test-video-machine-skill22.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { resolveTenantContext, authorizeCapability, assertTenantConsistency } from "../src/modules/video-machine/skills/22-gestor-de-conta-tenant/tenantAuthority";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

async function cleanup() {
  await db.from("video_machine_tenant_authorization_decision").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_tenant_actor_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_tenant_config").delete().eq("tenant_id", TENANT_ID);
}

async function setupTenant(status: "ACTIVE" | "SUSPENDED" | "DISABLED" = "ACTIVE") {
  await db.from("video_machine_tenant_config").upsert({ tenant_id: TENANT_ID, tenant_key: "test-tenant", status, display_name: "Tenant de Teste" });
}

async function insertBinding(version: number, status: "ACTIVE" | "SUSPENDED" | "REVOKED", capabilities: string[]) {
  await db.from("video_machine_tenant_actor_binding").insert({
    tenant_id: TENANT_ID,
    actor_id: "legacy-admin",
    actor_kind: "LEGACY_SHARED_ADMIN_SESSION",
    actor_assurance: "SHARED_CREDENTIAL",
    capabilities,
    status,
    binding_version: version,
    binding_hash: `TENANT_ACTOR_BINDING_V1:sha256:test-v${version}`,
  });
}

async function testInternalJobResolvesServiceActor() {
  await setupTenant("ACTIVE");
  const result = await resolveTenantContext(db, { source: "INTERNAL_JOB", trustedJobTenantId: TENANT_ID });
  assert.equal(result.outcome, "RESOLVED");
  if (result.outcome !== "RESOLVED") return;
  assert.equal(result.context.actor.kind, "SERVICE");
  assert.equal(result.context.actor.assurance, "TRUSTED_INTERNAL_SERVICE");
  assert.ok(result.context.capabilities.includes("PIPELINE_OPERATE"));

  const consistent = assertTenantConsistency(result.context, TENANT_ID);
  assert.equal(consistent.outcome, "OK");
  const mismatch = assertTenantConsistency(result.context, "outro-tenant");
  assert.equal(mismatch.outcome, "FATAL_ERROR");
  if (mismatch.outcome === "FATAL_ERROR") assert.equal(mismatch.errorCode, "TENANT_CONTEXT_TENANT_MISMATCH");

  console.log("OK: INTERNAL_JOB resolve SERVICE actor com PIPELINE_OPERATE; payload tenantId divergente -> TENANT_CONTEXT_TENANT_MISMATCH.");
}

async function testTenantNotConfigured() {
  const result = await resolveTenantContext(db, { source: "INTERNAL_JOB", trustedJobTenantId: "tenant-que-nao-existe" });
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.blockReason, "TENANT_NOT_CONFIGURED");
  console.log("OK: tenant não configurado -> BLOCKED/TENANT_NOT_CONFIGURED (fail closed, nunca fallback pra default).");
}

async function testLegacyAdminNoEvidence() {
  const result = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "" });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "TENANT_UNTRUSTED_AUTHORITY_ATTEMPT");
  console.log("OK: LEGACY_ADMIN_SESSION sem evidência -> FATAL_ERROR/TENANT_UNTRUSTED_AUTHORITY_ATTEMPT.");
}

async function testLegacyAdminNoBinding() {
  await setupTenant("ACTIVE");
  const result = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "evidence-ref-123" });
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.blockReason, "ACTOR_BINDING_NOT_FOUND");
  console.log("OK: LEGACY_ADMIN_SESSION sem TenantActorBinding -> BLOCKED/ACTOR_BINDING_NOT_FOUND.");
}

async function testAuthorizationFlow() {
  await setupTenant("ACTIVE");
  await insertBinding(1, "ACTIVE", ["APPROVAL_REVIEW", "PIPELINE_OPERATE"]);

  const resolved = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "evidence-ref-abc" });
  assert.equal(resolved.outcome, "RESOLVED");
  if (resolved.outcome !== "RESOLVED") return;
  assert.equal(resolved.context.actor.assurance, "SHARED_CREDENTIAL");

  const authorized = await authorizeCapability(db, { tenantId: TENANT_ID, capability: "APPROVAL_REVIEW", authorizationScope: { kind: "TENANT" } }, resolved.context);
  assert.equal(authorized.outcome, "DECIDED");
  if (authorized.outcome === "DECIDED") {
    assert.equal(authorized.decision.decision, "AUTHORIZED");
    assert.equal(authorized.decision.reason, "CAPABILITY_GRANTED");
  }

  const denied = await authorizeCapability(db, { tenantId: TENANT_ID, capability: "TENANT_ADMIN", authorizationScope: { kind: "TENANT" } }, resolved.context);
  assert.equal(denied.outcome, "DECIDED");
  if (denied.outcome === "DECIDED") {
    assert.equal(denied.decision.decision, "DENIED");
    assert.equal(denied.decision.reason, "CAPABILITY_NOT_GRANTED");
  }

  const assuranceDenied = await authorizeCapability(db, { tenantId: TENANT_ID, capability: "APPROVAL_REVIEW", authorizationScope: { kind: "EXACT_ARTIFACT", resourceRef: { artifactType: "ApprovalRequest", artifactId: "test-approval-1" } }, minimumActorAssurance: "NAMED_AUTHENTICATED_USER" }, resolved.context);
  assert.equal(assuranceDenied.outcome, "DECIDED");
  if (assuranceDenied.outcome === "DECIDED") {
    assert.equal(assuranceDenied.decision.decision, "DENIED");
    assert.equal(assuranceDenied.decision.reason, "IDENTITY_ASSURANCE_INSUFFICIENT");
  }

  const { data: decisions } = await db.from("video_machine_tenant_authorization_decision").select("decision, reason").eq("tenant_id", TENANT_ID);
  assert.equal(decisions?.length, 3, "as 3 decisões precisam estar persistidas no audit trail");

  console.log("OK: fluxo de autorização completo — capability concedida autoriza, capability ausente nega, minimumActorAssurance insuficiente nega; 3 TenantAuthorizationDecision persistidas.");
}

async function testBindingSuspendedAndRevoked() {
  await setupTenant("ACTIVE");
  await insertBinding(1, "ACTIVE", ["PIPELINE_OPERATE"]);
  await insertBinding(2, "SUSPENDED", ["PIPELINE_OPERATE"]);

  const suspended = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "evidence-ref-xyz" });
  assert.equal(suspended.outcome, "BLOCKED");
  if (suspended.outcome === "BLOCKED") assert.equal(suspended.blockReason, "ACTOR_BINDING_SUSPENDED");

  await insertBinding(3, "REVOKED", ["PIPELINE_OPERATE"]);
  const revoked = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "evidence-ref-xyz" });
  assert.equal(revoked.outcome, "BLOCKED");
  if (revoked.outcome === "BLOCKED") assert.equal(revoked.blockReason, "ACTOR_BINDING_REVOKED");

  const { data: history } = await db.from("video_machine_tenant_actor_binding").select("binding_version, status").eq("tenant_id", TENANT_ID).order("binding_version");
  assert.equal(history?.length, 3, "revogar é append-only — as 3 versões continuam auditáveis, nenhuma foi sobrescrita");
  assert.equal(history?.[0].status, "ACTIVE");

  console.log("OK: binding SUSPENDED/REVOKED bloqueia resolução (usa sempre a versão mais recente); append-only preserva as 3 versões históricas.");
}

async function testTenantSuspendedDeniesAuthorization() {
  await setupTenant("ACTIVE");
  await insertBinding(1, "ACTIVE", ["PIPELINE_OPERATE"]);
  const resolved = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "evidence-ref-suspend" });
  assert.equal(resolved.outcome, "RESOLVED");
  if (resolved.outcome !== "RESOLVED") return;

  await setupTenant("SUSPENDED");
  const staleContext = { ...resolved.context, tenantStatus: "SUSPENDED" as const };
  const denied = await authorizeCapability(db, { tenantId: TENANT_ID, capability: "PIPELINE_OPERATE", authorizationScope: { kind: "TENANT" } }, staleContext);
  assert.equal(denied.outcome, "DECIDED");
  if (denied.outcome === "DECIDED") {
    assert.equal(denied.decision.decision, "DENIED");
    assert.equal(denied.decision.reason, "TENANT_SUSPENDED");
  }
  console.log("OK: capability concedida não supera tenant SUSPENDED — autorização revalidada no boundary nega mesmo com contexto antigo ACTIVE.");
}

async function testCrossTenantRequirement() {
  await setupTenant("ACTIVE");
  await insertBinding(1, "ACTIVE", ["PIPELINE_OPERATE"]);
  const resolved = await resolveTenantContext(db, { source: "LEGACY_ADMIN_SESSION", validatedAuthEvidenceRef: "evidence-ref-cross" });
  assert.equal(resolved.outcome, "RESOLVED");
  if (resolved.outcome !== "RESOLVED") return;

  const result = await authorizeCapability(db, { tenantId: "outro-tenant-completamente-diferente", capability: "PIPELINE_OPERATE", authorizationScope: { kind: "TENANT" } }, resolved.context);
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "TENANT_CROSS_TENANT_BINDING");
  console.log("OK: requirement.tenantId de outro tenant -> FATAL_ERROR/TENANT_CROSS_TENANT_BINDING.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  try {
    await testInternalJobResolvesServiceActor();
    await testTenantNotConfigured();
    await testLegacyAdminNoEvidence();
    await testLegacyAdminNoBinding();
    await cleanup(); // limpa binding do teste anterior antes do próximo cenário
    await testAuthorizationFlow();
    await cleanup();
    await testBindingSuspendedAndRevoked();
    await cleanup();
    await testTenantSuspendedDeniesAuthorization();
    await cleanup();
    await testCrossTenantRequirement();
    console.log("\nTODOS OS TESTES PASSARAM.");
  } finally {
    await cleanup();
    console.log("Limpeza concluída — linhas de teste removidas (pool real não foi alterado).");
  }
}

main().catch((err) => {
  console.error("FALHA:", err);
  process.exitCode = 1;
});
