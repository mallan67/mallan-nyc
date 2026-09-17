/// <reference types="jest" />
/**
 * GROUP H — THREE STATES, CARRIED WHOLE THROUGH THE SEARCH CHAIN.
 *
 *     UNKNOWN   price=null  beds=null  fullBaths=null  halfBaths=null
 *     ZERO      price=0     beds=0     fullBaths=0     halfBaths=0
 *     NORMAL    price=1250000 beds=2   fullBaths=2     halfBaths=1
 *
 * No layer may collapse two of those into one. The canonical contract already says so — and says it
 * server-side, where it is already obeyed:
 *
 *     lib/search/crm-idx-mapper.ts:20-21
 *     "Provider number or null. ABSENT and ZERO are different facts ... an absent/unparsable value is
 *      null; a literal 0 is preserved as 0."
 *
 * data-loader.js:400-402 repeats it for the browser ("No numeric provider fact ... is ever invented"),
 * and reports.js:934 already renders `l.beds === 0 ? 'Studio'`. Group H is not a new rule. It is the
 * client stopping its contradiction of a rule the repository already states in three places.
 *
 * THE TWO CORRUPTING WRITERS, both proven by census and re-verified by hand:
 *
 *   render-grid.js:55-56   if (listing.price == null) listing.price = 0;   — MUTATES THE SHARED OBJECT.
 *                          render-dispatcher.js:81's .slice() is an array copy; the elements are the same
 *                          identities held by searchResultsState.filteredListings AND the global listings,
 *                          so rendering the grid once permanently rewrites the model every later
 *                          consumer reads — detail, map, Compare, CMA, reports, calculators.
 *
 *   data-loader.js:219-234 transformAPIListing, the Prisma FALLBACK hydrator, uses `|| 0` where its own
 *                          primary twin uses null. Two hydration paths, one shared array, opposite null
 *                          policies — so what an agent sees depends on whether IDX happened to answer.
 *
 * AND A READER CLASS GREP CANNOT SEE. priceSF and its peers guard only the DENOMINATOR:
 * `null / 900 === 0`, so an unknown price renders a confident "$0/SF" with no `|| 0` anywhere in the
 * expression. The proof it is an accident and not a rule: an `undefined` price yields NaN and an em dash,
 * while `null` yields $0 — same unknown, two answers.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.setTimeout(120_000);

const UNKNOWN = {
  id: 'U1', lid: 'RLS-U', address: '1 Unknown Way', unit: '',
  status: 'Active', status_transaction: 'sale', listingType: 'Sale',
  price: null, beds: null, baths: null, fullBaths: null, halfBaths: null,
  intSqft: 900, rooms: null, maintCC: null, reTaxes: null, images: [],
  idxDisplayYN: true, internetDisplayYN: true,
  permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true },
};
const ZERO = { ...UNKNOWN, id: 'Z1', lid: 'RLS-Z', address: '2 Studio Street',
  price: 0, beds: 0, baths: 0, fullBaths: 0, halfBaths: 0 };
const NORMAL = { ...UNKNOWN, id: 'N1', lid: 'RLS-N', address: '3 Normal Road',
  price: 1_250_000, beds: 2, baths: 2.5, fullBaths: 2, halfBaths: 1 };

/** A jsdom window with the shipped render stack loaded. */
function renderWindow(rows: Record<string, unknown>[]) {
  const html = read('public/crm/html/search-form-and-results.html');
  const vc = new jsdom.VirtualConsole();
  vc.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole: vc,
  });
  const win: any = dom.window;
  win.scrollTo = () => undefined;
  win.showToast = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = rows;
  win.searchResultsState = {
    filteredListings: rows, selectedListings: [], perPage: 50, currentPage: 1,
    serverPaged: false, serverTotal: null, serverCountMeaning: null,
    viewMode: 'grid', sortField: 'price', sortOrder: 'desc',
    visibleColumns: ['address', 'price', 'beds', 'baths', 'status'],
  };
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/render/shared-badges.js'));
  win.eval(read('public/crm/js/render/grid-column-defs.js'));
  win.eval(read('public/crm/js/render/render-grid.js'));
  win.eval(read('public/crm/js/render/render-dispatcher.js'));
  return { win, close: () => win.close() };
}

