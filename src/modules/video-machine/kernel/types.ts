/**
 * Tipos do kernel (Skill01 orquestrador + Skill02 gestor de fila) — Fase 1,
 * caminho RUN_SCOPED + workUnitContract=SINGLE, sem approval gate.
 * Fonte normativa: skills 01 e 02 em src/modules/video-machine/skills/, cada uma com seu SPEC.md.
 */

export type KernelArtifactRef = {
  ownerSkillId: string;
  artifactType: string;
  artifactId: string;
  artifactHash: string;
  schemaVersion: string;
};

export type KernelCreationRef = {
  sourceKind: string;
  sourceId: string;
  sourceHash: string;
};

export type StageExecutionCreationRef = {
  sourceKind: "RUN_START" | "TRANSITION";
  sourceId: string;
  sourceHash: string;
};

export type RunStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "WAITING_EXTERNAL"
  | "PAUSED"
  | "BLOCKED"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type StageExecutionState =
  | "CREATED"
  | "PREPARING"
  | "PREPARED"
  | "DISPATCHED"
  | "WAITING_EXECUTION"
  | "INTERPRETING_RESULT"
  | "RESOLVED"
  | "CANCELLED";

export type SkillExecutionAdapterRef = {
  adapterKey: string;
  adapterVersion: string;
  adapterDescriptorHash: string;
};

export type StageSuccessTransition = {
  transitionKey: string;
  target:
    | { kind: "STAGE"; nextStageKey: string; iterationAction: "CONTINUE_CURRENT_ITERATION" | "START_NEXT_ITERATION" }
    | { kind: "RUN_TERMINAL"; terminalStatus: "SUCCEEDED" };
};

/** StageKernelContract congelado como constante TS (Fase 1 — sem tabela SQL, ver migration). */
export type StageKernelContractConfig = {
  stageKernelContractId: string;
  stageKey: string;
  targetSkillId: string;
  executionAdapter: SkillExecutionAdapterRef;
  successTransitions: StageSuccessTransition[];
  workUnitContract: { mode: "SINGLE" };
  stageKernelContractHash: string;
};

export type KernelExecutionDisposition = "SUCCEEDED" | "BLOCKED" | "FAILED";

// ---- Skill02 ----

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_EXTERNAL"
  | "RETRYING"
  | "BLOCKED"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type BlockReason = "EXTERNAL_STATE_UNKNOWN" | "QUOTA_PAUSED" | "POLICY_BLOCKED";

export type RetryPolicy = {
  maxAttempts: number;
  backoff: "FIXED" | "EXPONENTIAL";
  eligibilityModel: "HANDLER_ADVICE_AND_EXECUTION_SAFETY";
};

export type ExternalEffectState = "NOT_STARTED" | "SUBMITTING" | "CONFIRMED" | "NOT_APPLIED" | "UNKNOWN";

export type ExternalEffectObservation =
  | { observation: "CONFIRMED"; externalOperationId?: string; outcome?: string }
  | { observation: "NOT_APPLIED"; outcome?: string; errorCode?: string }
  | { observation: "UNKNOWN"; externalOperationId?: string; nextPollAt?: string; deadlineAt?: string; outcome?: string; errorCode?: string };

export type JobExecutionOutcome = "CONTINUE" | "SUCCEEDED" | "BLOCKED" | "FAILED";

export type JobExecutionSettlementDisposition =
  | "CONTINUE_SAME_ATTEMPT"
  | "JOB_SUCCEEDED"
  | "JOB_BLOCKED"
  | "RETRY_NEW_ATTEMPT"
  | "JOB_FAILED_TERMINAL";

/** Assinatura do handler de domínio de uma Skill — Fase 1: só o handler "echo" implementa isto. */
export type SkillJobHandler = {
  handlerKey: string;
  execute(input: {
    jobId: string;
    tenantId: string;
    attemptNumber: number;
    inputPayloadRef: KernelArtifactRef;
  }): Promise<{
    outcome: JobExecutionOutcome;
    resultRef?: KernelArtifactRef;
    reasonCode?: string;
  }>;
};
