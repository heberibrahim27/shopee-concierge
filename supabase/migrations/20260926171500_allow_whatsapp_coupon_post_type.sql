-- Achado real (2026-09-26, Heber: "o cupom que está mandando no grupo
-- só tem esse de ônibus") -- a constraint de social_posts.post_type
-- nunca foi atualizada quando publish-whatsapp-coupon/route.ts passou a
-- gravar 'whatsapp-coupon' (migration 20260926180000 só adicionou a
-- coluna coupon_id). Toda inserção falhava em silêncio (o código não
-- checava o erro do insert) -- a mensagem sempre saía certa no grupo,
-- mas o histórico de dedupe nunca era salvo, então o mesmo cupom
-- (DeÔnibus, o primeiro elegível da lista) ganhava a rotação pra
-- sempre, já que o "menos recente" comparava contra um histórico
-- eternamente vazio.
alter table public.social_posts drop constraint social_posts_post_type_check;
alter table public.social_posts add constraint social_posts_post_type_check
  check (post_type = any (array['feed', 'reel', 'story', 'whatsapp', 'whatsapp-coupon']));
