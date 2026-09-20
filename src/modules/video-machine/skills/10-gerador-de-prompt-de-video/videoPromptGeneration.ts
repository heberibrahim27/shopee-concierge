import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 10 — Gerador de Prompt de Vídeo. Fonte normativa: SPEC.md neste
 * mesmo diretório. Diferente das Skills 07/08/09, é pura/determinística
 * e sem side effect externo — sem checkpoint/state machine.
 *
 * ProviderPromptAdapter é código, não IA (regra central do SPEC). Único
 * adapter implementado nesta fase: GENERIC_PROMPT_TEXT_V1 — template
 * determinístico que expressa o VideoGenerationIntent como prompt de
 * texto livre com todos os generation parameters embutidos como
 * PROMPT_TEXT (nenhum provider real auditado tem campo estruturado
 * conhecido ainda). VideoGenerationProvider (execução real / Veo)
 * continua NOT_IMPLEMENTED — isso é Skill 11.
 */

export type VideoPromptInput = {
  tenantId: string;
  runId: string;
  stageSubjectBindingId: string;
  creativeDirectionResultId: string;
  creativeDirectionHash: string;
  scriptResultId: string;
  scriptHash: string;
  beatIndex: number;
  frameRequirementId?: string;
  frameRequirementHash?: string;
  frameArtifactId?: string;
  frameContentHash?: string;
  // Necessário mesmo sem frame (invariante productIdentityConstraints do
  // SPEC exige productVisualReferenceSetRef sempre) — não listado
  // explicitamente no bloco TS de VideoPromptInput do SPEC.md, mas é a
  // única forma real de cumprir esse invariante quando não há
  // FrameArtifact: o chamador (Skill01/teste) passa o set que a Skill09
  // já materializou pra este subject/execução.
  productVisualReferenceSetId: string;
  videoPromptPolicyKey: string;
};

export type VideoPromptJobContext = { jobId: string; attemptNumber: number; trustedTenantId: string };

export type VideoPromptOutcome =
  | { outcome: "SUCCEEDED"; resultId: string }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string }
  | { outcome: "BLOCKED"; blockReason: "POLICY_BLOCKED"; errorCode: "VIDEO_VISUAL_SEED_REQUIRED" };

const GENERIC_ADAPTER_KEY = "GENERIC_PROMPT_TEXT_V1";
const GENERIC_ADAPTER_VERSION = "v1";
const GENERIC_ADAPTER_CAPABILITIES = {
  adapterKey: GENERIC_ADAPTER_KEY,
  adapterVersion: GENERIC_ADAPTER_VERSION,
  supportedModelKeys: ["*"],
  supportedGenerationModes: ["IMAGE_TO_VIDEO", "TEXT_TO_VIDEO"] as const,
  supportsImageInput: true,
  parameterTransport: { duration: "PROMPT_TEXT", aspectRatio: "PROMPT_TEXT", resolution: "PROMPT_TEXT", seed: "PROMPT_TEXT", audio: "PROMPT_TEXT" } as const,
};

// Padrão fixo de legenda — aplicado em TODO prompt gerado, pra ficar
// consistente entre vídeos mesmo quando quem opera a ferramenta externa
// é uma pessoa diferente. Ajustar aqui muda o padrão de todos os
// próximos prompts de uma vez só.
const ON_SCREEN_TEXT_STYLE = "fonte bold arredondada (ex.: Poppins Bold/Montserrat Bold), branca com contorno preto grosso, alinhada ao centro, no terço inferior do quadro";

