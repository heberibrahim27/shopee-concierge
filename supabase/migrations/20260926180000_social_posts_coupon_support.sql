-- Suporte a post de cupom no grupo do WhatsApp (2026-09-25, Heber: "envio
-- de cupons no grupo, podemos??"). `social_posts.deal_candidate_id` era
-- obrigatório -- cupom não tem deal_candidate (vive só em `coupons`), fica
-- nulo pra esse tipo de post. `coupon_id` fica nulo pro post normal de
-- produto. A checagem "exatamente um dos dois preenchido" fica na
-- aplicação (mesmo padrão do resto do schema, sem CHECK constraint aqui).
alter table social_posts alter column deal_candidate_id drop not null;
alter table social_posts add column if not exists coupon_id uuid references public.coupons(id) on delete cascade;

create index if not exists social_posts_coupon_idx on social_posts (coupon_id, post_type, status);

comment on column social_posts.coupon_id is 'Preenchido só quando post_type é de cupom (ex. whatsapp-coupon) -- deal_candidate_id fica nulo nesse caso.';
