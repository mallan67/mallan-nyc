// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://data.cityofnewyork.us/resource/bnx9-e6tj.json';
const SOCRATA_TOKEN = process.env.SOCRATA_APP_TOKEN || '';

function n(x: string | null) {
  const v = Number(x ?? '');
  return Number.isFinite(v) ? v : undefined;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Health check
  if (searchParams.get('ping')) {
    return NextResponse.json({ ok: true, handler: 'acris-app-simplified' });
  }

  // Accept either bbl=1013360066 OR borough+block+lot
  let borough = n(searchParams.get('borough'));
  let block   = n(searchParams.get('block'));
  let lot     = n(searchParams.get('lot'));

  const bblRaw = (searchParams.get('bbl') || '').replace(/\D/g, '');
  if (!borough && !block && !lot && bblRaw.length >= 8) {
    borough = Number(bblRaw.slice(0, 1));
    block   = Number(bblRaw.slice(1, 6));
    lot     = Number(bblRaw.slice(6));
  }

  if (!borough || !block || !lot) {
    return NextResponse.json(
      { error: true, message: 'Provide bbl=<10digits> OR borough+block+lot' },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams({
    borough: String(borough),
    block: String(block),
    lot: String(lot),
    $order: 'recorded_datetime DESC',
    $limit: searchParams.get('$limit') || '25',
  });

  const headers: Record<string, string> = { accept: 'application/json' };
  if (SOCRATA_TOKEN) headers['X-App-Token'] = SOCRATA_TOKEN;

  const r = await fetch(`${BASE}?${qs.toString()}`, { headers, cache: 'no-store' });
  if (!r.ok) {
    const body = await r.text();
    return NextResponse.json({ error: true, status: r.status, details: body }, { status: r.status });
  }
  const data = await r.json();
  return NextResponse.json(Array.isArray(data) ? data : []);
}
