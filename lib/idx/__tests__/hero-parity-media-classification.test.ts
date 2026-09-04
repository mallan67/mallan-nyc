/// <reference types="jest" />
/**
 * HERO PARITY ACROSS ALL THREE DECIDERS.
 *
 * `selectHeroPhoto` -> `filterActivePhotoRows` -> `classifyMediaItem`, and that
 * classifier weighs **MediaCategory, MediaClassification and the Trestle
 * DOCUMENT-* URL shape** before it ever falls back to `media_type`. It exists
 * precisely because Trestle defaults a MISSING MediaCategory to Photo, so a
 * floor plan arriving with no category is STORED as `media_type='Photo'`.
 *
 * DEFECT (found 2026-08-10, pre-existing — #597 widened the summary read but
 * not the mirror's). Both hero reads inside `media-sync` selected only
 * `{media_key, media_type, status, preferred_photo_yn, order}`. With
 * `media_category`, `media_classification` and `media_url_original` absent,
 * `classifyMediaItem` receives `url: ''` and undefined category/classification
 * and can only fall back to `media_type` — so it calls the floor plan a photo.
 *
 * `computeListingMediaSummary` reads the FULL row and excludes it. The two
 * therefore disagreed about which row is the hero:
 *
 *   summary  -> genuine photo   (drives primary_photo_url on the public card)
 *   mirror   -> the floor plan  (mirrors it, and PARKS the genuine hero)
 *
 * The parked genuine hero then never gets an R2 object, which is the same
 * durability loss the Phase-4a sweep exists to end — arriving through a
 * different door.
 *
 * These tests pin all THREE deciders to the same answer on a fixture that
 * actually separates them.
 */

const mockFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findMany: (args: unknown) => mockFindMany(args),
      updateMany: (args: unknown) => mockUpdateMany(args),
    },
    // OPS-027: PHASE 4a revalidates sibling state and writes inside ONE
    // transaction, so the tx-scoped client must route both calls.
    $transaction: (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        listingMedia: {
          findMany: (args: unknown) => mockFindMany(args),
          updateMany: (args: unknown) => mockUpdateMany(args),
        },
      }),
  },
}));

import {
  selectHeroPhoto,
  computeListingMediaSummary,
  reevaluateR2PolicyExclusions,
  R2_POLICY_REEVAL_INTERVAL_MS,
} from '../media-sync';
import { R2_POLICY_PARKED_ATTEMPTS } from '@/lib/media/r2-policy-state';
import { classifyMediaItem } from '@/lib/media/listing-media-resolver';

const NOW = new Date('2026-08-10T06:00:00Z').getTime();
const now = () => NOW;
const DUE = new Date(NOW - R2_POLICY_REEVAL_INTERVAL_MS - 60_000);

/**
 * Stored as a Photo, canonically a FloorPlan: Trestle sent no MediaCategory
 * (which defaults to Photo at ingest) and the locator is a DOCUMENT-Pdf URL.
 */
const DISGUISED_FLOORPLAN = {
  id: 1n,
  listing_id: 'RLS20105333',
  media_key: 'MK-floorplan',
  media_type: 'Photo',
  media_category: null,
  media_classification: null,
  media_url_original: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/abc.pdf',
  status: 'active',
  preferred_photo_yn: false,
  order: 0, // would win the hero tiebreak if it were treated as a photo
  r2_key: null,
  media_url_cached: null,
  r2_attempts: null,
  r2_last_attempt_at: null,
  r2_policy_excluded_at: null,
  media_modification_ts: null,
  modification_ts: null,
};

/** The genuine hero: a real photo, but at a HIGHER order. */
const GENUINE_PHOTO = {
  ...DISGUISED_FLOORPLAN,
  id: 2n,
  media_key: 'MK-genuine',
  media_url_original: 'https://api.cotality.com/trestle/Media/Property/p-2.jpg',
  order: 1,
};

const THIRD_PARTY_LISTING = {
  listing_id: 'RLS20105333', rls_eligible: true, status: 'Active',
  idx_display_yn: true, owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true, list_office_mls_id: '51',
};

/** The full-row population every decider is supposed to be reading. */
const FULL_ROWS = [DISGUISED_FLOORPLAN, GENUINE_PHOTO];

beforeEach(() => {
  mockFindMany.mockReset();
  mockUpdateMany.mockReset().mockImplementation(async (args) => ({
    count: ((args as { where: { id: { in: unknown[] } } }).where.id.in ?? []).length,
  }));
});

