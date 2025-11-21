-- ============================================
-- Minimal CRM schema for your API endpoints
-- ============================================

-- 1) Agents table
CREATE TABLE IF NOT EXISTS agents (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  full_name  TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email TEXT UNIQUE,
  license_no TEXT,
  license_expiry DATE,
  sale_split NUMERIC(6,3),   -- store as percent or basis points as you prefer
  rental_split NUMERIC(6,3),
  role TEXT CHECK (role IN ('ADMIN','AGENT')) DEFAULT 'AGENT'
);

-- 2) Deals base table
CREATE TABLE IF NOT EXISTS deals (
  id BIGSERIAL PRIMARY KEY,
  agent_full_name TEXT NOT NULL,
  representation_code TEXT CHECK (representation_code IN ('LISTING_SALE','BUYER_REP','LISTING_RENT','RENTER_REP')),
  property_address TEXT,
  price_usd NUMERIC(14,2),
  commission_rate_percent NUMERIC(6,3),
  split_percent NUMERIC(6,3),
  agent_fee_usd NUMERIC(14,2),
  company_fee_usd NUMERIC(14,2),
  gross_commission_usd NUMERIC(14,2),
  contract_signed DATE,
  contract_closed DATE
);

-- 3) View the /api/crm/deals endpoint uses
CREATE OR REPLACE VIEW agent_deals_v AS
SELECT
  agent_full_name,
  representation_code,
  CASE representation_code
    WHEN 'LISTING_SALE' THEN 'Sale Exclusive'
    WHEN 'BUYER_REP'    THEN 'Buyer Representation'
    WHEN 'LISTING_RENT' THEN 'Rental Exclusive'
    WHEN 'RENTER_REP'   THEN 'Renter Representation'
    ELSE NULL
  END AS representation_label,
  property_address,
  price_usd,
  TO_CHAR(commission_rate_percent, 'FM999999990.000') AS commission_rate_percent,
  TO_CHAR(split_percent, 'FM999999990.000')          AS split_percent,
  TO_CHAR(agent_fee_usd, 'FM9999999990')             AS agent_fee_usd,
  TO_CHAR(company_fee_usd, 'FM9999999990')           AS company_fee_usd,
  TO_CHAR(gross_commission_usd, 'FM9999999990')      AS gross_commission_usd,
  TO_CHAR(contract_signed, 'MM/DD/YYYY')             AS contract_signed,
  TO_CHAR(contract_closed, 'MM/DD/YYYY')             AS contract_closed
FROM deals;

-- 4) Summary view the /api/agents/summary endpoint expects
CREATE OR REPLACE VIEW agent_deals_summary_v AS
SELECT
  agent_full_name,
  COUNT(*)::INT AS deal_count,
  SUM(gross_commission_usd)::NUMERIC(14,2) AS gross_commission_usd,
  SUM(agent_fee_usd)::NUMERIC(14,2)        AS agent_fee_usd,
  SUM(company_fee_usd)::NUMERIC(14,2)      AS company_fee_usd
FROM deals
GROUP BY agent_full_name
ORDER BY agent_full_name;

-- 5) Seed a minimal agent if missing
INSERT INTO agents (first_name, last_name, email, license_no, license_expiry, sale_split, rental_split, role)
SELECT 'Maya','Allan','mayad67@gmail.com','10401234567','2025-06-30',80.000,80.000,'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email='mayad67@gmail.com');

-- 6) Seed sample deals if table is empty (matches your working preview output)
INSERT INTO deals (
  agent_full_name, representation_code, property_address, price_usd,
  commission_rate_percent, split_percent, agent_fee_usd, company_fee_usd, gross_commission_usd,
  contract_signed, contract_closed
)
SELECT * FROM (VALUES
  ('Maya Allan','LISTING_SALE','123 Park Ave, NYC',1200000, 1.750, 75.500, 28800,  7200,  36000, DATE '2025-06-01', DATE '2025-07-15'),
  ('Maya Allan','RENTER_REP',  '456 Lex Ave, NYC',  850000,15.000, 80.000, 20400,  5100,  25500, DATE '2025-05-15', DATE '2025-05-15')
) AS t(agent_full_name,representation_code,property_address,price_usd,commission_rate_percent,split_percent,agent_fee_usd,company_fee_usd,gross_commission_usd,contract_signed,contract_closed)
WHERE NOT EXISTS (SELECT 1 FROM deals);
