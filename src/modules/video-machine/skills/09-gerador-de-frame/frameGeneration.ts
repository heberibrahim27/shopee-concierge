import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 09 — Gerador de Frame. Fonte normativa: SPEC.md neste mesmo
 * diretório. ImageGenerationProvider = NOT_IMPLEMENTED hoje (auditoria
 * do próprio SPEC.md confirma: zero geração de imagem por IA existe no
 * repositório) — então qualquer FrameRequirement cujo
 * ProductVisualReferenceSet seja POPULATED (ou seja, que exigiria uma
 * chamada real ao provider) retorna FRAME_PROVIDER_CAPABILITY_UNSUPPORTED
 * antes de qualquer checkpoint, nunca fabrica um FrameArtifact. Os dois
 * branches de domínio que NÃO exigem provider (NO_FRAME_REQUIRED e
 * REFERENCE_UNAVAILABLE) são implementados e testados de verdade contra
 * `offer_snapshots` reais.
 */

export type FrameGenerationInput = {
  tenantId: string;
  runId: string;
  stageSubjectBindingId: string;
  creativeDirectionResultId: string;
  creativeDirectionHash: string;
  scriptResultId: string;
  scriptHash: string;
  framePolicyKey: string;
};

export type FrameGenerationJobContext = { jobId: string; attemptNumber: number; trustedTenantId: string };

export type FrameGenerationOutcome =
  | { outcome: "SUCCEEDED"; resultId: string; resultStatus: "OK" | "NO_FRAME_REQUIRED" | "REFERENCE_UNAVAILABLE" }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

