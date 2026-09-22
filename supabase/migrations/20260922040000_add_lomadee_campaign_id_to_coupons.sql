alter table coupons add column lomadee_campaign_id text unique;
comment on column coupons.lomadee_campaign_id is 'ID (UUID) da campanha na Lomadee (GenericCoupon/PersonalCoupon/Offer) -- promotion_id (bigint) e so pra Awin, Lomadee usa UUID entao precisa de coluna propria.';
