-- Descontos Chegando — Growth OS
-- Schema inicial (Etapa 0/1): apenas o necessário para rastrear produtos,
-- snapshots de oferta, candidatos a "deal" e os links de afiliado gerados.
-- Demais entidades do plano diretor (publications, concierge_requests,
-- events, conversions, validated_commissions, experiments,
-- learning_insights, reinvestment_ledger, platform_registry,
-- approval_requests) entram em migrations futuras, conforme a Etapa que as
-- exigir — não criamos tabela especulativa sem uso imediato.
--
-- Aplicada originalmente via MCP do Supabase em 12/09/2026, direto no
-- projeto babamanager-pro (id czocwdlygdslyuoixmhh). Este arquivo existe
-- pra que qualquer outro ambiente (ex: um projeto Supabase novo) consiga
-- reproduzir exatamente o mesmo schema — pendência apontada na revisão do
-- Codex (13/09/2026): o código dependia de 5 tabelas sem nenhuma migration
-- versionada no repositório.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shopee_item_id text not null unique,
  shop_id text,
  shop_name text,
  product_name text not null,
  category text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is 'Catálogo de produtos Shopee já vistos ao menos uma vez pelo pipeline. Identidade estável do produto, nunca preço/estoque (isso é offer_snapshots).';

create table if not exists public.offer_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  captured_at timestamptz not null default now(),
  price_min numeric(12,2),
  price_max numeric(12,2),
  price_discount_rate numeric(6,2),
  commission_rate numeric(8,4),
  commission numeric(12,2),
  sales integer,
  rating_star numeric(3,2),
  image_url text,
  product_link text,
  offer_link text,
  period_start_time timestamptz,
  period_end_time timestamptz,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.offer_snapshots is 'Uma "foto" no tempo do preço/comissão/venda de um produto, vinda direto do productOfferV2. Histórico imutável — nunca dá update, só insert.';

create index if not exists offer_snapshots_product_id_captured_at_idx
  on public.offer_snapshots (product_id, captured_at desc);

create table if not exists public.deal_candidates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  offer_snapshot_id uuid not null references public.offer_snapshots(id) on delete cascade,
  status text not null default 'discovered'
    check (status in (
      'discovered', 'collecting_history', 'eligible', 'verified',
      'link_created', 'content_ready', 'scheduled', 'published',
      'rejected', 'expired', 'price_changed', 'out_of_stock', 'failed'
    )),
  score numeric(6,3),
  score_breakdown jsonb,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deal_candidates is 'Estado do pipeline (state machine) por candidato a oferta, conforme Etapa 0/1 do plano diretor.';

create index if not exists deal_candidates_status_idx on public.deal_candidates (status);

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  deal_candidate_id uuid not null references public.deal_candidates(id) on delete cascade,
  origin_url text not null,
  sub_ids text[] not null default '{}',
  short_link text not null,
  long_link text not null,
  created_at timestamptz not null default now()
);

comment on table public.affiliate_links is 'Links curtos de afiliado gerados via generateShortLink, com o subId de 5 posições (canal/destino/campanha/conteudo/distribuicao) guardado em sub_ids.';

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  summary jsonb,
  created_at timestamptz not null default now()
);

comment on table public.agent_runs is 'Trilha de auditoria leve de cada execução dos agentes do Growth OS (o que rodou, quando, resultado resumido).';

alter table public.products enable row level security;
alter table public.offer_snapshots enable row level security;
alter table public.deal_candidates enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.agent_runs enable row level security;
-- Sem policies: só a service_role key (usada só no backend, nunca no
-- cliente) acessa essas tabelas — mesmo padrão das tabelas já existentes
-- neste projeto (ligas, push_subs).
