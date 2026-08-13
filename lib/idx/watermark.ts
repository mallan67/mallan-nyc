// Server-side helper to read the IDX feed's actual last-refresh time.
// UCBA 2026 Art. VIII §4 ("Statistical Attribution") requires the displayed
// "data last updated" timestamp to reflect the true data refresh time, NOT
// the page render time.
//
// TWO CURSORS, ONE PUBLIC MEANING (2026-08-13)
// --------------------------------------------
// Feed freshness used to be a single number because the Property incremental
// filter ORed both source clocks — `(ModificationTimestamp gt T or
// PhotosChangeTimestamp gt T)` — against one scalar watermark. That is now
// split: Property owns the MATERIAL clock (`sync_state.Property.last_watermark`)
// and the media lane owns the PHOTO clock
// (`media_sync_state.Media.last_photos_change`, driven by runMediaSync).
//
// Reading only the Property row after that split would silently stop counting
// photo refreshes as data refreshes, so the publicly displayed date would
// understate freshness on any day whose only change was photos. The public
// meaning — "how fresh is the data we are showing you" — is the MORE RECENT of
// the two lanes, so this module now reads both and takes the max.
//
// Related correction landed in the same change: lib/idx/sync.ts previously
// seeded its watermark `= new Date()`, so `last_watermark` persisted as local
// WALL CLOCK (proved live: last_watermark === last_run_at to the millisecond,
// 3m52.821s ahead of MAX(listings.modification_timestamp)). It is now the last
// contiguous fully-processed provider ModificationTimestamp. EXPECTED EFFECT:
// the displayed date moves BACKWARD once, from run clock to real feed time.
// That is the §4 defect being removed, not a regression.
import prisma from '@/lib/prisma';

export type IdxWatermark = {
  /** Last ModificationTimestamp successfully processed from Trestle Property. */
  lastWatermark: Date | null;
  /** Clock time of the last successful sync run. */
  lastRunAt: Date | null;
  /**
   * Last PhotosChangeTimestamp successfully processed by the media lane.
   * Independent source clock — see the module header.
   */
  lastPhotosChange: Date | null;
};

/**
 * Read the IDX freshness inputs from BOTH cursor owners. Returns nulls on any
 * failure so pages can safely fall back to a neutral display ("updated
 * regularly") rather than crashing. Callers must handle null.
 *
 * The two reads are independent: a failure of either must not blank the other,
 * because showing the one lane we DID read is strictly better than showing
 * nothing, and both are only ever used to pick a maximum.
 */
export async function getIdxWatermark(): Promise<IdxWatermark> {
  const [property, media] = await Promise.all([
    prisma.syncState
      .findUnique({
        where: { resource: 'Property' },
        select: { last_watermark: true, last_run_at: true },
      })
      .catch(() => null),
    prisma.mediaSyncState
      .findUnique({
        where: { resource: 'Media' },
        select: { last_photos_change: true },
      })
      .catch(() => null),
  ]);

  return {
    lastWatermark: property?.last_watermark ?? null,
    lastRunAt: property?.last_run_at ?? null,
    lastPhotosChange: media?.last_photos_change ?? null,
  };
}

/**
 * Pick the best timestamp to show publicly.
 *
 * Precedence: the most recent PROVIDER instant across both lanes (material
 * revisions and photo changes), falling back to the run clock only when neither
 * lane has a provider instant to offer. `lastRunAt` stays last deliberately —
 * it is a local clock, and preferring it is precisely the Art. VIII §4 defect.
 */
export function displayWatermark(w: IdxWatermark): Date | null {
  const providerInstants = [w.lastWatermark, w.lastPhotosChange].filter(
    (d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()),
  );
  if (providerInstants.length > 0) {
    return providerInstants.reduce((a, b) => (b > a ? b : a));
  }
  return w.lastRunAt ?? null;
}
