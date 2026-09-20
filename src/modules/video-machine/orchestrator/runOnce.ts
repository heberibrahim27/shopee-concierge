import type { SupabaseClient } from "@supabase/supabase-js";
import { startEchoProductionRun } from "../kernel/run";
import { discoverProducts } from "../skills/04-descoberta-de-produtos/productDiscovery";
import { analyzeOffers } from "../skills/05-analise-de-oferta-comissao/offerAnalysis";
import { decideCreativeDirection } from "../skills/07-direcao-criativa/creativeDirection";
import { writeScript } from "../skills/08-roteirista/scriptWriting";
import { generateFrame } from "../skills/09-gerador-de-frame/frameGeneration";
import { generateVideoPrompt } from "../skills/10-gerador-de-prompt-de-video/videoPromptGeneration";

/**
 * Orquestrador pragmático "motor manual" — encadeia as Skills 04→05→
 * 07→08→09→10 pra UM produto real e entrega um pacote pronto pra fazer
 * o vídeo por fora (foto real do produto + roteiro + prompt de vídeo),
 * já que a Skill 11 (geração automática) está bloqueada até existir
 * provedor pago contratado.
 *
 * Não é o Skill 01 (orquestrador formal do SPEC — StageIteration/
 * StageExecution completos, fan-out, etc.) — é uma versão direta,
 * honesta sobre o que faz: chama cada Skill em sequência, cria um
 * Job simples por etapa (mesmo padrão usado nos scripts de teste), sem
 * a maquinaria completa de stage transition. Serve pra uso real hoje;
 * quando o Skill01 formal existir, este arquivo pode ser substituído
 * sem afetar nenhuma Skill individual.
 *
 * Frame (Skill09): chamado com requireFrame=false de propósito — não
 * existe provedor de geração de imagem (NOT_IMPLEMENTED, ver Skill09),
 * então a "foto pronta" deste pacote é a foto REAL do produto na
 * Shopee (offer_snapshots.image_url), nunca uma imagem fabricada.
 */

export const REAL_TENANT_ID = "descontos-chegando";

export type VideoMachineReadyPackage = {
  outcome: "READY";
  productionRunId: string;
  productName: string;
  productPhotoUrl: string | null;
  priceMin: number | null;
  affiliateLink: string | null;
  script: {
    hookText: string | null;
    spokenText: string | null;
    onScreenText: string | null;
    ctaText: string | null;
  };
  videoPrompt: string;
  creativeDirection: { archetype: string; hookStrategy: string; narrativeStructure: string; visualApproach: string };
  createdAt: string;
};

export type VideoMachineOutcome = VideoMachineReadyPackage | { outcome: "FATAL_ERROR" | "BLOCKED" | "RETRYABLE_ERROR"; stage: string; errorCode: string };

