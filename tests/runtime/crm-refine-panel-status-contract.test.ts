/// <reference types="jest" />
/**
 * REFINE RESULTS MUST SPEAK THE SAME STATUS CONTRACT AS THE FOUR INITIAL PANELS.
 *
 * The four Search panels (basic sale, basic rental, advanced sale, advanced rental) render from ONE
 * authority: the executor contract's per-transaction `statusChoices`, derived server-side from
 * lib/crm/status-mapping.ts. Refine Results was left behind on a hand-written five-checkbox row that wrote
 * legacy words (`ACTIVE`, `COMING_SOON`, `PENDING`, `CONTRACT`, `UNDER_CONTRACT`, `CLOSED`) — none of which
 * is a live Cotality StandardStatus member. `serializeSearchCriteria` validates every status against the
 * contract and refuses anything else BY NAME, so every Apply, every pill removal and every Clear aborted
 * before a request was issued: the whole panel was dead.
 *
 * It also spoke sale language on a rental search (a rental has no Coming Soon and no "Contract"), and
 * `syncRefineToMainForm` synced price / beds / baths back to the main form but NOT status, so the main form
 * and the refine panel disagreed the moment a status was changed.
 *
 * Every assertion below drives the shipped `renderStatusPanels`, `populateRefinePanel`,
 * `applyRefinedSearch`, `clearRefinePanel` and `syncRefineToMainForm` in a real DOM built from the shipped
 * partial, against the REAL server contract, and asserts on rendered DOM or on the request actually issued.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { searchContract } from '@/lib/search/engine/contract';
import { criteriaFromParams } from '@/lib/search/engine/criteria';
import { SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING } from '@/lib/crm/status-mapping';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTRACT = searchContract();

function boot() {
  const html = read('public/crm/html/search-form-and-results.html');
  const engine = read('public/crm/js/search/search-engine.js');
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
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = {
    filteredListings: [], selectedListings: [], perPage: 50, currentPage: 1,
    serverPaged: true, serverTotal: 0, serverCountMeaning: 'exact', viewMode: 'gallery',
    sortField: 'price', sortOrder: 'desc', visibleColumns: ['address', 'price', 'status'],
  };
  win.eval(statusHelper);
  win.eval(dispatcher);
  win.eval(engine);
  win.MallanAPI = {
    idx: {
      contract: () => Promise.resolve(JSON.parse(JSON.stringify(CONTRACT))),
      search: (params: Record<string, unknown>) => {
        const forwarded: Record<string, unknown> = {};
        for (const k of ['type', 'minPrice', 'maxPrice', 'minBeds', 'maxBeds', 'minBaths', 'maxBaths',
          'neighborhood', 'borough', 'status', 'listingId', 'zip', 'ownership', 'StructureType',
          'backOnMarket', 'sort', 'limit', 'skip']) {
          const v = (params as any)[k];
          if (k === 'minBeds' || k === 'maxBeds') { if (v != null) forwarded[k] = v; }
          else if (v) forwarded[k] = v;
        }
        requests.push(forwarded);
        return Promise.resolve({ listings: [], total: 0 });
      },
    },
    onReady: (cb: () => void) => cb(),
  };
  return { win, doc: win.document, requests, toasts, ready: () => win.loadSearchContract(), close: () => dom.window.close() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the refine panel is a contract-driven mount, not a hand-written status row', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('the legacy five hardcoded refine status checkboxes are gone from the markup', () => {
    for (const id of ['refineStatusActive', 'refineStatusComingSoon', 'refineStatusPending',
      'refineStatusContract', 'refineStatusClosed']) {
      expect({ id, el: h.doc.getElementById(id) }).toEqual({ id, el: null });
    }
  });

  it('the refine panel carries one sale mount and one rental mount, exactly like the four initial panels', () => {
    const sale = h.doc.querySelector('[data-status-mount="refine-sale"]');
    const rental = h.doc.querySelector('[data-status-mount="refine-rental"]');
    expect(sale).not.toBeNull();
    expect(rental).not.toBeNull();
    expect(sale.getAttribute('data-transaction')).toBe('sale');
    expect(rental.getAttribute('data-transaction')).toBe('rental');
  });

  it('each mount renders that transaction\'s own choices as exact live StandardStatus tokens', () => {
    for (const [mount, transaction] of [['refine-sale', 'sale'], ['refine-rental', 'rental']] as const) {
      const boxes = [...h.doc.querySelectorAll(`[data-status-mount="${mount}"] input[type="checkbox"]`)] as any[];
      expect({ mount, n: boxes.length }).toEqual({ mount, n: CONTRACT.statusChoices[transaction].length });
      expect(boxes.map((b) => ({
        field: b.getAttribute('data-field'),
        token: b.getAttribute('data-value'),
        label: b.parentElement?.textContent?.trim(),
      }))).toEqual(CONTRACT.statusChoices[transaction].map((c) => ({
        field: 'StandardStatus', token: c.token, label: c.label,
      })));
    }
  });

  it('the rental refine panel offers no Coming Soon and no sale-contract terminology', () => {
    const labels = [...h.doc.querySelectorAll('[data-status-mount="refine-rental"] input')]
      .map((b: any) => b.parentElement?.textContent?.trim());
    expect(labels).toContain(RENTAL_STATUS_MAPPING.canonicalLabels.Closed); // 'Rented'
    expect(labels).not.toContain('Coming Soon');
    expect(labels).not.toContain('In Contract');
    expect(labels).not.toContain(SALE_STATUS_MAPPING.canonicalLabels.Closed); // 'Sold'
  });

  it('the sale refine panel speaks sale language and never a rental term', () => {
    const labels = [...h.doc.querySelectorAll('[data-status-mount="refine-sale"] input')]
      .map((b: any) => b.parentElement?.textContent?.trim());
    expect(labels).toContain('Sold');
    expect(labels).toContain('In Contract');
    expect(labels).not.toContain('Rented');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('Refine Results reaches the executor', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('Apply on a sale search issues ONE request whose status is a live token, with no refusal toast', async () => {
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'] };
    h.win.currentSearchTab = 'sale';
    h.win.populateRefinePanel();
    (h.doc.getElementById('refineMinPrice') as any).value = '1000000';
    h.requests.length = 0; h.toasts.length = 0;
    (h.doc.querySelector('[onclick="applyRefinedSearch()"]') as any).click();
    await flush(); await flush();
    expect(h.toasts.filter((t) => /Not executable|refused/.test(t.message))).toEqual([]);
    expect(h.requests.length).toBe(1);
    expect(h.requests[0]).toMatchObject({ type: 'sale', status: 'Active', minPrice: 1000000 });
    // and the executor itself accepts what was sent
    const qs = new URLSearchParams(Object.entries(h.requests[0]).map(([k, v]) => [k, String(v)]));
    expect(criteriaFromParams(qs).ok).toBe(true);
  });

  it('checking Sold in the refine panel sends status=Closed (the token, never the label)', async () => {
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'] };
    h.win.currentSearchTab = 'sale';
    h.win.populateRefinePanel();
    const sold = h.doc.querySelector('[data-status-mount="refine-sale"] input[data-value="Closed"]') as any;
    expect(sold).not.toBeNull();
    expect(sold.parentElement.textContent.trim()).toBe('Sold');
    sold.checked = true;
    h.requests.length = 0; h.toasts.length = 0;
    h.win.applyRefinedSearch();
    await flush(); await flush();
    expect(h.toasts.filter((t) => /Not executable|refused/.test(t.message))).toEqual([]);
    expect(String(h.requests[0].status).split(',').sort()).toEqual(['Active', 'Closed']);
  });

  it('a rental refine sends a rental status and never a sale-only token', async () => {
    h.win.activeSearchCriteria = { searchTab: 'rent', statuses: ['Active'] };
    h.win.currentSearchTab = 'rent';
    h.win.populateRefinePanel();
    const rented = h.doc.querySelector('[data-status-mount="refine-rental"] input[data-value="Closed"]') as any;
    expect(rented.parentElement.textContent.trim()).toBe('Rented');
    rented.checked = true;
    h.requests.length = 0; h.toasts.length = 0;
    h.win.applyRefinedSearch();
    await flush(); await flush();
    expect(h.requests.length).toBe(1);
    expect(h.requests[0].type).toBe('rental');
    expect(String(h.requests[0].status)).not.toContain('ComingSoon');
    expect(h.doc.querySelector('[data-status-mount="refine-rental"]').parentElement.style.display).not.toBe('none');
    expect(h.doc.querySelector('[data-status-mount="refine-sale"]').parentElement.style.display).toBe('none');
  });

  it('clearRefinePanel re-issues a search rather than aborting on a refusal', async () => {
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active', 'Closed'] };
    h.win.currentSearchTab = 'sale';
    h.win.populateRefinePanel();
    h.requests.length = 0; h.toasts.length = 0;
    h.win.clearRefinePanel();
    await flush(); await flush();
    expect(h.toasts.filter((t) => /Not executable|refused/.test(t.message))).toEqual([]);
    expect(h.requests.length).toBe(1);
    expect(h.requests[0].status).toBe('Active');
  });

  it('removing a filter pill re-issues a search rather than aborting on a refusal', async () => {
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'], priceMin: 500000, priceMax: 900000 };
    h.win.currentSearchTab = 'sale';
    h.win.populateRefinePanel();
    h.requests.length = 0; h.toasts.length = 0;
    h.win.removeRefineFilter('price');
    await flush(); await flush();
    expect(h.toasts.filter((t) => /Not executable|refused/.test(t.message))).toEqual([]);
    expect(h.requests.length).toBe(1);
    expect(h.requests[0].minPrice).toBeUndefined();
  });

  it('the Back On Market refinement survives the round trip as an executable narrowing of Active', async () => {
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'] };
    h.win.currentSearchTab = 'sale';
    h.win.populateRefinePanel();
    const bom = h.doc.querySelector('[data-status-mount="refine-sale"] input[data-refine="backOnMarket"]') as any;
    expect(bom).not.toBeNull();
    bom.checked = true;
    h.requests.length = 0;
    h.win.applyRefinedSearch();
    await flush(); await flush();
    expect(h.requests[0].backOnMarket).toBe('1');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('populateRefinePanel and syncRefineToMainForm keep the panel and the main form in agreement', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('populateRefinePanel checks the boxes that match the active criteria and no others', () => {
    h.win.currentSearchTab = 'sale';
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Closed', 'Pending'] };
    h.win.populateRefinePanel();
    const checked = [...h.doc.querySelectorAll('[data-status-mount="refine-sale"] input:checked')]
      .map((b: any) => b.getAttribute('data-value')).sort();
    expect(checked).toEqual(['Closed', 'Pending']);
  });

  it('syncRefineToMainForm writes the refined STATUS back into the main panel mount, not only price/beds/baths', () => {
    h.win.currentSearchTab = 'sale';
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'] };
    h.win.populateRefinePanel();
    h.win.syncRefineToMainForm({ searchTab: 'sale', statuses: ['Closed'], priceMin: 700000, bedsMin: 2 });
    const mainChecked = [...h.doc.querySelectorAll('[data-status-mount="basic-sale"] input:checked')]
      .map((b: any) => b.getAttribute('data-value'));
    expect(mainChecked).toEqual(['Closed']);
    expect((h.doc.getElementById('saleMinPrice') as any).value).toBe('700000');
    expect((h.doc.getElementById('saleMinBeds') as any).value).toBe('2');
  });

  it('a rental refine syncs into the RENTAL panel mount, never the sale one', () => {
    h.win.currentSearchTab = 'rent';
    h.win.syncRefineToMainForm({ searchTab: 'rent', statuses: ['Closed'] });
    expect([...h.doc.querySelectorAll('[data-status-mount="basic-rental"] input:checked')]
      .map((b: any) => b.getAttribute('data-value'))).toEqual(['Closed']);
  });

  it('the panel never writes a legacy word: nothing it produces is refused by the serializer', () => {
    h.win.currentSearchTab = 'sale';
    h.win.activeSearchCriteria = { searchTab: 'sale', statuses: ['Active'] };
    h.win.populateRefinePanel();
    for (const box of [...h.doc.querySelectorAll('[data-status-mount="refine-sale"] input')] as any[]) {
      box.checked = true;
    }
    const c = h.win.refineCriteriaFromPanel();
    const ser = h.win.serializeSearchCriteria(c);
    expect(ser.refused).toEqual([]);
    for (const token of c.statuses) {
      expect(CONTRACT.members.StandardStatus.some((m) => m.token === token)).toBe(true);
    }
  });
});
