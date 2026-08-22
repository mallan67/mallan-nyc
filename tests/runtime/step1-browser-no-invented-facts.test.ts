/// <reference types="jest" />
/**
 * STEP 1, BROWSER LAYER — the defaults are applied TWICE, so removing them from
 * the mapper is not enough.
 *
 * `crm-idx-mapper.ts` now returns null for facts the provider did not supply.
 * But the browser re-invents the identical set in three places:
 *
 *   search-engine.js:550-564   after every server search
 *   data-loader.js:384-398     after every bootstrap/reload
 *   data-loader.js:21          borough, at module load
 *
 * So a null leaving the server became `0` / `'ACTIVE'` / `'Manhattan'` again
 * before any renderer saw it. This is the downstream half of the proof: the
 * false value must not be able to reappear.
 *
 * These load the REAL browser files in JSDOM — behavioural, not string checks.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

/** Mount the real CRM scripts in load order with the globals they expect. */
function mount(files: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
       <div id="searchFormContainer"></div>
       <div id="searchResultsSection"></div>
     </body></html>`,
    { runScripts: 'dangerously', url: 'https://mallan.test/crm/', virtualConsole: new VirtualConsole() },
  );
  const win = dom.window as any;
  const toasts: Array<{ message: string; kind: string }> = [];

  win.LOGGED_IN_AGENT = { id: 1 };
  win.escapeHtml = (s: string) => s;
  win.showToast = (message: string, kind: string) => toasts.push({ message, kind });
  win.initializeSearchResults = () => {};
  win.updateResultsCount = () => {};
  win.refreshResultsMap = () => {};
  win.updateStickyNavActive = () => {};
  win.renderSearchResults = () => {};
  win.resolveNeighborhoodCanonical = () => {};
  win.fetch = () => Promise.reject(new Error('no network in tests'));

  for (const rel of files) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }
  return { win, toasts };
}

const SEARCH_ENGINE = 'public/crm/js/search/search-engine.js';
const DATA_LOADER = 'public/crm/js/core/data-loader.js';

/** A row the server could not populate — every fact absent. */
const UNKNOWN_ROW = () => ({
  id: 'RLS20000001',
  price: null, totalMonthly: null, maintCC: null, reTaxes: null,
  beds: null, baths: null, rooms: null, dom: null,
  photoCount: null, status: null, borough: null, images: [],
});

const settle = () => new Promise((r) => setImmediate(r));

describe('a server search does not re-invent what the mapper refused to invent', () => {
  it('leaves unknown numbers unknown instead of restoring 0', async () => {
    const { win } = mount([SEARCH_ENGINE]);
    win.listings = [];
    win.searchResultsState = { filteredListings: null, currentPage: 1 };
    win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [UNKNOWN_ROW()] }) } };

    win._serverSearch({}, []);
    await settle();

    const row = win.searchResultsState.filteredListings[0];
    for (const field of ['price', 'totalMonthly', 'maintCC', 'reTaxes', 'beds', 'baths', 'rooms', 'dom']) {
      expect(row[field]).toBeNull();
    }
  });

  it('does not restore an unknown status to ACTIVE', async () => {
    const { win } = mount([SEARCH_ENGINE]);
    win.listings = [];
    win.searchResultsState = { filteredListings: null, currentPage: 1 };
    win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [UNKNOWN_ROW()] }) } };

    win._serverSearch({}, []);
    await settle();

    // An unknown listing shown as ACTIVE is a broker telling a client it is on
    // the market. That must never come from a default.
    expect(win.searchResultsState.filteredListings[0].status).not.toBe('ACTIVE');
  });

  it('does not restore an unknown borough to Manhattan', async () => {
    const { win } = mount([SEARCH_ENGINE]);
    win.listings = [];
    win.searchResultsState = { filteredListings: null, currentPage: 1 };
    win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [UNKNOWN_ROW()] }) } };

    win._serverSearch({}, []);
    await settle();

    expect(win.searchResultsState.filteredListings[0].borough).not.toBe('Manhattan');
  });

  it('does not turn an unknown photo count into 0', async () => {
    const { win } = mount([SEARCH_ENGINE]);
    win.listings = [];
    win.searchResultsState = { filteredListings: null, currentPage: 1 };
    win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [UNKNOWN_ROW()] }) } };

    win._serverSearch({}, []);
    await settle();

    // "0 photos" is a statement about the listing. Unknown is not that statement.
    expect(win.searchResultsState.filteredListings[0].photoCount).toBeNull();
  });

  it('still preserves values the server DID supply', async () => {
    const { win } = mount([SEARCH_ENGINE]);
    win.listings = [];
    win.searchResultsState = { filteredListings: null, currentPage: 1 };
    const real = { ...UNKNOWN_ROW(), price: 1250000, beds: 0, borough: 'Brooklyn', status: 'ACTIVE' };
    win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [real] }) } };

    win._serverSearch({}, []);
    await settle();

    const row = win.searchResultsState.filteredListings[0];
    expect(row.price).toBe(1250000);
    expect(row.beds).toBe(0); // a genuine studio survives
    expect(row.borough).toBe('Brooklyn');
    expect(row.status).toBe('ACTIVE');
  });
});

describe('the bootstrap loader does not re-invent them either', () => {
  it('_replaceListings leaves unknown facts unknown', () => {
    const { win } = mount([SEARCH_ENGINE, DATA_LOADER]);

    win._replaceListings([UNKNOWN_ROW()], 'test');

    const row = win.listings[0];
    for (const field of ['price', 'totalMonthly', 'maintCC', 'reTaxes', 'beds', 'baths', 'rooms', 'dom', 'photoCount']) {
      expect(row[field]).toBeNull();
    }
    expect(row.status).not.toBe('ACTIVE');
    expect(row.borough).not.toBe('Manhattan');
  });

  it('permissions default to unknown, never to an affirmative grant', () => {
    const { win } = mount([SEARCH_ENGINE, DATA_LOADER]);

    win._replaceListings([{ ...UNKNOWN_ROW(), permissions: undefined }], 'test');

    const p = win.listings[0].permissions;
    // ownerOptOut:false claims the owner did NOT opt out. syndication:true claims
    // a redistribution right. Neither was granted by anyone.
    expect(p.ownerOptOut).not.toBe(false);
    expect(p.participantOnly).not.toBe(false);
    expect(p.syndication).not.toBe(true);
  });
});
