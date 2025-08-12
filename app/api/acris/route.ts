import { NextRequest } from 'next/server';

const DATASET = 'bnx9-e6tj'; // ACRIS Real Property Master
const BASE = `https://data.cityofnewyork.us/resource/${DATASET}.json`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Accept either our short names or the plain ones
  const borough = searchParams.get('borough') || searchParams.get('b') || '';
  const block   = searchParams.get('block')   || searchParams.get('bl') || '';
  const lot     = searchParams.get('lot')     || searchParams.get('lt') || '';

  if (!borough || !block || !lot) {
    return Response.json(
      { error: true, message: 'Missing borough, block, or lot' },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams({
    borough,
    block,
    lot,
    '$limit': searchParams.get('$limit') || '50',
    '$order': searchParams.get('$order') || 'recorded_datetime DESC',
  });

  const headers: Record<string, string> = { accept: 'application/json' };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers['X-App-Token'] = token;

  // Cache briefly at the edge
  const r = await fetch(`${BASE}?${qs.toString()}`, {
    headers,
    next: { revalidate: 60 },
  });

  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  });
}
