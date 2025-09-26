import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mask(k?: string | null) {
  if (!k) return null;
  const s = (k || "").trim();
  return s.length >= 8 ? `${s.slice(0,4)}…${s.slice(-4)}` : "****";
}

// Simple fetch that returns {ok:boolean,status,body}
async function safeFetch(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, { ...init, cache: "no-store" });
    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, body: json ?? text };
  } catch (e: any) {
    return { ok: false, status: 0, body: e?.message || String(e) };
  }
}

/**
 * GET /api/geoclient/address?houseNumber=300&street=EAST%2090%20STREET&borough=MANHATTAN&zipCode=10128&debug=1
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const hn = searchParams.get("houseNumber")?.trim() || "";
  const street = searchParams.get("street")?.trim() || "";
  const borough = searchParams.get("borough")?.trim() || "";
  const zip = searchParams.get("zipCode")?.trim() || "";
  const debug = searchParams.get("debug") === "1";

  if (!hn || !street || !borough) {
    return NextResponse.json(
      { ok: false, error: "Require houseNumber, street, borough" },
      { status: 400 }
    );
  }

  const v2Key = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || process.env.GEOCLIENT_PRIMARY_KEY || "";
  const v2Url = `https://api.nyc.gov/geo/geoclient/v2/address.json?houseNumber=${encodeURIComponent(hn)}&street=${encodeURIComponent(street)}&borough=${encodeURIComponent(borough)}${zip ? `&zipCode=${encodeURIComponent(zip)}` : ""}`;

  // 1) Try Geoclient v2 (strict address)
  let mode: "geoclient_v2" | "planning_fallback" | "none" = "none";
  let bin: string | null = null;
  let bbl: string | null = null;

  if (v2Key) {
    const res = await safeFetch(v2Url, {
      headers: {
        "Ocp-Apim-Subscription-Key": v2Key,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    if (res.ok && typeof res.body === "object" && res.body?.address) {
      // success path
      const a = res.body.address;
      bin = a.bin || a.buildingIdentificationNumber || null;
      bbl = a.bbl || null;
      mode = "geoclient_v2";
      // If parse returned but no BIN/BBL, we’ll still fallback below
    } else if (debug) {
      // keep debug info
      // res.status 401/403/etc means key not accepted by APIM
    }
  }

  // 2) Fallback if v2 missing or didn’t return BIN/BBL
  if (!bin || !bbl) {
    // Build Planning Labs query as a single string for sturdiness
    const oneLine = `${hn} ${street} ${borough}${zip ? " " + zip : ""}`.trim();
    const planUrl = `https://planninglabs.carto.com/api/v1/sql?q=` +
      encodeURIComponent(
        `SELECT bin, bbl FROM geosearch WHERE query='${oneLine.replace(/'/g, "''")}' LIMIT 1`
      );

    const planRes = await safeFetch(planUrl);
    if (planRes.ok && typeof planRes.body === "object" && planRes.body?.rows?.length) {
      const row = planRes.body.rows[0];
      bin = row.bin?.toString() || bin;
      bbl = row.bbl?.toString() || bbl;
      if (!mode) mode = "planning_fallback";
    }
  }

  const out: any = { ok: !!(bin || bbl), mode, bin, bbl };

  if (debug) {
    out.debug = {
      v2KeyMasked: mask(process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || process.env.GEOCLIENT_PRIMARY_KEY || ""),
      triedV2: Boolean(v2Key),
      v2UrlSample: v2Url.replace(/(subscription-key=)[^&]+/i, "$1***"),
    };
  }

  return NextResponse.json(out, { status: 200 });
}
