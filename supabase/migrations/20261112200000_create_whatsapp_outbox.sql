-- Fila de envio do WhatsApp. O site (crons do grupo, cupom, alerta de preco)
-- NAO fala mais com um servico pago: coloca a mensagem aqui, e um programa
-- local (tools/whatsapp-sender, biblioteca livre Baileys) le a fila e envia
-- pelo WhatsApp conectado. Substitui a Z-API (assinatura encerrada; ultimo
-- post do grupo em 2026-10-22).
create table if not exists whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  kind text not null check (kind in ('text', 'image')),
  text text,
  image_url text,
  caption text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'expired')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists whatsapp_outbox_status_created_idx on whatsapp_outbox (status, created_at);

alter table whatsapp_outbox enable row level security;

comment on table whatsapp_outbox is 'Fila de mensagens de WhatsApp a enviar. Consumida por tools/whatsapp-sender. So service_role acessa.';
