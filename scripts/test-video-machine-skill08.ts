/**
 * Verificação da Skill 08 (Roteirista) contra o Supabase real, encadeada
 * com Skill04->Skill05->StageSubjectBinding->Skill07(POLICY_ONLY)->Skill08.
 *
 * OPENAI_API_KEY ainda ausente localmente (mesma lacuna documentada na
 * Skill07) — mas pra Skill08 isso não é "pulado", é um caso de teste
 * REAL e exigido pelo próprio SPEC.md ("3 situações sem provider" #2:
 * IA necessária, nenhuma integração configurada -> SCRIPT_PROVIDER_NOT_CONFIGURED,
 * FATAL_ERROR, nenhum ScriptResult). O caminho MODEL_ASSISTED completo
 * (chamada real à OpenAI + validação de proposta) fica marcado como
 * PULADO até a chave existir, igual à Skill07.
 *
 * Uso: npx tsx scripts/test-video-machine-skill08.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { discoverProducts } from "../src/modules/video-machine/skills/04-descoberta-de-produtos/productDiscovery";
import { analyzeOffers } from "../src/modules/video-machine/skills/05-analise-de-oferta-comissao/offerAnalysis";
import { decideCreativeDirection } from "../src/modules/video-machine/skills/07-direcao-criativa/creativeDirection";
import { writeScript } from "../src/modules/video-machine/skills/08-roteirista/scriptWriting";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

let productionRunId = "";
let stageIterationId = "";
let stageSubjectBindingId = "";
let creativeDirectionResultId = "";
let creativeDirectionHash = "";

async function cleanup() {
  await db.from("video_machine_script_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_script_inference_checkpoint").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_script_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_script_policy").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_creative_direction_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_creative_inference_checkpoint").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_creative_direction_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_creative_direction_policy").delete().eq("tenant_id", TENANT_ID);
  if (stageSubjectBindingId) await db.from("video_machine_stage_subject_binding").delete().eq("stage_subject_binding_id", stageSubjectBindingId);
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
  return data.id;
}

async function setupUpstream() {
  const { data: discPolicy } = await db
    .from("video_machine_product_selection_policy")
    .insert({
      policy_key: "discovery-for-script",
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
  await db.from("video_machine_product_selection_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "discovery-for-script", active_policy_id: discPolicy!.policy_id, active_policy_version: "v1" });
  const discJobId = await makeTestJob("PRODUCT_DISCOVERY", "for-script");
  const discResult = await discoverProducts(db, { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 3, alternateCount: 0, selectionPolicyKey: "discovery-for-script" }, { jobId: discJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(discResult.outcome, "SUCCEEDED");
  const discoveryResultId = discResult.outcome === "SUCCEEDED" ? discResult.resultId : "";

  const { data: offerPolicy } = await db
    .from("video_machine_offer_analysis_policy")
    .insert({
      policy_key: "offer-for-script",
      policy_version: "v1",
      tenant_id: TENANT_ID,
      max_snapshot_age_seconds: 60 * 60 * 24 * 365,
      ranking_weights: { commissionRate: 100 },
      calibration_refs: {},
    })
    .select("policy_id")
    .single();
  await db.from("video_machine_offer_analysis_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "offer-for-script", active_policy_id: offerPolicy!.policy_id, active_policy_version: "v1" });
  const offerJobId = await makeTestJob("OFFER_ANALYSIS", "for-script");
  const offerResult = await analyzeOffers(db, { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "offer-for-script" }, { jobId: offerJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(offerResult.outcome, "SUCCEEDED");
  const offerResultId = offerResult.outcome === "SUCCEEDED" ? offerResult.resultId : "";

  const { data: offerRow } = await db.from("video_machine_offer_analysis_result").select("primary_candidates").eq("result_id", offerResultId).single();
  const topCandidate = offerRow!.primary_candidates[0];

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_stage_subject_binding")
    .insert({
      run_id: productionRunId,
      stage_key: "CREATIVE_DIRECTION",
      stage_iteration_id: stageIterationId,
      stage_iteration_hash: "test",
      stage_work_unit_identity_hash: "test-work-unit",
      subject_type: "PRODUCT",
      subject_id: topCandidate.productId,
      source_result_id: offerResultId,
      source_position: topCandidate.finalPosition,
    })
    .select("stage_subject_binding_id")
    .single();
  if (bindingErr || !binding) throw new Error(`setupUpstream: binding insert failed: ${bindingErr?.message}`);
  stageSubjectBindingId = binding.stage_subject_binding_id;

  const { data: creativePolicy } = await db
    .from("video_machine_creative_direction_policy")
    .insert({
      policy_key: "creative-for-script",
      policy_version: "v1",
      tenant_id: TENANT_ID,
      allowed_modes: ["EVERGREEN"],
      allowed_archetypes: ["EVERGREEN_PRODUCT_DEMO"],
      allowed_hook_strategies: ["RESULT_FIRST"],
      allowed_narrative_structures: ["HOOK_DEMO_CTA"],
      allowed_visual_approaches: ["CLEAN_PRODUCT_FOCUS"],
      allowed_cta_mechanisms: ["COMMENT_KEYWORD"],
      comment_keyword: "QUERO",
      default_locale: "pt-BR",
    })
    .select("policy_id")
    .single();
  await db.from("video_machine_creative_direction_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "creative-for-script", active_policy_id: creativePolicy!.policy_id, active_policy_version: "v1" });

  const creativeJobId = await makeTestJob("CREATIVE_DIRECTION", "for-script");
  const creativeResult = await decideCreativeDirection(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionPolicyKey: "creative-for-script" }, { jobId: creativeJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(creativeResult.outcome, "SUCCEEDED");
  if (creativeResult.outcome !== "SUCCEEDED") return;
  assert.equal(creativeResult.resultStatus, "OK");
  creativeDirectionResultId = creativeResult.resultId;

  const { data: directionRow } = await db.from("video_machine_creative_direction_result").select("creative_direction_hash").eq("result_id", creativeDirectionResultId).single();
  creativeDirectionHash = directionRow!.creative_direction_hash;
}

async function createScriptPolicy(key: string, overrides: Partial<{ allowedBeatPurposes: string[]; maxBeatCount: number }> = {}) {
  const { data: policy, error } = await db
    .from("video_machine_script_policy")
    .insert({
      policy_key: key,
      policy_version: "v1",
      tenant_id: TENANT_ID,
      locale: "pt-BR",
      allowed_beat_purposes: overrides.allowedBeatPurposes ?? ["HOOK", "CTA"],
      max_beat_count: overrides.maxBeatCount ?? 1,
      allow_spoken_text: true,
      allow_on_screen_text: true,
      require_hook: true,
      require_cta: true,
      factual_claim_rules: {
        requireCanonicalBasis: true,
        allowProductAttributeClaims: true,
        allowCurrentPriceClaims: true,
        allowAdvertisedDiscountClaims: true,
        allowSalesVolumeClaims: true,
        allowRatingClaims: true,
        allowTrendClaims: true,
        allowScarcityClaims: false,
        allowSuperlativeClaims: false,
        allowComparativeClaims: false,
        allowMedicalOrTherapeuticClaims: false,
      },
    })
    .select("policy_id")
    .single();
  if (error || !policy) throw new Error(`createScriptPolicy: ${error?.message}`);
  await db.from("video_machine_script_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: key, active_policy_id: policy.policy_id, active_policy_version: "v1" });
}

async function testProviderNotConfigured() {
  assert.equal(process.env.OPENAI_API_KEY, undefined, "este teste espera especificamente OPENAI_API_KEY ausente");
  await createScriptPolicy("script-provider-not-configured");
  const jobId = await makeTestJob("SCRIPT_GENERATION", "provider-not-configured");
  const result = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId, creativeDirectionHash, scriptPolicyKey: "script-provider-not-configured" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "SCRIPT_PROVIDER_NOT_CONFIGURED");

  const { data: rows } = await db.from("video_machine_script_result").select("result_id").eq("job_id", jobId);
  assert.equal(rows?.length ?? 0, 0, "SCRIPT_PROVIDER_NOT_CONFIGURED nunca materializa ScriptResult");
  console.log("OK: SCRIPT_PROVIDER_NOT_CONFIGURED — IA necessária, nenhuma integração configurada, zero ScriptResult (caso #2 do SPEC).");
}

async function testCreativeDirectionNotFound() {
  await createScriptPolicy("script-direction-not-found");
  const jobId = await makeTestJob("SCRIPT_GENERATION", "direction-not-found");
  const result = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId: "00000000-0000-0000-0000-000000000000", creativeDirectionHash: "bogus", scriptPolicyKey: "script-direction-not-found" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "SCRIPT_CREATIVE_DIRECTION_NOT_FOUND");
  console.log("OK: CreativeDirectionResult inexistente -> SCRIPT_CREATIVE_DIRECTION_NOT_FOUND.");
}

async function testCreativeDirectionHashMismatch() {
  await createScriptPolicy("script-direction-mismatch");
  const jobId = await makeTestJob("SCRIPT_GENERATION", "direction-mismatch");
  const result = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId, creativeDirectionHash: "CREATIVE_DIRECTION_V1:sha256:deadbeef", scriptPolicyKey: "script-direction-mismatch" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "SCRIPT_CREATIVE_DIRECTION_MISMATCH");
  console.log("OK: creativeDirectionHash divergente -> SCRIPT_CREATIVE_DIRECTION_MISMATCH (hash exato exigido, nunca 'a direção mais recente').");
}

async function testTenantMismatch() {
  await createScriptPolicy("script-tenant-mismatch");
  const jobId = await makeTestJob("SCRIPT_GENERATION", "tenant-mismatch");
  const result = await writeScript(db, { tenantId: "outro-tenant", runId: productionRunId, creativeDirectionResultId, creativeDirectionHash, scriptPolicyKey: "script-tenant-mismatch" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "SCRIPT_TENANT_MISMATCH");
  console.log("OK: tenantId do input divergente do trustedTenantId -> SCRIPT_TENANT_MISMATCH.");
}

async function testPolicyBindingNotFound() {
  const jobId = await makeTestJob("SCRIPT_GENERATION", "policy-binding-not-found");
  const result = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId, creativeDirectionHash, scriptPolicyKey: "policy-key-that-does-not-exist" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "SCRIPT_POLICY_BINDING_NOT_FOUND");
  console.log("OK: ScriptPolicyBinding inexistente -> SCRIPT_POLICY_BINDING_NOT_FOUND.");
}

async function testInvalidPolicy() {
  await createScriptPolicy("script-invalid-policy", { allowedBeatPurposes: [] });
  const jobId = await makeTestJob("SCRIPT_GENERATION", "invalid-policy");
  const result = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId, creativeDirectionHash, scriptPolicyKey: "script-invalid-policy" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "INVALID_SCRIPT_POLICY");
  console.log("OK: ScriptPolicy estruturalmente inválida (allowedBeatPurposes vazio) -> INVALID_SCRIPT_POLICY.");
}

async function testModelAssistedPath() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("PULADO: OPENAI_API_KEY ausente, sem como testar o caminho MODEL_ASSISTED completo (geração real + validação de proposta + replay).");
    return;
  }
  await createScriptPolicy("script-model-assisted");
  const jobId = await makeTestJob("SCRIPT_GENERATION", "model-assisted");
  const result = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId, creativeDirectionHash, scriptPolicyKey: "script-model-assisted" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;

  const { data: row } = await db.from("video_machine_script_result").select("*").eq("result_id", result.resultId).single();
  assert.equal(row!.beats.length, 1, "VIDEO_COMPOSITION_V1 exige beats.length === 1");
  assert.equal(row!.inference_provenance.inferenceMode, "MODEL_ASSISTED");

  const replay = await writeScript(db, { tenantId: TENANT_ID, runId: productionRunId, creativeDirectionResultId, creativeDirectionHash, scriptPolicyKey: "script-model-assisted" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(replay.outcome, "SUCCEEDED");
  if (replay.outcome === "SUCCEEDED") assert.equal(replay.resultId, result.resultId);

  console.log(`OK: caminho MODEL_ASSISTED (chamada real à OpenAI) — beats=${row!.beats.length}, replay reutiliza o resultado.`);
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  const run = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey: `skill08-${Date.now()}` });
  productionRunId = run.productionRunId;
  const { data: iteration } = await db.from("video_machine_stage_iteration").select("stage_iteration_id").eq("production_run_id", productionRunId).limit(1).single();
  stageIterationId = iteration!.stage_iteration_id;
  try {
    await setupUpstream();
    await testProviderNotConfigured();
    await testCreativeDirectionNotFound();
    await testCreativeDirectionHashMismatch();
    await testTenantMismatch();
    await testPolicyBindingNotFound();
    await testInvalidPolicy();
    await testModelAssistedPath();
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
