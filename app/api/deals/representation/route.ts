import { NextResponse } from "next/server";
import { q } from "@/lib/db";
const ALLOWED = new Set(["LISTING_SALE","BUYER_REP","LISTING_RENT","RENTER_REP"]);
export async function POST(req: Request) {
  const { agent_full_name, address, contract_signed, representation } = await req.json();
  if (!ALLOWED.has(representation)) return NextResponse.json({error:"bad representation"}, {status:400});
  await q(`UPDATE deals SET representation = $4 WHERE agent_full_name = $1 AND address = $2 AND contract_signed = $3`,
          [agent_full_name, address, contract_signed, representation]);
  return NextResponse.json({ok:true});
}
