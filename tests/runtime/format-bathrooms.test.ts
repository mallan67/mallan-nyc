/// <reference types="jest" />
/**
 * Hotfix 1 — bathroom display math.
 *
 * Live bug (audit memory/AUDIT-2026-05-12.md re-confirmed during 6-agent
 * sweep on 2026-05-13): every listing card across `app/components/*` and
 * `app/listing/[id]/page.tsx` rendered baths with the pattern
 *
 *   `${full}${half > 0 ? `.${half}` : ''} Bath`
 *
 * For `full=2, half=1` that produces the literal string "2.1 Bath" — but a
 * single half-bath is 0.5, so the correct display is "2.5 Bath". The bug
 * appeared in 6 sites because no shared formatter existed; each component
 * reimplemented the same broken concatenation.
 *
 * TDD discipline:
 *   1. Author this test BEFORE creating `lib/format/bathrooms.ts`.
 *   2. Watch it fail with "Cannot find module" (module doesn't exist).
 *   3. Implement minimal `formatBathrooms()` so the tests pass.
 *   4. Refactor the 6 buggy components to call it (tests stay green).
 *
 * Half-bath maths: each `bathroomsHalf` row stores the COUNT of half-baths,
 * not a decimal fraction. So `half=1` = 0.5 added, `half=2` = 1.0 added,
 * `half=3` = 1.5 added. The total is `full + (half × 0.5)`.
 */

import { formatBathrooms } from '@/lib/format/bathrooms';

describe('formatBathrooms · the 425 Park bathroom bug class', () => {
  describe('single-half-bath (the headline bug)', () => {
    it('(full=2, half=1) renders "2.5", NOT "2.1"', () => {
      expect(formatBathrooms(2, 1)).toBe('2.5');
    });

    it('(full=1, half=1) renders "1.5"', () => {
      expect(formatBathrooms(1, 1)).toBe('1.5');
    });

    it('(full=3, half=1) renders "3.5"', () => {
      expect(formatBathrooms(3, 1)).toBe('3.5');
    });

    it('(full=0, half=1) renders "0.5"', () => {
      expect(formatBathrooms(0, 1)).toBe('0.5');
    });
  });

  describe('multi-half-bath (the other shape of the bug)', () => {
    it('(full=2, half=2) renders "3", NOT "2.2"', () => {
      // Two half-baths = 1.0 added → 3.0 total → display as "3" (no .0).
      expect(formatBathrooms(2, 2)).toBe('3');
    });

    it('(full=2, half=3) renders "3.5", NOT "2.3"', () => {
      expect(formatBathrooms(2, 3)).toBe('3.5');
    });

    it('(full=1, half=4) renders "3", NOT "1.4"', () => {
      expect(formatBathrooms(1, 4)).toBe('3');
    });
  });

  describe('zero / null / undefined', () => {
    it('(full=0, half=0) renders "0"', () => {
      expect(formatBathrooms(0, 0)).toBe('0');
    });

    it('(full=2, half=0) renders "2"', () => {
      expect(formatBathrooms(2, 0)).toBe('2');
    });

    it('(full=null, half=null) renders "0"', () => {
      expect(formatBathrooms(null, null)).toBe('0');
    });

    it('(full=undefined, half=undefined) renders "0"', () => {
      expect(formatBathrooms(undefined, undefined)).toBe('0');
    });

    it('(full=2, half=null) renders "2"', () => {
      expect(formatBathrooms(2, null)).toBe('2');
    });

    it('(full=null, half=1) renders "0.5"', () => {
      expect(formatBathrooms(null, 1)).toBe('0.5');
    });
  });

  describe('defensive — non-finite / negative inputs', () => {
    it('NaN inputs collapse to "0"', () => {
      expect(formatBathrooms(NaN, NaN)).toBe('0');
      expect(formatBathrooms(NaN, 1)).toBe('0.5');
      expect(formatBathrooms(2, NaN)).toBe('2');
    });

    it('negative inputs clamp to 0', () => {
      expect(formatBathrooms(-1, 0)).toBe('0');
      expect(formatBathrooms(2, -3)).toBe('2');
    });

    it('Infinity inputs collapse to "0"', () => {
      expect(formatBathrooms(Infinity, 1)).toBe('0.5');
      expect(formatBathrooms(2, Infinity)).toBe('2');
    });
  });

  describe('regression guards', () => {
    it('does NOT use string concatenation of the half-count as a decimal digit', () => {
      // If a future refactor reverts to `${full}.${half}` syntax, this case
      // pins the failure. half=9 would otherwise render as "2.9" instead of
      // the correct 6.5 (two-full + nine-halves = 2 + 4.5 = 6.5).
      expect(formatBathrooms(2, 9)).toBe('6.5');
    });

    it('result is always n or n.5 — never n.1, n.2, n.3, n.4, n.6, n.7, n.8, n.9', () => {
      for (let full = 0; full <= 5; full++) {
        for (let half = 0; half <= 6; half++) {
          const result = formatBathrooms(full, half);
          // Either "n" (integer) or "n.5" (half-step) — never any other decimal.
          expect(result).toMatch(/^\d+(\.5)?$/);
        }
      }
    });
  });
});
