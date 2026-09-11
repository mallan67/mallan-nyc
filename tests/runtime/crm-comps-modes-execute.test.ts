/// <reference types="jest" />
/**
 * THE THREE COMPARABLES MODES MUST EXECUTE — and a CMA must never be built from criteria the wire
 * silently dropped, from a date that is not a closing date, or from a price that is not a closing price.
 *
 * What was wrong (all reproduced by these tests against the unchanged code before the fix):
 *   - Subject Property required an address, then discarded it: the request issued was
 *     `type=sale&status=Closed&limit=100` — every closed listing in the feed, rendered under the heading
 *     "Comps for Sale". The server-side CMA refuses exactly this (lib/cma/engine.ts: "a comp search is
 *     never widened to the whole city").
 *   - Every comp select's default option carried no `value`, so `el.value === "Any Min"` and
 *     `parseInt("Any Min") === NaN` reached the wire as `minBeds=NaN`; both Subject Buildings and General
 *     Criteria 400'd out of the box.
 *   - `buildingName` and `minSqft`/`maxSqft` were assigned and then dropped. (As of 2026-09-11 both
 *     ARE executable criteria of the main Search — Backend Agent Search P0, Correction Slice 1 — but
 *     the Comparables panels carry no SqFt and no building-name control at all, so
 *     `serializeCompCriteria` still produces neither, and the assertions below are unaffected.)
 *   - 54 status checkboxes across two panels had no id, no data-field and no reader; 12 of their labels
 *     were Mallan WORKFLOW words the executor refuses by name.
 *   - The "Sold Date" column rendered `ModificationTimestamp`; the Price column rendered the ASK of a
 *     closed comp; the status badge printed a raw token, or the literal `CLOSED`.
 *   - 18 read-only date inputs advertised windows that closed in early 2026 and were never sent.
 *   - Load / Save / Clear / Generate Report were dead controls.
 *
 * Every assertion drives the shipped `showCompResults`, `serializeCompCriteria`, `clearCompCriteria`,
 * `saveCompCriteria`, `loadCompCriteria` and `openCompReport` in a real DOM built from the shipped partial,
 * and asserts on the captured request or the rendered DOM.
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

  const queue: any[] = [];
  win.MallanAPI = {
    idx: {
      contract: () => Promise.resolve(JSON.parse(JSON.stringify(CONTRACT))),
      search: (params: Record<string, unknown>) => {
        const forwarded: Record<string, unknown> = {};
        for (const k of ['type', 'minPrice', 'maxPrice', 'minBeds', 'maxBeds', 'minBaths', 'maxBaths',
          'neighborhood', 'borough', 'status', 'listingId', 'zip', 'ownership', 'StructureType',
          'sort', 'limit', 'skip']) {
          const v = (params as any)[k];
          if (k === 'minBeds' || k === 'maxBeds') { if (v != null) forwarded[k] = v; }
          else if (v) forwarded[k] = v;
        }
        requests.push(forwarded);
        return Promise.resolve(queue.length ? queue.shift() : { listings: [], total: 0 });
      },
    },
    onReady: (cb: () => void) => cb(),
  };
  return {
    win, doc: win.document, requests, toasts,
    enqueue(...r: any[]) { queue.push(...r); },
    ready: () => win.loadSearchContract(),
    close: () => dom.window.close(),
  };
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const SALE_COMP = {
  id: 'c1', lid: 'RLS-C1', address: '45 East 89th Street', unit: '12B', price: 2450000,
  closePrice: 2375000, closedDate: '2026-03-11', beds: 2, baths: 2, intSqft: 1180,
  status: 'Closed', status_label: SALE_STATUS_MAPPING.canonicalLabels.Closed, status_transaction: 'sale',
  updatedDate: '6/12/2026', listedDate: '1/2/2026', neighborhood: 'Carnegie Hill', permissions: {},
};
const RENTAL_COMP = {
  id: 'c2', lid: 'RLS-C2', address: '200 West 79th Street', unit: '4C', price: 7200,
  closePrice: 7000, closedDate: '2026-06-30', beds: 1, baths: 1, intSqft: 700,
  status: 'Closed', status_label: RENTAL_STATUS_MAPPING.canonicalLabels.Closed, status_transaction: 'rent',
  listingCategory: 'rental', updatedDate: '8/1/2026', permissions: {},
};
/** A closed comp the provider never gave a CloseDate — it must never be dated by something else. */
const UNDATED_COMP = {
  id: 'c3', lid: 'RLS-C3', address: '5 Nowhere Lane', unit: '1A', price: 999000,
  closePrice: null, closedDate: null, beds: 1, baths: 1, intSqft: null,
  status: 'Closed', status_label: 'Sold', status_transaction: 'sale', updatedDate: '7/7/2026', permissions: {},
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('no comps control is dead, fabricated or un-executable', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('every select inside #comparablesSection has an explicit value on EVERY option (no NaN can be built)', () => {
    const offenders: string[] = [];
    for (const sel of [...h.doc.querySelectorAll('#comparablesSection select')] as any[]) {
      for (const opt of [...sel.options] as any[]) {
        if (!opt.hasAttribute('value')) offenders.push((sel.id || '(no id)') + ' → "' + opt.textContent.trim() + '"');
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the fabricated "N Results Found" counts and the placeholder blocks are gone', () => {
    const section = h.doc.getElementById('comparablesSection');
    expect(section.textContent).not.toMatch(/Results Found/);
    expect(section.textContent).not.toMatch(/Comparable properties will be displayed here/);
  });

  it('the frozen 2025/2026 date windows are gone', () => {
    expect(h.doc.getElementById('comparablesSection').innerHTML).not.toMatch(/Last \d+ Days \(\d\d\/\d\d\/20\d\d/);
    expect([...h.doc.querySelectorAll('#comparablesSection input[readonly]')].length).toBe(0);
  });

  it('every comps status control is a contract-driven mount carrying live StandardStatus tokens', () => {
    const mounts = [...h.doc.querySelectorAll('#comparablesSection [data-status-mount]')] as any[];
    expect(mounts.length).toBeGreaterThan(0);
    const live = new Set(CONTRACT.members.StandardStatus.map((m) => m.token));
    for (const mount of mounts) {
      const boxes = [...mount.querySelectorAll('input[type="checkbox"]')] as any[];
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.getAttribute('data-field')).toBe('StandardStatus');
        expect(live.has(b.getAttribute('data-value'))).toBe(true);
      }
    }
  });

  it('not one Mallan workflow word survives anywhere in the comparables markup', () => {
    const text = h.doc.getElementById('comparablesSection').textContent;
    for (const word of ['Offer Out', 'Offer Thru Us', 'Contract Out', 'Contract Signed', 'All Contract Signed',
      'Board Approved', 'All Sold', 'Sold Thru Us', 'All Not Active', 'Verified ACRIS Sales Only']) {
      expect({ word, present: text.includes(word) }).toEqual({ word, present: false });
    }
  });

  it('every button inside #comparablesSection is wired (onclick) or explicitly disabled', () => {
    const dead = [...h.doc.querySelectorAll('#comparablesSection button')]
      .filter((b: any) => !b.getAttribute('onclick') && !b.disabled)
      .map((b: any) => b.textContent.replace(/\s+/g, ' ').trim());
    expect(dead).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the comps serializer executes or refuses BY NAME — never drops', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('serializeCompCriteria exists and returns { params, refused, transaction }', () => {
    expect(typeof h.win.serializeCompCriteria).toBe('function');
    const r = h.win.serializeCompCriteria('general');
    expect(Object.keys(r).sort()).toEqual(['params', 'refused', 'transaction']);
  });

  it('an untouched panel produces no NaN and no un-named criterion', () => {
    for (const page of ['building', 'general']) {
      const r = h.win.serializeCompCriteria(page);
      for (const [k, v] of Object.entries(r.params)) {
        expect({ page, k, isNaN: typeof v === 'number' && Number.isNaN(v) }).toEqual({ page, k, isNaN: false });
      }
    }
  });

  it('whatever the serializer emits, the REAL executor accepts', () => {
    (h.doc.getElementById('compGeneralNeighborhood') as any).value = 'Tribeca';
    (h.doc.getElementById('compGeneralMinBeds') as any).value = '2';
    (h.doc.getElementById('compGeneralMinPrice') as any).value = '1000000';
    const r = h.win.serializeCompCriteria('general');
    expect(r.refused).toEqual([]);
    const qs = new URLSearchParams(Object.entries(r.params).map(([k, v]) => [k, String(v)]));
    const parsed = criteriaFromParams(qs);
    expect(parsed.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('Subject Buildings and General Criteria issue a NARROWED request, not a whole-city sweep', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('an untouched Subject Buildings search refuses instead of sweeping the city — no request', async () => {
    h.requests.length = 0; h.toasts.length = 0;
    h.win.showCompResults('building');
    await flush();
    expect(h.requests.length).toBe(0);
    expect(h.toasts.map((t) => t.kind)).toContain('warning');
    // and it does not reveal a results panel while refusing
    expect(h.doc.getElementById('compBuildingResults').style.display).toBe('none');
  });

  it('with a neighborhood the Subject Buildings search executes and carries the narrowing', async () => {
    (h.doc.getElementById('compBuildingNeighborhood') as any).value = 'Carnegie Hill';
    (h.doc.getElementById('compBuildingMinBeds') as any).value = '2';
    (h.doc.getElementById('compBuildingMaxBeds') as any).value = '3';
    h.requests.length = 0; h.toasts.length = 0;
    h.enqueue({ total: 1, listings: [SALE_COMP] });
    h.win.showCompResults('building');
    await flush();
    expect(h.requests.length).toBe(1);
    expect(h.requests[0]).toMatchObject({ type: 'sale', neighborhood: 'Carnegie Hill', minBeds: 2, maxBeds: 3 });
    expect(String(h.requests[0].status)).toContain('Closed');
    expect(Number.isNaN(h.requests[0].minBeds as number)).toBe(false);
    expect(criteriaFromParams(new URLSearchParams(
      Object.entries(h.requests[0]).map(([k, v]) => [k, String(v)]),
    )).ok).toBe(true);
  });

  it('General Criteria wires the borough and ownership controls that were dead over live criteria', async () => {
    (h.doc.querySelector('#compGeneralBoroughs input[data-value="Manhattan"]') as any).checked = true;
    (h.doc.querySelector('#compGeneralOwnership input[data-value="Condominium"]') as any).checked = true;
    h.requests.length = 0;
    h.enqueue({ total: 1, listings: [SALE_COMP] });
    h.win.showCompResults('general');
    await flush();
    expect(h.requests.length).toBe(1);
    expect(h.requests[0]).toMatchObject({ borough: 'Manhattan', ownership: 'Condominium' });
  });

  it('a checked status box changes the status the request carries — the boxes are no longer inert', async () => {
    const active = h.doc.querySelector('[data-status-mount="comps-general-sale"] input[data-value="Active"]') as any;
    expect(active).not.toBeNull();
    active.checked = true;
    h.requests.length = 0;
    h.enqueue({ total: 0, listings: [] });
    h.win.showCompResults('general');
    await flush();
    expect(String(h.requests[0].status).split(',').sort()).toEqual(['Active', 'Closed']);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('Subject Property is driven by a real subject, not by a discarded address', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('with no subject it refuses and issues no request', async () => {
    h.requests.length = 0; h.toasts.length = 0;
    h.win.showCompResults('property');
    await flush();
    expect(h.requests.length).toBe(0);
    expect(h.doc.getElementById('compPropertyResults').style.display).toBe('none');
    expect(h.toasts.map((t) => t.kind)).toContain('warning');
  });

  it('a subject listing id resolves the subject, then draws comps from the SUBJECT\'S OWN neighborhood', async () => {
    (h.doc.getElementById('compPropertyListingId') as any).value = 'RLS20078109';
    h.requests.length = 0; h.toasts.length = 0;
    h.enqueue(
      { total: 1, listings: [{ id: 's1', lid: 'RLS20078109', address: '45 East 89th Street', unit: '12B', neighborhood: 'Carnegie Hill', borough: 'Manhattan', beds: 2, baths: 2, price: 2400000, ownership: 'Condominium', status: 'Active', permissions: {} }] },
      { total: 2, listings: [SALE_COMP, UNDATED_COMP] },
    );
    h.win.showCompResults('property');
    await flush();
    expect(h.requests.length).toBe(2);
    expect(h.requests[0]).toMatchObject({ listingId: 'RLS20078109', limit: 1 });
    // The comp request is narrowed to the subject's own area and unit profile — never the whole city.
    expect(h.requests[1]).toMatchObject({ type: 'sale', neighborhood: 'Carnegie Hill' });
    expect(h.requests[1].minBeds).toBe(1);
    expect(h.requests[1].maxBeds).toBe(3);
    expect(String(h.requests[1].status)).toContain('Closed');
  });

  it('an unresolvable subject refuses by name and never widens the search', async () => {
    (h.doc.getElementById('compPropertyListingId') as any).value = 'RLS-does-not-exist';
    h.requests.length = 0; h.toasts.length = 0;
    h.enqueue({ total: 0, listings: [] });
    h.win.showCompResults('property');
    await flush();
    expect(h.requests.length).toBe(1); // the lookup only — no comp sweep
    expect(h.toasts.some((t) => t.kind === 'warning' && /RLS-does-not-exist/.test(t.message))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the comps result table renders verified closing facts, in broker language', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => {
    h = boot(); await h.ready();
    (h.doc.getElementById('compGeneralNeighborhood') as any).value = 'Carnegie Hill';
    h.enqueue({ total: 3, listings: [SALE_COMP, UNDATED_COMP, RENTAL_COMP] });
    h.win.showCompResults('general');
    await flush();
  });
  afterAll(() => h?.close());

  const rows = () => [...h.doc.querySelectorAll('#compGeneralResults tbody tr')] as any[];
  const cells = (i: number) => [...rows()[i].querySelectorAll('td')].map((td: any) => td.textContent.trim());

  it('a closed comp with no CloseDate is DROPPED — never dated by ModificationTimestamp', () => {
    const html = h.doc.getElementById('compGeneralResults').innerHTML;
    expect(html).not.toContain('5 Nowhere Lane');
    expect(html).not.toContain('7/7/2026');
    expect(html).not.toContain('6/12/2026'); // the sale comp's ModificationTimestamp
  });

  it('the Sold Date column carries the provider CloseDate', () => {
    const header = [...h.doc.querySelectorAll('#compGeneralResults thead th')].map((th: any) => th.textContent.trim());
    expect(header).toContain('Sold Date');
    expect(cells(0).join(' | ')).toContain('3/11/2026');
  });

  it('the Sold Price column carries ClosePrice, and the ask is labelled as the ask', () => {
    const header = [...h.doc.querySelectorAll('#compGeneralResults thead th')].map((th: any) => th.textContent.trim());
    expect(header).toContain('Sold Price');
    expect(header).toContain('List Price');
    const row = cells(0).join(' | ');
    expect(row).toContain('$2,375,000');
    expect(row).toContain('$2,450,000');
  });

  it('the status badge is the transaction\'s broker label, never a raw token and never the literal CLOSED', () => {
    const badges = [...h.doc.querySelectorAll('#compGeneralResults [data-comp-status]')].map((b: any) => b.textContent.trim());
    expect(badges).toContain('Sold');
    expect(badges).toContain('Rented');
    expect(h.doc.getElementById('compGeneralResults').innerHTML).not.toContain('>CLOSED<');
  });

  it('the count shown is the count actually rendered', () => {
    const el = h.doc.querySelector('#compGeneralResults [data-comp-count]');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain(String(rows().length));
  });

  it('a rental comp is not relabelled into sale language', () => {
    const rentalRow = rows().find((r: any) => r.textContent.includes('200 West 79th Street'));
    expect(rentalRow).toBeTruthy();
    expect(rentalRow.textContent).toContain('Rented');
    expect(rentalRow.textContent).not.toContain('Sold');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the comparables toolbar buttons do something observable', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('Clear Criteria resets the seeded comp controls', () => {
    (h.doc.getElementById('compGeneralMinPrice') as any).value = '1000000';
    (h.doc.getElementById('compGeneralNeighborhood') as any).value = 'Tribeca';
    (h.doc.querySelector('#compGeneralBoroughs input[data-value="Manhattan"]') as any).checked = true;
    h.win.clearCompCriteria();
    expect((h.doc.getElementById('compGeneralMinPrice') as any).value).toBe('');
    expect((h.doc.getElementById('compGeneralNeighborhood') as any).value).toBe('');
    expect((h.doc.querySelector('#compGeneralBoroughs input[data-value="Manhattan"]') as any).checked).toBe(false);
  });

  it('Save then Load round-trips the criteria through a real store', () => {
    (h.doc.getElementById('compGeneralMinPrice') as any).value = '2000000';
    (h.doc.getElementById('compGeneralNeighborhood') as any).value = 'Chelsea';
    h.win.saveCompCriteria();
    h.win.clearCompCriteria();
    expect((h.doc.getElementById('compGeneralMinPrice') as any).value).toBe('');
    h.win.loadCompCriteria();
    expect((h.doc.getElementById('compGeneralMinPrice') as any).value).toBe('2000000');
    expect((h.doc.getElementById('compGeneralNeighborhood') as any).value).toBe('Chelsea');
  });

  it('Generate Report refuses before a search, and afterwards operates on the ACTUAL returned comp set', async () => {
    h.toasts.length = 0;
    let opened: any = null;
    h.win.openReportsModal = (ids: string[], output: string) => { opened = { ids, output }; };
    h.win.openCompReport('general');
    expect(opened).toBeNull();
    expect(h.toasts.some((t) => t.kind === 'warning')).toBe(true);

    (h.doc.getElementById('compGeneralNeighborhood') as any).value = 'Carnegie Hill';
    h.enqueue({ total: 2, listings: [SALE_COMP, RENTAL_COMP] });
    h.win.showCompResults('general');
    await flush();

    h.win.openCompReport('general');
    expect(opened).not.toBeNull();
    expect(opened.ids).toEqual(['c1', 'c2']);
    // the report engine reads searchResultsState.filteredListings — it must hold the comp set, not a stale one
    expect(h.win.searchResultsState.filteredListings.map((l: any) => l.id)).toEqual(['c1', 'c2']);
  });
});
