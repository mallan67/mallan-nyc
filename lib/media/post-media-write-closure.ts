/**
 * THE ONE CANONICAL POST-MEDIA-WRITE CLOSURE.
 *
 * Every writer that can change a listing's media — Cotality sync, explicit
 * delete/tombstone reconciliation, R2 hero propagation, and all four CRM media
 * routes — funnels through here after a SUCCESSFUL mutation.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The four CRM media routes (upload, delete, set-main, reorder) wrote
 * `listing_media` and stopped. They never recomputed the `Listing` media
 * summary and never emitted a cache tag. Meanwhile
 * `app/listing/[...slug]/page.tsx` exports `revalidate = false` and its DTO
 * lives in a deployment-surviving `unstable_cache` entry tagged
 * `listing:{id}`. So an agent's upload / delete / set-main / reorder left the
 * PUBLIC gallery and hero stale INDEFINITELY — permanently for Mallan-only
 * exclusives, which the Cotality media sync never revisits. That is a live
 * defect, not a theoretical one.
 *
 * The fix is a SEAM, not four copies of the logic: duplicating summary +
 * invalidation inside each route is exactly how the three existing media
 * writers drifted into three different opinions about what a media change
 * expires.
 *
 * ── WHAT IT GUARANTEES ─────────────────────────────────────────────────────
 *   1. the canonical media summary is recomputed from `listing_media`;
 *   2. any required storage change is persisted;
 *   3. the PUBLIC change is CLASSIFIED (provenance-only / gallery / hero);
 *   4. exactly the affected public surfaces are invalidated — and NOTHING is
 *      invalidated for a provenance-only change;
 *   5. bounded aggregate telemetry is recorded (no per-listing URL or PII);
 *   6. it never throws into the caller's success path.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * It does not decide media AUTHORIZATION (that is E-0, upstream at ingest), it
 * does not mutate feed-owned ordering or preferred flags, and it does not
 * invent a second invalidation system — the tag set comes from the existing
 * `publicListingChangeTags` owner.
 */

import {
  updateListingMediaSummary,
  newSummaryWriteCounters,
  type SummaryWriteCounters,
} from '@/lib/idx/media-sync';

export interface MediaWriteClosureOptions {
  /**
   * Did this mutation change the AUTHORIZED public gallery — an insert, a
   * delete/tombstone, a reorder, a set-main, or a reclassification?
   *
   * REQUIRED for correctness on the false-negative surface: a non-hero reorder
   * (or a delete balanced by an insert) leaves hero AND photo_count identical,
   * so no comparison of the four summary columns can see it. The writer knows;
   * the comparator cannot.
   *
   * `false` is only correct when the mutation provably did not alter the
   * authorized set (e.g. a pure provenance refresh).
   */
  galleryMutated: boolean;
  /** Optional shared counter sink so a batch can aggregate across listings. */
  counters?: SummaryWriteCounters;
}

export interface MediaWriteClosureResult {
  ok: boolean;
  counters: SummaryWriteCounters;
}

/**
 * Close out a successful media mutation for ONE listing.
 *
 * FAIL-SOFT BY DESIGN: the caller has already committed its DB write, so a
 * failure here must not turn a successful upload/delete into a 500. A failure
 * is recorded in `counters.rows_failed` and surfaced as `ok: false`; the worst
 * case degrades to the pre-existing behaviour (a stale public cache), never to
 * a lost media write or a broken CRM response.
 */
export async function closeMediaWrite(
  listingId: string,
  options: MediaWriteClosureOptions,
): Promise<MediaWriteClosureResult> {
  const counters = options.counters ?? newSummaryWriteCounters();

  try {
    await updateListingMediaSummary(listingId, {
      counters,
      // The classification input the summary columns cannot supply.
      mediaChangeEvidence: { galleryMutated: options.galleryMutated },
    });
    return { ok: true, counters };
  } catch (err) {
    counters.rows_failed++;
    // Bounded aggregate only — never the URL, media key, or address.
    console.error(
      '[media-closure] post-write closure failed (media write already committed):',
      (err as { code?: string })?.code ?? (err instanceof Error ? err.name : 'unknown'),
    );
    return { ok: false, counters };
  }
}
