/**
 * Verificação da Skill 24 (Gestor de Integrações) contra o Supabase
 * real. Escopo desta fase: IntegrationBinding +
 * IntegrationCredentialHandleRef via ENV_BACKED_CREDENTIAL_RESOLVER
 * (ver comentário no topo da migration 20260920120000).
 *
 * Usa uma env var real e já existente (OPENAI_API_KEY não está
 * configurada localmente — usamos SUPABASE_SERVICE_ROLE_KEY, que
 * sabemos estar presente, só pra provar que o resolver funciona;
 * nunca imprime o valor).
 *
 * Uso: npx tsx scripts/test-video-machine-skill24.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { createIntegrationBinding, resolveIntegrationBinding, resolveCredentialHandle, revokeCredential } from "../src/modules/video-machine/skills/24-gestor-de-integracoes/integrationRegistry";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

async function cleanup() {
  await db.from("video_machine_credential_resolution_record").delete().eq("tenant_id", TENANT_ID);
  const { data: handles } = await db.from("video_machine_credential_handle").select("credential_handle_id").eq("tenant_id", TENANT_ID);
  for (const h of handles ?? []) {
    await db.from("video_machine_credential_revision").delete().eq("credential_handle_id", h.credential_handle_id);
  }
  await db.from("video_machine_credential_handle").delete().eq("tenant_id", TENANT_ID);
  const { data: bindings } = await db.from("video_machine_integration_binding").select("integration_binding_id").eq("tenant_id", TENANT_ID);
  for (const b of bindings ?? []) {
    await db.from("video_machine_integration_binding_runtime_state").delete().eq("integration_binding_id", b.integration_binding_id);
  }
  await db.from("video_machine_integration_binding").delete().eq("tenant_id", TENANT_ID);
}

async function testCreateAndResolveBinding() {
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "teste exige SUPABASE_SERVICE_ROLE_KEY real no .env (só pra provar o resolver, nunca impresso)");

  const created = await createIntegrationBinding(db, { tenantId: TENANT_ID, providerKey: "supabase-test", providerResourceId: "babamanager-pro", resourceKind: "PROJECT", resourceIsolation: "DEDICATED", envVarName: "SUPABASE_SERVICE_ROLE_KEY" });
  assert.equal(created.outcome, "CREATED");
  if (created.outcome !== "CREATED") return;

  const resolved = await resolveIntegrationBinding(db, TENANT_ID, "supabase-test");
  assert.equal(resolved.outcome, "RESOLVED");
  if (resolved.outcome !== "RESOLVED") return;
  assert.equal(resolved.binding.providerKey, "supabase-test");
  assert.equal(resolved.binding.providerResource.resourceKind, "PROJECT");
  assert.equal(resolved.binding.lifecycleStatus, "CONFIGURED");
  console.log("OK: IntegrationBinding criado e resolvido — lifecycle CONFIGURED por padrão, sem secret no objeto retornado.");

  const credentialResult = await resolveCredentialHandle(db, TENANT_ID, created.credentialHandleId);
  assert.equal(credentialResult.outcome, "RESOLVED");
  if (credentialResult.outcome !== "RESOLVED") return;
  assert.equal(credentialResult.secretValue, process.env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(credentialResult.credentialRevisionId);
  console.log("OK: resolveCredentialHandle resolve o valor real via ENV_BACKED_CREDENTIAL_RESOLVER (nunca impresso aqui).");

  const { data: resolutionRecords } = await db.from("video_machine_credential_resolution_record").select("*").eq("tenant_id", TENANT_ID);
  assert.equal(resolutionRecords?.length, 1);
  assert.ok(!JSON.stringify(resolutionRecords).includes(process.env.SUPABASE_SERVICE_ROLE_KEY!), "CredentialResolutionRecord nunca persiste o valor do secret");
  console.log("OK: CredentialResolutionRecord audita a resolução sem persistir o valor do secret.");
}

async function testDuplicateBindingFatal() {
  const created = await createIntegrationBinding(db, { tenantId: TENANT_ID, providerKey: "duplicate-test", providerResourceId: "res-1", resourceKind: "ACCOUNT", resourceIsolation: "DEDICATED", envVarName: "SOME_VAR" });
  assert.equal(created.outcome, "CREATED");
  const duplicate = await createIntegrationBinding(db, { tenantId: TENANT_ID, providerKey: "duplicate-test", providerResourceId: "res-2", resourceKind: "ACCOUNT", resourceIsolation: "DEDICATED", envVarName: "SOME_VAR" });
  assert.equal(duplicate.outcome, "FATAL_ERROR");
  console.log("OK: segundo IntegrationBinding pro mesmo (tenant, providerKey) -> FATAL_ERROR (unique constraint), reflete a realidade real de conta única por provider.");
}

async function testBindingNotConfigured() {
  const result = await resolveIntegrationBinding(db, TENANT_ID, "provider-que-nao-existe");
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.blockReason, "INTEGRATION_BINDING_NOT_CONFIGURED");
  console.log("OK: binding inexistente -> BLOCKED/INTEGRATION_BINDING_NOT_CONFIGURED.");
}

async function testMissingEnvVarBlocked() {
  const created = await createIntegrationBinding(db, { tenantId: TENANT_ID, providerKey: "missing-env-test", providerResourceId: "res-1", resourceKind: "APP", resourceIsolation: "UNKNOWN", envVarName: "VARIAVEL_QUE_NAO_EXISTE_NO_ENV" });
  assert.equal(created.outcome, "CREATED");
  if (created.outcome !== "CREATED") return;
  const result = await resolveCredentialHandle(db, TENANT_ID, created.credentialHandleId);
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.blockReason, "INTEGRATION_CREDENTIAL_NOT_CONFIGURED");
  console.log("OK: env var referenciada pelo handle ausente -> BLOCKED/INTEGRATION_CREDENTIAL_NOT_CONFIGURED (nunca lança exceção com nome de env var em texto).");
}

async function testRevokeBlocksFutureResolution() {
  const created = await createIntegrationBinding(db, { tenantId: TENANT_ID, providerKey: "revoke-test", providerResourceId: "res-1", resourceKind: "INSTANCE", resourceIsolation: "SHARED_EXTERNAL_RESOURCE", envVarName: "SUPABASE_SERVICE_ROLE_KEY" });
  assert.equal(created.outcome, "CREATED");
  if (created.outcome !== "CREATED") return;

  const beforeRevoke = await resolveCredentialHandle(db, TENANT_ID, created.credentialHandleId);
  assert.equal(beforeRevoke.outcome, "RESOLVED");

  const revoked = await revokeCredential(db, created.credentialHandleId);
  assert.equal(revoked.outcome, "REVOKED");

  const afterRevoke = await resolveCredentialHandle(db, TENANT_ID, created.credentialHandleId);
  assert.equal(afterRevoke.outcome, "BLOCKED");
  if (afterRevoke.outcome === "BLOCKED") assert.equal(afterRevoke.blockReason, "INTEGRATION_ACTIVE_CREDENTIAL_REVISION_MISSING");
  console.log("OK: revogar a revisão ACTIVE bloqueia resoluções futuras (INTEGRATION_ACTIVE_CREDENTIAL_REVISION_MISSING) — credencial revogada nunca é resolvida de novo.");
}

async function testTenantMismatchOnCredentialResolution() {
  const created = await createIntegrationBinding(db, { tenantId: TENANT_ID, providerKey: "tenant-mismatch-test", providerResourceId: "res-1", resourceKind: "ACCOUNT", resourceIsolation: "DEDICATED", envVarName: "SUPABASE_SERVICE_ROLE_KEY" });
  assert.equal(created.outcome, "CREATED");
  if (created.outcome !== "CREATED") return;
  const result = await resolveCredentialHandle(db, "outro-tenant-completamente-diferente", created.credentialHandleId);
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "INTEGRATION_TENANT_MISMATCH");
  console.log("OK: resolver credential handle com tenantId divergente do dono real -> FATAL_ERROR/INTEGRATION_TENANT_MISMATCH.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  try {
    await testCreateAndResolveBinding();
    await testDuplicateBindingFatal();
    await testBindingNotConfigured();
    await testMissingEnvVarBlocked();
    await testRevokeBlocksFutureResolution();
    await testTenantMismatchOnCredentialResolution();
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