describe('the fixture genuinely separates the classifier from media_type', () => {
  it('the disguised row classifies as a floorplan ONLY when the locator is present', () => {
    expect(
      classifyMediaItem({
        mediaCategory: undefined,
        mediaClassification: undefined,
        mediaType: 'Photo',
        url: DISGUISED_FLOORPLAN.media_url_original,
      }),
    ).toBe('floorplan');

    // This is exactly what a narrow select produced — and why the mirror and
    // the summary could disagree.
    expect(
      classifyMediaItem({
        mediaCategory: undefined,
        mediaClassification: undefined,
        mediaType: 'Photo',
        url: '',
      }),
    ).toBe('photo');
  });
});

describe('all three deciders pick the SAME hero', () => {
  it('A. computeListingMediaSummary (the public card source) picks the genuine photo', () => {
    const summary = computeListingMediaSummary(FULL_ROWS);
    expect(summary.primary_photo_url).toBe(GENUINE_PHOTO.media_url_original);
    // The floor plan is not counted as a photo either.
    expect(summary.photo_count).toBe(1);
  });

  it('B. selectHeroPhoto over the full row shape picks the genuine photo', () => {
    expect(selectHeroPhoto(FULL_ROWS)?.media_key).toBe('MK-genuine');
  });

  it('C. the PHASE 4a hero read selects the classification fields, so it agrees', async () => {
    // Park the genuine photo (as the pre-fix mirror would have done, believing
    // the floor plan was the hero) and let the sweep reconsider it.
    const parkedGenuine = {
      ...GENUINE_PHOTO,
      r2_attempts: R2_POLICY_PARKED_ATTEMPTS,
      r2_last_attempt_at: DUE,
      listing: THIRD_PARTY_LISTING,
    };
    const pool = [{ ...DISGUISED_FLOORPLAN, listing: THIRD_PARTY_LISTING }, parkedGenuine];

    mockFindMany.mockImplementation(async (args) => {
      const a = args as { where: Record<string, unknown>; select?: Record<string, unknown> };
      if (typeof a.where?.listing_id === 'string' && !('status' in a.where)) {
        // Serve ONLY the fields the caller actually selected. A caller that has
        // not widened its select must not silently receive the wide row — that
        // is what let the narrow-select defect hide.
        const keys = Object.keys(a.select ?? {});
        return pool.map((r) =>
          Object.fromEntries(keys.map((k) => [k, (r as Record<string, unknown>)[k]])),
        );
      }
      return [parkedGenuine];
    });

    const res = await reevaluateR2PolicyExclusions({ now });

    // The genuine photo IS the hero, so it must be re-admitted.
    expect(res.readmitted).toBe(1);
    expect(res.kept_parked).toBe(0);
    const write = mockUpdateMany.mock.calls
      .map(([a]) => a as { where: { id: { in: bigint[] } }; data: Record<string, unknown> })
      .find((c) => c.where.id.in.some((id) => id === GENUINE_PHOTO.id));
    expect(write?.data).toEqual({ r2_policy_excluded_at: null, r2_attempts: null });
  });

  it('D. the disguised floor plan is NEVER chosen as hero by any decider', () => {
    expect(selectHeroPhoto(FULL_ROWS)?.media_key).not.toBe('MK-floorplan');
    expect(computeListingMediaSummary(FULL_ROWS).primary_photo_url).not.toBe(
      DISGUISED_FLOORPLAN.media_url_original,
    );
  });

  it('E. with ONLY the disguised row, there is no hero at all (fail-closed)', () => {
    expect(selectHeroPhoto([DISGUISED_FLOORPLAN])).toBeNull();
    expect(computeListingMediaSummary([DISGUISED_FLOORPLAN]).primary_photo_url).toBeNull();
    expect(computeListingMediaSummary([DISGUISED_FLOORPLAN]).photo_count).toBe(0);
  });
});

describe('both media-sync hero reads request the classification fields', () => {
  const SRC = require('fs').readFileSync(
    require('path').resolve(__dirname, '../media-sync.ts'),
    'utf8',
  ) as string;

  /**
   * STRUCTURAL guard, not the primary proof — C above is behavioral. This
   * catches a future narrowing of the OTHER read (Phase-3 admission), which no
   * unit test can reach without the full runMediaSync harness.
   */
  it('every selectHeroPhoto caller in this module reads category, classification and locator', () => {
    const callers = SRC.split('selectHeroPhoto(listingRows)');
    // One trailing segment per call site plus the head segment.
    expect(callers.length - 1).toBeGreaterThanOrEqual(2);
    for (const before of callers.slice(0, -1)) {
      const selectBlock = before.slice(before.lastIndexOf('select: {'));
      for (const field of [
        'media_key',
        'media_type',
        'media_category',
        'media_classification',
        'media_url_original',
        'status',
        'preferred_photo_yn',
        'order',
      ]) {
        expect({ field, present: selectBlock.includes(`${field}: true`) }).toEqual({
          field,
          present: true,
        });
      }
    }
  });
});

export {};