async function makeJob(db: SupabaseClient, tenantId: string, productionRunId: string, stageKey: string, suffix: string): Promise<string> {
  const { data, error } = await db
    .from("video_machine_job")
    .insert({
      logical_job_key: `RUN:${productionRunId}:${stageKey}:${suffix}:${Date.now()}`,
      payload_hash: "manual-engine",
      tenant_id: tenantId,
      status: "RUNNING",
      retry_policy: { maxAttempts: 3, backoff: "FIXED", eligibilityModel: "HANDLER_ADVICE_AND_EXECUTION_SAFETY" },
      payload: {},
      execution_scope: "RUN_SCOPED",
      execution_scope_ref: { executionScope: "RUN_SCOPED", productionRunId, productionRunHash: "manual", stageExecutionId: "00000000-0000-0000-0000-000000000000", stageExecutionHash: "manual" },
      production_run_id: productionRunId,
      stage_key: stageKey,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`makeJob(${stageKey}): ${error?.message}`);
  return data.id;
}

async function ensurePolicies(db: SupabaseClient, tenantId: string) {
  const upsertPolicyBinding = async (table: string, bindingTable: string, policyKey: string, row: Record<string, unknown>) => {
    const { data: existing } = await db.from(bindingTable).select("active_policy_id").eq("tenant_id", tenantId).eq("policy_key", policyKey).maybeSingle();
    if (existing) return;
    const { data: policy, error } = await db.from(table).insert({ policy_key: policyKey, policy_version: "v1", tenant_id: tenantId, ...row }).select("policy_id").single();
    if (error || !policy) throw new Error(`ensurePolicies(${table}): ${error?.message}`);
    await db.from(bindingTable).upsert({ tenant_id: tenantId, policy_key: policyKey, active_policy_id: policy.policy_id, active_policy_version: "v1" });
  };

  await upsertPolicyBinding("video_machine_product_selection_policy", "video_machine_product_selection_policy_binding", "engine-default", {
    reuse_policy: "ALLOW",
    minimum_usage_evidence_kind: "MATERIALIZED",
    max_snapshot_age_seconds: 60 * 60 * 24 * 365,
    eligible_source_statuses: ["discovered"],
    ranking_weights: { discoveryCommercial: 100 },
  });

  await upsertPolicyBinding("video_machine_offer_analysis_policy", "video_machine_offer_analysis_policy_binding", "engine-default", {
    max_snapshot_age_seconds: 60 * 60 * 24 * 365,
    ranking_weights: { commissionRate: 60, commissionValue: 40 },
    calibration_refs: {},
  });

  await upsertPolicyBinding("video_machine_creative_direction_policy", "video_machine_creative_direction_policy_binding", "engine-default", {
    allowed_modes: ["EVERGREEN"],
    allowed_archetypes: ["EVERGREEN_PRODUCT_DEMO"],
    allowed_hook_strategies: ["RESULT_FIRST"],
    allowed_narrative_structures: ["HOOK_DEMO_CTA"],
    allowed_visual_approaches: ["CLEAN_PRODUCT_FOCUS"],
    allowed_cta_mechanisms: ["COMMENT_KEYWORD"],
    comment_keyword: "QUERO",
    default_locale: "pt-BR",
  });

  await upsertPolicyBinding("video_machine_script_policy", "video_machine_script_policy_binding", "engine-default", {
    locale: "pt-BR",
    allowed_beat_purposes: ["HOOK"],
    max_beat_count: 1,
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
  });

  await upsertPolicyBinding("video_machine_frame_policy", "video_machine_frame_policy_binding", "engine-default", {
    allowed_reference_source_types: ["SHOPEE_OFFER_SNAPSHOT_IMAGE"],
    allowed_mime_types: ["image/jpeg", "image/png"],
    output: {},
    validation_policy: { requireProductPresence: true, requireReferenceBackedIdentity: true, allowLogoInference: false, allowHiddenSideCompletion: false, allowPackagingInference: false, minimumReferenceCount: 1 },
    require_frame: false, // sem provedor de imagem — a "foto pronta" vem direto da Shopee, não gerada por IA
  });

  const { data: existingProfile } = await db.from("video_machine_video_provider_profile_binding").select("active_provider_profile_id").eq("tenant_id", tenantId).eq("provider_profile_key", "engine-generic").maybeSingle();
  if (!existingProfile) {
    const { data: profile, error } = await db
      .from("video_machine_video_provider_profile")
      .insert({ provider_profile_key: "engine-generic", provider_profile_version: "v1", tenant_id: tenantId, provider_key: "GENERIC", model_key: "generic-text-v1", adapter_key: "GENERIC_PROMPT_TEXT_V1", adapter_version: "v1", integration_binding_id: "n/a", integration_binding_hash: "n/a", credential_scope: "PLATFORM_MANAGED" })
      .select("provider_profile_id")
      .single();
    if (error || !profile) throw new Error(`ensurePolicies(provider_profile): ${error?.message}`);
    await db.from("video_machine_video_provider_profile_binding").upsert({ tenant_id: tenantId, provider_profile_key: "engine-generic", active_provider_profile_id: profile.provider_profile_id, active_provider_profile_version: "v1" });
  }

  await upsertPolicyBinding("video_machine_video_prompt_policy", "video_machine_video_prompt_policy_binding", "engine-default", {
    allowed_generation_modes: ["TEXT_TO_VIDEO"],
    require_visual_seed_when_product_visible: false,
    allow_camera_intent: true,
    allow_subject_motion_intent: true,
    allow_scene_motion_intent: false,
    provider_generated_text_policy: "ALLOW_EXACT_SCRIPT_TEXT",
    audio_policy: "NO_GENERATED_AUDIO",
    generation_constraints: null,
    provider_profile_key: "engine-generic",
  });
}

export async function runVideoMachineOnce(db: SupabaseClient, tenantId: string = REAL_TENANT_ID): Promise<VideoMachineOutcome> {
  await db.from("video_machine_tenant_config").upsert({ tenant_id: tenantId, tenant_key: tenantId, status: "ACTIVE", display_name: "Descontos Chegando" });
  await ensurePolicies(db, tenantId);

  const run = await startEchoProductionRun(db, { tenantId, runKey: `engine-${Date.now()}` });
  const productionRunId = run.productionRunId;
  const { data: iteration } = await db.from("video_machine_stage_iteration").select("stage_iteration_id").eq("production_run_id", productionRunId).limit(1).single();
  const stageIterationId = iteration!.stage_iteration_id;

  const discJobId = await makeJob(db, tenantId, productionRunId, "PRODUCT_DISCOVERY", "engine");
  const disc = await discoverProducts(db, { tenantId, runId: productionRunId, requestedCount: 1, alternateCount: 0, selectionPolicyKey: "engine-default" }, { jobId: discJobId, attemptNumber: 1, trustedTenantId: tenantId });
  if (disc.outcome !== "SUCCEEDED") return { outcome: disc.outcome === "FATAL_ERROR" ? "FATAL_ERROR" : "RETRYABLE_ERROR", stage: "discovery", errorCode: (disc as any).errorCode };

  const offerJobId = await makeJob(db, tenantId, productionRunId, "OFFER_ANALYSIS", "engine");
  const offer = await analyzeOffers(db, { tenantId, runId: productionRunId, discoveryResultId: disc.resultId, offerAnalysisPolicyKey: "engine-default" }, { jobId: offerJobId, attemptNumber: 1, trustedTenantId: tenantId });
  if (offer.outcome !== "SUCCEEDED" || !["OK", "PARTIAL"].includes(offer.resultStatus)) {
    const errorCode = offer.outcome === "SUCCEEDED" ? offer.resultStatus : offer.errorCode;
    return { outcome: offer.outcome === "FATAL_ERROR" ? "FATAL_ERROR" : "RETRYABLE_ERROR", stage: "offer_analysis", errorCode };
  }

  const { data: offerRow } = await db.from("video_machine_offer_analysis_result").select("primary_candidates").eq("result_id", offer.resultId).single();
  const candidate = offerRow!.primary_candidates[0];
  if (!candidate) return { outcome: "BLOCKED", stage: "offer_analysis", errorCode: "NO_CANDIDATE" };

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_stage_subject_binding")
    .insert({ run_id: productionRunId, stage_key: "CREATIVE_DIRECTION", stage_iteration_id: stageIterationId, stage_iteration_hash: "manual", stage_work_unit_identity_hash: `manual-${candidate.productId}`, subject_type: "PRODUCT", subject_id: candidate.productId, source_result_id: offer.resultId, source_position: candidate.finalPosition })
    .select("stage_subject_binding_id")
    .single();
  if (bindingErr || !binding) return { outcome: "FATAL_ERROR", stage: "subject_binding", errorCode: bindingErr?.message ?? "BINDING_FAILED" };

  const creativeJobId = await makeJob(db, tenantId, productionRunId, "CREATIVE_DIRECTION", "engine");
  const creative = await decideCreativeDirection(db, { tenantId, runId: productionRunId, stageSubjectBindingId: binding.stage_subject_binding_id, creativeDirectionPolicyKey: "engine-default" }, { jobId: creativeJobId, attemptNumber: 1, trustedTenantId: tenantId });
  if (creative.outcome !== "SUCCEEDED" || creative.resultStatus !== "OK") {
    const errorCode = creative.outcome === "SUCCEEDED" ? creative.resultStatus : creative.errorCode;
    return { outcome: creative.outcome === "FATAL_ERROR" ? "FATAL_ERROR" : "RETRYABLE_ERROR", stage: "creative_direction", errorCode };
  }
  const { data: creativeRow } = await db.from("video_machine_creative_direction_result").select("*").eq("result_id", creative.resultId).single();

  const scriptJobId = await makeJob(db, tenantId, productionRunId, "SCRIPT_GENERATION", "engine");
  const script = await writeScript(db, { tenantId, runId: productionRunId, creativeDirectionResultId: creative.resultId, creativeDirectionHash: creativeRow!.creative_direction_hash, scriptPolicyKey: "engine-default" }, { jobId: scriptJobId, attemptNumber: 1, trustedTenantId: tenantId });
  if (script.outcome !== "SUCCEEDED") return { outcome: script.outcome, stage: "script", errorCode: (script as any).errorCode };
  const { data: scriptRow } = await db.from("video_machine_script_result").select("*").eq("result_id", script.resultId).single();

  const frameJobId = await makeJob(db, tenantId, productionRunId, "FRAME_GENERATION", "engine");
  const frame = await generateFrame(db, { tenantId, runId: productionRunId, stageSubjectBindingId: binding.stage_subject_binding_id, creativeDirectionResultId: creative.resultId, creativeDirectionHash: creativeRow!.creative_direction_hash, scriptResultId: script.resultId, scriptHash: scriptRow!.script_hash, framePolicyKey: "engine-default" }, { jobId: frameJobId, attemptNumber: 1, trustedTenantId: tenantId });
  if (frame.outcome !== "SUCCEEDED") return { outcome: frame.outcome, stage: "frame", errorCode: (frame as any).errorCode };
  const { data: frameRow } = await db.from("video_machine_frame_generation_result").select("product_visual_reference_set_id").eq("result_id", frame.resultId).single();

  const promptJobId = await makeJob(db, tenantId, productionRunId, "VIDEO_PROMPT", "engine");
  const beats: any[] = scriptRow!.beats;
  const prompt = await generateVideoPrompt(
    db,
    { tenantId, runId: productionRunId, stageSubjectBindingId: binding.stage_subject_binding_id, creativeDirectionResultId: creative.resultId, creativeDirectionHash: creativeRow!.creative_direction_hash, scriptResultId: script.resultId, scriptHash: scriptRow!.script_hash, beatIndex: beats[0].beatIndex, productVisualReferenceSetId: frameRow!.product_visual_reference_set_id, videoPromptPolicyKey: "engine-default" },
    { jobId: promptJobId, attemptNumber: 1, trustedTenantId: tenantId }
  );
  if (prompt.outcome !== "SUCCEEDED") return { outcome: prompt.outcome, stage: "video_prompt", errorCode: (prompt as any).errorCode ?? (prompt as any).blockReason };
  const { data: promptRow } = await db.from("video_machine_video_prompt_artifact").select("provider_instruction").eq("video_prompt_artifact_id", prompt.resultId).single();

  const { data: product } = await db.from("products").select("product_name").eq("id", candidate.productId).maybeSingle();
  const { data: snapshot } = await db.from("offer_snapshots").select("image_url, price_min").eq("id", candidate.sourceOfferSnapshotId).maybeSingle();

  const beat = beats[0];
  return {
    outcome: "READY",
    productionRunId,
    productName: product?.product_name ?? candidate.productId,
    productPhotoUrl: snapshot?.image_url ?? null,
    priceMin: snapshot?.price_min ?? null,
    affiliateLink: null, // gerado pela Skill 15 (não implementada — link rastreável não existe pra vídeo ainda); usar o mecanismo real de afiliado já existente pro produto manualmente por enquanto
    script: {
      hookText: beat.purpose === "HOOK" ? (beat.spokenText?.text ?? beat.onScreenText?.text ?? null) : null,
      spokenText: beat.spokenText?.text ?? null,
      onScreenText: beat.onScreenText?.text ?? null,
      ctaText: beat.spokenText?.kind === "CTA" ? beat.spokenText.text : beat.onScreenText?.kind === "CTA" ? beat.onScreenText.text : null,
    },
    videoPrompt: (promptRow!.provider_instruction as any).promptText,
    creativeDirection: { archetype: creativeRow!.direction.archetype, hookStrategy: creativeRow!.direction.hookStrategy, narrativeStructure: creativeRow!.direction.narrativeStructure, visualApproach: creativeRow!.direction.visualApproach },
    createdAt: new Date().toISOString(),
  };
}
