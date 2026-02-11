export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { soda, getSocrataToken } from "@/lib/soda";

/** safeJson - parse JSON body or return null */
async function safeJson<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Safe fetch that returns {ok, status, body} */
async function safeFetch(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, { ...init, cache: "no-store" });
    const text = await r.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, body: json ?? text };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: msg };
  }
}

// NYC borough aliases for free-text parsing
const BOROUGH_MAP: Record<string, string> = {
  manhattan: "MANHATTAN", mn: "MANHATTAN", nyc: "MANHATTAN", "new york": "MANHATTAN",
  brooklyn: "BROOKLYN", bk: "BROOKLYN", bklyn: "BROOKLYN",
  queens: "QUEENS", qn: "QUEENS", qns: "QUEENS",
  bronx: "BRONX", bx: "BRONX", "the bronx": "BRONX",
  "staten island": "STATEN ISLAND", si: "STATEN ISLAND",
};

/** Parse a free-text address into { houseNumber, street, borough, zip } */
function parseAddress(input: string): {
  houseNumber: string;
  street: string;
  borough: string;
  zip: string;
} {
  let text = input.trim().replace(/,/g, " ").replace(/\s+/g, " ");

  // Extract zip code (5-digit)
  let zip = "";
  const zipMatch = text.match(/\b(\d{5})\b/);
  if (zipMatch) {
    zip = zipMatch[1];
    text = text.replace(zipMatch[0], "").trim();
  }

  // Remove trailing state abbreviations
  text = text.replace(/\b(ny|new york|nyc)\s*$/i, "").trim();

  // Extract borough
  let borough = "";
  const lower = text.toLowerCase();
  for (const [alias, name] of Object.entries(BOROUGH_MAP)) {
    const idx = lower.lastIndexOf(alias);
    if (idx >= 0) {
      borough = name;
      text = (text.slice(0, idx) + text.slice(idx + alias.length)).replace(/\s+/g, " ").trim();
      break;
    }
  }

  // Extract house number (leading digits, possibly with dash like 42-10)
  let houseNumber = "";
  const hnMatch = text.match(/^(\d[\d-]*)\s+/);
  if (hnMatch) {
    houseNumber = hnMatch[1];
    text = text.slice(hnMatch[0].length).trim();
  }

  // Remaining text is the street name
  const street = text.replace(/\s+/g, " ").trim();

  return { houseNumber, street, borough: borough || "MANHATTAN", zip };
}

/**
 * POST /api/ai/nyc
 * Resolves a free-text NYC address to BIN/BBL via Geoclient, then fetches
 * ECB violations from Socrata. Returns a combined response.
 *
 * Body: { q | query: string, ecbOpen?: boolean, debug?: boolean }
 *
 * Disabled in production unless ALLOW_NYC_LOOKUP_IN_PROD=true.
 * Requires: NYC_GEOCLIENT_SUBSCRIPTION_KEY and a Socrata App Token.
 */
