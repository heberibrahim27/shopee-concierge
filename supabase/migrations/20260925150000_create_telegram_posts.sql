-- Canal Telegram (ver memoria project_telegram_channel_real_example):
-- distribuicao de ofertas sem o teto diario de publicacao que ja bateu
-- no Instagram (ver project_instagram_daily_publish_limit). Preparado
-- agora, ainda bloqueado esperando o Heber criar o bot via @BotFather e
-- mandar o token -- essa tabela so registra o que ja foi publicado no
-- canal pra evitar duplicata, mesmo padrao de social_posts.
create table if not exists telegram_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  message_id text,
  status text not null default 'posted' check (status in ('posted', 'failed')),
  error text,
  posted_at timestamptz not null default now()
);

create index if not exists telegram_posts_product_id_idx on telegram_posts(product_id);

alter table telegram_posts enable row level security;

comment on table telegram_posts is 'Registro de ofertas ja publicadas no canal do Telegram, pra dedupe -- mesmo padrao de social_posts (Instagram). Ver memoria project_telegram_channel_real_example.';
