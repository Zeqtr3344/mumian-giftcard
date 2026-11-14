-- Record which link a buyer came from (e.g. utm_campaign=christmas in the Christmas email), to count campaign sales.
alter table orders add column if not exists utm_source text;
alter table orders add column if not exists utm_campaign text;
create index if not exists orders_utm_campaign_idx on orders (utm_campaign) where utm_campaign is not null;
