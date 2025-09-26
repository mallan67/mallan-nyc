import { NextResponse } from "next/server";
export const runtime = "nodejs";

// Accept multiple env names so naming can't break auth:
const V2_KEY =
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
  process.env.GEOCLIENT_SUBSCRIPTION_KEY ||
  process.env.GEOCLIENT_PRIMARY_KEY ||
  ""; // v2: Azure APIM "Subscription Key"

const LEGACY_ID =
  process.env.NYC_GEOCLIENT_APP_ID ||
  process.env.GEOCLIENT_APP_ID ||
  "";

const LEGACY_KEY =
  process.env.NYC_GEOCLIENT_APP_KEY ||
  process.env.GEOCLIENT_APP_KEY ||
  "";

// Extract BIN/BBL from either v2 or v1 response shapes
function pickBinBbl(json: any) {
  const sr = json?.searchResults || json?.results || [];
  const first = Array.isArray(sr) ? sr[0]?.response : null;
  const bin =
    first?.bin ||
    first?.buildingIdentificationNumber ||
    null;
  const bbl =
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
    return NextResponse.json({ ok: false, error: "Missing ?input" }, { status: 200 });
  }

  // Preferred: Geoclient v2 (subscription key header)
  if (V2_KEY) {
    const url = `https://api.nyc.gov/geo/geoclient/v2/search.json?input=${encodeURIComponent(input)}`;
    const r = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": V2_KEY } });
    const text = await r.text();
    let json: any = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      return NextResponse.json({ ok: false, mode: "v2", error: `Geoclient ${r.status}: ${text}` }, { status: 200 });
    }
    const { bin, bbl } = pickBinBbl(json);
    return NextResponse.json({ ok: true, mode: "v2", input, source: url, bin, bbl, raw: json });
  }

  // Fallback: Geoclient v1 (legacy app_id + app_key)
  if (LEGACY_ID && LEGACY_KEY) {
    const url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(input)}&app_id=${encodeURIComponent(LEGACY_ID)}&app_key=${encodeURIComponent(LEGACY_KEY)}`;
    const r = await fetch(url);
    const text = await r.text();
    let json: any = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      return NextResponse.json({ ok: false, mode: "v1", error: `Geoclient ${r.status}: ${text}` }, { status: 200 });
    }
    const { bin, bbl } = pickBinBbl(json);
    return NextResponse.json({ ok: true, mode: "v1", input, source: url, bin, bbl, raw: json });
  }

  // Nothing configured
  return NextResponse.json({
    ok: false,
    mode: "missing",
    error: "Provide either NYC_GEOCLIENT_SUBSCRIPTION_KEY (v2) OR NYC_GEOCLIENT_APP_ID + NYC_GEOCLIENT_APP_KEY (v1).",
  }, { status: 200 });
}
