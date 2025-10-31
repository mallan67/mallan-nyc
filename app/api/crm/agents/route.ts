import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Always run on Node (pg needs Node runtime on Vercel) and avoid static caching
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await q`
      SELECT
        first_name,
        last_name,
        full_name,
        email,
        license_no,
        license_expiry,
        sale_split,
        rental_split,
        role
      FROM agents
      ORDER BY last_name, first_name
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/crm/agents error:", err);
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
