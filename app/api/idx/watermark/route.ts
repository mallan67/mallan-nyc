// GET /api/idx/watermark — exposes the IDX Property last-refresh timestamp so
// client-rendered pages (search, featured listings, etc.) can display a real
// update time per UCBA 2026 Art. VIII §4, not the render clock.
// Cached at the edge for 3 minutes — sync runs every 12, so this is plenty fresh.
import { NextResponse } from 'next/server';
import { getIdxWatermark, displayWatermark } from '@/lib/idx/watermark';

export const dynamic = 'force-dynamic';

export async function GET() {
  const w = await getIdxWatermark();
  const d = displayWatermark(w);
  return NextResponse.json(
    { lastWatermark: w.lastWatermark, lastRunAt: w.lastRunAt, displayAt: d },
    { headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=600' } }
  );
}