export async function generateFrame(db: SupabaseClient, input: FrameGenerationInput, jobContext: FrameGenerationJobContext): Promise<FrameGenerationOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "FRAME_TENANT_MISMATCH" };

  const { data: existing, error: existingErr } = await db
    .from("video_machine_frame_generation_result")
    .select("result_id, result_status")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();
  if (existingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (existing) return { outcome: "SUCCEEDED", resultId: existing.result_id, resultStatus: existing.result_status };

  const { data: direction, error: directionErr } = await db.from("video_machine_creative_direction_result").select("*").eq("result_id", input.creativeDirectionResultId).maybeSingle();
  if (directionErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!direction) return { outcome: "FATAL_ERROR", errorCode: "FRAME_CREATIVE_DIRECTION_MISMATCH" };
  if (direction.tenant_id !== jobContext.trustedTenantId || direction.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "FRAME_TENANT_MISMATCH" };
  if (direction.creative_direction_hash !== input.creativeDirectionHash) return { outcome: "FATAL_ERROR", errorCode: "FRAME_CREATIVE_DIRECTION_MISMATCH" };

  const { data: script, error: scriptErr } = await db.from("video_machine_script_result").select("*").eq("result_id", input.scriptResultId).maybeSingle();
  if (scriptErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!script) return { outcome: "FATAL_ERROR", errorCode: "FRAME_SCRIPT_RESULT_MISMATCH" };
  if (script.tenant_id !== jobContext.trustedTenantId || script.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "FRAME_TENANT_MISMATCH" };
  if (script.script_hash !== input.scriptHash) return { outcome: "FATAL_ERROR", errorCode: "FRAME_SCRIPT_RESULT_MISMATCH" };
  if (script.creative_direction_result_id !== input.creativeDirectionResultId) return { outcome: "FATAL_ERROR", errorCode: "FRAME_SCRIPT_RESULT_MISMATCH" };

  const { data: binding, error: bindingErr } = await db.from("video_machine_stage_subject_binding").select("*").eq("stage_subject_binding_id", input.stageSubjectBindingId).maybeSingle();
  if (bindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!binding) return { outcome: "FATAL_ERROR", errorCode: "FRAME_SUBJECT_BINDING_MISMATCH" };
  if (binding.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "FRAME_SUBJECT_BINDING_MISMATCH" };

  const { data: policyBinding, error: policyBindingErr } = await db
    .from("video_machine_frame_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.framePolicyKey)
    .maybeSingle();
  if (policyBindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policyBinding) return { outcome: "FATAL_ERROR", errorCode: "FRAME_POLICY_BINDING_NOT_FOUND" };

  const { data: policy, error: policyErr } = await db.from("video_machine_frame_policy").select("*").eq("policy_id", policyBinding.active_policy_id).maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policy) return { outcome: "FATAL_ERROR", errorCode: "FRAME_POLICY_NOT_FOUND" };
  if (policy.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "FRAME_POLICY_TENANT_MISMATCH" };

  const framePolicySnapshotHash = `FRAME_POLICY_V1:sha256:${canonicalHash("FRAME_POLICY_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    frameSchemaVersion: policy.frame_schema_version,
    allowedReferenceSourceTypes: policy.allowed_reference_source_types,
    allowedMimeTypes: policy.allowed_mime_types,
    output: policy.output ?? {},
    validationPolicy: policy.validation_policy,
    requireFrame: policy.require_frame,
  })}`;

  const beats: any[] = script.beats;
  const requiresFrame = policy.require_frame && beats.length > 0;

  // Precedência de emptyReason (SPEC.md): 1. TEXT_TO_VIDEO explícito (não
  // modelado ainda — nenhum input desta fase distingue esse modo) 2.
  // policy diz que frame não é necessário -> NO_FRAME_REQUIRED 3. senão,
  // referência esperada mas indisponível -> REFERENCE_UNAVAILABLE.
  if (!requiresFrame) {
    return await persistNoFrameRequired(db, input, jobContext, binding, policy, framePolicySnapshotHash);
  }

  const sourceOfferSnapshotId: string | undefined = direction.subject_ref?.sourceOfferSnapshotId;
  const { data: snapshot } = sourceOfferSnapshotId ? await db.from("offer_snapshots").select("id, image_url").eq("id", sourceOfferSnapshotId).maybeSingle() : { data: null };

  const frameRequirementInputs = beats.map((b: any) => ({ beatIndex: b.beatIndex, visualIntent: b.visualIntent }));

  if (!snapshot || !snapshot.image_url) {
    return await persistReferenceUnavailable(db, input, jobContext, binding, policy, framePolicySnapshotHash, frameRequirementInputs);
  }

  // Referência existe (POPULATED) -> geração real seria necessária, mas
  // ImageGenerationProvider = NOT_IMPLEMENTED (SPEC.md, "Status de
  // implementação"). Nenhum checkpoint/FrameArtifact é fabricado.
  return { outcome: "FATAL_ERROR", errorCode: "FRAME_PROVIDER_CAPABILITY_UNSUPPORTED" };
}

async function materializeFrameRequirements(
  db: SupabaseClient,
  input: FrameGenerationInput,
  jobContext: FrameGenerationJobContext,
  frameRequirementInputs: Array<{ beatIndex: number; visualIntent: any }>
): Promise<Array<{ frame_requirement_id: string }>> {
  const rows = [];
  for (const req of frameRequirementInputs) {
    const frameRequirementHash = `FRAME_REQUIREMENT_V1:sha256:${canonicalHash("FRAME_REQUIREMENT_V1", {
      creativeDirectionHash: input.creativeDirectionHash,
      scriptHash: input.scriptHash,
      beatIndex: req.beatIndex,
      purpose: "BEAT_SEED",
      visualIntent: req.visualIntent,
      referenceIdsAllowed: [],
    })}`;
    const { data: inserted } = await db
      .from("video_machine_frame_requirement")
      .insert({
        tenant_id: jobContext.trustedTenantId,
        creative_direction_result_id: input.creativeDirectionResultId,
        creative_direction_hash: input.creativeDirectionHash,
        script_result_id: input.scriptResultId,
        script_hash: input.scriptHash,
        beat_index: req.beatIndex,
        purpose: "BEAT_SEED",
        visual_intent: req.visualIntent,
        reference_ids_allowed: [],
        frame_requirement_hash: frameRequirementHash,
      })
      .select("frame_requirement_id")
      .single();
    if (inserted) rows.push(inserted);
  }
  return rows;
}

