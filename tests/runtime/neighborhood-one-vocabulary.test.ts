/// <reference types="jest" />
/**
 * ONE NEIGHBOURHOOD VOCABULARY, OR THE UI INVITES A SEARCH THE SERVER REFUSES.
 *
 * Four lists described one concept:
 *
 *   1. the generated server contract (live Cotality SubdivisionName values)
 *   2. a hard-coded array in neighborhood-autocomplete.js
 *   3. the RLS alias file, reversed in search-engine.js into `_aliasReverseMap`
 *   4. the map polygon names
 *
 * They disagreed in the way that matters. The autocomplete offered
 * `Stuyvesant Town` and `Union Square`, which the live feed does not carry, so a
 * broker could select a neighbourhood the server can only refuse — and it omitted
 * live neighbourhoods with real inventory, which no broker could reach at all.
 *
 * (2) and (3) are gone. (1) is generated from probe evidence and the browser file
 * is generated beside it from the SAME evidence, so neither can be edited
 * independently. (4) SURVIVES DELIBERATELY: the map answers "which shape do I
 * draw", which is a different question, and conflating the two is precisely what
 * produced the alias reversal that returned Queens listings for Williamsburg.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUBDIVISION_NAME_LIVE } from '@/lib/search/canonical/subdivision-vocabulary.generated';
import { neighborhoodOData } from '@/lib/search/canonical/geography';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const browserVocab = JSON.parse(read('public/crm/data/neighborhood-vocabulary.generated.json')) as {
  byBorough: Record<string, string[]>;
};
const autocompleteSrc = read('public/crm/js/search/neighborhood-autocomplete.js');
const searchEngineSrc = read('public/crm/js/search/search-engine.js');

const browserNames = Object.values(browserVocab.byBorough).flat();

describe('the browser and the server share one neighbourhood vocabulary', () => {
  it('the browser file is not empty and covers every live value', () => {
    // Guard the guard: an empty or truncated file would make every set
    // comparison below pass vacuously.
    expect(browserNames.length).toBe(Object.keys(SUBDIVISION_NAME_LIVE).length);
    expect(browserNames.length).toBeGreaterThan(200);
  });

  it('every name the browser offers is a value the server accepts', () => {
    // THE INVARIANT THAT ACTUALLY MATTERS. A name here that the server refuses is
    // a control that produces an error the broker cannot act on.
    const rejected = browserNames.filter((n) => {
      try {
        return neighborhoodOData([n]) === null;
      } catch {
        return true;
      }
    });
    expect(rejected).toEqual([]);
  });

  it('and every live value is offered by the browser — no unreachable inventory', () => {
    // The other direction. The old hard-coded list omitted live neighbourhoods,
    // so listings existed that no broker could filter to.
    const missing = Object.keys(SUBDIVISION_NAME_LIVE).filter((n) => !browserNames.includes(n));
    expect(missing).toEqual([]);
  });

  it('the names the old hard-coded list invented are gone', () => {
    // `Stuyvesant Town` and `Union Square` were selectable and unsearchable.
    // Asserted against the DATA rather than the source text, so a comment
    // mentioning them (this file explains them at length) cannot mask a
    // regression.
    expect(browserNames).not.toContain('Stuyvesant Town');
    expect(browserNames).not.toContain('Union Square');
    // …while the live neighbourhood the old list confused with one of them IS here.
    expect(browserNames).toContain('Gramercy Park');
  });

  it('the autocomplete no longer carries a neighbourhood list of its own', () => {
    // A populated literal would be a fifth vocabulary. Checked structurally: the
    // declaration must be empty and filled by the loader.
    expect(autocompleteSrc).toMatch(/var NEIGHBORHOODS = \{\};/);
    expect(autocompleteSrc).toMatch(/neighborhood-vocabulary\.generated\.json/);
  });

  it('search-engine.js no longer reverses the RLS alias file', () => {
    // The apparatus was dead — `expandCanonicalToVariants` was called from
    // nowhere — but the file was still fetched and reversed on every page load,
    // leaving a second authority in the browser waiting to be picked up again.
    expect(searchEngineSrc).not.toMatch(/_aliasReverseMap\[/);
    expect(searchEngineSrc).not.toMatch(/function expandCanonicalToVariants/);
    expect(searchEngineSrc).not.toMatch(/fetch\(url\)[\s\S]{0,200}aliases/);
  });

  it('but the MAP still owns polygon names, as a separate vocabulary', () => {
    // Deliberate, and the bridge is explicit. Deleting the alias file outright
    // would break the map, which is the one consumer it was actually built for.
    const mapSrc = read('public/crm/js/render/neighborhood-map.js');
    expect(mapSrc).toMatch(/neighborhood-aliases/);
  });

  it('each borough group is non-empty and uses PROVIDER spelling', () => {
    // `StatenIsland` is the trap: every Mallan surface spells it "Staten Island",
    // and sending that produces a valid filter matching zero rows.
    expect(Object.keys(browserVocab.byBorough).sort()).toEqual([
      'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'StatenIsland',
    ]);
    for (const [borough, names] of Object.entries(browserVocab.byBorough)) {
      expect(`${borough}:${names.length > 0}`).toBe(`${borough}:true`);
    }
  });
});
