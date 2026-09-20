-- Skill 24 (Gestor de Integrações) — src/modules/video-machine/skills/24-gestor-de-integracoes/SPEC.md.
--
-- ESCOPO DELIBERADAMENTE REDUZIDO (mesma disciplina das Skills 22/23):
-- o SPEC completo (2 rodadas, 21 FATAL_ERROR, 14 hashes canônicos, 40
-- testes) define IntegrationCapabilityEvidence com dois eixos
-- (verification/restriction), a state machine completa de rotação de
-- credencial (STAGED/ACTIVE/SUPERSEDED/REVOKED/INVALID +
-- CredentialLifecycleTransition), health check requests/runs e
-- ProviderAccountIngressResolution. Nenhuma dessas peças tem
-- consumidor real hoje — zero código no repositório verifica
-- capability em runtime (confirmado pela própria auditoria do SPEC),
-- zero rotação de credencial jamais aconteceu, Skills 16/17
-- (as consumidoras reais do credential handle) ainda não existem em
-- código.
--
-- Esta migration cobre o núcleo real que o próprio SPEC identifica
-- como "APIs centrais que os 8 consumidores convergem":
-- IntegrationBinding + IntegrationCredentialHandleRef, resolvidos via
-- ENV_BACKED_CREDENTIAL_RESOLVER — literalmente o runtime inicial que
-- o SPEC já prescreve ("resolve o handle pros env vars atuais de hoje
-- — sem migration, sem tabela nova [de secret]"). Isso resolve de
-- verdade o placeholder de texto livre que a Skill 10
-- (video_machine_video_provider_profile.integration_binding_id/hash)
-- deixou registrado como dívida explícita.

create table if not exists public.video_machine_integration_binding (
  integration_binding_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  provider_key text not null,
  provider_resource_id text not null,
  resource_kind text not null check (resource_kind in ('ACCOUNT','PAGE','INSTANCE','APP','PROJECT','WORKSPACE','OTHER')),
  resource_isolation text not null check (resource_isolation in ('DEDICATED','SHARED_EXTERNAL_RESOURCE','UNKNOWN')),
  binding_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_integration_binding_tenant_provider_uniq unique (tenant_id, provider_key)
);
comment on table public.video_machine_integration_binding is 'IntegrationBinding (Skill24 SPEC.md) — imutável (identidade/configuração). V1: 1 binding por (tenant, providerKey), reflete a realidade real hoje (conta única hardcoded por provider, confirmado pela auditoria). lifecycle/health ficam em tabela mutável separada (patch da rodada 2 do SPEC).';

create table if not exists public.video_machine_integration_binding_runtime_state (
  integration_binding_id uuid primary key references public.video_machine_integration_binding (integration_binding_id),
  lifecycle_status text not null check (lifecycle_status in ('CONFIGURED','ACTIVE','SUSPENDED','DISABLED','REVOKED')),
  health_status text not null default 'UNKNOWN' check (health_status in ('HEALTHY','DEGRADED','UNAVAILABLE','UNKNOWN')),
  health_checked_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.video_machine_integration_binding_runtime_state is 'IntegrationBindingRuntimeState (Skill24 SPEC.md) — mutável, sem hash integral. health_status V1 é presence-check (mesmo padrão de src/app/api/health/route.ts), não ping de conectividade real do provider — IntegrationHealthCheckRequest/Run completos ficam NOT_IMPLEMENTED nesta fase.';

create table if not exists public.video_machine_credential_handle (
  credential_handle_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  integration_binding_id uuid not null references public.video_machine_integration_binding (integration_binding_id),
  env_var_name text not null, -- NUNCA exposto pelo TS público — só o resolver interno lê isto
  handle_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_credential_handle_binding_uniq unique (integration_binding_id)
);
comment on table public.video_machine_credential_handle is 'IntegrationCredentialHandleRef (Skill24 SPEC.md) — runtime ENV_BACKED_CREDENTIAL_RESOLVER, exatamente como o SPEC prescreve pro V1 ("resolve o handle pros env vars atuais de hoje — sem migration, sem tabela nova [de secret]"). env_var_name nunca sai desta tabela para nenhum contrato de domínio.';

create table if not exists public.video_machine_credential_revision (
  credential_revision_id uuid primary key default gen_random_uuid(),
  credential_handle_id uuid not null references public.video_machine_credential_handle (credential_handle_id),
  revision_key text not null default 'v1',
  status text not null check (status in ('ACTIVE','REVOKED')),
  created_at timestamptz not null default now(),
  constraint video_machine_credential_revision_handle_key_uniq unique (credential_handle_id, revision_key)
);
comment on table public.video_machine_credential_revision is 'CredentialRevisionRef (Skill24 SPEC.md) — V1: exatamente 1 revisão ACTIVE por handle, nenhuma rotação real acontece hoje (confirmado pela auditoria: "zero implementação real de revoke/rotate"). A state machine completa de 5 estados (STAGED/ACTIVE/SUPERSEDED/REVOKED/INVALID) fica NOT_IMPLEMENTED.';

create table if not exists public.video_machine_credential_resolution_record (
  credential_resolution_record_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  credential_handle_id uuid not null references public.video_machine_credential_handle (credential_handle_id),
  credential_revision_id uuid not null references public.video_machine_credential_revision (credential_revision_id),
  resolution_hash text not null,
  resolved_at timestamptz not null default now()
);
comment on table public.video_machine_credential_resolution_record is 'CredentialResolutionRecord (Skill24 SPEC.md) — audita QUE uma resolução aconteceu e QUAL revisão, nunca o valor do secret (que existe só em memória no boundary de resolução, nunca persistido/logado).';

alter table public.video_machine_integration_binding enable row level security;
alter table public.video_machine_integration_binding_runtime_state enable row level security;
alter table public.video_machine_credential_handle enable row level security;
alter table public.video_machine_credential_revision enable row level security;
alter table public.video_machine_credential_resolution_record enable row level security;
