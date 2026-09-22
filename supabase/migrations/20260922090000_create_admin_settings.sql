create table if not exists admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table admin_settings enable row level security;
comment on table admin_settings is 'Configuracoes do painel admin (ex: hash da senha) -- sem policy, so service_role acessa. key=password_hash guarda o mesmo hash SHA-256+salt que ja era usado no cookie de sessao (ver src/lib/admin/password.ts); ausente = usa ADMIN_PASSWORD do env como fallback pra nunca travar o acesso.';
