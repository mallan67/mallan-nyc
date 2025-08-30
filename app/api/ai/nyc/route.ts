// app/api/ai/nyc/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Counts = {
  violations: number;
  permits: number;
  complaints: number;
  ecb_violations: number;
};

function originFrom(req: Request) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

function asCount(obj: any): number {
  if (!obj) return 0;
  if (Array.isArray(obj.items)) return obj.items.length;
  if (typeof obj.count === "number") return obj.count;
  const n = Number(obj.count);
  return Number.isFinite(n) ? n : 0;
}

async function getJSON(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  let data: any = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    throw new Error(data?.error || `${r.status} ${r.statusText} for ${url}`);
  }
  return data;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = (body?.query || "").toString().trim();
    const origin = originFrom(req);

    if (!query) {
      return NextResponse.json(
        { error: 'Send { "query": "<full NYC address>" }' },
        { status: 400 }
      );
    }

    // 1) Resolve BIN from your internal Geoclient helper
    //    (expects you already set GEOCLIENT_APP_ID / GEOCLIENT_APP_KEY in env)
    const geo = await getJSON(
      `${origin}/api/geoclient/address?q=${encodeURIComponent(query)}`
    );

    // Try to extract a BIN from common shapes
    let bin: string | undefined;

    // Case A: our helper returned { ok, bin, ... }
    if (!bin && typeof geo?.bin === "string" && geo.bin.trim()) {
      bin = geo.bin.trim();
    }

    // Case B: helper returned { items: [...] } where one has bin
    if (!bin && Array.isArray(geo?.items)) {
      for (const it of geo.items) {
        const candidate = (it?.bin ?? it?.BIN ?? "").toString().trim();
        if (candidate) { bin = candidate; break; }
      }
    }

    // Case C: helper returned { address: {...} }
    if (!bin && geo?.address?.buildingIdentificationNumber) {
      bin = String(geo.address.buildingIdentificationNumber).trim();
    }

    if (!bin) {
      return NextResponse.json(
        {
          text:
            `I couldn’t resolve a BIN for “${query}”. ` +
            `Try a fully spelled address like “300 East 90 Street Manhattan 10128”.`
        },
        { status: 200 }
      );
    }

    // 2) Pull DOB + ECB/OATH datasets in parallel (via your internal endpoints)
    const [vios, perms, comps, ecb] = await Promise.all([
      getJSON(`${origin}/api/dob/violations?bin=${bin}`),
      getJSON(`${origin}/api/dob/permits?bin=${bin}`),
      getJSON(`${origin}/api/dob/complaints?bin=${bin}`),
      getJSON(`${origin}/api/dob/ecb-violations?bin=${bin}`),
    ]);

    const counts: Counts = {
      violations: asCount(vios),
      permits: asCount(perms),
      complaints: asCount(comps),
      ecb_violations: asCount(ecb),
    };

    // 3) Build a quick human summary
    const text =
      `BIN ${bin} — quick NYC DOB summary:\n` +
      `• Violations: ${counts.violations}\n` +
      `• ECB/OATH: ${counts.ecb_violations}\n` +
      `• Complaints: ${counts.complaints}\n` +
      `• Permits: ${counts.permits}\n` +
      `Use the links to inspect details.`;

    const links = {
      violations: `${origin}/api/dob/violations?bin=${bin}`,
      permits: `${origin}/api/dob/permits?bin=${bin}`,
      complaints: `${origin}/api/dob/complaints?bin=${bin}`,
      ecb: `${origin}/api/dob/ecb-violations?bin=${bin}`,
    };

    return NextResponse.json({ text, bin, counts, links });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unhandled server error" },
      { status: 500 }
    );
  }
}
