// app/api/ai/nyc/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Counts = {
  violations?: number;
  permits?: number;
  complaints?: number;
  ecb_violations?: number;
};

type NYCGeoAddress = {
  houseNumber?: string;
  street?: string;
  borough?: string;
};

// ---- Helpers ---------------------------------------------------------------

function parseAddress(input: string): NYCGeoAddress {
  // Try to pull "300 East 90 Street Manhattan" into parts
  const s = (input || "").trim().replace(/\s+/g, " ");
  const boroughMatch = s.match(/\b(Manhattan|Brooklyn|Queens|Bronx|Staten Island)\b/i);
  const borough = boroughMatch?.[0]?.toLowerCase();

  // leading number = house
  const m = s.match(/^\s*(\d+)\s+(.*)$/);
  let houseNumber = m?.[1];
  let rest = m?.[2] || s;

  // remove borough word from rest
  const street = borough ? rest.replace(new RegExp(`\\b${borough}\\b`, "i"), "").trim() : rest;

  let normBorough: string | undefined;
  switch (borough) {
    case "manhattan": normBorough = "Manhattan"; break;
    case "brooklyn": normBorough = "Brooklyn"; break;
    case "queens": normBorough = "Queens"; break;
    case "bronx": normBorough = "Bronx"; break;
    case "staten island": normBorough = "Staten Island"; break;
  }
  return { houseNumber, street, borough: normBorough };
}

function originFromReq(req: Request): string {
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return process.env.NEXT_PUBLIC_API_BASE || "";
  }
}

async function geoclientAddress(
  hn: string,
  street: string,
  borough: string,
  key: string
) {
  const url = new URL("https://api.nyc.gov/geoclient/v2/address.json");
  url.searchParams.set("houseNumber", hn);
  url.searchParams.set("street", street);
  url.searchParams.set("borough", borough);

  const r = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": key },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.address || null;
}

async function geoclientSearch(input: string, key: string) {
  const url = new URL("https://api.nyc.gov/geoclient/v2/search.json");
  url.searchParams.set("input", input);
  const r = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": key },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  // Geoclient search sometimes returns { results: [{ response: { buildingIdentificationNumber } }] }
  const first = data?.results?.[0]?.response;
  return first || null;
}

async function jsonGET(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

// ---- Route ----------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query: string = (body?.query ?? "").toString().trim();

    if (!query) {
      return NextResponse.json(
        { error: 'Send { "query": "<full NYC address>" }' },
        { status: 400 }
      );
    }

    const GEOCLIENT_KEY = (process.env.GEOCLIENT_KEY || "").trim();
    if (!GEOCLIENT_KEY) {
      return NextResponse.json(
        { error: "GEOCLIENT_KEY env var is not set." },
        { status: 500 }
      );
    }

    // 1) Try robust address parse -> address endpoint
    const parts = parseAddress(query);
    let bin: string | undefined;

    if (parts.houseNumber && parts.street && parts.borough) {
      const addr = await geoclientAddress(parts.houseNumber, parts.street, parts.borough, GEOCLIENT_KEY);
      bin = addr?.buildingIdentificationNumber;
    }

    // 2) Fallback to search endpoint if needed
    if (!bin) {
      const s = await geoclientSearch(query, GEOCLIENT_KEY);
      bin = s?.buildingIdentificationNumber || s?.bin || s?.buildingIdentificationNumberMasked;
    }

    if (!bin) {
      return NextResponse.json({
        text:
          `I couldn’t resolve a BIN for “${query}”. ` +
          `Try phrasing like “300 East 90 Street Manhattan”.`,
      });
    }

    const base = originFromReq(req) || process.env.NEXT_PUBLIC_API_BASE || "";
    const u = (path: string) => (base ? `${base}${path}` : path);

    // 3) Pull DOB data from your own endpoints
    const [v, p, c, e] = await Promise.all([
      jsonGET(u(`/api/dob/violations?bin=${bin}`)),
      jsonGET(u(`/api/dob/permits?bin=${bin}`)),
      jsonGET(u(`/api/dob/complaints?bin=${bin}`)),
      jsonGET(u(`/api/dob/ecb-violations?bin=${bin}`)),
    ]);

    const counts: Counts = {
      violations: v?.data?.count ?? v?.data?.items?.length ?? 0,
      permits: p?.data?.count ?? p?.data?.items?.length ?? 0,
      complaints: c?.data?.count ?? c?.data?.items?.length ?? 0,
      ecb_violations: e?.data?.count ?? e?.data?.items?.length ?? 0,
    };

    const textLines = [
      `BIN ${bin} — quick NYC DOB summary:`,
      `• Violations: ${counts.violations}`,
      `• ECB/OATH: ${counts.ecb_violations}`,
      `• Complaints: ${counts.complaints}`,
      `• Permits: ${counts.permits}`,
      `Use the links to inspect details.`,
    ];

    return NextResponse.json({
      text: textLines.join("\n"),
      bin,
      counts,
      links: {
        violations: u(`/api/dob/violations?bin=${bin}`),
        permits: u(`/api/dob/permits?bin=${bin}`),
        complaints: u(`/api/dob/complaints?bin=${bin}`),
        ecb: u(`/api/dob/ecb-violations?bin=${bin}`),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unhandled server error" },
      { status: 500 }
    );
  }
}
