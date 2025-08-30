// app/api/geoclient/address/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Safe key picking
function pick(obj: unknown, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== 'object') return out;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(rec, k)) out[k] = rec[k];
  }
  return out;
}

// Borough detection + street normalization (turn "E 90th St" -> "East 90 Street")
function parseAddress(input: string) {
  const q = input.trim();
  const lower = q.toLowerCase();

  const boroMap: Record<string, string> = {
    'manhattan': 'Manhattan',
    'nyc': 'Manhattan',
    'new york': 'Manhattan',
    'bronx': 'Bronx',
    'brooklyn': 'Brooklyn',
    'queens': 'Queens',
    'staten island': 'Staten Island',
    'si': 'Staten Island',
  };

  let borough: string | undefined;
  for (const key of Object.keys(boroMap)) {
    if (lower.includes(key)) {
      borough = boroMap[key];
      break;
    }
  }

  // Remove borough words from the street part when we can
  let streetPart = q;
  if (borough) {
    const regex = new RegExp(borough, 'i');
    streetPart = streetPart.replace(regex, '').trim();
  }

  // Extract house number + street text
  const m = streetPart.match(/^\s*(\d+)\s+(.+)$/);
  const houseNumber = m?.[1] ?? '';
  let street = m?.[2] ?? streetPart;

  // Normalize: E/W/N/S -> words, ordinals -> plain, St/Ave/etc -> full words
  street = street
    .replace(/\bE\b\.?/i, 'East')
    .replace(/\bW\b\.?/i, 'West')
    .replace(/\bN\b\.?/i, 'North')
    .replace(/\bS\b\.?/i, 'South');

  // Turn 90th -> 90, 21st -> 21, etc.
  street = street.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1');

  // Abbreviations to full words
  street = street
    .replace(/\bSt\b\.?/gi, 'Street')
    .replace(/\bAve\b\.?/gi, 'Avenue')
    .replace(/\bAv\b\.?/gi, 'Avenue')
    .replace(/\bRd\b\.?/gi, 'Road')
    .replace(/\bPl\b\.?/gi, 'Place')
    .replace(/\bBlvd\b\.?/gi, 'Boulevard');

  return { houseNumber, street: street.trim(), borough };
}

async function geoclientSearch(input: string, appId: string, appKey: string) {
  const url = new URL('https://api.nyc.gov/geo/geoclient/v1/search.json');
  url.searchParams.set('input', input);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  const r = await fetch(url.toString(), { cache: 'no-store' });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

async function geoclientAddress(house: string, street: string, borough: string, appId: string, appKey: string) {
  const url = new URL('https://api.nyc.gov/geo/geoclient/v1/address.json');
  url.searchParams.set('houseNumber', house);
  url.searchParams.set('street', street);
  url.searchParams.set('borough', borough);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  const r = await fetch(url.toString(), { cache: 'no-store' });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ error: 'Missing required query param: q' }, { status: 400 });
    }

    const APP_ID = process.env.GEOCLIENT_APP_ID || process.env.GEOCLIENT_ID || '';
    const APP_KEY = process.env.GEOCLIENT_APP_KEY || process.env.GEOCLIENT_KEY || '';
    if (!APP_ID || !APP_KEY) {
      return NextResponse.json(
        { error: 'GEOCLIENT_APP_ID and/or GEOCLIENT_APP_KEY are not set.' },
        { status: 500 }
      );
    }

    // 1) Try search endpoint
    const s = await geoclientSearch(q, APP_ID, APP_KEY);
    const first = s.data?.results?.[0]?.response;
    if (s.ok && first) {
      const ids = pick(first, ['bin', 'bbl']);
      const address = pick(first, [
        'houseNumber',
        'firstStreetNameNormalized',
        'borough',
        'zipCode',
      ]);
      const coords = pick(first, ['latitude', 'longitude']);
      return NextResponse.json({
        ok: true,
        source: 'search',
        query: q,
        ids,
        address,
        coords,
        raw: s.data,
      });
    }

    // 2) Fallback: address endpoint with a normalized street
    const parsed = parseAddress(q);
    if (parsed.houseNumber && parsed.street && parsed.borough) {
      const a = await geoclientAddress(parsed.houseNumber, parsed.street, parsed.borough, APP_ID, APP_KEY);
      const resp = a.data?.address ?? {};
      if (a.ok && resp) {
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
          source: 'address',
          query: q,
          normalized: parsed,
          ids,
          address,
          coords,
          raw: a.data,
        });
      }

      return NextResponse.json(
        { ok: false, source: 'address', query: q, normalized: parsed, geoclientStatus: a.status, details: a.data },
        { status: a.ok ? 404 : a.status }
      );
    }

    // If we couldn't parse a house/street/borough, return what we know
    return NextResponse.json(
      { ok: false, source: 'search', query: q, details: s.data },
      { status: s.ok ? 404 : s.status }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unhandled server error' },
      { status: 500 }
    );
  }
}
