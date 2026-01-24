import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = 'force-dynamic';

const inRange = (v: any) => v === null || v === undefined || (Number(v) >= 0 && Number(v) <= 100);
export async function POST(req: Request) {
  const { agent_full_name, year, sale_split_pct, rental_split_pct } = await req.json();
  if (!inRange(sale_split_pct) || !inRange(rental_split_pct)) return NextResponse.json({error:"split out of range"}, {status:400});
  await q(`
    INSERT INTO splits (agent_full_name, year, sale_split_pct, rental_split_pct)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (agent_full_name, year) DO UPDATE
      SET sale_split_pct = EXCLUDED.sale_split_pct,
          rental_split_pct = EXCLUDED.rental_split_pct
  `, [agent_full_name, year, sale_split_pct ?? null, rental_split_pct ?? null]);
  return NextResponse.json({ok:true});
}
