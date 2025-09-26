import { NextResponse } from "next/server";
export const runtime = "nodejs";

const BASE = "https://api.nyc.gov/geo/geoclient/v2";

const getV2Key = () =>
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
  process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 ||
  process.env.GEOCLIENT_PRIMARY_KEY ||
  process.env.GEOCLIENT_SECONDARY_KEY ||
  "";

const mask = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "");

/**
 * Canonicalize to fully spelled out street names (your requirement):
 *  - E → East, W → West, N → North, S → South
 *  - "St"/"St." → "Street"; "Ave"/"Ave." → "Avenue"
 *  - Remove ordinal suffix (90th → 90)
 *  - Collapse spaces
 * 
 * Examples that become "East 90 Street":
 *   "E 90 St", "E. 90th St.", "East 90th St", "e 90 st"
 */
function canonicalStreet(raw: string) {
  if (!raw) return raw;
  let s = raw.trim();

  // Lower noise
  s = s.replace(/\./g, " ");

  // Remove ordinal suffixes (21st/2nd/3rd/90th → 21/2/3/90)
  s = s.replace(/\b(\d{1,3})(st|nd|rd|th)\b/gi, "$1");

  // Direction→word at start
  s = s.replace(/^\s*e\b/i, "East");
  s = s.replace(/^\s*w\b/i, "West");
  s = s.replace(/^\s*n\b/i, "North");
  s = s.replace(/^\s*s\b/i, "South");

  // Abbrev → full (keep it tight; expand only the common ones)
  s = s.replace(/\bave\b/i, "Avenue");
  s = s.replace(/\bave\b/i, "Avenue");
  s = s.replace(/\bave(?:nue)?\b/i, "Avenue");
  s = s.replace(/\bst\b/i, "Street");
  s = s.replace(/\bstreet\b/i, "Street");

  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();

  // Normalize casing: Title Case words, but keep "of", "the" lower if desired (not needed here)
  s = s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return s;
}

async function fetchV2(url: string, key: string) {
  const r = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  const text = await r.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, url, body };
}

function pickBinBbl(body: any) {
  const res = body?.results?.[0]?.response ?? null;
  return { bin: res?.bin ?? null, bbl: res?.bbl ?? null };
}

/**
 * Required query:
 *   ?houseNumber=300&street=East%2090%20Street&(borough=Manhattan | zipCode=10128)
 */
export async function GET(req: Request) {
  const key = getV2Key();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Missing NYC_GEOCLIENT_SUBSCRIPTION_KEY" },
      { status: 200 }
    );
  }

  const u = new URL(req.url);
  const debug = u.searchParams.get("debug") === "1";

  const houseNumber = (u.searchParams.get("houseNumber") || "").trim();
  const streetIn    = (u.searchParams.get("street") || "").trim();
  const borough     = (u.searchParams.get("borough") || "").trim();
  const zipCode     = (u.searchParams.get("zipCode") || "").trim();

  if (!houseNumber || !streetIn || (!borough && !zipCode)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provide ?houseNumber=…&street=…&borough=… OR ?houseNumber=…&street=…&zipCode=…",
        hint: "Street must be fully spelled out (e.g., 'East 90 Street').",
      },
      { status: 200 }
    );
  }

  const street = canonicalStreet(streetIn);

  // Hard requirement: fully spelled form—**reject** if it isn't strictly "East 90 Street" style
  // (You can relax this later if you want.)
  if (!/^(East|West|North|South)\s+\d{1,3}\s+Street$/i.test(street)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Street must be fully spelled out like 'East 90 Street' (no '90th', no abbreviations).",
        normalizedSuggestion: street,
      },
      { status: 200 }
    );
  }

  const qs = new URLSearchParams({
    houseNumber,
    street,
    ...(borough ? { borough } : {}),
    ...(zipCode ? { zipCode } : {}),
  }).toString();

  const url = `${BASE}/address.json?${qs}`;
  const r = await fetchV2(url, key);

  if (!r.ok) {
    return NextResponse.json(
      {
        ok: false,
        keyMasked: mask(key),
        attempt: { url: r.url, status: r.status, body: debug ? r.body : undefined },
        hint: "Verify your subscription is active. Portal and this call should match 1:1.",
      },
      { status: 200 }
    );
  }

  const { bin, bbl } = pickBinBbl(r.body);
  return NextResponse.json({
    ok: true,
    keyMasked: mask(key),
    used: { url: r.url, headers: { "Ocp-Apim-Subscription-Key": "•", "Cache-Control": "no-cache" } },
    bin, bbl,
    raw: debug ? r.body : undefined,
  });
}
