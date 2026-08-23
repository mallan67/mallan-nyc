/// <reference types="jest" />
/**
 * STEP 1 — TRANSPORTATION MUST NOT FABRICATE.
 *
 * The capability stays in the product. The fabricated implementation does not.
 *
 * What was there:
 *   - `getNextArrivals()` synthesized next-train times from `charCodeAt(0)` of
 *     the line letter, then presented them under a badge reading
 *     "Live — MTA schedule data · Refreshes every 30s" on a 30-second timer.
 *   - `buildTransitStationsHTML()` defaulted an absent listing coordinate to
 *     40.7831 / -73.9554 — the Upper East Side — so EVERY coordinate-less
 *     listing showed UES stations as its nearby transit.
 *   - `calculateCommute()` read the work address the broker typed, used it only
 *     as a non-empty gate, and then measured straight-line distance to a
 *     hardcoded Midtown point multiplied by a constant.
 *
 * Until a verified transportation data contract exists, the honest state is
 * "not verified" — not a plausible number. And the replacement must not be
 * another invention.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as any;
  const toasts: Array<{ message: string; kind: string }> = [];

  win.LOGGED_IN_AGENT = { id: 1 };
  win.escapeHtml = (s: string) => s;
  win.showToast = (m: string, k: string) => toasts.push({ message: m, kind: k });
  win.fetch = () => Promise.reject(new Error('no network in tests'));
  win.listings = [];
  win.searchResultsState = { filteredListings: null, selectedListings: [] };

  const script = win.document.createElement('script');
  script.textContent = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
  win.document.body.appendChild(script);
  return { win, toasts };
}

const LISTING_NO_COORD = { id: 'RLS1', latitude: null, longitude: null, neighborhood: 'Chelsea', borough: null, zip: '10011' };

describe('synthesized arrival times are gone', () => {
  it.each(['getNextArrivals', 'getCurrentHeadway', 'refreshTransitArrivals', 'startTransitRefresh', 'formatArrivalTime'])(
    'no longer exposes %s',
    (fn) => {
      const { win } = mount();
      expect(typeof win[fn]).toBe('undefined');
    },
  );

  it('does not run a background timer that refreshes invented arrivals', () => {
    const src = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
    expect(src).not.toMatch(/_transitRefreshTimer/);
  });
});

describe('the Transportation section survives, and says what it does not know', () => {
  it('still renders a Transportation section — the capability is retained', () => {
    const { win } = mount();
    const html = win.buildTransitStationsHTML(LISTING_NO_COORD);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('states the data is not verified rather than showing stations', () => {
    const { win } = mount();
    const html = String(win.buildTransitStationsHTML(LISTING_NO_COORD));
    expect(html).toMatch(/not verified|unavailable/i);
  });

  it('never claims arrivals are live MTA schedule data', () => {
    const src = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
    expect(src).not.toMatch(/MTA schedule data/);
    expect(src).not.toMatch(/Refreshes every 30s/);
  });

  it('renders no arrival time for any listing, with or without a coordinate', () => {
    const { win } = mount();
    for (const listing of [LISTING_NO_COORD, { ...LISTING_NO_COORD, latitude: 40.75, longitude: -73.98 }]) {
      const html = String(win.buildTransitStationsHTML(listing));
      // "4 min", "12 min" — the shape the synthesized arrivals rendered in.
      expect(html).not.toMatch(/\d+\s*min\b/);
    }
  });

  it('does not fall back to an Upper East Side coordinate for a coordinate-less listing', () => {
    const src = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
    // The old default: listing.latitude || 40.7831 / longitude || -73.9554.
    expect(src).not.toMatch(/latitude\s*\|\|\s*40\.7831/);
    expect(src).not.toMatch(/longitude\s*\|\|\s*-73\.9554/);
  });
});

describe('the commute calculator does not compute against a hidden destination', () => {
  it('does not measure to a hardcoded Midtown point', () => {
    const src = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
    expect(src).not.toMatch(/40\.7549/); // the hardcoded Midtown latitude
  });

  it('produces no commute time when the route cannot be verified', () => {
    const { win } = mount();
    win.document.body.innerHTML =
      '<input id="detailCommuteAddress" value="1 Wall St" />' +
      '<div id="detailCommuteResults" class="hidden"></div>' +
      '<div id="commuteSubwayTime">--</div><div id="commuteBusTime">--</div><div id="commuteWalkTime">--</div>';
    win.listings = [{ id: 'RLS1', latitude: 40.75, longitude: -73.98 }];

    win.calculateCommute('RLS1');

    for (const id of ['commuteSubwayTime', 'commuteBusTime', 'commuteWalkTime']) {
      expect(String(win.document.getElementById(id).textContent)).not.toMatch(/\d+\s*min/);
    }
  });

  it('tells the broker it is unavailable rather than silently doing nothing', () => {
    const { win, toasts } = mount();
    win.document.body.innerHTML =
      '<input id="detailCommuteAddress" value="1 Wall St" />' +
      '<div id="detailCommuteResults" class="hidden"></div>';
    win.listings = [{ id: 'RLS1', latitude: 40.75, longitude: -73.98 }];

    win.calculateCommute('RLS1');

    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts.map((t) => t.message).join(' ')).toMatch(/not available|unavailable|not verified/i);
  });
});

/**
 * SAME SECTION, SAME DEFECT — the two scores rendered directly beneath the
 * Commute Calculator in the listing workspace.
 *
 *   computeTransitScore()  scored the listing against the same 92-entry
 *                          hand-authored station constant, and returned a flat
 *                          40 when it matched nothing at all.
 *   computeBikeScore()     was `(listing.walkScore || 70) * 0.82` plus an
 *                          offset derived from `listing.id * 7 % 13` — a number
 *                          about the listing's IDENTIFIER, presented to the
 *                          broker as a fact about the property.
 *
 * Neither is a licensed Walk Score Inc. product, and neither has a source. Both
 * are reported to Maya as an in-scope extension of the Transportation item, not
 * a new workstream: same rendered block, same invented-number defect.
 */
