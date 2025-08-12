// pages/api/acris.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const BASE = 'https://data.cityofnewyork.us';
const LEGALS = '/resource/8h5j-fqxa.json'; // has borough, block, lot -> document_id
const MASTER = '/resource/bnx9-e6tj.json'; // details by document_id
const TOKEN = process.env.SOCRATA_APP_TOKEN || '';

function headers() {
  const h: Record<string, string> = { accept: 'application/json' };
  if (TOKEN) h['X-App-Token'] = TOKEN;
  return h;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = req.query;

    // Health check
    if (q.ping === '1') return res.status(200).json({ ok: true, handler: 'acris-v2' });

    // Accept either bbl or borough+block+lot
    const bblRaw = String(q.bbl || '').replace(/\D/g, '');
    let borough = String(q.borough || '');
    let block   = String(q.block || '');
    let lot     = String(q.lot || '');

    if (bblRaw && !(borough && block && lot) && bblRaw.length >= 8) {
      borough = bblRaw.slice(0, 1);
      block   = String(Number(bblRaw.slice(1, 6)));
      lot     = String(Number(bblRaw.slice(6)));
    }

    if (!(borough && block && lot)) {
      return res.status(400).json({ error: true, message: 'Provide bbl=######### OR borough+block+lot' });
    }

    const limit = Math.min(Number(q.$limit || '25'), 100);
    const order = String(q.$order || 'recorded_datetime DESC');

    // 1) Legals → get document_id list
    const where = encodeURIComponent(`borough='${borough}' AND block='${block}' AND lot='${lot}'`);
    const legalsUrl = `${BASE}${LEGALS}?$select=document_id,good_through_date&$where=${where}&$order=good_through_date DESC&$limit=${limit}`;
    const legalsResp = await fetch(legalsUrl, { headers: headers(), cache: 'no-store' });
    if (!legalsResp.ok) {
      const text = await legalsResp.text();
      return res.status(legalsResp.status).json({ error: true, message: `Legals query failed: ${text || legalsResp.status}` });
    }
    const legals = (await legalsResp.json()) as Array<{ document_id?: string }>;
    const docIds = Array.from(new Set(legals.map(r => r.document_id).filter(Boolean))) as string[];

    if (!docIds.length) return res.status(200).json([]); // no filings

    // 2) Master → hydrate those document_ids
    const inList = docIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const masterUrl = `${BASE}${MASTER}?$where=document_id in (${inList})&$order=${encodeURIComponent(order)}&$limit=${limit}`;
    const masterResp = await fetch(masterUrl, { headers: headers(), cache: 'no-store' });
    if (!masterResp.ok) {
      const text = await masterResp.text();
      return res.status(masterResp.status).json({ error: true, message: `Master query failed: ${text || masterResp.status}` });
    }

    const rows = await masterResp.json();
    return res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (e: any) {
    return res.status(500).json({ error: true, message: e?.message || String(e) });
  }
}

}
