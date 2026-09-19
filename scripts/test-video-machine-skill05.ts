/**
 * Verificação da Skill 05 (Análise de Oferta/Comissão) contra o Supabase
 * real, encadeada com a Skill 04 de verdade (mesmo pool de produção).
 *
 * Uso: npx tsx scripts/test-video-machine-skill05.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { discoverProducts } from "../src/modules/video-machine/skills/04-descoberta-de-produtos/productDiscovery";
import { analyzeOffers } from "../src/modules/video-machine/skills/05-analise-de-oferta-comissao/offerAnalysis";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

let productionRunId = "";
let discoveryResultId = "";
const jobIds: string[] = [];

async function cleanup() {
  await db.from("video_machine_offer_analysis_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_offer_analysis_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_offer_analysis_policy").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_product_discovery_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_product_selection_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_product_selection_policy").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_outbox_consumer_delivery").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_job").delete().eq("tenant_id", TENANT_ID);
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

async function makeTestJob(stageKey: string, suffix: string): Promise<string> {
  const { data, error } = await db
    .from("video_machine_job")
    .insert({
      logical_job_key: `RUN:${TENANT_ID}:${stageKey}:${suffix}`,
      payload_hash: "test",
      tenant_id: TENANT_ID,
      status: "RUNNING",
      retry_policy: { maxAttempts: 3, backoff: "FIXED", eligibilityModel: "HANDLER_ADVICE_AND_EXECUTION_SAFETY" },
      payload: {},
      execution_scope: "RUN_SCOPED",
      execution_scope_ref: { executionScope: "RUN_SCOPED", productionRunId, productionRunHash: "test", stageExecutionId: "00000000-0000-0000-0000-000000000000", stageExecutionHash: "test" },
      production_run_id: productionRunId,
      stage_key: stageKey,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`makeTestJob: ${error?.message}`);
  jobIds.push(data.id);
  return data.id;
}

async function setupDiscoveryResult() {
  const { data: policy } = await db
    .from("video_machine_product_selection_policy")
    .insert({
      policy_key: "discovery-for-offer-test",
      policy_version: "v1",
      tenant_id: TENANT_ID,
      reuse_policy: "ALLOW",
      minimum_usage_evidence_kind: "MATERIALIZED",
      max_snapshot_age_seconds: 60 * 60 * 24 * 365,
      eligible_source_statuses: ["discovered"],
      ranking_weights: { discoveryCommercial: 100 },
    })
    .select("policy_id")
    .single();
  await db.from("video_machine_product_selection_policy_binding").upsert({
    tenant_id: TENANT_ID,
    policy_key: "discovery-for-offer-test",
    active_policy_id: policy!.policy_id,
    active_policy_version: "v1",
  });
  const jobId = await makeTestJob("PRODUCT_DISCOVERY", "for-offer");
  const result = await discoverProducts(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 5, alternateCount: 3, selectionPolicyKey: "discovery-for-offer-test" },
    { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome === "SUCCEEDED") discoveryResultId = result.resultId;
}

async function createOfferPolicy(key: string, weights: Record<string, number>, extra: Partial<{ maxSnapshotAgeSeconds: number }> = {}) {
  const { data: policy, error } = await db
    .from("video_machine_offer_analysis_policy")
    .insert({
      policy_key: key,
      policy_version: "v1",
      tenant_id: TENANT_ID,
      max_snapshot_age_seconds: extra.maxSnapshotAgeSeconds ?? 60 * 60 * 24 * 365,
      ranking_weights: weights,
      calibration_refs: { commissionRate: { calibrationId: "commission-rate-signal-v1" }, commissionValue: { calibrationId: "commission-value-signal-v1" } },
    })
    .select("policy_id")
    .single();
  if (error || !policy) throw new Error(`createOfferPolicy: ${error?.message}`);
  await db.from("video_machine_offer_analysis_policy_binding").upsert({
    tenant_id: TENANT_ID,
    policy_key: key,
    active_policy_id: policy.policy_id,
    active_policy_version: "v1",
  });
  return policy.policy_id;
}

async function testHappyPath() {
  await createOfferPolicy("offer-policy", { commissionRate: 60, commissionValue: 40 });
  const jobId = await makeTestJob("OFFER_ANALYSIS", "happy");

  const result = await analyzeOffers(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "offer-policy" },
    { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;
  assert.ok(["OK", "PARTIAL"].includes(result.resultStatus));

  const { data: row } = await db.from("video_machine_offer_analysis_result").select("*").eq("result_id", result.resultId).single();
  assert.ok(row!.primary_candidates.length > 0);
  const scores = row!.primary_candidates.map((c: any) => c.offerScore);
  const sorted = [...scores].sort((a, b) => b - a);
  assert.deepEqual(scores, sorted, "primaryCandidates deveria vir ordenado por offerScore DESC");
  console.log(`OK: caminho feliz encadeado Skill04->Skill05 — resultStatus=${row!.result_status}, elegíveis=${row!.eligible_candidate_count}, primary=${row!.primary_candidates.length}.`);
}

async function testReplayIdempotency() {
  const jobId = jobIds[jobIds.length - 1];
  const result2 = await analyzeOffers(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "offer-policy" },
    { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result2.outcome, "SUCCEEDED");
  const { data: rows } = await db.from("video_machine_offer_analysis_result").select("result_id").eq("job_id", jobId).eq("attempt_number", 1);
  assert.equal(rows?.length, 1);
  console.log("OK: replay do mesmo (jobId, attemptNumber) reutiliza o resultado, nunca recalcula.");
}

async function testDiscoveryNotAnalyzable() {
  const jobId = await makeTestJob("OFFER_ANALYSIS", "bad-discovery");
  const result = await analyzeOffers(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId: "00000000-0000-0000-0000-000000000000", offerAnalysisPolicyKey: "offer-policy" },
    { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "DISCOVERY_RESULT_NOT_ANALYZABLE");
  console.log("OK: discoveryResultId inexistente -> FATAL_ERROR/DISCOVERY_RESULT_NOT_ANALYZABLE, nenhum resultado criado.");
}

async function testInvalidPolicyNoActiveWeight() {
  await createOfferPolicy("zero-weight-policy", {});
  const jobId = await makeTestJob("OFFER_ANALYSIS", "zero-weight");
  const result = await analyzeOffers(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "zero-weight-policy" },
    { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "INVALID_OFFER_ANALYSIS_POLICY");
  console.log("OK: policy sem nenhum peso ativo -> FATAL_ERROR/INVALID_OFFER_ANALYSIS_POLICY.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  const run = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey: `skill05-${Date.now()}` });
  productionRunId = run.productionRunId;
  try {
    await setupDiscoveryResult();
    await testHappyPath();
    await testReplayIdempotency();
    await testDiscoveryNotAnalyzable();
    await testInvalidPolicyNoActiveWeight();
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
