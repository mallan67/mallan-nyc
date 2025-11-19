import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ totalDeals: 2, unpaid: 27000, expiring: 1 });
}
