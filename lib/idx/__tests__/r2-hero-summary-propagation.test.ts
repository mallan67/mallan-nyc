/**
 * PHASE-3 R2 -> Listing summary propagation.
 *
 * The R2 mirror drain wrote `listing_media.r2_key` and then stopped. Nothing
 * refreshed the `Listing` media summary, so `primary_photo_r2_key` stayed stale
 * until some FUTURE Phase-1 pass happened to call `updateListingMediaSummary`
 * for that listing — which may be a long time, or never for a listing whose feed
 * rows are not changing.
 *
 * That matters because the public surfaces read the summary, not the media rows:
 * the building manifest serves its durable hero from `primary_photo_r2_key`, and
 * cards/detail read `primary_photo_url`. So a hero could be mirrored to R2 and
 * the public site would keep serving the rotating Cotality locator anyway —
 * exactly the staleness this PR exists to remove.
 *
 * `updateListingMediaSummary` already pre-reads and SUPPRESSES a no-op write
 * (`listingMediaSummaryUnchanged`), so calling it for every affected listing is
 * write-safe: only listings whose summary genuinely changed produce a write, and
 * only those revalidate their cache tags.
 */

import { propagateMirroredHeroSummaries } from '@/lib/idx/media-sync';

describe('dedupe + per-listing refresh', () => {
  it('refreshes each affected listing exactly once', async () => {
    const seen: string[] = [];
    const out = await propagateMirroredHeroSummaries(
      ['A', 'B', 'A', 'A', 'B'],
      {
        updateSummary: async (id) => { seen.push(id); },
        remainingMs: () => 60_000,
      },
    );
    expect(seen.sort()).toEqual(['A', 'B']);
    expect(out.listings_refreshed).toBe(2);
    expect(out.listings_skipped_budget).toBe(0);
    expect(out.listings_failed).toBe(0);
  });

  it('does nothing when no listing was mirrored', async () => {
    const out = await propagateMirroredHeroSummaries([], {
      updateSummary: async () => { throw new Error('must not be called'); },
      remainingMs: () => 60_000,
    });
    expect(out.listings_refreshed).toBe(0);
  });
});

describe('time budget is respected and REPORTED', () => {
  it('stops when the budget is exhausted and reports the remainder', async () => {
    const seen: string[] = [];
    let ms = 5_000;
    const out = await propagateMirroredHeroSummaries(['A', 'B', 'C', 'D'], {
      updateSummary: async (id) => { seen.push(id); ms -= 2_000; },
      remainingMs: () => ms,
      reserveMs: 2_000,
    });
    // Silent truncation would read as "everything was refreshed"; the skipped
    // count makes the shortfall visible in the run's accounting.
    expect(seen.length).toBeLessThan(4);
    expect(out.listings_refreshed).toBe(seen.length);
    expect(out.listings_skipped_budget).toBe(4 - seen.length);
  });

  it('refreshes nothing when there is no budget at all', async () => {
    const out = await propagateMirroredHeroSummaries(['A', 'B'], {
      updateSummary: async () => { throw new Error('must not be called'); },
      remainingMs: () => 0,
      reserveMs: 1_000,
    });
    expect(out.listings_refreshed).toBe(0);
    expect(out.listings_skipped_budget).toBe(2);
  });
});

describe('never fails the run', () => {
  it('one listing failing does not stop the others', async () => {
    const seen: string[] = [];
    const out = await propagateMirroredHeroSummaries(['A', 'B', 'C'], {
      updateSummary: async (id) => {
        if (id === 'B') throw new Error('summary write failed');
        seen.push(id);
      },
      remainingMs: () => 60_000,
    });
    expect(seen).toEqual(['A', 'C']);
    expect(out.listings_refreshed).toBe(2);
    expect(out.listings_failed).toBe(1);
  });
});
