// app/api/acris/route.ts
import { NextRequest, NextResponse } from 'next/server';

const SOC_BASE = 'https://data.cityofnewyork.us';
const LEGALS   = '/resource/8h5j-fqxa.json'; // Real Property Legals (document_id by borough/block/lot)
const MASTER   = '/resource/bnx9-e6tj.json'; // Real Property Master (details by document_id or possibly by BBL)
const TOKEN    = process.env.SOCRATA_APP_TOKEN || '';

function socHeaders() {
  const h: Record<string, string> = { accept: 'application/json' };
  if (TOKEN) h['X-App-Token'] = TOKEN;
  return h;
}

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function parseParams(url: URL) {
  const q = url.searchParams;
  let borough = (q.get('borough') || '').trim();
  let block   = (q.get('block') || '').trim();
  let lot     = (q.get('lot') || '').trim();
  const bblRaw = (q.get('bbl') || '').replace(/\D/g, '');

  if (bblRaw && (!borough || !block || !lot)) {
    if (bblRaw.length < 8) throw new Error('BBL must be at least 8 digits');
    borough = bblRaw.slice(0, 1);
    block   = String(Number(bblRaw.slice(1, 6))); // strip leading zeros
    lot     = String(Number(bblRaw.slice(6)));
  }
  const limit = String(Number((q.get('$limit') || '25')) || 25);
  const order = q.get('$order') || 'recorded_datetime DESC';
  return { borough, block, lot, limit, order };
}

async function fetchJSON(url: URL) {
  const res = await fetch(url.toString(), { headers: socHeaders() });
  if (!res.ok) throw new Error(`${url.pathname} ${res.status}`);
  return res.json();
}

export const dynamic = 'force-dynamic'; // always hit live data

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q   = url.searchParams;

    // health check
    if (q.get('ping') === '1') {
      return json({ ok: true, handler: 'acris-app-v3' });
    }

    const { borough, block, lot, limit, order } = parseParams(url);
    if (!borough || !block || !lot) return json({ error: true, message: 'Missing borough, block, or lot' }, 400);

    const DEBUG = q.get('debug') === '1';
    const tried: any[] = [];

    const out: any[] = [];

    // STRATEGY #1 — LEGALS → MASTER (document_id join)
    try {
      const leg = new URL(SOC_BASE + LEGALS);
      leg.searchParams.set('$select', 'document_id');
      leg.searchParams.set('$where', `borough='${borough}' AND block='${block}' AND lot='${lot}'`);
      leg.searchParams.set('$limit', '5000');

      const legRows: { document_id: string }[] = await fetchJSON(leg);
      tried.push({ step: 'LEGALS', url: leg.toString(), count: Array.isArray(legRows) ? legRows.length : 0 });

      if (Array.isArray(legRows) && legRows.length) {
        const ids = legRows.map(r => r.document_id).filter(Boolean);
        const chunkSize = 75;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize)
            .map(id => `'${String(id).replace(/'/g, "''")}'`)
            .join(',');
          const m = new URL(SOC_BASE + MASTER);
          m.searchParams.set('$select', 'recorded_datetime, doc_type, consideration_amount, document_id');
          m.searchParams.set('$where', `document_id IN (${chunk})`);
          m.searchParams.set('$order', order);
          m.searchParams.set('$limit', limit);

          const rows = await fetchJSON(m);
          tried.push({ step: 'MASTER_by_doc_ids', url: m.toString(), count: Array.isArray(rows) ? rows.length : 0 });
          if (Array.isArray(rows) && rows.length) out.push(...rows);
        }
      }
    } catch (e: any) {
      tried.push({ step: 'LEGALS_or_MASTER_error', error: e.message || String(e) });
    }

    // STRATEGY #2 — DIRECT MASTER by fields (some mirrors expose borough/block/lot)
    if (!out.length) {
      try {
        const m2 = new URL(SOC_BASE + MASTER);
        m2.searchParams.set('$select', 'recorded_datetime, doc_type, consideration_amount, document_id, borough, block, lot');
        m2.searchParams.set('$where', `borough='${borough}' AND block='${block}' AND lot='${lot}'`);
        m2.searchParams.set('$order', order);
        m2.searchParams.set('$limit', limit);

        const rows2 = await fetchJSON(m2);
        tried.push({ step: 'MASTER_by_fields', url: m2.toString(), count: Array.isArray(rows2) ? rows2.length : 0 });
        if (Array.isArray(rows2) && rows2.length) out.push(...rows2);
      } catch (e: any) {
        tried.push({ step: 'MASTER_by_fields_error', error: e.message || String(e) });
      }
    }

    // STRATEGY #3 — DIRECT MASTER by BBL (if that column exists on this view)
    if (!out.length) {
      try {
        const bblNum = `${borough}${String(block).padStart(5, '0')}${String(lot).padStart(4, '0')}`;
        const m3 = new URL(SOC_BASE + MASTER);
        m3.searchParams.set('$select', 'recorded_datetime, doc_type, consideration_amount, document_id, bbl');
        m3.searchParams.set('$where', `bbl='${bblNum}'`);
        m3.searchParams.set('$order', order);
        m3.searchParams.set('$limit', limit);

        const rows3 = await fetchJSON(m3);
        tried.push({ step: 'MASTER_by_bbl', url: m3.toString(), count: Array.isArray(rows3) ? rows3.length : 0 });
        if (Array.isArray(rows3) && rows3.length) out.push(...rows3);
      } catch (e: any) {
        tried.push({ step: 'MASTER_by_bbl_error', error: e.message || String(e) });
      }
    }

    // Final sort and uniquify
    out.sort((a, b) => String(b.recorded_datetime || '').localeCompare(String(a.recorded_datetime || '')));

    if (DEBUG) return json({ debug: tried, results: out });

    return json(out);
  } catch (err: any) {
    return json({ error: true, message: err.message || String(err) }, 400);
  }
}
