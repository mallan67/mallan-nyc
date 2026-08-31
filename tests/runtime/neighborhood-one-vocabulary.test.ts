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
 * `Stuyvesant Town` and `Union Square` while the server refused them, and it
 * omitted live neighbourhoods no broker could then reach.
 *
 * CORRECTED 2026-08-31: the refusal was the defect, not those names. The server
 * was judging against a vocabulary read from 1.3% of the feed; read whole, both
 * are real — Union Square carries 654 rows. They are now ACCEPTED everywhere and
 * simply not OFFERED, because they have no current on-market inventory.
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
import { identitiesFor } from '@/lib/search/canonical/subdivision-vocabulary.generated';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const browserVocab = JSON.parse(read('public/crm/data/neighborhood-vocabulary.generated.json')) as {
  boroughLabels: Record<string, string>;
  identities: Array<{
    label: string;
    /** NEVER null now — identity is (borough x name), so the borough is part of it. */
    borough: string;
    boroughLabel: string;
    spellings: string[];
    /** Whether the dropdown shows it. Execution ignores this. */
    offered: boolean;
  }>;
};
const autocompleteSrc = read('public/crm/js/search/neighborhood-autocomplete.js');
const searchEngineSrc = read('public/crm/js/search/search-engine.js');

const browserLabels = browserVocab.identities.map((i) => i.label);
/** What the dropdown actually shows — a FLAG now, not the whole file. */
const offeredLabels = browserVocab.identities.filter((i) => i.offered).map((i) => i.label);

describe('the browser and the server share one neighbourhood vocabulary', () => {
  it('the browser file is not empty', () => {
    // Guard the guard: an empty or truncated file would make every set
    // comparison below pass vacuously.
    expect(browserLabels.length).toBeGreaterThan(200);
    expect(new Set(browserLabels).size).toBe(browserLabels.length); // no duplicate labels
  });

  it('every name the browser offers is a value the server accepts', () => {
    // THE INVARIANT THAT ACTUALLY MATTERS. A name here that the server refuses is
    // a control that produces an error the broker cannot act on.
    const rejected = offeredLabels.filter((n) => {
      try {
        return neighborhoodOData([n]) === null;
      } catch {
        return true;
      }
    });
    expect(rejected).toEqual([]);
  });

  it('and every live value stays SEARCHABLE even when it is not offered', () => {
    // OFFER AND ACCEPT ARE DELIBERATELY DIFFERENT SETS, and this is the assertion
    // that keeps them honest.
    //
    // This used to require that every live value be offered in the dropdown. That
    // was right while both sets came from the same on-market read, and it became
    // wrong once the vocabulary was read from the whole feed: the feed carries 632
    // identities including `null` (3,508 rows), `OTHER`, legacy codes like
    // `GRENVILL` and `UPWEST`, borough names used as neighbourhoods, and non-NYC
    // places. None of those belongs in a broker's dropdown, and every one of them
    // must remain searchable, because refusing a value the provider holds is what
    // made a Closed/comps search for Gramercy hard-fail.
    //
    // So: offered is a presentation decision; accepted is an execution fact.
    const unsearchable = Object.keys(SUBDIVISION_NAME_LIVE).filter((n) => {
      try {
        return neighborhoodOData([n]) === null;
      } catch {
        return true;
      }
    });
    // EVERY bare name that is unsearchable must be one the contract declares
    // AMBIGUOUS — and every one of those must have qualified forms that work.
    //
    // Being unsearchable bare is not a gap here, it is the design: `Bay Terrace`
    // is two real places, and `Downtown`, `Hoboken`, `OTHER` and the rest carry no
    // Mallan decision and no borough at the declared floor. Silently picking the
    // larger bucket is the substitution this contract exists to prevent.
    for (const name of unsearchable) {
      const options = identitiesFor(name);
      expect(`${name}:ambiguous`).toBe(`${name}:${options.length > 1 ? 'ambiguous' : 'NOT-AMBIGUOUS'}`);
      // …and each qualified form searches, scoped to its own borough.
      for (const o of options) {
        expect(`${o.label}:${(neighborhoodOData([o.label]) ?? '').includes(`CityRegion eq '${o.borough}'`)}`)
          .toBe(`${o.label}:true`);
      }
    }
    // The worked case, named so a regression says which one broke.
    expect(unsearchable).toContain('Bay Terrace');
    expect(neighborhoodOData(['Bay Terrace, Queens'])).toContain("CityRegion eq 'Queens'");
    expect(neighborhoodOData(['Bay Terrace, Staten Island'])).toContain("CityRegion eq 'StatenIsland'");
    // A name WITH a Mallan decision is not ambiguous, even on a 7/7 split.
    expect(unsearchable).not.toContain('Stuyvesant Town');
    expect(unsearchable).not.toContain('Downtown Brooklyn');
    expect(unsearchable).not.toContain('Marble Hill');
  });

  it('names with no CURRENT inventory are not offered, but ARE searchable', () => {
    // `Stuyvesant Town` and `Union Square` were offered by the old hard-coded list
    // and were unsearchable — the worst combination. They are now the reverse:
    // absent from the dropdown because they have no on-market inventory to find,
    // and fully searchable for comps and saved searches. Union Square carries 654
    // rows feed-wide.
    // NOT OFFERED in the dropdown…
    expect(offeredLabels).not.toContain('Stuyvesant Town');
    expect(offeredLabels).not.toContain('Union Square');
    // …but PRESENT in the browser's accept set, which is what lets a Saved
    // Search restore them instead of being told they no longer exist.
    expect(browserLabels).toContain('Stuyvesant Town');
    expect(browserLabels).toContain('Union Square');
    expect(() => neighborhoodOData(['Union Square'])).not.toThrow();
    expect(() => neighborhoodOData(['Stuyvesant Town'])).not.toThrow();
    // …and the neighbouring name it must never be merged with IS offered.
    expect(offeredLabels).toContain('Gramercy Park');
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

  it('provider borough VALUES and broker LABELS are both carried, and differ', () => {
    // `StatenIsland` is the trap: every Mallan surface spells it "Staten Island",
    // and sending the human spelling produces a valid filter matching zero rows.
    // The file must carry BOTH — the value to send, the label to show — so no
    // consumer has to guess which one it is holding.
    expect(browserVocab.boroughLabels.StatenIsland).toBe('Staten Island');
    expect(Object.keys(browserVocab.boroughLabels).sort()).toEqual([
      'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'StatenIsland',
    ]);

    const si = browserVocab.identities.filter((i) => i.borough === 'StatenIsland');
    expect(si.length).toBeGreaterThan(0);
    for (const i of si) {
      expect(`${i.label}:${i.boroughLabel}`).toBe(`${i.label}:Staten Island`);
    }
    // No identity may present the raw provider spelling as its label.
    expect(browserVocab.identities.some((i) => i.boroughLabel === 'StatenIsland')).toBe(false);
  });
});
