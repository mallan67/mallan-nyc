/// <reference types="jest" />
/**
 * PR-S.3 (2026-05-15) — q/address alias for `/api/listings`.
 *
 * Pins the contract that:
 *   - `?q=…` populates `?address=…` when `address` is not already set
 *   - explicit `?address=…` always wins over `?q=…`
 *   - empty / whitespace-only `q` is ignored
 *   - other params (`type`, `borough`, `minPrice`, …) are never touched
 *
 * Once aliased, every downstream consumer of `searchParams` in
 * `app/api/listings/route.ts` — the cache-key construction, the DB filter
 * via `buildPublicListingDbSearch`, the Trestle fallback via
 * `buildPublicListingTrestleFilter`, the numbered-address heuristic —
 * sees the resolved `address` value automatically. This test exercises
 * the alias-resolution layer; downstream filter behavior is covered by
 * existing tests and the live production probes.
 */

import { resolveAddressAlias } from '@/app/api/listings/route';

describe('resolveAddressAlias · q/address alias (PR-S.3)', () => {
  describe('the headline use case — autocomplete picks an address', () => {
    it('aliases ?q=425 → ?address=425', () => {
      const params = new URLSearchParams('q=425');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('425');
      expect(params.get('q')).toBe('425'); // q preserved (no removal)
    });

    it('aliases ?q=425+park+avenue+south → ?address=425 park avenue south', () => {
      const params = new URLSearchParams('q=425+park+avenue+south');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('425 park avenue south');
    });

    it('does not modify ?type=sale or any other filter when aliasing', () => {
      const params = new URLSearchParams('type=sale&q=425&borough=Manhattan&minPrice=1000000');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('425');
      expect(params.get('type')).toBe('sale');
      expect(params.get('borough')).toBe('Manhattan');
      expect(params.get('minPrice')).toBe('1000000');
    });

    it('does not return sale inventory for ?type=rent&q=425 (type preserved)', () => {
      // The alias does not touch `type`. Downstream type-filtering logic
      // is unchanged, so `type=rent` still scopes the result set to
      // rentals only. (Pins the contract; the downstream filter is
      // covered by existing route tests + production probes.)
      const params = new URLSearchParams('type=rent&q=425');
      resolveAddressAlias(params);
      expect(params.get('type')).toBe('rent');
      expect(params.get('address')).toBe('425');
    });
  });

  describe('address wins — explicit ?address= takes priority', () => {
    it('keeps ?address=foo when ?q=bar is also present', () => {
      const params = new URLSearchParams('address=foo&q=bar');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('foo');
      expect(params.get('q')).toBe('bar'); // q preserved unchanged
    });

    it('does not overwrite ?address=425+park even if ?q=different', () => {
      const params = new URLSearchParams('address=425+park&q=carnegie+hall');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('425 park');
      expect(params.get('q')).toBe('carnegie hall');
    });
  });

  describe('empty / whitespace cases', () => {
    it('ignores empty ?q=', () => {
      const params = new URLSearchParams('q=');
      resolveAddressAlias(params);
      expect(params.get('address')).toBeNull();
    });

    it('ignores whitespace-only ?q=   ', () => {
      const params = new URLSearchParams();
      params.set('q', '   ');
      resolveAddressAlias(params);
      expect(params.get('address')).toBeNull();
    });

    it('trims whitespace around q value when aliasing', () => {
      const params = new URLSearchParams();
      params.set('q', '  425 Park  ');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('425 Park');
    });

    it('treats whitespace-only ?address= as empty and falls through to q', () => {
      const params = new URLSearchParams();
      params.set('address', '   ');
      params.set('q', '425');
      resolveAddressAlias(params);
      expect(params.get('address')).toBe('425');
    });

    it('no-op when both address and q are missing', () => {
      const params = new URLSearchParams('type=sale&borough=Manhattan');
      const before = params.toString();
      resolveAddressAlias(params);
      expect(params.toString()).toBe(before);
    });
  });

  describe('idempotency', () => {
    it('produces the same result on a second call', () => {
      const params = new URLSearchParams('q=425+park');
      resolveAddressAlias(params);
      const afterFirst = params.toString();
      resolveAddressAlias(params);
      expect(params.toString()).toBe(afterFirst);
      expect(params.get('address')).toBe('425 park');
    });
  });

  describe('does not invent fields not in either q or address', () => {
    it('does not add a `q` key when only address is present', () => {
      const params = new URLSearchParams('address=425');
      resolveAddressAlias(params);
      expect(params.has('q')).toBe(false);
    });

    it('does not touch unrelated keys', () => {
      const params = new URLSearchParams(
        'type=sale&q=425&borough=Manhattan&minPrice=1000000&maxPrice=5000000&beds=2&sort=price-asc',
      );
      resolveAddressAlias(params);
      const keys = Array.from(params.keys()).sort();
      // address is added; everything else preserved
      expect(keys).toEqual(
        ['address', 'beds', 'borough', 'maxPrice', 'minPrice', 'q', 'sort', 'type'],
      );
    });
  });
});
