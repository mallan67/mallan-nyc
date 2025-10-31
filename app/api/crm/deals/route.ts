import { NextResponse } from "next/server";
import { q } from "@lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentFullName = searchParams.get("agent_full_name");

    const rows = agentFullName
      ? await q`
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
          FROM deals
          WHERE agent_full_name = ${agentFullName}
          ORDER BY contract_signed DESC, property_address
        `
      : await q`
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
            gross_commission_usd
            , contract_signed
            , contract_closed
          FROM deals
          ORDER BY contract_signed DESC, agent_full_name
        `;

    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/crm/deals error:", err);
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
