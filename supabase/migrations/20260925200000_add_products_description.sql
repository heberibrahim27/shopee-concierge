-- Descontos Chegando — descrição real do produto (característica cadastrada
-- pelo vendedor, não texto nosso). Achado real 2026-09-25 (pedido do Heber,
-- "as características do produto cadastrado pelo vendedor... tudo no
-- padrão!"): o feed da Awin/Kabum tem um campo `description` rico e real
-- (specs completas, texto do próprio vendedor), diferente do que o
-- comentário antigo em catalog.ts assumia. Testado ao vivo: 0/8 produtos
-- de valor (>R$200) tinham descrição igual ao título — só itens muito
-- baratos (ex: cabo de R$9,90) têm descrição fraca/duplicada, exceção, não
-- regra. A API de afiliado da Shopee não tem esse campo — produtos Shopee
-- continuam sem essa seção, honestamente (nunca inventar o que a fonte não
-- tem).

alter table public.products
  add column if not exists description text;

comment on column public.products.description is 'Descrição/ficha técnica real do produto, como cadastrada pelo vendedor na fonte (hoje só Awin/Kabum tem esse campo — Shopee affiliate API não expõe descrição). Texto puro, entidades HTML já decodificadas e tags removidas no ingest — nunca renderizar como HTML.';

-- create or replace view exige manter a ordem exata das colunas já
-- existentes (Postgres não deixa renomear/reordenar via replace, só
-- adicionar no final) — reconstruída a partir da definição real via
-- pg_get_viewdef, não do arquivo antigo (que já estava desatualizado, sem
-- group_id).
create or replace view public.site_catalog as
select
  p.id,
  p.slug,
  p.product_name,
  p.category_slug,
  p.platform,
  p.group_id,
  p.highlight_reason,
  p.updated_at,
  s.image_url,
  s.price_min,
  s.price_max,
  s.price_discount_rate,
  s.rating_star,
  s.sales,
  s.offer_link,
  s.product_link,
  s.captured_at as snapshot_captured_at,
  p.description
from public.products p
left join lateral (
  select *
  from public.offer_snapshots os
  where os.product_id = p.id
  order by os.captured_at desc
  limit 1
) s on true
where p.site_published = true;
