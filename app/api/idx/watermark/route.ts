// GET /api/idx/watermark — exposes the IDX Property last-refresh timestamp so
// client-rendered pages (search, featured listings, footer, disclaimers) can
// display a real update time per UCBA 2026 Art. VIII §4, not the render clock.
//
// Neon-quiet (2026-07-23): the SyncState read is served from the tag-cached
// `getCachedIdxWatermark` (tag `idx-watermark`, fallback revalidate = the
// ACTUAL 30-minute production idx-sync cadence — the old comments citing a
// 12-minute cadence were stale). A successful idx-sync revalidates the tag
// only AFTER its SyncState upsert durably commits — so this route reaches
// Neon at most once per successful sync (plus cold caches), instead of on
// every CDN miss. CDN layer: s-maxage=900 + stale-while-revalidate=3600 kept
// as the outer shield. Fail-closed: a failed sync leaves the prior cached
// (real) watermark in place — never a fabricated "now".
import { NextResponse } from 'next/server';
import { displayWatermark } from '@/lib/idx/watermark';
import { getCachedIdxWatermark } from '@/lib/cache/idx-watermark';

export const dynamic = 'force-dynamic';

export async function GET() {
  const w = await getCachedIdxWatermark();
  const d = displayWatermark(w);
  return NextResponse.json(
    { lastWatermark: w.lastWatermark, lastRunAt: w.lastRunAt, displayAt: d },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } }
  );
}
