-- Skill 07 (Direção Criativa) — src/modules/video-machine/skills/07-direcao-criativa/SPEC.md.
-- Como Skill06 (tendências) está DEFERRED_V2_CONTRACT, trend_research_result_id
-- é sempre ausente na prática hoje — creativeMode sempre resolve EVERGREEN
-- (comportamento legítimo já previsto no SPEC via Ponto M5, nunca erro).

create table if not exists public.video_machine_creative_direction_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  allowed_modes jsonb not null,
  allowed_archetypes jsonb not null,
  allowed_hook_strategies jsonb not null,
  allowed_narrative_structures jsonb not null,
  allowed_visual_approaches jsonb not null,
  allowed_cta_mechanisms jsonb not null,
  comment_keyword text,
  default_locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  constraint video_machine_creative_direction_policy_key_version_uniq unique (tenant_id, policy_key, policy_version)
);
comment on table public.video_machine_creative_direction_policy is 'CreativeDirectionPolicy (Skill07 SPEC.md) — imutável por (policy_key, policy_version).';

create table if not exists public.video_machine_creative_direction_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_creative_direction_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_creative_direction_policy_binding is 'CreativeDirectionPolicyBinding (Skill07 SPEC.md).';

create table if not exists public.video_machine_creative_inference_checkpoint (
  inference_checkpoint_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  provider_key text not null,
  model_key text not null,
  context_hash text not null,
  provider_request_hash text not null,
  provider_request_key text not null,
  state text not null check (state in ('PREPARED','SUBMITTING','RESPONSE_CAPTURED','VALIDATED','REJECTED')),
  response_hash text,
  normalized_proposal jsonb,
  provider_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_machine_creative_inference_checkpoint_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_creative_inference_checkpoint is 'CreativeInferenceCheckpoint (Skill07 SPEC.md) — provider respondeu -> RESPONSE_CAPTURED antes do Result, pra replay nunca chamar a IA de novo.';

create table if not exists public.video_machine_creative_direction_result (
  result_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  stage_subject_binding_id uuid not null references public.video_machine_stage_subject_binding (stage_subject_binding_id),
  subject_ref jsonb not null,
  subject_facts_snapshot jsonb,
  offer_analysis_result_id uuid not null,
  trend_research_result_id uuid,
  result_status text not null check (result_status in ('OK','NO_APPLICABLE_DIRECTION')),
  reason text,
  creative_mode text check (creative_mode in ('TREND_INFORMED','EVERGREEN')),
  direction jsonb,
  decisions jsonb,
  trend_evidence_refs_used jsonb not null default '[]'::jsonb,
  creative_cta_intent_hash text,
  creative_direction_policy_id uuid not null references public.video_machine_creative_direction_policy (policy_id),
  creative_direction_policy_version text not null,
  creative_direction_policy_snapshot_hash text not null,
  creative_direction_hash text,
  inference_provenance jsonb,
  created_at timestamptz not null default now(),
  constraint video_machine_creative_direction_result_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_creative_direction_result is 'CreativeDirectionResult (Skill07 SPEC.md) — OK ou NO_APPLICABLE_DIRECTION, ambos snapshot imutável.';

alter table public.video_machine_creative_direction_policy enable row level security;
alter table public.video_machine_creative_direction_policy_binding enable row level security;
alter table public.video_machine_creative_inference_checkpoint enable row level security;
alter table public.video_machine_creative_direction_result enable row level security;
