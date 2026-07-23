import { NextRequest, NextResponse } from 'next/server';
import { getBuildingDataCached } from '@/lib/buildings/public-building-data';

/**
 * Rate limiter — 30 requests per minute per IP.
 * Prevents bulk scraping of building data per REBNY RLS compliance.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

/** Format Trestle camelCase → readable: "HealthClub" → "Health Club" */
export async function GET(request: NextRequest) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const streetNumber = searchParams.get('streetNumber');
  const streetName = searchParams.get('streetName');
  const postalCode = searchParams.get('postalCode');
  const buildingName = searchParams.get('buildingName');

  if (!streetNumber || !streetName) {
    return NextResponse.json({ error: 'streetNumber and streetName required' }, { status: 400 });
  }

  try {
    // Neon-quiet (2026-07-23): ALL assembly lives in the shared cached
    // accessor (lib/buildings/public-building-data) — the same function the
    // building page consumes directly (no internal HTTP). Repeated requests
    // for the same building execute zero Prisma/Trestle work; this GET is a
    // PURE READ (the dormant fire-and-forget building upsert was removed).
    const payload = await getBuildingDataCached({ streetNumber, streetName, postalCode, buildingName });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[/api/buildings] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
