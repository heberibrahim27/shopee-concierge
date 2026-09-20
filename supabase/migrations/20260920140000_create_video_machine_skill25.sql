-- Skill 25 (Segurança/Auditoria) — src/modules/video-machine/skills/25-seguranca-auditoria/SPEC.md.
--
-- ESCOPO DELIBERADAMENTE REDUZIDO (mesma disciplina das Skills 22/23/24):
-- o SPEC completo (2 rodadas, 20 FATAL_ERROR, 18 hashes canônicos, 40
-- testes) define SecurityIncident + lifecycle, SecurityCredentialCompromiseHandoff,
-- o SecurityGateRequest/Run completo, SecurityRateLimit* (o próprio
-- SPEC já marca isso como DEFERRED_V2_MECHANISM), e execução real de
-- retention/deletion. Nenhuma dessas peças tem consumidor real hoje.
--
-- Esta migration cobre o núcleo que já tem uso real e imediato: um
-- registro formal de SecurityFinding (turnando em dado de primeira
-- classe o que até 2026-09-20 só existia como prosa em
-- CONTINUIDADE.md), sua lifecycle/transition, e SecurityControlEvidence/
-- SecurityControlDecision (o mecanismo de gate fail-closed que resolve
-- literalmente o exemplo do próprio SPEC: "CRON_SECRET existe em algum
-- lugar" ≠ "controle VERIFIED em produção"). SecurityAuditEvent entra
-- como o log append-only genérico usado pelos dois.

create table if not exists public.video_machine_security_finding (
  security_finding_id uuid primary key default gen_random_uuid(),
  finding_key text not null unique, -- ex.: SEC-025-PRODUCT-GROUPS-ANON-RLS
  severity text not null check (severity in ('CRITICAL','HIGH','MEDIUM','LOW')),
  control_key text not null,
  affected_subject_refs jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  finding_hash text not null,
  detected_at timestamptz not null default now()
);
comment on table public.video_machine_security_finding is 'SecurityFinding (Skill25 SPEC.md) — imutável (identidade factual). findingKey segue o formato SEC-025-* já usado em CONTINUIDADE.md "Security findings rastreados", agora como dado de primeira classe consultável, não só prosa.';

create table if not exists public.video_machine_security_finding_lifecycle (
  security_finding_id uuid primary key references public.video_machine_security_finding (security_finding_id),
  status text not null check (status in ('OPEN','CONTAINED','REMEDIATING','RESOLVED','ACCEPTED_RISK')),
  version int not null default 1,
  updated_at timestamptz not null default now()
);
comment on table public.video_machine_security_finding_lifecycle is 'SecurityFindingLifecycle (Skill25 SPEC.md) — mutável, CAS obrigatório via version.';

create table if not exists public.video_machine_security_finding_transition (
  security_finding_transition_id uuid primary key default gen_random_uuid(),
  security_finding_id uuid not null references public.video_machine_security_finding (security_finding_id),
  finding_hash text not null,
  from_status text,
  to_status text not null,
  reason text not null check (reason in ('FINDING_CREATED','IMMEDIATE_CONTAINMENT_APPLIED','REMEDIATION_STARTED','CONTROL_VERIFIED_FIXED','RISK_FORMALLY_ACCEPTED','RISK_ACCEPTANCE_REVOKED')),
  evidence_refs jsonb not null default '[]'::jsonb,
  version_before int,
  version_after int not null,
  transition_hash text not null,
  transitioned_at timestamptz not null default now()
);
comment on table public.video_machine_security_finding_transition is 'SecurityFindingTransition (Skill25 SPEC.md) — append-only, auditável.';

create table if not exists public.video_machine_security_control_evidence (
  security_control_evidence_id uuid primary key default gen_random_uuid(),
  control_key text not null, -- ex.: ingress.cron.authentication, data.rls
  environment text not null check (environment in ('DEVELOPMENT','STAGING','PRODUCTION')),
  status text not null check (status in ('VERIFIED','UNVERIFIED','FAILED','NOT_CONFIGURED','NOT_APPLICABLE')),
  evidence_basis text not null check (evidence_basis in ('PRODUCTION_TEST','CONFIGURATION_INSPECTION','REPOSITORY_INSPECTION','MANUAL_VERIFICATION')),
  evidence_refs jsonb not null default '[]'::jsonb,
  evidence_hash text not null,
  observed_at timestamptz not null default now(),
  valid_until timestamptz
);
comment on table public.video_machine_security_control_evidence is 'SecurityControlEvidence (Skill25 SPEC.md) — resolve literalmente o exemplo do próprio SPEC: CRON_SECRET existir em algum lugar não é VERIFIED em produção sem evidência real observada.';

create table if not exists public.video_machine_security_control_decision (
  security_control_decision_id uuid primary key default gen_random_uuid(),
  tenant_id text,
  control_key text not null,
  evidence_hash text,
  decision text not null check (decision in ('ALLOW','DENY')),
  reason text not null check (reason in ('CONTROL_VERIFIED','CONTROL_NOT_CONFIGURED','CONTROL_UNVERIFIED','CONTROL_FAILED','POLICY_VIOLATION')),
  decision_hash text not null,
  decided_at timestamptz not null default now()
);
comment on table public.video_machine_security_control_decision is 'SecurityControlDecision (Skill25 SPEC.md) — append-only. REQUIRED+FAIL_CLOSED com status != VERIFIED sempre DENY, nunca "warning + continua".';

create table if not exists public.video_machine_security_audit_event (
  security_audit_event_id uuid primary key default gen_random_uuid(),
  tenant_id text,
  actor jsonb,
  event_key text not null,
  event_type text not null,
  security_domain text not null,
  subject_refs jsonb not null default '[]'::jsonb,
  outcome text not null check (outcome in ('ALLOWED','DENIED','BLOCKED','OBSERVED')),
  reason_codes jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  correlation_refs jsonb not null default '{}'::jsonb,
  event_hash text not null,
  occurred_at timestamptz not null default now()
);
comment on table public.video_machine_security_audit_event is 'SecurityAuditEvent (Skill25 SPEC.md) — append-only, distinto de AuditEvent operacional de cada Skill. Nunca segredo/payload bruto/conteúdo de mensagem.';

alter table public.video_machine_security_finding enable row level security;
alter table public.video_machine_security_finding_lifecycle enable row level security;
alter table public.video_machine_security_finding_transition enable row level security;
alter table public.video_machine_security_control_evidence enable row level security;
alter table public.video_machine_security_control_decision enable row level security;
alter table public.video_machine_security_audit_event enable row level security;
