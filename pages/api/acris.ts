// pages/api/acris.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const BASE   = 'https://data.cityofnewyork.us';
const LEGALS = '/resource/8h5j-fqxa.json'; // borough, block, lot -> document_id
const MASTER = '/resource/bnx9-e6tj.json'; // details by document_id
const TOKEN  = process.env.SOCRATA_APP_TOKEN || '';

function headers() {
  const h: Record<string, string> = { accept: 'application/json' };
  if (TOKEN) h['X-App-Token'] = TOKEN;
  return h;
}

function parseParams(q: any) {
  let borough = String(q.borough || '').trim();
  let block   = String(q.block || '').trim();
  let lot     = String(q.lot || '').trim();

  const bblRaw = String(q.bbl || '').replace(/\D/g, '');
  if (bblRaw && (!borough || !block || !lot)) {
    if (bblRaw.length < 8) throw new Error('BBL must be at least 8 digits');
    borough = bblRaw.slice(0, 1);
    block   = String(Number(bblRaw.slice(1, 6))); // strip leading zeros
    lot     = String(Number(bblRaw.slice(6)));
  }
  if (!borough || !block || !lot) throw new Error('Missing borough, block, or lot');
  return { borough, block, lot };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = req.query;

    // Health check
    if (q.ping === '1') return res.status(200).json({ ok: true, handler: 'acris-v2' });

    const { borough, block, lot } = parseParams(q);

    // STEP 1: find document_ids in LEGALS for the given BBL
    const legUrl = new URL(BASE + LEGALS);
    legUrl.searchParams.set('$select', 'document_id');
    legUrl.searchParams.set('$where', `borough='${borough}' AND block='${block}' AND lot='${lot}'`);
    legUrl.searchParams.set('$limit', '5000');

    const legResp = await fetch(legUrl.toString(), { headers: headers() });
    if (!legResp.ok) throw new Error(`LEGALS ${legResp.status}`);
    const legRows: { document_id: string }[] = await legResp.json();
    if (!Array.isArray(legRows) || !legRows.length) return res.status(200).json([]);

    const ids = legRows.map(r => r.document_id).filter(Boolean);

    // STEP 2: fetch details from MASTER using IN (...) — chunk to keep URLs safe
    const out: any[] = [];
    const chunkSize = 75;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
        .map(id => `'${String(id).replace(/'/g, "''")}'`)
        .join(',');

      const mUrl = new URL(BASE + MASTER);
      mUrl.searchParams.set('$select', 'recorded_datetime, doc_type, consideration_amount, document_id');
      mUrl.searchParams.set('$where', `document_id IN (${chunk})`);
      mUrl.searchParams.set('$order', String(q.$order || 'recorded_datetime DESC'));
      mUrl.searchParams.set('$limit', String(q.$limit || '25'));

      const mResp = await fetch(mUrl.toString(), { headers: headers() });
      if (!mResp.ok) throw new Error(`MASTER ${mResp.status}`);
      out.push(...await mResp.json());
    }

    // Final sort (in case chunking shuffled order)
    out.sort((a, b) => String(b.recorded_datetime || '').localeCompare(String(a.recorded_datetime || '')));
    return res.status(200).json(out);
  } catch (err: any) {
    return res.status(400).json({ error: true, message: err.message || String(err) });
  }
}
