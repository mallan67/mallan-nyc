// app/api/dob/complaints/route.ts
import { NextResponse } from "next/server";

/**
 * DOB Complaints (NYC Open Data)
 * Dataset: eabe-havv
 * Docs: https://data.cityofnewyork.us/Housing-Development/DOB-Complaints-Received/eabe-havv
 *
 * Usage:
 *   /api/dob/complaints?bin=1073503
 *   /api/dob/complaints?bin=1073503&limit=50
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bin = (searchParams.get("bin") || "").trim();
    let limit = Number(searchParams.get("limit") || "50");
    if (!bin) {
      return NextResponse.json({ error: "Missing required query param: bin" }, { status: 400 });
    }
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    const token = process.env.SOCRATA_APP_TOKEN?.trim();
    const endpoint = new URL("https://data.cityofnewyork.us/resource/eabe-havv.json");
    endpoint.searchParams.set("$where", `bin='${bin}'`);
    // Newest first (dataset uses string dates but ordering is still useful)
    endpoint.searchParams.set("$order", "date_entered DESC");
    endpoint.searchParams.set("$limit", String(limit));

    const r = await fetch(endpoint.toString(), {
      headers: token ? { "X-App-Token": token } : {},
      // 20s timeout-ish via Next fetch options is not available here; rely on platform defaults
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Socrata request failed: ${r.status} ${r.statusText}` },
        { status: 502 }
      );
    }
    const items = await r.json();
    return NextResponse.json({ ok: true, count: Array.isArray(items) ? items.length : 0, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled server error" }, { status: 500 });
  }
}
