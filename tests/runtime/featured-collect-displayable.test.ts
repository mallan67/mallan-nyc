/// <reference types="jest" />
/**
 * Featured fill-six — page deeper until enough displayable rows are collected to
 * fill the ORDERED grid.
 *
 * The homepage Featured config sorts by `newest`, and the newest listings
 * disproportionately lack media coverage (the listing_media backfill gap —
 * production diagnosis: 38 of the 48 newest Manhattan sale listings were
 * photoless). A single page therefore yields fewer than `limit` displayable
 * rows, leaving the section under-filled (5 cards instead of 6).
 *
 * Two Codex #368 corrections pinned here:
 *  - The stop condition is a caller-supplied `enough(collected)` predicate that
 *    runs the REAL ordering (post-dedupe count), because orderFeaturedListings
 *    can collapse multiple general rows against one Mallan exclusive — a raw
 *    `collected.length >= limit` check could still under-fill.
 *  - `batch.length < pageSize` is NOT treated as exhaustion: `/api/listings`
 *    post-filters a page (returns fewer than requested) while more results
 *    exist, so only an EMPTY page (or maxPages) stops the loop.
 */
import {
  collectDisplayableFeatured,
} from '@/lib/featured/featured-ordering';

const photo = (n: number) => ({ url: `https://cdn.example.com/a/${n}.jpg`, mediaType: 'Photo', order: n });
const good = (id: string, addr = id) => ({ id, status: 'Active', media: [photo(0)], addr });
const comingSoon = (id: string) => ({ id, status: 'ComingSoon', media: [photo(0)], addr: id });
const photoless = (id: string) => ({ id, status: 'Active', media: [] as ReturnType<typeof photo>[], addr: id });

const countAtLeast = (n: number) => (c: { id: string }[]) => c.length >= n;

/** fetchPage backed by an explicit per-page list; out-of-range pages return []. */
function fixedPagesFetcher<T>(pages: T[][]) {
  const calls: Array<{ skip: number; size: number }> = [];
  const fetchPage = async (skip: number, size: number) => {
    calls.push({ skip, size });
    return pages[Math.floor(skip / size)] ?? [];
  };
  return { fetchPage, calls };
}

describe('collectDisplayableFeatured', () => {
  it('pages past photoless/ComingSoon until enough displayable collected', async () => {
    const pages = [
      [good('A'), comingSoon('B'), photoless('C'), photoless('D')], // page 0 → A
      [good('E'), good('F'), photoless('G'), good('H')],            // page 1 → E,F,H
    ];
    const { fetchPage, calls } = fixedPagesFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { enough: countAtLeast(4), pageSize: 4, maxPages: 5 });
    expect(out.map((l) => l.id)).toEqual(['A', 'E', 'F', 'H']);
    expect(calls.length).toBe(2);
  });

  it('stops early once `enough` is satisfied (no over-paging)', async () => {
    const pages = [Array.from({ length: 8 }, (_, i) => good(`G${i}`))];
    const { fetchPage, calls } = fixedPagesFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { enough: countAtLeast(6), pageSize: 8, maxPages: 5 });
    expect(out.length).toBeGreaterThanOrEqual(6);
    expect(calls.length).toBe(1);
  });

  // Codex #368: a short (non-empty) page must NOT stop the loop.
  it('keeps paging when a page is short but not empty (API post-filtering)', async () => {
    const pages = [
      [good('A'), comingSoon('B'), photoless('C')], // page 0: only 3 rows returned (< pageSize 8), 1 displayable
      [good('D'), good('E'), good('F'), good('G'), good('H'), good('I')], // page 1: 6 displayable
    ];
    const { fetchPage, calls } = fixedPagesFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { enough: countAtLeast(6), pageSize: 8, maxPages: 5 });
    expect(out.length).toBeGreaterThanOrEqual(6);
    expect(calls.length).toBe(2); // did NOT treat the short page 0 as exhausted
  });

  it('stops on an EMPTY page (true exhaustion) even if `enough` not met', async () => {
    const pages = [[good('A'), photoless('B'), good('C')]]; // page 1 → []
    const { fetchPage, calls } = fixedPagesFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { enough: countAtLeast(6), pageSize: 8, maxPages: 5 });
    expect(out.map((l) => l.id)).toEqual(['A', 'C']);
    expect(calls.length).toBe(2); // page 0 (2 displayable), page 1 empty → stop
  });

  it('honors the maxPages cap', async () => {
    const pages = Array.from({ length: 5 }, (_, p) => [good(`P${p}`), photoless(`x${p}`)]);
    const { fetchPage, calls } = fixedPagesFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { enough: countAtLeast(6), pageSize: 2, maxPages: 3 });
    expect(out.map((l) => l.id)).toEqual(['P0', 'P1', 'P2']);
    expect(calls.length).toBe(3);
  });

  // Codex #368: the stop condition must reflect the POST-DEDUPE ordered count,
  // not the raw collected count — multiple rows can collapse to one.
  it('keeps paging when the `enough` predicate dedupes collected rows (collapsed twins)', async () => {
    // enough = at least 4 UNIQUE addresses. Page 0 has 4 rows but only 2 unique
    // addrs (twins), so raw length 4 is "enough" by count but only 2 ordered.
    const enoughUnique = (c: { addr: string }[]) => new Set(c.map((x) => x.addr)).size >= 4;
    const pages = [
      [good('A', 'addr1'), good('A2', 'addr1'), good('B', 'addr2'), good('B2', 'addr2')], // 4 rows, 2 unique addrs
      [good('C', 'addr3'), good('D', 'addr4')], // 2 more unique → 4 unique total
    ];
    const { fetchPage, calls } = fixedPagesFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { enough: enoughUnique, pageSize: 4, maxPages: 5 });
    expect(new Set(out.map((l) => l.addr)).size).toBeGreaterThanOrEqual(4);
    expect(calls.length).toBe(2); // raw count 4 on page 0 did NOT stop it (only 2 unique)
  });
});
