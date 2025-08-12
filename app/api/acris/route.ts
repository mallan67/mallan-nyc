import { NextResponse } from 'next/server';

// Multiple datasets since field names vary
const DATASETS = [
  'https://data.cityofnewyork.us/resource/bnx9-e6tj.json',
  'https://data.cityofnewyork.us/resource/ic3t-wcy2.json',
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

  if (borough && block && lot) {
    paramsList.push(new URLSearchParams({ borough, block, lot, '$limit': limit, '$order': order }));
    const bbl10 = `${String(borough)}${pad(block, 5)}${pad(lot, 4)}`;
    paramsList.push(new URLSearchParams({ bbl: bbl10, '$limit': limit, '$order': order }));
  }
  if (bbl && !borough && !block && !lot) {
    const cleaned = String(bbl).replace(/\D/g, '');
    paramsList.push(new URLSearchParams({ bbl: cleaned, '$limit': limit, '$order': order }));
  }
  return paramsList;
}

async function fetchSocrata(dataset: string, params: URLSearchParams) {
  const r = await fetch(`${dataset}?${params.toString()}`, {
    headers: TOKEN ? { 'X-App-Token': TOKEN, 'accept': 'application/json' } : { 'accept': 'application/json' },
    cache: 'no-store',
  });
  const text = await r.text();
  try {
    const maybeJson = JSON.parse(text);
    if (!r.ok) return { ok: false as const, error: maybeJson?.message || text || `HTTP ${r.status}` };
    return { ok: true as const, data: Array.isArray(maybeJson) ? maybeJson : [] };
  } catch {
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

    if (!((borough && block && lot) || bbl)) {
      return NextResponse.json({ error: true, message: 'Provide borough+block+lot OR bbl' }, { status: 400 });
    }

    const attempts = buildQueries(borough, block, lot, bbl);
    if (!attempts.length) {
      return NextResponse.json({ error: true, message: 'Bad query' }, { status: 400 });
    }

    for (const ds of DATASETS) {
      for (const p of attempts) {
        const out = await fetchSocrata(ds, p);
        if (out.ok && Array.isArray(out.data) && out.data.length) {
          return NextResponse.json(out.data, {
            headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
          });
        }
      }
    }
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: true, message: e?.message || String(e) }, { status: 500 });
  }
}
