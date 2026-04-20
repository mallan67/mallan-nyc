// GET /api/idx/watermark — exposes the IDX Property last-refresh timestamp so
// client-rendered pages (search, featured listings, etc.) can display a real
// update time per UCBA 2026 Art. VIII §4, not the render clock.
//
// Cache strategy: s-maxage=900 (15 min) aligned with the 12-min idx-sync
// cadence. The watermark literally cannot change faster than sync runs, so
// caching 15 min means at most 1 Neon query per 15-min window per edge region.
// Prior 3-min cache was ~5x the burn with zero freshness benefit.
// stale-while-revalidate=3600 keeps the page snappy even if a revalidation
// request hits a cold DB.
import { NextResponse } from 'next/server';
import { getIdxWatermark, displayWatermark } from '@/lib/idx/watermark';

export const dynamic = 'force-dynamic';

export async function GET() {
  const w = await getIdxWatermark();
  const d = displayWatermark(w);
  return NextResponse.json(
    { lastWatermark: w.lastWatermark, lastRunAt: w.lastRunAt, displayAt: d },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } }
  );
}
