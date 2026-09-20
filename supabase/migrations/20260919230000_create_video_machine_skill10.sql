-- Skill 10 (Gerador de Prompt de Vídeo) — src/modules/video-machine/skills/10-gerador-de-prompt-de-video/SPEC.md.
-- Diferente das Skills 07/08/09, esta Skill é pura/determinística e sem
-- side effect externo — não existe checkpoint/state machine, só o
-- VideoPromptArtifact final. VideoGenerationProvider (Veo/execução real)
-- continua NOT_IMPLEMENTED (isso é Skill 11) — o adapter aqui é
-- transformação de template determinística, nunca chamada de rede.

create table if not exists public.video_machine_video_prompt_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  allowed_generation_modes jsonb not null,
  require_visual_seed_when_product_visible boolean not null default true,
  allow_camera_intent boolean not null default true,
  allow_subject_motion_intent boolean not null default true,
  allow_scene_motion_intent boolean not null default true,
  provider_generated_text_policy text not null check (provider_generated_text_policy in ('FORBID','ALLOW_EXACT_SCRIPT_TEXT')),
  audio_policy text not null check (audio_policy in ('UNSPECIFIED','NO_GENERATED_AUDIO','GENERATED_AUDIO_ALLOWED')),
  generation_constraints jsonb,
  provider_profile_key text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_video_prompt_policy_key_version_uniq unique (tenant_id, policy_key, policy_version)
);
comment on table public.video_machine_video_prompt_policy is 'VideoPromptPolicy (Skill10 SPEC.md) — imutável por (policy_key, policy_version). generation_constraints (duração/aspectRatio/seed) fica null até existir decisão real de provider, nunca valor chutado.';

create table if not exists public.video_machine_video_prompt_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_video_prompt_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_video_prompt_policy_binding is 'VideoPromptPolicyBinding (Skill10 SPEC.md).';

create table if not exists public.video_machine_video_provider_profile (
  provider_profile_id uuid primary key default gen_random_uuid(),
  provider_profile_key text not null,
  provider_profile_version text not null,
  tenant_id text not null,
  provider_key text not null,
  model_key text not null,
  adapter_key text not null,
  adapter_version text not null,
  integration_binding_id text not null,
  integration_binding_hash text not null,
  credential_scope text not null check (credential_scope in ('TENANT_BYO','PLATFORM_MANAGED')),
  created_at timestamptz not null default now(),
  constraint video_machine_video_provider_profile_key_version_uniq unique (tenant_id, provider_profile_key, provider_profile_version)
);
comment on table public.video_machine_video_provider_profile is 'VideoProviderProfile (Skill10 SPEC.md) — sem secret/credential value, só handles (integration_binding_id/hash). IntegrationBinding real (Skill24) ainda não existe: os campos aqui são texto livre até essa Skill ser implementada, sem FK cruzada prematura.';

create table if not exists public.video_machine_video_provider_profile_binding (
  tenant_id text not null,
  provider_profile_key text not null,
  active_provider_profile_id uuid not null references public.video_machine_video_provider_profile (provider_profile_id),
  active_provider_profile_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, provider_profile_key)
);
comment on table public.video_machine_video_provider_profile_binding is 'Resolução de "active version" do VideoProviderProfile — mesmo padrão de *_policy_binding já usado nas Skills 04-10.';

create table if not exists public.video_machine_video_prompt_artifact (
  video_prompt_artifact_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  stage_subject_binding_id uuid not null references public.video_machine_stage_subject_binding (stage_subject_binding_id),
  creative_direction_result_id uuid not null references public.video_machine_creative_direction_result (result_id),
  creative_direction_hash text not null,
  script_result_id uuid not null references public.video_machine_script_result (result_id),
  script_hash text not null,
  beat_index int not null,
  frame_requirement_id uuid references public.video_machine_frame_requirement (frame_requirement_id),
  frame_requirement_hash text,
  frame_artifact_id uuid references public.video_machine_frame_artifact (frame_artifact_id),
  frame_content_hash text,
  product_visual_reference_set_id uuid not null references public.video_machine_product_visual_reference_set (product_visual_reference_set_id),
  video_prompt_policy_id uuid not null references public.video_machine_video_prompt_policy (policy_id),
  video_prompt_policy_version text not null,
  video_prompt_policy_snapshot_hash text not null,
  intent jsonb not null,
  intent_hash text not null,
  provider_profile_key text not null,
  provider_profile_version text not null,
  provider_profile_snapshot_hash text not null,
  provider_key text not null,
  model_key text not null,
  adapter_key text not null,
  adapter_version text not null,
  adapter_request_hash text not null,
  provider_instruction jsonb not null,
  provider_instruction_hash text not null,
  video_prompt_artifact_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_video_prompt_artifact_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_video_prompt_artifact is 'VideoPromptArtifact (Skill10 SPEC.md) — output canônico, puro/determinístico. Skill11 consome por (video_prompt_artifact_id, video_prompt_artifact_hash), nunca "o prompt mais recente".';

alter table public.video_machine_video_prompt_policy enable row level security;
alter table public.video_machine_video_prompt_policy_binding enable row level security;
alter table public.video_machine_video_provider_profile enable row level security;
alter table public.video_machine_video_provider_profile_binding enable row level security;
alter table public.video_machine_video_prompt_artifact enable row level security;
