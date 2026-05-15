/// <reference types="jest" />
/**
 * PR-S.1c (2026-05-15) — verify that `fetchFromTrestle()` no longer sends
 * `$expand=Media` by default.
 *
 * Background: production Vercel logs after PR-S.1b proved Trestle is
 * CONSISTENTLY rejecting requests carrying `$expand=Media` with HTTP 400.
 * Both `/api/listings/suggest` and `/api/cron/idx-sync` were broken.
 * `fetchSingleListing` had a long-standing comment documenting this exact
 * behavior. PR-S.1c flips the default so `$expand=Media` is only included
 * when callers explicitly pass `expandMedia: true`.
 *
 * These tests pin the new contract so a future change cannot silently
 * re-enable the rejected expand path.
 */

import { fetchFromTrestle } from '@/lib/idx/fetch';

// Mock the auth module so the test doesn't need real Trestle credentials.
jest.mock('@/lib/idx/auth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('test-token'),
  invalidateToken: jest.fn(),
}));

// Helper — fetchFromTrestle URL-encodes its query string, so we decode via
// the URL API to compare `$expand` literally instead of grepping `%24expand`.
function getExpandParam(url: string): string | null {
  return new URL(url).searchParams.get('$expand');
}

describe('fetchFromTrestle · $expand=Media default behavior (PR-S.1c)', () => {
  let fetchMock: jest.SpyInstance;
  const capturedUrls: string[] = [];

  beforeEach(() => {
    capturedUrls.length = 0;
    // Mock global fetch. Capture the URL it's called with. Return an empty
    // OData result so fetchFromTrestle's pagination loop terminates cleanly.
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      capturedUrls.push(url);
      return new Response(
        JSON.stringify({ value: [], '@odata.count': 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('the new default (no expandMedia option passed)', () => {
    it('does NOT include Media in $expand', async () => {
      await fetchFromTrestle({ filter: "ListingId eq 'RLS123'", top: 1, maxTotal: 1 });
      expect(capturedUrls.length).toBeGreaterThan(0);
      const expand = getExpandParam(capturedUrls[0]) || '';
      expect(expand).not.toMatch(/Media/);
    });

    it('still includes CustomProperty in $expand (DPA + REBNY fields)', async () => {
      await fetchFromTrestle({ filter: "ListingId eq 'RLS123'", top: 1, maxTotal: 1 });
      const expand = getExpandParam(capturedUrls[0]) || '';
      // CustomProperty remains in the expand because Trestle accepts it
      // (verified against long-standing expandMedia:false callers in fetch-comps).
      expect(expand).toMatch(/CustomProperty/);
    });
  });

  describe('explicit opt-in (expandMedia: true)', () => {
    it('DOES include Media in $expand when caller explicitly opts in', async () => {
      await fetchFromTrestle({
        filter: "ListingId eq 'RLS123'",
        top: 1,
        maxTotal: 1,
        expandMedia: true,
      });
      expect(capturedUrls.length).toBeGreaterThan(0);
      const expand = getExpandParam(capturedUrls[0]) || '';
      expect(expand).toMatch(/Media/);
      expect(expand).toMatch(/CustomProperty/);
    });
  });

  describe('explicit opt-out (expandMedia: false)', () => {
    it('does NOT include Media in $expand (matches new default)', async () => {
      await fetchFromTrestle({
        filter: "ListingId eq 'RLS123'",
        top: 1,
        maxTotal: 1,
        expandMedia: false,
      });
      const expand = getExpandParam(capturedUrls[0]) || '';
      expect(expand).not.toMatch(/Media/);
      expect(expand).toMatch(/CustomProperty/);
    });

    it('produces an identical $expand to the new default', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1 });
      const defaultExpand = getExpandParam(capturedUrls[0]);
      capturedUrls.length = 0;
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandMedia: false });
      const explicitFalseExpand = getExpandParam(capturedUrls[0]);
      expect(defaultExpand).toBe(explicitFalseExpand);
    });
  });

  describe('the bug class this PR prevents', () => {
    it('cannot silently include Media via a truthy non-true value', async () => {
      // Belt-and-suspenders: a caller writing `expandMedia: 1` or
      // `expandMedia: 'yes'` (TS would reject but JS at runtime might allow)
      // must NOT trigger media expand. Only the strict literal `true` does.
      await fetchFromTrestle({
        filter: 'X',
        top: 1,
        maxTotal: 1,
        // @ts-expect-error — intentionally testing non-strict-true value
        expandMedia: 1,
      });
      const expand = getExpandParam(capturedUrls[0]) || '';
      expect(expand).not.toMatch(/Media/);
    });
  });
});
