import { NextResponse } from "next/server";
export const runtime = "nodejs";

// Gather any plausible env names for v2 keys.
// Put your Primary in NYC_GEOCLIENT_SUBSCRIPTION_KEY (recommended).
// Add your Secondary as NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 (or the aliases below).
const V2_KEYS = [
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY,
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2,
  process.env.GEOCLIENT_PRIMARY_KEY,
  process.env.GEOCLIENT_SECONDARY_KEY,
  process.env.GEOCLIENT_SUBSCRIPTION_KEY,
].filter((s): s is string => !!(s && s.trim())).map(s => s.trim());

// (Optional) legacy fallback if you ever add these later:
const LEGACY_ID = (process.env.NYC_GEOCLIENT_APP_ID || process.env.GEOCLIENT_APP_ID || "").trim();
const LEGACY_KEY = (process.env.NYC_GEOCLIENT_APP_KEY || process.env.GEOCLIENT_APP_KEY || "").trim();

// Normalize BIN/BBL from either response shape
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

async function tryV2Once(baseUrl: string, input: string, key: string, style: "header" | "query" | "both") {
  const url = new URL(baseUrl);
  url.searchParams.set("input", input);

  // support both /search.json and /search?format=json
  if (!url.pathname.endsWith(".json")) {
    url.searchParams.set("format", "json");
  }

  if (style !== "header") {
    url.searchParams.set("subscription-key", key);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Cache-Control": "no-cache",
  };
  if (style !== "query") {
    headers["Ocp-Apim-Subscription-Key"] = key;
  }

  const res = await fetch(url.toString(), { headers });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, status: res.status, url: url.toString(), style, body: json ?? text };
}

async function tryV2All(input: string, keys: string[]) {
  const bases = [
    "https://api.nyc.gov/geo/geoclient/v2/search.json",
    "https://api.nyc.gov/geo/geoclient/v2/search",
  ] as const;
  const styles: Array<"header" | "query" | "both"> = ["header", "query", "both"];

  const attempts: Array<{ok:boolean;status:number;url:string;style:string;body:any;keyMasked:string}> = [];
  for (const key of keys) {
    const keyMasked = `${key.slice(0,4)}…${key.slice(-4)}`;
    for (const base of bases) {
      for (const style of styles) {
        const r = await tryV2Once(base, input, key, style);
        attempts.push({ ...r, keyMasked });
        if (r.ok) return { success: true as const, hit: { ...r, keyMasked }, attempts };
      }
    }
  }
  return { success: false as const, attempts };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const input = (searchParams.get("input") || searchParams.get("q") || "").trim();

  if (!input) {
    return NextResponse.json({ ok: false, error: "Missing ?input" }, { status: 200 });
  }

  // Prefer v2 with multi-key, multi-auth attempts
  if (V2_KEYS.length > 0) {
    const v2 = await tryV2All(input, V2_KEYS);
    if (v2.success) {
      const { body } = v2.hit;
      const { bin, bbl } = pickBinBbl(body);
      return NextResponse.json({
        ok: true,
        mode: "v2",
        input,
        bin, bbl,
        source: v2.hit.url,
        authStyle: v2.hit.style,
        key: v2.hit.keyMasked,
        raw: body,
      });
    }

    // If we have legacy creds, try them before bailing
    if (LEGACY_ID && LEGACY_KEY) {
      const v1Url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(input)}&app_id=${encodeURIComponent(LEGACY_ID)}&app_key=${encodeURIComponent(LEGACY_KEY)}`;
      const r = await fetch(v1Url);
      const t = await r.text();
      let j: any = null; try { j = t ? JSON.parse(t) : null; } catch {}
      if (r.ok) {
        const { bin, bbl } = pickBinBbl(j);
        return NextResponse.json({
          ok: true, mode: "v1_fallback", input, bin, bbl, source: v1Url,
          debug: { v2Tried: v2.attempts.map(a => ({ status: a.status, style: a.style, key: a.keyMasked, url: a.url })) },
          raw: j,
        });
      }
      return NextResponse.json({
        ok: false, mode: "v2_failed_then_v1_failed",
        error: "All v2 attempts failed and v1 failed too.",
        v2: v2.attempts.map(a => ({ status: a.status, style: a.style, key: a.keyMasked, url: a.url, body: (typeof a.body === "string" ? a.body.slice(0,400) : a.body) })),
        v1: { status: r.status, url: v1Url, body: t.slice(0,400) },
      }, { status: 200 });
    }

    // No legacy creds—report v2 failures for diagnosis
    return NextResponse.json({
      ok: false, mode: "v2_all_failed",
      error: "All v2 auth/url variants failed.",
      attempts: v2.attempts.map(a => ({ status: a.status, style: a.style, key: a.keyMasked, url: a.url, body: (typeof a.body === "string" ? a.body.slice(0,400) : a.body) })),
    }, { status: 200 });
  }

  // No v2 keys; try v1 if present
  if (LEGACY_ID && LEGACY_KEY) {
    const v1Url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(input)}&app_id=${encodeURIComponent(LEGACY_ID)}&app_key=${encodeURIComponent(LEGACY_KEY)}`;
    const r = await fetch(v1Url);
    const t = await r.text();
    let j: any = null; try { j = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) {
      return NextResponse.json({ ok: false, mode: "v1", error: `Geoclient ${r.status}: ${t.slice(0,400)}` }, { status: 200 });
    }
    const { bin, bbl } = pickBinBbl(j);
    return NextResponse.json({ ok: true, mode: "v1", input, bin, bbl, source: v1Url, raw: j });
  }

  return NextResponse.json({
    ok: false, mode: "missing",
    error: "Provide at least one v2 subscription key or a v1 app_id + app_key."
  }, { status: 200 });
}
