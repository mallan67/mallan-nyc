// app/api/acris/route.ts (App Router)
import { NextRequest, NextResponse } from 'next/server';

const ROOT   = 'https://data.cityofnewyork.us/resource';
const LEGALS = `${ROOT}/8h5j-fqxa.json`;  // Real Property Legals (BBL -> document_id)
const MASTER = `${ROOT}/bnx9-e6tj.json`;  // Real Property Master (filings by document_id)

const APP = process.env.SOCRATA_APP_TOKEN || '';
const baseHeaders: Record<string, string> = { accept: 'application/json' };
if (APP) baseHeaders['X-App-Token'] = APP;

function esc(str: string) {
  return String(str).replace(/'/g, "''");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp  = url.searchParams;

  if (sp.get('ping')) {
    return NextResponse.json({ ok: true, handler: 'acris-app-v3' });
  }

  const limit = sp.get('$limit') || '50';
  const order = sp.get('$order') || 'recorded_datetime DESC';

  const bblRaw  = (sp.get('bbl') || '').replace(/[^0-9]/g, '');
  const borough = sp.get('borough') || '';
  const block   = sp.get('block')   || '';
  const lot     = sp.get('lot')     || '';

  // Step 1: find document_ids in LEGALS by BBL or borough/block/lot
  let where = '';
  if (bblRaw && bblRaw.length >= 7) {
    where = `bbl='${esc(bblRaw)}'`;
  } else if (borough && block && lot) {
    // In 8h5j-fqxa, borough is text, block/lot are numeric.
    where = `borough='${esc(borough)}' AND block=${Number(block)} AND lot=${Number(lot)}`;
  } else {
    return NextResponse.json({ error: true, message: 'Provide ?bbl=########## OR ?borough=&block=&lot=' }, { status: 400 });
  }

  // Pull up to 5k doc ids from Legals
  const legalsQ = `${LEGALS}?$select=document_id&$where=${encodeURIComponent(where)}&$limit=5000`;
  const lRes = await fetch(legalsQ, { headers: baseHeaders });
  if (!lRes.ok) {
    const txt = await lRes.text();
    return NextResponse.json({ error: true, step: 'LEGALS', status: lRes.status, details: txt }, { status: lRes.status });
  }
  const legals = (await lRes.json()) as Array<{ document_id: string }>;
  const docIds = (Array.isArray(legals) ? legals.map(r => r.document_id).filter(Boolean) : []);

  if (!docIds.length) {
    return NextResponse.json({ debug: [{ step: 'LEGALS', count: 0 }], results: [] });
  }

  // Step 2: fetch filings in MASTER for those document_ids (chunked)
  const chunks: string[][] = [];
  for (let i = 0; i < docIds.length; i += 50) chunks.push(docIds.slice(i, i + 50));

  const out: any[] = [];
  for (const chunk of chunks) {
    const whereMaster = `document_id in(${chunk.map(id => `'${esc(id)}'`).join(',')})`;
    const q = `${MASTER}?$select=document_id,recorded_datetime,document_type,doc_type,document_amount,party1,party2,property_type,percent_transferred,document_date&$where=${encodeURIComponent(whereMaster)}&$order=${encodeURIComponent(order)}&$limit=${encodeURIComponent(limit)}`;
    const mRes = await fetch(q, { headers: baseHeaders });
    if (!mRes.ok) {
      const txt = await mRes.text();
      return NextResponse.json({ error: true, step: 'MASTER', status: mRes.status, details: txt }, { status: mRes.status });
    }
    const rows = await mRes.json();
    if (Array.isArray(rows)) out.push(...rows);
  }

  return NextResponse.json(out);
}
