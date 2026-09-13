-- Janela rolante simples de saúde da comparação visual do Concierge —
-- adicionada em 13/09/2026 por sugestão do debate técnico com o ChatGPT
-- sobre o bug da bermuda jeans aparecendo pra uma foto de bermuda tactel:
-- "no_match legítimo != erro técnico" — sem separar as duas coisas, um
-- período de instabilidade da comparação visual (rate limit da OpenAI,
-- chave expirada, mudança no formato de resposta) fica invisível, parece
-- só "a Shopee trazendo candidato ruim".
--
-- NÃO é log de mensagens: é 1 linha só (id sempre 1, upsert), reseta a
-- janela sozinha por tempo em código (ver visualHealth.ts) — não precisa
-- de job de limpeza. Só decide MODO SEGURO (pular tentativa de comparação
-- visual/escalonamento quando a taxa de falha recente está alta), nunca
-- decisão de negócio por request.
--
-- Aplicada via MCP do Supabase em 13/09/2026, direto no projeto
-- babamanager-pro (id czocwdlygdslyuoixmhh) — mesmo padrão das migrations
-- anteriores deste projeto.

create table if not exists public.concierge_visual_health (
  id smallint primary key default 1,
  window_start timestamptz not null default now(),
  attempts int not null default 0,
  failures int not null default 0,
  constraint concierge_visual_health_singleton check (id = 1)
);

comment on table public.concierge_visual_health is 'Janela rolante (1 linha só) de tentativas/falhas da comparação visual do concierge — usada só pra decidir modo seguro (circuit breaker) quando a comparação visual está sistemicamente degradada, nunca pra decisão de negócio por request.';

alter table public.concierge_visual_health enable row level security;
-- Sem policies: só a service_role key (backend) acessa — mesmo padrão das
-- outras tabelas deste projeto.

insert into public.concierge_visual_health (id) values (1)
  on conflict (id) do nothing;
