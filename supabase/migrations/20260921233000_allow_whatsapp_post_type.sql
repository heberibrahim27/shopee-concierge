-- Permite post_type='whatsapp' em social_posts — pedido do Heber
-- (2026-09-21): automação enviando ofertas pro grupo real do WhatsApp
-- "Descontos Chegando #GR42" (ver src/app/api/cron/publish-whatsapp-group).
-- Aditiva, sem impacto em linhas existentes (feed/reel/story continuam
-- válidos).
alter table social_posts drop constraint social_posts_post_type_check;
alter table social_posts add constraint social_posts_post_type_check check (post_type = any (array['feed', 'reel', 'story', 'whatsapp']));
