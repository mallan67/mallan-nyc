// app/api/ai/nyc/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";

/** safeJson - parse json or return null */
async function safeJson<T = any>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * POST /api/ai/nyc
 * - Allows lookups in production only when ALLOW_NYC_LOOKUP_IN_PROD=true (or "1")
 * - Otherwise refuses in production by returning 404 (safe default)
 */
export async function POST(req: Request) {
  // Accept either `{ q }` or `{ query }` from clients
  const body = await safeJson<{ q?: string; query?: string }>(req);
  const raw = (body as any)?.q ?? (body as any)?.query ?? "";
  const q = typeof raw === "string" ? raw.trim() : "";

  const hasGeoclientId = !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY;
  const hasGeoclientKey = !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2;
  const hasSocrata = !!process.env.NYC_SODA_APP_TOKEN;

  // Allow explicitly in production only when enabled
  const allowInProd =
    String(process.env.ALLOW_NYC_LOOKUP_IN_PROD || "").toLowerCase() === "true" ||
    String(process.env.ALLOW_NYC_LOOKUP_IN_PROD || "") === "1";

  if (process.env.NODE_ENV === "production" && !allowInProd) {
    return NextResponse.json(
      { ok: false, error: "NYC lookup disabled in production. Set ALLOW_NYC_LOOKUP_IN_PROD=true to enable." },
      { status: 404 }
    );
  }

  if (!hasGeoclientId || !hasGeoclientKey || !hasSocrata) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "NYC API env vars missing. Set NYC_GEOCLIENT_SUBSCRIPTION_KEY, NYC_GEOCLIENT_SUBSCRIPTION_KEY_2, NYC_SODA_APP_TOKEN in env and restart.",
      },
      { status: 400 }
    );
  }

  // TODO: plug in the real Geoclient + Socrata lookup implementation here.
  // For now return a placeholder success (keys detected).
  return NextResponse.json({ ok: true, query: q, message: "NYC lookup placeholder — keys detected." }, { status: 200 });
}

/** GET /api/ai/nyc — info endpoint */
export async function GET() {
  return NextResponse.json({ ok: true, info: "Use POST with { q } to query this route." }, { status: 200 });
}
