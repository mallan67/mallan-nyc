import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.GEOCLIENT_URL || "https://api.nyc.gov/geoclient/v2";

export async function GET(req: NextRequest) {
  const KEY = process.env.GEOCLIENT_KEY;
  if (!KEY) return NextResponse.json({ error: "Missing GEOCLIENT_KEY" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const url = new URL(`${BASE}/address.json`);
  for (const k of ["houseNumber", "street", "borough", "zip"]) {
    const v = searchParams.get(k);
    if (v) url.searchParams.set(k, v);
  }

  const r = await fetch(url.toString(), {
    headers: { Accept: "application/json", "Ocp-Apim-Subscription-Key": KEY },
    cache: "no-store",
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
