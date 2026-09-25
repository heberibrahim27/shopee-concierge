-- Alerta de queda de preço por WhatsApp (2026-09-26).
--
-- Recurso número um de retorno recorrente num comparador (Promotech faz
-- sem cadastro; Zoom exige login porque avisa por e-mail). Aqui: a pessoa
-- deixa o WhatsApp e um preço-alvo na página do produto; o cron diário
-- (/api/cron/price-alerts, depois dos crons de coleta) compara o menor
-- preço atual do produto -- em qualquer loja do mesmo grupo -- com o alvo
-- e avisa pela Z-API que já roda o grupo e o concierge. Custo zero além
-- do que já existe (a Z-API é cobrada por instância, não por mensagem).
--
-- Cada alerta dispara UMA vez (status 'sent') -- nunca vira spam diário.
create table if not exists price_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_slug text not null,
  phone text not null,
  target_price numeric(12,2) not null check (target_price > 0),
  price_at_creation numeric(12,2),
  status text not null default 'active' check (status in ('active', 'sent', 'cancelled')),
  source_page text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  notified_price numeric(12,2),
  cancel_reason text,
  -- hash do IP de quem criou (nunca o IP cru): limite de criação por hora
  -- por IP, pra ninguém usar o formulário pra disparar boas-vindas em
  -- massa pra números alheios.
  ip_hash text
);

-- Um alerta ativo por (produto, telefone): criar de novo só atualiza o alvo.
create unique index if not exists price_alerts_active_product_phone_idx
  on price_alerts (product_id, phone) where status = 'active';

create index if not exists price_alerts_status_idx on price_alerts (status) where status = 'active';
create index if not exists price_alerts_phone_idx on price_alerts (phone);
create index if not exists price_alerts_ip_hash_created_idx on price_alerts (ip_hash, created_at);

alter table price_alerts enable row level security;

comment on table price_alerts is 'Alerta de queda de preço por WhatsApp: telefone + preço-alvo por produto; o cron diário avisa uma vez (status sent) quando o menor preço do grupo do produto fica igual ou abaixo do alvo.';
