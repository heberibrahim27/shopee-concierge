/**
 * Verificação da Fase 1 do kernel da Máquina de Vídeos (Skill01+02) —
 * roda contra o Supabase real (babamanager-pro, não há banco de dev
 * separado). Usa um tenantId claramente marcado de teste e limpa as
 * próprias linhas no final, mesmo em caso de falha.
 *
 * Uso: npx tsx scripts/test-video-machine-kernel.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { canonicalHash } from "../src/modules/video-machine/kernel/canonicalHash";
import { startEchoProductionRun } from "../src/modules/video-machine/kernel/run";
import { runWorkerPass } from "../src/modules/video-machine/kernel/worker";
import { acquireLease, beginExternalSubmission } from "../src/modules/video-machine/kernel/jobs";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

async function cleanup() {
  const { data: runs } = await db.from("video_machine_production_run").select("production_run_id").eq("tenant_id", TENANT_ID);
  const runIds = (runs ?? []).map((r) => r.production_run_id);

  const { data: jobs } = await db.from("video_machine_job").select("id").eq("tenant_id", TENANT_ID);
  const jobIds = (jobs ?? []).map((j) => j.id);

  if (jobIds.length > 0) {
    await db.from("video_machine_external_effect_checkpoint").delete().in("job_id", jobIds);
    await db.from("video_machine_job_attempt").delete().in("job_id", jobIds);
    await db.from("video_machine_job_execution_settlement").delete().in("job_id", jobIds);
    await db.from("video_machine_job_execution_result").delete().in("job_id", jobIds);
    await db.from("video_machine_job_result_event").delete().in("job_id", jobIds);
    await db.from("video_machine_job_blocked_event").delete().in("job_id", jobIds);
  }
  await db.from("video_machine_outbox_consumer_delivery").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_job").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_logical_job_intent").delete().eq("tenant_id", TENANT_ID);

  if (runIds.length > 0) {
    await db.from("video_machine_skill_execution_resolution").delete().in("production_run_id", runIds);
    await db.from("video_machine_prepared_skill_invocation").delete().in("production_run_id", runIds);
    await db.from("video_machine_stage_execution_runtime_state").delete().in(
      "stage_execution_id",
      (await db.from("video_machine_stage_execution").select("stage_execution_id").in("production_run_id", runIds)).data?.map((r) => r.stage_execution_id) ?? []
    );
    await db.from("video_machine_stage_execution").delete().in("production_run_id", runIds);
    await db.from("video_machine_stage_iteration").delete().in("production_run_id", runIds);
    await db.from("video_machine_production_run_runtime_state").delete().in("production_run_id", runIds);
  }
  await db.from("video_machine_production_run").delete().eq("tenant_id", TENANT_ID);
}

async function testCanonicalHashVector() {
  // Vetor de teste normativo — contracts/CANONICAL-SERIALIZATION.md, seção 38.
  const digest = canonicalHash("EXAMPLE_V1", { b: "é", a: 1 });
  console.log(`canonicalHash(EXAMPLE_V1, {b:'é',a:1}) = ${digest}`);
  assert.equal(digest.length, 64, "digest deve ter 64 chars hex");
  assert.match(digest, /^[0-9a-f]{64}$/, "digest deve ser lowercase hex");
  console.log("OK: canonicalHash produz digest bem formado (64 hex lowercase) para o vetor EXAMPLE_V1.");
}

async function testHappyPath() {
  const runKey = `happy-${Date.now()}`;
  const { productionRunId, stageExecutionId, jobId } = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey });
  assert.ok(productionRunId && stageExecutionId && jobId, "startEchoProductionRun deve retornar ids");

  const pass1 = await runWorkerPass(db, { tenantId: TENANT_ID });
  assert.equal(pass1.claimed, 1, "worker deve reivindicar exatamente 1 Job");
  assert.equal(pass1.succeeded, 1, "handler echo deve suceder");
  assert.equal(pass1.transitionsResolved, 1, "worker deve resolver a transição do Run");

  const { data: runState } = await db
    .from("video_machine_production_run_runtime_state")
    .select("status, terminal_at")
    .eq("production_run_id", productionRunId)
    .single();
  assert.equal(runState?.status, "SUCCEEDED", "Run deve chegar a SUCCEEDED");
  assert.ok(runState?.terminal_at, "terminal_at deve estar preenchido");

  const { data: job } = await db.from("video_machine_job").select("status, attempt_count").eq("id", jobId).single();
  assert.equal(job?.status, "SUCCEEDED");
  assert.equal(job?.attempt_count, 1);

  const { data: settlement } = await db.from("video_machine_job_execution_settlement").select("disposition").eq("job_id", jobId).single();
  assert.equal(settlement?.disposition, "JOB_SUCCEEDED");

  const { data: delivery } = await db
    .from("video_machine_outbox_consumer_delivery")
    .select("delivery_state")
    .eq("consumer_key", "skill01_job_result")
    .limit(1)
    .maybeSingle();
  assert.equal(delivery?.delivery_state, "DELIVERED");

  console.log("OK: caminho feliz — Run SUCCEEDED, Job SUCCEEDED, settlement JOB_SUCCEEDED, outbox DELIVERED.");
}

async function testReplayIdempotency() {
  const runKey = `replay-${Date.now()}`;
  const first = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey });
  const second = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey });
  assert.equal(first.productionRunId, second.productionRunId, "mesmo runKey deve reusar o mesmo ProductionRun");
  assert.equal(first.stageExecutionId, second.stageExecutionId, "replay não deve criar StageExecution duplicada");
  assert.equal(first.jobId, second.jobId, "replay não deve criar Job duplicado");

  const { data: execs } = await db
    .from("video_machine_stage_execution")
    .select("stage_execution_id")
    .eq("production_run_id", first.productionRunId);
  assert.equal(execs?.length, 1, "replay não deve duplicar StageExecution");

  console.log("OK: replay do mesmo runKey é idempotente (sem duplicar Run/StageExecution/Job).");
}

async function testFencingRejectsStaleWorker() {
  const runKey = `fence-${Date.now()}`;
  const { jobId } = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey });

  const leaseA = await acquireLease(db, { jobId, workerId: "worker-A", ttlSeconds: 60 });
  assert.equal(leaseA.disposition, "ACCEPTED");
  if (leaseA.disposition !== "ACCEPTED") return;

  // Fence antigo (0, antes do acquire) tentando begin -> deve ser rejeitado.
  const staleBegin = await beginExternalSubmission(db, {
    jobId,
    leaseFence: 0,
    attemptNumber: leaseA.attemptNumber,
    externalEffectOccurrenceKey: `fence-test:${jobId}`,
  });
  assert.equal(staleBegin.disposition, "REJECTED_STALE_FENCE", "fence velho deve ser rejeitado");

  // Fence correto -> aceito.
  const validBegin = await beginExternalSubmission(db, {
    jobId,
    leaseFence: leaseA.leaseFence,
    attemptNumber: leaseA.attemptNumber,
    externalEffectOccurrenceKey: `fence-test:${jobId}`,
  });
  assert.equal(validBegin.disposition, "ACCEPTED", "fence correto deve ser aceito");

  // Segunda tentativa de acquireLease (simulando outro worker concorrente,
  // mesmo job já RUNNING) deve ser negada — status não é mais elegível.
  const leaseB = await acquireLease(db, { jobId, workerId: "worker-B", ttlSeconds: 60 });
  assert.equal(leaseB.disposition, "LEASE_DENIED", "segunda tentativa de lease no mesmo Job já RUNNING deve ser negada");

  console.log("OK: fencing rejeita fence velho (worker zumbi) e lease concorrente no mesmo Job.");
}

async function testExternalEffectCheckpointConfirms() {
  const runKey = `effect-${Date.now()}`;
  const { jobId } = await startEchoProductionRun(db, { tenantId: TENANT_ID, runKey });
  const lease = await acquireLease(db, { jobId, workerId: "worker-effect", ttlSeconds: 60 });
  assert.equal(lease.disposition, "ACCEPTED");
  if (lease.disposition !== "ACCEPTED") return;

  const { runEchoHandler } = await import("../src/modules/video-machine/kernel/echoHandler");
  const result = await runEchoHandler(db, {
    jobId,
    leaseFence: lease.leaseFence,
    attemptNumber: lease.attemptNumber,
    exerciseExternalEffect: true,
  });
  assert.equal(result.outcome, "SUCCEEDED");

  const { data: checkpoint } = await db
    .from("video_machine_external_effect_checkpoint")
    .select("state, external_operation_id, provider_request_key")
    .eq("job_id", jobId)
    .single();
  assert.equal(checkpoint?.state, "CONFIRMED");
  assert.equal(checkpoint?.external_operation_id, `echo-op:${jobId}`);
  assert.equal(checkpoint?.provider_request_key, `echo-provider-key:${jobId}`);

  console.log("OK: ExternalEffectCheckpoint completa NOT_STARTED -> SUBMITTING -> CONFIRMED via beginExternalSubmission + reportExternalEffectObservation.");
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  try {
    await testCanonicalHashVector();
    await testHappyPath();
    await testReplayIdempotency();
    await testFencingRejectsStaleWorker();
    await testExternalEffectCheckpointConfirms();
    console.log("\nTODOS OS TESTES PASSARAM.");
  } finally {
    await cleanup();
    console.log("Limpeza concluída — linhas de teste removidas.");
  }
}

main().catch((err) => {
  console.error("FALHA:", err);
  process.exitCode = 1;
});
