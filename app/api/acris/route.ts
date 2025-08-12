// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // fast

const DATASET = 'https://data.cityofnewyork.us/resource/bnx9-e6tj.json';
const TOKEN = process.env.SOCRATA_APP_TOKEN || '';

function parseBBL(bbl?: string | null) {
  if (!bbl) return null;
  const clean = String(bbl).replace(/\D/g, '');
  if (clean.length < 7) return null;
  return {
    borough: clean.slice(0, 1),
    block: clean.slice(1, 6),
    lot: clean.slice(6),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // accept either borough+block+lot or bbl
    const borough = searchParams.get('borough');
    const block   = searchParams.get('block');
    const lot     = searchParams.get('lot');
    const bblObj  = parseBBL(searchParams.get('bbl'));

    const limit = searchParams.get('$limit') || '25';
    const order = searchParams.get('$order') || 'recorded_datetime DESC';

    const qs = new URLSearchParams();
    qs.set('$limit', limit);
    qs.set('$order', order);

    if (borough && block && lot) {
      qs.set('borough', String(borough));
      qs.set('block', String(block));
      qs.set('lot', String(lot));
    } else if (bblObj) {
      qs.set('borough', bblObj.borough);
      qs.set('block', bblObj.block);
      qs.set('lot', bblObj.lot);
    } else {
      return NextResponse.json(
        { error: true, message: 'Provide borough+block+lot or bbl' },
        { status: 400 }
      );
    }

    const r = await fetch(`${DATASET}?${qs.toString()}`, {
      headers: TOKEN ? { 'X-App-Token': TOKEN, accept: 'application/json' } : { accept: 'application/json' },
      cache: 'no-store',
      next: { revalidate: 300 },
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: true, status: r.status, message: text || 'Socrata error' },
        { status: r.status }
      );
    }

    const data = await r.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: true, message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
