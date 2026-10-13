-- Tokens OAuth do Pinterest (app 1612260). Linha unica (id = 1): o access
-- token renova sozinho via refresh_token, entao nao cabe em variavel de
-- ambiente. Acesso so por service_role (RLS ligada, sem policy).
create table if not exists pinterest_auth (
  id integer primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

alter table pinterest_auth enable row level security;

comment on table pinterest_auth is 'Token OAuth do Pinterest (linha unica). Ver src/lib/pinterest/auth.ts.';
