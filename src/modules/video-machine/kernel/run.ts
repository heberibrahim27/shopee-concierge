import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "./canonicalHash";
import {
  ECHO_PIPELINE_SNAPSHOT_HASH,
  ECHO_PIPELINE_SNAPSHOT_ID,
  ECHO_STAGE_DEFINITION_HASH,
  ECHO_STAGE_KERNEL_CONTRACT,
  ECHO_STAGE_KEY,
} from "./pipeline";
import { ensureJob } from "./jobs";
import { enqueueOutboxDelivery } from "./outbox";
import type { KernelArtifactRef } from "./types";

/**
 * Skill01 — criação de ProductionRun + primeira StageIteration/StageExecution
 * + PreparedSkillInvocation + LogicalJobIntent -> ensureJob (Skill02).
 * Fase 1: caminho RUN_SCOPED + workUnitContract=SINGLE, sem approval gate.
 */

export type StartRunResult = {
  productionRunId: string;
  stageExecutionId: string;
  jobId: string;
};

/** A9: UNIQUE(tenantId, runKey) — mesmo runKey + mesmo hash = replay idempotente. */
export async function startEchoProductionRun(
  db: SupabaseClient,
  params: { tenantId: string; runKey: string }
): Promise<StartRunResult> {
  const { tenantId, runKey } = params;

  const creationRef = { sourceKind: "MANUAL_TEST", sourceId: runKey, sourceHash: "n/a" };
  const initialArtifactRefs: KernelArtifactRef[] = [];
  const productionRunHash = canonicalHash("PRODUCTION_RUN_V1", {
    tenantId,
    runKey,
    pipelineSnapshotId: ECHO_PIPELINE_SNAPSHOT_ID,
    pipelineSnapshotHash: ECHO_PIPELINE_SNAPSHOT_HASH,
    creationRef,
    initialArtifactRefs,
  });

  const { data: existingRun, error: existingRunErr } = await db
    .from("video_machine_production_run")
    .select("production_run_id, production_run_hash")
    .eq("tenant_id", tenantId)
    .eq("run_key", runKey)
    .maybeSingle();
  if (existingRunErr) throw new Error(`startEchoProductionRun: read existing run failed: ${existingRunErr.message}`);

  let productionRunId: string;
  if (existingRun) {
    if (existingRun.production_run_hash !== productionRunHash) {
      throw new Error("RUN_CREATION_REPLAY_CONFLICT: mesmo runKey, hash diferente");
    }
    productionRunId = existingRun.production_run_id;
  } else {
    const { data: inserted, error: insertErr } = await db
      .from("video_machine_production_run")
      .insert({
        tenant_id: tenantId,
        run_key: runKey,
        pipeline_snapshot_id: ECHO_PIPELINE_SNAPSHOT_ID,
        pipeline_snapshot_hash: ECHO_PIPELINE_SNAPSHOT_HASH,
        creation_ref: creationRef,
        initial_artifact_refs: initialArtifactRefs,
        production_run_hash: productionRunHash,
      })
      .select("production_run_id")
      .single();
    if (insertErr || !inserted) throw new Error(`startEchoProductionRun: insert run failed: ${insertErr?.message}`);
    productionRunId = inserted.production_run_id;

    const { error: rtErr } = await db.from("video_machine_production_run_runtime_state").insert({
      production_run_id: productionRunId,
      tenant_id: tenantId,
      status: "RUNNING",
      version: 0,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (rtErr) throw new Error(`startEchoProductionRun: insert runtime_state failed: ${rtErr.message}`);
  }

  const stageExecutionId = await ensureFirstStageExecution(db, { tenantId, productionRunId, productionRunHash });
  const jobId = await ensureJobForStageExecution(db, { tenantId, productionRunId, stageExecutionId });

  return { productionRunId, stageExecutionId, jobId };
}

async function ensureFirstStageExecution(
  db: SupabaseClient,
  params: { tenantId: string; productionRunId: string; productionRunHash: string }
): Promise<string> {
  const { tenantId, productionRunId, productionRunHash } = params;

  const { data: existingExecs, error: existingExecsErr } = await db
    .from("video_machine_stage_execution")
    .select("stage_execution_id")
    .eq("production_run_id", productionRunId)
    .eq("stage_key", ECHO_STAGE_KEY)
    .order("execution_ordinal", { ascending: true })
    .limit(1);
  if (existingExecsErr) throw new Error(`ensureFirstStageExecution: read failed: ${existingExecsErr.message}`);
  if (existingExecs && existingExecs.length > 0) return existingExecs[0].stage_execution_id;

  const stageIterationHash = canonicalHash("STAGE_ITERATION_V1", {
    productionRunId,
    stageKey: ECHO_STAGE_KEY,
    iterationOrdinal: 1,
    kind: "INITIAL",
    seedArtifactRefs: [],
  });
  const { data: iteration, error: iterationErr } = await db
    .from("video_machine_stage_iteration")
    .insert({
      production_run_id: productionRunId,
      tenant_id: tenantId,
      stage_key: ECHO_STAGE_KEY,
      iteration_ordinal: 1,
      kind: "INITIAL",
      seed_artifact_refs: [],
      stage_iteration_hash: stageIterationHash,
    })
    .select("stage_iteration_id")
    .single();
  if (iterationErr || !iteration) throw new Error(`ensureFirstStageExecution: insert iteration failed: ${iterationErr?.message}`);

  const creationRef = { sourceKind: "RUN_START" as const, sourceId: productionRunId, sourceHash: productionRunHash };
  const stageExecutionHash = canonicalHash("STAGE_EXECUTION_V1", {
    productionRunId,
    productionRunHash,
    stageIterationId: iteration.stage_iteration_id,
    stageIterationHash,
    stageKey: ECHO_STAGE_KEY,
    stageWorkUnitIdentityHash: "echo-base-work-unit-v1",
    stageDefinitionHash: ECHO_STAGE_DEFINITION_HASH,
    stageKernelContractId: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractId,
    stageKernelContractHash: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractHash,
    executionOrdinal: 1,
    creationRef,
    upstreamArtifactRefs: [],
  });

  const { data: execution, error: executionErr } = await db
    .from("video_machine_stage_execution")
    .insert({
      production_run_id: productionRunId,
      production_run_hash: productionRunHash,
      tenant_id: tenantId,
      stage_iteration_id: iteration.stage_iteration_id,
      stage_iteration_hash: stageIterationHash,
      stage_key: ECHO_STAGE_KEY,
      stage_work_unit_identity_hash: "echo-base-work-unit-v1",
      stage_definition_hash: ECHO_STAGE_DEFINITION_HASH,
      stage_kernel_contract_id: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractId,
      stage_kernel_contract_hash: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractHash,
      execution_ordinal: 1,
      creation_ref: creationRef,
      upstream_artifact_refs: [],
      stage_execution_hash: stageExecutionHash,
    })
    .select("stage_execution_id")
    .single();
  if (executionErr || !execution) throw new Error(`ensureFirstStageExecution: insert execution failed: ${executionErr?.message}`);

  const { error: execRtErr } = await db.from("video_machine_stage_execution_runtime_state").insert({
    stage_execution_id: execution.stage_execution_id,
    tenant_id: tenantId,
    state: "PREPARED",
    version: 0,
    updated_at: new Date().toISOString(),
  });
  if (execRtErr) throw new Error(`ensureFirstStageExecution: insert runtime_state failed: ${execRtErr.message}`);

  await db
    .from("video_machine_production_run_runtime_state")
    .update({
      active_stage_iteration_id: iteration.stage_iteration_id,
      active_stage_iteration_hash: stageIterationHash,
      active_stage_execution_ids: [execution.stage_execution_id],
      updated_at: new Date().toISOString(),
    })
    .eq("production_run_id", productionRunId);

  return execution.stage_execution_id;
}

async function ensureJobForStageExecution(
  db: SupabaseClient,
  params: { tenantId: string; productionRunId: string; stageExecutionId: string }
): Promise<string> {
  const { tenantId, productionRunId, stageExecutionId } = params;

  const { data: exec, error: execErr } = await db
    .from("video_machine_stage_execution")
    .select("stage_execution_hash, production_run_hash")
    .eq("stage_execution_id", stageExecutionId)
    .single();
  if (execErr || !exec) throw new Error(`ensureJobForStageExecution: read execution failed: ${execErr?.message}`);

  const inputPayloadRef: KernelArtifactRef = {
    ownerSkillId: "echo",
    artifactType: "EchoInput",
    artifactId: stageExecutionId,
    artifactHash: canonicalHash("ECHO_INPUT_V1", { stageExecutionId }),
    schemaVersion: "v1",
  };
  const preparationContextHash = canonicalHash("STAGE_EXECUTION_PREPARATION_CONTEXT_V1", {
    stageExecutionId,
    stageExecutionHash: exec.stage_execution_hash,
  });
  const invocationKey = `${tenantId}:${productionRunId}:${stageExecutionId}:${ECHO_STAGE_KERNEL_CONTRACT.executionAdapter.adapterDescriptorHash}:${preparationContextHash}`;
  const preparedInvocationHash = canonicalHash("PREPARED_SKILL_INVOCATION_V1", {
    tenantId,
    productionRunId,
    productionRunHash: exec.production_run_hash,
    stageExecutionId,
    stageExecutionHash: exec.stage_execution_hash,
    targetSkillId: "echo",
    executionAdapter: { ...ECHO_STAGE_KERNEL_CONTRACT.executionAdapter },
    invocationKey,
    inputPayloadRef,
    preparationContextHash,
  });

  const { data: existingInvocation } = await db
    .from("video_machine_prepared_skill_invocation")
    .select("prepared_invocation_id")
    .eq("invocation_key", invocationKey)
    .maybeSingle();

  let preparedInvocationId: string;
  if (existingInvocation) {
    preparedInvocationId = existingInvocation.prepared_invocation_id;
  } else {
    const { data: inserted, error: insertErr } = await db
      .from("video_machine_prepared_skill_invocation")
      .insert({
        tenant_id: tenantId,
        production_run_id: productionRunId,
        production_run_hash: exec.production_run_hash,
        stage_execution_id: stageExecutionId,
        stage_execution_hash: exec.stage_execution_hash,
        target_skill_id: "echo",
        execution_adapter: { ...ECHO_STAGE_KERNEL_CONTRACT.executionAdapter },
        invocation_key: invocationKey,
        input_payload_ref: inputPayloadRef,
        preparation_context_hash: preparationContextHash,
        prepared_invocation_hash: preparedInvocationHash,
      })
      .select("prepared_invocation_id")
      .single();
    if (insertErr || !inserted) throw new Error(`ensureJobForStageExecution: insert invocation failed: ${insertErr?.message}`);
    preparedInvocationId = inserted.prepared_invocation_id;
  }

  const logicalJobKey = `RUN:${tenantId}:${productionRunId}:${stageExecutionId}:${preparedInvocationHash}`;

  const { data: existingIntent } = await db
    .from("video_machine_logical_job_intent")
    .select("intent_id")
    .eq("tenant_id", tenantId)
    .eq("logical_job_key", logicalJobKey)
    .maybeSingle();

  if (!existingIntent) {
    const { data: intent, error: intentErr } = await db
      .from("video_machine_logical_job_intent")
      .insert({
        tenant_id: tenantId,
        logical_job_key: logicalJobKey,
        stage_execution_id: stageExecutionId,
        prepared_invocation_hash: preparedInvocationHash,
        payload: { preparedInvocationId },
      })
      .select("intent_id")
      .single();
    if (intentErr || !intent) throw new Error(`ensureJobForStageExecution: insert intent failed: ${intentErr?.message}`);
    await enqueueOutboxDelivery(db, { tenantId, eventId: intent.intent_id, consumerKey: "skill02_ensure_job" });
  }

  const jobId = await ensureJob(db, {
    tenantId,
    logicalJobKey,
    payload: { preparedInvocationId, inputPayloadRef },
    retryPolicy: { maxAttempts: 3, backoff: "FIXED", eligibilityModel: "HANDLER_ADVICE_AND_EXECUTION_SAFETY" },
    executionScope: "RUN_SCOPED",
    executionScopeRef: {
      executionScope: "RUN_SCOPED",
      productionRunId,
      productionRunHash: exec.production_run_hash,
      stageExecutionId,
      stageExecutionHash: exec.stage_execution_hash,
    },
    productionRunId,
    stageKey: ECHO_STAGE_KEY,
    subjectType: "RUN",
    subjectId: productionRunId,
    stageWorkUnitIdentityHash: "echo-base-work-unit-v1",
  });

  return jobId;
}
