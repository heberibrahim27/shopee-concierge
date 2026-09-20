-- Skill 22 (Gestor de Conta/Tenant) — src/modules/video-machine/skills/22-gestor-de-conta-tenant/SPEC.md.
-- Auditoria do próprio SPEC.md: multi-tenant é hoje puramente
-- aspiracional (tenantId é valor único hardcoded, auth é senha
-- compartilhada). O SPEC pede explicitamente para NÃO criar uma tabela
-- "tenants" completa (users/billing/membership) nesta fase — mas
-- TenantActorBinding e TenantAuthorizationDecision são estado real
-- (versão/revogação/audit trail), então ganham tabela de verdade, no
-- mesmo padrão video_machine_* já usado em todas as outras Skills.
--
-- video_machine_tenant_config é o "adapter LEGACY_SINGLE_TENANT_CONFIGURATION"
-- formalizado como linha de configuração persistida (mesmo padrão de
-- Policy já usado nas Skills 04-10) — não uma tabela SaaS de contas.

create table if not exists public.video_machine_tenant_config (
  tenant_id text primary key,
  tenant_key text not null,
  status text not null check (status in ('ACTIVE','SUSPENDED','DISABLED')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.video_machine_tenant_config is 'TenantIdentity (Skill22 SPEC.md) — backing do adapter LEGACY_SINGLE_TENANT_CONFIGURATION. Hoje exatamente 1 linha real; formaliza status pra permitir SUSPENDED/DISABLED de verdade sem reescrever Skills 01-21 depois.';

create table if not exists public.video_machine_tenant_actor_binding (
  tenant_id text not null references public.video_machine_tenant_config (tenant_id),
  actor_id text not null,
  actor_kind text not null check (actor_kind in ('LEGACY_SHARED_ADMIN_SESSION','USER','SERVICE')),
  actor_assurance text not null check (actor_assurance in ('SHARED_CREDENTIAL','NAMED_AUTHENTICATED_USER','TRUSTED_INTERNAL_SERVICE')),
  capabilities jsonb not null,
  status text not null check (status in ('ACTIVE','SUSPENDED','REVOKED')),
  binding_version int not null,
  binding_hash text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, actor_id, binding_version)
);
comment on table public.video_machine_tenant_actor_binding is 'TenantActorBinding (Skill22 SPEC.md) — append-only por (tenant_id, actor_id, binding_version): revogar é inserir uma nova versão REVOKED, nunca UPDATE — contextos históricos com versão antiga continuam auditáveis. "Versão ativa" = MAX(binding_version) daquele (tenant_id, actor_id).';

create table if not exists public.video_machine_tenant_authorization_decision (
  decision_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  actor_id text not null,
  actor_identity_hash text not null,
  actor_binding_hash text,
  capability text not null,
  authorization_scope jsonb not null,
  decision text not null check (decision in ('AUTHORIZED','DENIED')),
  reason text not null check (reason in ('CAPABILITY_GRANTED','TENANT_SUSPENDED','TENANT_DISABLED','ACTOR_BINDING_INACTIVE','CAPABILITY_NOT_GRANTED','IDENTITY_ASSURANCE_INSUFFICIENT')),
  decision_hash text not null,
  decided_at timestamptz not null default now()
);
comment on table public.video_machine_tenant_authorization_decision is 'TenantAuthorizationDecision (Skill22 SPEC.md) — append-only, audit trail de toda decisão de autorização. Nunca reaproveitada entre EXACT_ARTIFACT distintos, mesmo mesmo tenant/ator/capability.';

alter table public.video_machine_tenant_config enable row level security;
alter table public.video_machine_tenant_actor_binding enable row level security;
alter table public.video_machine_tenant_authorization_decision enable row level security;
