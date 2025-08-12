// app/api/acris/route.ts
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    youSent: Object.fromEntries(url.searchParams),
    now: new Date().toISOString(),
  });
}
