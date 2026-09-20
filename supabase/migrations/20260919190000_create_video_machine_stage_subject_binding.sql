-- StageSubjectBinding (Skill01 SPEC.md) — deixado fora da migration do
-- kernel (20260919160000) por não ter consumidor real ainda. A Skill07
-- (Direção Criativa) agora exige stageSubjectBindingId como AUTORIDADE
-- do subject, então esta tabela entra agora. Resolução automática pela
-- Skill01 (algoritmo completo de "quem vira o próximo subject") ainda
-- não está implementada — nesta fase o binding é criado manualmente
-- pelo consumidor real (ex.: script de teste), mimetizando o que a
-- Skill01 fará automaticamente no futuro.

create table if not exists public.video_machine_stage_subject_binding (
  stage_subject_binding_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.video_machine_production_run (production_run_id),
  stage_key text not null,
  stage_iteration_id uuid not null references public.video_machine_stage_iteration (stage_iteration_id),
  stage_iteration_hash text not null,
  stage_work_unit_identity_hash text not null,
  subject_type text not null check (subject_type in ('PRODUCT','VIDEO','PUBLICATION')),
  subject_id text not null,
  source_result_id uuid not null,
  source_position int,
  resolution_policy_version text not null default 'v1',
  created_at timestamptz not null default now(),
  constraint video_machine_stage_subject_binding_uniq unique (run_id, stage_key, stage_iteration_id, stage_work_unit_identity_hash)
);
comment on table public.video_machine_stage_subject_binding is 'StageSubjectBinding (Skill01 SPEC.md) — UNIQUE(run_id, stage_key, stage_iteration_id, stage_work_unit_identity_hash). Materializado uma vez; replay do mesmo Run/stage reutiliza o binding existente, nunca resolve de novo. source_result_id/source_position apontam pro Result upstream exato (ex.: OfferAnalysisResult) que originou este subject — nunca "o mais recente".';

alter table public.video_machine_stage_subject_binding enable row level security;
