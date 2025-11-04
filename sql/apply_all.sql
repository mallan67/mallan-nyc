-- Compatibility shim: accept round(double precision, integer) by casting to numeric
CREATE OR REPLACE FUNCTION public.round(x double precision, s integer)
  RETURNS numeric
  LANGUAGE SQL IMMUTABLE
AS $$
  SELECT ROUND(CAST($1 AS numeric), $2);
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

CREATE VIEW agent_deals_v AS
WITH base AS (
  SELECT
    a.email AS agent_email,
    COALESCE(a.full_name, (a.first_name || ' ' || a.last_name)) AS agent_full_name,
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
    ON a.email = d.agent_email
  LEFT JOIN deal_details dd
    ON dd.address = d.address
   AND dd.agent_email = d.agent_email
   AND dd.contract_signed = d.contract_signed
  LEFT JOIN splits s
    ON s.agent_email = d.agent_email
   AND s.year = EXTRACT(YEAR FROM d.contract_signed)
  LEFT JOIN commissions c
    ON c.address = d.address
   AND c.agent_email = d.agent_email
   AND c.contract_signed = d.contract_signed
),
calc AS (
  SELECT
    b.*,
    COALESCE(
      b.deal_split_pct,
      (b.split_override_bps::numeric / 100.0),
      CASE WHEN b.deal_category='RENTAL' THEN b.rental_split_pct ELSE b.sale_split_pct END,
      CASE WHEN b.deal_category='RENTAL' THEN (b.rental_split::numeric / 100.0) ELSE (b.sale_split::numeric / 100.0) END,
      CASE WHEN b.deal_category='RENTAL' THEN (b.fallback_rental_split_bps::numeric / 100.0) ELSE (b.fallback_sale_split_bps::numeric / 100.0) END
    ) AS split_percent_raw,
    b.deal_rate_pct::numeric(7,3) AS commission_rate_input_pct,
    CASE WHEN b.gross IS NOT NULL AND b.price_usd IS NOT NULL AND b.price_usd <> 0
         THEN ROUND(CAST(CAST((((b.gross::numeric / b.price_usd) * 100.0)::numeric) AS numeric) AS numeric), 3)
         ELSE NULL END AS commission_rate_from_gross_pct
  FROM base b
)
SELECT
  agent_full_name, agent_first_name, agent_last_name, agent_license,
  deal_category, representation_code,
  CASE representation_code
    WHEN 'LISTING_SALE' THEN 'Sale Exclusive'
    WHEN 'BUYER_REP'    THEN 'Buyer Representation'
    WHEN 'LISTING_RENT' THEN 'Rental Exclusive'
    WHEN 'RENTER_REP'   THEN 'Renter Representation'
    ELSE CASE WHEN deal_category='RENTAL' THEN 'Rental (Unspecified)' ELSE 'Sale (Default)' END
  END AS representation_label,
  property_address, price_usd,
  ROUND(COALESCE(commission_rate_input_pct, commission_rate_from_gross_pct), 3)                AS commission_rate_percent,
  TO_CHAR(COALESCE(commission_rate_input_pct, commission_rate_from_gross_pct), 'FM999990.###') AS commission_rate_percent_str,
  ROUND(CAST(CAST(((split_percent_raw)::numeric) AS numeric) AS numeric), 3)            AS split_percent,
  TO_CHAR(split_percent_raw, 'FM999990.###') AS split_percent_str,
  COALESCE(
    gross,
    CASE WHEN commission_rate_input_pct IS NOT NULL AND price_usd IS NOT NULL
         THEN ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2)
         ELSE NULL END
  ) AS gross_commission_usd,
  COALESCE(
    agent_fee,
    agent_commission_usd,
    CASE WHEN COALESCE(gross,
                       CASE WHEN commission_rate_input_pct IS NOT NULL AND price_usd IS NOT NULL
                            THEN ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2)
                            ELSE NULL END) IS NOT NULL
              AND split_percent_raw IS NOT NULL
       THEN ROUND(
         COALESCE(gross, ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2))
         * (split_percent_raw / 100.0), 2)
       ELSE NULL END
  ) AS agent_fee_usd,
  COALESCE(
    company_fee,
    CASE WHEN COALESCE(gross,
                       CASE WHEN commission_rate_input_pct IS NOT NULL AND price_usd IS NOT NULL
                            THEN ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2)
                            ELSE NULL END) IS NOT NULL
              AND COALESCE(agent_fee, agent_commission_usd,
                           CASE WHEN split_percent_raw IS NOT NULL
                                THEN ROUND(COALESCE(gross, ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2)) * (split_percent_raw / 100.0), 2)
                                ELSE NULL END) IS NOT NULL
       THEN COALESCE(gross, ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2))
            - COALESCE(agent_fee, agent_commission_usd,
                       ROUND(COALESCE(gross, ROUND(CAST(CAST(((price_usd::numeric * commission_rate_input_pct / 100.0)::numeric) AS numeric) AS numeric), 2)) * (split_percent_raw / 100.0), 2))
       ELSE NULL END
  ) AS company_fee_usd,
  commission_paid,
  COALESCE(contract_closed_raw, contract_signed_raw) AS contract_closed_raw,
  TO_CHAR(contract_signed_raw, 'MM/DD/YYYY')         AS contract_signed,
  TO_CHAR(COALESCE(contract_closed_raw, contract_signed_raw), 'MM/DD/YYYY') AS contract_closed
