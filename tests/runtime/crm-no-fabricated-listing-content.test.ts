/// <reference types="jest" />
/**
 * Backend Agent Search must not ship fabricated listing content — neither invented facts inside the listing
 * detail drawer, nor example listing cards sitting in the results area.
 *
 * Proven defects (Slice 2 census, 2026-09-15). All were static markup with NO data binding of any kind:
 *
 *   public/crm/js/search/pagination.js, inside showListingDetail:
 *     - a "Schools Nearby" card with hard-coded ratings 8/10, 7/10, 7/10 each attributed to "GreatSchools",
 *       plus invented grade bands and distances (0.2 / 0.4 / 0.6 mi), rendered identically for every listing
 *       in the city. There is NO GreatSchools integration anywhere in this repository — no route, no key, no
 *       env var, no dependency. Attributing a number to a named third party that is never called is a
 *       misattribution on top of a fabrication, and school-quality claims beside listings are a recognised
 *       steering proxy under federal, NYS and NYC fair-housing law;
 *     - a "Points of Interest" card asserting "Central Park, Riverside Park" for every listing regardless of
 *       borough — a Brooklyn listing claimed Central Park;
 *     - twelve unconditional "Building Amenities" cards (Doorman, Elevator, Gym, Pool, Roof Deck, …) asserting
 *       PRESENCE for every listing, with no provider field behind them. Note the DETAILS tab keeps its own
 *       honest amenity list, which renders "---" when the provider published nothing — that one is correct and
 *       stays;
 *     - two "Documents Available" chip grids (Building tab and Media tab) asserting six documents exist for
 *       every listing. The live provider contract records DocumentsAvailable as populated 0.
 *
 *   public/crm/html/search-form-and-results.html — EIGHT fabricated rental cards in TWO sibling blocks,
 *   both now removed:
 *     - #resultsGridLegacy, two cards including "432 Park Avenue, PH92 — $85,000/mo — Active —
 *       6 BD / 7 BA / 8,255 SF". Removed 2026-09-15 in the Slice 2 Batch 1 commit.
 *     - #resultsGrid, six cards (One57 75B, 15 CPW 14D, 100 Barclay 22F, 301 E 79th 4B, 220 CPS 45A), one
 *       of which carried data-listing-id="RLS-78921" labelled data-source="COTALITY-API" — a fabricated
 *       RLS identifier wearing a false provider-provenance label. Removed 2026-09-15 in the P0-C3 commit.
 *   Neither block was ever cleared by any code path. Their only concealment was Tailwind's `.hidden`, which
 *   is defined in NONE of the local stylesheets and comes solely from a third-party CDN script — and a
 *   Chromium/Playwright proof showed that with that CDN blocked the six cards rendered 4008px of invented
 *   listings, including BELOW real results on a successful search.
 *
 * SCOPE — deliberately NOT swept, so no later reader mistakes this for a clean sweep:
 *   - the Details tab's own unwired surfaces — the "---" Building Amenities list and the twelve all-"---"
 *     Policies tiles — survive by design: they render unknown as unknown, which is the correct behaviour;
 *   - the Neighborhood tab's remaining fabrications (Bike Score, the "Live — MTA" badge, synthesized arrival
 *     times, the Upper East Side coordinate fallback, the commute calculator) are later bounded groups;
 *   - public/crm/css/results.css still defines the now-dead .lux-amenity-card rules (shared stylesheet).
 *
 * PROOF SHAPE. The removals are proved by source + shipped-artifact absence; the "no empty broken section"
 * requirement is proved structurally, by asserting the sibling sections that must survive are still present in
 * their panels. Neither is a substitute for authenticated Preview proof that the drawer renders correctly,
 * which remains outstanding and is recorded as such in the batch report.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const PAGINATION = read('public/crm/js/search/pagination.js');
const PARTIAL = read('public/crm/html/search-form-and-results.html');
const DISPATCHER = read('public/crm/js/render/render-dispatcher.js');
const BUILT = read('public/crm/index-built.html');

/** The section of pagination.js between two markers, so a panel's surviving contents can be asserted. */
function panel(name: string): string {
  const start = PAGINATION.indexOf('id="' + name + '"');
  expect({ name, found: start !== -1, why: 'the detail panel must still exist' })
    .toEqual({ name, found: true, why: expect.any(String) });
  const end = PAGINATION.indexOf('/' + name, start);
  expect(end).toBeGreaterThan(start);
  return PAGINATION.slice(start, end);
}

describe('listing detail — no fabricated school ratings', () => {
  it('no GreatSchools attribution survives in source or in the shipped artifact', () => {
    expect(PAGINATION).not.toContain('GreatSchools');
    expect(BUILT).not.toContain('GreatSchools');
  });

  it('no hard-coded school card, rating or distance survives', () => {
    expect(PAGINATION).not.toContain('Schools Nearby');
    expect(PAGINATION).not.toContain('PS/MS District School');
    expect(PAGINATION).not.toContain('Middle / Junior High');
    expect(PAGINATION).not.toMatch(/Grades PK-5/);
    expect(BUILT).not.toContain('Schools Nearby');
  });
});

