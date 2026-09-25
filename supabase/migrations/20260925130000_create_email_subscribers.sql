-- Fase 1 do plano de receita (ver memoria project_business_plan_artifact):
-- captura de e-mail propria, canal que nao depende de cota de rede
-- social. Envio real ainda nao conectado (decisao tecnica: Resend, ver
-- memoria project_site_monetization_beyond_affiliate) -- essa tabela so
-- coleta por enquanto.
create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source_page text,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  created_at timestamptz not null default now()
);

alter table email_subscribers enable row level security;

comment on table email_subscribers is 'Fase 1 do plano de receita: captura de e-mail propria, canal que nao depende de cota de rede social. Envio real ainda nao conectado (decisao: Resend, ver memoria project_site_monetization_beyond_affiliate).';
