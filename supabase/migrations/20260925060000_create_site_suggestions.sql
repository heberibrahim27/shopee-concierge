-- Ideias/sugestoes enviadas por visitantes reais do site (widget flutuante
-- "Sugerir melhoria"). Pedido do Heber (2026-09-25): o unico trabalho dele
-- deve ser pensar e falar comigo -- ate a busca de melhorias precisa vir de
-- gente de fora funcionando sozinha, nao so da minha pesquisa/loop. Essa
-- tabela e a caixa de entrada; a triagem/implementacao acontece nos ciclos
-- do /loop (ver memoria project_site_monetization_beyond_affiliate).
create table if not exists site_suggestions (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  contact text,
  page_path text,
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'implementado', 'descartado')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table site_suggestions enable row level security;

comment on table site_suggestions is 'Sugestoes de melhoria enviadas por visitantes via widget publico no site -- entrada do loop de melhoria continua.';