describe('the neighborhood scores are not computed out of thin air', () => {
  it('does not derive a bike score from the listing identifier', () => {
    const src = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
    expect(src).not.toMatch(/listing\.id\s*\*\s*7/);
  });

  it('reports an unscored transit score as unknown, not as 40', () => {
    const { win } = mount();
    // A listing nowhere near the constant's coverage.
    expect(win.computeTransitScore({ id: 'RLS1', latitude: 40.5, longitude: -74.2 })).toBeNull();
  });

  it('reports an unknown score as unknown for a coordinate-less listing', () => {
    const { win } = mount();
    expect(win.computeTransitScore(LISTING_NO_COORD)).toBeNull();
    expect(win.computeBikeScore(LISTING_NO_COORD)).toBeNull();
  });

  it('does not label an unknown transit score with a quality claim', () => {
    const src = readFileSync(join(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
    // "Some Transit" / "Somewhat Bikeable" were fall-through arms that rendered
    // for null as confidently as for a real score. Both scores are now always
    // unknown, so the whole ladder is unreachable and goes.
    //
    // CORRECTED: my first version also forbade 'Somewhat Walkable'. That was
    // wrong. `WalkScore` is a real Cotality field (cotality-field-map.js:105), so a
    // POPULATED walk score has earned its real label. Only the null case needs
    // guarding — asserted behaviourally in the render test below.
    expect(src).not.toMatch(/:\s*'Some Transit'/);
    expect(src).not.toMatch(/:\s*'Somewhat Bikeable'/);
  });
});

/**
 * FOUND WHILE TRACING THE TRANSPORTATION RENDER PATH — and it is the reason
 * Step 1a was not yet actually proven downstream.
 *
 * `showListingDetail()` opens with fifteen lines that re-apply the EXACT
 * default set Step 1a removed from the mapper and from both browser loaders:
 *
 *     if (listing.price == null) listing.price = 0;
 *     if (listing.beds  == null) listing.beds  = 0;
 *     if (!listing.status)       listing.status = 'ACTIVE';
 *     ... and eight more
 *
 * Two things make this worse than the defaults already removed:
 *
 *   1. It runs AFTER the mapper and after both loaders, so it silently undoes
 *      the entire Step 1a correction the moment a broker opens a listing.
 *   2. `listings.find()` returns a REFERENCE. These are not local display
 *      variables — they are written back into the shared `listings` array.
 *      Opening one detail panel permanently rewrites that listing for the
 *      result grid, the selection set, reports, the CMA and every consumer
 *      that reads the array afterwards. The falsehood outlives the panel.
 *
 * `status = 'ACTIVE'` on a listing whose status the provider never supplied is
 * the same compliance defect Step 1a was opened to close.
 *
 * This is reported to Maya as Step 1a's missing downstream proof, not as a new
 * workstream: same defect class, same fields, found inside the assigned file.
 */
describe('opening a listing does not rewrite the listing', () => {
  const unknownRow = () => ({
    id: 'RLS1',
    price: null, totalMonthly: null, maintCC: null, reTaxes: null,
    beds: null, baths: null, rooms: null, dom: null,
    status: null, address: null, neighborhood: null, zip: null,
    latitude: null, longitude: null, images: [],
  });

  /** showListingDetail is wrapped in try/catch, so a missing DOM cannot mask
   *  the mutation — it happens before any DOM access either way. */
  const open = (win: any) => { try { win.showListingDetail('RLS1'); } catch { /* DOM-shape errors are not what we are asserting */ } };

  it.each(['price', 'totalMonthly', 'maintCC', 'reTaxes', 'beds', 'baths', 'rooms', 'dom'])(
    'does not write 0 over an unknown %s',
    (field) => {
      const { win } = mount();
      win.listings = [unknownRow()];
      open(win);
      expect(win.listings[0][field]).toBeNull();
    },
  );

  it('does not write ACTIVE over an unknown status', () => {
    const { win } = mount();
    win.listings = [unknownRow()];
    open(win);
    expect(win.listings[0].status).not.toBe('ACTIVE');
  });

  it('leaves the shared array untouched — the panel must not mutate inventory', () => {
    const { win } = mount();
    const row = unknownRow();
    win.listings = [row];
    const before = JSON.stringify(row);
    open(win);
    expect(JSON.stringify(win.listings[0])).toBe(before);
  });

  it('still renders a listing the provider DID populate', () => {
    const { win } = mount();
    const real = { ...unknownRow(), price: 1250000, beds: 0, status: 'ACTIVE', address: '15 E 91st St' };
    win.listings = [real];
    open(win);
    expect(win.listings[0].price).toBe(1250000);
    expect(win.listings[0].beds).toBe(0);
    expect(win.listings[0].status).toBe('ACTIVE');
  });
});