/** Deep snapshot of the canonical facts, for non-mutation proof. */
const facts = (l: any) => JSON.stringify({
  price: l.price, beds: l.beds, baths: l.baths, fullBaths: l.fullBaths, halfBaths: l.halfBaths,
  rooms: l.rooms, maintCC: l.maintCC, reTaxes: l.reTaxes, intSqft: l.intSqft, status: l.status,
});

// ═════════════════════════════════════════════════════════════════════════════
// A — P0-11: rendering must not rewrite the model
// ═════════════════════════════════════════════════════════════════════════════
describe('A · no renderer mutates a canonical listing fact', () => {
  it('renderGridView leaves UNKNOWN unknown — it does not write 0 into the shared object', () => {
    const rows = [JSON.parse(JSON.stringify(UNKNOWN))];
    const before = facts(rows[0]);
    const h = renderWindow(rows);
    try {
      h.win.renderGridView();
      expect({ after: facts(rows[0]) }).toEqual({ after: before });
      expect(rows[0].price).toBeNull();
      expect(rows[0].beds).toBeNull();
    } finally { h.close(); }
  });

  it('the mutation is gone from source — the object is rendered, not rewritten', () => {
    const src = read('public/crm/js/render/render-grid.js').replace(/\r\n/g, '\n');
    expect(src).not.toMatch(/listing\.price\s*=\s*0/);
    expect(src).not.toMatch(/listing\.beds\s*=\s*0/);
  });

  it('ZERO survives rendering as a real zero, not as unknown', () => {
    const rows = [JSON.parse(JSON.stringify(ZERO))];
    const h = renderWindow(rows);
    try {
      h.win.renderGridView();
      expect({ price: rows[0].price, beds: rows[0].beds }).toEqual({ price: 0, beds: 0 });
    } finally { h.close(); }
  });

  it('NORMAL is untouched', () => {
    const rows = [JSON.parse(JSON.stringify(NORMAL))];
    const before = facts(rows[0]);
    const h = renderWindow(rows);
    try {
      h.win.renderGridView();
      expect(facts(rows[0])).toBe(before);
    } finally { h.close(); }
  });

  it('a FROZEN listing can be rendered — the strongest form of the same proof', () => {
    // If any renderer still writes, this throws in strict mode or silently no-ops in sloppy mode; either
    // way the assertion below catches it. A frozen object is the cheapest possible mutation detector.
    const rows = [Object.freeze(JSON.parse(JSON.stringify(UNKNOWN)))] as any[];
    const h = renderWindow(rows);
    try {
      expect(() => h.win.renderGridView()).not.toThrow();
      expect(rows[0].price).toBeNull();
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the fallback hydrator obeys the contract its own twin obeys
// ═════════════════════════════════════════════════════════════════════════════
describe('B · transformAPIListing preserves null and preserves zero', () => {
  function hydrate(api: Record<string, unknown>) {
    const vc = new jsdom.VirtualConsole();
    vc.on('jsdomError', () => undefined);
    const dom = new jsdom.JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole: vc,
    });
    const win: any = dom.window;
    win.LOGGED_IN_AGENT = { id: 'agent-1' };
    win.MallanAPI = undefined;
    // data-loader.js loads its canonical map at script-eval time; without a fetch the whole module throws
    // before transformAPIListing is ever defined. Denying the request is enough - the hydrator under test
    // does not consult the map.
    win.fetch = () => Promise.reject(new Error('network denied by test'));
    // transformAPIListing resolves status through the one status authority; without it the hydrator
    // throws before returning and every assertion below would fail for the wrong reason.
    win.eval(read('public/crm/js/core/status-presentation.js'));
    try {
      win.eval(read('public/crm/js/core/data-loader.js'));
      return win.transformAPIListing(api, 0);
    } finally { win.close(); }
  }

  const API_UNKNOWN = { id: 1, listing_id: 'SL-1', address: {}, features: {},
    list_price: null, bedrooms_total: null, bathrooms_full: null, bathrooms_half: null, living_area: null };
  const API_ZERO = { ...API_UNKNOWN, id: 2, listing_id: 'SL-2', list_price: 0,
    bedrooms_total: 0, bathrooms_full: 0, bathrooms_half: 0 };
  const API_NORMAL = { ...API_UNKNOWN, id: 3, listing_id: 'SL-3', list_price: '1250000',
    bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 1 };

  it('UNKNOWN stays null — the fallback no longer disagrees with crm-idx-mapper', () => {
    const l = hydrate(API_UNKNOWN);
    expect({ price: l.price, beds: l.beds, fullBaths: l.fullBaths, halfBaths: l.halfBaths })
      .toEqual({ price: null, beds: null, fullBaths: null, halfBaths: null });
  });

  it('ZERO stays zero — a studio is a fact, not a gap', () => {
    const l = hydrate(API_ZERO);
    expect({ price: l.price, beds: l.beds, fullBaths: l.fullBaths }).toEqual({ price: 0, beds: 0, fullBaths: 0 });
  });

  it('NORMAL is parsed as before', () => {
    const l = hydrate(API_NORMAL);
    expect({ price: l.price, beds: l.beds, baths: l.baths }).toEqual({ price: 1250000, beds: 2, baths: 2.5 });
  });

  it('baths are known only when BOTH components are — mirroring the provider mapper', () => {
    const half = hydrate({ ...API_UNKNOWN, bathrooms_full: 2, bathrooms_half: null });
    expect(half.baths).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — derived ratios: the denominator was guarded, the numerator was not
// ═════════════════════════════════════════════════════════════════════════════
describe('C · a ratio with an unknown operand is unavailable, not $0', () => {
  // priceSF is a NESTED function, not a global, so it cannot be called directly. Driving the real report
  // render is the better proof anyway: it asserts what the agent actually sees, which is what the packet
  // requires. The Detail format is the one whose builder emits the $/SF line.
  function renderedReport(row: Record<string, unknown>) {
    const vc = new jsdom.VirtualConsole();
    vc.on('jsdomError', () => undefined);
    const modal = read('public/crm/html/modals/reports.html') + read('public/crm/html/modals/report-preview.html');
    const dom = new jsdom.JSDOM(`<!doctype html><html><body>${modal}</body></html>`, {
      url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole: vc,
    });
    const win: any = dom.window;
    const dl = read('public/crm/js/core/data-loader.js');
    const start = dl.indexOf('var reportState = {');
    const MARK = ['', '        };'].join('\n');
    const canonicalState = dl.slice(start, dl.indexOf(MARK, start) + MARK.length);
    win.fetch = () => Promise.reject(new Error('denied'));
    win.eval(`
      var LOGGED_IN_AGENT = { id: 'agent-1' };
      var AGENT_PROFILE = { name: 'Maya Allan', company: 'Mallan Real Estate Inc.', email: 'm@x.co', phone: '1', license: '1', companyLicense: '1', address: 'NY' };
      var listings = ${JSON.stringify([row])};
      var searchResultsState = { filteredListings: listings, selectedListings: [] };
      ${canonicalState}
      reportState.version = 'agent';
      reportState.format = 'detail';
      var customerDB = {}; var listingFlags = {}; var currentReportFieldType = 'sale';
      var activeSearchCriteria = null;
      function logAuditEntry() {}
      function showToast() {}
      function isEmailConfigured() { return false; }
      function getConfiguredAgentEmail() { return ''; }
      function openEmailSettings() {}
      function getListingColor() { return { bg: '#fff', accent: '#000', icon: '#000' }; }
      function openPrintableWindow() {}
      function sendViaEmailJS() { return Promise.reject(new Error('x')); }
      function checkListingCompliance() { return { ok: true, violations: [] }; }
    `);
    win.eval(read('public/crm/js/core/status-presentation.js'));
    win.eval(read('public/crm/js/core/reso-field-map.js'));
    win.eval(read('public/crm/js/output/reports.js'));
    win.openReportsModal([row.id]);
    let html = '';
    try { html = String(win.buildFullReportHTML('Test')); } catch (e) { html = 'THREW: ' + String(e); }
    win.close();
    return html;
  }

  /**
   * MY FIRST VERSION OF THIS GROUP WAS A FALSE GREEN, and it hid a bigger defect than the one it aimed
   * at. It searched for '$0' only when adjacent to 'SF' - and every 'SF' it matched was CSS
   * (letter-spacing, font-size), so the pattern could never fire. The report meanwhile renders a null
   * price as the HEADLINE $0. Narrowing an assertion to the defect you expect is how you certify the one
   * you have. Assert on the figure itself, with a positive control that a REAL zero still prints $0 -
   * otherwise 'no $0 anywhere' would also be satisfied by rendering nothing at all.
   */
  const dollarZeroCount = (html: string) => (html.match(/\$0\b/g) || []).length;

  it('an UNKNOWN price renders no $0 anywhere - not as price, not as a ratio', () => {
    const html = renderedReport({ ...UNKNOWN, intSqft: 900 });
    expect(html).toContain('1 Unknown Way');
    expect({ zeros: dollarZeroCount(html) }).toEqual({ zeros: 0 });
  });

  it('a REAL zero price still renders $0 - the control that keeps the above honest', () => {
    const html = renderedReport({ ...ZERO, intSqft: 900 });
    expect(html).toContain('2 Studio Street');
    expect(dollarZeroCount(html)).toBeGreaterThan(0);
  });

  it('null and undefined answer the SAME way', () => {
    const withNull = renderedReport({ ...UNKNOWN, price: null, intSqft: 900 });
    const withUndef = renderedReport({ ...UNKNOWN, price: undefined, intSqft: 900 });
    expect({ nul: dollarZeroCount(withNull), und: dollarZeroCount(withUndef) })
      .toEqual({ nul: 0, und: 0 });
  });

  it('a known price over a known sqft still renders its ratio', () => {
    const html = renderedReport({ ...NORMAL, price: 900000, intSqft: 900 });
    expect(html).toContain('1,000');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — CMA and report beds/baths, both directions of the invariant
// ═════════════════════════════════════════════════════════════════════════════
describe('D · the same document must not read 0 two opposite ways', () => {
  it('reports.js no longer renders an unknown bedroom count as 0 BR', () => {
    const src = read('public/crm/js/output/reports.js').replace(/\r\n/g, '\n');
    expect(src).not.toMatch(/subject\.beds\s*\|\|\s*0/);
    expect(src).not.toMatch(/subject\.baths\s*\|\|\s*0/);
  });

  it('reports.js no longer renders a studio as unknown', () => {
    const src = read('public/crm/js/output/reports.js').replace(/\r\n/g, '\n');
    expect(src).not.toMatch(/cl\.beds\s*\|\|\s*'\\u2014'/);
    expect(src).not.toMatch(/cl\.beds\s*\|\|\s*'—'/);
  });

  it('the CMA request keeps a studio as 0 rather than sending it as unknown', () => {
    const src = read('public/crm/js/search/pagination.js').replace(/\r\n/g, '\n');
    expect(src).not.toMatch(/bedrooms:\s*listing\.beds\s*\|\|\s*null/);
    expect(src).not.toMatch(/bathrooms:\s*listing\.baths\s*\|\|\s*null/);
  });

  it('an unknown price is not persisted as 0 on the CRM lead', () => {
    const src = read('public/crm/js/search/pagination.js').replace(/\r\n/g, '\n');
    expect(src).not.toMatch(/listing_price:\s*Number\(listing\.price\s*\|\|\s*0\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — the canonical producer is protected, not rewritten
// ═════════════════════════════════════════════════════════════════════════════
describe('E · crm-idx-mapper still distinguishes absent from zero', () => {
  it('num() returns null for absent and preserves a literal 0', () => {
    const src = read('lib/search/crm-idx-mapper.ts');
    expect(src).toContain('ABSENT and ZERO are different facts');
    expect(src).toMatch(/if \(value === null \|\| value === undefined \|\| value === ""\) return null;/);
  });

  it('the invariant statement in data-loader survives', () => {
    expect(read('public/crm/js/core/data-loader.js'))
      .toContain('No numeric provider fact');
  });
});
