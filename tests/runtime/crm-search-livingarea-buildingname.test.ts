/// <reference types="jest" />
/**
 * LIVING AREA (SqFt) + BUILDING NAME — the browser must execute the criteria the server already executes.
 *
 * THE CONTRACT SPLIT (Backend Agent Search P0, Correction Slice 1, 2026-09-11)
 *
 * The server side of this Search has executed both criteria for some time:
 *   · `lib/search/engine/criteria.ts` EXECUTED_PARAMS contains `minSqft`, `maxSqft`, `buildingName`;
 *   · `lib/search/engine/provider-query.ts` emits `LivingArea ge|le` and `tolower(BuildingName) eq`;
 *   · `public/crm/js/core/api-client.js` already put all three on the wire.
 * The committed live contract — which CLAUDE.md §H names the ONLY field/enum/permission authority — has
 * `Property.LivingArea` filterable / probeHttp 200 / 417,652 populated rows and `Property.BuildingName`
 * filterable / probeHttp 200 / 221,140 populated rows.
 *
 * The BROWSER said the opposite. `serializeSearchCriteria` listed `sqftMin`, `sqftMax` and
 * `buildingName` in `_NOT_EXECUTABLE`, and `performSearch` RETURNS as soon as anything is refused — so
 * choosing a square footage did not merely fail to narrow the search, it ABORTED the search with a
 * toast, for a criterion the provider supports. Four distinct defects made up the split:
 *
 *   1. the three keys were refused instead of serialized;
 *   2. `collectSearchCriteria` read BuildingName from `#buildingSearchAddress` / `#buildingNameSearch`
 *      — neither id exists anywhere in the shipped partial (0 occurrences) — while the real control is
 *      `#adv-building-name`, and the reader was additionally gated on the Buildings tab, whose panel has
 *      no building-name control at all, so the criterion could never be collected from anywhere;
 *   3. the Buildings basic panel (`#searchBasicModeBuilding`) owns only RLS id, zip and neighborhood,
 *      but the collector's `else` branch read the HIDDEN Sale panel's price/beds/baths/rooms/sqft — so a
 *      Buildings search silently inherited whatever the agent last set on the Sale tab;
 *   4. Saved Search would store parameters it could not restore: `_paramsToFormFields` had no SqFt or
 *      BuildingName mapping, and `_restoreParity` treats any re-serialization difference as a refusal,
 *      so the first saved SqFt search would have come back refused.
 *
 * `address` — the "Address or Building Name" autocomplete — is a DIFFERENT criterion and stays refused
 * by name. Splitting a free-text address box into address-vs-BuildingName needs provider-verified
 * parsing rules that do not exist; guessing would widen the settled universe.
 *
 * STRATEGY — nothing here greps source text for a behavioural claim. The shipped partial is mounted in a
 * real DOM, the shipped engine is executed against it, the parameter object the engine hands the wire is
 * fed to the REAL `api-client.js` in a vm sandbox with a recording fetch, and the criteria are fed to the
 * REAL `criteriaFromParams` + `buildProviderQuery`. Control → collector → serializer → wire → parser →
 * OData `$filter` is one unbroken, executed chain.
 */
export {};
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import * as vm from 'vm';
import { searchContract } from '@/lib/search/engine/contract';
import { criteriaFromParams, EXECUTED_PARAMS } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';
import { SEARCH_SELECT_FIELDS } from '@/lib/search/engine/select';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const CRM_ROOT = join(ROOT, 'public/crm');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTRACT = searchContract();

