import { NextResponse } from "next/server";
export const runtime = "nodejs";

const V2_KEY =
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
  process.env.GEOCLIENT_APP_KEY || ""; // accept either name

const LEGACY_ID = process.env.NYC_GEOCLIENT_APP_ID || "";
const LEGACY_KEY = process.env.NYC_GEOCLIENT_APP_KEY || "";

function pickBinBbl(json: any) {
  let bin: string | null = null;
  let bbl: string | null = null;

  const sr = json?.searchResults || json?.results || [];
  const first = Array.isArray(sr) ? sr[0]?.response : null;

  bin =
    first?.bin ||
    first?.buildingIdentificationNumber ||
    null;

  bbl =
    first?.bbl ||
    (first?.boroughCode && first?.block && first?.lot
      ? `${first.boroughCode}${first.block}${first.lot}`
      : null);

  return { bin, bbl };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const input = searchParams.get("input") || searchParams.get("q") || "";
  if (!input) {
    return NextResponse.json(
      { ok: false, error: "Missing ?input" },
      { status: 200 }
    );
  }

  // Preferred: Geoclient v2 via subscription key
  if (V2_KEY) {
    const url = `https://api.nyc.gov/geo/geoclient/v2/search.json?input=${encodeURIComponent(
      input
    )}`;
    const r = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": V2_KEY },
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Geoclient ${r.status}: ${text}` },
        { status: 200 }
      );
    }
    const { bin, bbl } = pickBinBbl(json);
    return NextResponse.json({ ok: true, input, source: url, bin, bbl, raw: json });
  }

  // Legacy v1 fallback (app_id/app_key)
  if (LEGACY_ID && LEGACY_KEY) {
    const url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(
      input
    )}&app_id=${encodeURIComponent(LEGACY_ID)}&app_key=${encodeURIComponent(
      LEGACY_KEY
    )}`;
    const r = await fetch(url);
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Geoclient ${r.status}: ${text}` },
        { status: 200 }
      );
    }
    const { bin, bbl } = pickBinBbl(json);
    return NextResponse.json({ ok: true, input, source: url, bin, bbl, raw: json });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Missing NYC Geoclient credentials. Provide NYC_GEOCLIENT_SUBSCRIPTION_KEY (preferred) or NYC_GEOCLIENT_APP_ID + NYC_GEOCLIENT_APP_KEY.",
    },
    { status: 200 }
  );
}
