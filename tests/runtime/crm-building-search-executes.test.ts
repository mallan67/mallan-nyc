/// <reference types="jest" />
/**
 * THE BUILDINGS TAB MUST BE A REAL, EXECUTING SEARCH — not a panel that is never shown and a
 * criterion set that is refused before it leaves the browser.
 *
 * PROVIDER TRUTH (verified in this file against the committed live pull, which CLAUDE.md §H names as the
 * ONLY field / enum / permission authority — `data/cotality-contract/contract.compact.json` and
 * `data/cotality-enums.live.json`):
 *
 *   - There is NO entitled Cotality `Building` resource. It is declared in $metadata and returns HTTP 403
 *     on this subscription, and both of its navigations are provider-rejected.
 *   - `BuildingKeyNumeric` is SUPPRESSED — `filterable:false`, `populated:null` on every row — so a
 *     building has no provider-side identity key here.
 *   - `Latitude` / `Longitude` are SUPPRESSED the same way, so the Manhattan Grid can never execute.
 *
 * Therefore a Mallan "Building search" is a **Property query**, narrowed by criteria the executor actually
 * executes, and GROUPED IN MALLAN CODE by the building identity the rows carry (`BuildingName`, else the
 * street address). This file proves exactly that, end to end: the tab shows its own panel, the panel's
 * controls collect, the criteria serialize into executable parameters, a real request goes out, the real
 * response comes back, and building rows render.
 *
 * Every assertion drives the SHIPPED function (`toggleSearchTab`, `collectSearchCriteria`,
 * `serializeSearchCriteria`, `performSearch`, `renderSearchResults`) inside a real DOM built from the
 * SHIPPED partial, and asserts on the returned object, the captured request, or the rendered DOM. No
 * assertion is a grep over source text.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { searchContract } from '@/lib/search/engine/contract';
import { criteriaFromParams } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTRACT = searchContract();

/** Boot the shipped search partial + the shipped search engine in a real DOM. */
function boot() {
  const html = read('public/crm/html/search-form-and-results.html');
  const engine = read('public/crm/js/search/search-engine.js');
  const statusHelper = read('public/crm/js/core/status-presentation.js');
  const dispatcher = read('public/crm/js/render/render-dispatcher.js');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/crm/',
    runScripts: 'dangerously',
    virtualConsole,
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
    serverPaged: false, serverTotal: null, serverCountMeaning: null,
    viewMode: 'gallery', sortField: 'price', sortOrder: 'desc',
    visibleColumns: ['address', 'unit', 'price', 'beds', 'baths', 'status'],
  };
  win.eval(statusHelper);
  win.eval(dispatcher);
  win.eval(engine);

  let nextResponse: any = { listings: [], total: 0 };
  win.MallanAPI = {
    idx: {
      contract: () => Promise.resolve(JSON.parse(JSON.stringify(CONTRACT))),
      search: (params: Record<string, unknown>) => {
        // MallanAPI.idx.search forwards ONLY the executor's executable parameters; anything else never
        // reaches the wire. Mirror that here so a "sent" parameter in this test means actually sent.
        const forwarded: Record<string, unknown> = {};
        for (const k of ['type', 'minPrice', 'maxPrice', 'minBeds', 'maxBeds', 'minBaths', 'maxBaths',
          'minSqft', 'maxSqft', 'buildingName',
          'neighborhood', 'borough', 'status', 'listingId', 'zip', 'ownership', 'StructureType',
          'sort', 'limit', 'skip']) {
          const v = (params as any)[k];
          if (k === 'minBeds' || k === 'maxBeds') { if (v != null) forwarded[k] = v; }
          else if (v) forwarded[k] = v;
        }
        requests.push(forwarded);
        return Promise.resolve(nextResponse);
      },
    },
    onReady: (cb: () => void) => cb(),
  };
  return {
    win,
    doc: win.document,
    requests,
    toasts,
    setResponse(r: any) { nextResponse = r; },
    ready: () => win.loadSearchContract(),
    close: () => dom.window.close(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('provider truth: a Building search cannot be a Building-resource query', () => {
  const compact = JSON.parse(read('data/cotality-contract/contract.compact.json'));
  const enums = JSON.parse(read('data/cotality-enums.live.json'));

  it('the Building entity set is REJECTED on this entitlement (HTTP 403) and both navigations are rejected', () => {
    const b = compact.resources.Building;
    expect(b.access.state).toBe('rejected');
    expect(b.access.http).toBe(403);
    expect(b.navigation.Property.expand).toBe('PROVIDER_REJECTED');
    expect(b.navigation.Media.expand).toBe('PROVIDER_REJECTED');
  });

  it('the provider publishes vocabularies for Property, Media and OpenHouse only — never Building', () => {
    expect(Object.keys(enums.resources)).not.toContain('Building');
    expect(Object.keys(enums.resources)).toEqual(expect.arrayContaining(['Property']));
  });

  it('BuildingKeyNumeric, Latitude and Longitude are suppressed, so neither a building key nor a map grid can filter', () => {
    for (const f of ['BuildingKeyNumeric', 'Latitude', 'Longitude']) {
      const field = compact.resources.Property.fields[f];
      expect({ f, filterable: field.filterable, populated: field.populated })
        .toEqual({ f, filterable: false, populated: null });
    }
  });

  it('the fields a Building search CAN narrow on are live and filterable', () => {
    for (const f of ['BuildingName', 'NumberOfUnitsTotal', 'StoriesTotal', 'YearBuilt', 'SubdivisionName',
      'CityRegion', 'PostalCode', 'CommonInterest', 'StructureType', 'PropertySubType']) {
      expect({ f, filterable: compact.resources.Property.fields[f]?.filterable }).toEqual({ f, filterable: true });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the BUILDINGS tab shows its OWN panel (and stops showing the sale form)', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  const shown = (id: string) => h.doc.getElementById(id)?.style.display;

  it('toggleSearchTab("building") displays #searchBasicModeBuilding and hides the sale and rental panels', () => {
    h.win.toggleSearchTab('building');
    expect({
      building: shown('searchBasicModeBuilding'),
      sale: shown('searchBasicMode'),
      rental: shown('searchBasicModeRental'),
    }).toEqual({ building: 'block', sale: 'none', rental: 'none' });
  });

  it('toggleSearchTab("rent") displays #searchBasicModeRental — the rental tab had the same defect', () => {
    h.win.toggleSearchTab('rent');
    expect({
      building: shown('searchBasicModeBuilding'),
      sale: shown('searchBasicMode'),
      rental: shown('searchBasicModeRental'),
    }).toEqual({ building: 'none', sale: 'none', rental: 'block' });
  });

  it('toggleSearchTab("sale") returns to the sale panel', () => {
    h.win.toggleSearchTab('sale');
    expect({
      building: shown('searchBasicModeBuilding'),
      sale: shown('searchBasicMode'),
      rental: shown('searchBasicModeRental'),
    }).toEqual({ building: 'none', sale: 'block', rental: 'none' });
  });

  it('advanced mode hides all three basic panels', () => {
    h.win.toggleSearchTab('building');
    h.win.toggleSearchMode('advanced');
    expect({
      building: shown('searchBasicModeBuilding'),
      sale: shown('searchBasicMode'),
      rental: shown('searchBasicModeRental'),
      advanced: shown('searchAdvancedMode'),
    }).toEqual({ building: 'none', sale: 'none', rental: 'none', advanced: 'block' });
    h.win.toggleSearchMode('basic');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('every Building-panel control names a live Cotality Property field and a live member', () => {
  const compact = JSON.parse(read('data/cotality-contract/contract.compact.json'));
  const enums = JSON.parse(read('data/cotality-enums.live.json'));
  let h: ReturnType<typeof boot>;
  beforeAll(() => { h = boot(); });
  afterAll(() => h?.close());

  const controls = () => [...h.doc.querySelectorAll('#searchBasicModeBuilding [data-field]')] as any[];

  it('no control names a field absent from live Property', () => {
    const localOnly = new Set(['StandardStatus']); // rendered by the contract mount, checked separately
    const offenders = controls()
      .map((el) => el.getAttribute('data-field'))
      .filter((f: string) => !localOnly.has(f) && !compact.resources.Property.fields[f]);
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('no control names a token that is not a live member of its field', () => {
    const offenders: string[] = [];
    for (const el of controls()) {
      const field = el.getAttribute('data-field');
      const raw = el.getAttribute('data-value');
      if (!raw || !enums.resources.Property[field]) continue;
      const members = enums.resources.Property[field];
      const live = new Set((Array.isArray(members) ? members : members.members)
        .map((m: any) => (typeof m === 'string' ? m : m.token || m.value || m.name)));
      for (const token of String(raw).split(',')) {
        const t = token.trim();
        if (!t) continue;
        if (!live.has(t)) offenders.push(field + '=' + t);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('no Building control carries data-not (there is no negation path in the serializer)', () => {
    expect([...h.doc.querySelectorAll('#searchBasicModeBuilding [data-not]')].length).toBe(0);
  });

  it('the Manhattan Grid is gone — Latitude / Longitude are suppressed on this feed', () => {
    for (const id of ['bldg-grid-north', 'bldg-grid-south', 'bldg-grid-east', 'bldg-grid-west']) {
      expect({ id, el: h.doc.getElementById(id) }).toEqual({ id, el: null });
    }
  });

  it('the Building panel has its own contract-driven status mount', () => {
    const mount = h.doc.querySelector('#searchBasicModeBuilding [data-status-mount]');
    expect(mount).not.toBeNull();
    expect(mount.getAttribute('data-status-mount')).toBe('basic-building');
    expect(mount.getAttribute('data-transaction')).toBe('sale');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('a Building search SERIALIZES into executable parameters (no blanket refusal)', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('the tab itself is no longer refused, and its criteria become real parameters', () => {
    const r = h.win.serializeSearchCriteria({
      searchTab: 'building',
      boroughs: ['Manhattan'],
      ownership: ['Condominium', 'StockCooperative'],
      neighborhoods: ['Tribeca'],
      zip: '10013',
    });
    expect(r.refused).toEqual([]);
    expect(r.params).toEqual({
      type: 'sale', borough: 'Manhattan', ownership: 'Condominium,StockCooperative',
      neighborhood: 'Tribeca', zip: '10013',
    });
  });

  it('the executor accepts exactly those parameters and filters Property (never /odata/Building)', () => {
    const r = h.win.serializeSearchCriteria({
      searchTab: 'building', boroughs: ['Manhattan'], ownership: ['Condominium'], neighborhoods: ['Tribeca'],
    });
    const qs = new URLSearchParams(Object.entries(r.params).map(([k, v]) => [k, String(v)]));
    const parsed = criteriaFromParams(qs);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const q = buildProviderQuery(parsed.criteria);
    expect(q.filter).toContain("CommonInterest eq 'Condominium'");
    // The executor matches SubdivisionName case-insensitively (Trestle stores it upper-cased).
    expect(q.filter).toContain("tolower(SubdivisionName) eq 'tribeca'");
    expect(q.filter).toContain("CityRegion eq 'Manhattan'");
    expect(q.filter).not.toContain('MlsStatus');
    expect(q.filter).not.toContain('BuildingKeyNumeric');
  });

  it('a criterion the executor cannot carry is refused BY NAME — never dropped', () => {
    // financingMin is produced by collectSearchCriteria; MaximumFinancingPercent does not exist on live
    // Property, so it must be named in the refusal rather than silently widening the universe.
    const r = h.win.serializeSearchCriteria({ searchTab: 'building', financingMin: 80 });
    expect(r.refused).toContain('Building Financing %');
  });

  it('EVERY key collectSearchCriteria can produce is either executed or refused by name', () => {
    const produced = {
      searchTab: 'building', priceMin: 1, priceMax: 2, bedsMin: 1, bedsMax: 2, bathsMin: 1, bathsMax: 2,
      roomsMin: 1, roomsMax: 2, sqftMin: 1, sqftMax: 2, ownership: ['Condominium'], propertySubType: 'Townhouse',
      statuses: ['Active'], backOnMarket: true, address: 'x', neighborhoods: ['Tribeca'], boroughs: ['Manhattan'],
      borough: 'Manhattan', rlsId: 'RLS1', zip: '10013', unit: '4B', keyword: 'k', managementCompany: 'm',
      financingMin: 80, dateActivityType: 'Listed', dateFrom: '2026-01-01', dateTo: '2026-02-01',
      contractDateFrom: '2026-01-01', contractDateTo: '2026-02-01', soldDateFrom: '2026-01-01',
      soldDateTo: '2026-02-01', yearMin: 1900, yearMax: 2000, unitsMin: 1, unitsMax: 2, floorsMin: 1,
      floorsMax: 2, buildingName: 'One57', checkboxFilters: { StructureType: ['HighRise'] },
    };
    const r = h.win.serializeSearchCriteria(produced);
    // A key counts as EXECUTED only if it actually produces a parameter. Merely listing it used to be
    // enough, which made this test a rubber stamp for precisely the defect Correction Slice 1 fixed:
    // sqftMin / sqftMax / buildingName were collected and then dropped, and nothing here noticed.
    const EXECUTES: Record<string, string> = {
      searchTab: 'type', priceMin: 'minPrice', priceMax: 'maxPrice', bedsMin: 'minBeds',
      bedsMax: 'maxBeds', bathsMin: 'minBaths', bathsMax: 'maxBaths', ownership: 'ownership',
      propertySubType: 'StructureType', statuses: 'status', backOnMarket: 'backOnMarket',
      neighborhoods: 'neighborhood', boroughs: 'borough', borough: 'borough', rlsId: 'listingId',
      zip: 'zip', checkboxFilters: 'StructureType',
      // LivingArea / BuildingName — executed since 2026-09-11 (Backend Agent Search P0, Slice 1).
      // The server had executed them all along; the browser refused them.
      sqftMin: 'minSqft', sqftMax: 'maxSqft', buildingName: 'buildingName',
    };
    for (const key of Object.keys(EXECUTES)) {
      const param = EXECUTES[key];
      expect({ key, param, emitted: (r.params as Record<string, unknown>)[param] !== undefined })
        .toEqual({ key, param, emitted: true });
    }
    // Anything not turned into a parameter must appear, by name, in the refusal list.
    const unaccounted = Object.keys(produced).filter((k) => !(k in EXECUTES)).filter((k) => {
      const labels: Record<string, string> = {
        roomsMin: 'Min Rooms', roomsMax: 'Max Rooms',
        address: 'Address / Building Name', unit: 'Unit #', keyword: 'Keyword',
        managementCompany: 'Management Company', financingMin: 'Building Financing %',
        dateActivityType: 'Listing Activity type', dateFrom: 'Listing Activity date', dateTo: 'Listing Activity date',
        contractDateFrom: 'Contract date', contractDateTo: 'Contract date', soldDateFrom: 'Sold date',
        soldDateTo: 'Sold date', yearMin: 'Year Built', yearMax: 'Year Built', unitsMin: 'Units', unitsMax: 'Units',
        floorsMin: 'Floors', floorsMax: 'Floors',
      };
      return !r.refused.includes(labels[k]);
    });
    expect(unaccounted).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('a Building search actually EXECUTES: request out, response back, building rows rendered', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('performSearch on the Buildings tab issues one real executor request carrying the panel criteria', async () => {
    h.win.toggleSearchTab('building');
    (h.doc.getElementById('buildingQuickZip') as any).value = '10013';
    const condo = h.doc.querySelector('#searchBasicModeBuilding [data-field="CommonInterest"][data-value="Condominium"]') as any;
    expect(condo).not.toBeNull();
    condo.checked = true;
    h.requests.length = 0;
    h.setResponse({
      total: 3,
      listings: [
        { id: 'a1', lid: 'RLS1', address: '1 Main Street', unit: '2A', price: 1000000, beds: 1, baths: 1, buildingName: 'One Main', status: 'Active', status_label: 'Active', status_transaction: 'sale', permissions: {} },
        { id: 'a2', lid: 'RLS2', address: '1 Main Street', unit: '5C', price: 2000000, beds: 2, baths: 2, buildingName: 'One Main', status: 'Active', status_label: 'Active', status_transaction: 'sale', permissions: {} },
        { id: 'b1', lid: 'RLS3', address: '9 Other Street', unit: '1D', price: 3000000, beds: 3, baths: 2, buildingName: null, status: 'Closed', status_label: 'Sold', status_transaction: 'sale', permissions: {} },
      ],
    });
    h.win.performSearch();
    await flush(); await flush();

    expect(h.toasts.filter((t) => t.kind === 'warning' || t.kind === 'error')).toEqual([]);
    expect(h.requests.length).toBe(1);
    expect(h.requests[0]).toMatchObject({ type: 'sale', zip: '10013', ownership: 'Condominium' });
  });

  it('the response is rendered as GROUPED BUILDING rows — the grouping the 403 Building resource cannot do', async () => {
    const container = h.doc.getElementById('buildingResultsContainer');
    expect(container).not.toBeNull();
    expect(container.style.display).not.toBe('none');
    const rows = [...container.querySelectorAll('[data-building-row]')];
    expect(rows.length).toBe(2);
    const text = rows.map((r: any) => r.textContent.replace(/\s+/g, ' ').trim());
    expect(text[0]).toContain('One Main');
    expect(text[0]).toContain('2 units');
    expect(text[1]).toContain('9 Other Street');
    expect(text[1]).toContain('1 unit');
    // The grouping key is never BuildingKeyNumeric — it is suppressed on this feed.
    expect(container.innerHTML).not.toContain('BuildingKeyNumeric');
  });

  it('leaving the Buildings tab restores the ordinary listing views', async () => {
    h.win.toggleSearchTab('sale');
    h.requests.length = 0;
    h.setResponse({ total: 1, listings: [{ id: 'x', address: 'Y', price: 1, beds: 1, baths: 1, status: 'Active', permissions: {} }] });
    h.win.performSearch();
    await flush(); await flush();
    expect(h.doc.getElementById('buildingResultsContainer').style.display).toBe('none');
    expect(h.doc.getElementById('galleryViewContainer').style.display).not.toBe('none');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the dead-control pass leaves the Buildings panel and the Comparables criteria alone', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => {
    h = boot();
    await h.ready();
    // The shipped dead-control pass, run over the real markup (read-only here — not this file's to edit).
    h.win.eval(read('public/crm/js/init/init-disable-dead-controls.js'));
    if (typeof h.win.disableDeadControls === 'function') h.win.disableDeadControls();
  });
  afterAll(() => h?.close());

  it('no Buildings-panel control is disabled — every one of them executes', () => {
    const disabled = [...h.doc.querySelectorAll('#searchBasicModeBuilding input, #searchBasicModeBuilding select')]
      .filter((el: any) => el.disabled)
      .map((el: any) => (el.getAttribute('data-field') || el.id || 'unnamed') + '=' + (el.getAttribute('data-value') || ''));
    expect(disabled).toEqual([]);
  });

  it('no Comparables criterion control is disabled', () => {
    const disabled = [...h.doc.querySelectorAll('#comparablesSection input, #comparablesSection select')]
      .filter((el: any) => el.disabled)
      .map((el: any) => (el.getAttribute('data-field') || el.id || 'unnamed') + '=' + (el.getAttribute('data-value') || ''));
    expect(disabled).toEqual([]);
  });
});
