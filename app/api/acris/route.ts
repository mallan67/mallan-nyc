import { NextRequest, NextResponse } from 'next/server';
const DATASET_URL = 'https://data.cityofnewyork.us/resource/bnx9-e6tj.json';

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  // quick ping so we can prove this file is serving
  if (sp.get('ping') === '1') {
    return NextResponse.json({ ok: true, handler: 'v3' }, { headers: { 'x-acris-handler': 'v3' } });
  }

  const borough = sp.get('borough') ?? sp.get('b') ?? sp.get('boro') ?? '';
  const block   = sp.get('block')   ?? sp.get('bl') ?? '';
  const lot     = sp.get('lot')     ?? sp.get('lt') ?? '';

  if (!borough || !block || !lot) {
    return NextResponse.json({ error: true, message: 'Missing borough, block, or lot' }, { status: 400, headers: { 'x-acris-handler': 'v3' } });
  }

  const qs = new URLSearchParams();
  qs.set('borough', borough); qs.set('block', block); qs.set('lot', lot);
  for (const k of ['$limit', '$order', '$select', '$offset', '$where']) {
    const v = sp.get(k); if (v) qs.set(k, v);
  }
  if (!qs.has('$limit')) qs.set('$limit', '50');
  if (!qs.has('$order')) qs.set('$order', 'recorded_datetime DESC');

  const headers: Record<string,string> = { Accept: 'application/json' };
  const token = process.env.SOCRATA_APP_TOKEN; if (token) headers['X-App-Token'] = token;

  const r = await fetch(`${DATASET_URL}?${qs.toString()}`, { headers, cache: 'no-store' });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-acris-handler': 'v3' },
  });
}
