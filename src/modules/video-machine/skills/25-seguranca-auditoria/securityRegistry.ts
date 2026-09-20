import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalHash } from "../../kernel/canonicalHash";

/**
 * Skill 25 — Segurança/Auditoria. Fonte normativa: SPEC.md neste mesmo
 * diretório.
 *
 * ESCOPO REDUZIDO deliberadamente (ver comentário no topo da migration
 * 20260920140000): implementa SecurityFinding + lifecycle/transition,
 * SecurityControlEvidence/Decision (gate fail-closed) e
 * SecurityAuditEvent. SecurityIncident, SecurityCredentialCompromiseHandoff,
 * SecurityGateRequest/Run completo e SecurityRateLimit* (o próprio SPEC
 * já marca DEFERRED_V2_MECHANISM) ficam NOT_IMPLEMENTED.
 */

export type SecurityFindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type SecurityFindingLifecycleStatus = "OPEN" | "CONTAINED" | "REMEDIATING" | "RESOLVED" | "ACCEPTED_RISK";
export type SecurityFindingTransitionReason = "FINDING_CREATED" | "IMMEDIATE_CONTAINMENT_APPLIED" | "REMEDIATION_STARTED" | "CONTROL_VERIFIED_FIXED" | "RISK_FORMALLY_ACCEPTED" | "RISK_ACCEPTANCE_REVOKED";

export type RegisterFindingInput = {
  findingKey: string;
  severity: SecurityFindingSeverity;
  controlKey: string;
  affectedSubjectRefs?: string[];
  evidenceRefs?: string[];
};

export async function registerFinding(db: SupabaseClient, input: RegisterFindingInput): Promise<{ outcome: "REGISTERED" | "ALREADY_EXISTS"; securityFindingId: string }> {
  const { data: existing } = await db.from("video_machine_security_finding").select("security_finding_id").eq("finding_key", input.findingKey).maybeSingle();
  if (existing) return { outcome: "ALREADY_EXISTS", securityFindingId: existing.security_finding_id };

  const findingHash = `SECURITY_FINDING_V1:sha256:${canonicalHash("SECURITY_FINDING_V1", {
    findingKey: input.findingKey,
    severity: input.severity,
    controlKey: input.controlKey,
    affectedSubjectRefs: input.affectedSubjectRefs ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
  })}`;

  const { data: finding, error } = await db
    .from("video_machine_security_finding")
    .insert({ finding_key: input.findingKey, severity: input.severity, control_key: input.controlKey, affected_subject_refs: input.affectedSubjectRefs ?? [], evidence_refs: input.evidenceRefs ?? [], finding_hash: findingHash })
    .select("security_finding_id")
    .single();
  if (error?.code === "23505") {
    const { data: raced } = await db.from("video_machine_security_finding").select("security_finding_id").eq("finding_key", input.findingKey).single();
    return { outcome: "ALREADY_EXISTS", securityFindingId: raced!.security_finding_id };
  }
  if (error || !finding) throw new Error(`registerFinding: ${error?.message}`);

  await db.from("video_machine_security_finding_lifecycle").insert({ security_finding_id: finding.security_finding_id, status: "OPEN", version: 1 });
  await recordTransition(db, { securityFindingId: finding.security_finding_id, findingHash, fromStatus: undefined, toStatus: "OPEN", reason: "FINDING_CREATED", evidenceRefs: input.evidenceRefs ?? [], versionBefore: undefined, versionAfter: 1 });

  return { outcome: "REGISTERED", securityFindingId: finding.security_finding_id };
}

async function recordTransition(
  db: SupabaseClient,
  args: { securityFindingId: string; findingHash: string; fromStatus?: SecurityFindingLifecycleStatus; toStatus: SecurityFindingLifecycleStatus; reason: SecurityFindingTransitionReason; evidenceRefs: string[]; versionBefore?: number; versionAfter: number }
) {
  const transitionHash = `SECURITY_FINDING_TRANSITION_V1:sha256:${canonicalHash("SECURITY_FINDING_TRANSITION_V1", {
    securityFindingId: args.securityFindingId,
    findingHash: args.findingHash,
    fromStatus: args.fromStatus ?? null,
    toStatus: args.toStatus,
    reason: args.reason,
    evidenceRefs: args.evidenceRefs,
    versionBefore: args.versionBefore ?? null,
    versionAfter: args.versionAfter,
  })}`;
  await db.from("video_machine_security_finding_transition").insert({
    security_finding_id: args.securityFindingId,
    finding_hash: args.findingHash,
    from_status: args.fromStatus ?? null,
    to_status: args.toStatus,
    reason: args.reason,
    evidence_refs: args.evidenceRefs,
    version_before: args.versionBefore ?? null,
    version_after: args.versionAfter,
    transition_hash: transitionHash,
  });
}

