// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

const ROOT   = 'https://data.cityofnewyork.us/resource';
const LEGALS = `${ROOT}/8h5j-fqxa.json`;  // Real Property Legals: contains borough/block/lot -> document_id
const MASTER = `${ROOT}/bnx9-e6tj.json`;  // Real Property Master: details by document_id

const APP = process.env.SOCRATA_APP_TOKEN || '';
const baseHeaders: Record<string, string> = { accept: 'application/json' };
if (APP) baseHeaders['X-App-Token'] = APP;

const BORO_NAME: Record<number, string> = {
  1: 'MANHATTAN',
  2: 'BRONX',
  3: 'BROOKLYN',
  4: 'QUEENS',
  5: 'STATEN ISLAND',
};

function esc(str: string) {
  return String(str).replace(/'/g, "''");
}

function parseBBL(bblRaw: string) {
  const b = String(bblRaw).replace(/[^0-9]/g, '');
  if (b.length < 7) return null;
  const borough = Number(b.slice(0, 1));
  const block   = Number(b.slice(1, 6));
  const lot     = Number(b.slice(6));
  if (!borough || !block || !lot) return null;
  return { borough, block, lot };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp  = url.searchParams;

  if (sp.get('ping')) {
    return NextResponse.json({ ok: true, handler: 'acris-app-v3' });
  }

  const limit = sp.get('$limit') || '50';
  const order = sp.get('$order') || 'recorded_datetime DESC';

  // Inputs
  const bblParam = sp.get('bbl') || '';
  const boroughParam = sp.get('borough') || '';
  const blockParam   = sp.get('block') || '';
  const lotParam     = sp.get('lot') || '';

  // Normalize to borough/block/lot
  let borough: number | null = null;
  let block: number | null   = null;
  let lot: number | null     = null;

  if (bblParam) {
    const parsed = parseBBL(bblParam);
    if (!parsed) {
      return NextResponse.json({ error: true, message: 'Invalid bbl' }, { status: 400 });
    }
    borough = parsed.borough; block = parsed.block; lot = parsed.lot;
  } else if (boroughParam && blockParam && lotParam) {
    borough = Number(boroughParam);
    block   = Number(blockParam);
    lot     = Number(lotParam);
  } else {
    return NextResponse.json({ error: true, message: 'Provide ?bbl=########## OR ?borough=&block=&lot=' }, { status: 400 });
  }

  if (!borough || !block || !lot) {
    return NextResponse.json({ error: true, message: 'Missing normalized borough/block/lot' }, { status: 400 });
  }

  // Build Legals WHERE using both numeric code and spelled-out name, to match either form.
  const boroName = BORO_NAME[borough] || '';
  // Some rows have borough as '1', some as 'MANHATTAN'; cover both:
  const boroWhere = `(borough=${borough} OR borough='${esc(String(borough))}'` +
                    (boroName ? ` OR upper(borough)='${esc(boroName)}'` : '') +
                    `)`;

  const whereLegals = `block=${block} AND lot=${lot} AND ${boroWhere}`;

  // Query LEGALS for document_id (use coalesce to handle doc_id/document_id variations defensively)
  const legalsQ = `${LEGALS}?$select=coalesce(document_id, doc_id) as document_id&$where=${encodeURIComponent(whereLegals)}&$limit=5000`;
  const lRes = await fetch(legalsQ, { headers: baseHeaders });
  if (!lRes.ok) {
    const txt = await lRes.text();
    return NextResponse.json({ error: true, step: 'LEGALS', status: lRes.status, details: txt }, { status: lRes.status });
  }
  const legals = (await lRes.json()) as Array<{ document_id: string }>;
  const docIds = Array.isArray(legals) ? legals.map(r => r.document_id).filter(Boolean) : [];

  if (!docIds.length) {
    return NextResponse.json({ debug: [{ step: 'LEGALS', count: 0 }], results: [] });
  }

  // Chunk doc_ids for MASTER calls
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


  return NextResponse.json(out);
}
