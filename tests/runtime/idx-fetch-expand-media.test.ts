/// <reference types="jest" />
/**
 * PR-S.1c → PR-S.1e (2026-05-15) — `fetchFromTrestle()` `$expand` contract.
 *
 * Background:
 *   - PR-S.1c removed `$expand=Media` from the default (still included
 *     `$expand=CustomProperty` because the codebase assumed it was safe).
 *   - PR-S.1b production logs after PR-S.1c deploy proved Trestle ALSO
 *     rejects `$expand=CustomProperty($select=DownPaymentAssistance…,CustomFields)`
 *     with HTTP 400. Error text contained "CustomProperty",
 *     "DownPaymentAssistance", and "Could not find".
 *   - PR-S.1e (this contract): the default sends NO `$expand` at all.
 *     Both Media and CustomProperty are independently opt-in via strict
 *     equality `=== true`. CustomProperty, when opted in, is bare (no
 *     inner `$select`) until the schema is audited.
 *
 * These tests pin the contract so a future change cannot silently
 * re-enable a rejected expand path.
 */

import { fetchFromTrestle } from '@/lib/idx/fetch';

// Mock the auth module so the test doesn't need real Trestle credentials.
jest.mock('@/lib/idx/auth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('test-token'),
  invalidateToken: jest.fn(),
}));

// Helper — fetchFromTrestle URL-encodes its query string, so we decode via
// the URL API to compare `$expand` literally instead of grepping `%24expand`.
// Returns `null` when no $expand param is present at all (the new default).
function getExpandParam(url: string): string | null {
  return new URL(url).searchParams.get('$expand');
}

describe('fetchFromTrestle · $expand contract (PR-S.1c + PR-S.1e)', () => {
  let fetchMock: jest.SpyInstance;
  const capturedUrls: string[] = [];

  beforeEach(() => {
    capturedUrls.length = 0;
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

  describe('the new default — no $expand at all (PR-S.1e)', () => {
    it('omits the $expand query parameter entirely', async () => {
      await fetchFromTrestle({ filter: "ListingId eq 'RLS123'", top: 1, maxTotal: 1 });
      expect(capturedUrls.length).toBeGreaterThan(0);
      expect(getExpandParam(capturedUrls[0])).toBeNull();
    });

    it('does NOT include Media in $expand', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1 });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/Media/);
    });

    it('does NOT include CustomProperty in $expand (regression for PR-S.1e)', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1 });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/CustomProperty/);
    });
  });

  describe('explicit opt-in: expandMedia (PR-S.1c)', () => {
    it('includes Media when expandMedia: true', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandMedia: true });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).toMatch(/Media/);
    });

    it('does NOT include CustomProperty when only expandMedia: true (PR-S.1e separation)', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandMedia: true });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/CustomProperty/);
    });

    it('omits $expand entirely when expandMedia: false', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandMedia: false });
      expect(getExpandParam(capturedUrls[0])).toBeNull();
    });

    it('truthy non-true value cannot silently enable Media', async () => {
      await fetchFromTrestle({
        filter: 'X',
        top: 1,
        maxTotal: 1,
        // @ts-expect-error — intentionally testing non-strict-true value
        expandMedia: 1,
      });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/Media/);
    });
  });

  describe('explicit opt-in: expandCustomProperty (PR-S.1e)', () => {
    it('includes CustomProperty when expandCustomProperty: true', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandCustomProperty: true });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).toMatch(/CustomProperty/);
    });

    it('uses bare CustomProperty (NO inner $select) — the rejected payload', async () => {
      // The previous default was
      // `CustomProperty($select=DownPaymentAssistanceAmount,DownPaymentAssistanceCount,CustomFields)`
      // and Trestle rejected it. The opt-in form must NOT carry that
      // inner $select until the schema is audited.
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandCustomProperty: true });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/DownPaymentAssistance/);
      expect(expand).not.toMatch(/CustomFields/);
    });

    it('does NOT include Media when only expandCustomProperty: true', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandCustomProperty: true });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/Media/);
    });

    it('omits $expand entirely when expandCustomProperty: false', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1, expandCustomProperty: false });
      expect(getExpandParam(capturedUrls[0])).toBeNull();
    });

    it('truthy non-true value cannot silently enable CustomProperty', async () => {
      await fetchFromTrestle({
        filter: 'X',
        top: 1,
        maxTotal: 1,
        // @ts-expect-error — intentionally testing non-strict-true value
        expandCustomProperty: 1,
      });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).not.toMatch(/CustomProperty/);
    });
  });

  describe('both opt-ins together', () => {
    it('includes BOTH Media and CustomProperty when both flags are true', async () => {
      await fetchFromTrestle({
        filter: 'X',
        top: 1,
        maxTotal: 1,
        expandMedia: true,
        expandCustomProperty: true,
      });
      const expand = getExpandParam(capturedUrls[0]) ?? '';
      expect(expand).toMatch(/Media/);
      expect(expand).toMatch(/CustomProperty/);
    });

    it('default and both-explicit-false produce identical (absent) $expand', async () => {
      await fetchFromTrestle({ filter: "X", top: 1, maxTotal: 1 });
      const defaultExpand = getExpandParam(capturedUrls[0]);
      capturedUrls.length = 0;
      await fetchFromTrestle({
        filter: "X",
        top: 1,
        maxTotal: 1,
        expandMedia: false,
        expandCustomProperty: false,
      });
      const explicitFalseExpand = getExpandParam(capturedUrls[0]);
      expect(defaultExpand).toBeNull();
      expect(explicitFalseExpand).toBeNull();
      expect(defaultExpand).toBe(explicitFalseExpand);
    });
  });
});
