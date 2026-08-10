/**
 * COMMIT 7B-1 — the legacy batch-media path must distinguish
 *
 *     COMPLETE + ZERO ROWS   (authoritative empty -> reconcile)
 * from
 *     INCOMPLETE / UNKNOWN   (fail closed -> touch nothing)
 *
 * THE DEFECT
 * ----------
 * `lib/idx/sync.ts` requested a batch of ResourceRecordKeys, then built
 * `mediaByListing` ONLY from rows that came back and iterated only that map. A
 * requested key with zero returned Media rows therefore VANISHED — "the provider
 * returned nothing for this listing" was indistinguishable from "we never
 * asked", so an emptied gallery was never reconciled.
 *
 * It also bounded the fetch with `$top = batch.length * 30` and read a single
 * page. One 67-photo listing already breaks a 30-per-listing assumption, so a
 * truncated response could look whole.
 *
 * THE FIX
 * -------
 * 1. Completeness comes from the SHARED `paginateMedia` follower — the same one
 *    media-sync uses. `$top` is a page-size hint; `@odata.nextLink` owns
 *    completeness. No second pagination loop, so no second opinion about what
 *    "complete" means.
 * 2. After a proven-complete fetch, PRE-SEED every requested key to `[]` before
 *    grouping rows, so a complete-empty result survives as `[]`.
 * 3. `complete === false` skips the batch entirely — no clear, no tombstone.
 *
 * Normalized `listing_media` tombstoning is NOT done here: `media-sync.ts` owns
 * that authoritative reconciliation. This path only reconciles legacy
 * `Listing.media`, through the existing `mediaArraysMateriallyEqual` +
 * `archivedSafeMediaWhere` guards.
 */

import { paginateMedia, type MediaPage } from '../media-sync';
import { mediaArraysMateriallyEqual } from '../write-suppression';

const RRK = { A: 'RLS-A', B: 'RLS-B', C: 'RLS-C' } as const;

