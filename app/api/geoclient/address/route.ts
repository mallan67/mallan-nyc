import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://api.nyc.gov/geoclient/v2';
const KEY  = process.env.GEOCLIENT_KEY || '';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const houseNumber = searchParams.get('houseNumber') || '';
  const street      = searchParams.get('street') || '';
  const borough     = searchParams.get('borough') || '';

  if (!houseNumber || !street || !borough) {
    return NextResponse.json(
      { error: true, message: 'houseNumber, street, borough required' },
      { status: 400 }
    );
  }

  const url = `${BASE}/address.json?houseNumber=${encodeURIComponent(houseNumber)}&street=${encodeURIComponent(street)}&borough=${encodeURIComponent(borough)}`;
  const headers: Record<string, string> = {};
  if (KEY) headers['Ocp-Apim-Subscription-Key'] = KEY;

  const r = await fetch(url, { headers, cache: 'no-store' });
  const text = await r.text();
  try { return NextResponse.json(JSON.parse(text)); }
  catch { return NextResponse.json({ error: true, status: r.status, body: text }, { status: r.status }); }
}
