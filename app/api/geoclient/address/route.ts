// app/api/geoclient/address/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// tiny safe picker that doesn't use `in` on a possible primitive
function pick(obj: unknown, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== 'object') return out;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(rec, k)) out[k] = rec[k];
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ error: 'Missing required query param: q' }, { status: 400 });
    }

    // Prefer the official pair; fall back to a single key if that’s how your env is set.
    const APP_ID =
      process.env.GEOCLIENT_APP_ID || process.env.GEOCLIENT_ID || '';
    const APP_KEY =
      process.env.GEOCLIENT_APP_KEY || process.env.GEOCLIENT_KEY || '';

    if (!APP_ID || !APP_KEY) {
      return NextResponse.json(
        {
          error:
            'GEOCLIENT_APP_ID and/or GEOCLIENT_APP_KEY are not set. Add them in Vercel → Project → Settings → Environment Variables.',
        },
        { status: 500 }
      );
    }

    const url = new URL('https://api.nyc.gov/geo/geoclient/v1/search.json');
    url.searchParams.set('input', q);
    url.searchParams.set('app_id', APP_ID);
    url.searchParams.set('app_key', APP_KEY);

    const r = await fetch(url.toString(), { cache: 'no-store' });
    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return NextResponse.json(
        { error: `Geoclient error ${r.status}`, details: data },
        { status: r.status }
      );
    }

    // First match normalization (if present)
    const resp = data?.results?.[0]?.response ?? {};
    const ids = pick(resp, ['bin', 'bbl']);
    const address = pick(resp, [
      'houseNumber',
      'firstStreetNameNormalized',
      'borough',
      'zipCode',
    ]);
    const coords = pick(resp, ['latitude', 'longitude']);

    return NextResponse.json({
      ok: true,
      query: q,
      ids,
      address,
      coords,
      raw: data, // keep for debugging; remove later if you want a smaller response
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unhandled server error' },
      { status: 500 }
    );
  }
}
