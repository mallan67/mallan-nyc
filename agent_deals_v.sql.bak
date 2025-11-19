CREATE OR REPLACE VIEW public.agent_deals_v AS
 WITH base AS (
         SELECT a.email AS agent_email,
            COALESCE(a.full_name, ((a.first_name || ' '::text) || a.last_name)) AS agent_full_name,
            a.first_name AS agent_first_name,
            a.last_name AS agent_last_name,
            a.license_no AS agent_license,
                CASE
                    WHEN (d.type = ANY (ARRAY['RENT'::text, 'RENTAL'::text])) THEN 'RENTAL'::text
                    ELSE 'SALE'::text
                END AS deal_category,
            d.representation AS representation_code,
            d.address AS property_address,
            d.price AS price_usd,
            d.contract_signed AS contract_signed_raw,
            dd.contract_closed AS contract_closed_raw,
            dd.deal_commission_rate_pct AS deal_rate_pct,
            dd.agent_commission_usd,
            dd.deal_split_percent AS deal_split_pct,
            dd.split AS split_override_bps,
            s.year AS split_year,
            s.sale_split_pct,
            s.rental_split_pct,
            s.sale_split,
            s.rental_split,
            a.sale_split AS fallback_sale_split_bps,
            a.rental_split AS fallback_rental_split_bps,
            c.gross,
            c.company_fee,
            c.agent_fee,
            COALESCE(c.paid, false) AS commission_paid
           FROM ((((deals d
             JOIN agents a ON ((a.email = d.agent_email)))
             LEFT JOIN deal_details dd ON (((dd.address = d.address) AND (dd.agent_email = d.agent_email) AND (dd.contract_signed = d.contract_signed))))
             LEFT JOIN splits s ON (((s.agent_email = d.agent_email) AND ((s.year)::numeric = EXTRACT(year FROM d.contract_signed)))))
             LEFT JOIN commissions c ON (((c.address = d.address) AND (c.agent_email = d.agent_email) AND (c.contract_signed = d.contract_signed))))
        ), calc AS (
         SELECT b.agent_email,
            b.agent_full_name,
            b.agent_first_name,
            b.agent_last_name,
            b.agent_license,
            b.deal_category,
            b.representation_code,
            b.property_address,
            b.price_usd,
            b.contract_signed_raw,
            b.contract_closed_raw,
            b.deal_rate_pct,
            b.agent_commission_usd,
            b.deal_split_pct,
            b.split_override_bps,
            b.split_year,
            b.sale_split_pct,
            b.rental_split_pct,
            b.sale_split,
            b.rental_split,
            b.fallback_sale_split_bps,
            b.fallback_rental_split_bps,
            b.gross,
            b.company_fee,
            b.agent_fee,
            b.commission_paid,
            COALESCE((b.deal_split_pct)::numeric, ((b.split_override_bps)::numeric / (100)::numeric),
                CASE
                    WHEN (b.deal_category = 'RENTAL'::text) THEN (b.rental_split_pct)::numeric
                    ELSE (b.sale_split_pct)::numeric
                END,
                CASE
                    WHEN (b.deal_category = 'RENTAL'::text) THEN ((b.rental_split)::numeric / (100)::numeric)
                    ELSE ((b.sale_split)::numeric / (100)::numeric)
                END,
                CASE
                    WHEN (b.deal_category = 'RENTAL'::text) THEN ((b.fallback_rental_split_bps)::numeric / (100)::numeric)
                    ELSE ((b.fallback_sale_split_bps)::numeric / (100)::numeric)
                END) AS split_percent_raw,
            (b.deal_rate_pct)::numeric AS commission_rate_input_pct,
                CASE
                    WHEN ((b.gross IS NOT NULL) AND (b.price_usd IS NOT NULL) AND (b.price_usd <> 0)) THEN round((((b.gross)::numeric / (b.price_usd)::numeric) * (100)::numeric), 3)
                    ELSE NULL::numeric
                END AS commission_rate_from_gross_pct
           FROM base b
        )
 SELECT calc.agent_full_name,
    calc.agent_first_name,
    calc.agent_last_name,
    calc.agent_license,
    calc.deal_category,
    calc.representation_code,
        CASE calc.representation_code
            WHEN 'LISTING_SALE'::text THEN 'Sale Exclusive'::text
            WHEN 'BUYER_REP'::text THEN 'Buyer Representation'::text
            WHEN 'LISTING_RENT'::text THEN 'Rental Exclusive'::text
            WHEN 'RENTER_REP'::text THEN 'Renter Representation'::text
            ELSE
            CASE
                WHEN (calc.deal_category = 'RENTAL'::text) THEN 'Rental (Unspecified)'::text
                ELSE 'Sale (Default)'::text
            END
        END AS representation_label,
    calc.property_address,
    calc.price_usd,
    round(COALESCE(calc.commission_rate_input_pct, calc.commission_rate_from_gross_pct), 3) AS commission_rate_percent,
    to_char(COALESCE(calc.commission_rate_input_pct, calc.commission_rate_from_gross_pct), 'FM999990.###'::text) AS commission_rate_percent_str,
    round(calc.split_percent_raw, 3) AS split_percent,
    to_char(calc.split_percent_raw, 'FM999990.###'::text) AS split_percent_str,
    COALESCE((calc.gross)::numeric,
        CASE
            WHEN ((calc.commission_rate_input_pct IS NOT NULL) AND (calc.price_usd IS NOT NULL)) THEN round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)
            ELSE NULL::numeric
        END) AS gross_commission_usd,
    COALESCE((calc.agent_fee)::numeric, (calc.agent_commission_usd)::numeric,
        CASE
            WHEN ((COALESCE((calc.gross)::numeric,
            CASE
                WHEN ((calc.commission_rate_input_pct IS NOT NULL) AND (calc.price_usd IS NOT NULL)) THEN round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)
                ELSE NULL::numeric
            END) IS NOT NULL) AND (calc.split_percent_raw IS NOT NULL)) THEN round((COALESCE((calc.gross)::numeric, round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)) * (calc.split_percent_raw / (100)::numeric)), 2)
            ELSE NULL::numeric
        END) AS agent_fee_usd,
    COALESCE((calc.company_fee)::numeric,
        CASE
            WHEN ((COALESCE((calc.gross)::numeric,
            CASE
                WHEN ((calc.commission_rate_input_pct IS NOT NULL) AND (calc.price_usd IS NOT NULL)) THEN round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)
                ELSE NULL::numeric
            END) IS NOT NULL) AND (COALESCE((calc.agent_fee)::numeric, (calc.agent_commission_usd)::numeric,
            CASE
                WHEN (calc.split_percent_raw IS NOT NULL) THEN round((COALESCE((calc.gross)::numeric, round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)) * (calc.split_percent_raw / (100)::numeric)), 2)
                ELSE NULL::numeric
            END) IS NOT NULL)) THEN (COALESCE((calc.gross)::numeric, round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)) - COALESCE((calc.agent_fee)::numeric, (calc.agent_commission_usd)::numeric, round((COALESCE((calc.gross)::numeric, round((((calc.price_usd)::numeric * calc.commission_rate_input_pct) / (100)::numeric), 2)) * (calc.split_percent_raw / (100)::numeric)), 2)))
            ELSE NULL::numeric
        END) AS company_fee_usd,
    calc.commission_paid,
    COALESCE(calc.contract_closed_raw, calc.contract_signed_raw) AS contract_closed_raw,
    to_char(calc.contract_signed_raw, 'MM/DD/YYYY'::text) AS contract_signed,
    to_char(COALESCE(calc.contract_closed_raw, calc.contract_signed_raw), 'MM/DD/YYYY'::text) AS contract_closed
   FROM calc;
