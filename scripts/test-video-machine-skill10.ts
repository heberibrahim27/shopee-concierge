/**
 * Verificação da Skill 10 (Gerador de Prompt de Vídeo) contra o
 * Supabase real, encadeada com Skill04->05->StageSubjectBinding->07->
 * (ScriptResult inserido diretamente, mesma justificativa da Skill09)
 * ->09(NO_FRAME_REQUIRED, produz ProductVisualReferenceSetRef real)->10.
 *
 * Skill10 é pura/determinística e sem side effect externo — sem
 * OPENAI_API_KEY nem qualquer outra credencial envolvida. O adapter
 * GENERIC_PROMPT_TEXT_V1 é template determinístico, não IA.
 *
 * Uso: npx tsx scripts/test-video-machine-skill10.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { discoverProducts } from "../src/modules/video-machine/skills/04-descoberta-de-produtos/productDiscovery";
import { analyzeOffers } from "../src/modules/video-machine/skills/05-analise-de-oferta-comissao/offerAnalysis";
import { decideCreativeDirection } from "../src/modules/video-machine/skills/07-direcao-criativa/creativeDirection";
import { generateFrame } from "../src/modules/video-machine/skills/09-gerador-de-frame/frameGeneration";
import { generateVideoPrompt } from "../src/modules/video-machine/skills/10-gerador-de-prompt-de-video/videoPromptGeneration";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

let productionRunId = "";
let stageIterationId = "";
let stageSubjectBindingId = "";
let creativeDirectionResultId = "";
let creativeDirectionHash = "";
let scriptResultId = "";
let scriptHash = "";
let productVisualReferenceSetId = "";

async function cleanup() {
  await db.from("video_machine_video_prompt_artifact").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_video_provider_profile_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_video_provider_profile").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_video_prompt_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_video_prompt_policy").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_frame_generation_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_product_visual_reference_set").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_frame_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_frame_policy").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_script_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_creative_direction_result").delete().eq("tenant_id", TENANT_ID);
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
    .insert({ policy_key: "discovery-for-prompt", policy_version: "v1", tenant_id: TENANT_ID, reuse_policy: "ALLOW", minimum_usage_evidence_kind: "MATERIALIZED", max_snapshot_age_seconds: 60 * 60 * 24 * 365, eligible_source_statuses: ["discovered"], ranking_weights: { discoveryCommercial: 100 } })
    .select("policy_id")
    .single();
  await db.from("video_machine_product_selection_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "discovery-for-prompt", active_policy_id: discPolicy!.policy_id, active_policy_version: "v1" });
  const discJobId = await makeTestJob("PRODUCT_DISCOVERY", "for-prompt");
  const discResult = await discoverProducts(db, { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 3, alternateCount: 0, selectionPolicyKey: "discovery-for-prompt" }, { jobId: discJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(discResult.outcome, "SUCCEEDED");
  const discoveryResultId = discResult.outcome === "SUCCEEDED" ? discResult.resultId : "";

  const { data: offerPolicy } = await db
    .from("video_machine_offer_analysis_policy")
    .insert({ policy_key: "offer-for-prompt", policy_version: "v1", tenant_id: TENANT_ID, max_snapshot_age_seconds: 60 * 60 * 24 * 365, ranking_weights: { commissionRate: 100 }, calibration_refs: {} })
    .select("policy_id")
    .single();
  await db.from("video_machine_offer_analysis_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "offer-for-prompt", active_policy_id: offerPolicy!.policy_id, active_policy_version: "v1" });
  const offerJobId = await makeTestJob("OFFER_ANALYSIS", "for-prompt");
  const offerResult = await analyzeOffers(db, { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "offer-for-prompt" }, { jobId: offerJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(offerResult.outcome, "SUCCEEDED");
  const offerResultId = offerResult.outcome === "SUCCEEDED" ? offerResult.resultId : "";

  const { data: offerRow } = await db.from("video_machine_offer_analysis_result").select("primary_candidates").eq("result_id", offerResultId).single();
  const topCandidate = offerRow!.primary_candidates[0];

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_stage_subject_binding")
    .insert({ run_id: productionRunId, stage_key: "VIDEO_PROMPT", stage_iteration_id: stageIterationId, stage_iteration_hash: "test", stage_work_unit_identity_hash: "test-work-unit", subject_type: "PRODUCT", subject_id: topCandidate.productId, source_result_id: offerResultId, source_position: topCandidate.finalPosition })
    .select("stage_subject_binding_id")
    .single();
  if (bindingErr || !binding) throw new Error(`setupUpstream: binding insert failed: ${bindingErr?.message}`);
  stageSubjectBindingId = binding.stage_subject_binding_id;

  const { data: creativePolicy } = await db
    .from("video_machine_creative_direction_policy")
    .insert({ policy_key: "creative-for-prompt", policy_version: "v1", tenant_id: TENANT_ID, allowed_modes: ["EVERGREEN"], allowed_archetypes: ["EVERGREEN_PRODUCT_DEMO"], allowed_hook_strategies: ["RESULT_FIRST"], allowed_narrative_structures: ["HOOK_DEMO_CTA"], allowed_visual_approaches: ["CLEAN_PRODUCT_FOCUS"], allowed_cta_mechanisms: ["COMMENT_KEYWORD"], comment_keyword: "QUERO", default_locale: "pt-BR" })
    .select("policy_id")
    .single();
  await db.from("video_machine_creative_direction_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "creative-for-prompt", active_policy_id: creativePolicy!.policy_id, active_policy_version: "v1" });

  const creativeJobId = await makeTestJob("CREATIVE_DIRECTION", "for-prompt");
  const creativeResult = await decideCreativeDirection(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionPolicyKey: "creative-for-prompt" }, { jobId: creativeJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(creativeResult.outcome, "SUCCEEDED");
  if (creativeResult.outcome !== "SUCCEEDED") return;
  creativeDirectionResultId = creativeResult.resultId;
  const { data: directionRow } = await db.from("video_machine_creative_direction_result").select("creative_direction_hash").eq("result_id", creativeDirectionResultId).single();
  creativeDirectionHash = directionRow!.creative_direction_hash;

  const { data: scriptPolicy } = await db
    .from("video_machine_script_policy")
    .insert({ policy_key: "script-for-prompt", policy_version: "v1", tenant_id: TENANT_ID, locale: "pt-BR", allowed_beat_purposes: ["HOOK"], max_beat_count: 1, allow_spoken_text: true, allow_on_screen_text: true, require_hook: true, require_cta: false, factual_claim_rules: { requireCanonicalBasis: true, allowProductAttributeClaims: true, allowCurrentPriceClaims: true, allowAdvertisedDiscountClaims: true, allowSalesVolumeClaims: true, allowRatingClaims: true, allowTrendClaims: true, allowScarcityClaims: false, allowSuperlativeClaims: false, allowComparativeClaims: false, allowMedicalOrTherapeuticClaims: false } })
    .select("policy_id")
    .single();
  const beats = [{ beatIndex: 0, purpose: "HOOK", spokenText: { statementId: "s0", kind: "CREATIVE_EXPRESSION", text: "Olha que massageador incrível." }, visualIntent: { text: "mostrar o produto sendo usado no pescoço em ambiente doméstico" } }];
  scriptHash = `SCRIPT_V1:sha256:testhash-${Date.now()}`;
  const { data: scriptRow, error: scriptErr } = await db
    .from("video_machine_script_result")
    .insert({
      tenant_id: TENANT_ID,
      run_id: productionRunId,
      job_id: creativeJobId,
      attempt_number: 99,
      creative_direction_result_id: creativeDirectionResultId,
      creative_direction_hash: creativeDirectionHash,
      locale: "pt-BR",
      creative_constraints: { creativeMode: "EVERGREEN", archetype: "EVERGREEN_PRODUCT_DEMO", hookStrategy: "RESULT_FIRST", narrativeStructure: "HOOK_DEMO_CTA", visualApproach: "CLEAN_PRODUCT_FOCUS", ctaIntent: { mechanism: "COMMENT_KEYWORD", keyword: "QUERO", keywordNormalized: "quero", purpose: "AFFILIATE_LINK_DELIVERY" } },
      beats,
      script_policy_id: scriptPolicy!.policy_id,
      script_policy_version: "v1",
      script_policy_snapshot_hash: "SCRIPT_POLICY_V1:sha256:test",
      generation_context_hash: "SCRIPT_GENERATION_CONTEXT_V1:sha256:test",
      script_hash: scriptHash,
      inference_provenance: { inferenceMode: "POLICY_ONLY" },
    })
    .select("result_id")
    .single();
  if (scriptErr || !scriptRow) throw new Error(`setupUpstream: script insert failed: ${scriptErr?.message}`);
  scriptResultId = scriptRow.result_id;

  await db.from("video_machine_frame_policy").insert({ policy_key: "frame-for-prompt", policy_version: "v1", tenant_id: TENANT_ID, allowed_reference_source_types: ["SHOPEE_OFFER_SNAPSHOT_IMAGE"], allowed_mime_types: ["image/jpeg"], output: {}, validation_policy: { requireProductPresence: true, requireReferenceBackedIdentity: true, allowLogoInference: false, allowHiddenSideCompletion: false, allowPackagingInference: false, minimumReferenceCount: 1 }, require_frame: false }).select("policy_id").single().then(async ({ data }) => {
    await db.from("video_machine_frame_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "frame-for-prompt", active_policy_id: data!.policy_id, active_policy_version: "v1" });
  });
  const frameJobId = await makeTestJob("FRAME_GENERATION", "for-prompt");
  const frameResult = await generateFrame(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionResultId, creativeDirectionHash, scriptResultId, scriptHash, framePolicyKey: "frame-for-prompt" }, { jobId: frameJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(frameResult.outcome, "SUCCEEDED");
  if (frameResult.outcome !== "SUCCEEDED") return;
  assert.equal(frameResult.resultStatus, "NO_FRAME_REQUIRED");
  const { data: frameRow } = await db.from("video_machine_frame_generation_result").select("product_visual_reference_set_id").eq("result_id", frameResult.resultId).single();
  productVisualReferenceSetId = frameRow!.product_visual_reference_set_id;
}

async function createPromptPolicyAndProfile(policyKey: string, profileKey: string, allowedModes: string[]) {
  const { data: profile } = await db
    .from("video_machine_video_provider_profile")
    .insert({ provider_profile_key: profileKey, provider_profile_version: "v1", tenant_id: TENANT_ID, provider_key: "GENERIC", model_key: "generic-text-v1", adapter_key: "GENERIC_PROMPT_TEXT_V1", adapter_version: "v1", integration_binding_id: "test-binding", integration_binding_hash: "test-binding-hash", credential_scope: "PLATFORM_MANAGED" })
    .select("provider_profile_id")
    .single();
  await db.from("video_machine_video_provider_profile_binding").upsert({ tenant_id: TENANT_ID, provider_profile_key: profileKey, active_provider_profile_id: profile!.provider_profile_id, active_provider_profile_version: "v1" });

  const { data: policy } = await db
    .from("video_machine_video_prompt_policy")
    .insert({ policy_key: policyKey, policy_version: "v1", tenant_id: TENANT_ID, allowed_generation_modes: allowedModes, require_visual_seed_when_product_visible: false, allow_camera_intent: true, allow_subject_motion_intent: true, allow_scene_motion_intent: false, provider_generated_text_policy: "ALLOW_EXACT_SCRIPT_TEXT", audio_policy: "NO_GENERATED_AUDIO", generation_constraints: null, provider_profile_key: profileKey })
    .select("policy_id")
    .single();
  await db.from("video_machine_video_prompt_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: policyKey, active_policy_id: policy!.policy_id, active_policy_version: "v1" });
}

function baseInput(policyKey: string) {
  return { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionResultId, creativeDirectionHash, scriptResultId, scriptHash, beatIndex: 0, productVisualReferenceSetId, videoPromptPolicyKey: policyKey };
}

async function testTextToVideoSuccessAndReplay() {
  await createPromptPolicyAndProfile("prompt-text-to-video", "profile-text-to-video", ["TEXT_TO_VIDEO"]);
  const jobId = await makeTestJob("VIDEO_PROMPT", "text-to-video");
  const result = await generateVideoPrompt(db, baseInput("prompt-text-to-video"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;

  const { data: row } = await db.from("video_machine_video_prompt_artifact").select("*").eq("video_prompt_artifact_id", result.resultId).single();
  assert.equal(row!.provider_instruction.generationMode, "TEXT_TO_VIDEO");
  assert.ok(row!.provider_instruction.promptText.includes("mostrar o produto"), "promptText deve conter o visualIntent do beat");
  assert.ok(!row!.provider_instruction.inputVisual, "TEXT_TO_VIDEO nunca carrega inputVisual");

  const replay = await generateVideoPrompt(db, baseInput("prompt-text-to-video"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(replay.outcome, "SUCCEEDED");
  if (replay.outcome === "SUCCEEDED") assert.equal(replay.resultId, result.resultId);

  console.log(`OK: TEXT_TO_VIDEO -> VideoPromptArtifact determinístico (hash=${row!.video_prompt_artifact_hash.slice(0, 40)}...), replay reutiliza sem recomputar.`);
}

async function testVisualSeedRequired() {
  await createPromptPolicyAndProfile("prompt-seed-required", "profile-seed-required", ["TEXT_TO_VIDEO", "IMAGE_TO_VIDEO"]);
  await db.from("video_machine_video_prompt_policy").update({ require_visual_seed_when_product_visible: true }).eq("tenant_id", TENANT_ID).eq("policy_key", "prompt-seed-required");
  const jobId = await makeTestJob("VIDEO_PROMPT", "seed-required");
  const result = await generateVideoPrompt(db, baseInput("prompt-seed-required"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.errorCode, "VIDEO_VISUAL_SEED_REQUIRED");
  const { data: rows } = await db.from("video_machine_video_prompt_artifact").select("video_prompt_artifact_id").eq("job_id", jobId);
  assert.equal(rows?.length ?? 0, 0);
  console.log("OK: policy.requireVisualSeedWhenProductVisible=true sem FrameArtifact -> BLOCKED/VIDEO_VISUAL_SEED_REQUIRED, zero artifact.");
}

async function testCreativeDirectionMismatch() {
  await createPromptPolicyAndProfile("prompt-direction-mismatch", "profile-direction-mismatch", ["TEXT_TO_VIDEO"]);
  const jobId = await makeTestJob("VIDEO_PROMPT", "direction-mismatch");
  const result = await generateVideoPrompt(db, { ...baseInput("prompt-direction-mismatch"), creativeDirectionHash: "CREATIVE_DIRECTION_V1:sha256:bogus" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "VIDEO_PROMPT_CREATIVE_DIRECTION_MISMATCH");
  console.log("OK: creativeDirectionHash divergente -> VIDEO_PROMPT_CREATIVE_DIRECTION_MISMATCH.");
}

async function testScriptMismatch() {
  await createPromptPolicyAndProfile("prompt-script-mismatch", "profile-script-mismatch", ["TEXT_TO_VIDEO"]);
  const jobId = await makeTestJob("VIDEO_PROMPT", "script-mismatch");
  const result = await generateVideoPrompt(db, { ...baseInput("prompt-script-mismatch"), scriptHash: "SCRIPT_V1:sha256:bogus" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "VIDEO_PROMPT_SCRIPT_MISMATCH");
  console.log("OK: scriptHash divergente -> VIDEO_PROMPT_SCRIPT_MISMATCH.");
}

async function testBeatNotFound() {
  await createPromptPolicyAndProfile("prompt-beat-not-found", "profile-beat-not-found", ["TEXT_TO_VIDEO"]);
  const jobId = await makeTestJob("VIDEO_PROMPT", "beat-not-found");
  const result = await generateVideoPrompt(db, { ...baseInput("prompt-beat-not-found"), beatIndex: 99 }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "VIDEO_PROMPT_BEAT_NOT_FOUND");
  console.log("OK: beatIndex inexistente -> VIDEO_PROMPT_BEAT_NOT_FOUND.");
}

async function testFrameArtifactInvariants() {
  await createPromptPolicyAndProfile("prompt-frame-invariant", "profile-frame-invariant", ["IMAGE_TO_VIDEO"]);
  const jobId = await makeTestJob("VIDEO_PROMPT", "frame-invariant");
  const result = await generateVideoPrompt(db, { ...baseInput("prompt-frame-invariant"), frameArtifactId: "00000000-0000-0000-0000-000000000000" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH");
  console.log("OK: frameArtifactId presente sem frameContentHash -> VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH (invariante de presença).");
}

async function testPolicyBindingNotFound() {
  const jobId = await makeTestJob("VIDEO_PROMPT", "policy-binding-not-found");
  const result = await generateVideoPrompt(db, baseInput("policy-key-that-does-not-exist"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "VIDEO_PROMPT_POLICY_BINDING_NOT_FOUND");
  console.log("OK: VideoPromptPolicyBinding inexistente -> VIDEO_PROMPT_POLICY_BINDING_NOT_FOUND.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  const run = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey: `skill10-${Date.now()}` });
  productionRunId = run.productionRunId;
  const { data: iteration } = await db.from("video_machine_stage_iteration").select("stage_iteration_id").eq("production_run_id", productionRunId).limit(1).single();
  stageIterationId = iteration!.stage_iteration_id;
  try {
    await setupUpstream();
    await testTextToVideoSuccessAndReplay();
    await testVisualSeedRequired();
    await testCreativeDirectionMismatch();
    await testScriptMismatch();
    await testBeatNotFound();
    await testFrameArtifactInvariants();
    await testPolicyBindingNotFound();
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
