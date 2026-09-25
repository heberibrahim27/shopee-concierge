-- Busca de texto de verdade no catálogo do site (2026-09-26).
--
-- Antes: `/busca` fazia `ilike '%termo%'` em `products.product_name` — só
-- acha se as palavras aparecem NA MESMA ORDEM e sem erro de digitação
-- ("fone bluetooth" não acha "Fone de Ouvido Bluetooth"; "smartwach" não
-- acha nada). Agora: full text em português (stemming + ordem livre) com
-- trigram (pg_trgm) como rede de segurança pra erro de digitação. Tudo
-- nativo do Postgres, sem serviço externo, custo zero além do que já
-- existe.
--
-- A função devolve só `id` + rank; o app busca as linhas completas na
-- view `site_catalog` depois. De propósito: assim a função NÃO depende do
-- rowtype da view (que já mudou uma vez pra ganhar group_id) e não é
-- derrubada por um `drop view ... cascade` futuro.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() é STABLE, e expressão de índice exige IMMUTABLE. O wrapper
-- imutável é o padrão aceito pra isso (o dicionário de acentos não muda
-- em produção). Minúsculas + sem acento: "Fone de Ouvido" ≈ "fone de ouvido".
create or replace function public.dc_normalize_text(t text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(extensions.unaccent(coalesce(t, '')));
$$;

comment on function public.dc_normalize_text(text) is
  'Minúsculas sem acento, imutável de propósito pra poder entrar em índice (busca do site).';

-- Índices só sobre produto publicado (é só isso que o site consulta).
create index if not exists products_name_trgm_idx
  on public.products
  using gin (public.dc_normalize_text(product_name) extensions.gin_trgm_ops)
  where site_published;

create index if not exists products_name_fts_idx
  on public.products
  using gin (to_tsvector('portuguese', public.dc_normalize_text(product_name)))
  where site_published;

-- Ranking (testado ao vivo em 2026-09-26 contra o catálogo real):
--  1. full text com normalização por tamanho do título (flag 1 = divide
--     pelo log do tamanho) — sem isso, "ssd nvme 1tb" trazia um PC Gamer
--     de 104 caracteres em primeiro, porque o título longo cita os três
--     termos, na frente dos SSDs de verdade;
--  2. bônus forte quando o título COMEÇA com a primeira palavra da busca
--     ("ssd ...", "fone ...", "tenis ...") — em título de e-commerce o
--     tipo do produto vem primeiro, e é isso que a pessoa digita primeiro;
--  3. trigram (word_similarity, operador `<%`) só como rede de segurança
--     pra erro de digitação / palavra que o stemmer não conhece — o termo
--     inteiro parecido com ALGUMA parte do título. Quem casa no full text
--     ganha +0.2 fixo, pra casamento de verdade ficar SEMPRE acima de
--     casamento só por semelhança ("tv 50 polegadas" trazia uma impressora
--     de 24 polegadas em primeiro só pelo trigram).
create or replace function public.search_site_catalog(p_term text, p_limit integer default 48)
returns table (id uuid, rank real)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select
      public.dc_normalize_text(p_term) as norm,
      split_part(btrim(public.dc_normalize_text(p_term)), ' ', 1) as first_word,
      websearch_to_tsquery('portuguese', public.dc_normalize_text(p_term)) as tsq
  ),
  candidates as (
    select
      p.id,
      p.updated_at,
      public.dc_normalize_text(p.product_name) as norm_name,
      to_tsvector('portuguese', public.dc_normalize_text(p.product_name)) @@ q.tsq as fts_hit
    from public.products p, q
    where p.site_published
      and (
        to_tsvector('portuguese', public.dc_normalize_text(p.product_name)) @@ q.tsq
        or q.norm <% public.dc_normalize_text(p.product_name)
      )
  )
  select
    c.id,
    (
      case when c.fts_hit then 0.2 + ts_rank_cd(to_tsvector('portuguese', c.norm_name), q.tsq, 1) else 0 end
      + word_similarity(q.norm, c.norm_name) * 0.1
      + case when q.first_word <> '' and c.norm_name like q.first_word || '%' then 0.5 else 0 end
    )::real as rank
  from candidates c, q
  order by rank desc, c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 48), 200));
$$;

comment on function public.search_site_catalog(text, integer) is
  'Busca do site: full text em português + trigram pra erro de digitação. Devolve ids ranqueados; o app carrega as linhas na view site_catalog.';
