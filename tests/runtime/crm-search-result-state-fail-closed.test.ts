/// <reference types="jest" />
/**
 * THE AUTHENTICATED CRM SEARCH RESULT STATE IS FAIL-CLOSED.
 *
 * Two defects in one chain, both found on 2026-08-21.
 *
 * 1. `filterListings` matched PropertySubType with `sub.indexOf(v) !== -1` —
 *    a case-folded SUBSTRING test on a field the live provider declares as a
 *    scalar enum. `Apartment` swept in anything containing "apartment".
 *
 * 2. Far worse: `_serverSearch`'s failure path KEPT the local pre-render rows
 *    on screen as the terminal result and showed an error ONLY when there were
 *    no local rows. Since `contains(PropertySubType,…)` is HTTP 400 at Cotality,
 *    every authenticated search carrying a Property Type box failed at the
 *    provider, returned 502 from our route — and the broker saw a full screen of
 *    rows with no error at all.
 *
 * WHAT THE LOCAL ROWS ACTUALLY ARE. Not a fixture, and not "canonical local
 * Mallan inventory". `listings` is loaded once at page load by
 * `_loadFromIDX()` — `MallanAPI.idx.search({ limit: 200, type })`, i.e. the
 * first 200 rows of an UNFILTERED search ordered by ModificationTimestamp desc,
 * falling back to `MallanAPI.listings.list({ limit: 200 })`. It is a capped,
 * stale, criteria-independent page from whichever source answered at load. That
 * makes it MORE dangerous than a fixture, because every row looks real.
 *
 * THE CONTRACT:
 *   server pending  -> local preview may render, marked PROVISIONAL
 *   server succeeds -> preview replaced by the canonical universe, AUTHORITATIVE
 *   server fails    -> fail visibly, NO result universe, preview cannot remain
 *
 * These tests load the REAL browser file into JSDOM. They are behavioural, not
 * source-string assertions — the previous round of this workstream established
 * that a source grep proves nothing about behaviour.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const SEARCH_ENGINE = join(REPO, 'public', 'crm', 'js', 'search', 'search-engine.js');

type Harness = {
  win: any;
  toasts: Array<{ message: string; kind: string }>;
  searchCalls: any[];
};

/** Mount the real search-engine.js in a JSDOM with the globals its siblings provide. */
function mount(options: {
  listings?: any[];
  serverResult?: any;
  serverError?: Error;
} = {}): Harness {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');

  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
       <div id="searchFormContainer"></div>
       <div id="searchResultsSection"></div>
     </body></html>`,
    { runScripts: 'dangerously', url: 'https://mallan.test/crm/', virtualConsole },
  );

  const win = dom.window as any;
  const toasts: Array<{ message: string; kind: string }> = [];
  const searchCalls: any[] = [];

  win.listings = options.listings ?? [];
  win.searchResultsState = { filteredListings: null, currentPage: 1 };
  win.LOGGED_IN_AGENT = { id: 1 };
  win.currentSearchTab = 'sale';
  win.showToast = (message: string, kind: string) => toasts.push({ message, kind });
  win.initializeSearchResults = () => {};
  win.updateResultsCount = () => {};
  win.refreshResultsMap = () => {};
  win.updateStickyNavActive = () => {};
  win.resolveNeighborhoodCanonical = () => {};
  win.fetch = () => Promise.reject(new Error('no network in tests'));
  win.MallanAPI = {
    idx: {
      search: (params: any) => {
        searchCalls.push(params);
        return options.serverError
          ? Promise.reject(options.serverError)
          : Promise.resolve(options.serverResult ?? { listings: [] });
      },
    },
  };

  const script = win.document.createElement('script');
  script.textContent = readFileSync(SEARCH_ENGINE, 'utf8');
  win.document.body.appendChild(script);

  return { win, toasts, searchCalls };
}

/** A CRM-flat row, only the fields the filter and renderer touch. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'L1',
    propertySubType: 'Apartment',
    price: 1,
    beds: 1,
    baths: 1,
    status: 'ACTIVE',
    address: '1 Test St',
    borough: 'Manhattan',
    ...overrides,
  };
}

/** Let the stubbed promise chain in _serverSearch settle. */
const settle = () => new Promise((r) => setImmediate(r));

// ─────────────────────────────────────────────────────────────────────────────
// 1-3. EXACT PROPERTY SUB-TYPE MATCHING
// ─────────────────────────────────────────────────────────────────────────────

describe('filterListings · PropertySubType is an exact scalar enum match', () => {
  it('matches one exact member and nothing else', () => {
    const { win } = mount();
    const rows = [row({ id: 'a', propertySubType: 'Apartment' }), row({ id: 'b', propertySubType: 'Loft' })];

    const out = win.filterListings(rows, { propertySubType: 'Apartment' });

    expect(out.map((l: any) => l.id)).toEqual(['a']);
  });

  it('does NOT substring-match — MultiFamily must not answer to "Family"', () => {
    const { win } = mount();
    const rows = [
      row({ id: 'a', propertySubType: 'MultiFamily' }),
      row({ id: 'b', propertySubType: 'SingleFamilyResidence' }),
    ];

    // The old `sub.indexOf(v) !== -1` returned BOTH rows for this criterion.
    expect(win.filterListings(rows, { propertySubType: 'Family' })).toEqual([]);
  });

  it('does NOT substring-match a prefix — "Apart" is not "Apartment"', () => {
    const { win } = mount();
    expect(win.filterListings([row({ propertySubType: 'Apartment' })], { propertySubType: 'Apart' })).toEqual([]);
  });

  it('does NOT case-fold — the live provider treats a mis-cased member as zero rows', () => {
    const { win } = mount();
    // The old path lower-cased both sides, so `apartment` matched. The provider
    // does not: `eq 'apartment'` returns HTTP 200 with count 0.
    expect(win.filterListings([row({ propertySubType: 'Apartment' })], { propertySubType: 'apartment' })).toEqual([]);
  });

  it('expands the commercial "Office,Retail" checkbox to an exact OR of two members', () => {
    const { win } = mount();
    const rows = [
      row({ id: 'a', propertySubType: 'Office' }),
      row({ id: 'b', propertySubType: 'Retail' }),
      row({ id: 'c', propertySubType: 'Apartment' }),
    ];

    const out = win.filterListings(rows, { propertySubType: 'Office,Retail' });

    expect(out.map((l: any) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes a row whose sub-type is absent rather than admitting it', () => {
    const { win } = mount();
    expect(win.filterListings([row({ propertySubType: null })], { propertySubType: 'Apartment' })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4-7. RESULT-STATE PROVENANCE
// ─────────────────────────────────────────────────────────────────────────────

describe('_serverSearch · the server universe replaces the preview', () => {
  it('marks the result set AUTHORITATIVE and renders the server rows', async () => {
    const h = mount({ serverResult: { listings: [row({ id: 'server-1' })] } });

    h.win._serverSearch({ propertySubType: 'Apartment' }, [row({ id: 'local-1' })]);
    await settle();

    expect(h.win.searchResultsState.filteredListings.map((l: any) => l.id)).toEqual(['server-1']);
    expect(h.win.searchResultsState.resultProvenance).toBe('authoritative');
  });

  it('treats a genuinely empty server result as AUTHORITATIVE, not as a failure', async () => {
    const h = mount({ serverResult: { listings: [] } });

    h.win._serverSearch({ propertySubType: 'Townhouse' }, [row({ id: 'local-1' })]);
    await settle();

    // `Townhouse` is a valid live member with zero rows. Nothing failed.
    expect(h.win.searchResultsState.filteredListings).toEqual([]);
    expect(h.win.searchResultsState.resultProvenance).toBe('authoritative');
  });
});

describe('_serverSearch · a failed search NEVER leaves a result universe', () => {
  it('surfaces the failure when there are no local rows', async () => {
    const h = mount({ serverError: new Error('HTTP 502') });

    h.win._serverSearch({ propertySubType: 'Apartment' }, []);
    await settle();

    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
  });

  it('STILL surfaces the failure when local rows exist — this is the defect', async () => {
    const h = mount({ serverError: new Error('HTTP 502') });

    h.win._serverSearch({ propertySubType: 'Apartment' }, [row({ id: 'local-1' }), row({ id: 'local-2' })]);
    await settle();

    // Previously: the error was shown ONLY when localResults.length === 0.
    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
  });

  it('clears the result state so stale local rows cannot masquerade as results', async () => {
    const h = mount({ serverError: new Error('HTTP 502') });
    h.win.searchResultsState.filteredListings = [row({ id: 'local-1' })];
    h.win.searchResultsState.resultProvenance = 'provisional';

    h.win._serverSearch({ propertySubType: 'Apartment' }, [row({ id: 'local-1' })]);
    await settle();

    expect(h.win.searchResultsState.filteredListings).toEqual([]);
    expect(h.win.searchResultsState.resultProvenance).toBe('none');
  });

  it('does not persist a failed search as though it were a completed universe', async () => {
    const h = mount({ serverError: new Error('HTTP 502') });
    h.win.sessionStorage.setItem('_searchState', JSON.stringify({ filteredIds: ['local-1'] }));

    h.win._serverSearch({ propertySubType: 'Apartment' }, [row({ id: 'local-1' })]);
    await settle();

    const persisted = h.win.sessionStorage.getItem('_searchState');
    const ids = persisted ? (JSON.parse(persisted).filteredIds ?? []) : [];
    expect(ids).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. DOWNSTREAM BROKER ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('downstream broker actions require an AUTHORITATIVE universe', () => {
  it('permits an action after a successful server search', async () => {
    const h = mount({ serverResult: { listings: [row({ id: 'server-1' })] } });
    h.win._serverSearch({}, []);
    await settle();

    expect(h.win.hasAuthoritativeSearchResults()).toBe(true);
    expect(h.win.requireAuthoritativeSearchResults('Compare')).toBe(true);
  });

  it('refuses an action while results are only a provisional preview', () => {
    const h = mount();
    h.win.searchResultsState.filteredListings = [row({ id: 'local-1' })];
    h.win.searchResultsState.resultProvenance = 'provisional';

    expect(h.win.hasAuthoritativeSearchResults()).toBe(false);
    expect(h.win.requireAuthoritativeSearchResults('Compare')).toBe(false);
  });

  it('refuses an action after a failed server search, and says why', async () => {
    const h = mount({ serverError: new Error('HTTP 502') });
    h.win._serverSearch({}, [row({ id: 'local-1' })]);
    await settle();

    expect(h.win.requireAuthoritativeSearchResults('Reports')).toBe(false);
    expect(h.toasts.some((t) => /Reports/.test(t.message))).toBe(true);
  });

  it('treats a missing provenance marker as NOT authoritative (fail closed)', () => {
    const h = mount();
    h.win.searchResultsState = { filteredListings: [row()], currentPage: 1 };

    expect(h.win.hasAuthoritativeSearchResults()).toBe(false);
  });
});

describe('performSearch · the preview is marked provisional before the server answers', () => {
  it('renders local rows as PROVISIONAL, not as a completed search', () => {
    const h = mount({ listings: [row({ id: 'local-1' })] });

    // Never resolves — leaves the state as it is while the server is pending.
    h.win.MallanAPI.idx.search = () => new Promise(() => {});
    h.win.collectSearchCriteria = () => ({ propertySubType: 'Apartment' });

    h.win.performSearch();

    expect(h.win.searchResultsState.resultProvenance).toBe('provisional');
    expect(h.win.hasAuthoritativeSearchResults()).toBe(false);
  });
});

describe('searchResultsAreStale · distinguishes "not searched yet" from "search did not answer"', () => {
  it('is false before any search has run — pre-search surfaces are untouched', () => {
    const h = mount({ listings: [row()] });
    expect(h.win.searchResultsAreStale()).toBe(false);
  });

  it('is true while a preview is showing', () => {
    const h = mount();
    h.win.searchResultsState.resultProvenance = 'provisional';
    expect(h.win.searchResultsAreStale()).toBe(true);
  });

  it('is true after a failed search', async () => {
    const h = mount({ serverError: new Error('HTTP 502') });
    h.win._serverSearch({}, [row()]);
    await settle();
    expect(h.win.searchResultsAreStale()).toBe(true);
  });

  it('is false once the server has answered', async () => {
    const h = mount({ serverResult: { listings: [row()] } });
    h.win._serverSearch({}, []);
    await settle();
    expect(h.win.searchResultsAreStale()).toBe(false);
  });
});

/**
 * A BACKGROUND RELOAD MUST NOT INHERIT "AUTHORITATIVE".
 *
 * `_replaceListings` (data-loader.js) re-runs the LOCAL `filterListings` over
 * the freshly bootstrapped catalogue whenever the results view is open, and
 * writes the outcome straight into `searchResultsState.filteredListings`.
 *
 * It skips while a server search is in flight (`_serverSearchActive`), but a
 * reload AFTER one completes would replace the server universe with a locally
 * filtered one while `resultProvenance` still read 'authoritative' — the exact
 * masquerade this contract exists to prevent, arriving by a different door.
 */
describe('_replaceListings · a local re-filter downgrades the result state', () => {
  function mountBoth(): Harness {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM, VirtualConsole } = require('jsdom');
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
         <div id="searchFormContainer"></div>
         <div id="searchResultsSection" style="display:block"></div>
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
    win.fetch = () => Promise.reject(new Error('no network in tests'));

    // Same order as public/crm/index.html: search-engine.js then data-loader.js.
    for (const rel of ['public/crm/js/search/search-engine.js', 'public/crm/js/core/data-loader.js']) {
      const script = win.document.createElement('script');
      script.textContent = readFileSync(join(REPO, rel), 'utf8');
      win.document.body.appendChild(script);
    }
    return { win, toasts, searchCalls: [] };
  }

  it('downgrades a previously authoritative universe to provisional', () => {
    const h = mountBoth();
    h.win.searchResultsState.resultProvenance = 'authoritative';
    h.win.searchResultsState.filteredListings = [row({ id: 'server-1' })];
    h.win.activeSearchCriteria = { propertySubType: 'Apartment' };

    h.win._replaceListings([row({ id: 'reload-1', propertySubType: 'Apartment' })], 'IDX/Trestle');

    expect(h.win.searchResultsState.resultProvenance).not.toBe('authoritative');
    expect(h.win.hasAuthoritativeSearchResults()).toBe(false);
  });

  it('leaves the state alone when the results view is not open', () => {
    const h = mountBoth();
    h.win.document.getElementById('searchResultsSection').style.display = 'none';
    h.win.searchResultsState.resultProvenance = 'authoritative';

    h.win._replaceListings([row({ id: 'reload-1' })], 'IDX/Trestle');

    expect(h.win.searchResultsState.resultProvenance).toBe('authoritative');
  });
});

/**
 * DELIVERY IS GATED ON AN AUTHORITATIVE UNIVERSE.
 *
 * `generateReport()` is the single router for every output that LEAVES the CRM
 * — CSV, Excel, shareable public link, print, and email to a client — and it
 * resolves its rows through `getReportListings()`, which reads the same
 * `filteredListings` a failed search used to leave stale.
 *
 * `validateReportState()` is the gate that already fronts it, checking IDX and
 * internet opt-out. It checked WHETHER the rows may be displayed but never
 * whether they were an ANSWER, so a report built from preview rows passed
 * cleanly and could be emailed to a client or published as a public link.
 */
describe('validateReportState · refuses to deliver a preview universe', () => {
  function mountReports() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM, VirtualConsole } = require('jsdom');
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body><div id="searchResultsSection"></div></body></html>`,
      { runScripts: 'dangerously', url: 'https://mallan.test/crm/', virtualConsole: new VirtualConsole() },
    );
    const win = dom.window as any;
    win.LOGGED_IN_AGENT = { id: 1 };
    win.escapeHtml = (s: string) => s;
    win.showToast = () => {};
    win.fetch = () => Promise.reject(new Error('no network in tests'));
    win.listings = [];
    win.searchResultsState = { filteredListings: null, currentPage: 1, selectedListings: [] };
    // `reportState` is declared in data-loader.js; reports.js reads it as a global.
    win.reportState = { selectedListingIds: [], format: 'grid', version: 'customer', output: null, options: {} };

    for (const rel of ['public/crm/js/search/search-engine.js', 'public/crm/js/output/reports.js']) {
      const script = win.document.createElement('script');
      script.textContent = readFileSync(join(REPO, rel), 'utf8');
      win.document.body.appendChild(script);
    }
    return win;
  }

  // Both cases select a listing first, so the pre-existing
  // "Select at least 1 listing." error cannot mask the gate under test.
  it('blocks generation while the rows are only a provisional preview', () => {
    const win = mountReports();
    win.searchResultsState.filteredListings = [row({ id: 'preview-1' })];
    win.searchResultsState.resultProvenance = 'provisional';
    win.reportState.selectedListingIds = ['preview-1'];

    expect(win.validateReportState().join(' ')).toMatch(/not a completed search/i);
  });

  it('blocks generation after a failed search', () => {
    const win = mountReports();
    win.searchResultsState.filteredListings = [row({ id: 'stale-1' })];
    win.searchResultsState.resultProvenance = 'none';
    win.reportState.selectedListingIds = ['stale-1'];

    expect(win.validateReportState().join(' ')).toMatch(/not a completed search/i);
  });

  it('does not block when the server answered', () => {
    const win = mountReports();
    win.searchResultsState.filteredListings = [row({ id: 'server-1' })];
    win.searchResultsState.resultProvenance = 'authoritative';
    win.reportState.selectedListingIds = ['server-1'];

    expect(win.validateReportState().join(' ')).not.toMatch(/preview|completed search/i);
  });

  it('does not block before any search has run — pre-search reporting is untouched', () => {
    const win = mountReports();
    win.listings = [row({ id: 'catalog-1' })];
    win.reportState.selectedListingIds = ['catalog-1'];

    expect(win.validateReportState().join(' ')).not.toMatch(/preview|completed search/i);
  });
});

