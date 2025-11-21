-- sql/apply_all.sql
-- Compatibility shim: accept round(double precision, integer) by casting to numeric
CREATE OR REPLACE FUNCTION public.round(x double precision, s integer)
  RETURNS numeric
  LANGUAGE SQL IMMUTABLE
AS $$
  SELECT ROUND(CAST(x AS numeric), s);
$$;

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='splits' AND column_name='sale_split' AND is_nullable='NO') THEN
    ALTER TABLE splits ALTER COLUMN sale_split DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='splits' AND column_name='rental_split' AND is_nullable='NO') THEN
    ALTER TABLE splits ALTER COLUMN rental_split DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE deal_details
  ADD COLUMN IF NOT EXISTS deal_commission_rate_pct numeric(7,3),
  ADD COLUMN IF NOT EXISTS deal_split_percent       numeric(6,3);

ALTER TABLE splits
  ADD COLUMN IF NOT EXISTS sale_split_pct   numeric(6,3),
  ADD COLUMN IF NOT EXISTS rental_split_pct numeric(6,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_deal_comm_rate_0_100') THEN
    ALTER TABLE deal_details
      ADD CONSTRAINT chk_deal_comm_rate_0_100
      CHECK (deal_commission_rate_pct IS NULL OR (deal_commission_rate_pct BETWEEN 0 AND 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_deal_split_pct_0_100') THEN
    ALTER TABLE deal_details
      ADD CONSTRAINT chk_deal_split_pct_0_100
      CHECK (deal_split_percent IS NULL OR (deal_split_percent BETWEEN 0 AND 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_splits_sale_pct_0_100') THEN
    ALTER TABLE splits
      ADD CONSTRAINT chk_splits_sale_pct_0_100
      CHECK (sale_split_pct IS NULL OR (sale_split_pct BETWEEN 0 AND 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_splits_rental_pct_0_100') THEN
    ALTER TABLE splits
      ADD CONSTRAINT chk_splits_rental_pct_0_100
      CHECK (rental_split_pct IS NULL OR (rental_split_pct BETWEEN 0 AND 100));
  END IF;
END $$;

ALTER TABLE deals ADD COLUMN IF NOT EXISTS representation text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_deals_representation') THEN
    ALTER TABLE deals ADD CONSTRAINT chk_deals_representation
    CHECK (representation IN ('LISTING_SALE','BUYER_REP','LISTING_RENT','RENTER_REP'));
  END IF;
END $$;

DROP VIEW IF EXISTS agent_deals_summary_v;
DROP VIEW IF EXISTS agent_deals_v;

-- Numeric-safe agent_deals_v (uses numeric casts and ROUND in a consistent way)
CREATE VIEW agent_deals_v AS
WITH base AS (
  SELECT
    a.full_name  AS agent_full_name,
    a.first_name AS agent_first_name,
    a.last_name  AS agent_last_name,
    a.license_no AS agent_license,
    CASE WHEN d.type IN ('RENT','RENTAL') THEN 'RENTAL' ELSE 'SALE' END AS deal_category,
    d.representation AS representation_code,
    d.address AS property_address,
    d.price   AS price_usd,
    d.contract_signed AS contract_signed_raw,
    dd.contract_closed             AS contract_closed_raw,
    dd.deal_commission_rate_pct    AS deal_rate_pct,
    dd.agent_commission_usd        AS agent_commission_usd,
    dd.deal_split_percent          AS deal_split_pct,
    dd.split                       AS split_override_bps,
    s.year as split_year,
    s.sale_split_pct, s.rental_split_pct,
    s.sale_split,     s.rental_split,
    a.sale_split   AS fallback_sale_split_bps,
    a.rental_split AS fallback_rental_split_bps,
    c.gross, c.company_fee, c.agent_fee, COALESCE(c.paid,false) AS commission_paid
  FROM deals d
  JOIN agents a
    ON a.full_name = d.agent_full_name
  LEFT JOIN deal_details dd
    ON dd.address = d.address
   AND dd.agent_full_name = d.agent_full_name
   AND dd.contract_signed = d.contract_signed
  LEFT JOIN splits s
    ON s.agent_full_name = d.agent_full_name
   AND s.year = EXTRACT(YEAR FROM d.contract_signed)
  LEFT JOIN commissions c
    ON c.address = d.address
   AND c.agent_full_name = d.agent_full_name
   AND c.contract_signed = d.contract_signed
),
calc AS (
  SELECT
    b.*,
    COALESCE(
      b.deal_split_pct::numeric,
      (b.split_override_bps::numeric / 100::numeric),
      CASE WHEN b.deal_category='RENTAL' THEN b.rental_split_pct::numeric ELSE b.sale_split_pct::numeric END,
      CASE WHEN b.deal_category='RENTAL' THEN (b.rental_split::numeric / 100::numeric) ELSE (b.sale_split::numeric / 100::numeric) END,
      CASE WHEN b.deal_category='RENTAL' THEN (b_
