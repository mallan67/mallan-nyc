import type { NextRequest } from 'next/server';

const SODA = 'https://data.cityofnewyork.us/resource';
const LEGALS = `${SODA}/8h5j-fqxa.json`;  // Real Property Legals (has borough/block/lot + document_id)
const MASTER = `${SODA}/bnx9-e6tj.json`;  // Real Property Master (join via document_id)

function json(u: string) {
  const headers: Record<string, string> = { accept: 'application/json' };
  const tok = process.env.SOCRATA_APP_TOKEN;
  if (tok) headers['X-App-Token'] = tok;
  return fetch(u, { headers });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get('ping')) {
    return Response.json({ ok: true, handler: 'acris-app-v8' });
  }

  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('$limit') || '25')));
  const debug = url.searchParams.has('debug');

  // Accept either ?bbl=########## or ?borough=&block=&lot=
  let borough = (url.searchParams.get('borough') || '').trim();
  let block   = (url.searchParams.get('block') || '').trim().replace(/^0+/, '');
  let lot     = (url.searchParams.get('lot') || '').trim().replace(/^0+/, '');
  const bblIn = (url.searchParams.get('bbl') || '').replace(/[^0-9]/g, '');

  if (bblIn && (!borough || !block || !lot)) {
    if (bblIn.length >= 7) {
      borough = bblIn.slice(0, 1);
      block   = String(Number(bblIn.slice(1, 6)));
      lot     = String(Number(bblIn.slice(6)));
    }
  }

  if (!borough || !block || !lot) {
    return Response.json(
      { error: true, message: 'Provide ?bbl=########## OR ?borough=&block=&lot=' },
      { status: 400 }
    );
  }

  // Normalize + try padded & unpadded block/lot
  const b = String(Number(borough));
  const bl = String(Number(block));
  const lt = String(Number(lot));
  const blP = bl.padStart(5, '0');
  const ltP = lt.padStart(4, '0');

  // 1) LEGALS → document_id list for this BBL
  const whereLegals =
    `borough = ${b} AND (block = '${bl}' OR block = '${blP}') AND (lot = '${lt}' OR lot = '${ltP}')`;
  const legalsURL =
    `${LEGALS}?$select=document_id&$where=${encodeURIComponent(whereLegals)}&$limit=5000`;

  let docs: string[] = [];
  try {
    const r = await json(legalsURL);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const arr = await r.json();
    docs = Array.from(new Set((arr || []).map((x: any) => x.document_id).filter(Boolean)));
  } catch (e: any) {
    return Response.json({ error: true, step: 'LEGALS', details: String(e) }, { status: 502 });
  }

  if (!docs.length) {
    const payload: any = {
      results: [],
      note:
        'No ACRIS Real Property filings found for that BBL. Co-op transactions are often recorded as Personal Property (UCC) and are not searchable by BBL via Open Data.',
    };
    if (debug) payload.debug = [{ step: 'LEGALS', where: whereLegals, count: 0 }];
    return Response.json(payload);
  }

  // 2) MASTER → by document_id (chunked IN lists)
  const chunks: string[][] = [];
  for (let i = 0; i < docs.length; i += 80) chunks.push(docs.slice(i, i + 80));

  let rows: any[] = [];
  for (const ch of chunks) {
    if (rows.length >= limit) break;
    const whereMaster = `document_id in (${ch.map((id) => `'${id}'`).join(',')})`;
    const masterURL = `${MASTER}?$where=${encodeURIComponent(whereMaster)}&$order=recorded_datetime DESC&$limit=${limit}`;
    try {
      const r = await json(masterURL);
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const part = await r.json();
      rows = rows.concat(part || []);
    } catch (e: any) {
      return Response.json({ error: true, step: 'MASTER', details: String(e) }, { status: 502 });
    }
  }

  const out: any = { results: rows.slice(0, limit) };
  if (debug) out.debug = [{ step: 'LEGALS', where: whereLegals, count: docs.length }];
  return Response.json(out);
}
