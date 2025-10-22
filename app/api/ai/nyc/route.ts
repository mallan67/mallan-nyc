// app/api/ai/nyc/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";

async function safeJson<T = any>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await safeJson<{ q?: string }>(req);
  const q = body?.q?.trim() || "";

  const hasGeoclientId = !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY;
  const hasGeoclientKey = !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2;
  const hasSocrata = !!process.env.NYC_SODA_APP_TOKEN;

  if (!hasGeoclientId || !hasGeoclientKey || !hasSocrata) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "NYC API env vars missing. Set NYC_GEOCLIENT_SUBSCRIPTION_KEY, NYC_GEOCLIENT_SUBSCRIPTION_KEY_2, NYC_SODA_APP_TOKEN in .env and restart.",
      },
      { status: 400 }
    );
  }

  // TODO: plug in your real fetch logic here (Geoclient + Socrata).
  return NextResponse.json(
    { ok: true, query: q, message: "NYC lookup placeholder — keys detected." },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: true, info: "Use POST with { q } to query this route." },
    { status: 200 }
  );
}
