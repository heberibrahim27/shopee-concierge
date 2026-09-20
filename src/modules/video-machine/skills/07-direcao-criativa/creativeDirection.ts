import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 07 — Direção Criativa. Fonte normativa: SPEC.md neste mesmo
 * diretório. Skill06 (tendências) está DEFERRED_V2_CONTRACT — nenhum
 * TrendResearchResult existe hoje, então trendResearchResultId é
 * sempre ausente na prática e creativeMode sempre resolve EVERGREEN
 * (comportamento legítimo, nunca erro, per Ponto M5 do SPEC).
 */

export type CreativeArchetype = "DEMONSTRATION" | "PROBLEM_SOLUTION" | "PRODUCT_IN_USE" | "POV" | "UNBOXING" | "BEFORE_AFTER" | "REACTION" | "EVERGREEN_PRODUCT_DEMO";
export type HookStrategy = "CURIOSITY" | "PAIN_POINT" | "RESULT_FIRST" | "VISUAL_PATTERN_INTERRUPT" | "QUESTION" | "DEMONSTRATION_FIRST";
export type NarrativeStructure = "HOOK_DEMO_CTA" | "PROBLEM_SOLUTION_CTA" | "RESULT_FIRST_CTA" | "DISCOVERY_DEMO_CTA";
export type VisualApproach = "HANDHELD_UGC" | "CLEAN_PRODUCT_FOCUS" | "LIFESTYLE_IN_USE" | "MACRO_DETAIL" | "POV_CAMERA";
export type CtaMechanism = "COMMENT_KEYWORD" | "DIRECT_LINK" | "NONE";

export type CreativeDirectionInput = {
  tenantId: string;
  runId: string;
  stageSubjectBindingId: string;
  trendResearchResultId?: string;
  creativeDirectionPolicyKey: string;
};

export type CreativeDirectionJobContext = { jobId: string; attemptNumber: number; trustedTenantId: string };

export type CreativeDirectionOutcome =
  | { outcome: "SUCCEEDED"; resultId: string; resultStatus: "OK" | "NO_APPLICABLE_DIRECTION" }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

function normalizeKeyword(raw: string): string {
  return raw.trim().normalize("NFKC").toLowerCase();
}

