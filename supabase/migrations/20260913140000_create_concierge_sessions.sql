-- Sessão de conversa do Shopee Concierge, persistida (13/09/2026).
--
-- Substitui o Map em memória que existia em session.ts: aquele Map não
-- sobrevive entre instâncias serverless diferentes da Vercel, então uma
-- resposta um pouco mais lenta (ou uma segunda mensagem caindo numa
-- instância que nunca viu a primeira) fazia a conversa "resetar" do nada
-- — pedido explícito do Ibrahim pra guardar o contexto por um tempo antes
-- de expirar.
--
-- NÃO é um histórico: é UMA linha por chat_id, sempre sobrescrita
-- (upsert) — o tamanho da tabela é o número de conversas ativas, nunca
-- cresce por mensagem trocada. Uma sessão "expira" (é tratada como nova)
-- quando updated_at passa de 30 minutos, decidido em código (mesma regra
-- que já existia no Map em memória), não por um job de limpeza aqui.
--
-- Aplicada originalmente via MCP do Supabase em 13/09/2026, direto no
-- projeto babamanager-pro (id czocwdlygdslyuoixmhh) — mesmo padrão da
-- migration anterior do Growth OS.

create table if not exists public.concierge_sessions (
  chat_id text primary key,
  status text not null default 'idle'
    check (status in ('idle', 'awaiting_photo', 'awaiting_clarification', 'processing')),
  observation jsonb,
  pending_question text,
  image_url text,
  updated_at timestamptz not null default now()
);

comment on table public.concierge_sessions is 'Estado da conversa do Shopee Concierge por chat_id — 1 linha por conversa (upsert), expira por tempo em código (30 min), não é log de mensagens.';

create index if not exists concierge_sessions_updated_at_idx
  on public.concierge_sessions (updated_at);

alter table public.concierge_sessions enable row level security;
-- Sem policies: só a service_role key (backend) acessa — mesmo padrão das
-- outras tabelas deste projeto.
