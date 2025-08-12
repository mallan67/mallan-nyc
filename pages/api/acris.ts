// pages/api/acris.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const q = req.query;
  if (q.ping === '1') return res.status(200).json({ ok: true, handler: 'acris' });

  const token = process.env.SOCRATA_APP_TOKEN || '';
  const borough = String(q.borough || '');
  const block   = String(q.block || '');
  const lot     = String(q.lot || '');
  const bbl     = String(q.bbl || '');

  if (!((borough && block && lot) || bbl)) {
    return res.status(400).json({ error: true, message: 'Provide borough+block+lot OR bbl' });
  }

  const params = new URLSearchParams();
  params.set('$limit', String(q.$limit || '25'));
  params.set('$order', String(q.$order || 'recorded_datetime DESC'));

  if (borough && block && lot) {
    params.set('borough', borough);
    params.set('block', block);
    params.set('lot', lot);
  } else {
    const clean = bbl.replace(/\D/g, '');
    if (!clean) return res.status(400).json({ error: true, message: 'Bad bbl' });
    params.set('bbl', clean);
  }

  const DATASETS = [
    'https://data.cityofnewyork.us/resource/bnx9-e6tj.json',
    'https://data.cityofnewyork.us/resource/ic3t-wcy2.json',
  ];

  for (const ds of DATASETS) {
    const r = await fetch(`${ds}?${params.toString()}`, {
      headers: token ? { 'X-App-Token': token, accept: 'application/json' } : { accept: 'application/json' },
      cache: 'no-store',
    });
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      if (r.ok && Array.isArray(json)) return res.status(200).json(json);
    } catch {
      // not JSON; try next dataset
    }
  }
  return res.status(200).json([]);
}
