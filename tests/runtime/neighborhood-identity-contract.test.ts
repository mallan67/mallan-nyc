/// <reference types="jest" />
/**
 * ONE NEIGHBOURHOOD IDENTITY — ONE BROKER LABEL, EVERY PROVIDER SPELLING BEHIND IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE (Maya, 2026-08-31, CURRENT.md §5.G)
 *
 * Case-only spelling variations of one live Cotality neighbourhood are ONE
 * broker-facing identity. `SoHo`, `SOHO`, `Soho`, `soho` are one **SoHo** choice.
 * The broker sees one clean label; Mallan preserves every verified raw Cotality
 * spelling behind it and executes the UNION, so capitalisation never loses
 * inventory.
 *
 * Genuinely different names are NOT merged. `Gramercy` and `Gramercy Park` are
 * separate identities unless live Cotality evidence proves otherwise — and both
 * are real: 666 and 112 rows respectively.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EACH CASE BELOW IS HERE
 *
 * Every one is a defect that was live at the audited checkpoint 60b24ccb, found
 * by independent audit. They are written as the eight negative cases the closure
 * gate requires, so the specific wrong answers cannot come back quietly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { neighborhoodOData, boroughLabel } from '@/lib/search/canonical/geography';
import {
  NEIGHBORHOOD_IDENTITIES,
  identityFor,
  boroughForNeighborhood,
} from '@/lib/search/canonical/subdivision-vocabulary.generated';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

describe('case-only variants are ONE broker identity', () => {
  it('SoHo / Soho / SOHO resolve to a single identity with one label', () => {
    const ids = ['SoHo', 'Soho', 'SOHO', 'soho'].map((s) => identityFor(s));
    expect(ids.every((i) => i !== null)).toBe(true);
    const labels = new Set(ids.map((i) => i!.label));
    expect([...labels]).toEqual(['SoHo']);
  });

  it('and the broker is offered that identity ONCE, not once per spelling', () => {
    // The audited checkpoint listed SoHo, Soho and SOHO as three separate
    // choices in the browser vocabulary — three rows in one dropdown for one
    // neighbourhood, each searching a third of the inventory.
    const soho = NEIGHBORHOOD_IDENTITIES.filter(
      (i) => i.label.toLowerCase().replace(/[^a-z]/g, '') === 'soho',
    );
    expect(soho.length).toBe(1);
  });

  it('CAPITALISATION NEVER LOSES INVENTORY — the union executes', () => {
    // Whichever spelling the broker's selection carries, every provider spelling
    // must appear in the filter.
    for (const typed of ['SoHo', 'soho', 'SOHO']) {
      const filter = buildCrmIdxODataFilter(new URLSearchParams({ neighborhood: typed }));
      for (const spelling of identityFor('SoHo')!.spellings) {
        expect(`${typed}->${spelling}:${filter.includes(`SubdivisionName eq '${spelling}'`)}`)
          .toBe(`${typed}->${spelling}:true`);
      }
    }
  });

  it('DIFFERENT names are NOT merged without live proof', () => {
    // Gramercy (666 rows) and Gramercy Park (112) are distinct places. Merging
    // them would be the polygon-alias defect returning under a new name.
    const g = identityFor('Gramercy');
    const gp = identityFor('Gramercy Park');
    expect(g).not.toBeNull();
    expect(gp).not.toBeNull();
    expect(g!.label).not.toBe(gp!.label);
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ neighborhood: 'Gramercy' }));
    expect(filter).not.toContain("'Gramercy Park'");
  });
});

describe('the vocabulary covers the whole feed, not the on-market slice', () => {
  it('a neighbourhood with no CURRENT on-market inventory is still searchable', () => {
    // THE REGRESSION THIS CLOSES. The first vocabulary was read from
    // Active+ComingSoon+ActiveUnderContract — 7,741 rows of 591,409 — and then
    // enforced as a universal refusal at every status. A Closed/comps search for
    // Gramercy (666 rows feed-wide) hard-failed with "Not a live Cotality value",
    // a universal negative the read could not support. `comparable` is in this
    // criterion's own workflow list, and it is exactly the workflow that universe
    // excluded.
    for (const name of ['Gramercy', 'Union Square', 'Civic Center', 'Sugar Hill', 'Stuyvesant Town', 'South Slope']) {
      expect(`${name}:${identityFor(name) !== null}`).toBe(`${name}:true`);
      expect(() =>
        buildCrmIdxODataFilter(new URLSearchParams({ neighborhood: name, status: 'Closed' })),
      ).not.toThrow();
    }
  });

  it('but a name the feed has never carried is STILL refused', () => {
    // The guard-the-guard. Widening the universe must not turn the refusal off.
    expect(() => neighborhoodOData(['Nonexistent Heights'])).toThrow();
  });
});

describe('there is no second borough authority in the browser', () => {
  const searchEngine = read('public/crm/js/search/search-engine.js');
  const savedSearches = read('public/crm/js/search/saved-searches.js');

  it('the hard-coded borough TABLE is gone and the lookup delegates', () => {
    // Asserted on SUBSTANCE, not on a name. `_findBoroughForNeighborhood` still
    // exists as a thin adapter, which is not a second authority — it forwards to
    // the generated live contract. What must never come back is the literal
    // neighbourhood→borough map it used to carry.
    //
    // An earlier version of this test forbade the function NAME, which would have
    // been satisfied by renaming the table and left the real defect in place.
    expect(searchEngine).toMatch(/window\.MallanNeighborhoods/);
    expect(searchEngine).not.toMatch(/'Allerton'|'Baychester'|'Dyker Heights'/);
    // saved-search restore must consult the same authority, not a local table.
    expect(savedSearches).toMatch(/MallanNeighborhoods/);
    expect(savedSearches).not.toMatch(/_findBoroughForNeighborhood/);
  });

  it('MOTT HAVEN IS IN THE BRONX', () => {
    // The regression case. The deleted table placed Mott Haven under Manhattan.
    // A broker filtering the Bronx lost it; a broker filtering Manhattan got a
    // Bronx neighbourhood.
    expect(boroughForNeighborhood('Mott Haven')).toBe('Bronx');
  });

  it('and no borough association is hard-coded anywhere in the browser', () => {
    // Named neighbourhoods sitting in a borough-keyed literal are the shape of
    // the authority that was just removed.
    for (const src of [searchEngine, savedSearches]) {
      expect(src).not.toMatch(/'Bronx':\s*\[/);
      expect(src).not.toMatch(/'Brooklyn':\s*\[/);
    }
  });
});

describe('provider values and broker labels stay separate', () => {
  it('the provider value is StatenIsland; the broker sees Staten Island', () => {
    // The spelling trap geography.ts documents: sending the human spelling
    // produces a valid filter matching zero rows.
    expect(boroughLabel('StatenIsland')).toBe('Staten Island');
  });

  it('and the label is never what gets sent to Cotality', () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ borough: 'Staten Island' }));
    expect(filter).toContain("CityRegion eq 'StatenIsland'");
    expect(filter).not.toContain("CityRegion eq 'Staten Island'");
  });
});

describe('the map cannot write a non-Cotality value into Search', () => {
  it('every map polygon name either resolves to a live identity or is refused before search', () => {
    const gj = JSON.parse(read('public/geo/rls-neighborhoods.v1.min.geojson')) as {
      features: Array<{ properties?: { name?: string } }>;
    };
    const names = gj.features.map((f) => f.properties?.name).filter(Boolean) as string[];
    expect(names.length).toBeGreaterThan(50);

    // A polygon name that does not resolve must NOT be sent. The bridge is what
    // decides that — the map's own vocabulary is presentation geometry and is not
    // provider truth.
    const unresolvable = names.filter((n) => identityFor(n) === null);
    const bridge = read('public/crm/js/search/search-engine.js');
    // The bridge must consult the vocabulary rather than pass names through.
    expect(bridge).toMatch(/identityFor|resolveNeighborhoodIdentity|MallanNeighborhoods/);
    // Whatever does not resolve must be reported to the broker, not searched.
    if (unresolvable.length > 0) {
      expect(bridge).toMatch(/unavailable|not available|cannot be searched|no longer/i);
    }
  });
});

describe('loading and failure are explicit, never "No neighborhoods found"', () => {
  const autocomplete = read('public/crm/js/search/neighborhood-autocomplete.js');

  it('the module distinguishes loading, failed and ready', () => {
    // At the audited checkpoint the list was empty while loading AND after a
    // failed fetch, and both rendered the affirmative answer "No neighborhoods
    // found" — the one message that is definitely wrong in both states.
    expect(autocomplete).toMatch(/_vocabState/);
    expect(autocomplete).toMatch(/'loading'/);
    expect(autocomplete).toMatch(/'failed'/);
    expect(autocomplete).toMatch(/'ready'/);
  });

  it('the catch is no longer silent', () => {
    expect(autocomplete).not.toMatch(/catch\s*\(\s*\)\s*\{\s*\/\*[^}]*\*\/\s*\}/);
  });

  it('and the fetch stays on the absolute CRM data path', () => {
    // A relative 'data/...' resolves wrongly on /crm with no trailing slash, and
    // the failure is invisible.
    expect(autocomplete).toMatch(/fetch\('\/crm\/data\/neighborhood-vocabulary\.generated\.json'\)/);
    expect(autocomplete).not.toMatch(/'data\/' \+ 'neighborhood-vocabulary/);
  });
});
