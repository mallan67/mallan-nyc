import { NextResponse } from "next/server";
export const runtime = "nodejs";

const BASE = "https://api.nyc.gov/geo/geoclient/v2";

function getKey() {
  return (
    process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
    process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 ||
    ""
  );
}
const mask = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "");

async function call(url: string, key: string) {
  const r = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": key } });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, body: json, url };
}

// Extract first result’s BIN/BBL from v2 payloads
function pickBinBbl(body: any) {
  const res = body?.results?.[0]?.response ?? null;
  return { bin: res?.bin ?? null, bbl: res?.bbl ?? null };
}

export async function GET(req: Request) {
  const key = getKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Missing NYC_GEOCLIENT_SUBSCRIPTION_KEY" },
      { status: 200 },
    );
  }

  const u = new URL(req.url);
  const debug = u.searchParams.get("debug") === "1";

  // EXACT v2 param names (no guessing):
  const input = u.searchParams.get("input")?.trim() || "";
  const houseNumber = u.searchParams.get("houseNumber")?.trim() || "";
  const street = u.searchParams.get("street")?.trim() || "";
  const borough = u.searchParams.get("borough")?.trim() || "";
  const zipCode = u.searchParams.get("zipCode")?.trim() || "";

  const attempts: Array<{ url: string; status: number; body?: any }> = [];
  let payload: any = null;

  if (houseNumber && street && (borough || zipCode)) {
    // FIELDed call: /v2/address.json with EXACT names (borough|zipCode)
    const qs = new URLSearchParams({
      houseNumber,
      street,
      ...(borough ? { borough } : {}),
      ...(zipCode ? { zipCode } : {}),
    }).toString();
    const url = `${BASE}/address.json?${qs}`;
    const r = await call(url, key);
    attempts.push({ url, status: r.status, body: debug ? r.body : undefined });
    if (r.ok) payload = r.body;
  } else if (input) {
    // Free-text call: /v2/search.json?input=
    const url = `${BASE}/search.json?${new URLSearchParams({ input })}`;
    const r = await call(url, key);
    attempts.push({ url, status: r.status, body: debug ? r.body : undefined });
    if (r.ok) payload = r.body;
  } else {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provide either ?input=… OR ?houseNumber=…&street=…&(borough|zipCode)",
      },
      { status: 200 },
    );
  }

  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Geoclient did not return 200. If portal tests succeed, check the exact same mode/fields here.",
        keyMasked: mask(key),
        attempts,
      },
      { status: 200 },
    );
  }

  const { bin, bbl } = pickBinBbl(payload);
  return NextResponse.json({
    ok: true,
    bin,
    bbl,
    keyMasked: mask(key),
    raw: debug ? payload : undefined,
    attempts,
  });
}
