/**
 * Verificação da Skill 23 (Gestor de Créditos/Quotas) contra o
 * Supabase real. Escopo desta fase: só REQUEST AUTHORIZATION → RESERVE
 * (ver comentário no topo da migration 20260920110000) — cobre um
 * subconjunto real e testável dos 40 casos do SPEC.md (os que não
 * dependem de QuotaExecutionClaim/settlement, ainda não implementados).
 *
 * Uso: npx tsx scripts/test-video-machine-skill23.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { requestQuotaAuthorization, releaseReservation, resolveEffectiveAuthorizationDecision, type QuotaOperationIdentityInput } from "../src/modules/video-machine/skills/23-gestor-de-creditos-quotas/quotaGuard";

const TENANT_ID = `video-machine-test-${Date.now()}`;
const db = getDbFresh();

async function cleanup() {
  await db.from("video_machine_quota_ledger_entry").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_quota_reservation").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_quota_authorization").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_quota_policy_binding").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_quota_policy").delete().eq("tenant_id", TENANT_ID);
}

async function createPolicy(key: string, opts: { operationCountLimit?: number; operationCountWindow?: "DAY" | "MONTH"; monetaryControl?: any; authorizationValidity?: any; authorizationClass?: string } = {}) {
  const { data: policy, error } = await db
    .from("video_machine_quota_policy")
    .insert({
      policy_key: key,
      policy_version: "v1",
      tenant_id: TENANT_ID,
      authorization_class: opts.authorizationClass ?? "EXECUTION_SPEND",
      operation_count_limit: opts.operationCountLimit ?? null,
      operation_count_window: opts.operationCountWindow ?? null,
      monetary_control: opts.monetaryControl ?? { mode: "NOT_APPLICABLE" },
      authorization_validity: opts.authorizationValidity ?? { mode: "NO_EXPIRY" },
    })
    .select("policy_id")
    .single();
  if (error || !policy) throw new Error(`createPolicy: ${error?.message}`);
  await db.from("video_machine_quota_policy_binding").upsert({ tenant_id: TENANT_ID, policy_key: key, active_policy_id: policy.policy_id, active_policy_version: "v1" });
}

function opIdentity(overrides: Partial<QuotaOperationIdentityInput> = {}): QuotaOperationIdentityInput {
  return {
    tenantId: TENANT_ID,
    jobId: overrides.jobId ?? `job-${Math.random().toString(36).slice(2)}`,
    attemptNumber: overrides.attemptNumber ?? 1,
    providerKey: "runway",
    modelKey: "gen4-turbo",
    inputArtifactId: "video-prompt-artifact-1",
    inputArtifactHash: "VIDEO_PROMPT_ARTIFACT_V1:sha256:test",
    requestPayloadHash: overrides.requestPayloadHash ?? "PAYLOAD_V1:sha256:test",
    ...overrides,
  };
}

async function testPolicyNotConfigured() {
  const result = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "policy-que-nao-existe" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.blockReason, "QUOTA_POLICY_NOT_CONFIGURED");
  console.log("OK: policy ausente -> BLOCKED/QUOTA_POLICY_NOT_CONFIGURED (nunca assume unlimited).");
}

async function testAuthorizeAtomicWithLedger() {
  await createPolicy("op-count-basic", { operationCountLimit: 10, operationCountWindow: "DAY" });
  const result = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "op-count-basic" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "AUTHORIZED");
  if (result.outcome !== "AUTHORIZED") return;

  const { data: reservation } = await db.from("video_machine_quota_reservation").select("*").eq("reservation_id", result.reservationId).single();
  assert.equal(reservation!.status, "HELD");
  const { data: ledger } = await db.from("video_machine_quota_ledger_entry").select("*").eq("authorization_id", result.authorizationId);
  assert.equal(ledger?.length, 1);
  assert.equal(ledger![0].bucket, "RESERVED");
  assert.equal(ledger![0].movement, "INCREASE");
  console.log("OK: AUTHORIZED cria Authorization + Reservation(HELD) + ledger RESERVED-increase atomicamente (função Postgres única).");
}

async function testConcurrentRequestsOneUnitLeft() {
  await createPolicy("op-count-tight", { operationCountLimit: 1, operationCountWindow: "DAY" });
  const [r1, r2] = await Promise.all([
    requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "op-count-tight" }, { trustedTenantId: TENANT_ID }),
    requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "op-count-tight" }, { trustedTenantId: TENANT_ID }),
  ]);
  const outcomes = [r1.outcome, r2.outcome].sort();
  assert.deepEqual(outcomes, ["AUTHORIZED", "DENIED"], "com 1 unidade de limite, exatamente uma request concorrente deve ser AUTHORIZED");
  console.log("OK: duas requests concorrentes com 1 unidade de limite -> exatamente uma AUTHORIZED, a outra DENIED (pg_advisory_xact_lock serializa).");
}

async function testDenialCreatesNoReservation() {
  await createPolicy("op-count-zero", { operationCountLimit: 0, operationCountWindow: "DAY" });
  const result = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "op-count-zero" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "DENIED");
  if (result.outcome !== "DENIED") return;
  const { data: reservations } = await db.from("video_machine_quota_reservation").select("reservation_id").eq("authorization_id", result.authorizationId);
  assert.equal(reservations?.length ?? 0, 0, "DENIED nunca cria reservation");
  console.log("OK: limite excedido -> DENIED, zero QuotaReservation criada.");
}

async function testIdempotentRetransmission() {
  await createPolicy("idempotency-test", { operationCountLimit: 10, operationCountWindow: "DAY" });
  const identity = opIdentity({ jobId: "job-idempotent", attemptNumber: 1 });
  const input = { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND" as const, operationIdentity: identity, requestedResources: [{ unit: "OPERATION_COUNT" as const, amount: "1" }], quotaPolicyKey: "idempotency-test" };
  const first = await requestQuotaAuthorization(db, input, { trustedTenantId: TENANT_ID });
  assert.equal(first.outcome, "AUTHORIZED");
  const replay = await requestQuotaAuthorization(db, input, { trustedTenantId: TENANT_ID });
  assert.equal(replay.outcome, "AUTHORIZED");
  if (first.outcome === "AUTHORIZED" && replay.outcome === "AUTHORIZED") {
    assert.equal(replay.authorizationId, first.authorizationId);
    assert.equal(replay.reservationId, first.reservationId);
  }
  const { data: ledgerAfterReplay } = await db.from("video_machine_quota_ledger_entry").select("ledger_entry_id").eq("authorization_id", (first as any).authorizationId);
  assert.equal(ledgerAfterReplay?.length, 1, "retransmissão idempotente nunca cria novo consumo/ledger");
  console.log("OK: mesma operation identity (mesma Attempt) retransmitida -> mesma authorization/reservation reutilizada, zero novo ledger.");
}

async function testNewAttemptNewAuthorization() {
  await createPolicy("new-attempt-test", { operationCountLimit: 10, operationCountWindow: "DAY" });
  const jobId = "job-new-attempt";
  const a1 = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity({ jobId, attemptNumber: 1 }), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "new-attempt-test" }, { trustedTenantId: TENANT_ID });
  const a2 = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity({ jobId, attemptNumber: 2 }), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "new-attempt-test" }, { trustedTenantId: TENANT_ID });
  assert.equal(a1.outcome, "AUTHORIZED");
  assert.equal(a2.outcome, "AUTHORIZED");
  if (a1.outcome === "AUTHORIZED" && a2.outcome === "AUTHORIZED") assert.notEqual(a1.authorizationId, a2.authorizationId, "nova Attempt sempre gera nova operation identity/autorização");
  console.log("OK: attemptNumber diferente (mesmo jobId) -> nova operation identity, nova authorization (nunca reaproveita).");
}

async function testPayloadMismatchReplayConflict() {
  await createPolicy("payload-mismatch-test", { operationCountLimit: 10, operationCountWindow: "DAY" });
  const identity = opIdentity({ jobId: "job-payload-mismatch", attemptNumber: 1, requestPayloadHash: "PAYLOAD_V1:sha256:original" });
  const input1 = { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND" as const, operationIdentity: identity, requestedResources: [{ unit: "OPERATION_COUNT" as const, amount: "1" }], quotaPolicyKey: "payload-mismatch-test" };
  const first = await requestQuotaAuthorization(db, input1, { trustedTenantId: TENANT_ID });
  assert.equal(first.outcome, "AUTHORIZED");

  const identity2 = opIdentity({ jobId: "job-payload-mismatch", attemptNumber: 1, requestPayloadHash: "PAYLOAD_V1:sha256:changed" });
  const input2 = { ...input1, operationIdentity: identity2 };
  const second = await requestQuotaAuthorization(db, input2, { trustedTenantId: TENANT_ID });
  assert.equal(second.outcome, "FATAL_ERROR");
  if (second.outcome === "FATAL_ERROR") assert.equal(second.errorCode, "QUOTA_AUTHORIZATION_REQUEST_REPLAY_CONFLICT");
  console.log("OK: mesma Attempt (jobId+attemptNumber) com payload diferente -> QUOTA_AUTHORIZATION_REQUEST_REPLAY_CONFLICT, nunca reautoriza silenciosamente.");
}

async function testHardLimitWithoutExposureBlocked() {
  await createPolicy("hard-limit-test", { monetaryControl: { mode: "HARD_LIMIT", currency: "BRL", hardLimitAmount: "25", window: "DAY" } });
  const result = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "hard-limit-test" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "BLOCKED");
  if (result.outcome === "BLOCKED") assert.equal(result.blockReason, "QUOTA_UNKNOWN_COST_BLOCKED_BY_POLICY");
  console.log("OK: policy HARD_LIMIT sem MONEY no request (exposure desconhecida) -> BLOCKED/QUOTA_UNKNOWN_COST_BLOCKED_BY_POLICY (nunca autoriza sem teto confiável).");
}

async function testHardLimitWithExposureAuthorizesUnderLimit() {
  await createPolicy("hard-limit-ok-test", { monetaryControl: { mode: "HARD_LIMIT", currency: "BRL", hardLimitAmount: "1.00", window: "DAY" } });
  const authorized = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "MONEY", amount: "0.40" }], quotaPolicyKey: "hard-limit-ok-test" }, { trustedTenantId: TENANT_ID });
  assert.equal(authorized.outcome, "AUTHORIZED");
  const denied = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "MONEY", amount: "0.80" }], quotaPolicyKey: "hard-limit-ok-test" }, { trustedTenantId: TENANT_ID });
  assert.equal(denied.outcome, "DENIED");
  if (denied.outcome === "DENIED") assert.ok(denied.deniedReasons.some((r) => r.includes("MONEY")));
  console.log("OK: HARD_LIMIT com exposure declarada ($0,40 + $0,80 > teto de $1,00 do dia) -> primeira AUTHORIZED, segunda DENIED (teto respeitado de verdade).");
}

async function testCancelBeforeClaimReleases() {
  await createPolicy("release-test", { operationCountLimit: 10, operationCountWindow: "DAY" });
  const result = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "release-test" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "AUTHORIZED");
  if (result.outcome !== "AUTHORIZED") return;

  const released = await releaseReservation(db, result.reservationId, "CANCELLED_BEFORE_CLAIM");
  assert.equal(released.outcome, "RELEASED");

  const { data: reservation } = await db.from("video_machine_quota_reservation").select("status").eq("reservation_id", result.reservationId).single();
  assert.equal(reservation!.status, "RELEASED");
  const { data: ledger } = await db.from("video_machine_quota_ledger_entry").select("bucket, movement").eq("reservation_id", result.reservationId).order("created_at");
  assert.equal(ledger?.length, 2);
  assert.equal(ledger![1].movement, "DECREASE");

  const doubleRelease = await releaseReservation(db, result.reservationId, "CANCELLED_BEFORE_CLAIM");
  assert.equal(doubleRelease.outcome, "FATAL_ERROR");
  console.log("OK: cancelamento antes de claim libera a reservation (ledger DECREASE espelhado); liberar de novo é FATAL_ERROR (nunca dupla liberação).");
}

async function testExpiredUnclaimedAutoReleases() {
  await createPolicy("ttl-test", { operationCountLimit: 10, operationCountWindow: "DAY", authorizationValidity: { mode: "TTL", ttlSeconds: 1 } });
  const result = await requestQuotaAuthorization(db, { tenantId: TENANT_ID, authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity(), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "ttl-test" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "AUTHORIZED");
  if (result.outcome !== "AUTHORIZED") return;

  await new Promise((r) => setTimeout(r, 1200));
  const effective = await resolveEffectiveAuthorizationDecision(db, result.authorizationId);
  assert.equal((effective as any).decision, "EXPIRED");
  const { data: reservation } = await db.from("video_machine_quota_reservation").select("status").eq("reservation_id", result.reservationId).single();
  assert.equal(reservation!.status, "RELEASED");
  console.log("OK: authorization com TTL vencido, sem claim -> EXPIRED, reservation liberada automaticamente (unused).");
}

async function testCrossTenantMismatch() {
  const result = await requestQuotaAuthorization(db, { tenantId: "outro-tenant", authorizationClass: "EXECUTION_SPEND", operationIdentity: opIdentity({ tenantId: "outro-tenant" }), requestedResources: [{ unit: "OPERATION_COUNT", amount: "1" }], quotaPolicyKey: "qualquer" }, { trustedTenantId: TENANT_ID });
  assert.equal(result.outcome, "FATAL_ERROR");
  if (result.outcome === "FATAL_ERROR") assert.equal(result.errorCode, "QUOTA_TENANT_MISMATCH");
  console.log("OK: input.tenantId divergente do trustedTenantId -> FATAL_ERROR/QUOTA_TENANT_MISMATCH.");
}

async function cleanupLedgerOnly() {
  // Capacity é agregada por (tenant, authorizationClass, unit, windowKey) —
  // corretamente cumulativa ENTRE policies do mesmo tenant/class/dia (é
  // literalmente o que "limite diário" significa). Por isso, entre testes
  // de capacidade isolados, limpamos ledger/reservation/authorization —
  // nunca deixamos resíduo de um teste vazar limite pro próximo.
  await db.from("video_machine_quota_ledger_entry").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_quota_reservation").delete().eq("tenant_id", TENANT_ID);
  await db.from("video_machine_quota_authorization").delete().eq("tenant_id", TENANT_ID);
}

async function main() {
  console.log(`tenantId de teste: ${TENANT_ID}`);
  try {
    await testPolicyNotConfigured();
    await testAuthorizeAtomicWithLedger();
    await cleanupLedgerOnly();
    await testConcurrentRequestsOneUnitLeft();
    await cleanupLedgerOnly();
    await testDenialCreatesNoReservation();
    await cleanupLedgerOnly();
    await testIdempotentRetransmission();
    await cleanupLedgerOnly();
    await testNewAttemptNewAuthorization();
    await cleanupLedgerOnly();
    await testPayloadMismatchReplayConflict();
    await cleanupLedgerOnly();
    await testHardLimitWithoutExposureBlocked();
    await cleanupLedgerOnly();
    await testHardLimitWithExposureAuthorizesUnderLimit();
    await cleanupLedgerOnly();
    await testCancelBeforeClaimReleases();
    await cleanupLedgerOnly();
    await testExpiredUnclaimedAutoReleases();
    await cleanupLedgerOnly();
    await testCrossTenantMismatch();
    console.log("\nTODOS OS TESTES PASSARAM.");
  } finally {
    await cleanup();
    console.log("Limpeza concluída — linhas de teste removidas (pool real não foi alterado).");
  }
}

main().catch((err) => {
  console.error("FALHA:", err);
  process.exitCode = 1;
});
