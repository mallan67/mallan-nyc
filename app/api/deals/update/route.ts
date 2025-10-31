import { NextResponse } from "next/server";
import { q } from "@/lib/db";
const inRange = (v: any) => v === null || v === undefined || (Number(v) >= 0 && Number(v) <= 100);
export async function POST(req: Request) {
  const { agent_full_name, address, contract_signed, deal_commission_rate_pct, deal_split_percent, agent_commission_usd } = await req.json();
  if (!inRange(deal_commission_rate_pct)) return NextResponse.json({error:"rate out of range"}, {status:400});
  if (!inRange(deal_split_percent))       return NextResponse.json({error:"split out of range"}, {status:400});
  await q(`
    UPDATE deal_details
       SET deal_commission_rate_pct = $4,
           deal_split_percent       = $5,
           agent_commission_usd     = $6
     WHERE agent_full_name = $1 AND address = $2 AND contract_signed = $3
  `, [agent_full_name, address, contract_signed, deal_commission_rate_pct ?? null, deal_split_percent ?? null, agent_commission_usd ?? null]);
  return NextResponse.json({ok:true});
}
