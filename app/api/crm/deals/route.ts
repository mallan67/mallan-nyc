// app/api/crm/deals/route.ts
import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await q(`
      SELECT
        agent_full_name,
        representation_label,
        property_address,
        price_usd,
        TO_CHAR(commission_rate_percent, 'FM999999990.000') AS commission_rate_percent,
        TO_CHAR(split_percent,           'FM999999990.000') AS split_percent,
        TO_CHAR(agent_fee_usd,           'FM9999999990')    AS agent_fee_usd,
        TO_CHAR(company_fee_usd,         'FM9999999990')    AS company_fee_usd,
        TO_CHAR(gross_commission_usd,    'FM9999999990')    AS gross_commission_usd,
        TO_CHAR(contract_signed, 'MM/DD/YYYY')              AS contract_signed,
        TO_CHAR(contract_closed, 'MM/DD/YYYY')              AS contract_closed
      FROM agent_deals_v
      ORDER BY contract_signed NULLS LAST, agent_full_name
    `);
    return NextResponse.json(rows);
  } catch (e: any) {
    // Soft-fail so we can see the DB error body during debugging
    return NextResponse.json(
      { ok: false, reason: "deals query failed", error: String(e?.message ?? e) },
      { status: 200 }
    );
  }
}