FROM calc;

CREATE VIEW agent_deals_summary_v AS
SELECT
  agent_full_name,
  COUNT(*)                                           AS total_deals,
  COUNT(*) FILTER (WHERE deal_category='SALE')       AS sale_deals,
  COUNT(*) FILTER (WHERE deal_category='RENTAL')     AS rental_deals,
  COUNT(*) FILTER (WHERE representation_code='LISTING_SALE')  AS listing_sale_deals,
  COUNT(*) FILTER (WHERE representation_code='BUYER_REP')     AS buyer_rep_deals,
  COUNT(*) FILTER (WHERE representation_code='LISTING_RENT')  AS listing_rent_deals,
  COUNT(*) FILTER (WHERE representation_code='RENTER_REP')    AS renter_rep_deals,
  SUM(price_usd) FILTER (WHERE deal_category='SALE')   AS total_sales_volume_usd,
  SUM(price_usd) FILTER (WHERE deal_category='RENTAL') AS total_rental_volume_usd,
  SUM(COALESCE(agent_fee_usd,   0)) AS total_agent_fee_usd,
  SUM(COALESCE(company_fee_usd, 0)) AS total_company_fee_usd,
  SUM(COALESCE(gross_commission_usd, 0)) AS total_gross_commission_usd,
  ROUND(CAST(CAST(((AVG(commission_rate_percent))::numeric) AS numeric) AS numeric), 3) AS avg_commission_rate_pct,
  ROUND(CAST(CAST(((AVG(split_percent))::numeric) AS numeric) AS numeric), 3)           AS avg_split_pct,
  MAX(contract_closed_raw)               AS last_closed_date_raw
FROM agent_deals_v
GROUP BY agent_full_name;

COMMIT;


