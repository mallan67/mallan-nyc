// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

const SOC_BASE = 'https://data.cityofnewyork.us/resource';
const LEGALS_DS = '8h5j-fqxa.json';     // ACRIS Real Property Legals (document_id lookup)
const MASTER_DS = 'bnx9-e6tj.json';     // ACRIS Master (filings)
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || '';

type Q = Record<string, string | number>;

function qs(q: Q) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) sp.set(k, String(v));
  return sp.toString();
}

async function socrataFetch(path: string, params: Q, abort?: AbortSignal) {
  const url = `${SOC_BASE}/${path}?${qs(params)}`;
  const res = await fetch(url, {
    headers: APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {},
    signal: abort,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`Socrata ${res.status}`), { status: res.status, details: text });
  }
  return res.json();
}

function parseBBL(bblRaw?: string | null) {
  const bbl = String(bblRaw || '').replace(/[^0-9]/g, '');
  if (bbl.length < 7) return null;
  const borough = Number(bbl.slice(0, 1));
  const block = Number(bbl.slice(1, 6));
  const lot = Number(bbl.slice(6));
  if (!borough || !block || !lot) return null;
  return { borough, block, lot };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // quick health
  if (searchParams.get('ping')) {
    return NextResponse.json({ ok: true, handler: 'acris-app-v5' });
  }

  // accept either bbl or borough+block+lot
  let borough = Number(searchParams.get('borough') || 0) || undefined;
  let block   = Number(searchParams.get('block') || 0)   || undefined;
  let lot     = Number(searchParams.get('lot') || 0)     || undefined;

  const bblParam = searchParams.get('bbl');
  if (!borough || !block || !lot) {
    const parsed = parseBBL(bblParam);
    if (parsed) ({ borough, block, lot } = parsed);
  }

  const limit = Math.min(Number(searchParams.get('$limit') || '25'), 1000);
  const debug = searchParams.get('debug') ? true : false;
  const debugLog: any[] = [];

  if (!borough || !block || !lot) {
    return NextResponse.json({ error: true, message: 'Missing borough, block, or lot' }, { status: 400 });
  }

  // Build where clauses that DON’T use upper()/casts to avoid type errors.
  // We try both numeric and string matches (and zero-padded forms) safely.
  const bStr = String(borough);
  const blkStr = String(block);
  const blkPad = blkStr.padStart(5, '0');
  const lotStr = String(lot);
  const lotPad = lotStr.padStart(4, '0');

  // for LEGALS (boring + block + lot). The dataset often keeps them as numbers.
  const whereLegals =
    `(borough = ${borough} OR borough = '${bStr}') AND ` +
    `(block = ${block} OR block = '${blkStr}' OR block = '${blkPad}') AND ` +
    `(lot = ${lot} OR lot = '${lotStr}' OR lot = '${lotPad}')`;

  // 1) LEGALS: get document_id list for this BBL
  let docIds: string[] = [];
  try {
    const legalRows: any[] = await socrataFetch(LEGALS_DS, {
      '$select': 'document_id',
      '$where': whereLegals,
      '$limit': 5000,
    }, req.signal);

    docIds = (legalRows || [])
      .map((r: any) => r?.document_id)
      .filter(Boolean);

    debug && debugLog.push({ step: 'LEGALS', where: whereLegals, count: docIds.length });
  } catch (err: any) {
    debug && debugLog.push({ step: 'LEGALS_ERROR', where: whereLegals, status: err?.status, details: err?.details });
  }

  // 2) If we have docIds, pull from MASTER by those IDs (most accurate).
  if (docIds.length) {
    const chunk = 1000;
    const all: any[] = [];
    for (let i = 0; i < docIds.length; i += chunk) {
      const slice = docIds.slice(i, i + chunk)
        .map((d) => `'${String(d).replace(/'/g, "''")}'`)
        .join(',');
      const whereMaster = `document_id in (${slice})`;
      try {
        const rows: any[] = await socrataFetch(MASTER_DS, {
          '$where': whereMaster,
          '$order': 'recorded_datetime DESC',
          '$limit': limit,
        }, req.signal);
        debug && debugLog.push({ step: 'MASTER_BY_DOCIDS', batch: rows.length });
        all.push(...rows);
        if (all.length >= limit) break;
      } catch (err: any) {
        debug && debugLog.push({ step: 'MASTER_BY_DOCIDS_ERROR', status: err?.status, details: err?.details });
      }
    }
    const out = all.slice(0, limit);
    return NextResponse.json(debug ? { debug: debugLog, results: out } : out);
  }

  // 3) Fallback: direct MASTER filter by borough/block/lot (numeric OR string).
  const whereMasterDirect =
    `(borough = ${borough} OR borough = '${bStr}') AND ` +
    `(block = ${block} OR block = '${blkStr}' OR block = '${blkPad}') AND ` +
    `(lot = ${lot} OR lot = '${lotStr}' OR lot = '${lotPad}')`;

  try {
    const rows: any[] = await socrataFetch(MASTER_DS, {
      '$where': whereMasterDirect,
      '$order': 'recorded_datetime DESC',
      '$limit': limit,
    }, req.signal);
    debug && debugLog.push({ step: 'MASTER_DIRECT', where: whereMasterDirect, count: rows.length });
    return NextResponse.json(debug ? { debug: debugLog, results: rows } : rows);
  } catch (err: any) {
    debug && debugLog.push({ step: 'MASTER_DIRECT_ERROR', where: whereMasterDirect, status: err?.status, details: err?.details });
    return NextResponse.json({ error: true, debug: debugLog }, { status: 500 });
  }
}
