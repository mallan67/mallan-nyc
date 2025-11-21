import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Keep Next from trying to pre-render statically
export const dynamic = "force-dynamic";

/**
 * GET /api/crm/deals?agent_full_name=...&representation=LISTING_SALE|BUYER_REP|LISTING_RENT|RENTER_REP
 * Returns rows from agent_deals_v with MM/DD/YYYY dates and computed $ fields.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const agent = url.searchParams.get("agent_full_name");
  const rep   = url.searchParams.get("representation");

  const where: string[] = [];
  const params: any[] = [];

  if (agent) { params.push(agent); where.push(`agent_full_name = $${params.length}`); }
  if (rep)   { params.push(rep);   where.push(`representation_code = $${params.length}`); }

  const sql = `
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
      commission_rate_percent,
      split_percent,
      agent_fee_usd,
      company_fee_usd,
      gross_commission_usd,
      contract_signed,
      contract_closed
    FROM agent_deals_v
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY TO_DATE(contract_closed,'MM/DD/YYYY') DESC NULLS LAST,
             TO_DATE(contract_signed,'MM/DD/YYYY') DESC
  `;

  const rows = await q(sql, params);
  return NextResponse.json(rows);
}
