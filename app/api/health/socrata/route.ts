import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { sodaFetch } from "@/lib/soda";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const rows = await sodaFetch("3h2n-5cm9.json", { query: { "$limit": 1 } });
    return NextResponse.json({
      ok: true,
      sampleCount: Array.isArray(rows) ? rows.length : 0,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Socrata health check failed" },
      { status: 500 }
    );
  }
}
