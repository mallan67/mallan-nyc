// app/api/dob/permits/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// NYC Open Data: DOB Permit Issuance (SoQL)
const BASE = "https://data.cityofnewyork.us/resource/ipu4-2q9a.json";

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bin = digitsOnly(url.searchParams.get("bin") || "");
    const limit = url.searchParams.get("limit") || "50";

    if (!bin) {
      return NextResponse.json({ error: "Missing ?bin= (7-digit BIN)" }, { status: 400 });
    }

    const params = new URLSearchParams();
    // SoQL WHERE clause – find by BIN
    params.set("$where", `bin='${bin}'`);
    params.set("$order", "issuance_date DESC");
    params.set("$limit", limit);

    const headers: Record<string, string> = { Accept: "application/json" };
    const token = (process.env.SOCRATA_APP_TOKEN || "").trim();
    if (token) headers["X-App-Token"] = token; // optional but helps with throttling

    const r = await fetch(`${BASE}?${params.toString()}`, {
      headers,
      cache: "no-store",
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: r.status,
          error: (data && data.message) || r.statusText || "Upstream error",
          upstream: data,
        },
        { status: r.status }
      );
    }

    const items = Array.isArray(data) ? data : [];
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled server error" }, { status: 500 });
  }
}
