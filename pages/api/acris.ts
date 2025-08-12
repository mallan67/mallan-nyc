// pages/api/acris.ts  (Pages API = guaranteed to register)
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req;

  // Quick ping so we can prove this route is live
  if (query.ping === '1') {
    return res.status(200).json({ ok: true, handler: 'pages-api-acris', youSent: query });
  }

  // Minimal proxy to NYC Open Data (ACRIS)
  const token = process.env.SOCRATA_APP_TOKEN || '';
  const borough = String(query.borough || '');
  const block   = String(query.block || '');
  const lot     = String(query.lot || '');
  const bbl     = String(query.bbl || '');

  if (!((borough && block && lot) || bbl)) {
    return res.status(400).json({ error: true, message: 'Provide borough+block+lot OR bbl' });
  }

  const params = new URLSearchParams();
  params.set('$limit', String(query.$limit || '25'));
  params.set('$order', String(query.$order || 'recorded_datetime DESC'));

  if (borough && block && lot) {
    params.set('borough', borough);
    params.set('block', block);
    params.set('lot', lot);
  } else if (bbl) {
    const clean = bbl.replace(/\D/g, '');
    if (!clean) return res.status(400).json({ error: true, message: 'Bad bbl' });
    params.set('bbl', clean);
  }

  // Try the main dataset first, then a fallback variant
  const DATASETS = [
    'https://data.cityofnewyork.us/resource/bnx9-e6tj.json',
    'https://data.cityofnewyork.us/resource/ic3t-wcy2.json',
  ];

  for (const ds of DATASETS) {
    const r = await fetch(`${ds}?${params.toString()}`, {
      headers: token ? { 'X-App-Token': token, 'accept': 'application/json' } : { 'accept': 'application/json' },
      cache: 'no-store',
    });

    const text = await r.text();
    try {
      const json = JSON.parse(text);
      if (r.ok && Array.isArray(json)) {
        return res.status(200).json(json);
      }
      // keep trying next dataset if this one complained about fields
    } catch {
      // not JSON; try next dataset
    }
  }

  return res.status(200).json([]); // no rows found
}