/**
 * THE OTHER TWO WRITERS OF THE RESULT SET.
 *
 * `recallLastSearch()` ("Last Search") rebuilds the result set purely from
 * `filterListings(listings, criteria)` and never round-trips — every set it
 * produces is preview data by construction.
 *
 * `toggleSortOrder()` DOES round-trip for price/listedDate/dom sorts, so its
 * success is authoritative; but its failure logged a console warning and
 * silently re-rendered a client-sorted stale array with no user-visible signal
 * at all — the same defect as `_serverSearch`, one file over.
 */
describe('the other result-set writers respect provenance', () => {
  function mountWith(rel: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM, VirtualConsole } = require('jsdom');
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
         <div id="searchFormContainer"></div>
         <div id="searchResultsSection" style="display:block"></div>
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
    win.fetch = () => Promise.reject(new Error('no network in tests'));
    win.listings = [row({ id: 'catalog-1' })];
    win.searchResultsState = { filteredListings: null, currentPage: 1, selectedListings: [] };

    for (const f of ['public/crm/js/search/search-engine.js', rel]) {
      const script = win.document.createElement('script');
      script.textContent = readFileSync(join(REPO, f), 'utf8');
      win.document.body.appendChild(script);
    }
    return { win, toasts };
  }

  it('recallLastSearch produces a PROVISIONAL set — it never asks the server', () => {
    const { win } = mountWith('public/crm/js/search/search-actions.js');
    win.searchResultsState.resultProvenance = 'authoritative';
    win.showSearchSection = () => {};
    // The real key is namespaced per agent and lives in localStorage.
    win.localStorage.setItem(
      'lastSearchCriteria_1',
      JSON.stringify({ criteria: { propertySubType: 'Apartment' }, tab: 'sale' }),
    );

    win.recallLastSearch();

    expect(win.searchResultsState.resultProvenance).not.toBe('authoritative');
  });

  it('a failed sort re-fetch surfaces the failure instead of silently re-sorting stale rows', async () => {
    const h = mountWith('public/crm/js/listing/toolbar-functions.js');
    h.win.searchResultsState.resultProvenance = 'authoritative';
    // The server re-fetch branch is chosen from STATE, not from an argument.
    h.win.searchResultsState.sortField = 'price';
    h.win.searchResultsState.sortOrder = 'desc';
    h.win.activeSearchCriteria = { searchTab: 'sale' };
    h.win.currentSearchTab = 'sale';
    h.win.MallanAPI = { idx: { search: () => Promise.reject(new Error('HTTP 502')) } };

    h.win.toggleSortOrder();
    await settle();

    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(h.win.searchResultsState.resultProvenance).not.toBe('authoritative');
  });
});

