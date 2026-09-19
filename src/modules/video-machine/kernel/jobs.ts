import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "./canonicalHash";
import type {
  ExternalEffectObservation,
  JobExecutionOutcome,
  JobExecutionSettlementDisposition,
  RetryPolicy,
} from "./types";

/**
 * Skill02 — gestor de fila de jobs. Fase 1: caminho RUN_SCOPED só.
 * Fonte normativa: src/modules/video-machine/skills/02-gestor-de-fila-jobs/SPEC.md.
 */

type ExecutionScopeRef = {
  executionScope: "RUN_SCOPED";
  productionRunId: string;
  productionRunHash: string;
  stageExecutionId: string;
  stageExecutionHash: string;
};

/** ensureJob — idempotente por UNIQUE(tenantId, logicalJobKey). PAYLOAD_CONFLICT se payloadHash divergir. */
export async function ensureJob(
  db: SupabaseClient,
  params: {
    tenantId: string;
    logicalJobKey: string;
    payload: unknown;
    retryPolicy: RetryPolicy;
    executionScope: "RUN_SCOPED";
    executionScopeRef: ExecutionScopeRef;
    productionRunId: string;
    stageKey: string;
    subjectType: string;
    subjectId: string;
    stageWorkUnitIdentityHash: string;
  }
): Promise<string> {
  const payloadHash = canonicalHash("JOB_PAYLOAD_V1", params.payload as any);

  const { data: existing, error: existingErr } = await db
    .from("video_machine_job")
    .select("id, payload_hash")
    .eq("tenant_id", params.tenantId)
    .eq("logical_job_key", params.logicalJobKey)
    .maybeSingle();
  if (existingErr) throw new Error(`ensureJob: read failed: ${existingErr.message}`);

  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new Error("PAYLOAD_CONFLICT: mesmo logicalJobKey, payloadHash diferente");
    }
    return existing.id;
  }

  const { data: inserted, error: insertErr } = await db
    .from("video_machine_job")
    .insert({
      logical_job_key: params.logicalJobKey,
      payload_hash: payloadHash,
      tenant_id: params.tenantId,
      status: "QUEUED",
      attempt_count: 0,
      retry_policy: params.retryPolicy,
      lease_fence: 0,
      available_at: new Date().toISOString(),
      version: 0,
      payload: params.payload,
      execution_scope: params.executionScope,
      execution_scope_ref: params.executionScopeRef,
      production_run_id: params.productionRunId,
      stage_key: params.stageKey,
      subject_type: params.subjectType,
      subject_id: params.subjectId,
      stage_work_unit_identity_hash: params.stageWorkUnitIdentityHash,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    // 23505 = unique_violation — outro caller já criou o Job com o mesmo logicalJobKey nesse meio-tempo. Replay-safe: relê.
    if (insertErr?.code === "23505") {
      const { data: raced } = await db
        .from("video_machine_job")
        .select("id, payload_hash")
        .eq("tenant_id", params.tenantId)
        .eq("logical_job_key", params.logicalJobKey)
        .single();
      if (raced && raced.payload_hash === payloadHash) return raced.id;
    }
    throw new Error(`ensureJob: insert failed: ${insertErr?.message}`);
  }
  return inserted.id;
}

export type AcquireLeaseResult =
  | { disposition: "ACCEPTED"; leaseFence: number; attemptNumber: number; committedVersion: number }
  | { disposition: "LEASE_DENIED"; reason: string };

