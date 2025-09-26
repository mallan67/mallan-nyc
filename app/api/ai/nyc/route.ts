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
    const { query, ecbOpen, debug } = await req.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ ok: false, error: "Body must include { query: string }" }, { status: 200 });
    }

    const base = process.env.NEXT_PUBLIC_API_BASE ?? "";

    // 1) Resolve address → BIN + BBL (accepts ?q or ?input)
    const geores = await safeFetchJSON(`${base}/api/geoclient/address?input=${encodeURIComponent(query)}`);
    const bin = (geores as any)?.data?.bin ?? null;
    const bbl = (geores as any)?.data?.bbl ?? null;

    // 2) Pull DOB/Finance data (guarded)
    const endpoints: string[] = [];
    if (bin) {
      endpoints.push(`/api/dob/violations?bin=${bin}`);
      endpoints.push(`/api/dob/permits?bin=${bin}`);
      endpoints.push(`/api/dob/complaints?bin=${bin}`);
    }
    if (bbl) {
      // ECB needs BBL
      const open = ecbOpen === false ? '0' : '1';
      endpoints.push(`/api/dob/ecb-violations?bbl=${bbl}&open=${open}`);
    }

    const fetches = await Promise.all(endpoints.map((p) => safeFetchJSON(`${base}${p}`)));
    const successes = fetches.filter((r) => r.ok);
    const failures  = fetches.filter((r) => !r.ok);

    // 3) Build a summary skeleton WITHOUT throwing
    const out = {
      ok: true,
      input: query,
      geoclient: geores,
      bin,
      bbl,
      sources: {
        violations: successes.find((x: any) => x.source?.includes("/dob/violations"))?.data ?? null,
        permits:    successes.find((x: any) => x.source?.includes("/dob/permits"))?.data ?? null,
        complaints: successes.find((x: any) => x.source?.includes("/dob/complaints"))?.data ?? null,
        ecb_violations: successes.find((x: any) => x.source?.includes("/dob/ecb-violations"))?.data ?? null,
      },
      missingOrErrored: failures,
      debug: debug ? { notes: ["Debug on"], request: { open: ecbOpen !== false, origin: base } } : undefined
    };

    return NextResponse.json(out);
  } catch (err: any) {
    // Last-resort guard: never 500
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
