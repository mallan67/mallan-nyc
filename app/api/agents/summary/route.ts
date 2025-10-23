import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function GET() {
  const rows = await q(`
    SELECT
      agent_full_name,
      total_deals, sale_deals, rental_deals,
      listing_sale_deals, buyer_rep_deals, listing_rent_deals, renter_rep_deals,
      total_sales_volume_usd, total_rental_volume_usd,
      total_agent_fee_usd, total_company_fee_usd, total_gross_commission_usd,
      avg_commission_rate_pct, avg_split_pct,
      TO_CHAR(last_closed_date_raw, 'MM/DD/YYYY') AS last_closed
    FROM agent_deals_summary_v
    ORDER BY agent_full_name
  `);
  return NextResponse.json(rows);
}
