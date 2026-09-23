create table if not exists mercadolivre_pending_picks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  product_url text not null,
  current_price numeric,
  category_slug text,
  value_score numeric,
  status text not null default 'pending',
  meli_la_link text,
  created_at timestamptz not null default now(),
  linked_at timestamptz
);
alter table mercadolivre_pending_picks enable row level security;
comment on table mercadolivre_pending_picks is 'Fila de produtos achados pela varredura semanal de /ofertas da Mercado Livre (src/lib/mercadolivre/weeklyDiscovery.ts), esperando o Heber gerar o link de afiliado (nao ha API pra isso, so o gerador manual/em lote na conta dele -- ver CONTINUIDADE.md 2026-09-24). status: pending -> linked (Heber colou o meli.la de volta) -> ingested (virou deal_candidate) ou skipped. Sem policy, so service_role acessa.';
