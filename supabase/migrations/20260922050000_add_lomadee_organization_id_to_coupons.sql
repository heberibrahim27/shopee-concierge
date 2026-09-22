alter table coupons alter column advertiser_id drop not null;
alter table coupons add column lomadee_organization_id text;
comment on column coupons.lomadee_organization_id is 'UUID da marca (organizationId) na Lomadee -- advertiser_id (integer) e so pra Awin.';
