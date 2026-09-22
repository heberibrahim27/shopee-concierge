import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 08 — Roteirista. Fonte normativa: SPEC.md neste mesmo diretório.
 * creativeMode chega sempre EVERGREEN (Skill06 DEFERRED_V2_CONTRACT) —
 * ScriptFactCatalog.trendEvidence é sempre [] na prática hoje.
 *
 * FactualClaimValidator aqui é heurístico (regex sobre classes de
 * alegação proibidas por padrão: comparative/superlative/scarcity/
 * medical), não julgamento semântico por IA — suficiente pra fechar o
 * caso do SPEC ("preço não sustenta 'mais barato do Brasil'") porque
 * essas classes vêm desligadas por padrão em ScriptFactualClaimRulesV1,
 * mas não é um validador semântico geral.
 */

export type ScriptStatementKind = "FACTUAL_CLAIM" | "CREATIVE_EXPRESSION" | "CTA" | "TRANSITION";
export type ScriptBeatPurpose = "HOOK" | "SETUP" | "PROBLEM" | "DEMONSTRATION" | "BENEFIT" | "TRANSITION" | "CTA";

export type ScriptWritingInput = {
  tenantId: string;
  runId: string;
  creativeDirectionResultId: string;
  creativeDirectionHash: string;
  scriptPolicyKey: string;
};

export type ScriptWritingJobContext = { jobId: string; attemptNumber: number; trustedTenantId: string };

export type ScriptWritingOutcome =
  | { outcome: "SUCCEEDED"; resultId: string }
  | { outcome: "FATAL_ERROR"; errorCode: string }
  | { outcome: "RETRYABLE_ERROR"; errorCode: string };

const DISALLOWED_CLASS_PATTERNS: Record<string, RegExp> = {
  comparative: /mais barato|menor pre[cç]o|mais em conta/i,
  superlative: /melhor do (mercado|brasil|mundo)|n[uú]mero\s*1\b|top\s*1\b/i,
  scarcity: /[uú]ltimas?\s+unidades|acabando|s[oó]\s+hoje/i,
  medical: /\bcura\b|trata a dor|elimina a dor|tratamento para/i,
};

function classifyDisallowed(text: string, rules: any): { blocked: boolean; errorCode?: string } {
  if (rules.allowComparativeClaims === false && DISALLOWED_CLASS_PATTERNS.comparative.test(text)) {
    return { blocked: true, errorCode: "SCRIPT_FACTUAL_CLAIM_NOT_SUPPORTED_BY_BASIS" };
  }
  if (rules.allowSuperlativeClaims === false && DISALLOWED_CLASS_PATTERNS.superlative.test(text)) {
    return { blocked: true, errorCode: "SCRIPT_FACTUAL_CLAIM_NOT_SUPPORTED_BY_BASIS" };
  }
  if (rules.allowScarcityClaims === false && DISALLOWED_CLASS_PATTERNS.scarcity.test(text)) {
    return { blocked: true, errorCode: "SCRIPT_FACTUAL_CLAIM_UNSUPPORTED" };
  }
  if (rules.allowMedicalOrTherapeuticClaims === false && DISALLOWED_CLASS_PATTERNS.medical.test(text)) {
    return { blocked: true, errorCode: "SCRIPT_FACTUAL_CLAIM_UNSUPPORTED" };
  }
  return { blocked: false };
}

function normalizeKeyword(raw: string): string {
  return raw.trim().normalize("NFKC").toLowerCase();
}

