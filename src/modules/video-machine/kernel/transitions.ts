import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "./canonicalHash";
import { ECHO_STAGE_KERNEL_CONTRACT } from "./pipeline";
import { markOutboxDelivered } from "./outbox";

/**
 * Skill01 — resolve StageTransitionResolution (branch SINGLE) a partir de
 * um JobResultEvent pendente e avança o Run. Fase 1: só o caminho
 * SUCCEEDED -> RUN_TERMINAL do pipeline echo (successTransitions[0]).
 */
export async function drainPendingRunTransitions(db: SupabaseClient, tenantId: string): Promise<number> {
  const { data: pending, error } = await db
    .from("video_machine_outbox_consumer_delivery")
    .select("delivery_id, event_id")
    .eq("tenant_id", tenantId)
    .eq("consumer_key", "skill01_job_result")
    .eq("delivery_state", "PENDING");
  if (error) throw new Error(`drainPendingRunTransitions: read outbox failed: ${error.message}`);
  if (!pending || pending.length === 0) return 0;

  let resolved = 0;
  for (const delivery of pending) {
    await resolveOneJobResultEvent(db, tenantId, delivery.event_id);
    await markOutboxDelivered(db, { eventId: delivery.event_id, consumerKey: "skill01_job_result" });
    resolved += 1;
  }
  return resolved;
}

async function resolveOneJobResultEvent(db: SupabaseClient, tenantId: string, eventId: string): Promise<void> {
  const { data: event, error: eventErr } = await db
    .from("video_machine_job_result_event")
    .select("*")
    .eq("event_id", eventId)
    .single();
  if (eventErr || !event) throw new Error(`resolveOneJobResultEvent: event não encontrado: ${eventErr?.message}`);

  const { data: job, error: jobErr } = await db
    .from("video_machine_job")
    .select("production_run_id, stage_key")
    .eq("id", event.job_id)
    .single();
  if (jobErr || !job) throw new Error(`resolveOneJobResultEvent: job não encontrado: ${jobErr?.message}`);

  const { data: execution, error: execErr } = await db
    .from("video_machine_stage_execution")
    .select("stage_execution_id, stage_execution_hash, production_run_id, production_run_hash")
    .eq("production_run_id", job.production_run_id)
    .eq("stage_key", job.stage_key)
    .order("execution_ordinal", { ascending: false })
    .limit(1)
    .single();
  if (execErr || !execution) throw new Error(`resolveOneJobResultEvent: execution não encontrada: ${execErr?.message}`);

  const disposition = event.outcome === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
  const transitionKey = disposition === "SUCCEEDED" ? ECHO_STAGE_KERNEL_CONTRACT.successTransitions[0].transitionKey : undefined;

  const { data: existingResolution } = await db
    .from("video_machine_skill_execution_resolution")
    .select("skill_execution_resolution_id")
    .eq("stage_execution_id", execution.stage_execution_id)
    .maybeSingle();
  if (existingResolution) return; // já resolvida — replay-safe

  const { data: invocation } = await db
    .from("video_machine_prepared_skill_invocation")
    .select("prepared_invocation_id, prepared_invocation_hash")
    .eq("stage_execution_id", execution.stage_execution_id)
    .order("prepared_at", { ascending: false })
    .limit(1)
    .single();
  if (!invocation) throw new Error("resolveOneJobResultEvent: prepared invocation não encontrada");

  const resolutionHash = canonicalHash("SKILL_EXECUTION_RESOLUTION_V1", {
    stageExecutionId: execution.stage_execution_id,
    disposition,
    transitionKey: transitionKey ?? null,
  });
  const { error: resolutionErr } = await db.from("video_machine_skill_execution_resolution").insert({
    tenant_id: tenantId,
    production_run_id: execution.production_run_id,
    production_run_hash: execution.production_run_hash,
    stage_execution_id: execution.stage_execution_id,
    stage_execution_hash: execution.stage_execution_hash,
    prepared_invocation_id: invocation.prepared_invocation_id,
    prepared_invocation_hash: invocation.prepared_invocation_hash,
    execution_adapter: { ...ECHO_STAGE_KERNEL_CONTRACT.executionAdapter },
    handler_execution_report_ref: { ownerSkillId: "echo", artifactType: "EchoResult", artifactId: eventId, artifactHash: resolutionHash, schemaVersion: "v1" },
    disposition,
    transition_key: transitionKey ?? null,
    reason_code: disposition === "FAILED" ? (event.error_code ?? "ECHO_FAILED") : null,
    resolution_hash: resolutionHash,
  });
  if (resolutionErr) throw new Error(`resolveOneJobResultEvent: insert resolution failed: ${resolutionErr.message}`);

  await db
    .from("video_machine_stage_execution_runtime_state")
    .update({ state: "RESOLVED", resolved_execution_hash: resolutionHash, updated_at: new Date().toISOString() })
    .eq("stage_execution_id", execution.stage_execution_id);

  if (disposition !== "SUCCEEDED") {
    await db
      .from("video_machine_production_run_runtime_state")
      .update({ status: "FAILED", terminal_reason_code: event.error_code ?? "ECHO_FAILED", terminal_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("production_run_id", execution.production_run_id);
    return;
  }

  const transition = ECHO_STAGE_KERNEL_CONTRACT.successTransitions.find((t) => t.transitionKey === transitionKey);
  if (!transition) throw new Error(`resolveOneJobResultEvent: transitionKey ${transitionKey} não existe no StageKernelContract`);

  if (transition.target.kind === "RUN_TERMINAL") {
    await db
      .from("video_machine_production_run_runtime_state")
      .update({ status: transition.target.terminalStatus, terminal_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("production_run_id", execution.production_run_id);
  }
  // target.kind === "STAGE" fica fora da Fase 1 (pipeline echo só tem 1 stage).
}
