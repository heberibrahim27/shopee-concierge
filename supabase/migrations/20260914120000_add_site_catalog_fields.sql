-- Descontos Chegando — catálogo público do site
-- Adiciona aos "products" já existentes (Growth OS) os campos necessários
-- pro site público, e cria uma view que já entrega o produto + snapshot
-- mais recente numa linha só (pra o site nunca precisar de N+1 queries
-- nem fazer join no client). Decidido em ARQUITETURA-SITE.md (2026-09-14):
-- nunca gerar slug pra resultado efêmero de busca — site_published só deve
-- virar true por decisão humana/pipeline de aprovação, nunca automático
-- pra qualquer resultado que passe pela API.
--
-- NÃO APLICADA AINDA no Supabase (babamanager-pro) — só o arquivo
-- versionado. Ver CONTINUIDADE.md antes de rodar via MCP/CLI, porque esse
-- projeto é compartilhado com o BancaZAP (ainda que logicamente isolado).

alter table public.products
  add column if not exists slug text unique,
  add column if not exists platform text not null default 'shopee',
  add column if not exists category_slug text,
  add column if not exists site_published boolean not null default false,
  add column if not exists highlight_reason text;

comment on column public.products.slug is 'Slug público e imutável (/produto/<slug>). Nunca muda mesmo se product_name mudar na Shopee — ver src/lib/site/slug.ts.';
comment on column public.products.platform is 'Canal de compra: "shopee" por enquanto (único suportado). Outras plataformas entram como novo valor aqui, não como tabela separada — decisão de simplicidade enquanto só existe uma.';
comment on column public.products.category_slug is 'Categoria do site (lista fixa em src/lib/site/categories.ts) — independente do campo `category` livre já usado pelo Growth OS internamente.';
comment on column public.products.site_published is 'true = aprovado pra aparecer no site público (Home/categoria/página própria). Nunca marcar true automaticamente pra resultado efêmero de busca de usuário — só pra catálogo que passou pelos cortes do Growth OS (deal_candidates.score >= 75) e foi revisado.';
comment on column public.products.highlight_reason is 'Frase curta do "porquê" da recomendação (ex: "Loja bem avaliada, muitas vendas, bom custo-benefício") — o valor agregado que evita a página cair em thin affiliate content aos olhos do Google.';

create index if not exists products_site_published_idx
  on public.products (site_published) where site_published;

create index if not exists products_category_slug_idx
  on public.products (category_slug) where site_published;

-- View: produto publicado + snapshot mais recente numa linha só.
-- O site consulta só isso, nunca products/offer_snapshots direto nem a
-- API da Shopee ao vivo (ver ARQUITETURA-SITE.md, seção 3).
create or replace view public.site_catalog as
select
  p.id,
  p.slug,
  p.product_name,
  p.category_slug,
  p.platform,
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
  s.captured_at as snapshot_captured_at
from public.products p
left join lateral (
  select *
  from public.offer_snapshots os
  where os.product_id = p.id
  order by os.captured_at desc
  limit 1
) s on true
where p.site_published = true;

comment on view public.site_catalog is 'Leitura pública do site: só produtos aprovados (site_published), já com o snapshot de preço/nota/venda mais recente. Sem policy própria — segue RLS das tabelas base (só service_role acessa).';
