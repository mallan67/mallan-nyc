// app/api/geoclient/address/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

/**
 * Expects env:
 *   GEOCLIENT_APP_KEY  -> your NYC Geoclient v2 "Primary key"
 * (We don't need an app id for v2; we send the key as Ocp-Apim-Subscription-Key.)
 */

const GKEY = (process.env.GEOCLIENT_APP_KEY || "").trim();
const BASE = "https://api.nyc.gov/geoclient/v2";

function pick<T extends object>(
  obj: any,
  keys: readonly (keyof any)[]
): Record<string, any> {
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      out[k as string] = (obj as any)[k];
    }
  }
  return out;
}

function boroughFromFreeText(q: string): string | undefined {
  const s = q.toLowerCase();
  if (/\bmanhattan\b|\bmn\b|\bny\b/.test(s)) return "Manhattan";
  if (/\bbrooklyn\b|\bbk\b/.test(s)) return "Brooklyn";
  if (/\bqueens\b/.test(s)) return "Queens";
  if (/\bbronx\b/.test(s)) return "Bronx";
  if (/\bstaten\s+island\b|\bsi\b/.test(s)) return "Staten Island";
  return undefined;
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

// Try address endpoint first (best for BIN), then fallback to search endpoint.
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

    // Heuristic: try to split out houseNumber + street if possible
    // "300 East 90 Street Manhattan 10128"
    const parts = q.split(/\s+/);
    let houseNumber = "";
    if (/^\d+[A-Za-z]?$/.test(parts[0])) {
      houseNumber = parts.shift() as string;
    }
    const borough = boroughFromFreeText(q);
    const street = parts.join(" ");

    // 1) Address endpoint if we have a houseNumber AND a street AND a borough guess
    let bin: string | undefined;
    let rawAddress: any = null;
    let triedAddress = false;

    if (houseNumber && street && borough) {
      triedAddress = true;
      const addrURL =
        `${BASE}/address.json?houseNumber=${encodeURIComponent(houseNumber)}` +
        `&street=${encodeURIComponent(street)}` +
        `&borough=${encodeURIComponent(borough)}`;
      const addr = await fetchJSON(addrURL);
      rawAddress = addr?.address || addr;
      const candidate =
        rawAddress?.buildingIdentificationNumber ||
        rawAddress?.bin ||
        rawAddress?.BIN;
      if (candidate) bin = String(candidate).trim();
    }

    // 2) Fallback: search endpoint with the entire q
    let rawSearch: any = null;
    if (!bin) {
      const searchURL = `${BASE}/search.json?input=${encodeURIComponent(q)}`;
      const search = await fetchJSON(searchURL);
      rawSearch = search;

      // Shapes seen:
      // { results:[{ response:{... bin }, ...}] }  OR  { searchResults:[{bin:...}, ...] }
      const sr = (search?.results || search?.searchResults || []) as any[];
      for (const item of sr) {
        const obj = item?.response || item;
        const candidate = obj?.bin || obj?.BIN || obj?.buildingIdentificationNumber;
        if (candidate) {
          bin = String(candidate).trim();
          break;
        }
      }
    }

    if (!bin) {
      return NextResponse.json({
        ok: true,
        bin: null,
        note:
          `No BIN found from Geoclient for “${q}”. ` +
          `If this looks valid, add ZIP (e.g., “300 East 90 Street Manhattan 10128”).`,
        debug: {
          triedAddress,
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
