// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BASE   = 'https://data.cityofnewyork.us';
const LEGALS = '/resource/8h5j-fqxa.json'; // borough,block,lot -> document_id
const MASTER = '/resource/bnx9-e6tj.json'; // details by document_id
const TOKEN  = process.env.SOCRATA_APP_TOKEN || '';

function headers() {
  const h: Record<string, string> = { accept: 'application/json' };
  if (TOKEN) h['X-App-Token'] = TOKEN;
  return h;
}

function parseParams(url: URL) {
  const q = url.searchParams;
  let borough = (q.get('borough') || '').trim();
  let block   = (q.get('block') || '').trim();
  let lot     = (q.get('lot') || '').trim();

  // Allow BBL shorthand (e.g. 1013360066)
  const bblRaw = (q.get('bbl') || '').replace(/\D/g, '');
  if (bblRaw && (!borough || !block || !lot)) {
    if (bblRaw.length < 8) throw new Error('BBL must be at least 8 digits');
    borough = bblRaw.slice(0, 1);
    block   = String(Number(bblRaw.slice(1, 6))); // strip leading zeros
    lot     = String(Number(bblRaw.slice(6)));
  }
  if (!borough || !block || !lot) throw new Error('Missing borough, block, or lot');
  return { borough, block, lot };
}

export const dynamic = 'force-dynamic'; // do not cache; always hit NYC Open Data

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams;

    // Health check
    if (q.get('ping') === '1') {
      return NextResponse.json({ ok: true, handler: 'acris-app-v2' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { borough, block, lot } = parseParams(url);

    // 1) find matching document_ids from LEGALS
    const legUrl = new URL(BASE + LEGALS);
    legUrl.searchParams.set('$select', 'document_id');
    legUrl.searchParams.set('$where', `borough='${borough}' AND block='${block}' AND lot='${lot}'`);
    legUrl.searchParams.set('$limit', '5000');

    const legResp = await fetch(legUrl.toString(), { headers: headers() });
    if (!legResp.ok) throw new Error(`LEGALS ${legResp.status}`);
    const legRows: { document_id: string }[] = await legResp.json();
    if (!Array.isArray(legRows) || !legRows.length) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
    }
    const ids = legRows.map(r => r.document_id).filter(Boolean);

    // 2) pull the master rows by document_id in chunks
    const out: any[] = [];
    const chunkSize = 75;
    const order = q.get('$order') || 'recorded_datetime DESC';
    const limit = Number(q.get('$limit') || '25');

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
        .map(id => `'${String(id).replace(/'/g, "''")}'`)
        .join(',');

      const mUrl = new URL(BASE + MASTER);
      mUrl.searchParams.set('$select', 'recorded_datetime, doc_type, consideration_amount, document_id');
      mUrl.searchParams.set('$where', `document_id IN (${chunk})`);
      mUrl.searchParams.set('$order', order);
      mUrl.searchParams.set('$limit', String(limit));

      const mResp = await fetch(mUrl.toString(), { headers: headers() });
      if (!mResp.ok) throw new Error(`MASTER ${mResp.status}`);
      out.push(...await mResp.json());
    }

    // Final sort by recorded date desc
    out.sort((a, b) => String(b.recorded_datetime || '').localeCompare(String(a.recorded_datetime || '')));
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err: any) {
    return NextResponse.json({ error: true, message: err.message || String(err) }, { status: 400 });
  }
}