function renderGenericPrompt(intent: any, generationParameters: any): { promptText: string; negativePromptText?: string } {
  const parts: string[] = [];
  parts.push(intent.scene.visualIntent);
  if (intent.cinematicIntent.cameraIntent) parts.push(`Câmera: ${intent.cinematicIntent.cameraIntent}`);
  if (intent.cinematicIntent.subjectMotionIntent) parts.push(`Movimento do sujeito: ${intent.cinematicIntent.subjectMotionIntent}`);
  if (intent.cinematicIntent.sceneMotionIntent) parts.push(`Movimento de cena: ${intent.cinematicIntent.sceneMotionIntent}`);
  if (intent.textualConstraints.providerGeneratedTextPolicy === "ALLOW_EXACT_SCRIPT_TEXT") {
    if (intent.scene.onScreenText) parts.push(`Texto na tela (exato, digite literalmente este texto — NÃO gere legenda automática por reconhecimento de áudio, isso causa palavras duplicadas/erradas): "${intent.scene.onScreenText}". Estilo do texto: ${ON_SCREEN_TEXT_STYLE}.`);
    if (intent.scene.spokenText) parts.push(`Fala (exata): "${intent.scene.spokenText}"`);
  }
  if (intent.productIdentityConstraints?.preserveProductIdentity) {
    parts.push(
      "Fidelidade do produto (obrigatório): manter EXATAMENTE a aparência do produto mostrado na foto de referência — mesma cor, formato, botões, textura e componentes visíveis. NUNCA inventar peça, mecanismo ou compartimento interno que não apareça na foto de referência. Se o ângulo/ação pedido exigiria mostrar uma parte do produto não visível na foto, prefira reenquadrar ou evitar esse ângulo em vez de imaginar o que tem lá dentro."
    );
  }
  if (generationParameters.durationSeconds) parts.push(`Duração: ${generationParameters.durationSeconds}s`);
  if (generationParameters.aspectRatio) parts.push(`Proporção: ${generationParameters.aspectRatio}`);
  if (generationParameters.audioMode) parts.push(`Áudio: ${generationParameters.audioMode}`);
  return { promptText: parts.join(". ") };
}

