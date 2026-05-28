/// <reference types="jest" />
/**
 * Systematic StreetDirPrefix audit — every address-concat site must include
 * the direction (E/W/N/S) so listings like "333 E 46th St" never display
 * or get stored as "333 46th St".
 *
 * Bug history: SL-0004 was originally saved with `StreetName: "46th"` and
 * empty `StreetDirPrefix` because the building-search API's BuildingName
 * branch returned `address: "333 46th Street"` (no E) when Maya picked the
 * building from the dropdown. The same drop-direction pattern existed in 6
 * other places — this test pins all 7.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

describe('StreetDirPrefix preservation across all address-concat sites', () => {
  test('app/api/buildings/search BuildingName branch uses formatAddress (preserves direction)', () => {
    const src = read('app/api/buildings/search/route.ts');
    // Old inline concat that dropped StreetDirPrefix must be gone.
    expect(src).not.toMatch(
      /`\$\{addr\.StreetNumber \|\| ''\} \$\{addr\.StreetName \|\| ''\} \$\{addr\.StreetSuffix \|\| ''\}`\.trim\(\)/,
    );
    // formatAddress is the shared helper that includes StreetDirPrefix.
    expect(src).toMatch(/fullAddr = formatAddress\(addr\)/);
  });

  test('public/crm/js/manage/manage-listings.js address display includes StreetDirPrefix', () => {
    const src = read('public/crm/js/manage/manage-listings.js');
    expect(src).toMatch(/addr\.StreetDirPrefix/);
    // Old inline concat without DirPrefix must be gone.
    expect(src).not.toMatch(
      /addressStr = \(addr\.StreetNumber \? addr\.StreetNumber \+ ' ' : ''\) \+ \(addr\.StreetName \|\| ''\) \+ \(addr\.StreetSuffix \? ' ' \+ addr\.StreetSuffix : ''\);/,
    );
  });

  test('public/crm/js/core/data-loader.js address display includes StreetDirPrefix', () => {
    const src = read('public/crm/js/core/data-loader.js');
    expect(src).toMatch(/addr\.StreetDirPrefix/);
  });

  test('lib/cma/engine.ts comp displayAddr includes StreetDirPrefix', () => {
    const src = read('lib/cma/engine.ts');
    expect(src).toMatch(/StreetDirPrefix/);
    // Old `${addr.StreetNumber || ''} ${addr.StreetName || ''}`.trim() must be gone.
    expect(src).not.toMatch(/`\$\{addr\.StreetNumber \|\| ''\} \$\{addr\.StreetName \|\| ''\}`\.trim\(\)/);
  });

  test('lib/market-report/generator.ts SELECT + concat both include StreetDirPrefix', () => {
    const src = read('lib/market-report/generator.ts');
    // SELECT list now includes the field
    expect(src).toMatch(/"StreetNumber", "StreetDirPrefix", "StreetName", "StreetSuffix"/);
    // Sample concat reads it
    expect(src).toMatch(/l\.StreetDirPrefix/);
  });

  test('app/sitemap.ts passes streetDirPrefix to slug generator AND uses canonical helper', () => {
    const src = read('app/sitemap.ts');
    expect(src).toMatch(/streetDirPrefix:/);
    expect(src).toMatch(/buildCanonicalListingPath/);
    expect(src).toMatch(/import \{ buildCanonicalListingPath \}/);
  });

  test('lib/search/public-listing-db.ts addressConditions narrows by StreetDirPrefix when direction is in query', () => {
    const src = read('lib/search/public-listing-db.ts');
    expect(src).toMatch(/StreetDirPrefix/);
    // The new direction-extraction block before strip
    expect(src).toMatch(/dirMatch = numMatch\[2\]\.match\(\/\^\(\[ensw\]\)\\s\+\/i\)/);
  });
});
