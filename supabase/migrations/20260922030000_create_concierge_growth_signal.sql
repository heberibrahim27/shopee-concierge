create table if not exists concierge_growth_signal (
  id uuid primary key default gen_random_uuid(),
  chat_id_hash text not null,
  category_slug text,
  item_id text,
  product_name text,
  price_min numeric,
  match_type text,
  search_terms text[],
  created_at timestamptz not null default now()
);
create index if not exists concierge_growth_signal_item_id_idx on concierge_growth_signal (item_id);
create index if not exists concierge_growth_signal_created_at_idx on concierge_growth_signal (created_at);
alter table concierge_growth_signal enable row level security;
comment on table concierge_growth_signal is 'Sinal de demanda real do Concierge (WhatsApp): 1 linha por busca concluida com candidato encontrado. Anonimizado por padrao (chat_id_hash, nunca o telefone cru) - pedido do Heber 2026-09-22, "Motor 4" do debate sobre crescimento de seguidores: o Concierge vira sensor de demanda pra Maquina de Videos priorizar o que pessoas de verdade estao procurando. So a Claude (service_role) acessa.';
