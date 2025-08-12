// app/api/acris/route.ts
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const SOCRATA_DOMAIN = 'https://data.cityofnewyork.us';
const DS_LEGALS = '8h5j-fqxa';   // ACRIS Legals (has borough/block/lot)
const DS_MASTER = 'bnx9-e6tj';   // ACRIS Master (join by document_id)

async function soql(dataset: string, params: Record<string, string>, token?: string) {
  const url = `${SOCRATA_DOMAIN}/resource/${dataset}.json?${new URLSearchParams(params)}`;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers['X-App-Token'] = token;
  const r = await fetch(url, { headers, // helpful cache
    next: { revalidate: 60 }
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`${dataset} ${r.status}`); }
  if (!r.ok) throw new Error(`${dataset} ${r.status} ${text}`);
  return json;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get('ping')) {
    return Response.json({ ok: true, handler: 'acris-app-v6' });
  }

  const token = process.env.SOCRATA_APP_TOKEN || undefined;

  // Accept either BBL or borough/block/lot
  const bblRaw = u.searchParams.get('bbl')?.replace(/\D/g, '') || '';
  let borough = Number(u.searchParams.get('borough'));
  let block   = Number(u.searchParams.get('block'));
  let lot     = Number(u.searchParams.get('lot'));

  if (!borough && !block && !lot && bblRaw.length >= 8) {
    borough = Number(bblRaw.slice(0, 1));
    block   = Number(bblRaw.slice(1, 6));
    lot     = Number(bblRaw.slice(6));
  }

  const limit = Math.min(Number(u.searchParams.get('$limit') || '25'), 100);
  const debug: any[] = [];

  if (!Number.isFinite(borough) || !Number.isFinite(block) || !Number.isFinite(lot)) {
    return Response.json({ error:true, message:'Missing or invalid borough/block/lot' }, { status: 400 });
  }

  try {
    // --- 1) LEGALS → get document_id list (NUMERIC filters only) ---
    const whereLegals = `borough=${borough} AND block=${block} AND lot=${lot}`;
    const legals = await soql(DS_LEGALS, {
      '$select': 'document_id',
      '$where':  whereLegals,
      '$limit':  '5000'
    }, token);

    const docIds = [...new Set((legals as any[]).map(r => r.document_id).filter(Boolean))];
    debug.push({ step: 'LEGALS', where: whereLegals, count: docIds.length });

    if (!docIds.length) {
      return Response.json({ debug, results: [] }); // nothing for that BBL
    }

    // --- 2) MASTER → by document_id IN (…) ---
    const inList = docIds.slice(0, 1000).map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
    const whereMaster = `document_id in (${inList})`;

    const master = await soql(DS_MASTER, {
      '$where': whereMaster,
      '$order': 'recorded_datetime DESC',
      '$limit': String(limit)
    }, token);

    debug.push({ step: 'MASTER', where: whereMaster, returned: Array.isArray(master) ? master.length : 0 });
    return Response.json({ debug, results: master || [] });

  } catch (e: any) {
    debug.push({ step: 'ERROR', message: e.message || String(e) });
    return Response.json({ error:true, debug }, { status: 500 });
  }
}
