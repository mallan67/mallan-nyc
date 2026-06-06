/// <reference types="jest" />
/**
 * Featured fill-six — page deeper until enough displayable rows are collected.
 *
 * The homepage Featured config sorts by `newest`, and the newest listings
 * disproportionately lack media coverage (the listing_media backfill gap —
 * production diagnosis: 38 of the 48 newest Manhattan sale listings were
 * photoless). A single page therefore yields fewer than `limit` displayable
 * rows, leaving the section under-filled (5 cards instead of 6). This helper
 * pages across the feed until enough Coming-Soon-free, photo-bearing rows are
 * collected. Interim fill-fix until media coverage is backfilled.
 */
import {
  collectDisplayableFeatured,
  filterFeaturedDisplayable,
} from '@/lib/featured/featured-ordering';

const photo = (n: number) => ({ url: `https://cdn.example.com/a/${n}.jpg`, mediaType: 'Photo', order: n });
const good = (id: string) => ({ id, status: 'Active', media: [photo(0)] });
const comingSoon = (id: string) => ({ id, status: 'ComingSoon', media: [photo(0)] });
const photoless = (id: string) => ({ id, status: 'Active', media: [] });

/** Build a fetchPage backed by a fixed array, paginating by skip/pageSize. */
function pagedFetcher<T>(all: T[]) {
  const calls: Array<{ skip: number; size: number }> = [];
  const fetchPage = async (skip: number, size: number) => {
    calls.push({ skip, size });
    return all.slice(skip, skip + size);
  };
  return { fetchPage, calls };
}

describe('collectDisplayableFeatured', () => {
  it('pages past photoless/ComingSoon rows until target displayable collected', async () => {
    // Page 0 (size 4): only 1 displayable; page 1: 3 more → reach target 4.
    const all = [
      good('A'), comingSoon('B'), photoless('C'), photoless('D'), // page 0 → A
      good('E'), good('F'), photoless('G'), good('H'),            // page 1 → E,F,H
    ];
    const { fetchPage, calls } = pagedFetcher(all);
    const out = await collectDisplayableFeatured(fetchPage, { target: 4, pageSize: 4, maxPages: 5 });
    expect(out.map((l) => l.id)).toEqual(['A', 'E', 'F', 'H']);
    expect(calls.length).toBe(2); // needed 2 pages
  });

  it('stops early once target is reached (does not over-page)', async () => {
    const all = Array.from({ length: 40 }, (_, i) => good(`G${i}`));
    const { fetchPage, calls } = pagedFetcher(all);
    const out = await collectDisplayableFeatured(fetchPage, { target: 6, pageSize: 8, maxPages: 5 });
    expect(out.length).toBeGreaterThanOrEqual(6);
    expect(calls.length).toBe(1); // first page already had 8 ≥ 6
  });

  it('stops when the feed is exhausted (short page) even if target not met', async () => {
    const all = [good('A'), photoless('B'), good('C')]; // only 2 displayable total
    const { fetchPage, calls } = pagedFetcher(all);
    const out = await collectDisplayableFeatured(fetchPage, { target: 6, pageSize: 8, maxPages: 5 });
    expect(out.map((l) => l.id)).toEqual(['A', 'C']);
    expect(calls.length).toBe(1); // short page (3 < 8) → exhausted, stop
  });

  it('honors maxPages cap when every page is mostly photoless', async () => {
    // 5 pages of 4, each with exactly 1 displayable → with maxPages 3 we get 3.
    const pages: ReturnType<typeof good>[] = [];
    for (let p = 0; p < 5; p++) pages.push(good(`P${p}`), photoless(`x${p}0`), photoless(`x${p}1`), photoless(`x${p}2`));
    const { fetchPage, calls } = pagedFetcher(pages);
    const out = await collectDisplayableFeatured(fetchPage, { target: 6, pageSize: 4, maxPages: 3 });
    expect(out.map((l) => l.id)).toEqual(['P0', 'P1', 'P2']);
    expect(calls.length).toBe(3); // capped
  });

  it('result only contains displayable rows (filter parity)', async () => {
    const all = [good('A'), comingSoon('B'), photoless('C'), good('D')];
    const { fetchPage } = pagedFetcher(all);
    const out = await collectDisplayableFeatured(fetchPage, { target: 10, pageSize: 4, maxPages: 2 });
    expect(out).toEqual(filterFeaturedDisplayable(all));
  });
});
