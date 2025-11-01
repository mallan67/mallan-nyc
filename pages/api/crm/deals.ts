import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/db";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const rows = await q(`
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
        TO_CHAR(split_percent,           'FM999999990.000') AS split_percent,
        TO_CHAR(agent_fee_usd,           'FM9999999990')    AS agent_fee_usd,
        TO_CHAR(company_fee_usd,         'FM9999999990')    AS company_fee_usd,
        TO_CHAR(gross_commission_usd,    'FM9999999990')    AS gross_commission_usd,
        TO_CHAR(contract_signed, 'MM/DD/YYYY')              AS contract_signed,
        TO_CHAR(contract_closed, 'MM/DD/YYYY')              AS contract_closed
      FROM deals
      ORDER BY contract_signed NULLS LAST, agent_full_name
    `);
    res.status(200).json(rows);
  } catch (e:any) {
    res.status(200).json({ ok:false, reason:"deals query failed", error:String(e?.message ?? e) });
  }
}