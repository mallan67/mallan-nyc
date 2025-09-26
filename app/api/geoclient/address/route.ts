import { NextResponse } from "next/server";
export const runtime = "nodejs";

// Accept multiple env names so naming mismatches can't break auth
const V2_KEY =
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
  process.env.GEOCLIENT_SUBSCRIPTION_KEY ||
  process.env.GEOCLIENT_PRIMARY_KEY ||
  "";

const LEGACY_ID =
  process.env.NYC_GEOCLIENT_APP_ID ||
  process.env.GEOCLIENT_APP_ID ||
  "";

const LEGACY_KEY =
  process.env.NYC_GEOCLIENT_APP_KEY ||
  process.env.GEOCLIENT_APP_KEY ||
  "";

// Normalize BIN/BBL from either v2 or v1 response
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

  // Try v2 (subscription key). If it fails, fall back to v1 (if available).
  if (V2_KEY) {
    const v2Url = `https://api.nyc.gov/geo/geoclient/v2/search.json?input=${encodeURIComponent(input)}`;
    const v2Res = await fetch(v2Url, { headers: { "Ocp-Apim-Subscription-Key": V2_KEY } });
    const v2Text = await v2Res.text();
    let v2Json: any = null; try { v2Json = v2Text ? JSON.parse(v2Text) : null; } catch {}

    if (v2Res.ok) {
      const { bin, bbl } = pickBinBbl(v2Json);
      return NextResponse.json({ ok: true, mode: "v2", input, source: v2Url, bin, bbl, raw: v2Json });
    }

    // v2 failed — if legacy creds exist, try v1 before bailing
    if (LEGACY_ID && LEGACY_KEY) {
      const v1Url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(input)}&app_id=${encodeURIComponent(LEGACY_ID)}&app_key=${encodeURIComponent(LEGACY_KEY)}`;
      const v1Res = await fetch(v1Url);
      const v1Text = await v1Res.text();
      let v1Json: any = null; try { v1Json = v1Text ? JSON.parse(v1Text) : null; } catch {}
      if (v1Res.ok) {
        const { bin, bbl } = pickBinBbl(v1Json);
        return NextResponse.json({
          ok: true, mode: "v1_fallback", input, source: v1Url, bin, bbl,
          debug: { v2Status: v2Res.status, v2Body: v2Text?.slice(0, 2000) || null },
          raw: v1Json
        });
      }
      // Both failed
      return NextResponse.json({
        ok: false, mode: "v2_then_v1_failed",
        error: `v2 ${v2Res.status}: ${v2Text?.slice(0, 500)} | v1 ${v1Res.status}: ${v1Text?.slice(0, 500)}`
      }, { status: 200 });
    }

    // v2 failed and no legacy creds present
    return NextResponse.json({
      ok: false, mode: "v2_only_failed",
      error: `Geoclient v2 ${v2Res.status}: ${v2Text?.slice(0, 1000)}`
    }, { status: 200 });
  }

  // No v2 key; try v1 directly
  if (LEGACY_ID && LEGACY_KEY) {
    const v1Url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(input)}&app_id=${encodeURIComponent(LEGACY_ID)}&app_key=${encodeURIComponent(LEGACY_KEY)}`;
    const v1Res = await fetch(v1Url);
    const v1Text = await v1Res.text();
    let v1Json: any = null; try { v1Json = v1Text ? JSON.parse(v1Text) : null; } catch {}
    if (!v1Res.ok) {
      return NextResponse.json({ ok: false, mode: "v1", error: `Geoclient ${v1Res.status}: ${v1Text?.slice(0, 1000)}` }, { status: 200 });
    }
    const { bin, bbl } = pickBinBbl(v1Json);
    return NextResponse.json({ ok: true, mode: "v1", input, source: v1Url, bin, bbl, raw: v1Json });
  }

  // Nothing configured
  return NextResponse.json({
    ok: false, mode: "missing",
    error: "Provide either v2 subscription key or v1 app_id + app_key."
  }, { status: 200 });
}
