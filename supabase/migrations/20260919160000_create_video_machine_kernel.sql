-- Fase 1 de implementação da Máquina de Vídeos — kernel (Skill01
-- orquestrador de produção + Skill02 gestor de fila de jobs). Especificação
-- completa em src/modules/video-machine/skills/{01,02}-*/SPEC.md, validada
-- externamente pelo GPT-6 Astra (commit ea48d35, 2026-09-19, "FINAL:
-- implementable — especificação V1") depois de 5 rodadas reais de revisão.
--
-- Escopo desta migration (walking skeleton, ver plano de implementação):
-- só o caminho RUN_SCOPED + workUnitContract=SINGLE + sem approval gate —
-- exatamente o que a própria SPEC declara como o subconjunto V1
-- sequencial ("no máximo 1 StageExecution não-terminal ativa por Run").
-- EXPANDABLE/StageExpansionManifest/StageTransitionMember,
-- StandaloneWorkRequest/JobExecutionScope=STANDALONE, e o gate de
-- aprovação (Skill03) ficam fora desta migration — sem consumidor real
-- ainda, entram quando alguma Skill de conteúdo precisar de verdade.
--
-- ProductionPipelineSnapshot/StageKernelContract/SkillExecutionAdapterDescriptor
-- (config congelada no deploy, nunca mutada em runtime) NÃO viram tabela
-- nesta fase — são representados como constantes TypeScript versionadas em
-- código (ver src/modules/video-machine/kernel/pipeline.ts), com hash
-- calculado e fixo. StageExecution/PreparedSkillInvocation ainda guardam
-- os campos *Id/*Hash desses objetos (como a SPEC exige), só não há uma
-- tabela SQL por trás — se/quando existir um autor de pipeline via UI,
-- essa decisão é revisada.
--
-- Mesmo padrão das migrations anteriores deste projeto: `create table if
-- not exists`, RLS habilitado SEM nenhuma policy (só a service_role key,
-- que ignora RLS, acessa — nunca exposto ao browser), comment on table em
-- toda tabela. Projeto compartilhado babamanager-pro — nenhuma tabela
-- aqui referencia ou é referenciada por tabelas do BancaZAP/Concierge.

create extension if not exists pgcrypto;

-- =====================================================================
-- Skill 01 — orquestrador de produção
-- =====================================================================

-- ProductionRun (A4): entidade imutável. status/version/etc. NUNCA
-- entram aqui — vivem em production_run_runtime_state (ver SPEC.md,
-- "NUNCA entra no hash: status, current stage, progress...").
create table if not exists public.video_machine_production_run (
  production_run_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_key text not null,
  pipeline_snapshot_id text not null,
  pipeline_snapshot_hash text not null,
  creation_ref jsonb not null, -- KernelCreationRef {sourceKind,sourceId,sourceHash}
  initial_artifact_refs jsonb not null default '[]'::jsonb, -- KernelArtifactRef[]
  production_run_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_production_run_tenant_run_key_uniq unique (tenant_id, run_key) -- A9
);
comment on table public.video_machine_production_run is 'ProductionRun (Skill01 SPEC.md, tipo A4) — imutável. status/version/stage ativo vivem em video_machine_production_run_runtime_state, nunca aqui. UNIQUE(tenant_id, run_key) é a idempotência de criação (A9): mesmo run_key + mesmo hash = replay idempotente; mesmo run_key + hash diferente = RUN_CREATION_REPLAY_CONFLICT, validado em código antes do insert.';

-- ProductionRunRuntimeState (A7): mutável, sem hash integral.
create table if not exists public.video_machine_production_run_runtime_state (
  production_run_id uuid primary key references public.video_machine_production_run (production_run_id),
  tenant_id text not null,
  status text not null check (status in (
    'QUEUED','RUNNING','WAITING_APPROVAL','WAITING_EXTERNAL','PAUSED',
    'BLOCKED','CANCEL_REQUESTED','SUCCEEDED','FAILED','CANCELLED'
  )),
  version int not null default 0,
  active_stage_iteration_id uuid,
  active_stage_iteration_hash text,
  active_stage_execution_ids jsonb not null default '[]'::jsonb, -- string[], V1: length <= 1
  terminal_reason_code text,
  started_at timestamptz,
  terminal_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.video_machine_production_run_runtime_state is 'ProductionRunRuntimeState (Skill01 SPEC.md, tipo A7) — status/version mutáveis do Run. version é CAS otimista: todo UPDATE deve fazer WHERE version = <esperado> e verificar rowCount=1, nunca update cego.';

-- StageIteration (Ponto D, PATCH N2/N9): nesta fase só iteration
-- kind=INITIAL, nunca REVISION (loop de correção fica pra quando uma
-- Skill de auditoria real existir no runtime).
create table if not exists public.video_machine_stage_iteration (
  stage_iteration_id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references public.video_machine_production_run (production_run_id),
  tenant_id text not null,
  stage_key text not null,
  iteration_ordinal int not null, -- 1-based, monotônico por (run, stageKey)
  kind text not null default 'INITIAL' check (kind in ('INITIAL','REVISION')),
  seed_artifact_refs jsonb not null default '[]'::jsonb, -- KernelArtifactRef[]
  stage_iteration_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_stage_iteration_run_stage_ordinal_uniq unique (production_run_id, stage_key, iteration_ordinal)
);
comment on table public.video_machine_stage_iteration is 'StageIteration (Skill01 SPEC.md, Ponto D) — nesta fase (Fase 1) só kind=INITIAL é criado; REVISION (loop de correção via START_NEXT_ITERATION) fica pra quando alguma Skill de auditoria real existir no runtime.';

-- StageExecution (A22): imutável, nunca reaberta.
create table if not exists public.video_machine_stage_execution (
  stage_execution_id uuid primary key default gen_random_uuid(),
  production_run_id uuid not null references public.video_machine_production_run (production_run_id),
  production_run_hash text not null,
  tenant_id text not null,
  stage_iteration_id uuid not null references public.video_machine_stage_iteration (stage_iteration_id),
  stage_iteration_hash text not null,
  stage_key text not null,
  stage_work_unit_identity_hash text not null, -- Ponto S5, BASE sempre presente nesta fase (SINGLE)
  stage_definition_hash text not null,
  stage_kernel_contract_id text not null, -- referencia constante TS, não FK SQL (ver header)
  stage_kernel_contract_hash text not null,
  execution_ordinal int not null, -- monotônico no Run inteiro
  creation_ref jsonb not null, -- StageExecutionCreationRef
  stage_subject_binding_id uuid, -- ausente nesta fase (sem StageSubjectBinding em Fase 1)
  stage_subject_binding_hash text,
  upstream_artifact_refs jsonb not null default '[]'::jsonb, -- KernelArtifactRef[]
  stage_execution_hash text not null,
  created_at timestamptz not null default now()
);
comment on table public.video_machine_stage_execution is 'StageExecution (Skill01 SPEC.md, tipo A22) — imutável; uma StageExecution resolvida NUNCA é reaberta, uma correção futura cria outra linha. V1 sequencial: no máximo 1 StageExecution não-terminal ativa por production_run_id (invariante checada em código, não em constraint SQL, já que "não-terminal" depende de video_machine_stage_execution_runtime_state.state).';

-- StageExecutionRuntimeState: mutável, sem hash integral.
create table if not exists public.video_machine_stage_execution_runtime_state (
  stage_execution_id uuid primary key references public.video_machine_stage_execution (stage_execution_id),
  tenant_id text not null,
  state text not null check (state in (
    'CREATED','PREPARING','PREPARED','DISPATCHED','WAITING_EXECUTION',
    'INTERPRETING_RESULT','RESOLVED','CANCELLED'
  )),
  version int not null default 0,
  prepared_invocation_id uuid,
  prepared_invocation_hash text,
  resolved_execution_hash text,
  updated_at timestamptz not null default now()
);
comment on table public.video_machine_stage_execution_runtime_state is 'StageExecutionRuntimeState (Skill01 SPEC.md) — "onde esta ocorrência do stage está no kernel". NÃO duplica job.status (Skill02) — são dimensões diferentes (kernel vs. fila). version é CAS otimista.';

-- PreparedSkillInvocation (A30): imutável.
create table if not exists public.video_machine_prepared_skill_invocation (
  prepared_invocation_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  production_run_id uuid not null references public.video_machine_production_run (production_run_id),
  production_run_hash text not null,
  stage_execution_id uuid not null references public.video_machine_stage_execution (stage_execution_id),
  stage_execution_hash text not null,
  target_skill_id text not null,
  execution_adapter jsonb not null, -- SkillExecutionAdapterRef {adapterKey,adapterVersion,adapterDescriptorHash}
  invocation_key text not null, -- determinística: tenantId+productionRunId+stageExecutionId+adapterDescriptorHash+preparationContextHash
  input_payload_ref jsonb not null, -- KernelArtifactRef, opaco pro kernel
  preparation_context_hash text not null,
  prepared_invocation_hash text not null,
  prepared_at timestamptz not null default now(),
  constraint video_machine_prepared_skill_invocation_key_uniq unique (invocation_key)
);
comment on table public.video_machine_prepared_skill_invocation is 'PreparedSkillInvocation (Skill01 SPEC.md, tipo A30) — imutável. UNIQUE(invocation_key): mesma key + conteúdo diferente é replay conflict, validado em código antes do insert (mesmo hash esperado = idempotente, reusa a linha existente).';

-- SkillExecutionResolution (A37): imutável.
create table if not exists public.video_machine_skill_execution_resolution (
  skill_execution_resolution_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  production_run_id uuid not null references public.video_machine_production_run (production_run_id),
  production_run_hash text not null,
  stage_execution_id uuid not null references public.video_machine_stage_execution (stage_execution_id),
  stage_execution_hash text not null,
  prepared_invocation_id uuid not null references public.video_machine_prepared_skill_invocation (prepared_invocation_id),
  prepared_invocation_hash text not null,
  execution_adapter jsonb not null,
  handler_execution_report_ref jsonb not null, -- KernelArtifactRef
  disposition text not null check (disposition in ('SUCCEEDED','BLOCKED','FAILED')),
  transition_key text, -- obrigatório se SUCCEEDED, proibido senão (checado em código)
  primary_result_ref jsonb,
  additional_result_refs jsonb not null default '[]'::jsonb,
  successor_iteration_seed_refs jsonb not null default '[]'::jsonb,
  reason_code text, -- obrigatório se BLOCKED/FAILED, proibido se SUCCEEDED
  resolution_hash text not null,
  resolved_at timestamptz not null default now(),
  constraint video_machine_skill_execution_resolution_stage_execution_uniq unique (stage_execution_id)
);
comment on table public.video_machine_skill_execution_resolution is 'SkillExecutionResolution (Skill01 SPEC.md, tipo A37) — imutável, resultado normalizado do adapter. UNIQUE(stage_execution_id): uma StageExecution nunca é interpretada duas vezes com resultado divergente (V1 sequencial, no máximo 1 resolution por execution).';

-- LogicalJobIntent (identidade de mensagem/outbox entre Skill01 e Skill02).
create table if not exists public.video_machine_logical_job_intent (
  intent_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  logical_job_key text not null,
  stage_execution_id uuid not null references public.video_machine_stage_execution (stage_execution_id),
  prepared_invocation_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint video_machine_logical_job_intent_tenant_key_uniq unique (tenant_id, logical_job_key)
);
comment on table public.video_machine_logical_job_intent is 'LogicalJobIntent (Skill01 SPEC.md) — outbox de saída da Skill01 pra Skill02. UNIQUE(tenant_id, logical_job_key) garante que a mesma StageExecution nunca produz dois Jobs lógicos diferentes em replay.';

-- OutboxConsumerDelivery: entrega replay-safe genérica, reusada por
-- múltiplos produtores/consumidores do kernel (Skill01→Skill02 aqui).
create table if not exists public.video_machine_outbox_consumer_delivery (
  delivery_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  event_id text not null, -- id do evento lógico sendo entregue (ex.: logical_job_intent.intent_id)
  consumer_key text not null, -- quem consome (ex.: 'skill02_ensure_job')
  delivery_state text not null default 'PENDING' check (delivery_state in ('PENDING','DELIVERED','DEAD_LETTER')),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint video_machine_outbox_consumer_delivery_event_consumer_uniq unique (event_id, consumer_key)
);
comment on table public.video_machine_outbox_consumer_delivery is 'OutboxConsumerDelivery — entrega replay-safe: UNIQUE(event_id, consumer_key) garante que o mesmo evento nunca é aplicado duas vezes pelo mesmo consumidor, mesmo com retries/crash no meio da entrega.';

-- =====================================================================
-- Skill 02 — gestor de fila de jobs
-- =====================================================================

-- Job (JobCommon + discriminated union): Fase 1 só cobre
-- executionScope='RUN_SCOPED' — STANDALONE fica pra quando alguma Skill
-- de conteúdo tiver um caso real (ex.: Skill16 webhook-driven).
create table if not exists public.video_machine_job (
  id uuid primary key default gen_random_uuid(),
  logical_job_key text not null,
  payload_hash text not null,
  tenant_id text not null,
  status text not null default 'QUEUED' check (status in (
    'QUEUED','RUNNING','WAITING_EXTERNAL','RETRYING','BLOCKED',
    'CANCEL_REQUESTED','SUCCEEDED','FAILED','CANCELLED'
  )),
  block_reason text check (block_reason in ('EXTERNAL_STATE_UNKNOWN','QUOTA_PAUSED','POLICY_BLOCKED')),
  attempt_count int not null default 0,
  retry_policy jsonb not null, -- RetryPolicy snapshot imutável do nascimento do Job
  lease_owner text,
  lease_expires_at timestamptz,
  lease_fence int not null default 0, -- monotônico por Job
  cancel_requested_at timestamptz,
  cancel_reason text,
  blocked_at timestamptz,
  last_resolution_attempt_at timestamptz,
  resolution_attempts int,
  next_resolution_at timestamptz,
  intervention_required boolean,
  available_at timestamptz not null default now(),
  version int not null default 0, -- CAS otimista, independente do lease_fence
  payload jsonb not null,
  execution_scope text not null default 'RUN_SCOPED' check (execution_scope in ('RUN_SCOPED','STANDALONE')),
  execution_scope_ref jsonb not null, -- JobExecutionScopeRef, narrowed pelo execution_scope
  production_run_id uuid references public.video_machine_production_run (production_run_id), -- só RUN_SCOPED
  stage_key text, -- só RUN_SCOPED
  subject_type text, -- só RUN_SCOPED
  subject_id text, -- só RUN_SCOPED
  stage_work_unit_identity_hash text, -- só RUN_SCOPED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_machine_job_tenant_logical_key_uniq unique (tenant_id, logical_job_key),
  constraint video_machine_job_run_scoped_fields_check check (
    (execution_scope = 'RUN_SCOPED' and production_run_id is not null and stage_key is not null)
    or (execution_scope = 'STANDALONE' and production_run_id is null and stage_key is null)
  )
);
comment on table public.video_machine_job is 'Job (Skill02 SPEC.md, JobCommon + discriminated union por execution_scope) — Fase 1 só popula RUN_SCOPED. UNIQUE(tenant_id, logical_job_key) é a idempotência central de ensureJob(). version é CAS otimista independente de lease_fence: version protege o conteúdo lógico do Job, lease_fence protege autoridade de escrita do worker atual.';

-- JobAttempt (encolhido pelo R1 revisado — só campos técnicos de execução).
create table if not exists public.video_machine_job_attempt (
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text,
  error_code text,
  primary key (job_id, attempt_number)
);
comment on table public.video_machine_job_attempt is 'JobAttempt (Skill02 SPEC.md, PATCH R1 revisado) — só a execução técnica do handler ("esta tentativa está viva?"). Estado de efeito externo NUNCA vive aqui — migrou pra video_machine_external_effect_checkpoint (uma Attempt pode operar zero ou mais checkpoints).';

-- ExternalEffectCheckpoint (R1 revisado): a unidade da ocorrência
-- lógica de side effect, independente da Attempt.
create table if not exists public.video_machine_external_effect_checkpoint (
  external_effect_checkpoint_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.video_machine_job (id),
  external_effect_occurrence_key text not null,
  provider_request_key text, -- congelado na 1ª submissão, imutável depois (R1 revisado)
  state text not null default 'NOT_STARTED' check (state in ('NOT_STARTED','SUBMITTING','CONFIRMED','NOT_APPLIED','UNKNOWN')),
  external_operation_id text, -- congelado na 1ª observação confiável (R1, fechamento do BLOCKER)
  next_poll_at timestamptz,
  deadline_at timestamptz,
  outcome text,
  error_code text,
  first_attempt_number int not null,
  last_attempt_number int not null,
  version int not null default 0, -- CAS otimista, base do fencing de beginExternalSubmission/reportExternalEffectObservation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_machine_external_effect_checkpoint_job_occurrence_uniq unique (job_id, external_effect_occurrence_key)
);
comment on table public.video_machine_external_effect_checkpoint is 'ExternalEffectCheckpoint (Skill02 SPEC.md, R1 revisado) — UNIQUE(job_id, external_effect_occurrence_key), NUNCA UNIQUE(job_id, attempt_number). beginExternalSubmission é a única autoridade pra NOT_STARTED->SUBMITTING; reportExternalEffectObservation é a única autoridade pra SUBMITTING/UNKNOWN->CONFIRMED|NOT_APPLIED|UNKNOWN. CONFIRMED e NOT_APPLIED são terminais, nunca reabertos.';

-- JobExecutionResult (Job-level, nunca escreve external_effect_checkpoint).
create table if not exists public.video_machine_job_execution_result (
  job_execution_result_id uuid primary key default gen_random_uuid(),
  execution_result_key text not null,
  tenant_id text not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_id text not null,
  attempt_number int not null,
  lease_fence int not null,
  handler_invocation_key text not null,
  execution_context_hash text not null,
  job_execution_binding_id text not null,
  job_execution_binding_hash text not null,
  execution_scope_ref jsonb not null,
  handler jsonb not null, -- SkillJobHandlerRef
  outcome text not null check (outcome in ('CONTINUE','SUCCEEDED','BLOCKED','FAILED')),
  result_ref jsonb,
  additional_result_refs jsonb not null default '[]'::jsonb,
  continuation jsonb,
  block jsonb,
  failure jsonb,
  execution_result_hash text not null,
  reported_at timestamptz not null default now(),
  constraint video_machine_job_execution_result_key_uniq unique (execution_result_key)
);
comment on table public.video_machine_job_execution_result is 'JobExecutionResult (Skill02 SPEC.md) — Job-level. NUNCA escreve ExternalEffectCheckpoint.state diretamente (proibição explícita do R1, fechamento do BLOCKER) — pode só observar checkpoints pra decidir disposition de settlement.';

-- JobExecutionSettlement.
create table if not exists public.video_machine_job_execution_settlement (
  job_execution_settlement_id uuid primary key default gen_random_uuid(),
  settlement_key text not null,
  tenant_id text not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_id text not null,
  attempt_number int not null,
  job_execution_result_id uuid not null references public.video_machine_job_execution_result (job_execution_result_id),
  job_execution_result_hash text not null,
  disposition text not null check (disposition in ('CONTINUE_SAME_ATTEMPT','JOB_SUCCEEDED','JOB_BLOCKED','RETRY_NEW_ATTEMPT','JOB_FAILED_TERMINAL')),
  consumer_visibility text not null default 'EMIT' check (consumer_visibility in ('EMIT','SUPPRESS')),
  next_attempt_number int,
  continuation_not_before timestamptz,
  settlement_hash text not null,
  settled_at timestamptz not null default now(),
  constraint video_machine_job_execution_settlement_key_uniq unique (settlement_key)
);
comment on table public.video_machine_job_execution_settlement is 'JobExecutionSettlement (Skill02 SPEC.md) — mesma proibição de JobExecutionResult: nunca escreve ExternalEffectCheckpoint.state. disposition=JOB_SUCCEEDED nunca deve ser aplicado (em código) enquanto algum checkpoint obrigatório do Job ainda está SUBMITTING/UNKNOWN (achado real da re-review sobre d487eec).';

-- JobBlockedEvent / JobResultEvent — eventos terminais/de bloqueio, outbox.
create table if not exists public.video_machine_job_blocked_event (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null default 'JOB_BLOCKED',
  tenant_id text not null,
  job_id uuid not null references public.video_machine_job (id),
  job_version int not null,
  logical_job_key text not null,
  run_id uuid,
  block_reason text not null check (block_reason in ('EXTERNAL_STATE_UNKNOWN','QUOTA_PAUSED','POLICY_BLOCKED')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
comment on table public.video_machine_job_blocked_event is 'JobBlockedEvent (Skill02 SPEC.md) — NÃO terminal, trabalho aguardando intervenção/reconciliação/evento. job_version é sempre a versão RESULTANTE da transição pra BLOCKED, nunca a anterior (checagem de evento stale determinística pela Skill01).';

create table if not exists public.video_machine_job_result_event (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null default 'JOB_RESULT',
  tenant_id text not null,
  job_id uuid not null references public.video_machine_job (id),
  logical_job_key text not null,
  run_id uuid,
  outcome text not null check (outcome in ('SUCCEEDED','FAILED','CANCELLED')),
  attempt_number int not null,
  finished_at timestamptz not null,
  result_payload jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
comment on table public.video_machine_job_result_event is 'JobResultEvent (Skill02 SPEC.md) — evento terminal (SUCCEEDED/FAILED/CANCELLED) consumido pela Skill01 pra avançar a StageTransitionResolution correspondente.';

-- =====================================================================
-- Índices de consulta (fora dos UNIQUE já declarados acima)
-- =====================================================================

create index if not exists video_machine_job_status_available_at_idx
  on public.video_machine_job (status, available_at)
  where status in ('QUEUED','RETRYING');
comment on index public.video_machine_job_status_available_at_idx is 'Índice pro worker (cron) reivindicar Jobs elegíveis rapidamente — mesmo padrão de "picking next candidate" já usado em publish-product.';

create index if not exists video_machine_stage_execution_run_idx
  on public.video_machine_stage_execution (production_run_id, execution_ordinal);

create index if not exists video_machine_job_attempt_job_idx
  on public.video_machine_job_attempt (job_id);

-- =====================================================================
-- RLS — mesmo padrão de todas as tabelas deste projeto: habilitado, sem
-- nenhuma policy. Só a service_role key (que ignora RLS) acessa; nunca
-- exposto ao browser.
-- =====================================================================

alter table public.video_machine_production_run enable row level security;
alter table public.video_machine_production_run_runtime_state enable row level security;
alter table public.video_machine_stage_iteration enable row level security;
alter table public.video_machine_stage_execution enable row level security;
alter table public.video_machine_stage_execution_runtime_state enable row level security;
alter table public.video_machine_prepared_skill_invocation enable row level security;
alter table public.video_machine_skill_execution_resolution enable row level security;
alter table public.video_machine_logical_job_intent enable row level security;
alter table public.video_machine_outbox_consumer_delivery enable row level security;
alter table public.video_machine_job enable row level security;
alter table public.video_machine_job_attempt enable row level security;
alter table public.video_machine_external_effect_checkpoint enable row level security;
alter table public.video_machine_job_execution_result enable row level security;
alter table public.video_machine_job_execution_settlement enable row level security;
alter table public.video_machine_job_blocked_event enable row level security;
alter table public.video_machine_job_result_event enable row level security;
