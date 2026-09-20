/**
 * Verificação da Skill 07 (Direção Criativa) contra o Supabase real,
 * encadeada com Skill04->Skill05->StageSubjectBinding->Skill07. O
 * caminho MODEL_ASSISTED faz uma chamada real à OpenAI (gpt-4o-mini,
 * prompt pequeno) — custo desprezível, mesma disciplina de testar
 * contra a realidade usada nas Skills anteriores.
 *
 * Uso: npx tsx scripts/test-video-machine-skill07.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { discoverProducts } from "../src/modules/video-machine/skills/04-descoberta-de-produtos/productDiscovery";
import { analyzeOffers } from "../src/modules/video-machine/skills/05-analise-de-oferta-comissao/offerAnalysis";
import { decideCreativeDirection } from "../src/modules/video-machine/skills/07-direcao-criativa/creativeDirection";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

let productionRunId = "";
let stageIterationId = "";
let offerResultId = "";
let stageSubjectBindingId = "";

async function cleanup() {
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
      policy_key: "discovery-for-creative",
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
  await db.from("video_machine_product_selection_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "discovery-for-creative", active_policy_id: discPolicy!.policy_id, active_policy_version: "v1" });
  const discJobId = await makeTestJob("PRODUCT_DISCOVERY", "for-creative");
  const discResult = await discoverProducts(db, { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 3, alternateCount: 0, selectionPolicyKey: "discovery-for-creative" }, { jobId: discJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(discResult.outcome, "SUCCEEDED");
  const discoveryResultId = discResult.outcome === "SUCCEEDED" ? discResult.resultId : "";

  const { data: offerPolicy } = await db
    .from("video_machine_offer_analysis_policy")
    .insert({
      policy_key: "offer-for-creative",
      policy_version: "v1",
      tenant_id: TENANT_ID,
      max_snapshot_age_seconds: 60 * 60 * 24 * 365,
      ranking_weights: { commissionRate: 100 },
      calibration_refs: {},
    })
    .select("policy_id")
    .single();
  await db.from("video_machine_offer_analysis_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "offer-for-creative", active_policy_id: offerPolicy!.policy_id, active_policy_version: "v1" });
  const offerJobId = await makeTestJob("OFFER_ANALYSIS", "for-creative");
  const offerResult = await analyzeOffers(db, { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "offer-for-creative" }, { jobId: offerJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(offerResult.outcome, "SUCCEEDED");
  offerResultId = offerResult.outcome === "SUCCEEDED" ? offerResult.resultId : "";

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
}

async function createCreativePolicy(key: string, multi: boolean) {
  const { data: policy, error } = await db
    .from("video_machine_creative_direction_policy")
    .insert({
      policy_key: key,
      policy_version: "v1",
      tenant_id: TENANT_ID,
      allowed_modes: ["EVERGREEN"],
      allowed_archetypes: multi ? ["DEMONSTRATION", "PRODUCT_IN_USE", "UNBOXING"] : ["EVERGREEN_PRODUCT_DEMO"],
      allowed_hook_strategies: multi ? ["CURIOSITY", "RESULT_FIRST"] : ["RESULT_FIRST"],
      allowed_narrative_structures: multi ? ["HOOK_DEMO_CTA", "RESULT_FIRST_CTA"] : ["HOOK_DEMO_CTA"],
      allowed_visual_approaches: multi ? ["HANDHELD_UGC", "CLEAN_PRODUCT_FOCUS"] : ["CLEAN_PRODUCT_FOCUS"],
      allowed_cta_mechanisms: ["COMMENT_KEYWORD"],
      comment_keyword: "QUERO",
      default_locale: "pt-BR",
    })
    .select("policy_id")
    .single();
  if (error || !policy) throw new Error(`createCreativePolicy: ${error?.message}`);
  await db.from("video_machine_creative_direction_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: key, active_policy_id: policy.policy_id, active_policy_version: "v1" });
}

async function testPolicyOnlyPath() {
  await createCreativePolicy("creative-policy-only", false);
  const jobId = await makeTestJob("CREATIVE_DIRECTION", "policy-only");
  const result = await decideCreativeDirection(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionPolicyKey: "creative-policy-only" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;
  assert.equal(result.resultStatus, "OK");

  const { data: row } = await db.from("video_machine_creative_direction_result").select("*").eq("result_id", result.resultId).single();
  assert.equal(row!.inference_provenance.inferenceMode, "POLICY_ONLY");
  assert.equal(row!.direction.archetype, "EVERGREEN_PRODUCT_DEMO");
  assert.equal(row!.direction.ctaIntent.keyword, "QUERO");
  assert.equal(row!.direction.ctaIntent.keywordNormalized, "quero");
  const ctaKeywordDecision = row!.decisions.find((d: any) => d.decisionKey === "CTA_KEYWORD");
  assert.ok(ctaKeywordDecision.basis.some((b: any) => b.type === "CREATIVE_POLICY"), "CTA_KEYWORD precisa ter CREATIVE_POLICY no basis");
  console.log("OK: caminho POLICY_ONLY — zero chamadas ao provider, CTA=QUERO congelado pela policy.");
}

async function testModelAssistedPath() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("PULADO: OPENAI_API_KEY ausente, sem como testar o caminho MODEL_ASSISTED.");
    return;
  }
  await createCreativePolicy("creative-policy-multi", true);
  const jobId = await makeTestJob("CREATIVE_DIRECTION", "model-assisted");
  const result = await decideCreativeDirection(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionPolicyKey: "creative-policy-multi" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;

  const { data: row } = await db.from("video_machine_creative_direction_result").select("*").eq("result_id", result.resultId).single();
  assert.equal(row!.inference_provenance.inferenceMode, "MODEL_ASSISTED");
  assert.ok(["DEMONSTRATION", "PRODUCT_IN_USE", "UNBOXING"].includes(row!.direction.archetype), "archetype deve vir da allowlist da policy");

  const { data: checkpoint } = await db.from("video_machine_creative_inference_checkpoint").select("state").eq("job_id", jobId).eq("attempt_number", 1).single();
  assert.equal(checkpoint!.state, "RESPONSE_CAPTURED");

  // Replay: mesma (jobId, attemptNumber) -> reutiliza resultado, nunca chama a IA de novo.
  const replay = await decideCreativeDirection(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionPolicyKey: "creative-policy-multi" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(replay.outcome, "SUCCEEDED");
  if (replay.outcome === "SUCCEEDED") assert.equal(replay.resultId, result.resultId);

  console.log(`OK: caminho MODEL_ASSISTED (chamada real à OpenAI) — archetype=${row!.direction.archetype}, hookStrategy=${row!.direction.hookStrategy}, replay reutiliza o resultado.`);
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  const run = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey: `skill07-${Date.now()}` });
  productionRunId = run.productionRunId;
  const { data: iteration } = await db.from("video_machine_stage_iteration").select("stage_iteration_id").eq("production_run_id", productionRunId).limit(1).single();
  stageIterationId = iteration!.stage_iteration_id;
  try {
    await setupUpstream();
    await testPolicyOnlyPath();
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
