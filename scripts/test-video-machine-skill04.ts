/**
 * Verificação da Skill 04 (Descoberta de Produtos) contra o Supabase
 * real — lê o pool de produção de verdade (deal_candidates/products/
 * offer_snapshots), mas só escreve linhas marcadas de teste
 * (tenantId/policyKey exclusivos), limpas ao final.
 *
 * Uso: npx tsx scripts/test-video-machine-skill04.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { discoverProducts } from "../src/modules/video-machine/skills/04-descoberta-de-produtos/productDiscovery";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const POLICY_KEY = "test-policy";
const db = getDbFresh();

let jobId1 = "";
let jobId2 = "";
let productionRunId = "";

async function cleanup() {
  await db.from("video_machine_product_discovery_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_product_selection_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_product_selection_policy").delete().eq("tenant_id", TENANT_ID);
  if (jobId1) await db.from("video_machine_job").delete().eq("id", jobId1);
  if (jobId2) await db.from("video_machine_job").delete().eq("id", jobId2);
  await db.from("video_machine_outbox_consumer_delivery").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_job").delete().eq("tenant_id", TENANT_ID); // pega também o Job echo criado por startEchoProductionRun
  if (productionRunId) {
    await db.from("video_machine_production_run_runtime_state").delete().eq("production_run_id", productionRunId);
    await db
      .from("video_machine_stage_execution_runtime_state")
      .delete()
      .in("stage_execution_id", (await db.from("video_machine_stage_execution").select("stage_execution_id").eq("production_run_id", productionRunId)).data?.map((r) => r.stage_execution_id) ?? []);
    await db.from("video_machine_prepared_skill_invocation").delete().eq("production_run_id", productionRunId);
    await db.from("video_machine_logical_job_intent").delete().eq("tenant_id", TENANT_ID);
    await db.from("video_machine_stage_execution").delete().eq("production_run_id", productionRunId);
    await db.from("video_machine_stage_iteration").delete().eq("production_run_id", productionRunId);
    await db.from("video_machine_production_run").delete().eq("production_run_id", productionRunId);
  }
}

async function makeTestJob(logicalKeySuffix: string): Promise<string> {
  const { data, error } = await db
    .from("video_machine_job")
    .insert({
      logical_job_key: `RUN:${TENANT_ID}:PRODUCT_DISCOVERY:${logicalKeySuffix}`,
      payload_hash: "test",
      tenant_id: TENANT_ID,
      status: "RUNNING",
      retry_policy: { maxAttempts: 3, backoff: "FIXED", eligibilityModel: "HANDLER_ADVICE_AND_EXECUTION_SAFETY" },
      payload: {},
      execution_scope: "RUN_SCOPED",
      execution_scope_ref: { executionScope: "RUN_SCOPED", productionRunId, productionRunHash: "test", stageExecutionId: "00000000-0000-0000-0000-000000000000", stageExecutionHash: "test" },
      production_run_id: productionRunId,
      stage_key: "PRODUCT_DISCOVERY",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`makeTestJob: ${error?.message}`);
  return data.id;
}

async function createPolicy(overrides: Partial<{ reusePolicy: string; rankingWeights: Record<string, number>; maxSnapshotAgeSeconds: number; excludeIfPreviouslyPublishedAsAnyContent: boolean }> = {}) {
  const { data: policy, error } = await db
    .from("video_machine_product_selection_policy")
    .insert({
      policy_key: POLICY_KEY,
      policy_version: "v1",
      tenant_id: TENANT_ID,
      reuse_policy: overrides.reusePolicy ?? "ALLOW",
      minimum_usage_evidence_kind: "MATERIALIZED",
      max_snapshot_age_seconds: overrides.maxSnapshotAgeSeconds ?? 60 * 60 * 24 * 365,
      exclude_if_previously_published_as_any_content: overrides.excludeIfPreviouslyPublishedAsAnyContent ?? false,
      eligible_source_statuses: ["discovered"],
      ranking_weights: overrides.rankingWeights ?? { discoveryCommercial: 100 },
    })
    .select("policy_id")
    .single();
  if (error || !policy) throw new Error(`createPolicy: ${error?.message}`);

  const { error: bindingErr } = await db.from("video_machine_product_selection_policy_binding").upsert({
    tenant_id: TENANT_ID,
    policy_key: POLICY_KEY,
    active_policy_id: policy.policy_id,
    active_policy_version: "v1",
  });
  if (bindingErr) throw new Error(`createPolicy binding: ${bindingErr.message}`);
  return policy.policy_id;
}

async function testHappyPathAgainstRealPool() {
  await createPolicy();
  jobId1 = await makeTestJob("happy");

  const result = await discoverProducts(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 3, alternateCount: 2, selectionPolicyKey: POLICY_KEY },
    { jobId: jobId1, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );

  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;
  assert.ok(["OK", "PARTIAL"].includes(result.resultStatus), `esperava OK/PARTIAL, veio ${result.resultStatus}`);

  const { data: row } = await db.from("video_machine_product_discovery_result").select("*").eq("result_id", result.resultId).single();
  assert.ok(row);
  assert.ok(row!.pool_candidate_count > 0, "pool real deveria ter candidatos (81 confirmados antes do teste)");
  assert.ok(row!.primary_candidates.length > 0, "deveria selecionar pelo menos 1 primary do pool real");
  const primaryProductIds = row!.primary_candidates.map((c: any) => c.productId);
  assert.equal(new Set(primaryProductIds).size, primaryProductIds.length, "sem productId duplicado em primary");

  console.log(`OK: caminho feliz contra o pool real — resultStatus=${row!.result_status}, pool=${row!.pool_candidate_count}, elegíveis=${row!.eligible_count}, primary=${row!.primary_candidates.length}.`);
}

async function testReplayIdempotency() {
  const result2 = await discoverProducts(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 3, alternateCount: 2, selectionPolicyKey: POLICY_KEY },
    { jobId: jobId1, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result2.outcome, "SUCCEEDED");
  const { data: rows } = await db.from("video_machine_product_discovery_result").select("result_id").eq("job_id", jobId1).eq("attempt_number", 1);
  assert.equal(rows?.length, 1, "replay do mesmo (jobId, attemptNumber) não deve criar um segundo resultado");
  console.log("OK: replay do mesmo (jobId, attemptNumber) reutiliza o resultado existente, nunca recalcula.");
}

async function testInvalidPolicySignal() {
  await db.from("video_machine_product_selection_policy_binding").delete().eq("tenant_id", TENANT_ID).eq("policy_key", "bad-policy");
  const { data: badPolicy } = await db
    .from("video_machine_product_selection_policy")
    .insert({
      policy_key: "bad-policy",
      policy_version: "v1",
      tenant_id: TENANT_ID,
      reuse_policy: "ALLOW",
      minimum_usage_evidence_kind: "MATERIALIZED",
      max_snapshot_age_seconds: 999999999,
      eligible_source_statuses: ["discovered"],
      ranking_weights: { historicalPerformance: 10 }, // sinal estruturalmente UNAVAILABLE no MVP
    })
    .select("policy_id")
    .single();
  await db.from("video_machine_product_selection_policy_binding").insert({
    tenant_id: TENANT_ID,
    policy_key: "bad-policy",
    active_policy_id: badPolicy!.policy_id,
    active_policy_version: "v1",
  });

  jobId2 = await makeTestJob("bad-policy");
  const result = await discoverProducts(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 1, alternateCount: 0, selectionPolicyKey: "bad-policy" },
    { jobId: jobId2, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "INVALID_SELECTION_POLICY");

  const { data: rows } = await db.from("video_machine_product_discovery_result").select("result_id").eq("job_id", jobId2);
  assert.equal(rows?.length ?? 0, 0, "FATAL_ERROR nunca persiste ProductDiscoveryResult");

  await db.from("video_machine_product_selection_policy_binding").delete().eq("tenant_id", TENANT_ID).eq("policy_key", "bad-policy");
  await db.from("video_machine_product_selection_policy").delete().eq("policy_id", badPolicy!.policy_id);

  console.log("OK: peso positivo em sinal UNAVAILABLE (historicalPerformance) -> FATAL_ERROR/INVALID_SELECTION_POLICY, nenhum resultado criado.");
}

async function testTenantMismatch() {
  const result = await discoverProducts(
    db,
    { tenantId: "outro-tenant-qualquer", runId: productionRunId, requestedCount: 1, alternateCount: 0, selectionPolicyKey: POLICY_KEY },
    { jobId: jobId1, attemptNumber: 2, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "INVALID_DISCOVERY_INPUT");
  console.log("OK: tenantId do input divergindo do Job confiável -> FATAL_ERROR/INVALID_DISCOVERY_INPUT.");
}

async function testCategoryIntersectionRejected() {
  const result = await discoverProducts(
    db,
    {
      tenantId: TENANT_ID,
      runId: productionRunId,
      requestedCount: 1,
      alternateCount: 0,
      selectionPolicyKey: POLICY_KEY,
      allowedCategorySlugs: ["eletronicos"],
      excludedCategorySlugs: ["eletronicos"],
    },
    { jobId: jobId1, attemptNumber: 3, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "INVALID_DISCOVERY_INPUT");
  console.log("OK: allowedCategorySlugs ∩ excludedCategorySlugs != ∅ -> FATAL_ERROR/INVALID_DISCOVERY_INPUT.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  const run = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey: `skill04-${Date.now()}` });
  productionRunId = run.productionRunId;
  try {
    await testHappyPathAgainstRealPool();
    await testReplayIdempotency();
    await testInvalidPolicySignal();
    await testTenantMismatch();
    await testCategoryIntersectionRejected();
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
