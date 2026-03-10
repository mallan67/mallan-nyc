// app/api/health/socrata/route.ts
import { NextResponse } from "next/server";
import { sodaFetch, sodaTokenMasked } from "@/lib/soda";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tokenMasked = sodaTokenMasked();
    // Tiny probe: 1 row from DOB violations
    const rows = await sodaFetch("3h2n-5cm9.json", { query: { "$limit": 1 } });
    return NextResponse.json({
      ok: true,
      tokenMasked,
      sampleCount: Array.isArray(rows) ? rows.length : 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
