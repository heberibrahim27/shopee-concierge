-- Skill 09 (Gerador de Frame) — src/modules/video-machine/skills/09-gerador-de-frame/SPEC.md.
-- ImageGenerationProvider = NOT_IMPLEMENTED hoje (confirmado pela auditoria
-- do próprio SPEC.md) -> frame_generation_checkpoint/frame_artifact ficam
-- com schema pronto pra quando um provider real for cablado, mas nenhuma
-- linha é escrita neles nesta fase: qualquer FrameRequirement que
-- realmente precise gerar imagem (referência POPULATED) retorna
-- FRAME_PROVIDER_CAPABILITY_UNSUPPORTED antes de qualquer checkpoint,
-- mesmo padrão do SCRIPT_PROVIDER_NOT_CONFIGURED da Skill08.

create table if not exists public.video_machine_product_visual_reference_set (
  product_visual_reference_set_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  subject_ref jsonb not null,
  content jsonb not null,
  product_visual_reference_set_hash text not null,
  materialized_at timestamptz not null default now()
);
comment on table public.video_machine_product_visual_reference_set is 'ProductVisualReferenceSet (Skill09 SPEC.md, Ponto S2) — sem identidade de replay própria, nasce sempre junto do FrameGenerationResult da mesma (jobId, attemptNumber). content.kind=POPULATED (references>=1) ou EMPTY (references=[] + emptyReason obrigatório: NO_FRAME_REQUIRED | REFERENCE_UNAVAILABLE | TEXT_TO_VIDEO).';

create table if not exists public.video_machine_frame_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  frame_schema_version text not null default 'FRAME_V1',
  allowed_reference_source_types jsonb not null,
  allowed_mime_types jsonb not null,
  output jsonb not null default '{}'::jsonb,
  validation_policy jsonb not null,
  require_frame boolean not null default true,
  created_at timestamptz not null default now(),
  constraint video_machine_frame_policy_key_version_uniq unique (tenant_id, policy_key, policy_version)
);
comment on table public.video_machine_frame_policy is 'FramePolicy (Skill09 SPEC.md) — imutável por (policy_key, policy_version). requireFrame=false é a única forma real, nesta fase, de a execução resolver NO_FRAME_REQUIRED (nenhum modo TEXT_TO_VIDEO explícito implementado ainda).';

create table if not exists public.video_machine_frame_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_frame_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_frame_policy_binding is 'FramePolicyBinding (Skill09 SPEC.md).';

create table if not exists public.video_machine_frame_requirement (
  frame_requirement_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  creative_direction_result_id uuid not null references public.video_machine_creative_direction_result (result_id),
  creative_direction_hash text not null,
  script_result_id uuid not null references public.video_machine_script_result (result_id),
  script_hash text not null,
  beat_index int not null,
  purpose text not null default 'BEAT_SEED',
  visual_intent jsonb not null,
  reference_ids_allowed jsonb not null default '[]'::jsonb,
  composition_constraints jsonb,
  frame_requirement_hash text not null,
  created_at timestamptz not null default now()
);
comment on table public.video_machine_frame_requirement is 'FrameRequirement (Skill09 SPEC.md) — necessidade semântica de frame por beat, derivada do ScriptResult; não é tentativa de geração.';

