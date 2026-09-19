import type { SupabaseClient } from "@supabase/supabase-js";
import { beginExternalSubmission, reportExternalEffectObservation } from "./jobs";

/**
 * Handler de domínio trivial (Skill "echo") — sem provider externo real.
 * Existe só pra provar o loop do kernel de ponta a ponta. Quando
 * `exerciseExternalEffect` é true, passa por
 * beginExternalSubmission -> reportExternalEffectObservation também,
 * provando a máquina de estados do ExternalEffectCheckpoint (R1).
 */
export async function runEchoHandler(
  db: SupabaseClient,
  params: { jobId: string; leaseFence: number; attemptNumber: number; exerciseExternalEffect: boolean }
): Promise<{ outcome: "SUCCEEDED" | "FAILED"; reasonCode?: string }> {
  if (!params.exerciseExternalEffect) {
    return { outcome: "SUCCEEDED" };
  }

  const occurrenceKey = `echo-effect:${params.jobId}`;
  const begin = await beginExternalSubmission(db, {
    jobId: params.jobId,
    leaseFence: params.leaseFence,
    attemptNumber: params.attemptNumber,
    externalEffectOccurrenceKey: occurrenceKey,
    providerRequestKey: `echo-provider-key:${params.jobId}`,
  });
  if (begin.disposition !== "ACCEPTED") {
    return { outcome: "FAILED", reasonCode: `ECHO_BEGIN_${begin.disposition}` };
  }

  const observe = await reportExternalEffectObservation(db, {
    jobId: params.jobId,
    leaseFence: params.leaseFence,
    externalEffectOccurrenceKey: occurrenceKey,
    expectedCheckpointVersion: begin.committedVersion,
    observation: { observation: "CONFIRMED", externalOperationId: `echo-op:${params.jobId}` },
  });
  if (observe.disposition !== "ACCEPTED") {
    return { outcome: "FAILED", reasonCode: `ECHO_OBSERVE_${observe.disposition}` };
  }

  return { outcome: "SUCCEEDED" };
}