export type TransitionFindingOutcome = { outcome: "TRANSITIONED"; newVersion: number } | { outcome: "FATAL_ERROR"; errorCode: string } | { outcome: "RETRYABLE_ERROR"; errorCode: string };

export async function transitionFinding(db: SupabaseClient, findingKey: string, toStatus: SecurityFindingLifecycleStatus, reason: SecurityFindingTransitionReason, evidenceRefs: string[] = []): Promise<TransitionFindingOutcome> {
  const { data: finding, error: findingErr } = await db.from("video_machine_security_finding").select("security_finding_id, finding_hash").eq("finding_key", findingKey).maybeSingle();
  if (findingErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!finding) return { outcome: "FATAL_ERROR", errorCode: "SECURITY_FINDING_NOT_FOUND" };

  const { data: lifecycle, error: lifecycleErr } = await db.from("video_machine_security_finding_lifecycle").select("*").eq("security_finding_id", finding.security_finding_id).single();
  if (lifecycleErr || !lifecycle) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };

  const newVersion = lifecycle.version + 1;
  const { data: updated, error: updateErr } = await db
    .from("video_machine_security_finding_lifecycle")
    .update({ status: toStatus, version: newVersion, updated_at: new Date().toISOString() })
    .eq("security_finding_id", finding.security_finding_id)
    .eq("version", lifecycle.version)
    .select("security_finding_id")
    .maybeSingle();
  if (updateErr) return { outcome: "RETRYABLE_ERROR", errorCode: "TRANSIENT_DATASTORE_ERROR" };
  if (!updated) return { outcome: "FATAL_ERROR", errorCode: "SECURITY_FINDING_TRANSITION_VERSION_CONFLICT" };

  await recordTransition(db, { securityFindingId: finding.security_finding_id, findingHash: finding.finding_hash, fromStatus: lifecycle.status, toStatus, reason, evidenceRefs, versionBefore: lifecycle.version, versionAfter: newVersion });
  return { outcome: "TRANSITIONED", newVersion };
}

export type ControlEvidenceStatus = "VERIFIED" | "UNVERIFIED" | "FAILED" | "NOT_CONFIGURED" | "NOT_APPLICABLE";
export type ControlEvidenceBasis = "PRODUCTION_TEST" | "CONFIGURATION_INSPECTION" | "REPOSITORY_INSPECTION" | "MANUAL_VERIFICATION";