// ── the shipped search partial + shipped engine, in a real DOM ───────────────────────────────────
function boot() {
  const html = read('public/crm/html/search-form-and-results.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  // The RAW parameter object the engine hands the wire builder. Deliberately NOT filtered here: a mock
  // that re-implements the wire's own forward list can only ever agree with itself.
  const sent: Array<Record<string, unknown>> = [];
  const toasts: Array<{ message: string; kind: string }> = [];

  win.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  win.showToast = (message: string, kind: string) => { toasts.push({ message: message, kind: kind || 'info' }); };
  win.scrollTo = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = {
    filteredListings: [], selectedListings: [], perPage: 50, currentPage: 1,
    serverPaged: false, serverTotal: null, serverCountMeaning: null,
    viewMode: 'gallery', sortField: 'price', sortOrder: 'desc',
    visibleColumns: ['address', 'unit', 'price', 'beds', 'baths', 'status'],
  };
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/render/render-dispatcher.js'));
  win.eval(read('public/crm/js/search/search-engine.js'));
  win.eval(read('public/crm/js/search/saved-searches.js'));

  let nextResponse: any = { listings: [], total: 0 };
  win.MallanAPI = {
    idx: {
      contract: () => Promise.resolve(JSON.parse(JSON.stringify(CONTRACT))),
      search: (params: Record<string, unknown>) => {
        sent.push(Object.assign({}, params));
        return Promise.resolve(nextResponse);
      },
    },
    onReady: (cb: () => void) => cb(),
  };
  return {
    win, doc: win.document, sent, toasts,
    setResponse(r: any) { nextResponse = r; },
    ready: () => win.loadSearchContract(),
    close: () => dom.window.close(),
  };
}

// ── the REAL api-client.js, booted with a recording fetch ────────────────────────────────────────
function bootApiClient() {
  const urls: string[] = [];
  const sandbox: any = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise, Object, Array, String, Number, Boolean, JSON, Error, RegExp, Date, Math,
    encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
    localStorage: { removeItem: () => {}, getItem: () => null, setItem: () => {} },
    document: { cookie: '' },
    CustomEvent: function (this: any, type: string) { this.type = type; },
    fetch: (url: string) => {
      urls.push(String(url));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ listings: [] }) });
    },
  };
  sandbox.window = sandbox;
  sandbox.location = {
    origin: 'https://mallan.nyc', hostname: 'mallan.nyc', host: 'mallan.nyc',
    protocol: 'https:', pathname: '/crm/', href: 'https://mallan.nyc/crm/',
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(CRM_ROOT, 'js/core/api-client.js'), 'utf8'), sandbox);
  return {
    /** Run the engine's own parameter object through the SHIPPED wire builder; return its query string. */
    async query(params: Record<string, unknown>): Promise<URLSearchParams> {
      urls.length = 0;
      await sandbox.MallanAPI.idx.search(params);
      return new URL(urls[urls.length - 1], 'https://mallan.nyc').searchParams;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Only REFUSAL toasts are evidence here. `performSearch` refuses with
 * "Not executable in this Search: ..." and sends nothing; "No listings match these criteria." is a
 * search that RAN and came back empty, which is exactly what the recording mock returns.
 */
const refusals = (h: ReturnType<typeof boot>) =>
  h.toasts.filter((t) => t.message.indexOf('Not executable') === 0).map((t) => t.message);

/** Drive one full browser search; return the parameter object the engine handed the wire. */
async function searchWith(
  h: ReturnType<typeof boot>,
  setup: () => void,
): Promise<Record<string, unknown> | undefined> {
  h.sent.length = 0;
  h.toasts.length = 0;
  setup();
  h.win.performSearch();
  await flush();
  await flush();
  return h.sent[h.sent.length - 1];
}

/** Set a <select> to a value it genuinely offers, so no test can pass on a value the UI cannot produce. */
function setSelect(doc: any, id: string, value: string) {
  const el = doc.getElementById(id);
  if (!el) throw new Error('control does not exist: #' + id);
  const has = Array.prototype.some.call(el.options, (o: any) => o.value === value);
  if (!has) throw new Error('#' + id + ' has no option "' + value + '"');
  el.value = value;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('PROVIDER TRUTH — both criteria are filterable on the committed live contract', () => {
  const compact = JSON.parse(read('data/cotality-contract/contract.compact.json'));

  it('Property.LivingArea and Property.BuildingName are filterable and provider-accepted', () => {
    const f = compact.resources.Property.fields;
    expect({ livingArea: f.LivingArea.filterable, buildingName: f.BuildingName.filterable })
      .toEqual({ livingArea: true, buildingName: true });
    expect({ livingArea: f.LivingArea.probeHttp, buildingName: f.BuildingName.probeHttp })
      .toEqual({ livingArea: 200, buildingName: 200 });
  });

  it('the executor already declares all three parameters executable', () => {
    for (const p of ['minSqft', 'maxSqft', 'buildingName']) {
      expect({ p, executed: EXECUTED_PARAMS.has(p) }).toEqual({ p, executed: true });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('DIRECT — SqFt reaches the wire from every mode that owns a SqFt control', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  let api: ReturnType<typeof bootApiClient>;
  beforeAll(async () => { h = boot(); api = bootApiClient(); await h.ready(); });
  afterAll(() => h?.close());

  it('1 + 2. Sale SqFt: #saleMinSqft / #saleMaxSqft become minSqft / maxSqft on the wire', async () => {
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'basic');
      setSelect(h.doc, 'saleMinSqft', '1000');
      setSelect(h.doc, 'saleMaxSqft', '2000');
    });
    expect(refusals(h)).toEqual([]);
    expect(params).toBeDefined();
    const qs = await api.query(params as Record<string, unknown>);
    expect({ min: qs.get('minSqft'), max: qs.get('maxSqft') }).toEqual({ min: '1000', max: '2000' });
  });

  it('3. Rental SqFt: #rentalMinSqft does the same, on the rental transaction', async () => {
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('rent', 'basic');
      setSelect(h.doc, 'rentalMinSqft', '1000');
    });
    expect(refusals(h)).toEqual([]);
    const qs = await api.query(params as Record<string, unknown>);
    expect({ type: qs.get('type'), min: qs.get('minSqft') }).toEqual({ type: 'rental', min: '1000' });
  });

  it('4. Advanced SqFt: #adv-min-sqft does the same', async () => {
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'advanced');
      setSelect(h.doc, 'adv-min-sqft', '1000');
    });
    expect(refusals(h)).toEqual([]);
    const qs = await api.query(params as Record<string, unknown>);
    expect(qs.get('minSqft')).toBe('1000');
  });

  it('5. the executor turns the range into a Property.LivingArea clause', () => {
    const r = criteriaFromParams(new URLSearchParams('type=sale&minSqft=1000&maxSqft=2000'));
    if (!r.ok) throw new Error('executor refused: ' + JSON.stringify(r.refusal));
    const q = buildProviderQuery(r.criteria);
    expect(q.filter).toContain('LivingArea ge 1000');
    expect(q.filter).toContain('LivingArea le 2000');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('DIRECT — BuildingName is owned by #adv-building-name, the one control that exists', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  let api: ReturnType<typeof bootApiClient>;
  beforeAll(async () => { h = boot(); api = bootApiClient(); await h.ready(); });
  afterAll(() => h?.close());

  it('the ids the collector used to read do not exist in the shipped partial; the real one does', () => {
    const partial = read('public/crm/html/search-form-and-results.html');
    const count = (id: string) => (partial.match(new RegExp('id="' + id + '"', 'g')) || []).length;
    expect({
      buildingSearchAddress: count('buildingSearchAddress'),
      buildingNameSearch: count('buildingNameSearch'),
      advBuildingName: count('adv-building-name'),
    }).toEqual({ buildingSearchAddress: 0, buildingNameSearch: 0, advBuildingName: 1 });
  });

  it('6. a typed building name reaches the wire and becomes a BuildingName equality clause', async () => {
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'advanced');
      h.doc.getElementById('adv-building-name').value = 'The Apthorp';
    });
    expect(refusals(h)).toEqual([]);
    const qs = await api.query(params as Record<string, unknown>);
    expect(qs.get('buildingName')).toBe('The Apthorp');

    const r = criteriaFromParams(new URLSearchParams('type=sale&buildingName=The Apthorp'));
    if (!r.ok) throw new Error('executor refused: ' + JSON.stringify(r.refusal));
    const q = buildProviderQuery(r.criteria);
    // Equality, never `contains` — a substring match would widen the settled universe.
    expect(q.filter).toContain("tolower(BuildingName) eq 'the apthorp'");
    expect(q.filter).not.toContain('contains(BuildingName');
  });

  it('7. an apostrophe in a building name stays escaped through the whole chain', async () => {
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'advanced');
      h.doc.getElementById('adv-building-name').value = "O'Neill Building";
    });
    const qs = await api.query(params as Record<string, unknown>);
    expect(qs.get('buildingName')).toBe("O'Neill Building");

    const r = criteriaFromParams(new URLSearchParams("type=sale&buildingName=O'Neill Building"));
    if (!r.ok) throw new Error('executor refused: ' + JSON.stringify(r.refusal));
    const q = buildProviderQuery(r.criteria);
    // OData escapes a literal quote by doubling it; an unescaped one would terminate the literal.
    expect(q.filter).toContain("tolower(BuildingName) eq 'o''neill building'");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('DIRECT — absence, invalid ranges, and criteria that are still refused', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('8. an untouched form produces no SqFt and no BuildingName filter at all', async () => {
    const params = await searchWith(h, () => { h.win.toggleSearchTab('sale', 'basic'); });
    expect({
      minSqft: (params as any).minSqft,
      maxSqft: (params as any).maxSqft,
      buildingName: (params as any).buildingName,
    }).toEqual({ minSqft: undefined, maxSqft: undefined, buildingName: undefined });

    const bare = criteriaFromParams(new URLSearchParams('type=sale'));
    if (!bare.ok) throw new Error('executor refused: ' + JSON.stringify(bare.refusal));
    const q = buildProviderQuery(bare.criteria);
    expect(q.filter).not.toContain('LivingArea');
    expect(q.filter).not.toContain('BuildingName');
  });

  it('9. an inverted, non-numeric or negative SqFt range still FAILS CLOSED at the executor', () => {
    const inverted = criteriaFromParams(new URLSearchParams('type=sale&minSqft=2500&maxSqft=900'));
    if (inverted.ok) throw new Error('an inverted SqFt range must fail closed, not execute');
    expect(inverted.refusal.invalid).toContainEqual(
      { param: 'minSqft', value: '2500', reason: 'minimum square feet exceeds maximum' },
    );
    expect(criteriaFromParams(new URLSearchParams('type=sale&maxSqft=big')).ok).toBe(false);
    expect(criteriaFromParams(new URLSearchParams('type=sale&minSqft=-500')).ok).toBe(false);
  });

  it('10. a criterion the executor cannot carry is STILL refused BY NAME', () => {
    // `address` is the "Address or Building Name" autocomplete — a different criterion, deliberately
    // still refused. Making SqFt executable must not have made everything executable.
    const r = h.win.serializeSearchCriteria({ searchTab: 'sale', address: '1 Main Street', keyword: 'x' });
    expect(r.refused).toContain('Address / Building Name');
    expect(r.refused).toContain('Keyword');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('NEGATIVE / REGRESSION', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('N1. choosing a square footage no longer ABORTS the search', async () => {
    // The shipped behaviour before this slice: performSearch returned early, showing
    // "Not executable in this Search: Min SqFt", and issued no request at all.
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'basic');
      setSelect(h.doc, 'saleMinSqft', '1000');
    });
    expect({ requestIssued: params !== undefined, refusals: refusals(h) })
      .toEqual({ requestIssued: true, refusals: [] });
  });

  it('N2. EVERY parameter the serializer emits is one the executor executes', () => {
    const r = h.win.serializeSearchCriteria({
      searchTab: 'sale', priceMin: 1, priceMax: 2, bedsMin: 1, bedsMax: 2, bathsMin: 1, bathsMax: 2,
      sqftMin: 900, sqftMax: 2500, buildingName: 'One57', neighborhoods: ['Tribeca'],
      boroughs: ['Manhattan'], statuses: ['Active'], backOnMarket: true, zip: '10013', rlsId: 'RLS1',
      ownership: ['Condominium'],
    });
    const unknown = Object.keys(r.params).filter((k) => !EXECUTED_PARAMS.has(k));
    expect({ unknown, why: 'a serialized parameter the executor does not execute is a silent widening' })
      .toEqual({ unknown: [], why: expect.any(String) });
  });

  it('N3. visible grid columns still do NOT alter the query or the shared provider projection', async () => {
    const before = SEARCH_SELECT_FIELDS.slice();
    h.win.searchResultsState.visibleColumns = ['address', 'price'];
    const narrow = await searchWith(h, () => { h.win.toggleSearchTab('sale', 'basic'); });
    h.win.searchResultsState.visibleColumns = ['address', 'unit', 'price', 'beds', 'baths', 'sqft', 'status'];
    const wide = await searchWith(h, () => { h.win.toggleSearchTab('sale', 'basic'); });
    // Column selection is presentation state. It must not reach the wire, and it must not rewrite the
    // shared projection consumed by Saved Search, alerts, CMA, reports and hydration.
    expect(narrow).toEqual(wide);
    expect(SEARCH_SELECT_FIELDS).toEqual(before);
  });

  it('N4. a Buildings search cannot inherit values from the HIDDEN Sale panel', async () => {
    // The agent sets a Sale-panel range, then switches to Buildings. The Buildings basic panel owns only
    // RLS id, zip and neighborhood — it has no price/beds/baths/rooms/sqft control at all, so those
    // criteria must simply not be collected.
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'basic');
      setSelect(h.doc, 'saleMinSqft', '1000');
      setSelect(h.doc, 'saleMinBeds', '2');
      h.win.toggleSearchTab('building', 'basic');
    });
    expect({
      minSqft: (params as any).minSqft,
      minBeds: (params as any).minBeds,
      refusals: refusals(h),
    }).toEqual({ minSqft: undefined, minBeds: undefined, refusals: [] });
  });

  it('N5. BuildingName does not reach the wire when its control is not showing', async () => {
    // #adv-building-name lives in the advanced panel. With the basic panel showing, a stale value in it
    // is a hidden control exactly like the Sale panel above, and must not narrow anything.
    const params = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'advanced');
      h.doc.getElementById('adv-building-name').value = 'The Apthorp';
      h.win.toggleSearchTab('sale', 'basic');
    });
    expect((params as any).buildingName).toBeUndefined();
  });

  it('N6. the public Consumer Search is untouched by this correction', () => {
    // The three-application boundary (CLAUDE.md §A.0): Consumer Search has its own entry point and never
    // loads the Backend Agent Search engine.
    const consumer = read('app/search/page.tsx');
    expect(consumer).not.toContain('search-engine');
    expect(consumer).not.toContain('serializeSearchCriteria');
  });

  it('N7. the page and its count come from ONE narrowed request, not a second unfiltered one', async () => {
    h.sent.length = 0;
    h.win.toggleSearchTab('sale', 'basic');
    setSelect(h.doc, 'saleMinSqft', '1000');
    h.win.performSearch();
    await flush();
    await flush();
    expect(h.sent.length).toBe(1);
    expect((h.sent[0] as any).minSqft).toBe(1000);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('ROUND TRIP — save, restore, re-run must preserve the same criteria', () => {
  jest.setTimeout(120_000);
  let h: ReturnType<typeof boot>;
  beforeAll(async () => { h = boot(); await h.ready(); });
  afterAll(() => h?.close());

  it('a saved SqFt search restores into the form and re-serializes identically — no refusal', async () => {
    // A saved search stores the EXECUTED parameters; on restore the module re-serializes the form and
    // compares. `_restoreParity` treats ANY difference as a refusal, so a parameter that is stored but
    // cannot be put back into a control breaks the saved search outright.
    const saved = await searchWith(h, () => {
      h.win.toggleSearchTab('sale', 'basic');
      setSelect(h.doc, 'saleMinSqft', '1000');
      setSelect(h.doc, 'saleMaxSqft', '2000');
    });
    expect({ min: (saved as any).minSqft, max: (saved as any).maxSqft }).toEqual({ min: 1000, max: 2000 });

    // Clear the form, then drive it back from the stored parameters alone.
    h.doc.getElementById('saleMinSqft').value = '';
    h.doc.getElementById('saleMaxSqft').value = '';
    const issues = h.win._paramsToFormFields(Object.assign({}, saved));
    expect({ issues, why: 'every stored parameter must map back to a real control' })
      .toEqual({ issues: [], why: expect.any(String) });

    const again = await searchWith(h, () => undefined);
    expect({ min: (again as any).minSqft, max: (again as any).maxSqft })
      .toEqual({ min: 1000, max: 2000 });
  });
});
