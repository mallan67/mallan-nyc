import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function GET(_: Request, { params }: any) {
  const fullName = decodeURIComponent(params.fullName);
  const rows = await q(`
    SELECT representation_label, property_address, price_usd,
           commission_rate_percent, commission_rate_percent_str,
           split_percent, split_percent_str,
           agent_fee_usd, company_fee_usd, gross_commission_usd,
           contract_signed, contract_closed
    FROM agent_deals_v
    WHERE agent_full_name = $1
    ORDER BY TO_DATE(contract_closed,'MM/DD/YYYY') DESC NULLS LAST,
             TO_DATE(contract_signed,'MM/DD/YYYY') DESC
  `, [fullName]);
  return NextResponse.json(rows);
}