create table if not exists public.video_machine_frame_generation_checkpoint (
  frame_generation_checkpoint_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  frame_requirement_id uuid not null references public.video_machine_frame_requirement (frame_requirement_id),
  frame_requirement_hash text not null,
  frame_policy_id uuid not null references public.video_machine_frame_policy (policy_id),
  frame_policy_version text not null,
  frame_policy_snapshot_hash text not null,
  provider_key text not null,
  model_key text not null,
  generation_context_hash text not null,
  provider_request_hash text not null,
  provider_request_key text not null,
  state text not null check (state in ('PREPARED','SUBMITTING','PROVIDER_RESULT_CAPTURED','ARTIFACT_MATERIALIZED','VALIDATED','REJECTED')),
  provider_request_id text,
  provider_response_hash text,
  temporary_asset_ref text,
  materialized_content_hash text,
  materialized_storage_ref text,
  materialized_mime_type text,
  materialized_width int,
  materialized_height int,
  rejection_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_machine_frame_generation_checkpoint_uniq unique (job_id, attempt_number, frame_requirement_id)
);
comment on table public.video_machine_frame_generation_checkpoint is 'FrameGenerationCheckpoint (Skill09 SPEC.md) — granularidade por (jobId, attemptNumber, frameRequirementId), não por (jobId, attemptNumber) como Skill07/08. Nenhuma linha escrita nesta fase (provider de imagem NOT_IMPLEMENTED) — schema pronto pra quando existir.';

create table if not exists public.video_machine_frame_artifact (
  frame_artifact_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  frame_requirement_id uuid not null references public.video_machine_frame_requirement (frame_requirement_id),
  frame_requirement_hash text not null,
  creative_direction_result_id uuid not null references public.video_machine_creative_direction_result (result_id),
  creative_direction_hash text not null,
  script_result_id uuid not null references public.video_machine_script_result (result_id),
  script_hash text not null,
  stage_subject_binding_id uuid not null references public.video_machine_stage_subject_binding (stage_subject_binding_id),
  product_visual_reference_set_id uuid not null references public.video_machine_product_visual_reference_set (product_visual_reference_set_id),
  materialized_reference_content_hashes jsonb not null default '[]'::jsonb,
  frame_policy_id uuid not null references public.video_machine_frame_policy (policy_id),
  frame_policy_version text not null,
  frame_policy_snapshot_hash text not null,
  provider_key text not null,
  model_key text not null,
  generation_context_hash text not null,
  provider_request_hash text not null,
  provider_response_hash text not null,
  content_hash text not null,
  storage_ref text not null,
  mime_type text not null,
  width int,
  height int,
  validation_summary jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.video_machine_frame_artifact is 'FrameArtifact (Skill09 SPEC.md) — canônico só depois de bytes materializados + validationSummary.valid=true na mesma transação do checkpoint VALIDATED. Nenhuma linha escrita nesta fase.';

create table if not exists public.video_machine_frame_generation_result (
  result_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  stage_subject_binding_id uuid not null references public.video_machine_stage_subject_binding (stage_subject_binding_id),
  creative_direction_result_id uuid not null references public.video_machine_creative_direction_result (result_id),
  creative_direction_hash text not null,
  script_result_id uuid not null references public.video_machine_script_result (result_id),
  script_hash text not null,
  product_visual_reference_set_id uuid not null references public.video_machine_product_visual_reference_set (product_visual_reference_set_id),
  result_status text not null check (result_status in ('OK','NO_FRAME_REQUIRED','REFERENCE_UNAVAILABLE')),
  reason text,
  frame_requirement_count int not null default 0,
  frame_artifacts jsonb not null default '[]'::jsonb,
  frame_policy_id uuid not null references public.video_machine_frame_policy (policy_id),
  frame_policy_version text not null,
  frame_policy_snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_frame_generation_result_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_frame_generation_result is 'FrameGenerationResult (Skill09 SPEC.md) — discriminated union por result_status. Nesta fase só OK nunca ocorre de fato (provider NOT_IMPLEMENTED); NO_FRAME_REQUIRED e REFERENCE_UNAVAILABLE são os únicos status realmente alcançáveis, ambos legítimos e sem custo/provider call.';

alter table public.video_machine_product_visual_reference_set enable row level security;
alter table public.video_machine_frame_policy enable row level security;
alter table public.video_machine_frame_policy_binding enable row level security;
alter table public.video_machine_frame_requirement enable row level security;
alter table public.video_machine_frame_generation_checkpoint enable row level security;
alter table public.video_machine_frame_artifact enable row level security;
alter table public.video_machine_frame_generation_result enable row level security;
