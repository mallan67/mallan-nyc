import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Force Node runtime and dynamic execution so 'pg' runs on Vercel
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await q(`
      SELECT first_name, last_name, full_name, email, license_no, license_expiry,
             sale_split, rental_split, role
      FROM agents
      ORDER BY last_name, first_name
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/crm/agents error:", err);
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
