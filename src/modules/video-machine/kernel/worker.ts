import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { acquireLease, reportJobExecutionResult } from "./jobs";
import { runEchoHandler } from "./echoHandler";
import { drainPendingRunTransitions } from "./transitions";

/**
 * Uma passada do worker (Skill02): reivindica Jobs QUEUED/RETRYING
 * elegíveis do tenant, executa o handler echo, reporta o resultado, e
 * drena as transições pendentes do kernel (Skill01). Chamado pelo cron
 * route (Fase 1: não registrado em vercel.json ainda — só teste manual).
 */
export async function runWorkerPass(
  db: SupabaseClient,
  params: { tenantId: string; maxJobs?: number }
): Promise<{ claimed: number; succeeded: number; failed: number; transitionsResolved: number }> {
  const maxJobs = params.maxJobs ?? 10;
  const workerId = `worker-${randomUUID()}`;

  const { data: eligible, error } = await db
    .from("video_machine_job")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .in("status", ["QUEUED", "RETRYING"])
    .lte("available_at", new Date().toISOString())
    .limit(maxJobs);
  if (error) throw new Error(`runWorkerPass: read eligible jobs failed: ${error.message}`);

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of eligible ?? []) {
    const lease = await acquireLease(db, { jobId: row.id, workerId, ttlSeconds: 60 });
    if (lease.disposition !== "ACCEPTED") continue;
    claimed += 1;

    const result = await runEchoHandler(db, {
      jobId: row.id,
      leaseFence: lease.leaseFence,
      attemptNumber: lease.attemptNumber,
      exerciseExternalEffect: false,
    });

    await reportJobExecutionResult(db, {
      jobId: row.id,
      tenantId: params.tenantId,
      leaseFence: lease.leaseFence,
      attemptNumber: lease.attemptNumber,
      outcome: result.outcome,
      reasonCode: result.reasonCode,
    });

    if (result.outcome === "SUCCEEDED") succeeded += 1;
    else failed += 1;
  }

  const transitionsResolved = await drainPendingRunTransitions(db, params.tenantId);

  return { claimed, succeeded, failed, transitionsResolved };
}
