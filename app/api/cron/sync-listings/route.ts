import { NextResponse } from 'next/server';
import { logFetchAttempt } from '@/lib/idx/logger';

/**
 * GET /api/cron/sync-listings
 *
 * Vercel Cron handler — runs every 15 minutes.
 * Pulls new/updated listings from Trestle using the
 * modificationTimestamp cursor for incremental sync.
 *
 * Auth: Vercel injects `Authorization: Bearer <CRON_SECRET>`.
 *
 * COMPLIANCE NOTE:
 * - Trestle fetch is STUBBED until credentials arrive.
 * - All access is audit-logged via logFetchAttempt().
 * - Data is written to the Listing model (prisma).
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds (Vercel Pro limit)

export async function GET(request: Request) {
  // --- Auth ---
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const tracker = logFetchAttempt('/api/cron/sync-listings');

  try {
    // --- Check IDX readiness ---
    const idxEnabled = process.env.IDX_ENABLED === 'true';
    const hasCredentials = !!(process.env.IDX_API_KEY && process.env.IDX_API_SECRET);

    if (!idxEnabled || !hasCredentials) {
      tracker.complete('disabled');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: !idxEnabled ? 'IDX_ENABLED=false' : 'Missing Trestle credentials',
        syncedCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // --- Incremental sync cursor ---
    // In production: query MAX(modification_timestamp) from listings table.
    // For now, stub with a fixed window.
    // const lastSync = await prisma.listing.aggregate({
    //   _max: { modificationTimestamp: true },
    // });
    // const cursor = lastSync._max.modificationTimestamp?.toISOString()
    //   ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // --- Trestle fetch (STUB) ---
    // const trestleUrl = `${process.env.IDX_ENDPOINT}/Property`
    //   + `?$filter=ModificationTimestamp gt ${cursor}`
    //   + `&$orderby=ModificationTimestamp asc`
    //   + `&$top=200`;
    //
    // const res = await fetch(trestleUrl, {
    //   headers: { Authorization: `Bearer ${accessToken}` },
    // });
    // const data = await res.json();

    // --- Upsert into DB (STUB) ---
    // for (const record of data.value) {
    //   await prisma.listing.upsert({ ... });
    // }

    tracker.complete('success');

    return NextResponse.json({
      success: true,
      skipped: false,
      syncedCount: 0,
      message: 'Trestle fetch stubbed — awaiting credentials',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    tracker.complete('error', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
