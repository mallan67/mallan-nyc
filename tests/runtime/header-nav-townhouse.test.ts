/// <reference types="jest" />
/**
 * PR-S.4 (2026-05-15) — Header → Buy → Townhouses canonical URL.
 *
 * Background:
 *   Header `Buy → Townhouses` used `/search?tab=buy-residential&propertyType=Townhouse`.
 *   Both the param name (`propertyType`) and the value (`Townhouse`) were
 *   inert in the live data path:
 *     - `/api/listings` (route.ts:235) reads `?propertySubTypes=` or `?subTypes=`
 *       only — `?propertyType=` is silently ignored. Verified via probe:
 *       `?propertyType=Townhouse` returned the full 9,517-listing sale catalog
 *       (no filter applied) on 2026-05-15.
 *     - `Townhouse` is not a value present in the live `propertyType` /
 *       `propertySubType` distribution. NYC townhouses are classified
 *       `SingleFamilyResidence` per Cotality. Verified via probe: 483 listings
 *       returned for `?subTypes=SingleFamilyResidence` (e.g. 4 E 79th St,
 *       25 Riverside Dr, 18 E 80th St — all classic UES/UWS townhouses).
 *
 * Fix:
 *   `app/components/Header.tsx` `buyItems` Townhouses entry now points to
 *   `?subTypes=SingleFamilyResidence` — the canonical filter accepted by
 *   `app/api/listings/route.ts` AND read on init by
 *   `app/search/page.tsx` (line 286: `csv('subTypes')`).
 *
 * This regression test guards the URL string against accidental reversion.
 * Static text match on the source file is brittle — accepted tradeoff for a
 * one-line config change. If the file is restructured (e.g. nav items move
 * to a separate module), update both this test and the source.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const HEADER_SOURCE_PATH = path.resolve(__dirname, '../../app/components/Header.tsx');

describe('Header nav · Buy → Townhouses canonical URL (PR-S.4)', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(HEADER_SOURCE_PATH, 'utf8');
  });

  it('routes "Townhouses" to ?subTypes=SingleFamilyResidence (the canonical filter)', () => {
    // Match the Townhouses entry + its href on the next non-blank/non-comment line.
    // Tolerates additional whitespace / preceding comment lines.
    expect(source).toMatch(
      /title:\s*['"]Townhouses['"][\s\S]{0,400}?href:\s*['"]\/search\?tab=buy-residential&subTypes=SingleFamilyResidence['"]/
    );
  });

  it('does NOT use the broken ?propertyType=Townhouse URL in any href attribute', () => {
    // Match `href: '…propertyType=Townhouse…'` ONLY — the explanatory
    // comment in Header.tsx legitimately mentions the historical bad URL
    // (so a future maintainer reading the file understands why the change
    // happened), and a blind grep for the substring would false-positive
    // on that prose.
    expect(source).not.toMatch(/href:\s*['"][^'"]*propertyType=Townhouse[^'"]*['"]/);
  });

  it('keeps Buy Residential pointing to the un-filtered residential tab', () => {
    expect(source).toMatch(
      /title:\s*['"]Residential['"][\s\S]{0,400}?href:\s*['"]\/search\?tab=buy-residential['"]/
    );
  });

  it('keeps Buy Commercial pointing to the commercial tab unchanged', () => {
    expect(source).toMatch(
      /title:\s*['"]Commercial['"][\s\S]{0,400}?href:\s*['"]\/search\?tab=buy-commercial['"]/
    );
  });

  it('keeps Rent Residential pointing to the residential rent tab unchanged', () => {
    expect(source).toMatch(
      /title:\s*['"]Residential['"][\s\S]{0,400}?href:\s*['"]\/search\?tab=rent-residential['"]/
    );
  });

  it('does not accidentally apply the Townhouses filter to Rent items', () => {
    // Rent items must not carry subTypes=SingleFamilyResidence — that would
    // collapse rental inventory to a near-empty subset.
    const rentSection = source.match(/const rentItems\s*=\s*\[([\s\S]*?)\];/);
    expect(rentSection).not.toBeNull();
    expect(rentSection![1]).not.toMatch(/subTypes=SingleFamilyResidence/);
    expect(rentSection![1]).not.toMatch(/propertyType=Townhouse/);
  });
});