export async function generateVideoPrompt(db: SupabaseClient, input: VideoPromptInput, jobContext: VideoPromptJobContext): Promise<VideoPromptOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_TENANT_MISMATCH" };

  const { data: existing, error: existingErr } = await db
    .from("video_machine_video_prompt_artifact")
    .select("video_prompt_artifact_id")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();
  if (existingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (existing) return { outcome: "SUCCEEDED", resultId: existing.video_prompt_artifact_id };

  const { data: direction, error: directionErr } = await db.from("video_machine_creative_direction_result").select("*").eq("result_id", input.creativeDirectionResultId).maybeSingle();
  if (directionErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!direction) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_CREATIVE_DIRECTION_NOT_FOUND" };
  if (direction.tenant_id !== jobContext.trustedTenantId || direction.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_TENANT_MISMATCH" };
  if (direction.result_status !== "OK") return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_CREATIVE_DIRECTION_MISMATCH" };
  if (direction.creative_direction_hash !== input.creativeDirectionHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_CREATIVE_DIRECTION_MISMATCH" };

  const { data: script, error: scriptErr } = await db.from("video_machine_script_result").select("*").eq("result_id", input.scriptResultId).maybeSingle();
  if (scriptErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!script) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_SCRIPT_NOT_FOUND" };
  if (script.tenant_id !== jobContext.trustedTenantId || script.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_TENANT_MISMATCH" };
  if (script.script_hash !== input.scriptHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_SCRIPT_MISMATCH" };
  if (script.creative_direction_result_id !== input.creativeDirectionResultId || script.creative_direction_hash !== input.creativeDirectionHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_SCRIPT_MISMATCH" };

  const beat = (script.beats as any[]).find((b) => b.beatIndex === input.beatIndex);
  if (!beat) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_BEAT_NOT_FOUND" };

  const { data: binding, error: bindingErr } = await db.from("video_machine_stage_subject_binding").select("*").eq("stage_subject_binding_id", input.stageSubjectBindingId).maybeSingle();
  if (bindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!binding || binding.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_TENANT_MISMATCH" };

  // Invariantes de presença de frame (SPEC.md — testes 7/8).
  const hasFrame = !!input.frameArtifactId;
  if (hasFrame && !input.frameContentHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH" };
  if (hasFrame && (!input.frameRequirementId || !input.frameRequirementHash)) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_REQUIREMENT_MISMATCH" };

  let frameArtifact: any = null;
  if (hasFrame) {
    const { data: fa, error: faErr } = await db.from("video_machine_frame_artifact").select("*").eq("frame_artifact_id", input.frameArtifactId).maybeSingle();
    if (faErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_STORAGE_METADATA_READ_ERROR" };
    if (!fa) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_ARTIFACT_NOT_FOUND" };
    if (fa.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_TENANT_MISMATCH" };
    if (fa.script_result_id !== input.scriptResultId || fa.script_hash !== input.scriptHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH" };
    if (fa.frame_requirement_id !== input.frameRequirementId || fa.frame_requirement_hash !== input.frameRequirementHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH" };
    if (fa.content_hash !== input.frameContentHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH" };
    if (!fa.validation_summary?.valid) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_FRAME_NOT_VALIDATED" };
    if (fa.product_visual_reference_set_id !== input.productVisualReferenceSetId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_VISUAL_REFERENCE_SET_MISMATCH" };
    frameArtifact = fa;
  }

  const { data: refSet, error: refSetErr } = await db.from("video_machine_product_visual_reference_set").select("*").eq("product_visual_reference_set_id", input.productVisualReferenceSetId).maybeSingle();
  if (refSetErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_STORAGE_METADATA_READ_ERROR" };
  if (!refSet || refSet.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_VISUAL_REFERENCE_SET_MISMATCH" };
  const productVisualReferenceSetRef = { productVisualReferenceSetId: refSet.product_visual_reference_set_id, productVisualReferenceSetHash: refSet.product_visual_reference_set_hash };

  const { data: policyBinding, error: policyBindingErr } = await db
    .from("video_machine_video_prompt_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.videoPromptPolicyKey)
    .maybeSingle();
  if (policyBindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policyBinding) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_POLICY_BINDING_NOT_FOUND" };

  const { data: policy, error: policyErr } = await db.from("video_machine_video_prompt_policy").select("*").eq("policy_id", policyBinding.active_policy_id).maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policy) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_POLICY_NOT_FOUND" };

  const allowedModes: string[] = policy.allowed_generation_modes;
  if (!Array.isArray(allowedModes) || allowedModes.length === 0) return { outcome: "FATAL_ERROR", errorCode: "INVALID_VIDEO_PROMPT_POLICY" };

  const generationMode = hasFrame ? "IMAGE_TO_VIDEO" : "TEXT_TO_VIDEO";

  if (!hasFrame && policy.require_visual_seed_when_product_visible) {
    return { outcome: "BLOCKED", blockReason: "POLICY_BLOCKED", errorCode: "VIDEO_VISUAL_SEED_REQUIRED" };
  }
  if (!allowedModes.includes(generationMode)) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROVIDER_CAPABILITY_UNSUPPORTED" };

  const videoPromptPolicySnapshotHash = `VIDEO_PROMPT_POLICY_V1:sha256:${canonicalHash("VIDEO_PROMPT_POLICY_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    allowedGenerationModes: allowedModes,
    requireVisualSeedWhenProductVisible: policy.require_visual_seed_when_product_visible,
    allowCameraIntent: policy.allow_camera_intent,
    allowSubjectMotionIntent: policy.allow_subject_motion_intent,
    allowSceneMotionIntent: policy.allow_scene_motion_intent,
    providerGeneratedTextPolicy: policy.provider_generated_text_policy,
    audioPolicy: policy.audio_policy,
    generationConstraints: policy.generation_constraints ?? null,
    providerProfileKey: policy.provider_profile_key,
  })}`;

  const { data: profileBinding, error: profileBindingErr } = await db
    .from("video_machine_video_provider_profile_binding")
    .select("active_provider_profile_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("provider_profile_key", policy.provider_profile_key)
    .maybeSingle();
  if (profileBindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!profileBinding) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROVIDER_PROFILE_NOT_FOUND" };

  const { data: profile, error: profileErr } = await db.from("video_machine_video_provider_profile").select("*").eq("provider_profile_id", profileBinding.active_provider_profile_id).maybeSingle();
  if (profileErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!profile) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROVIDER_PROFILE_NOT_FOUND" };
  if (profile.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROVIDER_PROFILE_TENANT_MISMATCH" };
  if (!profile.provider_key || !profile.model_key || !profile.adapter_key) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROVIDER_PROFILE_INVALID" };

  if (profile.adapter_key !== GENERIC_ADAPTER_KEY) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_ADAPTER_NOT_FOUND" };
  if (profile.adapter_version !== GENERIC_ADAPTER_VERSION) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_ADAPTER_VERSION_NOT_FOUND" };
  if (!(GENERIC_ADAPTER_CAPABILITIES.supportedGenerationModes as readonly string[]).includes(generationMode)) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROVIDER_CAPABILITY_UNSUPPORTED" };

  const providerProfileSnapshotHash = `VIDEO_PROVIDER_PROFILE_V1:sha256:${canonicalHash("VIDEO_PROVIDER_PROFILE_V1", {
    providerProfileId: profile.provider_profile_id,
    providerProfileKey: profile.provider_profile_key,
    providerProfileVersion: profile.provider_profile_version,
    tenantId: profile.tenant_id,
    providerKey: profile.provider_key,
    modelKey: profile.model_key,
    adapterKey: profile.adapter_key,
    adapterVersion: profile.adapter_version,
    credentialScope: profile.credential_scope,
  })}`;

  const cameraIntent = policy.allow_camera_intent ? "aproximação lenta e natural" : undefined;
  const subjectMotionIntent = policy.allow_subject_motion_intent ? "movimentos naturais e discretos" : undefined;
  const ctaKeyword = script.creative_constraints?.ctaIntent?.mechanism === "COMMENT_KEYWORD" ? script.creative_constraints.ctaIntent.keyword : undefined;

  const intent = {
    intentSchemaVersion: "VIDEO_GENERATION_INTENT_V1",
    subject: { stageSubjectBindingId: input.stageSubjectBindingId, subjectId: binding.subject_id },
    upstream: {
      creativeDirectionResultId: input.creativeDirectionResultId,
      creativeDirectionHash: input.creativeDirectionHash,
      scriptResultId: input.scriptResultId,
      scriptHash: input.scriptHash,
      beatIndex: input.beatIndex,
      frameRequirementId: input.frameRequirementId ?? null,
      frameRequirementHash: input.frameRequirementHash ?? null,
      frameArtifactId: input.frameArtifactId ?? null,
      frameContentHash: input.frameContentHash ?? null,
    },
    generationMode,
    scene: {
      purpose: beat.purpose,
      visualIntent: beat.visualIntent?.text ?? "",
      spokenText: beat.spokenText?.text ?? null,
      onScreenText: beat.onScreenText?.text ?? null,
    },
    cinematicIntent: { cameraIntent: cameraIntent ?? null, subjectMotionIntent: subjectMotionIntent ?? null, sceneMotionIntent: null },
    productIdentityConstraints: {
      preserveProductIdentity: true,
      productVisualReferenceSetRef,
      doNotInventUnsupportedProductRegions: true,
      doNotAlterObservedProductFeatures: true,
      frameIsNotIndependentFactSource: true,
    },
    textualConstraints: { preserveScriptMeaning: true, operationalKeyword: ctaKeyword ?? null, providerGeneratedTextPolicy: policy.provider_generated_text_policy },
    audioIntent: { mode: policy.audio_policy === "GENERATED_AUDIO_ALLOWED" ? "GENERATED_AUDIO_ALLOWED" : policy.audio_policy === "NO_GENERATED_AUDIO" ? "NO_GENERATED_AUDIO" : "UNSPECIFIED", spokenText: beat.spokenText?.text ?? null },
  };

  const intentHash = `VIDEO_GENERATION_INTENT_V1:sha256:${canonicalHash("VIDEO_GENERATION_INTENT_V1", intent as any)}`;

  const generationParameters = {
    durationSeconds: policy.generation_constraints?.durationSeconds ?? null,
    aspectRatio: policy.generation_constraints?.aspectRatio ?? null,
    width: policy.generation_constraints?.width ?? null,
    height: policy.generation_constraints?.height ?? null,
    seed: policy.generation_constraints?.seed ?? null,
    audioMode: policy.audio_policy === "GENERATED_AUDIO_ALLOWED" ? "GENERATED" : policy.audio_policy === "NO_GENERATED_AUDIO" ? "DISABLED" : "PROVIDER_DEFAULT",
  };

  const adapterTemplateVersion = "v2";
  const providerInstructionSchemaVersion = "PROVIDER_VIDEO_INSTRUCTION_V1";
  const adapterRequestHash = `VIDEO_PROMPT_ADAPTER_REQUEST_V1:sha256:${canonicalHash("VIDEO_PROMPT_ADAPTER_REQUEST_V1", {
    intentHash,
    providerKey: profile.provider_key,
    modelKey: profile.model_key,
    adapterKey: profile.adapter_key,
    adapterVersion: profile.adapter_version,
    adapterTemplateVersion,
    providerInstructionSchemaVersion,
    generationParameters: generationParameters as any,
  })}`;

  const rendered = renderGenericPrompt(intent, generationParameters);
  const providerInstruction = {
    providerInstructionSchemaVersion,
    providerKey: profile.provider_key,
    modelKey: profile.model_key,
    adapterKey: profile.adapter_key,
    adapterVersion: profile.adapter_version,
    generationMode,
    promptText: rendered.promptText,
    negativePromptText: rendered.negativePromptText ?? null,
    inputVisual: hasFrame ? { type: "FRAME_ARTIFACT", frameArtifactId: input.frameArtifactId, contentHash: input.frameContentHash } : null,
    generationParameters,
  };
  const providerInstructionHash = `PROVIDER_VIDEO_INSTRUCTION_V1:sha256:${canonicalHash("PROVIDER_VIDEO_INSTRUCTION_V1", providerInstruction as any)}`;

  const videoPromptArtifactHash = `VIDEO_PROMPT_ARTIFACT_V1:sha256:${canonicalHash("VIDEO_PROMPT_ARTIFACT_V1", {
    creativeDirectionResultId: input.creativeDirectionResultId,
    creativeDirectionHash: input.creativeDirectionHash,
    scriptResultId: input.scriptResultId,
    scriptHash: input.scriptHash,
    beatIndex: input.beatIndex,
    frameRequirementId: input.frameRequirementId ?? null,
    frameRequirementHash: input.frameRequirementHash ?? null,
    frameArtifactId: input.frameArtifactId ?? null,
    frameContentHash: input.frameContentHash ?? null,
    productVisualReferenceSetRef,
    videoPromptPolicyId: policy.policy_id,
    videoPromptPolicyVersion: policy.policy_version,
    videoPromptPolicySnapshotHash,
    intentHash,
    providerProfileKey: profile.provider_profile_key,
    providerProfileVersion: profile.provider_profile_version,
    providerProfileSnapshotHash,
    providerKey: profile.provider_key,
    modelKey: profile.model_key,
    adapterKey: profile.adapter_key,
    adapterVersion: profile.adapter_version,
    adapterRequestHash,
    providerInstructionHash,
  })}`;

  const { data: inserted, error } = await db
    .from("video_machine_video_prompt_artifact")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      stage_subject_binding_id: input.stageSubjectBindingId,
      creative_direction_result_id: input.creativeDirectionResultId,
      creative_direction_hash: input.creativeDirectionHash,
      script_result_id: input.scriptResultId,
      script_hash: input.scriptHash,
      beat_index: input.beatIndex,
      frame_requirement_id: input.frameRequirementId ?? null,
      frame_requirement_hash: input.frameRequirementHash ?? null,
      frame_artifact_id: input.frameArtifactId ?? null,
      frame_content_hash: input.frameContentHash ?? null,
      product_visual_reference_set_id: input.productVisualReferenceSetId,
      video_prompt_policy_id: policy.policy_id,
      video_prompt_policy_version: policy.policy_version,
      video_prompt_policy_snapshot_hash: videoPromptPolicySnapshotHash,
      intent,
      intent_hash: intentHash,
      provider_profile_key: profile.provider_profile_key,
      provider_profile_version: profile.provider_profile_version,
      provider_profile_snapshot_hash: providerProfileSnapshotHash,
      provider_key: profile.provider_key,
      model_key: profile.model_key,
      adapter_key: profile.adapter_key,
      adapter_version: profile.adapter_version,
      adapter_request_hash: adapterRequestHash,
      provider_instruction: providerInstruction,
      provider_instruction_hash: providerInstructionHash,
      video_prompt_artifact_hash: videoPromptArtifactHash,
    })
    .select("video_prompt_artifact_id")
    .single();

  if (error?.code === "23505") {
    const { data: raced } = await db.from("video_machine_video_prompt_artifact").select("video_prompt_artifact_id, video_prompt_artifact_hash").eq("job_id", jobContext.jobId).eq("attempt_number", jobContext.attemptNumber).single();
    if (raced) {
      if (raced.video_prompt_artifact_hash !== videoPromptArtifactHash) return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_ARTIFACT_REPLAY_CONFLICT" };
      return { outcome: "SUCCEEDED", resultId: raced.video_prompt_artifact_id };
    }
    return { outcome: "FATAL_ERROR", errorCode: "VIDEO_PROMPT_ARTIFACT_REPLAY_CONFLICT" };
  }
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };

  return { outcome: "SUCCEEDED", resultId: inserted.video_prompt_artifact_id };
}