async function persistNoFrameRequired(
  db: SupabaseClient,
  input: FrameGenerationInput,
  jobContext: FrameGenerationJobContext,
  binding: any,
  policy: any,
  framePolicySnapshotHash: string
): Promise<FrameGenerationOutcome> {
  const content = { kind: "EMPTY", references: [], emptyReason: "NO_FRAME_REQUIRED" };
  const { setId } = await materializeReferenceSet(db, input, jobContext, content);

  const { data: inserted, error } = await db
    .from("video_machine_frame_generation_result")
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
      product_visual_reference_set_id: setId,
      result_status: "NO_FRAME_REQUIRED",
      frame_requirement_count: 0,
      frame_artifacts: [],
      frame_policy_id: policy.policy_id,
      frame_policy_version: policy.policy_version,
      frame_policy_snapshot_hash: framePolicySnapshotHash,
    })
    .select("result_id")
    .single();
  return finishPersist(db, jobContext, "video_machine_frame_generation_result", inserted, error, "NO_FRAME_REQUIRED");
}

async function persistReferenceUnavailable(
  db: SupabaseClient,
  input: FrameGenerationInput,
  jobContext: FrameGenerationJobContext,
  binding: any,
  policy: any,
  framePolicySnapshotHash: string,
  frameRequirementInputs: Array<{ beatIndex: number; visualIntent: any }>
): Promise<FrameGenerationOutcome> {
  const content = { kind: "EMPTY", references: [], emptyReason: "REFERENCE_UNAVAILABLE" };
  const { setId } = await materializeReferenceSet(db, input, jobContext, content);
  const requirementRows = await materializeFrameRequirements(db, input, jobContext, frameRequirementInputs);

  const { data: inserted, error } = await db
    .from("video_machine_frame_generation_result")
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
      product_visual_reference_set_id: setId,
      result_status: "REFERENCE_UNAVAILABLE",
      reason: "FRAME_REFERENCE_UNAVAILABLE",
      frame_requirement_count: requirementRows.length,
      frame_artifacts: [],
      frame_policy_id: policy.policy_id,
      frame_policy_version: policy.policy_version,
      frame_policy_snapshot_hash: framePolicySnapshotHash,
    })
    .select("result_id")
    .single();
  return finishPersist(db, jobContext, "video_machine_frame_generation_result", inserted, error, "REFERENCE_UNAVAILABLE");
}

async function materializeReferenceSet(db: SupabaseClient, input: FrameGenerationInput, jobContext: FrameGenerationJobContext, content: any): Promise<{ setId: string }> {
  const subjectRef = { subjectType: "PRODUCT", stageSubjectBindingId: input.stageSubjectBindingId };
  const hash = `PRODUCT_VISUAL_REFERENCE_SET_V1:sha256:${canonicalHash("PRODUCT_VISUAL_REFERENCE_SET_V1", { tenantId: jobContext.trustedTenantId, subjectRef, content })}`;
  const { data: inserted, error } = await db
    .from("video_machine_product_visual_reference_set")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      subject_ref: subjectRef,
      content,
      product_visual_reference_set_hash: hash,
    })
    .select("product_visual_reference_set_id")
    .single();
  if (error || !inserted) throw new Error(`materializeReferenceSet: ${error?.message}`);
  return { setId: inserted.product_visual_reference_set_id };
}

async function finishPersist(db: SupabaseClient, jobContext: FrameGenerationJobContext, table: string, inserted: any, error: any, resultStatus: "OK" | "NO_FRAME_REQUIRED" | "REFERENCE_UNAVAILABLE"): Promise<FrameGenerationOutcome> {
  if (error?.code === "23505") {
    const { data: raced } = await db.from(table).select("result_id, result_status").eq("job_id", jobContext.jobId).eq("attempt_number", jobContext.attemptNumber).single();
    if (raced) return { outcome: "SUCCEEDED", resultId: raced.result_id, resultStatus: raced.result_status };
    return { outcome: "FATAL_ERROR", errorCode: "FRAME_RESULT_REPLAY_CONFLICT" };
  }
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  return { outcome: "SUCCEEDED", resultId: inserted.result_id, resultStatus };
}
