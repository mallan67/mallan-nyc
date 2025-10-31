import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  agent_full_name: string;
  representation_code: string;
  representation_label: string;
  property_address: string;
  price_usd: number;
  commission_rate_percent: string;
  split_percent: string;
  agent_fee_usd: string | number;
  company_fee_usd: string | number;
  gross_commission_usd: string | number;
  contract_signed: string | null;
  contract_closed: string | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent_full_name");

    let rows: Row[];
    if (agent) {
      rows = await q<Row>(
        `
        SELECT agent_full_name, representation_code, representation_label,
               property_address, price_usd,
               commission_rate_percent, split_percent,
               agent_fee_usd, company_fee_usd, gross_commission_usd,
               contract_signed, contract_closed
        FROM deals
        WHERE agent_full_name = $1
        ORDER BY COALESCE(contract_closed, contract_signed) DESC, property_address
        `,
        [agent]
      );
    } else {
      rows = await q<Row>(`
        SELECT agent_full_name, representation_code, representation_label,
               property_address, price_usd,
               commission_rate_percent, split_percent,
               agent_fee_usd, company_fee_usd, gross_commission_usd,
               contract_signed, contract_closed
        FROM deals
        ORDER BY COALESCE(contract_closed, contract_signed) DESC, property_address
      `);
    }

    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/crm/deals error:", err);
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
