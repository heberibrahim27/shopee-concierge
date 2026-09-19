-- Skill 05 (Análise de Oferta/Comissão) — src/modules/video-machine/skills/05-analise-de-oferta-comissao/SPEC.md.
-- Lê o ProductDiscoveryResult (Skill04) + offer_snapshots referenciados
-- (catálogo compartilhado, já existente) e produz um OfferAnalysisResult
-- tenant-scoped imutável. Calibrações de sinal (COMMISSION_RATE_SIGNAL_V1/
-- COMMISSION_VALUE_SIGNAL_V1) são constantes TS congeladas
-- (src/modules/video-machine/skills/05-analise-de-oferta-comissao/offerAnalysis.ts),
-- não viram tabela — mesmo padrão já usado pra config imutável no kernel.

create table if not exists public.video_machine_offer_analysis_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  max_snapshot_age_seconds int not null,
  min_commission_rate_fraction numeric,
  min_commission_value_brl numeric,
  min_discount_rate_percent numeric,
  ranking_weights jsonb not null,
  signal_versions jsonb not null default '{"commissionRate":"COMMISSION_RATE_SIGNAL_V1","commissionValue":"COMMISSION_VALUE_SIGNAL_V1","discount":"DISCOUNT_SIGNAL_V1","offerRanking":"OFFER_RANKING_V1"}'::jsonb,
  calibration_refs jsonb not null,
  created_at timestamptz not null default now(),
  constraint video_machine_offer_analysis_policy_key_version_uniq unique (tenant_id, policy_key, policy_version)
);
comment on table public.video_machine_offer_analysis_policy is 'OfferAnalysisPolicy (Skill05 SPEC.md) — imutável por (policy_key, policy_version). Congela inclusive quais calibrações/versões de sinal foram usadas.';

create table if not exists public.video_machine_offer_analysis_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_offer_analysis_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_offer_analysis_policy_binding is 'OfferAnalysisPolicyBinding (Skill05 SPEC.md) — a policy nunca muda, o binding aponta pra versão vigente.';

create table if not exists public.video_machine_offer_analysis_result (
  result_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  discovery_result_id uuid not null references public.video_machine_product_discovery_result (result_id),
  result_status text not null check (result_status in ('OK','PARTIAL','NO_ELIGIBLE_OFFERS','OFFER_DATA_STALE')),
  target_primary_count int not null,
  target_alternate_count int not null,
  primary_candidates jsonb not null default '[]'::jsonb,
  alternate_candidates jsonb not null default '[]'::jsonb,
  analyzed_candidate_count int not null,
  fresh_candidate_count int not null,
  eligible_candidate_count int not null,
  offer_analysis_policy_id uuid not null references public.video_machine_offer_analysis_policy (policy_id),
  offer_analysis_policy_version text not null,
  offer_analysis_policy_snapshot_hash text not null,
  commission_rate_signal_version text not null default 'COMMISSION_RATE_SIGNAL_V1',
  commission_value_signal_version text not null default 'COMMISSION_VALUE_SIGNAL_V1',
  discount_signal_version text not null default 'DISCOUNT_SIGNAL_V1',
  offer_ranking_version text not null default 'OFFER_RANKING_V1',
  commission_rate_calibration_ref jsonb not null,
  commission_value_calibration_ref jsonb not null,
  analysis_read_at timestamptz not null,
  candidate_set_hash text not null,
  ranking_snapshot jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint video_machine_offer_analysis_result_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_offer_analysis_result is 'OfferAnalysisResult (Skill05 SPEC.md) — snapshot histórico imutável. UNIQUE(job_id, attempt_number): idempotência S14, igual à Skill04.';

alter table public.video_machine_offer_analysis_policy enable row level security;
alter table public.video_machine_offer_analysis_policy_binding enable row level security;
alter table public.video_machine_offer_analysis_result enable row level security;
