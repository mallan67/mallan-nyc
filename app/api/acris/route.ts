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

function esc(s: string) { return s.replace(/'/g, "''"); }
function zeroPad(n: number, len: number) { return String(n).padStart(len, '0'); }
function parseBBL(raw: string) {
  const b = raw.replace(/[^0-9]/g, '');
  if (b.length < 7) return null;
  const borough = Number(b.slice(0,1));
  const block   = Number(b.slice(1,6));
  const lot     = Number(b.slice(6));
  if (!borough || !block || !lot) return null;
  return { borough, block, lot };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp  = url.searchParams;

  if (sp.get('ping')) {
    return NextResponse.json({ ok: true, handler: 'acris-app-v4' });
  }

  const debugMode = sp.get('debug') === '1';
  const $limit = sp.get('$limit') || '50';
  const $order = sp.get('$order') || 'recorded_datetime DESC';

  // normalize inputs
  const bblParam = sp.get('bbl') || '';
  let borough = 0, block = 0, lot = 0;

  if (bblParam) {
    const parsed = parseBBL(bblParam);
    if (!parsed) return NextResponse.json({ error: true, message: 'Invalid bbl' }, { status: 400 });
    ({ borough, block, lot } = parsed);
  } else {
    borough = Number(sp.get('borough') || 0);
    block   = Number(sp.get('block') || 0);
    lot     = Number(sp.get('lot') || 0);
  }
  if (!borough || !block || !lot) {
    return NextResponse.json({ error: true, message: 'Provide ?bbl=########## OR ?borough=&block=&lot=' }, { status: 400 });
  }

  const boroName = BORO_NAME[borough] || '';
  const boroClause = `(
    borough = ${borough}
    OR borough = '${esc(String(borough))}'
    ${boroName ? `OR upper(borough) = '${esc(boroName)}'` : ''}
  )`;

  const blkStr = String(block);
  const lotStr = String(lot);
  const blkPad = zeroPad(block, 5);
  const lotPad = zeroPad(lot, 4);

  const whereVariants = [
    `${boroClause} AND block::number = ${block} AND lot::number = ${lot}`,
    `${boroClause} AND block = '${esc(blkStr)}' AND lot = '${esc(lotStr)}'`,
    `${boroClause} AND block = '${esc(blkPad)}' AND lot = '${esc(lotPad)}'`,
    `${boroClause} AND (block = '${esc(blkStr)}' OR block = '${esc(blkPad)}') AND (lot = '${esc(lotStr)}' OR lot='${esc(lotPad)}')`,
  ];

  const debug: any[] = [];
  let docIds: string[] = [];

  // Get document ids from LEGALS with fallbacks
  for (const whereLegals of whereVariants) {
    const q = `${LEGALS}?$select=document_id&$where=${encodeURIComponent(whereLegals)}&$limit=5000`;
    let status = 0, count = 0, errText = '';
    try {
      const r = await fetch(q, { headers: baseHeaders });
      status = r.status;
      if (!r.ok) {
        errText = await r.text();
      } else {
        const rows = await r.json() as Array<{ document_id: string }>;
        docIds = Array.isArray(rows) ? rows.map(x => x.document_id).filter(Boolean) : [];
        count = docIds.length;
      }
    } catch (e: any) {
      errText = e.message || String(e);
    }
    debug.push({ step: 'LEGALS_TRY', where: whereLegals, status, count, error: errText || undefined });
    if (docIds.length) break;
  }

  if (!docIds.length) {
    const body = { debug, results: [] };
    return NextResponse.json(body);
  }

  // Hydrate details from MASTER
  const out: any[] = [];
  for (let i = 0; i < docIds.length; i += 50) {
    const chunk = docIds.slice(i, i + 50);
    const whereMaster = `document_id in(${chunk.map(id => `'${esc(id)}'`).join(',')})`;
    const q = `${MASTER}?$select=document_id,recorded_datetime,document_type,doc_type,document_amount,party1,party2,property_type,percent_transferred,document_date&$where=${encodeURIComponent(whereMaster)}&$order=${encodeURIComponent($order)}&$limit=${encodeURIComponent($limit)}`;
    const r = await fetch(q, { headers: baseHeaders });
    if (!r.ok) {
      const txt = await r.text();
      debug.push({ step: 'MASTER_ERR', status: r.status, details: txt });
      continue;
    }
    const rows = await r.json();
    if (Array.isArray(rows)) out.push(...rows);
  }

  return NextResponse.json(debugMode ? { debug, results: out } : out);
}
