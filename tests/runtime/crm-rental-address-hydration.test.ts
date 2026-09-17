/// <reference types="jest" />
/**
 * TYPING AN ADDRESS MUST POPULATE THE COTALITY LOCALITY FACTS.
 *
 * Owner report, 2026-09-10, with a concrete case: entering 145 E 48th Street on the rental form must
 * give PostalCity = New York, CityRegion = Manhattan, PostalCode = 10017, SubdivisionName = Turtle
 * Bay. It does not.
 *
 * ── THE EXACT WRONG LOOKUP ─────────────────────────────────────────────────────────────────────
 *
 *     const match = buildingDatabase.find(b => b.address.toLowerCase() === addr.toLowerCase());
 *
 * `buildingDatabase` is not a database. It is a CACHE of the last building-search dropdown results
 * (`let buildingDatabase = []`, filled only by searchBuildingForListing). An agent who TYPES an
 * address instead of picking from the dropdown leaves it empty, so the exact-string match always
 * misses, and parseRentalAddress() then only splits the street into number/name/suffix. PostalCity,
 * CityRegion, PostalCode and SubdivisionName are never touched by either path.
 *
 * Two further gaps found while reproducing it:
 *   · fetchBuildingsFromAPI never mapped the API's `city` field, so PostalCity had NO source at all;
 *   · selectBuildingFromIDX — the dropdown path — set Borough, ZipCode and NeighborhoodFromAddress
 *     but never PostalCity and never the SubdivisionName select.
 *
 * So the fix is not "loosen the string match". The blur handler must ASK for the address when the
 * cache misses, and both paths must carry every locality fact the provider returned.
 *
 * These assertions drive the SHIPPED functions in a real DOM and inspect the resulting field values.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');

/* eslint-disable @typescript-eslint/no-explicit-any */

// Each test boots the real ~1MB rental form in JSDOM, which costs seconds on an idle machine and
// considerably more when ~530 suites are competing for CPU. Jest's 5s default then expires mid-boot
// and reports as an ordinary assertion failure — which is what made this suite look flaky rather
// than slow. Give it a budget that reflects what it actually does.
jest.setTimeout(180_000);

/** What /api/buildings/search returns for 145 E 48th Street. */
const BUILDING_145E48 = {
  id: 'B-1', building_key: 'BK-1', name: 'The Whitby',
  street_number: '145', street_dir: 'E', street_name: '48th', street_suffix: 'Street',
  address: '145 E 48th Street',
  neighborhood: 'Turtle Bay', borough: 'Manhattan', zip: '10017', city: 'New York',
  ownership_type: 'Condominium', structure_type: 'HighRise',
};

