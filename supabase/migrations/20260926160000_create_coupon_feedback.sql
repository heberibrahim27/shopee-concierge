-- "Funcionou / não funcionou" no card de cupom (2026-09-26). Receber um
-- cupom da rede não prova que ele funciona pra todo mundo; este é o único
-- sinal real de uso que temos sem estar no checkout da loja. Alimenta o
-- selo honesto do card ("X pessoas confirmaram") só quando houver volume,
-- e o admin pra pausar cupom com muita falha.
create table if not exists coupon_feedback (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  worked boolean not null,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists coupon_feedback_coupon_idx on coupon_feedback (coupon_id, worked);
create index if not exists coupon_feedback_ip_created_idx on coupon_feedback (ip_hash, created_at);

alter table coupon_feedback enable row level security;

comment on table coupon_feedback is 'Voto "funcionou / não funcionou" de visitante em um cupom, depois de revelar o código. Só o hash do IP, nunca o IP cru.';
