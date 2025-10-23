import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Never prerender; always run on request at edge/server
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await q(`
    SELECT first_name, last_name, full_name, email, license_no, license_expiry,
           sale_split, rental_split, role
    FROM agents
    ORDER BY last_name, first_name
  `);
  return NextResponse.json(rows);
}
