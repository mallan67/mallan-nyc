// app/api/geoclient/address/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

/**
 * Requires:
 *   GEOCLIENT_APP_KEY  -> NYC Geoclient v2 “Primary key”
 * We send it in header: Ocp-Apim-Subscription-Key
 */
const GKEY = (process.env.GEOCLIENT_APP_KEY || "").trim();
const BASE = "https://api.nyc.gov/geoclient/v2";

const BOROS = [
  { names: ["manhattan", "mn", "ny"], canon: "Manhattan" },
  { names: ["brooklyn", "bk"], canon: "Brooklyn" },
  { names: ["queens"], canon: "Queens" },
  { names: ["bronx"], canon: "Bronx" },
  { names: ["staten", "statenisland", "staten-island", "si"], canon: "Staten Island" },
];

const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;

function hasOwn(o: any, k: PropertyKey) {
  return o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
}

function boroughFromTokens(tokens: string[]): { boro?: string; idx?: number } {
  const joined = tokens.join(" ");
  for (let i = 0; i < tokens.length; i++) {
    const tail = tokens.slice(i).join(" ").toLowerCase();
    for (const b of BOROS) {
      for (const n of b.names) {
        // match whole word “n” OR phrase starting with that n
        if (tail === n || tail.startsWith(n + " ") || joined.toLowerCase().includes(` ${n} `)) {
          return { boro: b.canon, idx: i };
        }
      }
    }
  }
  return {};
}

function stripZip(tokens: string[]): { tokens: string[]; zip?: string } {
  const out: string[] = [];
  let zip: string | undefined;
  for (const t of tokens) {
    if (!zip && ZIP_RE.test(t)) { zip = t; continue; }
    out.push(t);
  }
  return { tokens: out, zip };
}

function pick(obj: any, keys: string[]) {
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) if (hasOwn(obj, k)) out[k] = obj[k];
  return out;
}

async function fetchJSON(url: string) {
  const r = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": GKEY },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(
      data?.message || data?.error || `${r.status} ${r.statusText} for ${url}`
    );
  }
  return data;
}

export async function GET(req: Request) {
  try {
    if (!GKEY) {
      return NextResponse.json(
        { error: "GEOCLIENT_APP_KEY is not set." },
        { status: 500 }
      );
    }

    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();

    // Health check
    if (!q) {
      return NextResponse.json({
        ok: true,
        route: "/api/geoclient/address",
        expects: "q=<full address> (e.g., 300 East 90 Street Manhattan 10128)",
        hasKey: Boolean(GKEY),
      });
    }

    // Tokenize & normalize
    let rawTokens = q.split(/\s+/).filter(Boolean);
    // Keep original for fallback/search
    const original = q;
    // Strip ZIP first
    const { tokens: noZipTokens, zip } = stripZip(rawTokens);
    rawTokens = noZipTokens;

    // Extract house number if first token looks like one
    let houseNumber = "";
    if (/^\d+[A-Za-z]?$/.test(rawTokens[0] || "")) {
      houseNumber = rawTokens.shift() as string;
    }

    // Detect borough and split street tokens BEFORE borough start
    const { boro, idx } = boroughFromTokens(rawTokens);
    let streetTokens = rawTokens.slice(); // default: all remaining tokens
    if (idx !== undefined) streetTokens = rawTokens.slice(0, idx);

    const street = streetTokens.join(" ").trim();

    // Try ADDRESS endpoint first (needs houseNumber + street + borough)
    let bin: string | undefined;
    let rawAddress: any = null;
    let usedAddressEndpoint = false;

    if (houseNumber && street && boro) {
      usedAddressEndpoint = true;
      const addrURL =
        `${BASE}/address.json?houseNumber=${encodeURIComponent(houseNumber)}` +
        `&street=${encodeURIComponent(street)}` +
        `&borough=${encodeURIComponent(boro)}`;
      const addr = await fetchJSON(addrURL);
      rawAddress = addr?.address || addr;
      const candidate =
        rawAddress?.buildingIdentificationNumber ||
        rawAddress?.bin ||
        rawAddress?.BIN;
      if (candidate) bin = String(candidate).trim();
    }

    // Fallback: SEARCH endpoint with full original text (+ ZIP kept if present)
    let rawSearch: any = null;
    if (!bin) {
      const searchURL = `${BASE}/search.json?input=${encodeURIComponent(original)}`;
      rawSearch = await fetchJSON(searchURL);

      const sr = (rawSearch?.results || rawSearch?.searchResults || []) as any[];
      for (const item of sr) {
        const obj = item?.response || item;
        const candidate = obj?.bin || obj?.BIN || obj?.buildingIdentificationNumber;
        if (candidate) { bin = String(candidate).trim(); break; }
      }
    }

    if (!bin) {
      return NextResponse.json({
        ok: true,
        bin: null,
        note:
          `No BIN found for “${q}”. Try adding ZIP (e.g., “300 East 90 Street Manhattan 10128”).`,
        debug: {
          usedAddressEndpoint,
          parsed: { houseNumber, street, borough: boro, zip },
          addressPicked: pick(rawAddress, [
            "buildingIdentificationNumber",
            "houseNumber",
            "firstStreetNameNormalized",
            "boroughName",
            "zipCode",
          ]),
          searchSample: Array.isArray(rawSearch?.searchResults)
            ? pick(rawSearch.searchResults[0] || {}, ["bin", "houseNumber", "streetName", "boroughName", "zipCode"])
            : Array.isArray(rawSearch?.results)
              ? pick((rawSearch.results[0] || {}).response || {}, ["bin", "houseNumber", "streetName", "boroughName", "zipCode"])
              : null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      bin,
      parsed: { houseNumber, street, borough: boro, zip },
      address: pick(rawAddress, [
        "houseNumber",
        "firstStreetNameNormalized",
        "boroughName",
        "zipCode",
      ]),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unhandled server error" },
      { status: 500 }
    );
  }
}