export async function POST(req: Request) {
  const body = await safeJson<{
    q?: string;
    query?: string;
    ecbOpen?: boolean;
    debug?: boolean;
  }>(req);
  const raw = body?.q ?? body?.query ?? "";
  const q = typeof raw === "string" ? raw.trim() : "";
  const ecbOpen = body?.ecbOpen !== false; // default true
  const debug = body?.debug === true;

  // Production gate
  const allowInProd =
    String(process.env.ALLOW_NYC_LOOKUP_IN_PROD || "").toLowerCase() === "true" ||
    String(process.env.ALLOW_NYC_LOOKUP_IN_PROD || "") === "1";

  if (process.env.NODE_ENV === "production" && !allowInProd) {
    return NextResponse.json(
      { ok: false, error: "NYC lookup disabled in production. Set ALLOW_NYC_LOOKUP_IN_PROD=true to enable." },
      { status: 404 }
    );
  }

  // Env var check
  const geoclientKey = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || "";
  const socrataToken = getSocrataToken();

  if (!geoclientKey) {
    return NextResponse.json(
      { ok: false, error: "NYC_GEOCLIENT_SUBSCRIPTION_KEY is required." },
      { status: 400 }
    );
  }

  if (!q) {
    return NextResponse.json(
      { ok: false, error: "Query is required. Send { q: '300 East 90 Street Manhattan' }." },
      { status: 400 }
    );
  }

  const debugNotes: string[] = [];
  const { houseNumber, street, borough, zip } = parseAddress(q);

  if (!houseNumber || !street) {
    return NextResponse.json(
      { ok: false, error: "Could not parse address. Expected format: '300 East 90 Street Manhattan 10128'." },
      { status: 400 }
    );
  }

  // --- Step 1: Geoclient v2 → BIN/BBL ---
  const geoclientUrl =
    `https://api.nyc.gov/geo/geoclient/v2/address.json` +
    `?houseNumber=${encodeURIComponent(houseNumber)}` +
    `&street=${encodeURIComponent(street)}` +
    `&borough=${encodeURIComponent(borough)}` +
    (zip ? `&zipCode=${encodeURIComponent(zip)}` : "");

  const geoRes = await safeFetch(geoclientUrl, {
    headers: {
      "Ocp-Apim-Subscription-Key": geoclientKey,
      "Cache-Control": "no-cache",
    },
  });

  let bin: string | null = null;
  let bbl: string | null = null;
  let geoclientData: unknown = null;

  if (geoRes.ok && typeof geoRes.body === "object" && geoRes.body !== null) {
    const addr = (geoRes.body as Record<string, unknown>)?.address as Record<string, unknown> | undefined;
    if (addr) {
      bin = (addr.buildingIdentificationNumber as string) || (addr.bin as string) || null;
      bbl = (addr.bbl as string) || null;
      geoclientData = addr;
      debugNotes.push(`Geoclient resolved: BIN=${bin}, BBL=${bbl}`);
    }
  }

  // Fallback: Planning Labs Carto
  if (!bin && !bbl) {
    debugNotes.push("Geoclient did not return BIN/BBL, trying Planning Labs fallback");
    const oneLine = `${houseNumber} ${street} ${borough}${zip ? " " + zip : ""}`;
    const planUrl =
      `https://planninglabs.carto.com/api/v1/sql?q=` +
      encodeURIComponent(
        `SELECT bin, bbl FROM geosearch WHERE query='${oneLine.replace(/'/g, "''")}' LIMIT 1`
      );
    const planRes = await safeFetch(planUrl);
    if (planRes.ok && typeof planRes.body === "object" && planRes.body !== null) {
      const rows = (planRes.body as Record<string, unknown>)?.rows as Record<string, unknown>[] | undefined;
      if (rows && rows.length > 0) {
        bin = rows[0].bin?.toString() || null;
        bbl = rows[0].bbl?.toString() || null;
        debugNotes.push(`Planning Labs resolved: BIN=${bin}, BBL=${bbl}`);
      }
    }
  }

  if (!bin && !bbl) {
    return NextResponse.json(
      {
        ok: false,
        input: q,
        error: "Could not resolve address to BIN/BBL. Check spelling and include borough.",
        ...(debug ? { debug: { parsed: { houseNumber, street, borough, zip }, notes: debugNotes } } : {}),
      },
      { status: 200 }
    );
  }

  // --- Step 2: ECB violations via Socrata ---
  let ecbResult: { ok: boolean; count: number; balance: number; items: unknown[] } = {
    ok: false, count: 0, balance: 0, items: [],
  };

  const ecbDataset = process.env.SODA_DATASET_OATH_ECB;
  if (bbl && socrataToken && ecbDataset) {
    try {
      const whereClause = [`bbl='${bbl}'`, ecbOpen ? `violation_status='OPEN'` : ""]
        .filter(Boolean)
        .join(" AND ");
      const items = await soda({
        resource: ecbDataset,
        where: whereClause,
        limit: 200,
        order: "violation_date DESC",
      });
      const balance = items.reduce(
        (sum: number, it: Record<string, unknown>) => sum + (Number(it?.balance_due) || 0),
        0
      );
      ecbResult = { ok: true, count: items.length, balance, items };
      debugNotes.push(`ECB query returned ${items.length} violations, $${balance.toFixed(2)} balance`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      debugNotes.push(`ECB query failed: ${msg}`);
    }
  } else {
    if (!bbl) debugNotes.push("No BBL — skipping ECB lookup");
    if (!socrataToken) debugNotes.push("No Socrata token — skipping ECB lookup");
    if (!ecbDataset) debugNotes.push("SODA_DATASET_OATH_ECB not set — skipping ECB lookup");
  }

  // --- Build response matching HomeClient.tsx shape ---
  const response: Record<string, unknown> = {
    ok: true,
    input: q,
    bin,
    bbl,
    geoclient: geoclientData,
    sources: {
      ecb_violations: {
        ok: ecbResult.ok,
        count: ecbResult.count,
        items: ecbResult.items,
      },
    },
    ecb_open_count: ecbResult.count,
    ecb_balance_due_total: ecbResult.balance,
  };

  if (debug) {
    response.debug = {
      request: {
        open: ecbOpen,
        parsed: { houseNumber, street, borough, zip },
        urls: {
          geoclient: geoclientUrl.replace(/(Subscription-Key=)[^&]+/i, "$1***"),
          ecb: bbl ? `Socrata OATH_ECB where bbl='${bbl}'` : null,
        },
      },
      notes: debugNotes,
    };
  }

  return NextResponse.json(response, { status: 200 });
}

/** GET /api/ai/nyc — info */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      info: "POST { q: '300 East 90 Street Manhattan 10128' } to look up an address.",
      options: {
        ecbOpen: "boolean — filter to open ECB violations only (default: true)",
        debug: "boolean — include debug info in response",
      },
    },
    { status: 200 }
  );
}
