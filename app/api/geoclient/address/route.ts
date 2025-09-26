import { NextResponse } from "next/server";
export const runtime = "nodejs";

/**
 * Robust Geoclient v2 handler that:
 * 1) Accepts either ?input=free text OR houseNumber/street/& (borough|zip)
 * 2) Tries /v2/address.json (fielded) when possible
 * 3) Falls back to /v2/search.json (free-text)
 * 4) Returns { ok, bin, bbl, raw, attempts[] } and never throws
 *
 * Env:
 *   NYC_GEOCLIENT_SUBSCRIPTION_KEY        (primary v2 key)
 *   NYC_GEOCLIENT_SUBSCRIPTION_KEY_2      (optional secondary)
 *   (legacy names are ignored on purpose)
 */

const BASE = "https://api.nyc.gov/geo/geoclient/v2";

function getV2Key(): string | null {
  return (
    process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY ||
    process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 ||
    null
  );
}

function mask(s?: string | null) {
  if (!s) return null;
  return s.length <= 8 ? "••••" : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

type Attempt = {
  url: string;
  style: "address" | "search";
  status: number;
  body?: any;
};

async function hit(url: string, key: string) {
  const r = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  const t = await r.text();
  let body: any = null;
  try {
    body = t ? JSON.parse(t) : null;
  } catch {}
  return { ok: r.ok, status: r.status, body };
}

/** very light parser to split a free-text input into components */
function parseInput(input: string) {
  const z = (input.match(/\b\d{5}(?:-\d{4})?\b/) || [])[0]; // zip
  const boroList = ["manhattan", "bronx", "brooklyn", "queens", "staten island"];
  const lower = input.toLowerCase();
  const borough = boroList.find((b) => lower.includes(b));
  const cleaned = input.replace(/,/g, " ").replace(/\s{2,}/g, " ").trim();
  const parts = cleaned.split(/\s+/);

  const houseNumber = /^\d+[a-z\-]?\d*$/i.test(parts[0]) ? parts[0] : undefined;

  // street = everything after house number up to borough/zip
  let street: string | undefined;
  if (houseNumber) {
    let cut = cleaned.length;
    if (borough) {
      const iB = lower.indexOf(borough);
      if (iB > 0) cut = Math.min(cut, iB);
    }
    if (z) {
      const iZ = cleaned.indexOf(z);
      if (iZ > 0) cut = Math.min(cut, iZ);
    }
    street = cleaned.slice(houseNumber.length).slice(0, cut - houseNumber.length).trim();
  }

  return { houseNumber, street, borough, zip: z };
}

/** pick first result’s bin/bbl from v2 payloads */
function extractBinBbl(body: any) {
  // /v2/address.json and /v2/search.json both return {results:[{response:{ bin, bbl, ...}}]}
  const res = body?.results?.[0]?.response ?? null;
  const bin = res?.bin ?? null;
  const bbl = res?.bbl ?? null;
  return { bin, bbl };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const input = (u.searchParams.get("input") || "").trim();

  // allow explicit fielded params
  const houseNumber = u.searchParams.get("houseNumber") || "";
  const street = u.searchParams.get("street") || "";
  const borough = u.searchParams.get("borough") || "";
  const zip = u.searchParams.get("zip") || u.searchParams.get("zipCode") || "";

  const force = u.searchParams.get("mode"); // "address" | "search"
  const debug = u.searchParams.get("debug") === "1";

  const key = getV2Key();
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing NYC_GEOCLIENT_SUBSCRIPTION_KEY. Add it in Vercel env and redeploy.",
      },
      { status: 200 }
    );
  }

  const attempts: Attempt[] = [];
  let found: { bin: string | null; bbl: string | null } | null = null;

  // Build candidate calls in order
  const candidateCalls: { style: "address" | "search"; url: string }[] = [];

  // 1) ADDRESS mode if we have fielded parts (from query or parsed from input)
  let addr = { houseNumber, street, borough, zip };
  if (!addr.houseNumber || !addr.street || (!addr.borough && !addr.zip)) {
    if (input) {
      const p = parseInput(input);
      addr = {
        houseNumber: addr.houseNumber || p.houseNumber || "",
        street: addr.street || p.street || "",
        borough: addr.borough || p.borough || "",
        zip: addr.zip || p.zip || "",
      };
    }
  }
  const haveAddress = !!(addr.houseNumber && addr.street && (addr.borough || addr.zip));
  if (force !== "search" && haveAddress) {
    // try with zipCode first (v2) then zip (just in case)
    const q1 = new URLSearchParams({
      houseNumber: addr.houseNumber,
      street: addr.street,
      ...(addr.zip ? { zipCode: addr.zip } : {}),
      ...(addr.borough ? { borough: addr.borough } : {}),
    }).toString();
    candidateCalls.push({ style: "address", url: `${BASE}/address.json?${q1}` });

    if (addr.zip) {
      const q2 = new URLSearchParams({
        houseNumber: addr.houseNumber,
        street: addr.street,
        zip: addr.zip,
        ...(addr.borough ? { borough: addr.borough } : {}),
      }).toString();
      candidateCalls.push({ style: "address", url: `${BASE}/address.json?${q2}` });
    }
  }

  // 2) SEARCH mode
  if (force !== "address" && input) {
    const q = new URLSearchParams({ input }).toString();
    candidateCalls.push({ style: "search", url: `${BASE}/search.json?${q}` });
  }

  // Execute in order until we get a 200 with bin/bbl
  for (const c of candidateCalls) {
    const r = await hit(c.url, key);
    attempts.push({ url: c.url, style: c.style, status: r.status, body: debug ? r.body : undefined });

    if (r.ok) {
      const { bin, bbl } = extractBinBbl(r.body);
      if (bin || bbl) {
        found = { bin: bin ?? null, bbl: bbl ?? null };
        break;
      }
    }
  }

  if (found) {
    return NextResponse.json({
      ok: true,
      keyMasked: mask(key),
      bin: found.bin,
      bbl: found.bbl,
      raw: debug ? attempts : undefined,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "No BIN/BBL returned from Geoclient v2. If your key works in the portal, try supplying borough or zip, e.g. ?houseNumber=300&street=East%2090%20Street&borough=Manhattan",
      keyMasked: mask(key),
      attempts,
    },
    { status: 200 }
  );
}