const row = (key: string, order: number) => ({
  ResourceRecordKey: key,
  MediaURL: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/${key}/${order}/A/B/C`,
  MediaCategory: 'Photo',
  Order: order,
  PreferredPhotoYN: order === 0,
  MediaStatus: 'Active',
});

/** Serve `pages` in order; a `null` entry simulates a failing page. */
function pagedFetcher(pages: (unknown[] | null)[]) {
  let i = 0;
  return async (_url: string): Promise<MediaPage> => {
    const page = pages[i];
    i += 1;
    if (page === null) throw new Error('Media page HTTP 500');
    return { value: page, nextLink: i < pages.length ? `next-${i}` : null };
  };
}

/** The production grouping step, including the pre-seed. */
function groupWithPreSeed(batch: readonly string[], rows: Record<string, unknown>[]) {
  const map = new Map<string, unknown[]>();
  for (const key of batch) map.set(String(key), []);
  for (const m of rows) {
    const lid = String(m.ResourceRecordKey || '');
    if (!lid || !m.MediaURL) continue;
    if (!map.has(lid)) map.set(lid, []);
    (map.get(lid) as unknown[]).push({ url: m.MediaURL, mediaType: 'Photo', order: m.Order });
  }
  return map;
}

describe('pagination completeness — 67 photos must not truncate', () => {
  it('follows @odata.nextLink and returns ALL 67 rows', async () => {
    const all = Array.from({ length: 67 }, (_, i) => row(RRK.C, i));
    const { rows, complete } = await paginateMedia(
      'https://api.cotality.com/odata/Media?x=1',
      pagedFetcher([all.slice(0, 30), all.slice(30, 60), all.slice(60)]),
    );
    expect(complete).toBe(true);
    expect(rows).toHaveLength(67);
  });

  it('a multi-listing batch spanning pages yields A=5, B=0, C=67', async () => {
    const rowsA = Array.from({ length: 5 }, (_, i) => row(RRK.A, i));
    const rowsC = Array.from({ length: 67 }, (_, i) => row(RRK.C, i));
    const all = [...rowsA, ...rowsC]; // B legitimately returns nothing
    const { rows, complete } = await paginateMedia(
      'https://api.cotality.com/odata/Media?x=1',
      pagedFetcher([all.slice(0, 30), all.slice(30, 60), all.slice(60)]),
    );
    expect(complete).toBe(true);

    const grouped = groupWithPreSeed(
      [RRK.A, RRK.B, RRK.C],
      rows as unknown as Record<string, unknown>[],
    );
    expect(grouped.get(RRK.A)).toHaveLength(5);
    expect(grouped.get(RRK.C)).toHaveLength(67);
    // THE POINT: B is present as an empty array, not missing.
    expect(grouped.has(RRK.B)).toBe(true);
    expect(grouped.get(RRK.B)).toEqual([]);
  });

  it('WITHOUT the pre-seed, B would vanish — the original defect', () => {
    const legacy = new Map<string, unknown[]>();
    for (const m of [row(RRK.A, 0)] as Record<string, unknown>[]) {
      const lid = String(m.ResourceRecordKey);
      if (!legacy.has(lid)) legacy.set(lid, []);
      (legacy.get(lid) as unknown[]).push(m);
    }
    expect(legacy.has(RRK.B)).toBe(false); // <- silently unreconciled
  });
});

describe('INCOMPLETE fetch fails closed', () => {
  it('a failed page yields complete=false', async () => {
    const { complete } = await paginateMedia(
      'https://api.cotality.com/odata/Media?x=1',
      pagedFetcher([[row(RRK.C, 0)], null]),
    );
    expect(complete).toBe(false);
  });

  it('a failed FIRST page yields complete=false with zero rows — NOT authoritative empty', async () => {
    const { rows, complete } = await paginateMedia(
      'https://api.cotality.com/odata/Media?x=1',
      pagedFetcher([null]),
    );
    expect(complete).toBe(false);
    expect(rows).toHaveLength(0);
    // Zero rows + incomplete must never be treated as "provider has no media".
  });

  it('the runaway guard trips rather than looping forever', async () => {
    const neverEnding = async (): Promise<MediaPage> => ({ value: [], nextLink: 'again' });
    const { complete } = await paginateMedia('u', neverEnding, 5);
    expect(complete).toBe(false);
  });
});

describe('legacy Listing.media reconciliation via the EXISTING suppression guard', () => {
  const stored67 = Array.from({ length: 67 }, (_, i) => ({
    url: `https://api.cotality.com/x/${i}.jpg`, mediaType: 'Photo', order: i,
  }));

  it('stored [] + authoritative [] -> materially equal -> ZERO writes', () => {
    expect(mediaArraysMateriallyEqual([], [])).toBe(true);
  });

  it('stored 67 + authoritative [] -> NOT equal -> exactly one clear write', () => {
    expect(mediaArraysMateriallyEqual(stored67, [])).toBe(false);
  });

  it('second identical complete-empty cycle -> ZERO writes', () => {
    // After the clear, stored is [] and the next authoritative [] suppresses.
    expect(mediaArraysMateriallyEqual([], [])).toBe(true);
  });

  it('stored 67 + same 67 -> ZERO writes', () => {
    expect(mediaArraysMateriallyEqual(stored67, stored67)).toBe(true);
  });
});

describe('source lock — the sync.ts batch path', () => {
  const src = require('fs')
    .readFileSync(require('path').resolve(__dirname, '../sync.ts'), 'utf8')
    .replace(/\r\n?/g, '\n');

  it('uses the shared paginateMedia follower', () => {
    expect(src).toMatch(/import \{ paginateMedia \} from ["']\.\/media-sync["']/);
    expect(src).toMatch(/await paginateMedia\(/);
  });

  it('skips the batch when completeness is not proven', () => {
    expect(src).toMatch(/if \(!complete\)/);
    expect(src).toMatch(/mediaBatchesIncompleteSkipped\+\+/);
  });

  it('pre-seeds every requested key before grouping', () => {
    expect(src).toMatch(/for \(const key of batch\) mediaByListing\.set\(String\(key\), \[\]\)/);
  });

  it('does NOT tombstone normalized listing_media here (media-sync owns that)', () => {
    const start = src.indexOf('for (const key of batch) mediaByListing.set');
    const window = src.slice(start, start + 3000);
    expect(window).not.toMatch(/tombstoneVanished/);
    expect(window).not.toMatch(/listingMedia\.updateMany/);
  });

  it('still uses the archived-safe guard and material comparison for legacy media', () => {
    expect(src).toMatch(/archivedSafeMediaWhere\(listingId\)/);
    expect(src).toMatch(/mediaArraysMateriallyEqual\(existingMediaRow\.media, media\)/);
  });
});