-- Replace agent_deals_v with numeric-safe arithmetic so ROUND(...) always receives numeric.
CREATE OR REPLACE VIEW agent_deals_v AS
WITH base AS (
  SELECT
    a.email AS agent_email,
    COALESCE(a.full_name, (a.first_name || ' ' || a.last_name)) AS agent_full_name,
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
    ON a.email = d.agent_email
  LEFT JOIN deal_details dd
    ON dd.address = d.address
   AND dd.agent_email = d.agent_email
   AND dd.contract_signed = d.contract_signed
  LEFT JOIN splits s
    ON s.agent_email = d.agent_email
   AND s.year = EXTRACT(YEAR FROM d.contract_signed)
  LEFT JOIN commissions c
    ON c.address = d.address
   AND c.agent_email = d.agent_email
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
      CASE WHEN b.deal_category='RENTAL' THEN (b.fallback_rental_split_bps::numeric / 100::numeric) ELSE (b.fallback_sale_split_bps::numeric / 100::numeric) END
    ) AS split_percent_raw,
    b.deal_rate_pct::numeric AS commission_rate_input_pct,
    CASE WHEN b.gross IS NOT NULL AND b.price_usd IS NOT NULL AND b.price_usd <> 0
         THEN ROUND(CAST((b.gross::numeric / b.price_usd::numeric * 100::numeric)::numeric AS numeric), 3)
         ELSE NULL::numeric END AS commission_rate_from_gross_pct
  FROM base b
)
SELECT
  agent_full_name, agent_first_name, agent_last_name, agent_license,
  deal_category, representation_code,
  CASE representation_code
    WHEN 'LISTING_SALE' THEN 'Sale Exclusive'
    WHEN 'BUYER_REP'    THEN 'Buyer Representation'
    WHEN 'LISTING_RENT' THEN 'Rental Exclusive'
    WHEN 'RENTER_REP'   THEN 'Renter Representation'
    ELSE CASE WHEN deal_category='RENTAL' THEN 'Rental (Unspecified)' ELSE 'Sale (Default)' END
  END AS representation_label,
  property_address, price_usd,
  ROUND((COALESCE(commission_rate_input_pct::numeric, commission_rate_from_gross_pct))::numeric, 3) AS commission_rate_percent,
  TO_CHAR((COALESCE(commission_rate_input_pct::numeric, commission_rate_from_gross_pct))::numeric, 'FM999990.###') AS commission_rate_percent_str,
  ROUND(CAST(split_percent_raw::numeric AS numeric), 3)            AS split_percent,
  TO_CHAR(split_percent_raw::numeric, 'FM999990.###') AS split_percent_str,
  COALESCE(
    gross::numeric,
    CASE WHEN commission_rate_input_pct IS NOT NULL AND price_usd IS NOT NULL
         THEN ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2)
         ELSE NULL::numeric END
  ) AS gross_commission_usd,
  COALESCE(
    agent_fee::numeric,
    agent_commission_usd::numeric,
    CASE WHEN COALESCE(gross::numeric,
                      CASE WHEN commission_rate_input_pct IS NOT NULL AND price_usd IS NOT NULL
                           THEN ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2)
                           ELSE NULL::numeric END) IS NOT NULL
         AND split_percent_raw IS NOT NULL
    THEN ROUND(
      (COALESCE(gross::numeric,
                ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2))
       * (split_percent_raw::numeric / 100::numeric))::numeric, 2)
    ELSE NULL::numeric END
  ) AS agent_fee_usd,
  COALESCE(
    company_fee::numeric,
    CASE WHEN COALESCE(gross::numeric,
                      CASE WHEN commission_rate_input_pct IS NOT NULL AND price_usd IS NOT NULL
                           THEN ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2)
                           ELSE NULL::numeric END) IS NOT NULL
         AND COALESCE(agent_fee::numeric, agent_commission_usd::numeric,
                      CASE WHEN split_percent_raw IS NOT NULL
                           THEN ROUND((COALESCE(gross::numeric,
                                     ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2))
                                    * (split_percent_raw::numeric / 100::numeric))::numeric, 2)
                           ELSE NULL::numeric END) IS NOT NULL
    THEN COALESCE(gross::numeric,
                  ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2))
         - COALESCE(agent_fee::numeric, agent_commission_usd::numeric,
                    ROUND((COALESCE(gross::numeric,
                                   ROUND(CAST((price_usd::numeric * commission_rate_input_pct::numeric / 100::numeric)::numeric AS numeric), 2))
                          * (split_percent_raw::numeric / 100::numeric))::numeric, 2))
    ELSE NULL::numeric END
  ) AS company_fee_usd,
  commission_paid,
  COALESCE(contract_closed_raw, contract_signed_raw) AS contract_closed_raw,
  TO_CHAR(contract_signed_raw, 'MM/DD/YYYY')         AS contract_signed,
  TO_CHAR(COALESCE(contract_closed_raw, contract_signed_raw), 'MM/DD/YYYY') AS contract_closed
FROM calc;

CREATE OR REPLACE VIEW agent_deals_summary_v AS
SELECT
  agent_full_name,
  COUNT(*)                                           AS total_deals,
  COUNT(*) FILTER (WHERE deal_category='SALE')       AS sale_deals,
  COUNT(*) FILTER (WHERE deal_category='RENTAL')     AS rental_deals,
  COUNT(*) FILTER (WHERE representation_code='LISTING_SALE')  AS listing_sale_deals,
  COUNT(*) FILTER (WHERE representation_code='BUYER_REP')     AS buyer_rep_deals,
  COUNT(*) FILTER (WHERE representation_code='LISTING_RENT')  AS listing_rent_deals,
  COUNT(*) FILTER (WHERE representation_code='RENTER_REP')    AS renter_rep_deals,
  SUM(price_usd) FILTER (WHERE deal_category='SALE')   AS total_sales_volume_usd,
  SUM(price_usd) FILTER (WHERE deal_category='RENTAL') AS total_rental_volume_usd,
  SUM(COALESCE(agent_fee_usd,   0)) AS total_agent_fee_usd,
  SUM(COALESCE(company_fee_usd, 0)) AS total_company_fee_usd,
  SUM(COALESCE(gross_commission_usd, 0)) AS total_gross_commission_usd,
  ROUND(CAST(AVG(commission_rate_percent)::numeric AS numeric), 3) AS avg_commission_rate_pct,
  ROUND(CAST(AVG(split_percent)::numeric AS numeric), 3)           AS avg_split_pct,
  MAX(contract_closed_raw)               AS last_closed_date_raw
FROM agent_deals_v
GROUP BY agent_full_name;


