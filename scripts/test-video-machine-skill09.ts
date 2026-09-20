/**
 * Verificação da Skill 09 (Gerador de Frame) contra o Supabase real,
 * encadeada com Skill04->05->StageSubjectBinding->07(POLICY_ONLY)->
 * 08(SCRIPT_PROVIDER_NOT_CONFIGURED evitado via policy sem beat que
 * precise de FACTUAL_CLAIM real — usamos maxBeatCount igual ao 08, mas
 * aqui não dependemos do ScriptResult ter sido gerado por IA: como
 * OPENAI_API_KEY ainda está ausente, testamos Skill09 usando um
 * ScriptResult inserido diretamente (mesma forma que o Skill08 real
 * produziria), já que a Skill09 só consome o ScriptResult existente —
 * não é responsabilidade dela como ele foi gerado.
 *
 * ImageGenerationProvider = NOT_IMPLEMENTED hoje (confirmado pelo
 * próprio SPEC.md da Skill09) — então o único branch OK nunca é
 * alcançável nesta fase; os testes cobrem os dois branches de domínio
 * reais (NO_FRAME_REQUIRED via policy, REFERENCE_UNAVAILABLE) e o
 * FATAL_ERROR correto quando uma referência real existiria
 * (FRAME_PROVIDER_CAPABILITY_UNSUPPORTED) — usando um offer_snapshot
 * real com image_url populada (1048/1048 snapshots reais têm imagem).
 *
 * Uso: npx tsx scripts/test-video-machine-skill09.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { discoverProducts } from "../src/modules/video-machine/skills/04-descoberta-de-produtos/productDiscovery";
import { analyzeOffers } from "../src/modules/video-machine/skills/05-analise-de-oferta-comissao/offerAnalysis";
import { decideCreativeDirection } from "../src/modules/video-machine/skills/07-direcao-criativa/creativeDirection";
import { generateFrame } from "../src/modules/video-machine/skills/09-gerador-de-frame/frameGeneration";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

let productionRunId = "";
let stageIterationId = "";
let stageSubjectBindingId = "";
let creativeDirectionResultId = "";
let creativeDirectionHash = "";
let scriptResultId = "";
let scriptHash = "";
let realOfferSnapshotId = "";

async function cleanup() {
  await db.from("video_machine_frame_generation_result").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_frame_artifact").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_frame_generation_checkpoint").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_frame_requirement").delete().eq("tenant_id", TENANT_ID);
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
    .insert({
      policy_key: "discovery-for-frame",
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
  await db.from("video_machine_product_selection_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "discovery-for-frame", active_policy_id: discPolicy!.policy_id, active_policy_version: "v1" });
  const discJobId = await makeTestJob("PRODUCT_DISCOVERY", "for-frame");
  const discResult = await discoverProducts(db, { tenantId: TENANT_ID, runId: productionRunId, requestedCount: 3, alternateCount: 0, selectionPolicyKey: "discovery-for-frame" }, { jobId: discJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(discResult.outcome, "SUCCEEDED");
  const discoveryResultId = discResult.outcome === "SUCCEEDED" ? discResult.resultId : "";

  const { data: offerPolicy } = await db
    .from("video_machine_offer_analysis_policy")
    .insert({ policy_key: "offer-for-frame", policy_version: "v1", tenant_id: TENANT_ID, max_snapshot_age_seconds: 60 * 60 * 24 * 365, ranking_weights: { commissionRate: 100 }, calibration_refs: {} })
    .select("policy_id")
    .single();
  await db.from("video_machine_offer_analysis_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "offer-for-frame", active_policy_id: offerPolicy!.policy_id, active_policy_version: "v1" });
  const offerJobId = await makeTestJob("OFFER_ANALYSIS", "for-frame");
  const offerResult = await analyzeOffers(db, { tenantId: TENANT_ID, runId: productionRunId, discoveryResultId, offerAnalysisPolicyKey: "offer-for-frame" }, { jobId: offerJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(offerResult.outcome, "SUCCEEDED");
  const offerResultId = offerResult.outcome === "SUCCEEDED" ? offerResult.resultId : "";

  const { data: offerRow } = await db.from("video_machine_offer_analysis_result").select("primary_candidates").eq("result_id", offerResultId).single();
  const topCandidate = offerRow!.primary_candidates[0];
  realOfferSnapshotId = topCandidate.sourceOfferSnapshotId;

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_stage_subject_binding")
    .insert({
      run_id: productionRunId,
      stage_key: "FRAME_GENERATION",
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
      policy_key: "creative-for-frame",
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
  await db.from("video_machine_creative_direction_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: "creative-for-frame", active_policy_id: creativePolicy!.policy_id, active_policy_version: "v1" });

  const creativeJobId = await makeTestJob("CREATIVE_DIRECTION", "for-frame");
  const creativeResult = await decideCreativeDirection(db, { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionPolicyKey: "creative-for-frame" }, { jobId: creativeJobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(creativeResult.outcome, "SUCCEEDED");
  if (creativeResult.outcome !== "SUCCEEDED") return;
  creativeDirectionResultId = creativeResult.resultId;

  const { data: directionRow } = await db.from("video_machine_creative_direction_result").select("creative_direction_hash").eq("result_id", creativeDirectionResultId).single();
  creativeDirectionHash = directionRow!.creative_direction_hash;

  // ScriptResult inserido diretamente (mesma forma que writeScript produziria)
  // — OPENAI_API_KEY ainda ausente localmente, e a Skill09 só consome um
  // ScriptResult já materializado, nunca decide como ele foi gerado.
  const { data: scriptPolicy } = await db
    .from("video_machine_script_policy")
    .insert({
      policy_key: "script-for-frame",
      policy_version: "v1",
      tenant_id: TENANT_ID,
      locale: "pt-BR",
      allowed_beat_purposes: ["HOOK"],
      max_beat_count: 1,
      allow_spoken_text: true,
      allow_on_screen_text: true,
      require_hook: true,
      require_cta: false,
      factual_claim_rules: { requireCanonicalBasis: true, allowProductAttributeClaims: true, allowCurrentPriceClaims: true, allowAdvertisedDiscountClaims: true, allowSalesVolumeClaims: true, allowRatingClaims: true, allowTrendClaims: true, allowScarcityClaims: false, allowSuperlativeClaims: false, allowComparativeClaims: false, allowMedicalOrTherapeuticClaims: false },
    })
    .select("policy_id")
    .single();
  const beats = [{ beatIndex: 0, purpose: "HOOK", spokenText: { statementId: "s0", kind: "CREATIVE_EXPRESSION", text: "Olha que massageador incrível." }, visualIntent: { text: "mostrar o produto sendo usado no pescoço em ambiente doméstico" } }];
  scriptHash = `SCRIPT_V1:sha256:testhash-${Date.now()}`;
  const { data: scriptRow, error: scriptErr } = await db
    .from("video_machine_script_result")
    .insert({
      tenant_id: TENANT_ID,
      run_id: productionRunId,
      job_id: creativeJobId, // reaproveita um jobId de teste só pra satisfazer a FK; não representa a Job real da Skill08
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
}

async function createFramePolicy(key: string, requireFrame: boolean) {
  const { data: policy, error } = await db
    .from("video_machine_frame_policy")
    .insert({
      policy_key: key,
      policy_version: "v1",
      tenant_id: TENANT_ID,
      allowed_reference_source_types: ["SHOPEE_OFFER_SNAPSHOT_IMAGE"],
      allowed_mime_types: ["image/jpeg", "image/png"],
      output: { aspectRatio: "9:16" },
      validation_policy: { requireProductPresence: true, requireReferenceBackedIdentity: true, allowLogoInference: false, allowHiddenSideCompletion: false, allowPackagingInference: false, minimumReferenceCount: 1 },
      require_frame: requireFrame,
    })
    .select("policy_id")
    .single();
  if (error || !policy) throw new Error(`createFramePolicy: ${error?.message}`);
  await db.from("video_machine_frame_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: key, active_policy_id: policy.policy_id, active_policy_version: "v1" });
}

function baseInput(framePolicyKey: string) {
  return { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionResultId, creativeDirectionHash, scriptResultId, scriptHash, framePolicyKey };
}

async function testNoFrameRequired() {
  await createFramePolicy("frame-no-frame-required", false);
  const jobId = await makeTestJob("FRAME_GENERATION", "no-frame-required");
  const result = await generateFrame(db, baseInput("frame-no-frame-required"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;
  assert.equal(result.resultStatus, "NO_FRAME_REQUIRED");

  const { data: row } = await db.from("video_machine_frame_generation_result").select("*, product_visual_reference_set_id").eq("result_id", result.resultId).single();
  assert.equal(row!.frame_requirement_count, 0);
  const { data: refSet } = await db.from("video_machine_product_visual_reference_set").select("content").eq("product_visual_reference_set_id", row!.product_visual_reference_set_id).single();
  assert.equal(refSet!.content.kind, "EMPTY");
  assert.equal(refSet!.content.emptyReason, "NO_FRAME_REQUIRED");
  console.log("OK: policy.requireFrame=false -> NO_FRAME_REQUIRED, ProductVisualReferenceSet EMPTY/NO_FRAME_REQUIRED materializado.");
}

async function testReferenceUnavailable() {
  // stageSubjectBindingId aponta pro subject real, mas a
  // CreativeDirectionResult usada aqui referencia um offer_analysis com
  // sourceOfferSnapshotId inexistente -> nenhuma referência utilizável.
  // Simulação real: criamos uma nova CreativeDirectionResult "solta" com
  // subject_ref.sourceOfferSnapshotId aleatório.
  await createFramePolicy("frame-reference-unavailable", true);
  const jobId = await makeTestJob("FRAME_GENERATION", "reference-unavailable");

  const fakeSubjectRef = { productId: "test-product", dealCandidateId: "test-deal", sourceOfferSnapshotId: "00000000-0000-0000-0000-000000000000", offerAnalysisResultId: "00000000-0000-0000-0000-000000000000", sourcePosition: 1 };
  const { data: fakeDirection, error: fakeDirErr } = await db
    .from("video_machine_creative_direction_result")
    .insert({
      tenant_id: TENANT_ID,
      run_id: productionRunId,
      job_id: jobId,
      attempt_number: 1,
      stage_subject_binding_id: stageSubjectBindingId,
      subject_ref: fakeSubjectRef,
      offer_analysis_result_id: "00000000-0000-0000-0000-000000000000",
      result_status: "OK",
      creative_mode: "EVERGREEN",
      direction: { archetype: "EVERGREEN_PRODUCT_DEMO", hookStrategy: "RESULT_FIRST", narrativeStructure: "HOOK_DEMO_CTA", visualApproach: "CLEAN_PRODUCT_FOCUS", ctaIntent: { mechanism: "COMMENT_KEYWORD", keyword: "QUERO", keywordNormalized: "quero", purpose: "AFFILIATE_LINK_DELIVERY" } },
      decisions: [],
      trend_evidence_refs_used: [],
      creative_direction_policy_id: (await db.from("video_machine_creative_direction_policy").select("policy_id").eq("tenant_id", TENANT_ID).eq("policy_key", "creative-for-frame").single()).data!.policy_id,
      creative_direction_policy_version: "v1",
      creative_direction_policy_snapshot_hash: "CREATIVE_DIRECTION_POLICY_V1:sha256:test",
      creative_direction_hash: `CREATIVE_DIRECTION_V1:sha256:fake-${Date.now()}`,
      inference_provenance: { inferenceMode: "POLICY_ONLY" },
    })
    .select("result_id, creative_direction_hash")
    .single();
  if (fakeDirErr || !fakeDirection) throw new Error(`testReferenceUnavailable: ${fakeDirErr?.message}`);

  const { data: fakeScript, error: fakeScriptErr } = await db
    .from("video_machine_script_result")
    .insert({
      tenant_id: TENANT_ID,
      run_id: productionRunId,
      job_id: jobId,
      attempt_number: 1,
      creative_direction_result_id: fakeDirection.result_id,
      creative_direction_hash: fakeDirection.creative_direction_hash,
      locale: "pt-BR",
      creative_constraints: { creativeMode: "EVERGREEN", archetype: "EVERGREEN_PRODUCT_DEMO", hookStrategy: "RESULT_FIRST", narrativeStructure: "HOOK_DEMO_CTA", visualApproach: "CLEAN_PRODUCT_FOCUS", ctaIntent: { mechanism: "COMMENT_KEYWORD", keyword: "QUERO", keywordNormalized: "quero", purpose: "AFFILIATE_LINK_DELIVERY" } },
      beats: [{ beatIndex: 0, purpose: "HOOK", visualIntent: { text: "mostrar o produto" } }],
      script_policy_id: (await db.from("video_machine_script_policy").select("policy_id").eq("tenant_id", TENANT_ID).eq("policy_key", "script-for-frame").single()).data!.policy_id,
      script_policy_version: "v1",
      script_policy_snapshot_hash: "SCRIPT_POLICY_V1:sha256:test",
      generation_context_hash: "SCRIPT_GENERATION_CONTEXT_V1:sha256:test",
      script_hash: `SCRIPT_V1:sha256:fake-${Date.now()}`,
      inference_provenance: { inferenceMode: "POLICY_ONLY" },
    })
    .select("result_id, script_hash")
    .single();
  if (fakeScriptErr || !fakeScript) throw new Error(`testReferenceUnavailable: ${fakeScriptErr?.message}`);

  const result = await generateFrame(
    db,
    { tenantId: TENANT_ID, runId: productionRunId, stageSubjectBindingId, creativeDirectionResultId: fakeDirection.result_id, creativeDirectionHash: fakeDirection.creative_direction_hash, scriptResultId: fakeScript.result_id, scriptHash: fakeScript.script_hash, framePolicyKey: "frame-reference-unavailable" },
    { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID }
  );
  assert.equal(result.outcome, "SUCCEEDED");
  if (result.outcome !== "SUCCEEDED") return;
  assert.equal(result.resultStatus, "REFERENCE_UNAVAILABLE");

  const { data: row } = await db.from("video_machine_frame_generation_result").select("*, product_visual_reference_set_id").eq("result_id", result.resultId).single();
  assert.equal(row!.frame_requirement_count, 1);
  const { data: refSet } = await db.from("video_machine_product_visual_reference_set").select("content").eq("product_visual_reference_set_id", row!.product_visual_reference_set_id).single();
  assert.equal(refSet!.content.kind, "EMPTY");
  assert.equal(refSet!.content.emptyReason, "REFERENCE_UNAVAILABLE");
  console.log("OK: sourceOfferSnapshotId sem referência utilizável -> REFERENCE_UNAVAILABLE, FrameRequirement materializado mesmo sem frame gerado.");
}

async function testProviderCapabilityUnsupported() {
  assert.ok(realOfferSnapshotId, "precisa de um sourceOfferSnapshotId real com image_url populada");
  await createFramePolicy("frame-provider-unsupported", true);
  const jobId = await makeTestJob("FRAME_GENERATION", "provider-unsupported");
  const result = await generateFrame(db, baseInput("frame-provider-unsupported"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "FRAME_PROVIDER_CAPABILITY_UNSUPPORTED");

  const { data: rows } = await db.from("video_machine_frame_generation_result").select("result_id").eq("job_id", jobId);
  assert.equal(rows?.length ?? 0, 0, "FRAME_PROVIDER_CAPABILITY_UNSUPPORTED nunca materializa FrameGenerationResult");
  console.log(`OK: referência real POPULATED (offer_snapshot=${realOfferSnapshotId}) + ImageGenerationProvider NOT_IMPLEMENTED -> FRAME_PROVIDER_CAPABILITY_UNSUPPORTED, zero FrameGenerationResult fabricado.`);
}

async function testCreativeDirectionMismatch() {
  await createFramePolicy("frame-direction-mismatch", true);
  const jobId = await makeTestJob("FRAME_GENERATION", "direction-mismatch");
  const result = await generateFrame(db, { ...baseInput("frame-direction-mismatch"), creativeDirectionHash: "CREATIVE_DIRECTION_V1:sha256:bogus" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "FRAME_CREATIVE_DIRECTION_MISMATCH");
  console.log("OK: creativeDirectionHash divergente -> FRAME_CREATIVE_DIRECTION_MISMATCH.");
}

async function testScriptResultMismatch() {
  await createFramePolicy("frame-script-mismatch", true);
  const jobId = await makeTestJob("FRAME_GENERATION", "script-mismatch");
  const result = await generateFrame(db, { ...baseInput("frame-script-mismatch"), scriptHash: "SCRIPT_V1:sha256:bogus" }, { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "FRAME_SCRIPT_RESULT_MISMATCH");
  console.log("OK: scriptHash divergente -> FRAME_SCRIPT_RESULT_MISMATCH.");
}

async function testPolicyBindingNotFound() {
  const jobId = await makeTestJob("FRAME_GENERATION", "policy-binding-not-found");
  const result = await generateFrame(db, baseInput("policy-key-that-does-not-exist"), { jobId, attemptNumber: 1, trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "FRAME_POLICY_BINDING_NOT_FOUND");
  console.log("OK: FramePolicyBinding inexistente -> FRAME_POLICY_BINDING_NOT_FOUND.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  const run = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey: `skill09-${Date.now()}` });
  productionRunId = run.productionRunId;
  const { data: iteration } = await db.from("video_machine_stage_iteration").select("stage_iteration_id").eq("production_run_id", productionRunId).limit(1).single();
  stageIterationId = iteration!.stage_iteration_id;
  try {
    await setupUpstream();
    await testNoFrameRequired();
    await testReferenceUnavailable();
    await testProviderCapabilityUnsupported();
    await testCreativeDirectionMismatch();
    await testScriptResultMismatch();
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