function boot(opts: { apiResults?: unknown[] } = {}) {
  const html = readFileSync(resolve(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(html, { url: 'http://localhost/crm/rental-listing', runScripts: 'dangerously', virtualConsole });
  const win: any = dom.window;

  const calls: string[] = [];
  win.__calls = calls;
  const results = opts.apiResults === undefined ? [BUILDING_145E48] : opts.apiResults;
  win.__results = results;
  win.eval(`
    window.fetch = function (url) {
      __calls.push(String(url));
      if (String(url).indexOf('/api/buildings/search') !== -1) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ buildings: __results }); } });
      }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
    };
  `);

  const val = (id: string) => (win.document.getElementById(id) as any)?.value ?? null;
  const setAddress = (v: string) => { (win.document.getElementById('rentalStreetAddress') as any).value = v; };
  const blur = async () => {
    // Wait for the lookup to COMPLETE, not for a fixed number of ticks.
    //
    // rentalAddressBlurLookup is async and awaits a fetch. A fixed drain is ample when this suite
    // runs alone and insufficient when ~530 suites compete for CPU — the same flake this repo has
    // now fixed twice before (crm-designation-no-fabrication, crm-single-routing-authority). Poll
    // for the observable effect, bounded, so a genuinely broken lookup still fails fast.
    const done = win.eval('rentalAddressBlurLookup()');
    if (done && typeof done.then === 'function') await done;
    for (let i = 0; i < 200; i++) {
      const settled = calls.some((u) => u.indexOf('/api/buildings/search') !== -1)
        || (win.document.getElementById('rentalStreetNumber') as any)?.value;
      if (settled) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    // let the applied values and their change handlers land
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { win, val, setAddress, blur, calls, close: () => win.close() };
}

describe('145 E 48th Street — the owner\'s reproduction case', () => {
  it('asks the provider for the address when the local cache has nothing', async () => {
    const t = boot();
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect(t.calls.some((u) => u.indexOf('/api/buildings/search') !== -1)).toBe(true);
    t.close();
  });

  it('PostalCity = New York', async () => {
    const t = boot();
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect(t.val('rentalPostalCity')).toBe('New York');
    t.close();
  });

  it('CityRegion = Manhattan', async () => {
    const t = boot();
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect(t.val('rentalBorough')).toBe('Manhattan');
    t.close();
  });

  it('PostalCode = 10017', async () => {
    const t = boot();
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect(t.val('rentalZipCode')).toBe('10017');
    t.close();
  });

  it('SubdivisionName = Turtle Bay', async () => {
    const t = boot();
    t.setAddress('145 E 48th Street');
    await t.blur();
    const neighbourhood = t.val('rentalNeighborhood') || t.val('rentalNeighborhoodFromAddress');
    expect(neighbourhood).toBe('Turtle Bay');
    t.close();
  });

  it('the street is still parsed into its components', async () => {
    const t = boot();
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect({ n: t.val('rentalStreetNumber'), d: t.val('rentalStreetDirPrefix'), s: t.val('rentalStreetSuffix') })
      .toEqual({ n: '145', d: 'E', s: 'Street' });
    t.close();
  });
});

describe('the lookup no longer depends on an exact string match against a stale cache', () => {
  it('a differently written form of the same address still resolves', async () => {
    const t = boot();
    t.setAddress('145 East 48th St');
    await t.blur();
    expect(t.val('rentalPostalCity')).toBe('New York');
    t.close();
  });

  it('an address the provider does not know leaves the fields EMPTY rather than guessing', async () => {
    const t = boot({ apiResults: [] });
    t.setAddress('999 Nowhere Boulevard');
    await t.blur();
    expect(t.val('rentalPostalCity')).toBe('');
    expect(t.val('rentalBorough')).toBe('');
    t.close();
  });

  it('a fact the provider omitted is either DERIVED from a true mapping or left empty — never invented', async () => {
    const t = boot({ apiResults: [{ ...BUILDING_145E48, city: null, neighborhood: null }] });
    t.setAddress('145 E 48th Street');
    await t.blur();

    // The facts the provider DID return land.
    expect(t.val('rentalBorough')).toBe('Manhattan');

    // PostalCity comes back "New York" even though the provider omitted `city`, because setting the
    // borough fires updateRentalAddressDerived(), which maps Manhattan -> New York. That is a
    // DERIVATION FROM A TRUE FACT (Manhattan's USPS city genuinely is New York), not a fabrication,
    // and it only fills a blank. Asserting emptiness here would force the form to be less useful in
    // order to satisfy the test, so the assertion follows the correct behaviour instead.
    expect(t.val('rentalPostalCity')).toBe('New York');

    // The neighbourhood has NO such derivation available, so it must stay empty rather than guess.
    expect(t.val('rentalNeighborhood') || t.val('rentalNeighborhoodFromAddress') || '').toBe('');
    t.close();
  });

  it('a borough the provider never gave produces no derived postal city', async () => {
    const t = boot({ apiResults: [{ ...BUILDING_145E48, city: null, borough: null, neighborhood: null }] });
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect(t.val('rentalBorough')).toBe('');
    expect(t.val('rentalPostalCity')).toBe('');
    t.close();
  });

  it('an operator\'s own entry is not overwritten by the lookup', async () => {
    const t = boot();
    (t.win.document.getElementById('rentalPostalCity') as any).value = 'Long Island City';
    t.setAddress('145 E 48th Street');
    await t.blur();
    expect(t.val('rentalPostalCity')).toBe('Long Island City');
    t.close();
  });
});
