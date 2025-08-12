import { NextRequest, NextResponse } from "next/server";

const DATASET = "https://data.cityofnewyork.us/resource/bnx9-e6tj.json";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const params = new URLSearchParams();
  for (const k of ["borough","block","lot","$limit","$order","$select"]) {
    const v = sp.get(k);
    if (v) params.set(k, v);
  }
  const headers: Record<string,string> = { Accept: "application/json" };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const r = await fetch(`${DATASET}?${params.toString()}`, { headers, cache: "no-store" });
  const j = await r.json();
  return NextResponse.json(j, { status: r.status });
}
