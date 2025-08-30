// app/api/geoclient/address/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE = "https://api.nyc.gov/geoclient/v2";

function pick(obj: any, keys: string[]) {
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) if (k in obj) out[k] = (obj as any)[k];
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json(
      { error: "Missing ?q= address string (e.g. q=300 E 90th St Manhattan)" },
      { status: 400 }
    );
  }

  const key = (process.env.GEOCLIENT_KEY || "").trim();
  if (!key) {
    return NextResponse.json(
      { error: "GEOCLIENT_KEY is not set." },
      { status: 500 }
    );
  }

  const upstream = `${BASE}/search.json?input=${encodeURIComponent(q)}`;

  const r = await fetch(upstream, {
    headers: {
      "Ocp-Apim-Subscription-Key": key,   // v2 auth header
      "Accept": "application/json",
    },
    // cache: "no-store", // uncomment if you never want caching
  });

  const data = await r.json().catch(() => null);

  if (!r.ok) {
    return NextResponse.json(
      { error: data?.message || r.statusText || "Upstream error", status: r.status },
      { status: r.status }
    );
  }

  // Shape a compact summary while returning the full payload as `raw`
  const first = data?.results?.[0]?.response ?? null;
  const summary = pick(first, [
    "houseNumber",
    "firstStreetNameNormalized",
    "boroughName",
    "zipCode",
    "buildingIdentificationNumber",
    "bbl",
    "latitude",
    "longitude",
  ]);

  return NextResponse.json({ ok: true, query: q, summary, raw: data });
}
