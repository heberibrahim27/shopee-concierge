/**
 * Verificação da Skill 25 (Segurança/Auditoria) contra o Supabase
 * real. Escopo desta fase: SecurityFinding + lifecycle/transition,
 * SecurityControlEvidence/Decision (gate fail-closed), SecurityAuditEvent
 * (ver comentário no topo da migration 20260920140000).
 *
 * Usa findingKey com prefixo TEST- pra nunca colidir com os achados
 * reais SEC-025-* que serão seedados separadamente (script próprio,
 * não este teste) como dado permanente de produção.
 *
 * Uso: npx tsx scripts/test-video-machine-skill25.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { getDbFresh } from "../src/lib/db/client";
import { registerFinding, transitionFinding, recordControlEvidence, evaluateControlGate, logSecurityAuditEvent } from "../src/modules/video-machine/skills/25-seguranca-auditoria/securityRegistry";

const TEST_PREFIX = `TEST-SEC-${Date.now()}`;
const db = getDbFresh();

async function cleanup() {
  const { data: findings } = await db.from("video_machine_security_finding").select("security_finding_id").like("finding_key", `${TEST_PREFIX}%`);
  for (const f of findings ?? []) {
    await db.from("video_machine_security_finding_transition").delete().eq("security_finding_id", f.security_finding_id);
    await db.from("video_machine_security_finding_lifecycle").delete().eq("security_finding_id", f.security_finding_id);
  }
  await db.from("video_machine_security_finding").delete().like("finding_key", `${TEST_PREFIX}%`);
  await db.from("video_machine_security_control_evidence").delete().like("control_key", `${TEST_PREFIX}%`);
  await db.from("video_machine_security_control_decision").delete().like("control_key", `${TEST_PREFIX}%`);
  await db.from("video_machine_security_audit_event").delete().like("event_key", `${TEST_PREFIX}%`);
}

async function testRegisterFindingIdempotent() {
  const key = `${TEST_PREFIX}-DUPLICATE`;
  const first = await registerFinding(db, { findingKey: key, severity: "HIGH", controlKey: `${TEST_PREFIX}.ingress.test` });
  assert.equal(first.outcome, "REGISTERED");
  const second = await registerFinding(db, { findingKey: key, severity: "HIGH", controlKey: `${TEST_PREFIX}.ingress.test` });
  assert.equal(second.outcome, "ALREADY_EXISTS");
  assert.equal(second.securityFindingId, first.securityFindingId);

  const { data: lifecycle } = await db.from("video_machine_security_finding_lifecycle").select("status, version").eq("security_finding_id", first.securityFindingId).single();
  assert.equal(lifecycle!.status, "OPEN");
  assert.equal(lifecycle!.version, 1);

  const { data: transitions } = await db.from("video_machine_security_finding_transition").select("reason").eq("security_finding_id", first.securityFindingId);
  assert.equal(transitions?.length, 1, "registrar 2x não duplica a transição FINDING_CREATED");
  console.log("OK: registrar o mesmo findingKey 2x é idempotente (não cria duplicata nem transição extra), lifecycle nasce OPEN v1.");
}

async function testFindingLifecycleTransitions() {
  const key = `${TEST_PREFIX}-LIFECYCLE`;
  await registerFinding(db, { findingKey: key, severity: "CRITICAL", controlKey: `${TEST_PREFIX}.ingress.test` });

  const contained = await transitionFinding(db, key, "CONTAINED", "IMMEDIATE_CONTAINMENT_APPLIED", ["evidence-ref-1"]);
  assert.equal(contained.outcome, "TRANSITIONED");
  if (contained.outcome === "TRANSITIONED") assert.equal(contained.newVersion, 2);

  const resolved = await transitionFinding(db, key, "RESOLVED", "CONTROL_VERIFIED_FIXED", ["evidence-ref-2"]);
  assert.equal(resolved.outcome, "TRANSITIONED");
  if (resolved.outcome === "TRANSITIONED") assert.equal(resolved.newVersion, 3);

  const { data: transitions } = await db.from("video_machine_security_finding_transition").select("from_status, to_status, version_before, version_after").eq("security_finding_id", (await db.from("video_machine_security_finding").select("security_finding_id").eq("finding_key", key).single()).data!.security_finding_id).order("transitioned_at");
  assert.equal(transitions?.length, 3);
  assert.deepEqual(transitions!.map((t) => t.to_status), ["OPEN", "CONTAINED", "RESOLVED"]);
  console.log("OK: OPEN -> CONTAINED -> RESOLVED, cada transição incrementa version (CAS) e fica auditável no histórico append-only.");
}

async function testTransitionVersionConflict() {
  // transitionFinding() faz 2 SELECTs + 1 UPDATE (3 round trips) — um
  // Promise.all() de duas chamadas completas não garante colisão real
  // (timing de rede pode serializar naturalmente as duas, cada uma
  // lendo a versão já atualizada pela outra — nada de errado nisso,
  // só não é um teste determinístico do CAS). Testamos o mecanismo de
  // CAS em si diretamente: duas requisições de UPDATE contra a MESMA
  // versão lida uma única vez — é exatamente o que transitionFinding()
  // faz por baixo, e aqui a colisão é garantida, não probabilística.
  const key = `${TEST_PREFIX}-CAS-CONFLICT`;
  const registered = await registerFinding(db, { findingKey: key, severity: "MEDIUM", controlKey: `${TEST_PREFIX}.ingress.test` });
  const { data: lifecycle } = await db.from("video_machine_security_finding_lifecycle").select("version").eq("security_finding_id", registered.securityFindingId).single();

  const [r1, r2] = await Promise.all([
    db.from("video_machine_security_finding_lifecycle").update({ status: "CONTAINED", version: lifecycle!.version + 1 }).eq("security_finding_id", registered.securityFindingId).eq("version", lifecycle!.version).select("security_finding_id").maybeSingle(),
    db.from("video_machine_security_finding_lifecycle").update({ status: "CONTAINED", version: lifecycle!.version + 1 }).eq("security_finding_id", registered.securityFindingId).eq("version", lifecycle!.version).select("security_finding_id").maybeSingle(),
  ]);
  const successes = [r1.data, r2.data].filter((d) => d !== null);
  assert.equal(successes.length, 1, "com a mesma versão lida uma única vez, exatamente um UPDATE deve afetar a linha (CAS real)");
  console.log("OK: duas requisições de UPDATE contra a mesma version lida uma única vez -> exatamente uma afeta a linha (CAS real do lado do Postgres, não fé em timing de app).");
}

async function testControlGateFailClosedNotConfigured() {
  const controlKey = `${TEST_PREFIX}.ingress.cron.authentication`;
  const result = await evaluateControlGate(db, controlKey, "PRODUCTION", { enforcement: "REQUIRED", failureMode: "FAIL_CLOSED" });
  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "CONTROL_NOT_CONFIGURED");
  console.log("OK: controle REQUIRED+FAIL_CLOSED sem nenhuma evidência registrada -> DENY/CONTROL_NOT_CONFIGURED (nunca assume verificado por omissão).");
}

async function testControlGateVerifiedAllows() {
  const controlKey = `${TEST_PREFIX}.data.rls`;
  await recordControlEvidence(db, { controlKey, environment: "PRODUCTION", status: "VERIFIED", evidenceBasis: "PRODUCTION_TEST", evidenceRefs: ["migration:test"] });
  const result = await evaluateControlGate(db, controlKey, "PRODUCTION", { enforcement: "REQUIRED", failureMode: "FAIL_CLOSED" });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.reason, "CONTROL_VERIFIED");

  const { data: decisions } = await db.from("video_machine_security_control_decision").select("decision, reason").eq("control_key", controlKey);
  assert.equal(decisions?.length, 1);
  console.log("OK: evidência VERIFIED real -> ALLOW/CONTROL_VERIFIED, decisão persistida no audit trail (SecurityControlDecision).");
}

async function testControlGateStaleEvidenceDeniesUnderFailClosed() {
  const controlKey = `${TEST_PREFIX}.stale.control`;
  await recordControlEvidence(db, { controlKey, environment: "PRODUCTION", status: "VERIFIED", evidenceBasis: "MANUAL_VERIFICATION", validUntil: new Date(Date.now() - 1000).toISOString() });
  const result = await evaluateControlGate(db, controlKey, "PRODUCTION", { enforcement: "REQUIRED", failureMode: "FAIL_CLOSED" });
  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "CONTROL_UNVERIFIED");
  console.log("OK: evidência VERIFIED mas com validUntil já vencido -> DENY/CONTROL_UNVERIFIED (freshness real, não confia em evidência velha).");
}

async function testControlGateExampleFromSpec() {
  // Exemplo literal do SPEC.md: "CRON_SECRET existe em algum lugar" != VERIFIED em produção.
  const controlKey = `${TEST_PREFIX}.ingress.cron.authentication.example`;
  await recordControlEvidence(db, { controlKey, environment: "PRODUCTION", status: "UNVERIFIED", evidenceBasis: "REPOSITORY_INSPECTION", evidenceRefs: ["CONTINUIDADE.md:SEC-025-CRON-PRODUCTION-AUTH"] });
  const result = await evaluateControlGate(db, controlKey, "PRODUCTION", { enforcement: "REQUIRED", failureMode: "FAIL_CLOSED" });
  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "CONTROL_UNVERIFIED");
  console.log("OK: secret existir no código não é evidência de controle VERIFIED em produção -> DENY/CONTROL_UNVERIFIED (exemplo literal do SPEC.md).");
}

async function testAuditEventLogging() {
  await logSecurityAuditEvent(db, { eventKey: `${TEST_PREFIX}-event`, eventType: "control_gate_evaluated", securityDomain: "ingress", outcome: "DENIED", reasonCodes: ["CONTROL_NOT_CONFIGURED"] });
  const { data: events } = await db.from("video_machine_security_audit_event").select("*").eq("event_key", `${TEST_PREFIX}-event`);
  assert.equal(events?.length, 1);
  assert.equal(events![0].outcome, "DENIED");
  console.log("OK: SecurityAuditEvent persistido, append-only, sem payload bruto.");
}

async function main() {
  console.log(`prefixo de teste: ${TEST_PREFIX}`);
  try {
    await testRegisterFindingIdempotent();
    await testFindingLifecycleTransitions();
    await testTransitionVersionConflict();
    await testControlGateFailClosedNotConfigured();
    await testControlGateVerifiedAllows();
    await testControlGateStaleEvidenceDeniesUnderFailClosed();
    await testControlGateExampleFromSpec();
    await testAuditEventLogging();
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
