-- Canal Pinterest (app 1612260 "Desconto Chegando Publicador", API aprovada
-- em 2026-10-13). Registra o que ja virou Pin pra dedupe -- mesmo padrao de
-- telegram_posts / social_posts. Um produto = no maximo um Pin por board.
create table if not exists pinterest_pins (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  board_id text not null,
  pin_id text,
  status text not null default 'posted' check (status in ('posted', 'failed')),
  error text,
  posted_at timestamptz not null default now()
);

create index if not exists pinterest_pins_product_id_idx on pinterest_pins(product_id);

alter table pinterest_pins enable row level security;

comment on table pinterest_pins is 'Registro de Pins ja publicados no Pinterest, pra dedupe. Ver src/app/api/cron/publish-pinterest.';
