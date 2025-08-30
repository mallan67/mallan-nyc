// app/api/ai/nyc/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

// Helper that NEVER throws; always returns a {ok:boolean, ...}
async function safeFetchJSON(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, init);
    const t = await r.text();
    let j: any = null;
    try { j = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) {
      return { ok: false, source: url, status: r.status, statusText: r.statusText, body: j ?? t };
    }
    return { ok: true, source: url, data: j };
  } catch (e: any) {
    return { ok: false, source: url, error: e?.message || String(e) };
  }
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ ok: false, error: "Body must include { query: string }" }, { status: 200 });
    }

    // 1) Resolve address → BIN
    const geores = await safeFetchJSON(`${process.env.NEXT_PUBLIC_API_BASE ?? ""}/api/geoclient/address?q=${encodeURIComponent(query)}`);
    const bin = (geores as any)?.data?.bin ?? null;

    // 2) Pull DOB data (ignore failures)
    const endpoints = bin
      ? [
          `/api/dob/violations?bin=${bin}`,
          `/api/dob/permits?bin=${bin}`,
          `/api/dob/complaints?bin=${bin}`,
          `/api/dob/ecb-violations?bin=${bin}`,
        ]
      : [];

    const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
    const fetches = await Promise.all(endpoints.map((p) => safeFetchJSON(`${base}${p}`)));

    // Partition successes and failures
    const successes = fetches.filter((r) => r.ok);
    const failures = fetches.filter((r) => !r.ok);

    // 3) Build a summary skeleton WITHOUT throwing
    const out = {
      ok: true,
      input: query,
      geoclient: geores,
      bin,
      sources: {
        violations: successes.find((x: any) => x.source?.includes("/violations"))?.data ?? null,
        permits: successes.find((x: any) => x.source?.includes("/permits"))?.data ?? null,
        complaints: successes.find((x: any) => x.source?.includes("/complaints"))?.data ?? null,
        ecb_violations: successes.find((x: any) => x.source?.includes("/ecb-violations"))?.data ?? null,
      },
      missingOrErrored: failures, // keep details for debugging
    };

    return NextResponse.json(out);
  } catch (err: any) {
    // Last-resort guard: never 500
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
