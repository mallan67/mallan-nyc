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
        COUNT(*)::INT                                       AS deal_count,
        SUM(gross_commission_usd)::NUMERIC(14,2)            AS gross_commission_usd,
        SUM(agent_fee_usd)::NUMERIC(14,2)                   AS agent_fee_usd,
        SUM(company_fee_usd)::NUMERIC(14,2)                 AS company_fee_usd
      FROM deals
      GROUP BY agent_full_name
      ORDER BY agent_full_name
    `);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "summary query failed", error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}