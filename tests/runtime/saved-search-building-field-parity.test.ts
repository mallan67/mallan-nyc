/// <reference types="jest" />
/**
 * SAVE -> RELOAD -> EXECUTE MUST BE THE SAME SEARCH.
 *
 * A criterion is not verified because a direct query works. A broker saves a
 * search and reloads it days later; if the reload produces a DIFFERENT effective
 * search, the criterion is broken no matter how good the live path is.
 *
 * THE DEFECT THIS PINS
 *
 * `collectSearchCriteria()` reads building facts (YearBuilt / StoriesTotal /
 * NumberOfUnitsTotal) from PER-TAB control ids — saleBuilding*, rentalBuilding*,
 * building*, adv-*. Saved Search restore wrote every saved value into the
 * BUILDING tab's controls, gated on:
 *
 *     if (tab === 'building' || criteria.min_year || criteria.max_year)
 *
 * So a SALE search saved with a year range reloaded with the sale controls
 * EMPTY. The collector then read saleBuildingMinYear (blank) and executed
 * without the range the broker had saved — silently, with no error and a
 * plausible result set.
 *
 * Two independent id tables are what allowed the drift, so there is now ONE
 * resolver (`window._resolveBuildingFieldIds`) used by both sides. These tests
 * pin that they agree, per tab, and that a value cannot leak across tabs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const engineSrc = readFileSync(join(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const savedSrc = readFileSync(join(REPO, 'public/crm/js/search/saved-searches.js'), 'utf8');
const built = readFileSync(join(REPO, 'public/crm/index-built.html'), 'utf8');

/** Evaluate just the shared resolver, out of the real source. */
function loadResolver(source: string) {
  const start = source.indexOf('window._resolveBuildingFieldIds = function');
  const end = source.indexOf('\n        };', start);
  expect(start).toBeGreaterThan(-1);
  const sandbox: Record<string, unknown> = { window: {} };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('node:vm').runInNewContext(source.slice(start, end + 11), sandbox);
  return (sandbox.window as Record<string, unknown>)._resolveBuildingFieldIds as (
    tab: string,
    adv: boolean,
  ) => Record<string, string>;
}

const KEYS = ['yearMin', 'yearMax', 'unitsMin', 'unitsMax', 'floorsMin', 'floorsMax'] as const;

describe('one shared building-field resolver', () => {
  const resolve = loadResolver(engineSrc);

  it.each([
    ['sale', false, 'saleBuilding'],
    ['rent', false, 'rentalBuilding'],
    ['building', false, 'building'],
  ])('tab %s resolves to the %s controls', (tab, adv, prefix) => {
    const ids = resolve(tab as string, adv as boolean);
    for (const k of KEYS) expect(ids[k].startsWith(prefix as string)).toBe(true);
  });

  it('advanced mode resolves to the adv- controls regardless of tab', () => {
    for (const tab of ['sale', 'rent', 'building']) {
      const ids = resolve(tab, true);
      for (const k of KEYS) expect(ids[k].startsWith('adv-')).toBe(true);
    }
  });

  it('no two tabs share a control id — a value cannot leak across tabs', () => {
    const sale = resolve('sale', false);
    const rent = resolve('rent', false);
    const bldg = resolve('building', false);
    for (const k of KEYS) {
      expect(new Set([sale[k], rent[k], bldg[k]]).size).toBe(3);
    }
  });

  it('every resolved id exists in the SERVED artifact', () => {
    // A resolver that names a control the page does not have is the same defect
    // in a new place.
    for (const tab of ['sale', 'rent', 'building']) {
      for (const adv of [false, true]) {
        const ids = resolve(tab, adv);
        for (const k of KEYS) expect(built).toContain(`id="${ids[k]}"`);
      }
    }
  });
});

describe('collector and restore use the SAME resolver', () => {
  it('the collector resolves ids through the shared rule', () => {
    expect(engineSrc).toMatch(/_resolveBuildingFieldIds\(currentSearchTab, _isAdvanced\)/);
  });

  it('saved-search restore resolves ids through the shared rule', () => {
    expect(savedSrc).toMatch(/_resolveBuildingFieldIds\(tab,/);
  });

  it('restore no longer hardcodes the building-tab controls', () => {
    // The exact regression: every saved value written into building* ids.
    expect(savedSrc).not.toMatch(/_setSelectValue\('buildingMinYear'/);
    expect(savedSrc).not.toMatch(/_setSelectValue\('buildingMinFloors'/);
    expect(savedSrc).not.toMatch(/_setSelectValue\('buildingMinUnits'/);
  });

  it('restore is not gated on the building tab or on min_year being present', () => {
    // Matches the GATE as code (`if (...)`), not the phrase — the corrected
    // source deliberately quotes the old gate in a comment explaining what was
    // wrong, and that comment must not trip the guard.
    expect(savedSrc).not.toMatch(/if \(tab === 'building' \|\| criteria\.min_year/);
  });

  it('the served artifact carries the corrected restore, not just the source', () => {
    expect(built).toMatch(/_resolveBuildingFieldIds\(tab,/);
    expect(built).not.toMatch(/if \(tab === 'building' \|\| criteria\.min_year/);
  });
});

describe('management company carries no ListOfficeName equivalence', () => {
  it('the stale claim is gone from saved searches', () => {
    expect(savedSrc).not.toMatch(/Management Company \(ListOfficeName contains\)/);
  });

  it('no CRM source asserts the substitution any more', () => {
    for (const src of [engineSrc, savedSrc]) {
      expect(src).not.toMatch(/matches against ListOfficeName/);
    }
  });
});
