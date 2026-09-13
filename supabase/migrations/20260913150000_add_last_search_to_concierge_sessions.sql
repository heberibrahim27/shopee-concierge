-- Guarda o resultado da última busca do concierge por chat_id, pra
-- permitir refinamento real ("mais barata"/"melhor qualidade"/"mais
-- parecida") sem precisar buscar de novo na Shopee — reusa os candidatos
-- já rankeados na busca anterior, só troca a ordem/critério de escolha.
--
-- Corrige bug real (13/09/2026): o botão de fechamento do bot oferece
-- "mais barata"/"melhor qualidade"/"mais parecida com sua foto", mas
-- nenhum código tratava essa resposta — ela caía na busca de texto puro e
-- virava uma pesquisa literal por "mais parecida" na Shopee (retornando
-- lixo, ex: um livro com "parecidas" no título).
--
-- Aplicada originalmente via MCP do Supabase em 13/09/2026, direto no
-- projeto babamanager-pro (id czocwdlygdslyuoixmhh).
alter table public.concierge_sessions
  add column if not exists last_search jsonb;

comment on column public.concierge_sessions.last_search is 'Candidatos rankeados + itens já mostrados na última busca desse chat — usado só pra refinamento ("mais barata" etc.), nunca pra decidir o corte/score de negócio.';
