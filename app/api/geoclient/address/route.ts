// app/api/geoclient/address/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

type Attempt = {
  url: string;
  style: "header" | "query" | "both" | "v1";
  keyMasked: string | null;
  status: number | null;
  body?: any;
};

function mask(k: string | null | undefined) {
  return k ? `${k.slice(0, 4)}…${k.slice(-4)}` : null;
}

async function tryFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await fetch(url, init);
  const t = await r.text();
  let j: any = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { ok: r.ok, status: r.status, json: j };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const input = searchParams.get("input")?.trim();
  const debug = (searchParams.get("debug") ?? "").toLowerCase() === "1";

  if (!input) {
    return NextResponse.json({ ok: false, error: "Missing ?input" }, { status: 200 });
  }

  // ---- Keys (v2) – primary + secondary, exactly as you configured in Vercel
  const v2Primary =
    process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
    process.env.GEOCLIENT_PRIMARY_KEY ||
    null;

  const v2Secondary =
    process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 ||
    process.env.GEOCLIENT_SECONDARY_KEY ||
    null;

  // ---- Optional legacy v1 (App ID/Key) – only used if provided
  const v1Id =
    process.env.NYC_GEOCLIENT_APP_ID ||
    process.env.GEOCLIENT_APP_ID ||
    null;

  const v1Key =
    process.env.NYC_GEOCLIENT_APP_KEY ||
    process.env.GEOCLIENT_APP_KEY ||
    null;

  const attempts: Attempt[] = [];

  // Helper to record each attempt
  const record = async (url: string, style: Attempt["style"], key: string | null, init?: RequestInit) => {
    try {
      const { ok, status, json } = await tryFetch(url, init);
      attempts.push({ url, style, keyMasked: mask(key), status, body: json });
      if (ok) return json;
      return null;
    } catch (e: any) {
      attempts.push({ url, style, keyMasked: mask(key), status: null, body: String(e?.message ?? e) });
      return null;
    }
  };

  // -------- v2 (subscription) tries ----------
  const baseJson = `https://api.nyc.gov/geo/geoclient/v2/search.json?input=${encodeURIComponent(input)}`;
  const baseNoExt = `https://api.nyc.gov/geo/geoclient/v2/search?input=${encodeURIComponent(input)}&format=json`;

  const v2Keys = [v2Primary, v2Secondary].filter(Boolean) as string[];

  for (const key of v2Keys) {
    // header
    let data =
      (await record(baseJson, "header", key, { headers: { "Ocp-Apim-Subscription-Key": key } })) ||
      // query
      (await record(`${baseJson}&subscription-key=${encodeURIComponent(key)}`, "query", key)) ||
      // both
      (await record(`${baseJson}&subscription-key=${encodeURIComponent(key)}`, "both", key, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      })) ||
      // alt path without .json
      (await record(baseNoExt, "header", key, { headers: { "Ocp-Apim-Subscription-Key": key } })) ||
      (await record(`${baseNoExt}&subscription-key=${encodeURIComponent(key)}`, "query", key)) ||
      (await record(`${baseNoExt}&subscription-key=${encodeURIComponent(key)}`, "both", key, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      }));

    if (data && (data.result || data.response || data.address || data.features || data)) {
      // Shape varies; try to pull BIN/BBL if present
      const first =
        (data?.result && data.result[0]) ||
        data?.response ||
        data;

      const bin = first?.bin || first?.bldgId || first?.buildingIdentificationNumber || null;
      const bbl = first?.bbl || null;

      const out: any = { ok: true, input, data, bin, bbl };
      if (debug) out.attempts = attempts;
      return NextResponse.json(out, { status: 200 });
    }
  }

  // -------- v1 (legacy) fallback ----------
  if (v1Id && v1Key) {
    const v1Url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${encodeURIComponent(
      input
    )}&app_id=${encodeURIComponent(v1Id)}&app_key=${encodeURIComponent(v1Key)}`;

    const v1 = await record(v1Url, "v1", `${mask(v1Id)}:${mask(v1Key)}`, undefined);
    if (v1 && (v1.result || v1.response || v1.address || v1.features || v1)) {
      const first =
        (v1?.result && v1.result[0]) ||
        v1?.response ||
        v1;
      const bin = first?.bin || first?.bldgId || first?.buildingIdentificationNumber || null;
      const bbl = first?.bbl || null;

      const out: any = { ok: true, input, data: v1, bin, bbl, mode: "v1" };
      if (debug) out.attempts = attempts;
      return NextResponse.json(out, { status: 200 });
    }
  }

  // Nothing worked
  const out: any = {
    ok: false,
    error: "All Geoclient attempts failed. If you’re sure the keys are correct, your subscription may be inactive/rotated.",
  };
  if (debug) out.attempts = attempts;
  return NextResponse.json(out, { status: 200 });
}
