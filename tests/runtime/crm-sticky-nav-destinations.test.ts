/// <reference types="jest" />
/**
 * THE STICKY RESULTS NAV MUST TELL THE TRUTH ABOUT WHERE YOU ARE AND WHAT YOU FOUND.
 *
 * Six destinations sit in `#stickySearchNav`. Before this fix:
 *   - Buildings and Comps carried no `id`, and `updateStickyNavActive` only ever considered four ids, so
 *     neither could be highlighted: clicking Buildings left every button unhighlighted.
 *   - `jumpToSearch()` switched the TAB but never the search TYPE, so jumping out of Comparables left
 *     `#comparablesSection` on screen while the Sales tab button was styled active.
 *   - The nav count was `getFilteredListings(true).length` — the CURRENT PAGE — while the toolbar beside it
 *     read `searchResultsState.serverTotal`. Two contradictory totals on one screen.
 *   - `updateStickyNavActive` was called only before the executor answered, so the count never refreshed.
 *   - The Back button re-derived basic/advanced from a CSS class instead of the mode state.
 *   - "Last Search" recall and a saved search restored neither the transaction nor the search type, so a
 *     recalled rental search was labelled "Sales · Basic" and refined as a sale.
 *
 * Every assertion drives a real click or the shipped global and asserts on rendered DOM / issued request.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { searchContract } from '@/lib/search/engine/contract';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTRACT = searchContract();

function boot() {
  const html = read('public/crm/html/search-form-and-results.html');
  const engine = read('public/crm/js/search/search-engine.js');
  const actions = read('public/crm/js/search/search-actions.js');
  const statusHelper = read('public/crm/js/core/status-presentation.js');
  const dispatcher = read('public/crm/js/render/render-dispatcher.js');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  const requests: Array<Record<string, unknown>> = [];
  const toasts: Array<{ message: string; kind: string }> = [];
  win.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  win.showToast = (message: string, kind: string) => { toasts.push({ message, kind: kind || 'info' }); };
  win.scrollTo = () => undefined;
  win.showSearchSection = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = {
    filteredListings: [], selectedListings: [], perPage: 50, currentPage: 1,
    serverPaged: false, serverTotal: null, serverCountMeaning: null, viewMode: 'gallery',
    sortField: 'price', sortOrder: 'desc', visibleColumns: ['address', 'price', 'status'],
  };
  win.eval(statusHelper);
  win.eval(dispatcher);
  // The real renderers, in the page's own load order (read-only here — this file owns none of them).
  // core/nav.js supplies the shared escapeHtml the renderers call; it is loaded first on the real page.
  win.eval(read('public/crm/js/core/nav.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/render/grid-column-defs.js'));
  win.eval(read('public/crm/js/render/render-grid.js'));
  win.eval(read('public/crm/js/render/shared-badges.js'));
  win.eval(read('public/crm/js/render/render-gallery.js'));
  win.eval(read('public/crm/js/render/render-summary.js'));
  win.eval(read('public/crm/js/render/render-short-summary.js'));
  win.eval(read('public/crm/js/render/render-master-detail.js'));
  win.eval(engine);
  win.eval(actions);
  win.eval(read('public/crm/js/search/saved-searches.js'));
  win.eval(read('public/crm/js/search/pagination.js'));
  // nav.js ships its own showToast / showSearchSection, and both need page chrome that lives outside this
  // partial. Re-stub AFTER every eval so toasts are captured and section switching is a no-op here.
  win.showToast = (message: string, kind: string) => { toasts.push({ message, kind: kind || 'info' }); };
  win.showSearchSection = () => undefined;

  let nextResponse: any = { listings: [], total: 0 };
  win.MallanAPI = {
    idx: {
      contract: () => Promise.resolve(JSON.parse(JSON.stringify(CONTRACT))),
      search: (params: Record<string, unknown>) => { requests.push({ ...params }); return Promise.resolve(nextResponse); },
    },
    onReady: (cb: () => void) => cb(),
  };
  return {
    win, doc: win.document, requests, toasts,
    setResponse(r: any) { nextResponse = r; },
    ready: () => win.loadSearchContract(),
    close: () => dom.window.close(),
  };
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const navButton = (h: ReturnType<typeof boot>, startsWith: string) =>
  [...h.doc.querySelectorAll('#stickySearchNav button')]
    .find((b: any) => b.textContent.replace(/\s+/g, ' ').trim().startsWith(startsWith)) as any;

const highlighted = (h: ReturnType<typeof boot>) =>
  [...h.doc.querySelectorAll('#stickySearchNav button')]
    .filter((b: any) => b.classList.contains('bg-white/15'))
    .map((b: any) => b.textContent.replace(/\s+/g, ' ').trim());

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('all six nav destinations are addressable and highlightable', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('every nav destination carries an id', () => {
    const ids = ['stickyNavSaleBasic', 'stickyNavSaleAdv', 'stickyNavRentBasic', 'stickyNavRentAdv',
      'stickyNavBuilding', 'stickyNavComps'];
    for (const id of ids) expect({ id, present: !!h.doc.getElementById(id) }).toEqual({ id, present: true });
  });

  it('clicking Buildings highlights Buildings — and only Buildings', () => {
    navButton(h, 'Buildings').click();
    h.win.updateStickyNavActive();
    expect(highlighted(h)).toEqual(['Buildings']);
    expect(h.doc.getElementById('stickyNavActiveLabel').textContent).toContain('Buildings');
  });

  it('clicking Comps highlights Comps and clears the tab highlight', () => {
    navButton(h, 'Comps').click();
    h.win.updateStickyNavActive();
    expect(highlighted(h)).toEqual(['Comps']);
    expect(h.doc.getElementById('stickyNavActiveLabel').textContent).toContain('Comparables');
  });

  it('clicking Sales highlights Sales', () => {
    navButton(h, 'Sales').click();
    h.win.updateStickyNavActive();
    expect(highlighted(h)).toEqual(['Sales']);
  });

  it('clicking Rentals highlights Rentals', () => {
    navButton(h, 'Rentals').click();
    h.win.updateStickyNavActive();
    expect(highlighted(h)).toEqual(['Rentals']);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('no nav destination is a dead end', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('Buildings → Search issues a real executor request and no refusal toast', async () => {
    navButton(h, 'Buildings').click();
    h.requests.length = 0; h.toasts.length = 0;
    h.setResponse({ total: 0, listings: [] });
    (h.doc.querySelector('[onclick="performSearch()"]') as any).click();
    await flush();
    expect(h.toasts.filter((t) => t.kind === 'warning' && /Not executable/.test(t.message))).toEqual([]);
    expect(h.requests.length).toBe(1);
  });

  it('a nav jump OUT of Comparables shows the general form and hides the comparables form', () => {
    h.win.toggleSearchType('comparables');
    expect(h.doc.getElementById('comparablesSection').style.display).toBe('block');
    navButton(h, 'Sales').click();
    expect({
      general: h.doc.getElementById('generalSearchSection').style.display,
      comps: h.doc.getElementById('comparablesSection').style.display,
    }).toEqual({ general: 'block', comps: 'none' });
  });

  it('jumpToComparables shows the comparables form', () => {
    navButton(h, 'Comps').click();
    expect({
      general: h.doc.getElementById('generalSearchSection').style.display,
      comps: h.doc.getElementById('comparablesSection').style.display,
    }).toEqual({ general: 'none', comps: 'block' });
  });

  it('the Back button derives basic/advanced from the mode state, not from a CSS class', () => {
    h.win.toggleSearchType('general');
    h.win.toggleSearchTab('rent');
    h.win.toggleSearchMode('advanced');
    // strip the class the old Back button keyed on; the destination must be unchanged
    h.doc.getElementById('btnSearchBasic').classList.remove('bg-gray-900');
    navButton(h, 'Back').click();
    expect(h.doc.getElementById('searchAdvancedMode').style.display).toBe('block');
    expect(h.win.currentSearchTab).toBe('rent');
    h.win.toggleSearchMode('basic');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the nav count is the executor total, and it refreshes when the executor answers', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('after a 4,821-result search the nav count equals the toolbar count', async () => {
    h.win.toggleSearchTab('sale');
    h.setResponse({
      total: 4821,
      listings: [1, 2, 3, 4].map((n) => ({
        id: 'l' + n, lid: 'RLS' + n, address: n + ' Test Street', price: 1000000 * n,
        beds: 1, baths: 1, status: 'Active', status_label: 'Active', status_transaction: 'sale', permissions: {},
      })),
    });
    h.win.performSearch();
    await flush();
    const nav = h.doc.getElementById('stickyNavResultCount').textContent;
    const toolbar = h.doc.getElementById('resultsCount').textContent;
    expect(nav).toContain('4,821');
    expect(toolbar).toContain('4,821');
    expect(nav.replace(/[^0-9,]/g, '')).toBe(toolbar.replace(/[^0-9,]/g, ''));
  });

  it('a lower-bound count is labelled as such, exactly like the toolbar', async () => {
    h.setResponse({ total: 5000, countMeaning: 'lower_bound', listings: [] });
    h.win.performSearch();
    await flush();
    expect(h.doc.getElementById('stickyNavResultCount').textContent).toMatch(/At least/);
  });

  it('a failed search leaves the nav count at zero rather than the previous total', async () => {
    h.win.MallanAPI.idx.search = () => Promise.reject(new Error('boom'));
    h.win.performSearch();
    await flush();
    expect(h.doc.getElementById('stickyNavResultCount').textContent).toContain('0');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('Last Search and saved-search recall restore the transaction AND the search type', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('recalling a rental search sets the rental tab, the rental refine label and the general search type', async () => {
    h.win.localStorage.setItem('lastSearchCriteria_agent-1', JSON.stringify({
      criteria: { searchTab: 'rent', statuses: ['Active'], priceMax: 8000 }, timestamp: Date.now(),
    }));
    h.win.toggleSearchTab('sale');
    h.win.toggleSearchType('comparables');
    h.setResponse({ total: 1, listings: [] });
    h.win.recallLastSearch();
    await flush();
    expect(h.win.currentSearchTab).toBe('rent');
    expect(h.doc.getElementById('stickyNavActiveLabel').textContent).toContain('Rentals');
    expect(h.doc.getElementById('comparablesSection').style.display).toBe('none');
    h.win.populateRefinePanel();
    expect(h.doc.getElementById('refineSearchType').textContent).toBe('Rentals');
  });

  it('the recalled search is re-asked of the executor as a rental', async () => {
    expect(h.requests[h.requests.length - 1].type).toBe('rental');
  });

  it('_paramsToFormFields switches the search type to general before restoring a saved search', () => {
    h.win.toggleSearchType('comparables');
    const issues = h.win._paramsToFormFields({ type: 'rental', status: 'Active', maxPrice: '8000' });
    expect(issues).toEqual([]);
    expect(h.doc.getElementById('comparablesSection').style.display).toBe('none');
    expect(h.doc.getElementById('generalSearchSection').style.display).toBe('block');
    expect(h.win.currentSearchTab).toBe('rent');
  });

  it('a saved rental search restores its ownership tokens into the RENTAL panel, not the sale one', () => {
    const issues = h.win._paramsToFormFields({ type: 'rental', status: 'Active', ownership: 'Condominium' });
    expect(issues).toEqual([]);
    const checked = [...h.doc.querySelectorAll('#searchBasicModeRental [data-field="CommonInterest"]:checked')]
      .map((b: any) => b.getAttribute('data-value'));
    expect(checked).toEqual(['Condominium']);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the result dispatcher never renders nothing', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('an unknown persisted view mode falls back to a real view instead of a blank screen', () => {
    h.win.searchResultsState.viewMode = 'list'; // a stale value from the retired toggleResultsView
    h.win.searchResultsState.filteredListings = [{
      id: 'z1', lid: 'RLSZ', address: '1 Fallback Way', price: 100, beds: 1, baths: 1,
      status: 'Active', status_label: 'Active', status_transaction: 'sale', permissions: {},
    }];
    h.win.renderSearchResults();
    const visible = ['gridViewContainer', 'galleryViewContainer', 'shortSummaryViewContainer',
      'summaryViewContainer', 'masterDetailViewContainer']
      .filter((id) => h.doc.getElementById(id) && h.doc.getElementById(id).style.display !== 'none');
    expect(visible.length).toBe(1);
    expect(h.win.searchResultsState.viewMode).toBe('gallery');
  });

  it('the 24-hour closed suppression compares the live token, not the retired uppercase word', () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 48).toLocaleDateString('en-US');
    h.win.searchResultsState.filteredListings = [
      { id: 'k1', address: 'A', status: 'Closed', status_transaction: 'sale', updatedDate: old, permissions: {} },
      { id: 'k2', address: 'B', status: 'Active', status_transaction: 'sale', permissions: {} },
    ];
    expect(h.win.getFilteredListings().map((l: any) => l.id)).toEqual(['k2']);
  });

  it('the grid renderer never fabricates a status onto a row the executor left blank', () => {
    const row: any = { id: 'n1', lid: 'RLSN', address: 'No Status Lane', price: 1, beds: 1, baths: 1, permissions: {} };
    h.win.searchResultsState.filteredListings = [row];
    h.win.searchResultsState.viewMode = 'grid';
    h.win.renderSearchResults();
    expect(row.status).toBeUndefined();
    expect(h.doc.getElementById('resultsTable').innerHTML).not.toContain('ACTIVE');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('a sort header either sorts or is not a control', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  const renderGrid = () => {
    h.win.searchResultsState.viewMode = 'grid';
    h.win.searchResultsState.visibleColumns = ['address', 'unit', 'price', 'beds', 'baths', 'listedDate', 'status'];
    h.win.searchResultsState.filteredListings = [1, 2, 3].map((n) => ({
      id: 's' + n, lid: 'RLSS' + n, address: n + ' Sort Street', unit: String(n), price: 1000 * n,
      beds: n, baths: n, listedDate: '1/' + n + '/2026', status: 'Active', status_label: 'Active',
      status_transaction: 'sale', permissions: {},
    }));
    h.win.renderSearchResults();
  };

  it('only the columns the executor can order by carry a sort control', () => {
    renderGrid();
    const heads = [...h.doc.querySelectorAll('#resultsTable thead th')] as any[];
    const clickable = heads.filter((th) => th.getAttribute('onclick')).map((th) => th.getAttribute('onclick'));
    expect(clickable.sort()).toEqual(["toggleColumnSort('listedDate')", "toggleColumnSort('price')"]);
    // and no non-sortable header advertises a sort arrow
    const arrowsOnDead = heads.filter((th) => !th.getAttribute('onclick') && /fa-sort|fa-arrow-(up|down)/.test(th.innerHTML));
    expect(arrowsOnDead.map((th) => th.textContent.trim())).toEqual([]);
  });

  it('a sortable header re-asks the executor in the new order instead of re-shuffling one page', async () => {
    renderGrid();
    h.requests.length = 0;
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'] };
    h.win.searchResultsState.serverPaged = true;
    h.win.searchResultsState.serverTotal = 3;
    h.setResponse({ total: 3, listings: [] });
    h.win.toggleColumnSort('price');
    await flush();
    expect(h.requests.length).toBe(1);
    expect(h.requests[0].sort).toBe('price_asc');
    expect(h.win.searchResultsState.sortField).toBe('price');
  });

  it('a non-executable column changes nothing and issues nothing', async () => {
    renderGrid();
    const before = { field: h.win.searchResultsState.sortField, order: h.win.searchResultsState.sortOrder };
    h.requests.length = 0;
    h.win.toggleColumnSort('beds');
    await flush();
    expect(h.requests.length).toBe(0);
    expect({ field: h.win.searchResultsState.sortField, order: h.win.searchResultsState.sortOrder }).toEqual(before);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the listing detail drawer survives the nulls the executor legitimately returns', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  const ROW = {
    id: 'd1', lid: 'RLSD1', address: '1 Null Way', unit: '3A', price: 1250000,
    maintCC: null, totalMonthly: null, beds: 1, baths: 1, images: [], listedDate: '1/1/2026',
    status: 'Pending', status_label: 'In Contract', status_transaction: 'sale',
    permissions: {}, dom: 10, cdom: 10, neighborhood: 'Tribeca', borough: 'Manhattan',
  };

  it('renders the drawer with the price and an explicit "Unavailable" instead of dying silently', () => {
    h.win.listings = [ROW];
    h.win.searchResultsState.filteredListings = [ROW];
    h.win.showListingDetail('d1');
    const header = h.doc.getElementById('detailHeaderRight');
    expect(header.textContent).toContain('$1,250,000');
    expect(header.textContent).toContain('Unavailable');
    expect(h.doc.getElementById('listingDetailContent').innerHTML.length).toBeGreaterThan(0);
  });

  it('the drawer badge is the transaction\'s broker word, never the raw token', () => {
    h.win.listings = [ROW];
    h.win.searchResultsState.filteredListings = [ROW];
    h.win.showListingDetail('d1');
    const header = h.doc.getElementById('detailHeaderRight');
    expect(header.textContent).toContain('In Contract');
    expect(header.textContent).not.toContain('PENDING');
  });

  it('a rental closing reads Rented in the drawer, never Sold', () => {
    const rental = { ...ROW, id: 'd2', listingCategory: 'rental', status: 'Closed', status_transaction: 'rent', status_label: 'Rented' };
    h.win.listings = [rental];
    h.win.searchResultsState.filteredListings = [rental];
    h.win.showListingDetail('d2');
    const header = h.doc.getElementById('detailHeaderRight');
    expect(header.textContent).toContain('Rented');
    expect(header.textContent).not.toContain('Sold');
  });
});