describe('listing detail — no fabricated points of interest', () => {
  it('no listing claims Central Park regardless of where it is', () => {
    expect(PAGINATION).not.toContain('Central Park, Riverside Park');
    expect(PAGINATION).not.toContain('Points of Interest');
    expect(BUILT).not.toContain('Central Park, Riverside Park');
  });
});

describe('listing detail — no unconditional building amenities or documents', () => {
  it('the twelve asserted amenity cards are gone', () => {
    expect(PAGINATION).not.toContain('lux-amenity-card');
    // The artifact assertion targets the MARKUP, not the class name: public/crm/css/results.css still
    // defines .lux-amenity-card and is inlined into the build. That rule is now dead, but the stylesheet is
    // shared and outside the Batch 1 authorization ("five static panels in js/search/pagination.js"), so it
    // is deliberately left for a later bounded cleanup rather than swept here.
    expect(BUILT).not.toContain('class="lux-amenity-card"');
  });

  it('both "Documents Available" chip grids are gone', () => {
    expect(PAGINATION).not.toContain('Documents Available');
    expect(PAGINATION).not.toContain('Board Package Template');
    expect(PAGINATION).not.toContain('Request from listing agent');
    expect(BUILT).not.toContain('Documents Available');
  });

  it('the DETAILS tab keeps its honest amenity list, which renders unknown as unknown', () => {
    // This is the correct surface and must survive: it names the same amenities but shows '---'
    // when the provider published nothing, instead of asserting the amenity exists.
    expect(PAGINATION).toContain('Building Amenities');
    expect(panel('detailPanelDetails')).toContain('Building Amenities');
  });
});

describe('listing detail — no panel is left empty or headless', () => {
  it('the NEIGHBORHOOD panel still carries its real sections', () => {
    const p = panel('detailPanelNeighborhood');
    expect(p).toContain('Transportation');
    expect(p).toContain('Commute');
    // the only disclosure in the whole panel must survive any trim
    expect(p).toContain('Actual commute times may vary');
  });

  it('the MEDIA panel still carries its real sections', () => {
    const p = panel('detailPanelMedia');
    expect(p).toMatch(/Photo|Gallery|Video|Floor/i);
  });

  it('the BUILDING panel still carries its real sections', () => {
    const p = panel('detailPanelBuilding');
    expect(p).toContain('Building Details');
  });
});

describe('fabricated example listings cannot enter the live professional Search container', () => {
  it('#resultsGridLegacy is gone from the partial and from the shipped artifact', () => {
    expect(PARTIAL).not.toContain('resultsGridLegacy');
    expect(BUILT).not.toContain('resultsGridLegacy');
  });

  it('no static listing card sits inside any container the renderers write into', () => {
    // The live render targets, read from the renderer itself so this tracks the real list.
    const m = DISPATCHER.match(/_viewContainerIds\s*=\s*\[([\s\S]*?)\]/);
    expect({ found: !!m, why: '_viewContainerIds must be locatable in render-dispatcher.js' })
      .toEqual({ found: true, why: expect.any(String) });
    const viewIds = String(m && m[1]).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    expect(viewIds.length).toBeGreaterThan(0);

    const dom = new jsdom.JSDOM('<!doctype html><html><body>' + PARTIAL + '</body></html>');
    const doc = dom.window.document;
    const liveContainers = ['resultsContainer'].concat(viewIds)
      .map((id) => doc.getElementById(id))
      .filter(Boolean) as Element[];
    expect(liveContainers.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const card of Array.from(doc.querySelectorAll('.listing-card')) as Element[]) {
      for (const container of liveContainers) {
        if (container.contains(card)) offenders.push(String(container.id));
      }
    }
    expect({ offenders, why: 'a static example card inside a live results container can render as a real listing' })
      .toEqual({ offenders: [], why: expect.any(String) });
    dom.window.close();
  });

  it('the results markup ships EMPTY — every listing element is renderer-created', () => {
    // The strongest form of the invariant, provable now that both fabricated blocks are gone:
    // the static partial contains no listing markup of any kind. A results area that begins empty
    // cannot show a listing the Search renderer did not put there, in ANY runtime state — which is
    // what makes the Tailwind-CDN failure mode harmless rather than a fabrication exposure.
    const dom = new jsdom.JSDOM('<!doctype html><html><body>' + PARTIAL + '</body></html>');
    const doc = dom.window.document;
    const census = {
      listingCard: doc.querySelectorAll('.listing-card').length,
      listingId: doc.querySelectorAll('[data-listing-id]').length,
      dataSource: doc.querySelectorAll('[data-source]').length,
      listingCheckbox: doc.querySelectorAll('.listing-checkbox').length,
    };
    dom.window.close();
    expect({ ...census, why: 'static listing markup is indistinguishable from a real result once rendered' })
      .toEqual({ listingCard: 0, listingId: 0, dataSource: 0, listingCheckbox: 0, why: expect.any(String) });
  });

  it('the stale element baseline no longer asserts the deleted container', () => {
    // public/crm/scripts/manifest.json is a baseline list of element ids checked by
    // scripts/validate-manifest.js. Leaving a deleted id in it makes the baseline assert
    // something that no longer exists.
    const mf = read("public/crm/scripts/manifest.json");
    expect(mf).not.toContain("resultsGridLegacy");
    expect(mf).not.toContain("resultsGrid");
    expect(mf).not.toContain("RLS-78921");
  });
});
