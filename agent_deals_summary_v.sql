CREATE OR REPLACE VIEW public.agent_deals_summary_v AS
 SELECT agent_deals_v.agent_full_name,
    count(*) AS total_deals,
    count(*) FILTER (WHERE (agent_deals_v.deal_category = 'SALE'::text)) AS sale_deals,
    count(*) FILTER (WHERE (agent_deals_v.deal_category = 'RENTAL'::text)) AS rental_deals,
    count(*) FILTER (WHERE (agent_deals_v.representation_code = 'LISTING_SALE'::text)) AS listing_sale_deals,
    count(*) FILTER (WHERE (agent_deals_v.representation_code = 'BUYER_REP'::text)) AS buyer_rep_deals,
    count(*) FILTER (WHERE (agent_deals_v.representation_code = 'LISTING_RENT'::text)) AS listing_rent_deals,
    count(*) FILTER (WHERE (agent_deals_v.representation_code = 'RENTER_REP'::text)) AS renter_rep_deals,
    sum(agent_deals_v.price_usd) FILTER (WHERE (agent_deals_v.deal_category = 'SALE'::text)) AS total_sales_volume_usd,
    sum(agent_deals_v.price_usd) FILTER (WHERE (agent_deals_v.deal_category = 'RENTAL'::text)) AS total_rental_volume_usd,
    sum(COALESCE(agent_deals_v.agent_fee_usd, (0)::numeric)) AS total_agent_fee_usd,
    sum(COALESCE(agent_deals_v.company_fee_usd, (0)::numeric)) AS total_company_fee_usd,
    sum(COALESCE(agent_deals_v.gross_commission_usd, (0)::numeric)) AS total_gross_commission_usd,
    round(avg(agent_deals_v.commission_rate_percent), 3) AS avg_commission_rate_pct,
    round(avg(agent_deals_v.split_percent), 3) AS avg_split_pct,
    max(agent_deals_v.contract_closed_raw) AS last_closed_date_raw
   FROM agent_deals_v
  GROUP BY agent_deals_v.agent_full_name;
