import { NextResponse } from "next/server";
export const runtime = "nodejs";

async function safeFetchJSON(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, init);
    const t = await r.text();
    let j: any = null;
    try { j = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) return { ok: false, status: r.status, body: j ?? t, url };
    return { ok: true, data: j, url };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), url };
  }
}

// quick parser for strings like: "300 East 90 Street Manhattan 10128"
function parseNYCAddress(input: string) {
  const m = input.match(
    /^\s*(\d+)\s+(.+?)\s+(Manhattan|Brooklyn|Queens|Bronx|Staten Island)(?:\s+(\d{5}))?\s*$/i
  );
  if (!m) return null;
  const [, houseNumber, street, borough, zip] = m;
  return {
    houseNumber: houseNumber.trim(),
    street: street.trim(),       // we will re-normalize inside geoclient route
    borough: borough?.trim(),
    zipCode: zip?.trim() || undefined,
  };
}

export async function POST(req: Request) {
  try {
    const { query, houseNumber, street, borough, zipCode, debug } = await req.json();

    // Prefer explicit fielded body; otherwise parse free text
    let h = houseNumber, s = street, b = borough, z = zipCode;
    if ((!h || !s || (!b && !z)) && typeof query === "string") {
      const p = parseNYCAddress(query);
      if (p) { h = p.houseNumber; s = p.street; b = p.borough; z = p.zipCode; }
    }

    if (!h || !s || (!b && !z)) {
      return NextResponse.json(
        { ok: false, error: "Provide { houseNumber, street, borough|zipCode } or a parseable query like '300 East 90 Street Manhattan 10128'." },
        { status: 200 }
      );
    }

    const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
    const geourl = new URL(`${base}/api/geoclient/address`);
    geourl.searchParams.set("houseNumber", h);
    geourl.searchParams.set("street", s);
    if (b) geourl.searchParams.set("borough", b);
    if (z) geourl.searchParams.set("zipCode", z);
    if (debug) geourl.searchParams.set("debug", "1");

    const geores = await safeFetchJSON(geourl.toString());
    const bin = (geores as any)?.data?.bin ?? null;
    const bbl = (geores as any)?.data?.bbl ?? null;

    const endpoints = bin
      ? [
          `/api/dob/violations?bin=${bin}`,
          `/api/dob/permits?bin=${bin}`,
          `/api/dob/complaints?bin=${bin}`,
          `/api/dob/ecb-violations?bin=${bin}`,
        ]
      : [];

    const fetches = await Promise.all(
      endpoints.map((p) => safeFetchJSON(`${base}${p}`))
    );
    const successes = fetches.filter((r) => r.ok);
    const failures = fetches.filter((r) => !r.ok);

    return NextResponse.json({
      ok: true,
      input: query ?? `${h} ${s} ${b ?? ""} ${z ?? ""}`.trim(),
      geoclient: geores,
      bin, bbl,
      sources: {
        violations: successes.find((x: any) => x.url?.includes("/violations"))?.data ?? null,
        permits:    successes.find((x: any) => x.url?.includes("/permits"))?.data ?? null,
        complaints: successes.find((x: any) => x.url?.includes("/complaints"))?.data ?? null,
        ecb_violations: successes.find((x: any) => x.url?.includes("/ecb-violations"))?.data ?? null,
      },
      missingOrErrored: failures,
      debug: debug ? { notes: ["Debug on"], request: { urls: { geoclient: geourl.toString() } } } : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
