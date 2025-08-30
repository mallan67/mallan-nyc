// app/api/dob/ecb-violations/route.ts
import { NextResponse } from "next/server";

// NYC Open Data (Socrata) - OATH/ECB violations. Some datasets expose "bin" as text.
// We use a generic endpoint and filter by BIN. App token optional.
const SOCRATA_BASE = "https://data.cityofnewyork.us/resource";
const SOCRATA_DATASET = "83x7-2h69"; // OATH/ECB Violations (commonly used). If your project uses another ID, swap it.
const TOKEN = process.env.SOCRATA_APP_TOKEN || "";

function buildUrl(bin: string, limit = 1000) {
  const url = new URL(`${SOCRATA_BASE}/${SOCRATA_DATASET}.json`);
  // Most OATH datasets store BIN as string; normalize to string compare
  url.searchParams.set("$select", "*");
  url.searchParams.set("$limit", String(limit));
  // try both lowercase and uppercase column names (dataset fields vary); Socrata supports OR
  url.searchParams.set(
    "$where",
    `(bin='${bin}') OR (BIN='${bin}')`
  );
  return url.toString();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bin = (searchParams.get("bin") || "").trim();
  if (!bin) {
    return NextResponse.json({ error: "Provide ?bin=########" }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  if (TOKEN) headers["X-App-Token"] = TOKEN;

  try {
    const r = await fetch(buildUrl(bin), { headers });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: `Socrata error ${r.status}`, body: text.slice(0, 500) },
        { status: 502 }
      );
    }
    const items = await r.json();
    return NextResponse.json({ ok: true, count: items.length || 0, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Fetch failed" }, { status: 500 });
  }
}
