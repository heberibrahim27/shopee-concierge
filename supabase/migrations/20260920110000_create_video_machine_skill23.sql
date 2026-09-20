-- Skill 23 (Gestor de Créditos/Quotas) — src/modules/video-machine/skills/23-gestor-de-creditos-quotas/SPEC.md.
--
-- ESCOPO DELIBERADAMENTE REDUZIDO (walking skeleton, mesma disciplina
-- de StageSubjectBinding/EXPANDABLE nas Skills 01/09): o SPEC completo
-- define 16 hashes canônicos, QuotaExecutionClaim, a state machine
-- inteira de reservation (CLAIMED/HELD_EXTERNAL_UNKNOWN/
-- SETTLEMENT_PENDING/PARTIALLY_SETTLED/SETTLED), settlement decisions,
-- usage/billing evidence e ledger de CONSUMED — 40 testes críticos ao
-- todo. Nenhuma dessas peças tem consumidor real hoje: Skills 11/12/14/
-- 15/20 (as únicas que chamariam QuotaGuard/Skill23) ainda não existem
-- em código. Implementar a máquina de settlement/evidence às cegas,
-- sem nenhum chamador real pra validar contra, repetiria o erro que
-- "kernel repair" já corrigiu duas vezes nesta especificação.
--
-- Esta migration cobre só o caminho REQUEST AUTHORIZATION → RESERVE
-- (o prerequisito que Skills 07/08 já citam como "QuotaGuard"), com
-- atomicidade real via função Postgres (pg_advisory_xact_lock) — não
-- fake. QuotaExecutionClaim, effect evidence, usage/billing evidence,
-- settlement e o ledger CONSUMED ficam NOT_IMPLEMENTED, documentados
-- aqui como tal, até a Skill 11 (ou 12/14/15) existir de verdade pra
-- ser o primeiro consumidor real.

create table if not exists public.video_machine_quota_policy (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  policy_version text not null,
  tenant_id text not null,
  authorization_class text not null check (authorization_class in ('EXECUTION_SPEND','PROCESSING_OPERATION','PROVIDER_OPERATION')),
  operation_count_limit int,
  operation_count_window text check (operation_count_window in ('DAY','MONTH')),
  monetary_control jsonb not null, -- {mode:'HARD_LIMIT', currency, hardLimitAmount, window} | {mode:'NO_LIMIT_BY_POLICY'} | {mode:'NOT_APPLICABLE'}
  authorization_validity jsonb not null, -- {mode:'NO_EXPIRY'} | {mode:'TTL', ttlSeconds}
  created_at timestamptz not null default now(),
  constraint video_machine_quota_policy_key_version_uniq unique (tenant_id, policy_key, policy_version),
  constraint video_machine_quota_policy_op_count_shape check ((operation_count_limit is null) = (operation_count_window is null))
);
comment on table public.video_machine_quota_policy is 'QuotaPolicy (Skill23 SPEC.md) — imutável por (policy_key, policy_version). V1: limite de OPERATION_COUNT + controle monetário (HARD_LIMIT exige exposure upper-bound no request, senão QUOTA_UNKNOWN_COST_BLOCKED_BY_POLICY). CREDIT/COMPUTE_UNIT/PROCESSING_SECOND/STORAGE_BYTE/EGRESS_BYTE ficam NOT_IMPLEMENTED nesta fase.';

create table if not exists public.video_machine_quota_policy_binding (
  tenant_id text not null,
  policy_key text not null,
  active_policy_id uuid not null references public.video_machine_quota_policy (policy_id),
  active_policy_version text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, policy_key)
);
comment on table public.video_machine_quota_policy_binding is 'QuotaPolicyBinding (Skill23 SPEC.md).';