export async function decideCreativeDirection(
  db: SupabaseClient,
  input: CreativeDirectionInput,
  jobContext: CreativeDirectionJobContext
): Promise<CreativeDirectionOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_DIRECTION_TENANT_MISMATCH" };

  const { data: existing, error: existingErr } = await db
    .from("video_machine_creative_direction_result")
    .select("result_id, result_status")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();
  if (existingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (existing) return { outcome: "SUCCEEDED", resultId: existing.result_id, resultStatus: existing.result_status };

  // trendResearchResultId sempre ausente na pratica (Skill06 DEFERRED_V2_CONTRACT) — fornecido = achado real de config indevida.
  if (input.trendResearchResultId) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_TREND_RESULT_NOT_FOUND" };

  const { data: binding, error: bindingErr } = await db
    .from("video_machine_stage_subject_binding")
    .select("*")
    .eq("stage_subject_binding_id", input.stageSubjectBindingId)
    .maybeSingle();
  if (bindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!binding) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_SUBJECT_BINDING_NOT_FOUND" };
  if (binding.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_SUBJECT_BINDING_NOT_FOUND" };
  if (binding.subject_type !== "PRODUCT") return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_SUBJECT_TYPE_UNSUPPORTED" };

  const { data: offerResult, error: offerErr } = await db
    .from("video_machine_offer_analysis_result")
    .select("*")
    .eq("result_id", binding.source_result_id)
    .maybeSingle();
  if (offerErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!offerResult) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_UPSTREAM_RESULT_MISMATCH" };
  if (offerResult.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_DIRECTION_TENANT_MISMATCH" };

  const allCandidates = [...offerResult.primary_candidates, ...offerResult.alternate_candidates];
  const candidate = allCandidates.find((c: any) => c.finalPosition === binding.source_position) ?? allCandidates.find((c: any) => c.productId === binding.subject_id);
  if (!candidate) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_UPSTREAM_RESULT_MISMATCH" };

  const subjectRef = {
    productId: candidate.productId,
    dealCandidateId: candidate.dealCandidateId,
    sourceOfferSnapshotId: candidate.sourceOfferSnapshotId,
    offerAnalysisResultId: offerResult.result_id,
    sourcePosition: candidate.finalPosition,
  };

  const { data: product } = await db.from("products").select("id, product_name, category_slug").eq("id", candidate.productId).maybeSingle();
  const subjectFactsSnapshot = product
    ? {
        productId: product.id,
        productName: product.product_name,
        categorySlug: product.category_slug ?? undefined,
        observedAt: new Date().toISOString(),
      }
    : undefined;
  const factsHash = subjectFactsSnapshot
    ? `CREATIVE_SUBJECT_FACTS_V1:sha256:${canonicalHash("CREATIVE_SUBJECT_FACTS_V1", { productId: subjectFactsSnapshot.productId, productName: subjectFactsSnapshot.productName, categorySlug: subjectFactsSnapshot.categorySlug ?? null })}`
    : undefined;

  const { data: policyBinding, error: policyBindingErr } = await db
    .from("video_machine_creative_direction_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.creativeDirectionPolicyKey)
    .maybeSingle();
  if (policyBindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policyBinding) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_POLICY_BINDING_NOT_FOUND" };

  const { data: policy, error: policyErr } = await db
    .from("video_machine_creative_direction_policy")
    .select("*")
    .eq("policy_id", policyBinding.active_policy_id)
    .maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policy) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_POLICY_NOT_FOUND" };
  if (policy.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_DIRECTION_TENANT_MISMATCH" };

  const allowedModes: string[] = policy.allowed_modes;
  const allowedArchetypes: CreativeArchetype[] = policy.allowed_archetypes;
  const allowedHookStrategies: HookStrategy[] = policy.allowed_hook_strategies;
  const allowedNarrativeStructures: NarrativeStructure[] = policy.allowed_narrative_structures;
  const allowedVisualApproaches: VisualApproach[] = policy.allowed_visual_approaches;
  const allowedCtaMechanisms: CtaMechanism[] = policy.allowed_cta_mechanisms;
  const invalidPolicy =
    allowedModes.length === 0 ||
    allowedArchetypes.length === 0 ||
    allowedHookStrategies.length === 0 ||
    allowedNarrativeStructures.length === 0 ||
    allowedVisualApproaches.length === 0 ||
    allowedCtaMechanisms.length === 0 ||
    (allowedCtaMechanisms.includes("COMMENT_KEYWORD") && (!policy.comment_keyword || policy.comment_keyword.trim() === "")) ||
    (!allowedCtaMechanisms.includes("COMMENT_KEYWORD") && !!policy.comment_keyword);
  if (invalidPolicy) return { outcome: "FATAL_ERROR", errorCode: "INVALID_CREATIVE_DIRECTION_POLICY" };

  const policySnapshotHash = `CREATIVE_DIRECTION_POLICY_V1:sha256:${canonicalHash("CREATIVE_DIRECTION_POLICY_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    allowedModes,
    allowedArchetypes,
    allowedHookStrategies,
    allowedNarrativeStructures,
    allowedVisualApproaches,
    allowedCtaMechanisms,
    commentKeyword: policy.comment_keyword ?? null,
    defaultLocale: policy.default_locale,
  })}`;

  // Sem TrendEvidence disponível (Skill06 deferida): só EVERGREEN é alcançável.
  if (!allowedModes.includes("EVERGREEN")) {
    return persistUnavailable(db, input, jobContext, binding, subjectRef, offerResult.result_id, policy, policySnapshotHash, "REQUIRED_TREND_EVIDENCE_UNAVAILABLE");
  }

  // Resolução determinística: dimensões com única opção válida na policy.
  const decisions: Array<{ decisionKey: string; value: string; basis: any[] }> = [];
  let archetype: CreativeArchetype;
  let hookStrategy: HookStrategy;
  let narrativeStructure: NarrativeStructure;
  let visualApproach: VisualApproach;
  let ctaMechanism: CtaMechanism;

  const needsModel = allowedArchetypes.length > 1 || allowedHookStrategies.length > 1 || allowedNarrativeStructures.length > 1 || allowedVisualApproaches.length > 1;
  let inferenceProvenance: any;

  if (!needsModel) {
    archetype = allowedArchetypes[0];
    hookStrategy = allowedHookStrategies[0];
    narrativeStructure = allowedNarrativeStructures[0];
    visualApproach = allowedVisualApproaches[0];
    inferenceProvenance = { inferenceMode: "POLICY_ONLY" };
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_PROVIDER_NOT_CONFIGURED" };

    const contextPayload = {
      subjectRef,
      subjectFactsSnapshot: subjectFactsSnapshot ?? null,
      allowedArchetypes,
      allowedHookStrategies,
      allowedNarrativeStructures,
      allowedVisualApproaches,
      locale: policy.default_locale,
    };
    const contextHash = `CREATIVE_INFERENCE_CONTEXT_V1:sha256:${canonicalHash("CREATIVE_INFERENCE_CONTEXT_V1", contextPayload)}`;
    const modelKey = process.env.CONCIERGE_VISION_MODEL ?? "gpt-4o-mini";
    const providerRequestHash = `CREATIVE_PROVIDER_REQUEST_V1:sha256:${canonicalHash("CREATIVE_PROVIDER_REQUEST_V1", { contextHash, providerKey: "openai", modelKey, promptTemplateVersion: "v1" })}`;
    const providerRequestKey = `${jobContext.jobId}:${jobContext.attemptNumber}`;

    const { data: existingCheckpoint } = await db
      .from("video_machine_creative_inference_checkpoint")
      .select("*")
      .eq("job_id", jobContext.jobId)
      .eq("attempt_number", jobContext.attemptNumber)
      .maybeSingle();

    let proposal: any;
    if (existingCheckpoint?.state === "RESPONSE_CAPTURED" && existingCheckpoint.normalized_proposal) {
      proposal = existingCheckpoint.normalized_proposal; // replay-safe: nunca chama o provider de novo
    } else {
      const client = new OpenAI({ apiKey });
      let completion;
      try {
        completion = await client.chat.completions.create({
          model: modelKey,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Você propõe estratégia criativa pra um vídeo curto de afiliado. Responda só JSON com: archetype, hookStrategy, narrativeStructure, visualApproach — cada um EXATAMENTE um dos valores permitidos fornecidos.",
            },
            { role: "user", content: JSON.stringify(contextPayload) },
          ],
        });
      } catch {
        return { outcome: "RETRYABLE_ERROR", errorCode: "CREATIVE_PROVIDER_TEMPORARILY_UNAVAILABLE" };
      }
      const raw = completion.choices[0]?.message?.content;
      if (!raw) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_INFERENCE_INVALID_OUTPUT" };
      try {
        proposal = JSON.parse(raw);
      } catch {
        return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_INFERENCE_INVALID_OUTPUT" };
      }

      const responseHash = `CREATIVE_PROVIDER_RESPONSE_V1:sha256:${canonicalHash("CREATIVE_PROVIDER_RESPONSE_V1", proposal)}`;
      await db.from("video_machine_creative_inference_checkpoint").upsert(
        {
          tenant_id: jobContext.trustedTenantId,
          run_id: input.runId,
          job_id: jobContext.jobId,
          attempt_number: jobContext.attemptNumber,
          provider_key: "openai",
          model_key: modelKey,
          context_hash: contextHash,
          provider_request_hash: providerRequestHash,
          provider_request_key: providerRequestKey,
          state: "RESPONSE_CAPTURED",
          response_hash: responseHash,
          normalized_proposal: proposal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id,attempt_number" }
      );
    }

    if (!allowedArchetypes.includes(proposal.archetype)) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_INFERENCE_INVALID_OUTPUT" };
    if (!allowedHookStrategies.includes(proposal.hookStrategy)) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_INFERENCE_INVALID_OUTPUT" };
    if (!allowedNarrativeStructures.includes(proposal.narrativeStructure)) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_INFERENCE_INVALID_OUTPUT" };
    if (!allowedVisualApproaches.includes(proposal.visualApproach)) return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_INFERENCE_INVALID_OUTPUT" };

    archetype = proposal.archetype;
    hookStrategy = proposal.hookStrategy;
    narrativeStructure = proposal.narrativeStructure;
    visualApproach = proposal.visualApproach;
    inferenceProvenance = { inferenceMode: "MODEL_ASSISTED", providerKey: "openai", modelKey, contextHash, providerRequestHash };
  }

  const basisForDim = (dim: "archetype" | "hookStrategy" | "narrativeStructure" | "visualApproach", allowedList: string[]) =>
    allowedList.length === 1
      ? [{ type: "CREATIVE_POLICY", policyId: policy.policy_id, policyVersion: policy.policy_version, fieldPath: dim }]
      : [{ type: "MODEL_INFERENCE", inferenceRef: `${jobContext.jobId}:${jobContext.attemptNumber}` }];

  decisions.push({ decisionKey: "CREATIVE_MODE", value: "EVERGREEN", basis: [{ type: "CREATIVE_POLICY", policyId: policy.policy_id, policyVersion: policy.policy_version, fieldPath: "creativeMode" }] });
  decisions.push({ decisionKey: "CREATIVE_ARCHETYPE", value: archetype, basis: basisForDim("archetype", allowedArchetypes) });
  decisions.push({ decisionKey: "HOOK_STRATEGY", value: hookStrategy, basis: basisForDim("hookStrategy", allowedHookStrategies) });
  decisions.push({ decisionKey: "NARRATIVE_STRUCTURE", value: narrativeStructure, basis: basisForDim("narrativeStructure", allowedNarrativeStructures) });
  decisions.push({ decisionKey: "VISUAL_APPROACH", value: visualApproach, basis: basisForDim("visualApproach", allowedVisualApproaches) });

  ctaMechanism = allowedCtaMechanisms.length === 1 ? allowedCtaMechanisms[0] : allowedCtaMechanisms[0]; // V1: nunca há múltiplas opções reais na policy MVP
  decisions.push({ decisionKey: "CTA_MECHANISM", value: ctaMechanism, basis: [{ type: "CREATIVE_POLICY", policyId: policy.policy_id, policyVersion: policy.policy_version, fieldPath: "ctaMechanism" }] });

  let ctaIntent: any;
  if (ctaMechanism === "COMMENT_KEYWORD") {
    const keyword = policy.comment_keyword.trim();
    const keywordNormalized = normalizeKeyword(keyword);
    ctaIntent = { mechanism: "COMMENT_KEYWORD", keyword, keywordNormalized, purpose: "AFFILIATE_LINK_DELIVERY" };
    decisions.push({ decisionKey: "CTA_KEYWORD", value: keyword, basis: [{ type: "CREATIVE_POLICY", policyId: policy.policy_id, policyVersion: policy.policy_version, fieldPath: "commentKeyword" }] });
  } else if (ctaMechanism === "DIRECT_LINK") {
    ctaIntent = { mechanism: "DIRECT_LINK", purpose: "AFFILIATE_LINK_VISIT" };
  } else {
    ctaIntent = { mechanism: "NONE" };
  }

  const creativeCtaIntentHash = canonicalHash("CREATIVE_CTA_INTENT_V1", ctaIntent);
  const direction = { archetype, hookStrategy, narrativeStructure, visualApproach, ctaIntent };

  const creativeDirectionHash = `CREATIVE_DIRECTION_V1:sha256:${canonicalHash("CREATIVE_DIRECTION_V1", {
    subjectRef,
    subjectFactsHash: factsHash ?? null,
    offerAnalysisResultId: offerResult.result_id,
    creativeMode: "EVERGREEN",
    direction,
    decisions,
    trendEvidenceRefsUsed: [],
    creativeDirectionPolicyId: policy.policy_id,
    creativeDirectionPolicyVersion: policy.policy_version,
    creativeDirectionPolicySnapshotHash: policySnapshotHash,
  })}`;

  const { data: inserted, error } = await db
    .from("video_machine_creative_direction_result")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      stage_subject_binding_id: input.stageSubjectBindingId,
      subject_ref: subjectRef,
      subject_facts_snapshot: subjectFactsSnapshot ?? null,
      offer_analysis_result_id: offerResult.result_id,
      trend_research_result_id: null,
      result_status: "OK",
      creative_mode: "EVERGREEN",
      direction,
      decisions,
      trend_evidence_refs_used: [],
      creative_cta_intent_hash: creativeCtaIntentHash,
      creative_direction_policy_id: policy.policy_id,
      creative_direction_policy_version: policy.policy_version,
      creative_direction_policy_snapshot_hash: policySnapshotHash,
      creative_direction_hash: creativeDirectionHash,
      inference_provenance: inferenceProvenance,
    })
    .select("result_id")
    .single();

  if (error?.code === "23505") {
    const { data: raced } = await db
      .from("video_machine_creative_direction_result")
      .select("result_id, result_status")
      .eq("job_id", jobContext.jobId)
      .eq("attempt_number", jobContext.attemptNumber)
      .single();
    if (raced) return { outcome: "SUCCEEDED", resultId: raced.result_id, resultStatus: raced.result_status };
    return { outcome: "FATAL_ERROR", errorCode: "CREATIVE_DIRECTION_RESULT_REPLAY_CONFLICT" };
  }
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };

  return { outcome: "SUCCEEDED", resultId: inserted.result_id, resultStatus: "OK" };
}

async function persistUnavailable(
  db: SupabaseClient,
  input: CreativeDirectionInput,
  jobContext: CreativeDirectionJobContext,
  binding: any,
  subjectRef: any,
  offerAnalysisResultId: string,
  policy: { policy_id: string; policy_version: string },
  policySnapshotHash: string,
  reason: string
): Promise<CreativeDirectionOutcome> {
  const { data: inserted, error } = await db
    .from("video_machine_creative_direction_result")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      stage_subject_binding_id: input.stageSubjectBindingId,
      subject_ref: subjectRef,
      offer_analysis_result_id: offerAnalysisResultId,
      result_status: "NO_APPLICABLE_DIRECTION",
      reason,
      creative_direction_policy_id: policy.policy_id,
      creative_direction_policy_version: policy.policy_version,
      creative_direction_policy_snapshot_hash: policySnapshotHash,
    })
    .select("result_id")
    .single();
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  return { outcome: "SUCCEEDED", resultId: inserted.result_id, resultStatus: "NO_APPLICABLE_DIRECTION" };
}
