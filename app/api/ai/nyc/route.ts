$path = "app\api\ai\nyc\route.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
@'
import { NextResponse } from "next/server";
export const runtime = "nodejs";

function ok(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// Build absolute URL from a request + a relative path
function abs(req: Request, path: string) {
  const u = new URL(req.url);
  if (path.startsWith("http")) return path;
  const prefix = path.startsWith("/") ? "" : "/";
  return `${u.origin}${prefix}${path}`;
}

// Fetch JSON with friendly error payloads
async function getJson(req: Request, path: string) {
  const url = abs(req, path);
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      return { ok: false, source: url, status: res.status, statusText: res.statusText, body: json ?? text };
    }
    return { ok: true, source: url, data: json };
  } catch (e: any) {
    return { ok: false, source: url, error: e?.message || String(e) };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = (body?.query || body?.q || "").toString().trim();
    let bin = (body?.bin || "").toString().trim();
    let bbl = (body?.bbl || "").toString().trim();

    // 1) Geocode if a free-text query is provided
    let geores: any = null;
    if (input) {
      const encoded = encodeURIComponent(input);
      geores = await getJson(req, `/api/geoclient/address?q=${encoded}`);
      if (geores?.ok) {
        const d = geores.data;
        // Normalize bin/bbl from the geoclient payload, but don't overwrite if caller provided
        bin ||= d?.bin || d?.data?.bin || d?.address?.buildingIdentificationNumber || null;
        bbl ||= d?.address?.bbl || d?.data?.address?.bbl || null;
      }
    }

    const missingOrErrored: any[] = [];
    const out: any = {
      ok: true,
      input: input || undefined,
      geoclient: geores ? { ok: !!geores.ok, source: geores.source, data: geores.data } : undefined,
      bin: bin || undefined,
      sources: {} as Record<string, any>,
      missingOrErrored
    };

    // 2) Build DOB source requests
    const tasks: Array<[string, string]> = [];
    if (bin) {
      tasks.push(["violations", `/api/dob/violations?bin=${encodeURIComponent(bin)}`]);
      tasks.push(["permits", `/api/dob/permits?bin=${encodeURIComponent(bin)}`]);
      tasks.push(["complaints", `/api/dob/complaints?bin=${encodeURIComponent(bin)}`]);
    }

    // Always try ECB; pass both bin and bbl when available
    if (bin || bbl) {
      const u = new URL(`/api/dob/ecb-violations`, new URL(req.url).origin);
      if (bin) u.searchParams.set("bin", bin);
      if (bbl) u.searchParams.set("bbl", bbl);
      tasks.push(["ecb_violations", u.pathname + u.search]);
    }

    // 3) Fetch all in parallel
    const results = await Promise.all(tasks.map(([_, path]) => getJson(req, path)));

    // 4) Populate response, collect errors
    tasks.forEach(([key], i) => {
      const r = results[i];
      if (r?.ok) {
        (out.sources as any)[key] = r.data;
      } else {
        missingOrErrored.push({
          ok: false,
          source: r?.source,
          status: r?.status,
          statusText: r?.statusText,
          body: r?.body,
          error: r?.error
        });
      }
    });

    return ok(out);
  } catch (e: any) {
    return ok({ ok: false, error: e?.message || String(e) }, 500);
  }
}
'@ | Set-Content -Path $path -Encoding UTF8