export async function writeScript(db: SupabaseClient, input: ScriptWritingInput, jobContext: ScriptWritingJobContext): Promise<ScriptWritingOutcome> {
  if (input.tenantId !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_TENANT_MISMATCH" };

  const { data: existing, error: existingErr } = await db
    .from("video_machine_script_result")
    .select("result_id")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();
  if (existingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (existing) return { outcome: "SUCCEEDED", resultId: existing.result_id };

  const { data: direction, error: directionErr } = await db
    .from("video_machine_creative_direction_result")
    .select("*")
    .eq("result_id", input.creativeDirectionResultId)
    .maybeSingle();
  if (directionErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!direction) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_CREATIVE_DIRECTION_NOT_FOUND" };
  if (direction.tenant_id !== jobContext.trustedTenantId || direction.run_id !== input.runId) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_TENANT_MISMATCH" };
  if (direction.result_status !== "OK") return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_CREATIVE_DIRECTION_NOT_OK" };
  if (direction.creative_direction_hash !== input.creativeDirectionHash) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_CREATIVE_DIRECTION_MISMATCH" };
  if (direction.creative_mode !== "EVERGREEN") return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_CREATIVE_DIRECTION_NOT_OK" };

  const creativeConstraints = {
    creativeMode: direction.creative_mode,
    archetype: direction.direction.archetype,
    hookStrategy: direction.direction.hookStrategy,
    narrativeStructure: direction.direction.narrativeStructure,
    visualApproach: direction.direction.visualApproach,
    ctaIntent: direction.direction.ctaIntent,
  };

  const subjectFactsSnapshot = direction.subject_facts_snapshot ?? null;
  const subjectFactsHash = subjectFactsSnapshot
    ? `CREATIVE_SUBJECT_FACTS_V1:sha256:${canonicalHash("CREATIVE_SUBJECT_FACTS_V1", {
        productId: subjectFactsSnapshot.productId,
        productName: subjectFactsSnapshot.productName,
        categorySlug: subjectFactsSnapshot.categorySlug ?? null,
      })}`
    : null;

  const sourceOfferSnapshotId = direction.subject_ref?.sourceOfferSnapshotId;
  let offerFacts: Record<string, unknown> = {};
  if (sourceOfferSnapshotId) {
    const { data: snapshot } = await db
      .from("offer_snapshots")
      .select("price_min, price_max, price_discount_rate, commission_rate, commission")
      .eq("id", sourceOfferSnapshotId)
      .maybeSingle();
    if (snapshot) offerFacts = { ...snapshot };
  }

  const productFacts: Record<string, unknown> = subjectFactsSnapshot
    ? { productId: subjectFactsSnapshot.productId ?? null, productName: subjectFactsSnapshot.productName ?? null, categorySlug: subjectFactsSnapshot.categorySlug ?? null }
    : {};
  const factCatalog = {
    subjectFactsHash,
    productFacts,
    offerAnalysisResultId: direction.offer_analysis_result_id,
    sourceOfferSnapshotId,
    offerFacts,
    trendEvidence: [] as any[], // creativeMode sempre EVERGREEN hoje (Skill06 deferida)
  };

  const { data: policyBinding, error: policyBindingErr } = await db
    .from("video_machine_script_policy_binding")
    .select("active_policy_id")
    .eq("tenant_id", jobContext.trustedTenantId)
    .eq("policy_key", input.scriptPolicyKey)
    .maybeSingle();
  if (policyBindingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policyBinding) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_POLICY_BINDING_NOT_FOUND" };

  const { data: policy, error: policyErr } = await db.from("video_machine_script_policy").select("*").eq("policy_id", policyBinding.active_policy_id).maybeSingle();
  if (policyErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!policy) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_POLICY_NOT_FOUND" };
  if (policy.tenant_id !== jobContext.trustedTenantId) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_TENANT_MISMATCH" };

  const allowedBeatPurposes: ScriptBeatPurpose[] = policy.allowed_beat_purposes;
  const rules = policy.factual_claim_rules;
  const invalidPolicy = !Array.isArray(allowedBeatPurposes) || allowedBeatPurposes.length === 0 || !policy.max_beat_count || policy.max_beat_count < 1 || !rules;
  if (invalidPolicy) return { outcome: "FATAL_ERROR", errorCode: "INVALID_SCRIPT_POLICY" };

  const scriptPolicySnapshotHash = `SCRIPT_POLICY_V1:sha256:${canonicalHash("SCRIPT_POLICY_V1", {
    policyId: policy.policy_id,
    policyKey: policy.policy_key,
    policyVersion: policy.policy_version,
    tenantId: policy.tenant_id,
    scriptTaxonomyVersion: policy.script_taxonomy_version,
    locale: policy.locale,
    allowedBeatPurposes,
    maxBeatCount: policy.max_beat_count,
    allowSpokenText: policy.allow_spoken_text,
    allowOnScreenText: policy.allow_on_screen_text,
    requireHook: policy.require_hook,
    requireCta: policy.require_cta,
    durationConstraint: policy.duration_min_seconds != null && policy.duration_max_seconds != null ? { minSeconds: policy.duration_min_seconds, maxSeconds: policy.duration_max_seconds } : null,
    factualClaimRules: rules,
  })}`;

  const generationContextPayload = {
    creativeDirectionResultId: input.creativeDirectionResultId,
    creativeDirectionHash: input.creativeDirectionHash,
    creativeConstraints,
    subjectFactsSnapshot,
    factCatalog,
    locale: policy.locale,
    scriptPolicyId: policy.policy_id,
    scriptPolicyVersion: policy.policy_version,
    scriptPolicySnapshotHash,
  };
  const generationContextHash = `SCRIPT_GENERATION_CONTEXT_V1:sha256:${canonicalHash("SCRIPT_GENERATION_CONTEXT_V1", generationContextPayload as any)}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_PROVIDER_NOT_CONFIGURED" };

  const modelKey = process.env.CONCIERGE_VISION_MODEL ?? "gpt-4o-mini";
  const providerRequestHash = `SCRIPT_PROVIDER_REQUEST_V1:sha256:${canonicalHash("SCRIPT_PROVIDER_REQUEST_V1", { generationContextHash, providerKey: "openai", modelKey, promptTemplateVersion: "v3" })}`;
  const providerRequestKey = `${jobContext.jobId}:${jobContext.attemptNumber}`;

  const { data: existingCheckpoint } = await db
    .from("video_machine_script_inference_checkpoint")
    .select("*")
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber)
    .maybeSingle();

  if (existingCheckpoint?.state === "REJECTED") {
    return { outcome: "FATAL_ERROR", errorCode: existingCheckpoint.rejection_code ?? "SCRIPT_PROVIDER_INVALID_OUTPUT" };
  }

  let proposal: any;
  if (existingCheckpoint?.state === "RESPONSE_CAPTURED" && existingCheckpoint.normalized_proposal) {
    proposal = existingCheckpoint.normalized_proposal;
  } else {
    await db.from("video_machine_script_inference_checkpoint").upsert(
      {
        tenant_id: jobContext.trustedTenantId,
        run_id: input.runId,
        job_id: jobContext.jobId,
        attempt_number: jobContext.attemptNumber,
        creative_direction_result_id: input.creativeDirectionResultId,
        creative_direction_hash: input.creativeDirectionHash,
        script_policy_id: policy.policy_id,
        script_policy_version: policy.policy_version,
        provider_key: "openai",
        model_key: modelKey,
        generation_context_hash: generationContextHash,
        provider_request_hash: providerRequestHash,
        provider_request_key: providerRequestKey,
        state: "PREPARED",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id,attempt_number" }
    );

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
              `Você escreve o roteiro textual de um vídeo curto de afiliado, em ${policy.locale}. ` +
              `Responda só JSON: {"beats":[{"beatIndex":0,"purpose":"<um de ${JSON.stringify(allowedBeatPurposes)}>",` +
              `"spokenText":{"text":"...","proposedKind":"CREATIVE_EXPRESSION|FACTUAL_CLAIM|CTA|TRANSITION","referencedFacts":[]},` +
              `"onScreenText":{"text":"...","proposedKind":"...","referencedFacts":[]},` +
              `"visualIntent":{"text":"o que deve acontecer na tela, nunca termos técnicos de geração de vídeo","referencedFacts":[]}}]}. ` +
              `EXATAMENTE 1 beat, mesmo que ele precise conter tanto o gancho quanto a chamada pra ação — beat.purpose fica fixo no valor permitido, mas as statements dentro dele podem ter kinds diferentes. ` +
              `Nunca invente fatos fora do factCatalog fornecido. ` +
              `Regra crítica sobre referencedFacts: só use proposedKind="FACTUAL_CLAIM" quando a afirmação vier LITERALMENTE de um campo existente em factCatalog.productFacts (chaves válidas: ${JSON.stringify(Object.keys(factCatalog.productFacts))}) ou factCatalog.offerFacts (chaves válidas: ${JSON.stringify(Object.keys(factCatalog.offerFacts))}). Cada referencedFacts precisa ser {"type":"PRODUCT_FACT","fieldPath":"<chave exata de productFacts>"} ou {"type":"OFFER_FACT","fieldPath":"<chave exata de offerFacts>"} — nunca invente um fieldPath que não esteja nessas listas. Se a frase não puder ser sustentada por um campo exato, use proposedKind="CREATIVE_EXPRESSION" (sem referencedFacts) em vez de arriscar um FACTUAL_CLAIM inválido. ` +
              (policy.require_cta && creativeConstraints.ctaIntent?.mechanism === "COMMENT_KEYWORD" && creativeConstraints.ctaIntent?.followPhrase
                ? `OBRIGATÓRIO, SEM EXCEÇÃO: "onScreenText" precisa ter proposedKind="CTA" e o campo "text" precisa conter DUAS coisas ao mesmo tempo, na mesma frase: (1) literalmente a palavra "${creativeConstraints.ctaIntent.keyword}" e (2) uma palavra que comece com "${creativeConstraints.ctaIntent.followPhrase}" (ex.: "segue", "seguir", "seguindo") convidando a pessoa a seguir a conta. NÃO é permitido usar só a palavra-chave sem o convite de seguir — a resposta é rejeitada automaticamente se faltar qualquer uma das duas. COPIE este molde e adapte só a parte do produto: "Comenta ${creativeConstraints.ctaIntent.keyword} que eu te mando o link, e já segue aqui que amanhã tem mais achado desses!". "spokenText" fica livre pra ser o gancho/pitch (proposedKind="CREATIVE_EXPRESSION" ou "FACTUAL_CLAIM"). `
                : policy.require_cta && creativeConstraints.ctaIntent?.mechanism === "COMMENT_KEYWORD"
                ? `OBRIGATÓRIO: "onScreenText" precisa ter proposedKind="CTA" e o campo "text" precisa conter literalmente a palavra "${creativeConstraints.ctaIntent.keyword}" (ex.: "Comenta ${creativeConstraints.ctaIntent.keyword} que eu te mando o link!") — sem isso a resposta é rejeitada. "spokenText" fica livre pra ser o gancho/pitch (proposedKind="CREATIVE_EXPRESSION" ou "FACTUAL_CLAIM"). `
                : "") +
              (policy.require_cta && creativeConstraints.ctaIntent?.followPhrase
                ? `LEMBRETE FINAL, o mais importante desta mensagem: a resposta SÓ é aceita se o texto do CTA contiver uma palavra começando com "${creativeConstraints.ctaIntent.followPhrase}" convidando a seguir a conta. Releia seu "onScreenText" antes de responder e confirme que essa palavra está lá. `
                : ""),
          },
          { role: "user", content: JSON.stringify({ creativeConstraints, factCatalog, requireHook: policy.require_hook, requireCta: policy.require_cta }) },
        ],
      });
    } catch {
      return { outcome: "RETRYABLE_ERROR", errorCode: "SCRIPT_PROVIDER_TEMPORARILY_UNAVAILABLE" };
    }
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return await reject(db, jobContext, "SCRIPT_PROVIDER_INVALID_OUTPUT");
    try {
      proposal = JSON.parse(raw);
    } catch {
      return await reject(db, jobContext, "SCRIPT_PROVIDER_INVALID_OUTPUT");
    }
    if (process.env.SCRIPT_DEBUG) console.error("[script-debug] proposal:", JSON.stringify(proposal, null, 2));

    const providerResponseHash = `SCRIPT_PROVIDER_RESPONSE_V1:sha256:${canonicalHash("SCRIPT_PROVIDER_RESPONSE_V1", proposal)}`;
    await db
      .from("video_machine_script_inference_checkpoint")
      .update({ state: "RESPONSE_CAPTURED", provider_response_hash: providerResponseHash, normalized_proposal: proposal, updated_at: new Date().toISOString() })
      .eq("job_id", jobContext.jobId)
      .eq("attempt_number", jobContext.attemptNumber);
  }

  const validation = validateProposal(proposal, { allowedBeatPurposes, maxBeatCount: policy.max_beat_count, allowSpokenText: policy.allow_spoken_text, allowOnScreenText: policy.allow_on_screen_text, requireHook: policy.require_hook, requireCta: policy.require_cta }, creativeConstraints, factCatalog, rules);
  if (!validation.valid) return await reject(db, jobContext, validation.errorCode);

  const beats = validation.beats;
  const estimatedDurationSeconds = beats.reduce((sum: number | undefined, b: any) => (b.targetDurationSeconds != null ? (sum ?? 0) + b.targetDurationSeconds : sum), undefined as number | undefined);

  const scriptHash = `SCRIPT_V1:sha256:${canonicalHash("SCRIPT_V1", {
    creativeDirectionResultId: input.creativeDirectionResultId,
    creativeDirectionHash: input.creativeDirectionHash,
    locale: policy.locale,
    creativeConstraints,
    beats,
  })}`;

  const inferenceProvenance = { inferenceMode: "MODEL_ASSISTED", providerKey: "openai", modelKey, generationContextHash, providerRequestHash };

  const { data: inserted, error } = await db
    .from("video_machine_script_result")
    .insert({
      tenant_id: jobContext.trustedTenantId,
      run_id: input.runId,
      job_id: jobContext.jobId,
      attempt_number: jobContext.attemptNumber,
      creative_direction_result_id: input.creativeDirectionResultId,
      creative_direction_hash: input.creativeDirectionHash,
      locale: policy.locale,
      creative_constraints: creativeConstraints,
      beats,
      estimated_duration_seconds: estimatedDurationSeconds ?? null,
      script_policy_id: policy.policy_id,
      script_policy_version: policy.policy_version,
      script_policy_snapshot_hash: scriptPolicySnapshotHash,
      generation_context_hash: generationContextHash,
      script_hash: scriptHash,
      inference_provenance: inferenceProvenance,
    })
    .select("result_id")
    .single();

  if (error?.code === "23505") {
    const { data: raced } = await db.from("video_machine_script_result").select("result_id").eq("job_id", jobContext.jobId).eq("attempt_number", jobContext.attemptNumber).single();
    if (raced) return { outcome: "SUCCEEDED", resultId: raced.result_id };
    return { outcome: "FATAL_ERROR", errorCode: "SCRIPT_RESULT_REPLAY_CONFLICT" };
  }
  if (error || !inserted) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };

  await db.from("video_machine_script_inference_checkpoint").update({ state: "VALIDATED", updated_at: new Date().toISOString() }).eq("job_id", jobContext.jobId).eq("attempt_number", jobContext.attemptNumber);

  return { outcome: "SUCCEEDED", resultId: inserted.result_id };
}

async function reject(db: SupabaseClient, jobContext: ScriptWritingJobContext, errorCode: string): Promise<ScriptWritingOutcome> {
  await db
    .from("video_machine_script_inference_checkpoint")
    .update({ state: "REJECTED", rejection_code: errorCode, updated_at: new Date().toISOString() })
    .eq("job_id", jobContext.jobId)
    .eq("attempt_number", jobContext.attemptNumber);
  return { outcome: "FATAL_ERROR", errorCode };
}

function validateProposal(
  proposal: any,
  policyLimits: { allowedBeatPurposes: string[]; maxBeatCount: number; allowSpokenText: boolean; allowOnScreenText: boolean; requireHook: boolean; requireCta: boolean },
  creativeConstraints: any,
  factCatalog: { productFacts: Record<string, unknown>; offerFacts: Record<string, unknown>; subjectFactsHash: string | null; offerAnalysisResultId: string; sourceOfferSnapshotId?: string },
  rules: any
): { valid: true; beats: any[] } | { valid: false; errorCode: string } {
  if (!proposal || !Array.isArray(proposal.beats) || proposal.beats.length === 0) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
  if (proposal.beats.length !== 1) return { valid: false, errorCode: "SCRIPT_BEAT_COUNT_INVALID" };
  if (proposal.beats.length > policyLimits.maxBeatCount) return { valid: false, errorCode: "SCRIPT_BEAT_COUNT_INVALID" };

  const seenIndexes = new Set<number>();
  const materializedBeats: any[] = [];
  const ctaIntent = creativeConstraints.ctaIntent;
  let hasCtaStatementWithKeyword = false;
  let hasFollowCtaMention = false;
  let hasHookBeat = false;
  let hasCtaBeat = false;

  for (const rawBeat of proposal.beats) {
    if (typeof rawBeat.beatIndex !== "number" || seenIndexes.has(rawBeat.beatIndex)) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
    seenIndexes.add(rawBeat.beatIndex);
    if (!policyLimits.allowedBeatPurposes.includes(rawBeat.purpose)) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
    if (rawBeat.purpose === "HOOK") hasHookBeat = true;
    if (rawBeat.purpose === "CTA") hasCtaBeat = true;

    const materializeStatement = (raw: any, kindField: string) => {
      if (!raw) return undefined;
      const kind: ScriptStatementKind = raw.proposedKind;
      if (!["FACTUAL_CLAIM", "CREATIVE_EXPRESSION", "CTA", "TRANSITION"].includes(kind)) throw { errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
      const factBasis: any[] = [];
      if (kind === "FACTUAL_CLAIM") {
        const refs = Array.isArray(raw.referencedFacts) ? raw.referencedFacts : [];
        if (refs.length === 0) throw { errorCode: "SCRIPT_FACT_BASIS_INVALID" };
        for (const ref of refs) {
          if (ref.type === "TREND_EVIDENCE") throw { errorCode: "SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION" };
          if (ref.type === "PRODUCT_FACT") {
            if (!ref.fieldPath || !(ref.fieldPath in factCatalog.productFacts)) throw { errorCode: "SCRIPT_FACT_BASIS_INVALID" };
            factBasis.push({ type: "PRODUCT_FACT", subjectFactsHash: factCatalog.subjectFactsHash, fieldPath: ref.fieldPath });
          } else if (ref.type === "OFFER_FACT") {
            if (!ref.fieldPath || !(ref.fieldPath in factCatalog.offerFacts)) throw { errorCode: "SCRIPT_FACT_BASIS_INVALID" };
            factBasis.push({ type: "OFFER_FACT", offerAnalysisResultId: factCatalog.offerAnalysisResultId, sourceOfferSnapshotId: factCatalog.sourceOfferSnapshotId, fieldPath: ref.fieldPath });
          } else {
            throw { errorCode: "SCRIPT_FACT_BASIS_INVALID" };
          }
        }
        const disallowed = classifyDisallowed(raw.text ?? "", rules);
        if (disallowed.blocked) throw { errorCode: disallowed.errorCode };
      }
      if (kind === "CTA") {
        if (ctaIntent?.mechanism === "COMMENT_KEYWORD") {
          const keyword = ctaIntent.keyword as string;
          if (!normalizeKeyword(raw.text ?? "").includes(normalizeKeyword(keyword))) throw { errorCode: "SCRIPT_CTA_CONSTRAINT_VIOLATION" };
          hasCtaStatementWithKeyword = true;
        } else if (ctaIntent?.mechanism === "DIRECT_LINK") {
          hasCtaStatementWithKeyword = true;
        }
      }
      return { statementId: `${kindField}-${rawBeat.beatIndex}`, kind, text: raw.text, ...(factBasis.length > 0 ? { factBasis } : {}) };
    };

    let spokenText, onScreenText;
    try {
      if (rawBeat.spokenText) {
        if (!policyLimits.allowSpokenText) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
        spokenText = materializeStatement(rawBeat.spokenText, "spoken");
      }
      if (rawBeat.onScreenText) {
        if (!policyLimits.allowOnScreenText) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
        onScreenText = materializeStatement(rawBeat.onScreenText, "onscreen");
      }
    } catch (e: any) {
      return { valid: false, errorCode: e.errorCode ?? "SCRIPT_PROVIDER_INVALID_OUTPUT" };
    }

    // "Não basta vender" (pedido do Heber 2026-09-22): quando a policy
    // exige menção de seguir, ela pode aparecer em qualquer statement
    // do beat (CTA ou não — ex. embutida no spokenText do gancho),
    // então checa o texto bruto combinado, não só statements kind=CTA.
    if (ctaIntent?.followPhraseNormalized) {
      const combined = normalizeKeyword(`${rawBeat.spokenText?.text ?? ""} ${rawBeat.onScreenText?.text ?? ""}`);
      if (combined.includes(ctaIntent.followPhraseNormalized)) hasFollowCtaMention = true;
    }

    if (!rawBeat.visualIntent?.text) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
    const visualRefs = Array.isArray(rawBeat.visualIntent.referencedFacts) ? rawBeat.visualIntent.referencedFacts : [];
    if (visualRefs.some((r: any) => r.type === "TREND_EVIDENCE")) return { valid: false, errorCode: "SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION" };
    const visualIntent = { text: rawBeat.visualIntent.text };

    if (!spokenText && !onScreenText && !visualIntent.text) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };

    materializedBeats.push({
      beatIndex: rawBeat.beatIndex,
      purpose: rawBeat.purpose,
      ...(spokenText ? { spokenText } : {}),
      ...(onScreenText ? { onScreenText } : {}),
      visualIntent,
      ...(rawBeat.targetDurationSeconds != null ? { targetDurationSeconds: rawBeat.targetDurationSeconds } : {}),
    });
  }

  materializedBeats.sort((a, b) => a.beatIndex - b.beatIndex);
  if (materializedBeats[0]?.beatIndex !== 0) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };

  if (policyLimits.requireHook && !hasHookBeat) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
  if (policyLimits.requireCta && !hasCtaStatementWithKeyword) return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
  if (policyLimits.requireCta && ctaIntent?.followPhraseNormalized && !hasFollowCtaMention) return { valid: false, errorCode: "SCRIPT_CTA_MISSING_FOLLOW_MENTION" };
  if (ctaIntent?.mechanism && ctaIntent.mechanism !== "NONE" && policyLimits.requireCta && !hasCtaBeat && !materializedBeats.some((b) => b.spokenText?.kind === "CTA" || b.onScreenText?.kind === "CTA")) {
    return { valid: false, errorCode: "SCRIPT_PROVIDER_INVALID_OUTPUT" };
  }

  return { valid: true, beats: materializedBeats };
}