export async function recordControlEvidence(db: SupabaseClient, input: { controlKey: string; environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION"; status: ControlEvidenceStatus; evidenceBasis: ControlEvidenceBasis; evidenceRefs?: string[]; validUntil?: string }): Promise<{ evidenceId: string; evidenceHash: string }> {
  const evidenceHash = `SECURITY_CONTROL_EVIDENCE_V1:sha256:${canonicalHash("SECURITY_CONTROL_EVIDENCE_V1", {
    controlKey: input.controlKey,
    environment: input.environment,
    status: input.status,
    evidenceBasis: input.evidenceBasis,
    evidenceRefs: input.evidenceRefs ?? [],
  })}`;
  const { data, error } = await db
    .from("video_machine_security_control_evidence")
    .insert({ control_key: input.controlKey, environment: input.environment, status: input.status, evidence_basis: input.evidenceBasis, evidence_refs: input.evidenceRefs ?? [], evidence_hash: evidenceHash, valid_until: input.validUntil ?? null })
    .select("security_control_evidence_id")
    .single();
  if (error || !data) throw new Error(`recordControlEvidence: ${error?.message}`);
  return { evidenceId: data.security_control_evidence_id, evidenceHash };
}

export type ControlGateRequirement = { enforcement: "REQUIRED" | "OPTIONAL"; failureMode: "FAIL_CLOSED" | "OBSERVE_ONLY"; maximumEvidenceAgeSeconds?: number };
export type ControlGateOutcome = { decision: "ALLOW" | "DENY"; reason: "CONTROL_VERIFIED" | "CONTROL_NOT_CONFIGURED" | "CONTROL_UNVERIFIED" | "CONTROL_FAILED" | "POLICY_VIOLATION" };

/**
 * Fail-closed real: REQUIRED+FAIL_CLOSED só permite ALLOW quando a
 * evidência mais recente do controlKey/environment está VERIFIED e
 * ainda fresca (validUntil/maximumEvidenceAgeSeconds). Qualquer outra
 * combinação nega — nunca "warning + continua".
 */
export async function evaluateControlGate(db: SupabaseClient, controlKey: string, environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION", requirement: ControlGateRequirement, tenantId?: string): Promise<ControlGateOutcome> {
  const { data: evidence } = await db.from("video_machine_security_control_evidence").select("*").eq("control_key", controlKey).eq("environment", environment).order("observed_at", { ascending: false }).limit(1).maybeSingle();

  let decision: "ALLOW" | "DENY";
  let reason: ControlGateOutcome["reason"];

  if (requirement.enforcement === "OPTIONAL") {
    decision = "ALLOW";
    reason = "CONTROL_VERIFIED";
  } else if (!evidence) {
    decision = requirement.failureMode === "FAIL_CLOSED" ? "DENY" : "ALLOW";
    reason = "CONTROL_NOT_CONFIGURED";
  } else {
    const stale = requirement.maximumEvidenceAgeSeconds != null && Date.now() - new Date(evidence.observed_at).getTime() > requirement.maximumEvidenceAgeSeconds * 1000;
    const expired = evidence.valid_until != null && new Date(evidence.valid_until).getTime() < Date.now();
    if (evidence.status !== "VERIFIED" || stale || expired) {
      decision = requirement.failureMode === "FAIL_CLOSED" ? "DENY" : "ALLOW";
      reason = evidence.status === "FAILED" ? "CONTROL_FAILED" : evidence.status === "NOT_CONFIGURED" ? "CONTROL_NOT_CONFIGURED" : "CONTROL_UNVERIFIED";
    } else {
      decision = "ALLOW";
      reason = "CONTROL_VERIFIED";
    }
  }

  const decisionHash = `SECURITY_CONTROL_DECISION_V1:sha256:${canonicalHash("SECURITY_CONTROL_DECISION_V1", { tenantId: tenantId ?? null, controlKey, evidenceHash: evidence?.evidence_hash ?? null, decision, reason })}`;
  await db.from("video_machine_security_control_decision").insert({ tenant_id: tenantId ?? null, control_key: controlKey, evidence_hash: evidence?.evidence_hash ?? null, decision, reason, decision_hash: decisionHash });

  return { decision, reason };
}

export async function logSecurityAuditEvent(db: SupabaseClient, event: { tenantId?: string; eventKey: string; eventType: string; securityDomain: string; subjectRefs?: Array<{ subjectKind: string; subjectId: string }>; outcome: "ALLOWED" | "DENIED" | "BLOCKED" | "OBSERVED"; reasonCodes?: string[]; evidenceRefs?: string[] }): Promise<void> {
  const eventHash = `SECURITY_AUDIT_EVENT_V1:sha256:${canonicalHash("SECURITY_AUDIT_EVENT_V1", {
    tenantId: event.tenantId ?? null,
    eventKey: event.eventKey,
    eventType: event.eventType,
    securityDomain: event.securityDomain,
    subjectRefs: event.subjectRefs ?? [],
    outcome: event.outcome,
    reasonCodes: event.reasonCodes ?? [],
  })}`;
  await db.from("video_machine_security_audit_event").insert({
    tenant_id: event.tenantId ?? null,
    event_key: event.eventKey,
    event_type: event.eventType,
    security_domain: event.securityDomain,
    subject_refs: event.subjectRefs ?? [],
    outcome: event.outcome,
    reason_codes: event.reasonCodes ?? [],
    evidence_refs: event.evidenceRefs ?? [],
    event_hash: eventHash,
  });
}
