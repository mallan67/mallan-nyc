import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await q(`
      SELECT first_name, last_name, (first_name || ' ' || last_name) AS full_name,
             email, license_no, license_expiry, sale_split, rental_split, role
      FROM agents
      ORDER BY last_name, first_name
      LIMIT 10
    `);
    return NextResponse.json({ ok: true, rows });
  } catch (e:any) {
    return NextResponse.json({ ok:false, where:"/api/debug/agents", error:String(e?.message ?? e) }, { status: 200 });
  }
}