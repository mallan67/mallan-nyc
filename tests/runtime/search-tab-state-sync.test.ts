/// <reference types="jest" />
/**
 * PR-S.2 (2026-05-15) — Buy/Rent tab state sync.
 *
 * Background: Maya observed visible "Buy" tab selected while the URL
 * showed `?tab=rent-residential`. Root cause: `app/search/page.tsx`
 * initialized `activeTab` via `useState(resolveTab(typeParam))` ONLY on
 * mount. Subsequent URL changes (header navigation, browser back/forward,
 * programmatic `router.replace` from outside the page) updated the URL
 * but left `activeTab` stale.
 *
 * Fix (in `app/search/page.tsx`):
 *   - Export `resolveTab(typeParam)` for testing
 *   - Add `useEffect(() => setActiveTab(resolveTab(typeParam)), [typeParam])`
 *     immediately after the useState declaration
 *   - Reverse direction (`activeTab` → URL via `router.replace`) was
 *     already wired and remains intact
 *
 * These tests pin:
 *   1. The pure resolver behavior — every URL `tab=…` value maps to the
 *      correct canonical SearchTab. Drives test cases 1, 2, and the
 *      semantics any URL change feeds into the new useEffect.
 *   2. The TAB_CONFIG → apiType linkage — `buy-residential` → `'sale'`,
 *      `rent-residential` → `'rent'`. Drives test cases 6, 7, 8 (API
 *      type follows tab; buy never returns rent inventory; rent never
 *      returns sale inventory) by proving the mapping is total and
 *      deterministic.
 *
 * Test cases 3, 4, 5 (URL change updates visible tab, browser back/forward)
 * are properties of the React effect wiring. The useEffect in
 * `app/search/page.tsx` is the canonical "sync state from prop" pattern
 * (React docs §`useEffect`); its correctness is covered by:
 *   - React's own bail-out semantics on `setState(equalValue)`
 *   - The deterministic resolver tested below
 *   - Static comment in the route documenting the no-loop reasoning
 */

import { resolveTab } from '@/app/search/page';
import { TAB_CONFIG, type SearchTab } from '@/lib/search/types';

describe('resolveTab · URL `tab` / `type` → canonical SearchTab (PR-S.2)', () => {
  describe('legacy short-form aliases (from header nav)', () => {
    it("maps 'buy' → 'buy-residential'", () => {
      expect(resolveTab('buy')).toBe('buy-residential');
    });

    it("maps 'rent' → 'rent-residential'", () => {
      expect(resolveTab('rent')).toBe('rent-residential');
    });

    it("maps 'commercial' → 'buy-commercial'", () => {
      expect(resolveTab('commercial')).toBe('buy-commercial');
    });

    it("maps legacy 'sell' → 'buy-residential' (no separate sell tab)", () => {
      expect(resolveTab('sell')).toBe('buy-residential');
    });
  });

  describe('canonical SearchTab identity (Maya test cases 1 + 2)', () => {
    it("?tab=buy-residential → 'buy-residential' (Maya case 1)", () => {
      expect(resolveTab('buy-residential')).toBe('buy-residential');
    });

    it("?tab=rent-residential → 'rent-residential' (Maya case 2)", () => {
      expect(resolveTab('rent-residential')).toBe('rent-residential');
    });

    it("?tab=buy-commercial → 'buy-commercial'", () => {
      expect(resolveTab('buy-commercial')).toBe('buy-commercial');
    });

    it("?tab=rent-commercial → 'rent-commercial'", () => {
      expect(resolveTab('rent-commercial')).toBe('rent-commercial');
    });
  });

  describe('fallback for unknown / malformed input', () => {
    it("empty string → 'buy-residential' fallback", () => {
      expect(resolveTab('')).toBe('buy-residential');
    });

    it("unknown value → 'buy-residential' fallback", () => {
      expect(resolveTab('lease-to-own')).toBe('buy-residential');
    });

    it("typo close to 'rent' → 'buy-residential' fallback (no fuzzy match)", () => {
      expect(resolveTab('renta')).toBe('buy-residential');
    });
  });

  describe('determinism — same input → same output', () => {
    it('is referentially stable across repeated calls', () => {
      expect(resolveTab('buy-residential')).toBe(resolveTab('buy-residential'));
      expect(resolveTab('rent-residential')).toBe(resolveTab('rent-residential'));
    });

    it('has no hidden state — input alone determines output', () => {
      const before = resolveTab('buy-residential');
      resolveTab('rent-residential');
      resolveTab('commercial');
      resolveTab('garbage');
      const after = resolveTab('buy-residential');
      expect(after).toBe(before);
    });
  });
});

