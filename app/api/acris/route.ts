// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

const ROOT   = 'https://data.cityofnewyork.us/resource';
const LEGALS = `${ROOT}/8h5j-fqxa.json`;  // Real Property Legals (parcel -> document_id)
const MASTER = `${ROOT}/bnx9-e6tj.json`;  // Real Property Master (details by document_id)

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

function esc(str: string) { return String(str).replace(/'/g, "''"); }

function parseBBL(bblRaw: string) {
  const b = String(bblRaw).replace(/[^0-9]/g, '');
  if (b.length < 7) return null;
  const borough = Number(b.slice(0, 1));
  const block   = Number(b.slice(1, 6));
  const lot     = Number(b.slice(6));
  if (!borough || !block || !lot) return null;
  return { borough, block, lot };
}

function zeroPad(n: number, len: number) {
  return String(n).padStart(len, '0');
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp  = url.searchParams;

  // Health check
  if (sp.get('ping')) {
    return NextResponse.json({ ok: true, handler: 'acris-app-v3' });
  }

  const debugMode = sp.get('debug') === '1';
  const $limit = sp.get('$limit') || '50';
  const $order = sp.get('$order') || 'recorded_datetime DESC';

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

  const boroName = BORO_NAME[borough] || '';
  const boroClause = `(
    borough = ${borough}
    OR borough = '${esc(String(borough))}'
    ${boroName ? `OR upper(borough) = '${esc(boroName)}'` : ''}
  )`;

  // Try several WHERE variants to handle data typing differences
  const blkStr = String(block);
  const lotStr = String(lot);
  const blkPad = zeroPad(block, 5);
  const lotPad = zeroPad(lot, 4);

  const whereVariants = [
    // numeric casts (most robust if supported)
    `${boroClause} AND block::number = ${block} AND lot::number = ${lot}`,
    // plain strings
    `${boroClause} AND block = '${esc(blkStr)}' AND lot = '${esc(lotStr)}'`,
    // zero-padded strings
    `${boroClause} AND block = '${esc(blkPad)}' AND lot = '${esc(lotPad)}'`,
    // mixed fallback ORs
    `${boroClause} AND (block = '${esc(blkStr)}' OR block = '${esc(blkPad)}') AND (lot = '${esc(lotStr)}' OR lot='${esc(lotPad)}')`,
  ];

  const debug: any[] = [];
  let docIds: string[] = [];

  // Query LEGALS for document_id with fallbacks
  for (const whereLegals of whereVariants) {
    const q = `${LEGALS}?$select=document_id&$where=${encodeURIComponent(whereLegals)}&$limit=5000`;
    let ok = false, count = 0, status = 0, errText = '';
    try {
      const r = await fetch(q, { headers: baseHeaders });
      status = r.status;
      if (!r.ok) { errText = await r.text(); }
      else {
        const rows = await r.json() as Array<{ document_id: string }>;
        docIds = Array.isArray(rows) ? rows.map(r => r.document_id).filter(Boolean) : [];
        count = docIds.length;
        ok = true;
      }
    } catch (e: any) {
      errText = e.message || String(e);
    }
    debug.push({ step: 'LEGALS_TRY', where: whereLegals, status, count, error: errText || undefined });
    if (ok && docIds.length) break;
  }

  if (!docIds.length) {
    const body = { debug: [{ step: 'LEGALS', tried: debug }], results: [] };
    return NextResponse.json(body);
  }

  // Fetch MASTER details in chunks
  const out: any[] = [];
  for (let i = 0; i < docIds.length; i += 50) {
    const chunk = docIds.slice(i, i + 50);
    const whereMaster = `document_id in(${chunk.map(id => `'${esc(id)}'`).join(',')})`;
    const q = `${MASTER}?$select=document_id,recorded_datetime,document_type,doc_type,document_amount,party1,party2,property_type,percent_transferred,document_date&$where=${encodeURIComponent(whereMaster)}&$order=${encodeURIComponent($order)}&$limit=${encodeURIComponent($limit)}`;
    const mRes = await fetch(q, { headers: baseHeaders });
    if (!mRes.ok) {
      const txt = await mRes.text();
      // continue instead of hard-failing; include error in debug
      debug.push({ step: 'MASTER_ERR', status: mRes.status, details: txt });
      continue;
    }
    const rows = await mRes.json();
    if (Array.isArray(rows)) out.push(...rows);
  }

  if (debugMode) {
    return NextResponse.json({ debug, results: out });
  }
  return NextResponse.json(out);
}


  return NextResponse.json(out);
}
