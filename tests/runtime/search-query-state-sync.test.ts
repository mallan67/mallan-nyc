/// <reference types="jest" />
/**
 * PR-S.2b (2026-05-15) — searchQuery URL → state sync.
 *
 * Background: PR #131 closed the URL → `activeTab` sync gap on
 * `app/search/page.tsx`. Investigation after that landed flagged the
 * exact same architectural bug on `searchQuery`: the state was
 * initialized from URL params only on mount via
 *   const [searchQuery, setSearchQuery] = useState(queryParam || neighborhoodParam);
 * with no useEffect to re-sync when those URL params changed.
 *
 * Repro path (pre-fix):
 *   1. User lands on `/search` (empty input, no URL params).
 *   2. Clicks a saved-search link or header-nav item with
 *      `?q=…` or `?neighborhood=…`.
 *   3. Next.js `<Link>` updates the URL → `useSearchParams()` updates
 *      → `queryParam`/`neighborhoodParam` change.
 *   4. `searchQuery` state stays at its initial empty value because the
 *      `useState` initializer fires only on mount.
 *   5. Toolbar input shows empty; `resolvedSearch` memo returns empty;
 *      API request omits `address`/`neighborhood`; listing results do
 *      not match the URL the user just navigated to.
 *
 * Fix (in `app/search/page.tsx`):
 *   - Export `resolveSearchQuery(queryParam, neighborhoodParam)` for
 *     testing — pure helper mirroring the `useState` initializer logic.
 *   - Use it in BOTH the `useState` initializer AND a new
 *     `useEffect(() => setSearchQuery(resolveSearchQuery(...)),
 *                [queryParam, neighborhoodParam])` immediately after
 *     the activeTab sync useEffect.
 *   - The reverse direction (`searchQuery` → URL via
 *     `window.history.replaceState`) was already wired and remains
 *     intact. The state→URL writer uses `history.replaceState` rather
 *     than `router.replace`, so `useSearchParams()` does NOT re-fire
 *     after a user types in the toolbar — the two effects cannot loop.
 *
 * These tests pin:
 *   1. Pure resolver behavior — every (q, neighborhood) tuple maps to
 *      the correct canonical searchQuery value. Covers the precedence
 *      rule (q wins over neighborhood) and the empty-fallback rule.
 *   2. Source-level regression assertion — `app/search/page.tsx`
 *      contains a useEffect that calls
 *      `setSearchQuery(resolveSearchQuery(queryParam, neighborhoodParam))`
 *      with `[queryParam, neighborhoodParam]` in its deps array. If a
 *      future refactor accidentally removes the effect or trims the
 *      deps array, this test fails. (Same brittle-but-cheap convention
 *      as the existing PR-S.4 `header-nav-townhouse.test.ts` source
 *      regex check.)
 *
 * Out of scope for PR-S.2b (flagged as follow-up PR-S.2c risks):
 *   - `viewMode` (line ~244 — `useState(viewParam ? viewParam : 'split')`)
 *   - `selectedNeighborhoods` (line ~262 — `useState(...searchParams.get('neighborhoods'))`)
 *   - `filters` (line ~273 — `useState(() => ({ ...all-filter-params-on-mount }))`)
 * Each has the same architectural shape (URL-derived useState initializer
 * with no URL→state sync useEffect) and the same class of stale-state
 * bug. PR-S.2c will address them as a single batch with shared helper
 * patterns; bundling them into PR-S.2b would have made this surgical fix
 * noisier and harder to verify.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

import { resolveSearchQuery } from '@/app/search/page';

const SEARCH_PAGE_SOURCE_PATH = path.resolve(__dirname, '../../app/search/page.tsx');

describe('resolveSearchQuery · URL ?q / ?neighborhood → searchQuery state (PR-S.2b)', () => {
  describe('precedence — q wins over neighborhood', () => {
    it("returns q when both q and neighborhood are present", () => {
      expect(resolveSearchQuery('425 Park Ave', 'Upper East Side')).toBe('425 Park Ave');
    });

    it("returns q even when neighborhood is the more specific value", () => {
      // Neighborhood names are full strings; q can be a partial address.
      // The user's most recent input is q, so q wins.
      expect(resolveSearchQuery('425', 'Tribeca')).toBe('425');
    });

    it("returns q when q has whitespace and neighborhood is empty", () => {
      // Whitespace is preserved — the toolbar input echoes it back; the
      // downstream resolvedSearch memo (line ~346) handles trimming.
      // resolveSearchQuery's job is the precedence rule, not whitespace
      // normalization.
      expect(resolveSearchQuery('  hello  ', '')).toBe('  hello  ');
    });
  });

  describe('single-source resolution', () => {
    it("returns q when only q is present", () => {
      expect(resolveSearchQuery('425 Park Ave', '')).toBe('425 Park Ave');
    });

    it("returns neighborhood when only neighborhood is present (header nav case)", () => {
      // This is the header-nav scenario: user clicks
      // "Neighborhoods → Upper East Side" → URL becomes
      // ?neighborhood=Upper%20East%20Side. q is empty because the user
      // never typed in the toolbar. resolveSearchQuery returns the
      // neighborhood so the toolbar input pre-populates.
      expect(resolveSearchQuery('', 'Upper East Side')).toBe('Upper East Side');
    });

    it("returns multi-word neighborhood with internal whitespace preserved", () => {
      expect(resolveSearchQuery('', 'Hell’s Kitchen')).toBe('Hell’s Kitchen');
    });
  });

  describe('empty fallback', () => {
    it("returns empty string when both q and neighborhood are empty", () => {
      // Cold page load with no URL params. searchQuery should
      // initialize empty so the toolbar input is empty and the
      // resolvedSearch memo returns no API filters.
      expect(resolveSearchQuery('', '')).toBe('');
    });

    it("returns empty string when q is empty and neighborhood is empty string", () => {
      // `searchParams?.get('q') || ''` and `searchParams?.get('neighborhood') || ''`
      // produce '' for missing params. The resolver chains correctly:
      // '' || '' === ''.
      expect(resolveSearchQuery('', '')).toBe('');
    });
  });

  describe('user-visible text preservation', () => {
    it("preserves unicode characters in q", () => {
      // Saved-search links can contain non-ASCII neighborhood names.
      expect(resolveSearchQuery('café', '')).toBe('café');
    });

    it("preserves URL-decoded characters in q", () => {
      // searchParams.get() returns decoded values; we don't re-encode.
      expect(resolveSearchQuery('425 Park Ave, NYC', '')).toBe('425 Park Ave, NYC');
    });

    it("preserves leading/trailing whitespace verbatim", () => {
      // The downstream resolvedSearch memo handles trimming. Helper
      // does not silently normalize — that would mask URL bugs.
      expect(resolveSearchQuery(' 425 ', '')).toBe(' 425 ');
    });
  });

  describe('symmetry — initializer and effect use the same resolver', () => {
    // Pins that the helper is the single source of truth for both
    // `useState(resolveSearchQuery(...))` and
    // `setSearchQuery(resolveSearchQuery(...))`. If a future refactor
    // duplicates the precedence logic inline, this test still passes
    // (it's pure-function), but the source-regex assertion below will
    // catch a deps-array drift or a missing setter call.
    it("is referentially stable — same input returns same output", () => {
      const a = resolveSearchQuery('foo', 'bar');
      const b = resolveSearchQuery('foo', 'bar');
      expect(a).toBe(b);
    });
  });
});

describe('source regression assertion · useEffect wiring (PR-S.2b)', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(SEARCH_PAGE_SOURCE_PATH, 'utf8');
  });

  it('contains a useEffect that calls setSearchQuery(resolveSearchQuery(queryParam, neighborhoodParam))', () => {
    // Match the canonical fix shape. Tolerates whitespace and
    // intermediate comments because the surrounding comment block is
    // intentionally verbose.
    expect(source).toMatch(
      /useEffect\(\s*\(\s*\)\s*=>\s*\{\s*setSearchQuery\(\s*resolveSearchQuery\(\s*queryParam\s*,\s*neighborhoodParam\s*\)\s*\)\s*;?\s*\}\s*,\s*\[\s*queryParam\s*,\s*neighborhoodParam\s*\]\s*\)/
    );
  });

  it('uses resolveSearchQuery in the useState initializer (single source of truth)', () => {
    expect(source).toMatch(
      /useState\(\s*resolveSearchQuery\(\s*queryParam\s*,\s*neighborhoodParam\s*\)\s*\)/
    );
  });

  it('does NOT retain the pre-fix inline `queryParam || neighborhoodParam` in useState', () => {
    // The pre-PR-S.2b initializer was:
    //   const [searchQuery, setSearchQuery] = useState(queryParam || neighborhoodParam);
    // Replaced by useState(resolveSearchQuery(queryParam, neighborhoodParam)).
    // Guard against an accidental partial revert.
    expect(source).not.toMatch(
      /useState\(\s*queryParam\s*\|\|\s*neighborhoodParam\s*\)/
    );
  });

  it('exports resolveSearchQuery for testing (same convention as resolveTab)', () => {
    expect(source).toMatch(
      /export\s+function\s+resolveSearchQuery\s*\(\s*queryParam\s*:\s*string\s*,\s*neighborhoodParam\s*:\s*string\s*\)\s*:\s*string/
    );
  });
});
