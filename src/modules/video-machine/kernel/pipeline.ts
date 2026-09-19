import { canonicalHash } from "./canonicalHash";
import type { StageKernelContractConfig } from "./types";

/**
 * Pipeline de teste da Fase 1 — 1 stage só, adapter "echo" (sem provider
 * externo real). Existe só pra provar o loop
 * Job -> lease -> handler -> reportExecution -> settlement ->
 * StageTransitionResolution -> Run SUCCEEDED de ponta a ponta.
 * ProductionPipelineSnapshot/StageKernelContract/SkillExecutionAdapterDescriptor
 * são congelados aqui como constantes TS (ver nota na migration SQL) —
 * nenhuma dessas 3 entidades tem tabela nesta fase.
 */

export const ECHO_ADAPTER_DESCRIPTOR = {
  adapterKey: "echo-adapter",
  adapterVersion: "v1",
  targetSkillId: "echo",
  inputContractKey: "EchoInput",
  inputContractVersion: "v1",
  resultContractKey: "EchoResult",
  resultContractVersion: "v1",
} as const;

export const ECHO_ADAPTER_DESCRIPTOR_HASH = canonicalHash(
  "SKILL_EXECUTION_ADAPTER_DESCRIPTOR_V1",
  { ...ECHO_ADAPTER_DESCRIPTOR }
);

export const ECHO_STAGE_KEY = "ECHO";

export const ECHO_STAGE_KERNEL_CONTRACT: StageKernelContractConfig = {
  stageKernelContractId: "echo-stage-kernel-contract-v1",
  stageKey: ECHO_STAGE_KEY,
  targetSkillId: "echo",
  executionAdapter: {
    adapterKey: ECHO_ADAPTER_DESCRIPTOR.adapterKey,
    adapterVersion: ECHO_ADAPTER_DESCRIPTOR.adapterVersion,
    adapterDescriptorHash: ECHO_ADAPTER_DESCRIPTOR_HASH,
  },
  successTransitions: [
    {
      transitionKey: "ECHO_DONE",
      target: { kind: "RUN_TERMINAL", terminalStatus: "SUCCEEDED" },
    },
  ],
  workUnitContract: { mode: "SINGLE" },
  stageKernelContractHash: "", // preenchido abaixo (não pode se autorreferenciar)
};

ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractHash = canonicalHash("STAGE_KERNEL_CONTRACT_V1", {
  stageKernelContractId: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractId,
  stageKey: ECHO_STAGE_KERNEL_CONTRACT.stageKey,
  targetSkillId: ECHO_STAGE_KERNEL_CONTRACT.targetSkillId,
  executionAdapter: { ...ECHO_STAGE_KERNEL_CONTRACT.executionAdapter },
  successTransitions: ECHO_STAGE_KERNEL_CONTRACT.successTransitions.map((t) => ({ ...t, target: { ...t.target } })),
  workUnitContract: { ...ECHO_STAGE_KERNEL_CONTRACT.workUnitContract },
});

export const ECHO_PIPELINE_SNAPSHOT_ID = "echo-pipeline-snapshot-v1";
export const ECHO_PIPELINE_SNAPSHOT_HASH = canonicalHash("PRODUCTION_PIPELINE_SNAPSHOT_V1", {
  pipelineSnapshotId: ECHO_PIPELINE_SNAPSHOT_ID,
  pipelineKey: "echo-pipeline",
  pipelineVersion: "v1",
  entryStageKey: ECHO_STAGE_KEY,
  stages: [
    {
      stageKey: ECHO_STAGE_KEY,
      stageDefinitionHash: "echo-stage-definition-v1",
      stageKernelContractId: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractId,
      stageKernelContractHash: ECHO_STAGE_KERNEL_CONTRACT.stageKernelContractHash,
    },
  ],
});

export const ECHO_STAGE_DEFINITION_HASH = "echo-stage-definition-v1";
