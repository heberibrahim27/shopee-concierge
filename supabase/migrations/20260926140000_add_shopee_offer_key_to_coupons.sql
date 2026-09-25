-- Promoções oficiais da Shopee (shopeeOfferV2 da API de afiliados) entram
-- na mesma tabela `coupons` que Awin e Lomadee usam. Não são cupons com
-- código: são as campanhas/coleções da própria Shopee ("itens até 85%
-- OFF", "Frete grátis na categoria X") com link de afiliado já atribuído
-- à nossa conta -- exatamente o que a Cuponomia mostra como "Ver
-- Desconto" na Shopee (print do Heber, 2026-09-26). Chave própria porque
-- `promotion_id` (bigint) é da Awin e `lomadee_campaign_id` da Lomadee.
alter table coupons add column if not exists shopee_offer_key text unique;

comment on column coupons.shopee_offer_key is 'Identidade estável de uma promoção da Shopee vinda de shopeeOfferV2 (offerType + collectionId/categoryId). Null pra cupons Awin/Lomadee.';
