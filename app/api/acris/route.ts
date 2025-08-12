// app/api/acris/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // keep Node runtime for clean server fetch

// NYC Open Data datasets
const DS_LEGALS = '8h5j-fqxa';  // ACRIS Real Property Legals
const DS_MASTER = 'bnx9-e6tj';  // ACRIS Real Property Master

const BASE = 'https://data.cityofnewyork.us/resource';

function n(v: any) {
  const x = Number(String(v || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(x) ? x : undefined;
}

function parseBBL(bblRaw?: string) {
  if (!bblRaw) return {};
  const s = String(bblRaw).replace(/[^0-9]/g, '');
  if (s.length < 7) return {};
  const borough = n(s.slice(0, 1));
  const block   = n(s.slice(1, 6));
  const lot     = n(s.slice(6));
  return { borough, block, lot };
}

async function soql(dataset: string, params: Record<string, string>, token?: string) {
  const url = new URL(`${BASE}/${dataset}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers['X-App-Token'] = token;
  const r = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`/${dataset}.json ${r.status} ${text || ''}`.trim());
  }
  return r.json();
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const token = process.env.SOCRATA_APP_TOKEN || undefined;

  // Health check
  if (u.searchParams.get('ping')) {
    return Response.json({ ok: true, handler: 'acris-app-v7' });
  }

  // Inputs
  const limit = String(n(u.searchParams.get('$limit')) || 25);
  const debugFlag = u.searchParams.get('debug');
  const debug: any[] = [];

  // Accept either BBL… or borough+block+lot
  let borough = n(u.searchParams.get('borough'));
  let block   = n(u.searchParams.get('block'));
  let lot     = n(u.searchParams.get('lot'));

  if (!borough || !block || !lot) {
    const fromBBL = parseBBL(u.searchParams.get('bbl') || undefined);
    borough = borough || (fromBBL as any).borough;
    block   = block   || (fromBBL as any).block;
    lot     = lot     || (fromBBL as any).lot;
  }

  if (!borough || !block || !lot) {
    return Response.json(
      { error: true, message: 'Missing borough, block, or lot' },
      { status: 400 }
    );
  }

  // 1) LEGALS → get document_id list for this BBL (numeric SoQL)
  const whereN = `borough=${borough} AND block=${block} AND lot=${lot}`;
  let docIds: string[] = [];
  try {
    const legals = await soql(DS_LEGALS, {
      '$select': 'document_id',
      '$where' : whereN,
      '$limit' : '5000'
    }, token);

    const count = Array.isArray(legals) ? legals.length : 0;
    debug.push({ step: 'LEGALS', where: whereN, count });

    if (count) {
      docIds = [...new Set(legals.map((r: any) => String(r.document_id).trim()).filter(Boolean))];
    }
  } catch (e: any) {
    debug.push({ step: 'LEGALS_ERROR', where: whereN, error: e.message || String(e) });
  }

  // 2) If we found document_ids in LEGALS → query MASTER by those ids
  if (docIds.length) {
    // conservative cap to keep query small
    const ids = docIds.slice(0, 500).map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const whereMaster = `document_id IN (${ids})`;
    try {
      const master = await soql(DS_MASTER, {
        '$where': whereMaster,
        '$order': 'recorded_datetime DESC',
        '$limit': limit
      }, token);
      debug.push({ step: 'MASTER_BY_DOCUMENT_ID', returned: Array.isArray(master) ? master.length : 0 });
      return Response.json(debugFlag ? { debug, results: master } : master);
    } catch (e: any) {
      debug.push({ step: 'MASTER_BY_DOCUMENT_ID_ERROR', where: whereMaster, error: e.message || String(e) });
    }
  }

  // 3) Fallback: MASTER by numeric BBL (covers co-ops / legals gaps)
  try {
    const masterFallback = await soql(DS_MASTER, {
      '$where': whereN,
      '$order': 'recorded_datetime DESC',
      '$limit': limit
    }, token);
    debug.push({ step: 'MASTER_FALLBACK_BY_BBL', where: whereN, returned: Array.isArray(masterFallback) ? masterFallback.length : 0 });
    return Response.json(debugFlag ? { debug, results: masterFallback } : masterFallback);
  } catch (e: any) {
    debug.push({ step: 'MASTER_FALLBACK_ERROR', where: whereN, error: e.message || String(e) });
    return Response.json({ error: true, debug }, { status: 500 });
  }
}
