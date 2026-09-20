-- Skill 08 (Roteirista) — src/modules/video-machine/skills/08-roteirista/SPEC.md.
-- creativeMode chega sempre EVERGREEN (Skill06 DEFERRED_V2_CONTRACT, ver
-- comentário da migration da Skill07) -> ScriptFactCatalog.trendEvidence
-- é sempre [] na prática hoje; qualquer referência TREND_EVIDENCE numa
-- proposta é rejeitada por SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION.

create table if not exists public.video_machine_script_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  script_taxonomy_version text not null default 'SCRIPT_TAXONOMY_V1',
  locale text not null default 'pt-BR',
  allowed_beat_purposes jsonb not null,
  max_beat_count int not null,
  allow_spoken_text boolean not null default true,
  allow_on_screen_text boolean not null default true,
  require_hook boolean not null default true,
  require_cta boolean not null default true,
  duration_min_seconds numeric,
  duration_max_seconds numeric,
  factual_claim_rules jsonb not null,
  created_at timestamptz not null default now(),
  constraint video_machine_script_policy_key_version_uniq unique (tenant_id, policy_key, policy_version)
);
comment on table public.video_machine_script_policy is 'ScriptPolicy (Skill08 SPEC.md) — imutável por (policy_key, policy_version). maxBeatCount=1 na V1 (VIDEO_COMPOSITION_V1 exige beats.length===1 para o pipeline produtivo).';

create table if not exists public.video_machine_script_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_script_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_script_policy_binding is 'ScriptPolicyBinding (Skill08 SPEC.md).';

create table if not exists public.video_machine_script_inference_checkpoint (
  inference_checkpoint_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  creative_direction_result_id uuid not null references public.video_machine_creative_direction_result (result_id),
  creative_direction_hash text not null,
  script_policy_id uuid not null references public.video_machine_script_policy (policy_id),
  script_policy_version text not null,
  provider_key text not null,
  model_key text not null,
  generation_context_hash text not null,
  provider_request_hash text not null,
  provider_request_key text not null,
  state text not null check (state in ('PREPARED','SUBMITTING','RESPONSE_CAPTURED','VALIDATED','REJECTED')),
  provider_request_id text,
  provider_response_hash text,
  normalized_proposal jsonb,
  rejection_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_machine_script_inference_checkpoint_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_script_inference_checkpoint is 'ScriptInferenceCheckpoint (Skill08 SPEC.md) — RESPONSE_CAPTURED antes do ScriptResult, replay nunca chama o provider de novo; REJECTED persiste rejectionCode e também não rechama.';

create table if not exists public.video_machine_script_result (
  result_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  creative_direction_result_id uuid not null references public.video_machine_creative_direction_result (result_id),
  creative_direction_hash text not null,
  locale text not null,
  creative_constraints jsonb not null,
  beats jsonb not null,
  estimated_duration_seconds numeric,
  script_policy_id uuid not null references public.video_machine_script_policy (policy_id),
  script_policy_version text not null,
  script_policy_snapshot_hash text not null,
  generation_context_hash text not null,
  script_hash text not null,
  inference_provenance jsonb not null,
  created_at timestamptz not null default now(),
  constraint video_machine_script_result_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_script_result is 'ScriptResult (Skill08 SPEC.md) — resultStatus sempre OK na V1 (nenhum status de falha parcial definido); scriptHash exclui inferenceProvenance (identidade de conteúdo separada de proveniência de produção).';

alter table public.video_machine_script_policy enable row level security;
alter table public.video_machine_script_policy_binding enable row level security;
alter table public.video_machine_script_inference_checkpoint enable row level security;
alter table public.video_machine_script_result enable row level security;
