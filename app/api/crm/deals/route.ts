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
        representation_code,
        representation_label,
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
      ORDER BY contract_signed NULLS LAST, agent_full_name
    `);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "deals query failed", error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}