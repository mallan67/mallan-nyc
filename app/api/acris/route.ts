// app/api/acris/route.ts
import { NextResponse } from 'next/server';

// Try a couple of ACRIS datasets (field names differ across them)
const DATASETS = [
  'https://data.cityofnewyork.us/resource/bnx9-e6tj.json', // one variant
  'https://data.cityofnewyork.us/resource/ic3t-wcy2.json', // fallback variant (bbl-centric)
];

const TOKEN = process.env.SOCRATA_APP_TOKEN || '';

function pad(n: string | number, len: number) {
  const s = String(n ?? '').replace(/\D/g, '');
  return s.padStart(len, '0');
}

function buildQueries(borough?: string | null, block?: string | null, lot?: string | null, bbl?: string | null) {
  const paramsList: URLSearchParams[] = [];
  const limit = '25';
  const order = 'recorded_datetime DESC';

  // If caller gave borough+block+lot
  if (borough && block && lot) {
    const p1 = new URLSearchParams({ borough, block, lot, '$limit': limit, '$order': order });
    paramsList.push(p1);

    // Also try as BBL
    const bbl10 = `${String(borough)}${pad(block, 5)}${pad(lot, 4)}`;
    const p2 = new URLSearchParams({ bbl: bbl10, '$limit': limit, '$order': order });
    paramsList.push(p2);
  }

  // If caller gave bbl
  if (bbl && !borough && !block && !lot) {
    const cleaned = String(bbl).replace(/\D/g, '');
    const p = new URLSearchParams({ bbl: cleaned, '$limit': limit, '$order': order });
    paramsList.push(p);
  }

  return paramsList;
}

async function fetchSocrata(dataset: string, params: URLSearchParams) {
  const r = await fetch(`${dataset}?${params.toString()}`, {
    headers: TOKEN ? { 'X-App-Token': TOKEN, 'accept': 'application/json' } : { 'accept': 'application/json' },
    cache: 'no-store',
  });

  // If Socrata returns a JSON error, read it
  const text = await r.text();
  try {
    const maybeJson = JSON.parse(text);
    if (!r.ok) {
      return { ok: false as const, error: maybeJson?.message || text || `HTTP ${r.status}` };
    }
    if (Array.isArray(maybeJson)) {
      return { ok: true as const, data: maybeJson };
    }
    // Not an array → treat as no data
    return { ok: true as const, data: [] };
  } catch {
    // Not JSON; if not OK treat as error
    if (!r.ok) return { ok: false as const, error: text || `HTTP ${r.status}` };
    return { ok: true as const, data: [] };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const borough = searchParams.get('borough');
    const block   = searchParams.get('block');
    const lot     = searchParams.get('lot');
    const bbl     = searchParams.get('bbl');

    // Must have either borough+block+lot or bbl
    if (!((borough && block && lot) || bbl)) {
      return NextResponse.json(
        { error: true, message: 'Provide borough+block+lot OR bbl' },
        { status: 400 },
      );
    }

    const attempts = buildQueries(borough, block, lot, bbl);
    if (!attempts.length) {
      return NextResponse.json({ error: true, message: 'Bad query' }, { status: 400 });
    }

    // Try combinations across both datasets until one returns rows
    for (const ds of DATASETS) {
      for (const p of attempts) {
        const out = await fetchSocrata(ds, p);
        if (out.ok && Array.isArray(out.data) && out.data.length) {
          // success
          return NextResponse.json(out.data, {
            headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
          });
        }
        // if dataset rejects field names, keep trying the next attempt
      }
    }

    // If we got here, we didn’t get rows. Return empty.
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: true, message: e?.message || String(e) },
      { status: 500 },
    );
  }
}