create table if not exists public.video_machine_quota_authorization (
  authorization_id uuid primary key,
  authorization_request_id uuid not null default gen_random_uuid(),
  tenant_id text not null,
  authorization_class text not null,
  authorization_request_key text not null,
  request_hash text not null,
  operation_identity_hash text not null,
  decision text not null check (decision in ('AUTHORIZED','DENIED','EXPIRED')),
  denied_reasons jsonb,
  reservation_id uuid,
  valid_until timestamptz,
  authorization_hash text not null,
  created_at timestamptz not null default now(),
  constraint video_machine_quota_authorization_request_key_uniq unique (tenant_id, authorization_request_key)
);
comment on table public.video_machine_quota_authorization is 'QuotaAuthorization (Skill23 SPEC.md) — idempotência lógica por (tenant_id, authorization_request_key): mesma key+request_hash replay retorna a mesma decisão; mesma key+hash diferente = QUOTA_AUTHORIZATION_REQUEST_REPLAY_CONFLICT (validado em app, não em constraint SQL).';

create table if not exists public.video_machine_quota_reservation (
  reservation_id uuid primary key,
  authorization_id uuid not null references public.video_machine_quota_authorization (authorization_id),
  tenant_id text not null,
  reserved_resources jsonb not null, -- [{unit, amount}]
  status text not null check (status in ('HELD','RELEASED','CONSUMED')),
  reservation_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.video_machine_quota_reservation is 'QuotaReservation (Skill23 SPEC.md) — V1 usa só status HELD/RELEASED/CONSUMED (simplificação deliberada da lifecycle completa de 7 estados do SPEC — CLAIMED/HELD_EXTERNAL_UNKNOWN/SETTLEMENT_PENDING/PARTIALLY_SETTLED/SETTLED ficam NOT_IMPLEMENTED até existir QuotaExecutionClaim real).';

create table if not exists public.video_machine_quota_ledger_entry (
  ledger_entry_id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  authorization_id uuid not null references public.video_machine_quota_authorization (authorization_id),
  reservation_id uuid references public.video_machine_quota_reservation (reservation_id),
  resource_scope jsonb not null, -- {unit, authorizationClass, windowKey}
  bucket text not null check (bucket in ('RESERVED','CONSUMED')),
  movement text not null check (movement in ('INCREASE','DECREASE')),
  amount text not null, -- decimal string, nunca float
  reason text not null check (reason in ('AUTHORIZATION_RESERVATION','SETTLEMENT_RELEASE','SETTLEMENT_CONSUMPTION')),
  ledger_entry_hash text not null,
  created_at timestamptz not null default now()
);
comment on table public.video_machine_quota_ledger_entry is 'QuotaLedgerEntry (Skill23 SPEC.md) — append-only. V1 só usa bucket=RESERVED (increase na autorização, decrease na liberação); bucket=CONSUMED fica NOT_IMPLEMENTED até settlement real existir (sem consumidor hoje).';

alter table public.video_machine_quota_policy enable row level security;
alter table public.video_machine_quota_policy_binding enable row level security;
alter table public.video_machine_quota_authorization enable row level security;
alter table public.video_machine_quota_reservation enable row level security;
alter table public.video_machine_quota_ledger_entry enable row level security;

-- Função atômica de autorização: capacity check + reservation + ledger
-- numa única transação, com pg_advisory_xact_lock serializando
-- requests concorrentes do mesmo (tenant, authorizationClass) — cobre
-- literalmente o requisito "duas requests concorrentes com 1 unidade
-- restante produzem exatamente uma AUTHORIZED" do plano de testes.
create or replace function public.video_machine_quota_authorize(
  p_tenant_id text,
  p_authorization_class text,
  p_authorization_request_key text,
  p_request_hash text,
  p_operation_identity_hash text,
  p_requested_resources jsonb,
  p_operation_count_limit int,
  p_operation_count_window text,
  p_monetary_mode text,
  p_monetary_limit text,
  p_monetary_window text,
  p_valid_until timestamptz,
  p_authorization_id uuid,
  p_authorization_hash text
) returns jsonb
language plpgsql
as $$
declare
  v_existing record;
  v_op_window_key text;
  v_money_window_key text;
  v_reserved_op numeric;
  v_reserved_money numeric;
  v_reservation_id uuid;
  v_op_amount numeric;
  v_money_amount numeric;
  v_denied_reasons text[] := '{}';
begin
  select * into v_existing from public.video_machine_quota_authorization
    where tenant_id = p_tenant_id and authorization_request_key = p_authorization_request_key;
  if found then
    if v_existing.request_hash <> p_request_hash then
      return jsonb_build_object('conflict', true);
    end if;
    return jsonb_build_object(
      'conflict', false, 'replayed', true,
      'authorizationId', v_existing.authorization_id, 'decision', v_existing.decision,
      'reservationId', v_existing.reservation_id, 'authorizationHash', v_existing.authorization_hash,
      'deniedReasons', v_existing.denied_reasons, 'validUntil', v_existing.valid_until
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(p_tenant_id || ':' || p_authorization_class));

  select (r->>'amount')::numeric into v_op_amount from jsonb_array_elements(p_requested_resources) r where r->>'unit' = 'OPERATION_COUNT' limit 1;
  select (r->>'amount')::numeric into v_money_amount from jsonb_array_elements(p_requested_resources) r where r->>'unit' = 'MONEY' limit 1;

  if p_operation_count_limit is not null then
    v_op_window_key := case p_operation_count_window when 'DAY' then to_char(now(), 'YYYY-MM-DD') when 'MONTH' then to_char(now(), 'YYYY-MM') else 'ALL' end;
    select coalesce(sum(case when movement = 'INCREASE' then amount::numeric else -amount::numeric end), 0) into v_reserved_op
      from public.video_machine_quota_ledger_entry
      where tenant_id = p_tenant_id and bucket = 'RESERVED' and (resource_scope->>'unit') = 'OPERATION_COUNT'
        and (resource_scope->>'authorizationClass') = p_authorization_class and (resource_scope->>'windowKey') = v_op_window_key;
    if (v_reserved_op + coalesce(v_op_amount, 0)) > p_operation_count_limit then
      v_denied_reasons := array_append(v_denied_reasons, 'QUOTA_LIMIT_EXCEEDED:OPERATION_COUNT');
    end if;
  end if;

  if p_monetary_mode = 'HARD_LIMIT' then
    if v_money_amount is null then
      return jsonb_build_object('hardLimitExposureUnknown', true);
    end if;
    v_money_window_key := case p_monetary_window when 'DAY' then to_char(now(), 'YYYY-MM-DD') when 'MONTH' then to_char(now(), 'YYYY-MM') else 'ALL' end;
    select coalesce(sum(case when movement = 'INCREASE' then amount::numeric else -amount::numeric end), 0) into v_reserved_money
      from public.video_machine_quota_ledger_entry
      where tenant_id = p_tenant_id and bucket = 'RESERVED' and (resource_scope->>'unit') = 'MONEY'
        and (resource_scope->>'authorizationClass') = p_authorization_class and (resource_scope->>'windowKey') = v_money_window_key;
    if (v_reserved_money + v_money_amount) > p_monetary_limit::numeric then
      v_denied_reasons := array_append(v_denied_reasons, 'QUOTA_LIMIT_EXCEEDED:MONEY');
    end if;
  end if;

  if array_length(v_denied_reasons, 1) > 0 then
    insert into public.video_machine_quota_authorization(authorization_id, tenant_id, authorization_class, authorization_request_key, request_hash, operation_identity_hash, decision, denied_reasons, authorization_hash)
      values (p_authorization_id, p_tenant_id, p_authorization_class, p_authorization_request_key, p_request_hash, p_operation_identity_hash, 'DENIED', to_jsonb(v_denied_reasons), p_authorization_hash);
    return jsonb_build_object('conflict', false, 'replayed', false, 'authorizationId', p_authorization_id, 'decision', 'DENIED', 'deniedReasons', v_denied_reasons, 'authorizationHash', p_authorization_hash);
  end if;

  v_reservation_id := gen_random_uuid();
  insert into public.video_machine_quota_authorization(authorization_id, tenant_id, authorization_class, authorization_request_key, request_hash, operation_identity_hash, decision, reservation_id, valid_until, authorization_hash)
    values (p_authorization_id, p_tenant_id, p_authorization_class, p_authorization_request_key, p_request_hash, p_operation_identity_hash, 'AUTHORIZED', v_reservation_id, p_valid_until, p_authorization_hash);

  insert into public.video_machine_quota_reservation(reservation_id, authorization_id, tenant_id, reserved_resources, status, reservation_hash)
    values (v_reservation_id, p_authorization_id, p_tenant_id, p_requested_resources, 'HELD', p_authorization_hash);

  if v_op_amount is not null then
    insert into public.video_machine_quota_ledger_entry(tenant_id, authorization_id, reservation_id, resource_scope, bucket, movement, amount, reason, ledger_entry_hash)
      values (p_tenant_id, p_authorization_id, v_reservation_id, jsonb_build_object('unit', 'OPERATION_COUNT', 'authorizationClass', p_authorization_class, 'windowKey', v_op_window_key), 'RESERVED', 'INCREASE', v_op_amount::text, 'AUTHORIZATION_RESERVATION', p_authorization_hash || ':op');
  end if;
  if v_money_amount is not null then
    insert into public.video_machine_quota_ledger_entry(tenant_id, authorization_id, reservation_id, resource_scope, bucket, movement, amount, reason, ledger_entry_hash)
      values (p_tenant_id, p_authorization_id, v_reservation_id, jsonb_build_object('unit', 'MONEY', 'authorizationClass', p_authorization_class, 'windowKey', v_money_window_key), 'RESERVED', 'INCREASE', v_money_amount::text, 'AUTHORIZATION_RESERVATION', p_authorization_hash || ':money');
  end if;

  return jsonb_build_object('conflict', false, 'replayed', false, 'authorizationId', p_authorization_id, 'decision', 'AUTHORIZED', 'reservationId', v_reservation_id, 'authorizationHash', p_authorization_hash, 'validUntil', p_valid_until);
end;
$$;
comment on function public.video_machine_quota_authorize is 'Skill23 — autorização atômica (capacity check + Reservation + Authorization + ledger RESERVED increase numa única transação), serializada por pg_advisory_xact_lock(tenant, authorizationClass).';

create or replace function public.video_machine_quota_release_reservation(
  p_reservation_id uuid,
  p_reason text
) returns jsonb
language plpgsql
as $$
declare
  v_res record;
begin
  select * into v_res from public.video_machine_quota_reservation where reservation_id = p_reservation_id for update;
  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;
  if v_res.status <> 'HELD' then
    return jsonb_build_object('error', 'QUOTA_INVALID_STATE_TRANSITION');
  end if;

  update public.video_machine_quota_reservation set status = 'RELEASED', updated_at = now() where reservation_id = p_reservation_id;

  insert into public.video_machine_quota_ledger_entry(tenant_id, authorization_id, reservation_id, resource_scope, bucket, movement, amount, reason, ledger_entry_hash)
  select tenant_id, authorization_id, reservation_id, resource_scope, 'RESERVED', 'DECREASE', amount, 'SETTLEMENT_RELEASE', ledger_entry_hash || ':release:' || p_reason
  from public.video_machine_quota_ledger_entry
  where reservation_id = p_reservation_id and bucket = 'RESERVED' and movement = 'INCREASE';

  return jsonb_build_object('error', null, 'status', 'RELEASED');
end;
$$;
comment on function public.video_machine_quota_release_reservation is 'Skill23 — libera uma reservation HELD (cancelamento antes de claim, ou expiração sem claim), espelhando o resource_scope/windowKey originais na entrada DECREASE do ledger para não vazar capacidade de outra janela.';
