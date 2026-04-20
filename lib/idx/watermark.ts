// Server-side helper to read the IDX feed's actual last-refresh time.
// UCBA 2026 Art. VIII §4 ("Statistical Attribution") requires the displayed
// "data last updated" timestamp to reflect the true data refresh time, NOT
// the page render time. SyncState.last_watermark is updated by lib/idx/sync.ts
// every 12 minutes (vercel.json cron idx-sync).
import prisma from '@/lib/prisma';

export type IdxWatermark = {
  /** Last ModificationTimestamp successfully processed from Trestle Property. */
  lastWatermark: Date | null;
  /** Clock time of the last successful sync run. */
  lastRunAt: Date | null;
};

/**
 * Read the IDX Property watermark from SyncState. Returns nulls on any failure
 * so pages can safely fall back to a neutral display ("updated regularly")
 * rather than crashing. Callers must handle null.
 */
export async function getIdxWatermark(): Promise<IdxWatermark> {
  try {
    const row = await prisma.syncState.findUnique({
      where: { resource: 'Property' },
      select: { last_watermark: true, last_run_at: true },
    });
    return {
      lastWatermark: row?.last_watermark ?? null,
      lastRunAt: row?.last_run_at ?? null,
    };
  } catch {
    return { lastWatermark: null, lastRunAt: null };
  }
}

/** Pick the best timestamp to show publicly — watermark preferred, run-at fallback. */
export function displayWatermark(w: IdxWatermark): Date | null {
  return w.lastWatermark ?? w.lastRunAt ?? null;
}
