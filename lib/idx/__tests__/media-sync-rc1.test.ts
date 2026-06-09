/// <reference types="jest" />
/**
 * RC1 — Cotality Media pagination/cursor correctness (pure-function proofs).
 *
 * These are the behavioral RED→GREEN proofs (§F) for the three pure helpers RC1
 * introduces. DB-backed cursor advance + the runMediaSync complete-only/tombstone
 * behaviors live in media-sync-watermark.test.ts and media-sync-orchestration.test.ts
 * (which use the Prisma mock harness).
 *
 *   1. paginateMedia      — follow @odata.nextLink until exhausted; a failed page
 *                           ⇒ complete:false (caller must NOT destructively write).
 *   2. buildPropertyQuery — keyset continuation (ts + ListingKey tie-breaker) so a
 *                           run of >listingsPerRun listings sharing one
 *                           PhotosChangeTimestamp cannot starve the cursor.
 *   3. pickKeysetWatermark— advance only to the last contiguously fully-processed
 *                           listing; never past a failed/incomplete one.
 */
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import {
  paginateMedia,
  buildPropertyQuery,
  pickKeysetWatermark,
  type MediaPage,
  type PropertyQueryCursor,
  type ProcessedListing,
} from '@/lib/idx/media-sync';

// ─── 1. paginateMedia — @odata.nextLink exhaustion ────────────────────────
describe('paginateMedia — follow @odata.nextLink until exhausted', () => {
  const row = (k: string) => ({ MediaKey: k, MediaURL: `https://api.cotality.com/${k}.jpg` });

  it('single page (no nextLink) → complete, all rows', async () => {
    const fetchPage = jest.fn(async (): Promise<MediaPage> => ({ value: [row('A'), row('B')], nextLink: null }));
    const res = await paginateMedia('https://api.cotality.com/odata/Media?p=1', fetchPage);
    expect(res.complete).toBe(true);
    expect(res.rows.map((r) => (r as { MediaKey: string }).MediaKey)).toEqual(['A', 'B']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('three pages via nextLink → complete, rows concatenated in page order', async () => {
    const fetchPage = jest
      .fn<Promise<MediaPage>, [string]>()
      .mockResolvedValueOnce({ value: [row('A')], nextLink: 'URL2' })
      .mockResolvedValueOnce({ value: [row('B')], nextLink: 'URL3' })
      .mockResolvedValueOnce({ value: [row('C')], nextLink: null });
    const res = await paginateMedia('URL1', fetchPage);
    expect(res.complete).toBe(true);
    expect(res.rows.map((r) => (r as { MediaKey: string }).MediaKey)).toEqual(['A', 'B', 'C']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual(['URL1', 'URL2', 'URL3']);
  });

  it('a failing page → complete:false (incomplete) with only the rows fetched so far', async () => {
    const fetchPage = jest
      .fn<Promise<MediaPage>, [string]>()
      .mockResolvedValueOnce({ value: [row('A')], nextLink: 'URL2' })
      .mockRejectedValueOnce(new Error('HTTP 503 on page 2'));
    const res = await paginateMedia('URL1', fetchPage);
    expect(res.complete).toBe(false);
    expect(res.rows.map((r) => (r as { MediaKey: string }).MediaKey)).toEqual(['A']);
  });

  it('runaway nextLink (exceeds maxPages) → complete:false (fail closed)', async () => {
    const fetchPage = jest.fn(async (): Promise<MediaPage> => ({ value: [row('X')], nextLink: 'NEVER_ENDS' }));
    const res = await paginateMedia('URL1', fetchPage, 5);
    expect(res.complete).toBe(false);
    expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

// ─── 2. buildPropertyQuery — keyset continuation ──────────────────────────
describe('buildPropertyQuery — keyset continuation (no same-timestamp starvation)', () => {
  const fallbackSince = new Date('2026-05-01T00:00:00Z');
  const TS = new Date('2026-06-01T00:00:00Z');

  it('first run (null cursor) → ge fallbackSince, ordered ts asc then ListingKey asc', () => {
    const cursor: PropertyQueryCursor = { lastPhotosChange: null, lastListingKey: null, fallbackSince };
    const f = buildPropertyQuery(cursor, 50).get('$filter') ?? '';
    expect(f).toContain(`PhotosChangeTimestamp ge ${fallbackSince.toISOString()}`);
    expect(buildPropertyQuery(cursor, 50).get('$orderby')).toBe('PhotosChangeTimestamp asc,ListingKey asc');
  });

  it('transition run (ts set, key null) → inclusive ge ts (no tie-breaker yet)', () => {
    const cursor: PropertyQueryCursor = { lastPhotosChange: TS, lastListingKey: null, fallbackSince };
    const f = buildPropertyQuery(cursor, 50).get('$filter') ?? '';
    expect(f).toContain(`PhotosChangeTimestamp ge ${TS.toISOString()}`);
    expect(f).not.toContain('ListingKey gt');
  });

  it('keyset run (ts + key) → (pct gt ts) OR (pct eq ts AND ListingKey gt key)', () => {
    const cursor: PropertyQueryCursor = { lastPhotosChange: TS, lastListingKey: 'RLS0050', fallbackSince };
    const f = buildPropertyQuery(cursor, 50).get('$filter') ?? '';
    expect(f).toContain(`PhotosChangeTimestamp gt ${TS.toISOString()}`);
    expect(f).toContain(`PhotosChangeTimestamp eq ${TS.toISOString()} and ListingKey gt 'RLS0050'`);
  });

  it('escapes single quotes in the ListingKey tie-breaker', () => {
    const cursor: PropertyQueryCursor = { lastPhotosChange: TS, lastListingKey: "O'Brien", fallbackSince };
    const f = buildPropertyQuery(cursor, 50).get('$filter') ?? '';
    expect(f).toContain("ListingKey gt 'O''Brien'");
  });

  it('keyset run EXCLUDES the already-processed head (the >50 same-ts resume)', () => {
    // After processing 50 listings all at TS ending at RLS0050, the next run must
    // resume AFTER RLS0050 at the same timestamp — not re-fetch the first 50.
    const cursor: PropertyQueryCursor = { lastPhotosChange: TS, lastListingKey: 'RLS0050', fallbackSince };
    const f = buildPropertyQuery(cursor, 50).get('$filter') ?? '';
    expect(f).toContain("ListingKey gt 'RLS0050'");
    expect(f).not.toContain(`PhotosChangeTimestamp ge ${TS.toISOString()}`); // not the inclusive form
  });
});

// ─── 3. pickKeysetWatermark — advance only to last fully-processed ─────────
describe('pickKeysetWatermark — never advance past a failed/incomplete listing', () => {
  const at = (iso: string) => new Date(iso);
  const ok = (key: string, ts: string): ProcessedListing => ({ listingKey: key, photosChangeTs: at(ts), ok: true });
  const bad = (key: string, ts: string): ProcessedListing => ({ listingKey: key, photosChangeTs: at(ts), ok: false });

  it('all processed ok → last entry (ts, key)', () => {
    const wm = pickKeysetWatermark([ok('K1', '2026-06-01T00:00:00Z'), ok('K2', '2026-06-02T00:00:00Z')]);
    expect(wm?.last_listing_key).toBe('K2');
    expect(wm?.last_photos_change.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('failure at index 2 → advances only to index 1 (does NOT pass the failure)', () => {
    const wm = pickKeysetWatermark([
      ok('K1', '2026-06-01T00:00:00Z'),
      ok('K2', '2026-06-02T00:00:00Z'),
      bad('K3', '2026-06-03T00:00:00Z'),
      ok('K4', '2026-06-04T00:00:00Z'), // later success must NOT leapfrog the K3 failure
    ]);
    expect(wm?.last_listing_key).toBe('K2');
  });

  it('first listing failed → null (no advancement at all)', () => {
    expect(pickKeysetWatermark([bad('K1', '2026-06-01T00:00:00Z'), ok('K2', '2026-06-02T00:00:00Z')])).toBeNull();
  });

  it('empty batch → null (caller must preserve the prior cursor + tie-breaker)', () => {
    expect(pickKeysetWatermark([])).toBeNull();
  });

  it('advances through >50 listings sharing ONE PhotosChangeTimestamp (anti-starvation)', () => {
    const sameTs = '2026-06-01T00:00:00Z';
    const batch: ProcessedListing[] = Array.from({ length: 73 }, (_, i) =>
      ok(`RLS${String(i + 1).padStart(4, '0')}`, sameTs),
    );
    const wm = pickKeysetWatermark(batch);
    expect(wm?.last_photos_change.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(wm?.last_listing_key).toBe('RLS0073'); // the LAST one — cursor moves through all 73 at the same ts
  });

  it('an ok listing with a null PhotosChangeTimestamp is not a watermark anchor but does not halt', () => {
    const wm = pickKeysetWatermark([
      ok('K1', '2026-06-01T00:00:00Z'),
      { listingKey: 'K2', photosChangeTs: null, ok: true },
      ok('K3', '2026-06-03T00:00:00Z'),
    ]);
    expect(wm?.last_listing_key).toBe('K3');
  });
});