/**
 * SESSION RESTORE IS A LOCAL RECONSTRUCTION, NOT AN ANSWER.
 *
 * `_restoreSearchState()` rebuilds the result set by intersecting persisted ids
 * with whatever the global `listings` array happens to hold at restore time.
 * Rows absent from that array are silently dropped — so the restored set can be
 * a strict, unannounced subset of what the search actually returned. It has not
 * been re-asked of the server, so it is a preview.
 */
describe('_restoreSearchState · a rebuilt set is provisional', () => {
  it('does not present a locally reconstructed set as authoritative', () => {
    const h = mount({ listings: [row({ id: 'a' }), row({ id: 'b' })] });
    h.win.searchResultsState.resultProvenance = 'authoritative';
    // The restore path calls these on its way through; without them it throws
    // into its own try/catch and returns false, which would pass vacuously.
    h.win.toggleSearchMode = () => {};
    h.win.toggleSearchTab = () => {};
    h.win.sessionStorage.setItem(
      '_searchState',
      JSON.stringify({ filteredIds: ['a', 'b'], tab: 'sale', mode: 'basic', page: 1, ts: Date.now() }),
    );

    // Must actually take the restore path for this test to mean anything.
    expect(h.win._restoreSearchState()).toBe(true);
    expect(h.win.searchResultsState.filteredListings.map((l: any) => l.id)).toEqual(['a', 'b']);
    expect(h.win.searchResultsState.resultProvenance).not.toBe('authoritative');
  });
});
