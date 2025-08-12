// app/api/geoclient/address/route.ts
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const BASE = process.env.GEOCLIENT_URL || 'https://api.nyc.gov/geoclient/v2';
const KEY  = process.env.GEOCLIENT_KEY!; // set in Vercel env

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const params = new URLSearchParams();
  const houseNumber = sp.get('houseNumber') || '';
  const street      = sp.get('street') || '';
  const borough     = sp.get('borough') || '';
  const zip         = sp.get('zip') || '';

  if (houseNumber) params.set('houseNumber', houseNumber);
  if (street)      params.set('street', street);
  if (borough)     params.set('borough', borough);
  if (zip)         params.set('zip', zip);
  params.set('key', KEY);

  const url = `${BASE}/address.json?${params.toString()}`;
  const r = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 300 } });
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    return Response.json(json, { status: r.ok ? 200 : 502 });
  } catch {
    return new Response(text, { status: r.status });
  }
}
