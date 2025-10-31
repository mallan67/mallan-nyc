import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// run on request, do not prerender/export
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await q(`
      SELECT
        agent_full_name,
        deal_count,
        gross_commission_usd,
        agent_fee_usd,
        company_fee_usd
      FROM agent_deals_summary_v
      ORDER BY agent_full_name
    `);
    return NextResponse.json(rows);
  } catch (e: any) {
    // soft-fail so export doesn't crash if the view isn’t created yet
    return NextResponse.json(
      { ok: false, reason: "agent_deals_summary_v missing or DB not ready", error: String(e?.message || e) },
      { status: 200 }
    );
  }
}
