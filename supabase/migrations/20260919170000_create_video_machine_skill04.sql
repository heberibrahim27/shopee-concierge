-- Skill 04 (Descoberta de Produtos) — src/modules/video-machine/skills/04-descoberta-de-produtos/SPEC.md.
-- Lê o catálogo/pool JÁ EXISTENTE (products/offer_snapshots/deal_candidates/
-- product_groups/social_posts, sem tenantId, mercado compartilhado — ver
-- "Multi-tenant" no SPEC) e produz um ProductDiscoveryResult tenant-scoped
-- imutável. Não introduz outbox novo (Skill04 não tem lifecycle próprio de
-- Job, é execução normal via Skill02 — mesmo padrão RLS das demais tabelas
-- deste projeto: habilitado, sem policy, só service_role acessa).

create table if not exists public.video_machine_product_selection_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  reuse_policy text not null check (reuse_policy in ('NEVER_REUSE','COOLDOWN','ALLOW')),
  cooldown_seconds int, -- obrigatório quando reuse_policy=COOLDOWN, validado em código
  minimum_usage_evidence_kind text not null check (minimum_usage_evidence_kind in ('MATERIALIZED','PRIMARY_PUBLISHED')),
  max_snapshot_age_seconds int not null,
  exclude_if_previously_published_as_any_content boolean not null default false,
  eligible_source_statuses jsonb not null default '["discovered"]'::jsonb,
  ranking_weights jsonb not null,
  diversification_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint video_machine_product_selection_policy_key_version_uniq unique (tenant_id, policy_key, policy_version)
);
comment on table public.video_machine_product_selection_policy is 'ProductSelectionPolicy (Skill04 SPEC.md) — imutável por (policy_key, policy_version). Mudou peso/freshness/reuse/eligibleSourceStatuses/diversificação -> nova policy_version, nunca edição in-place.';

create table if not exists public.video_machine_product_selection_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_product_selection_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_product_selection_policy_binding is 'ProductSelectionPolicyBinding (Skill04 SPEC.md) — a policy nunca muda, o binding aponta pra versão vigente; um ProductDiscoveryResult antigo continua provando qual versão decidiu aquele shortlist.';

create table if not exists public.video_machine_product_discovery_result (
  result_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid,
  job_id uuid not null references public.video_machine_job (id),
  attempt_number int not null,
  result_status text not null check (result_status in ('OK','PARTIAL','NO_ELIGIBLE_CANDIDATES','CANDIDATE_POOL_STALE')),
  requested_count int not null,
  alternate_count int not null,
  primary_candidates jsonb not null default '[]'::jsonb,
  alternate_candidates jsonb not null default '[]'::jsonb,
  pool_candidate_count int not null,
  evaluated_count int not null,
  fresh_candidate_count int not null,
  eligible_count int not null,
  selection_policy_id uuid not null references public.video_machine_product_selection_policy (policy_id),
  selection_policy_version text not null,
  selection_policy_snapshot_hash text not null,
  source_scoring_model text not null default 'DEAL_SCORING',
  commercial_signal_formula_version text not null default 'DISCOVERY_COMMERCIAL_V1',
  discovery_ranking_version text not null default 'DISCOVERY_RANKING_V1',
  pool_read_at timestamptz not null,
  ranking_snapshot jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint video_machine_product_discovery_result_job_attempt_uniq unique (job_id, attempt_number)
);
comment on table public.video_machine_product_discovery_result is 'ProductDiscoveryResult (Skill04 SPEC.md) — snapshot histórico imutável, mesmo quando result_status != OK. UNIQUE(job_id, attempt_number): no máximo um resultado canônico por Attempt (RESULT_MATERIALIZATION_V1/S14) — reexecução reutiliza, nunca recalcula/compara.';

create table if not exists public.video_machine_product_usage_evidence (
  product_usage_evidence_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  product_id uuid not null references public.products (id),
  usage_kind text not null check (usage_kind in ('MATERIALIZED','PRIMARY_PUBLISHED')),
  used_at timestamptz not null,
  evidence_ref jsonb not null,
  evidence_ref_hash text generated always as (md5(evidence_ref::text)) stored,
  recorded_at timestamptz not null default now(),
  product_usage_evidence_hash text not null,
  constraint video_machine_product_usage_evidence_identity_uniq unique (tenant_id, product_id, usage_kind, evidence_ref_hash)
);
comment on table public.video_machine_product_usage_evidence is 'ProductUsageEvidence (Skill04 SPEC.md, Ponto S9) — ledger append-only, nunca UPDATE. Writers autorizados: Skill11/Skill14 (MATERIALIZED), Skill17 (PRIMARY_PUBLISHED). Idempotência por (tenant_id, product_id, usage_kind, evidence_ref exato) — evidence_ref_hash é md5 do JSON canônico só pra viabilizar o UNIQUE (o hash semântico real é product_usage_evidence_hash, calculado em código via CANONICAL_SERIALIZATION_V1).';

create index if not exists video_machine_product_usage_evidence_lookup_idx
  on public.video_machine_product_usage_evidence (tenant_id, product_id, usage_kind, used_at desc);
comment on index public.video_machine_product_usage_evidence_lookup_idx is 'Índice pra ReusePolicy: achar rápido a evidência mais recente que qualifica um (tenant, produto, threshold).';

alter table public.video_machine_product_selection_policy enable row level security;
alter table public.video_machine_product_selection_policy_binding enable row level security;
alter table public.video_machine_product_discovery_result enable row level security;
alter table public.video_machine_product_usage_evidence enable row level security;