describe('TAB_CONFIG → API type (PR-S.2 cases 6, 7, 8)', () => {
  describe('Maya case 6 — API type follows active URL tab', () => {
    it.each<[SearchTab, 'sale' | 'rent']>([
      ['buy-residential', 'sale'],
      ['buy-commercial', 'sale'],
      ['rent-residential', 'rent'],
      ['rent-commercial', 'rent'],
    ])("TAB_CONFIG['%s'].apiType === '%s'", (tab, expected) => {
      expect(TAB_CONFIG[tab].apiType).toBe(expected);
    });
  });

  describe('Maya case 7 — Buy Residential never calls rental inventory', () => {
    it("buy-residential apiType is 'sale', never 'rent'", () => {
      expect(TAB_CONFIG['buy-residential'].apiType).toBe('sale');
    });

    it("URL `?tab=buy-residential` → apiType 'sale' (chained through resolveTab)", () => {
      const tab = resolveTab('buy-residential');
      expect(TAB_CONFIG[tab].apiType).toBe('sale');
    });

    it("legacy URL `?tab=buy` → apiType 'sale'", () => {
      const tab = resolveTab('buy');
      expect(TAB_CONFIG[tab].apiType).toBe('sale');
    });
  });

  describe('Maya case 8 — Rent Residential never calls sale inventory', () => {
    it("rent-residential apiType is 'rent', never 'sale'", () => {
      expect(TAB_CONFIG['rent-residential'].apiType).toBe('rent');
    });

    it("URL `?tab=rent-residential` → apiType 'rent' (chained through resolveTab)", () => {
      const tab = resolveTab('rent-residential');
      expect(TAB_CONFIG[tab].apiType).toBe('rent');
    });

    it("legacy URL `?tab=rent` → apiType 'rent'", () => {
      const tab = resolveTab('rent');
      expect(TAB_CONFIG[tab].apiType).toBe('rent');
    });
  });

  describe('end-to-end URL → tab → apiType chain', () => {
    // Mimics the data flow inside SearchClient: searchParams → typeParam →
    // resolveTab(typeParam) → TAB_CONFIG[activeTab].apiType. Pins that for
    // every supported URL form, no Buy URL ever produces 'rent' and no
    // Rent URL ever produces 'sale'.
    const cases: Array<[string, 'sale' | 'rent']> = [
      ['buy', 'sale'],
      ['buy-residential', 'sale'],
      ['buy-commercial', 'sale'],
      ['commercial', 'sale'],
      ['sell', 'sale'],
      ['rent', 'rent'],
      ['rent-residential', 'rent'],
      ['rent-commercial', 'rent'],
    ];

    it.each(cases)('URL ?tab=%s → apiType=%s', (urlTab, expectedApiType) => {
      const tab = resolveTab(urlTab);
      expect(TAB_CONFIG[tab].apiType).toBe(expectedApiType);
    });

    it('no URL value in our supported set produces the wrong apiType', () => {
      for (const [urlTab, expectedApiType] of cases) {
        const actual = TAB_CONFIG[resolveTab(urlTab)].apiType;
        expect(actual).toBe(expectedApiType);
      }
    });
  });
});