/** acquireLease — CAS via UPDATE...WHERE version=expected (atômico no Postgres). */
export async function acquireLease(
  db: SupabaseClient,
  params: { jobId: string; workerId: string; ttlSeconds: number }
): Promise<AcquireLeaseResult> {
  const { data: job, error: jobErr } = await db
    .from("video_machine_job")
    .select("id, status, version, lease_fence, lease_expires_at, attempt_count, available_at")
    .eq("id", params.jobId)
    .single();
  if (jobErr || !job) return { disposition: "LEASE_DENIED", reason: "job não encontrado" };

  const now = Date.now();
  const leaseExpired = !job.lease_expires_at || new Date(job.lease_expires_at).getTime() < now;
  const eligibleStatus = job.status === "QUEUED" || job.status === "RETRYING";
  if (!eligibleStatus) return { disposition: "LEASE_DENIED", reason: `status ${job.status} não elegível` };
  if (new Date(job.available_at).getTime() > now) return { disposition: "LEASE_DENIED", reason: "available_at no futuro" };
  if (!leaseExpired) return { disposition: "LEASE_DENIED", reason: "lease ativa de outro worker" };

  const nextFence = job.lease_fence + 1;
  const nextVersion = job.version + 1;
  const nextAttemptNumber = job.attempt_count + 1;

  const { data: updated, error: updateErr } = await db
    .from("video_machine_job")
    .update({
      status: "RUNNING",
      lease_owner: params.workerId,
      lease_expires_at: new Date(now + params.ttlSeconds * 1000).toISOString(),
      lease_fence: nextFence,
      version: nextVersion,
      attempt_count: nextAttemptNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.jobId)
    .eq("version", job.version)
    .select("id")
    .maybeSingle();
  if (updateErr) throw new Error(`acquireLease: update failed: ${updateErr.message}`);
  if (!updated) return { disposition: "LEASE_DENIED", reason: "version conflict (race concorrente)" };

  const { error: attemptErr } = await db.from("video_machine_job_attempt").insert({
    job_id: params.jobId,
    attempt_number: nextAttemptNumber,
    started_at: new Date().toISOString(),
  });
  if (attemptErr) throw new Error(`acquireLease: insert attempt failed: ${attemptErr.message}`);

  return { disposition: "ACCEPTED", leaseFence: nextFence, attemptNumber: nextAttemptNumber, committedVersion: nextVersion };
}

export type BeginExternalSubmissionResult =
  | { disposition: "ACCEPTED"; committedVersion: number }
  | { disposition: "ALREADY_CONFIRMED" }
  | { disposition: "RECONCILE_REQUIRED" }
  | { disposition: "REJECTED_STALE_FENCE" }
  | { disposition: "REJECTED_VERSION_CONFLICT" }
  | { disposition: "REJECTED_INVALID_STATE" }
  | { disposition: "PROVIDER_REQUEST_KEY_CONFLICT" };

/** beginExternalSubmission — única autoridade pra NOT_STARTED->SUBMITTING, por externalEffectOccurrenceKey. */
export async function beginExternalSubmission(
  db: SupabaseClient,
  params: {
    jobId: string;
    leaseFence: number;
    attemptNumber: number;
    externalEffectOccurrenceKey: string;
    providerRequestKey?: string;
  }
): Promise<BeginExternalSubmissionResult> {
  const { data: job } = await db.from("video_machine_job").select("lease_fence").eq("id", params.jobId).single();
  if (!job || job.lease_fence !== params.leaseFence) return { disposition: "REJECTED_STALE_FENCE" };

  const { data: checkpoint } = await db
    .from("video_machine_external_effect_checkpoint")
    .select("*")
    .eq("job_id", params.jobId)
    .eq("external_effect_occurrence_key", params.externalEffectOccurrenceKey)
    .maybeSingle();

  if (!checkpoint) {
    const { data: inserted, error } = await db
      .from("video_machine_external_effect_checkpoint")
      .insert({
        job_id: params.jobId,
        external_effect_occurrence_key: params.externalEffectOccurrenceKey,
        provider_request_key: params.providerRequestKey ?? null,
        state: "SUBMITTING",
        first_attempt_number: params.attemptNumber,
        last_attempt_number: params.attemptNumber,
        version: 0,
      })
      .select("version")
      .single();
    if (error?.code === "23505") return beginExternalSubmission(db, params); // race: outro caller já criou — relê e reavalia
    if (error || !inserted) throw new Error(`beginExternalSubmission: insert failed: ${error?.message}`);
    return { disposition: "ACCEPTED", committedVersion: inserted.version };
  }

  if (checkpoint.provider_request_key && params.providerRequestKey && checkpoint.provider_request_key !== params.providerRequestKey) {
    return { disposition: "PROVIDER_REQUEST_KEY_CONFLICT" };
  }

  if (checkpoint.state === "NOT_STARTED") {
    const { data: updated, error } = await db
      .from("video_machine_external_effect_checkpoint")
      .update({
        state: "SUBMITTING",
        provider_request_key: checkpoint.provider_request_key ?? params.providerRequestKey ?? null,
        last_attempt_number: params.attemptNumber,
        version: checkpoint.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("external_effect_checkpoint_id", checkpoint.external_effect_checkpoint_id)
      .eq("version", checkpoint.version)
      .select("version")
      .maybeSingle();
    if (error) throw new Error(`beginExternalSubmission: update failed: ${error.message}`);
    if (!updated) return { disposition: "REJECTED_VERSION_CONFLICT" };
    return { disposition: "ACCEPTED", committedVersion: updated.version };
  }
  if (checkpoint.state === "CONFIRMED") return { disposition: "ALREADY_CONFIRMED" };
  if (checkpoint.state === "SUBMITTING" || checkpoint.state === "UNKNOWN") return { disposition: "RECONCILE_REQUIRED" };
  return { disposition: "REJECTED_INVALID_STATE" }; // NOT_APPLIED é terminal
}

export type ReportExternalEffectObservationResult =
  | { disposition: "ACCEPTED"; committedCheckpointVersion: number }
  | { disposition: "ALREADY_CONFIRMED" }
  | { disposition: "ALREADY_NOT_APPLIED" }
  | { disposition: "ALREADY_UNKNOWN" }
  | { disposition: "REJECTED_STALE_FENCE" }
  | { disposition: "REJECTED_VERSION_CONFLICT" }
  | { disposition: "REJECTED_INVALID_STATE" }
  | { disposition: "REJECTED_EXTERNAL_OPERATION_ID_CONFLICT" };

/** reportExternalEffectObservation — a porta de saída de SUBMITTING/UNKNOWN (R1, fechamento do BLOCKER). */
export async function reportExternalEffectObservation(
  db: SupabaseClient,
  params: {
    jobId: string;
    leaseFence: number;
    externalEffectOccurrenceKey: string;
    expectedCheckpointVersion: number;
    observation: ExternalEffectObservation;
  }
): Promise<ReportExternalEffectObservationResult> {
  const { data: job } = await db.from("video_machine_job").select("lease_fence").eq("id", params.jobId).single();
  if (!job || job.lease_fence !== params.leaseFence) return { disposition: "REJECTED_STALE_FENCE" };

  const { data: checkpoint } = await db
    .from("video_machine_external_effect_checkpoint")
    .select("*")
    .eq("job_id", params.jobId)
    .eq("external_effect_occurrence_key", params.externalEffectOccurrenceKey)
    .maybeSingle();
  if (!checkpoint) return { disposition: "REJECTED_INVALID_STATE" };
  if (checkpoint.version !== params.expectedCheckpointVersion) return { disposition: "REJECTED_VERSION_CONFLICT" };

  const obs = params.observation;
  const incomingOperationId = "externalOperationId" in obs ? obs.externalOperationId : undefined;

  if (checkpoint.state === "CONFIRMED") {
    if (obs.observation === "CONFIRMED" && (!incomingOperationId || incomingOperationId === checkpoint.external_operation_id)) {
      return { disposition: "ALREADY_CONFIRMED" };
    }
    if (obs.observation === "CONFIRMED") return { disposition: "REJECTED_EXTERNAL_OPERATION_ID_CONFLICT" };
    return { disposition: "REJECTED_INVALID_STATE" };
  }
  if (checkpoint.state === "NOT_APPLIED") {
    if (obs.observation === "NOT_APPLIED") return { disposition: "ALREADY_NOT_APPLIED" };
    return { disposition: "REJECTED_INVALID_STATE" };
  }
  if (checkpoint.state !== "SUBMITTING" && checkpoint.state !== "UNKNOWN") {
    return { disposition: "REJECTED_INVALID_STATE" };
  }

  if (checkpoint.external_operation_id && incomingOperationId && incomingOperationId !== checkpoint.external_operation_id) {
    return { disposition: "REJECTED_EXTERNAL_OPERATION_ID_CONFLICT" };
  }

  if (checkpoint.state === "UNKNOWN" && obs.observation === "UNKNOWN") {
    const sameOperationId = (checkpoint.external_operation_id ?? null) === (incomingOperationId ?? checkpoint.external_operation_id ?? null);
    const samePoll = checkpoint.next_poll_at === ((obs as any).nextPollAt ?? checkpoint.next_poll_at ?? null);
    if (sameOperationId && samePoll) return { disposition: "ALREADY_UNKNOWN" };
  }

  const nextOperationId = checkpoint.external_operation_id ?? incomingOperationId ?? null;
  const { data: updated, error } = await db
    .from("video_machine_external_effect_checkpoint")
    .update({
      state: obs.observation,
      external_operation_id: nextOperationId,
      outcome: (obs as any).outcome ?? checkpoint.outcome ?? null,
      error_code: (obs as any).errorCode ?? checkpoint.error_code ?? null,
      next_poll_at: (obs as any).nextPollAt ?? null,
      deadline_at: (obs as any).deadlineAt ?? null,
      version: checkpoint.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("external_effect_checkpoint_id", checkpoint.external_effect_checkpoint_id)
    .eq("version", checkpoint.version)
    .select("version")
    .maybeSingle();
  if (error) throw new Error(`reportExternalEffectObservation: update failed: ${error.message}`);
  if (!updated) return { disposition: "REJECTED_VERSION_CONFLICT" };
  return { disposition: "ACCEPTED", committedCheckpointVersion: updated.version };
}

/**
 * Caminho canônico de saída de um Attempt (JobExecutionResult + JobExecutionSettlement)
 * — JobExecutionReport é LEGACY/SUPERSEDED, não implementado aqui.
 * Fase 1: só os desfechos SUCCEEDED/FAILED do handler echo.
 */
export async function reportJobExecutionResult(
  db: SupabaseClient,
  params: {
    jobId: string;
    tenantId: string;
    leaseFence: number;
    attemptNumber: number;
    outcome: JobExecutionOutcome;
    resultRef?: unknown;
    reasonCode?: string;
  }
): Promise<{ settlementDisposition: JobExecutionSettlementDisposition }> {
  const { data: job, error: jobErr } = await db
    .from("video_machine_job")
    .select("*")
    .eq("id", params.jobId)
    .single();
  if (jobErr || !job) throw new Error(`reportJobExecutionResult: job não encontrado: ${jobErr?.message}`);
  if (job.lease_fence !== params.leaseFence) throw new Error("REJECTED_STALE_FENCE");

  const executionResultKey = `${params.jobId}:${params.attemptNumber}:${params.leaseFence}`;
  const executionResultHash = canonicalHash("JOB_EXECUTION_RESULT_V1", {
    jobId: params.jobId,
    attemptNumber: params.attemptNumber,
    outcome: params.outcome,
  });

  const { data: result, error: resultErr } = await db
    .from("video_machine_job_execution_result")
    .insert({
      execution_result_key: executionResultKey,
      tenant_id: params.tenantId,
      job_id: params.jobId,
      attempt_id: `${params.jobId}:${params.attemptNumber}`,
      attempt_number: params.attemptNumber,
      lease_fence: params.leaseFence,
      handler_invocation_key: executionResultKey,
      execution_context_hash: executionResultHash,
      job_execution_binding_id: "echo-binding-v1",
      job_execution_binding_hash: "echo-binding-v1",
      execution_scope_ref: job.execution_scope_ref,
      handler: { handlerKey: "echo" },
      outcome: params.outcome,
      result_ref: params.resultRef ?? null,
      failure: params.outcome === "FAILED" ? { reasonCode: params.reasonCode } : null,
      execution_result_hash: executionResultHash,
    })
    .select("job_execution_result_id, execution_result_hash")
    .single();
  if (resultErr || !result) throw new Error(`reportJobExecutionResult: insert result failed: ${resultErr?.message}`);

  const disposition: JobExecutionSettlementDisposition =
    params.outcome === "SUCCEEDED" ? "JOB_SUCCEEDED" : params.outcome === "FAILED" ? "JOB_FAILED_TERMINAL" : "CONTINUE_SAME_ATTEMPT";

  const settlementKey = `${executionResultKey}:settlement`;
  const settlementHash = canonicalHash("JOB_EXECUTION_SETTLEMENT_V1", { executionResultKey, disposition });
  const { error: settlementErr } = await db.from("video_machine_job_execution_settlement").insert({
    settlement_key: settlementKey,
    tenant_id: params.tenantId,
    job_id: params.jobId,
    attempt_id: `${params.jobId}:${params.attemptNumber}`,
    attempt_number: params.attemptNumber,
    job_execution_result_id: result.job_execution_result_id,
    job_execution_result_hash: result.execution_result_hash,
    disposition,
    consumer_visibility: "EMIT",
    settlement_hash: settlementHash,
  });
  if (settlementErr) throw new Error(`reportJobExecutionResult: insert settlement failed: ${settlementErr.message}`);

  const newStatus = disposition === "JOB_SUCCEEDED" ? "SUCCEEDED" : disposition === "JOB_FAILED_TERMINAL" ? "FAILED" : job.status;
  const { error: jobUpdateErr } = await db
    .from("video_machine_job")
    .update({ status: newStatus, version: job.version + 1, updated_at: new Date().toISOString() })
    .eq("id", params.jobId)
    .eq("version", job.version);
  if (jobUpdateErr) throw new Error(`reportJobExecutionResult: update job failed: ${jobUpdateErr.message}`);

  if (newStatus === "SUCCEEDED" || newStatus === "FAILED") {
    const { data: event, error: eventErr } = await db
      .from("video_machine_job_result_event")
      .insert({
        tenant_id: params.tenantId,
        job_id: params.jobId,
        logical_job_key: job.logical_job_key,
        run_id: job.production_run_id,
        outcome: newStatus,
        attempt_number: params.attemptNumber,
        finished_at: new Date().toISOString(),
        result_payload: params.resultRef ?? null,
        error_code: params.reasonCode ?? null,
      })
      .select("event_id")
      .single();
    if (eventErr || !event) throw new Error(`reportJobExecutionResult: insert result event failed: ${eventErr?.message}`);
    await db.from("video_machine_outbox_consumer_delivery").insert({
      tenant_id: params.tenantId,
      event_id: event.event_id,
      consumer_key: "skill01_job_result",
      delivery_state: "PENDING",
    });
  }

  return { settlementDisposition: disposition };
}
