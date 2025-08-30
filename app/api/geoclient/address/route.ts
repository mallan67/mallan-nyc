// app/api/geoclient/address/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function pick<T>(obj: T | undefined | null, ...keys: (keyof NonNullable<T>)[]) {
  const out: any = {};
  if (!obj) return out;
  for (const k of keys) if (k in obj) out[k as string] = (obj as any)[k];
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ error: "missing ?q" }, { status: 400 });
  }

  const APP_ID = process.env.GEOCLIENT_APP_ID || "";
  const APP_KEY = process.env.GEOCLIENT_APP_KEY || "";
  if (!APP_ID || !APP_KEY) {
    return NextResponse.json(
      { error: "GEOCLIENT_APP_ID / GEOCLIENT_APP_KEY not set" },
      { status: 500 }
    );
  }

  // Geoclient v2 Search API (single-field). Requires app_id & app_key as query params.
  // Docs: requires app_id/app_key & format. We'll ask for JSON results. 
  // Example path: https://api.nyc.gov/geo/geoclient/v2/search.json?input=...
  // In practice both api.nyc.gov and maps.nyc.gov geoclient v2 are documented; we use api.nyc.gov here.
  const url = new URL("https://api.nyc.gov/geo/geoclient/v2/search.json");
  url.searchParams.set("input", q);
  url.searchParams.set("app_id", APP_ID);
  url.searchParams.set("app_key", APP_KEY);

  const r = await fetch(url.toString());
  const data = await r.json().catch(() => null);

  if (!r.ok) {
    return NextResponse.json(
      { error: `Geoclient error ${r.status}`, details: data || null },
      { status: r.status }
    );
  }

  // Geoclient returns { results: [ { response: { ... }, request: {...} } ] }
  const first = data?.results?.[0]?.response;
  const bin = first?.buildingIdentificationNumber || first?.bin || null;

  return NextResponse.json({
    ok: true,
    q,
    bin,
    raw: pick(first, "buildingIdentificationNumber", "houseNumber", "firstStreetNameNormalized", "boroughName", "bbl", "latitude", "longitude"),
  });
}
