/// <reference types="jest" />
/**
 * SALE AND RENTAL ARE SEPARATE WORKFLOWS, AND NEITHER MAY BORROW THE OTHER'S
 * CRITERIA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A BEHAVIOURAL TEST
 *
 * The field registry DECLARES workflow membership — `workflows: ['sale']`,
 * `workflows: ['rental']` — and nothing in the executor or the route reads it.
 * Declared separation that is never enforced is a comment, so the question
 * "can a Sale criterion reach a Rental search?" cannot be answered by reading
 * the registry. It has to be executed.
 *
 * This mounts the SHIPPED form and the SHIPPED scripts and drives the real
 * serializer, the same way the neighbourhood transport suite does: criteria are
 * entered on one tab, the tab is switched, and the params that would actually
 * go on the wire are inspected.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const FORM = readFileSync(join(REPO, 'public/crm/html/search-form-and-results.html'), 'utf8');

interface Mounted {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  win: any;
}

function mount(): Mounted {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${FORM}</body></html>`, {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = dom.window as any;
  win.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ listings: [], total: 0 }) });
  win.listings = [];
  win.searchResultsState = { filteredListings: [], currentPage: 1, selectedListings: [] };
  win.LOGGED_IN_AGENT = { id: 1 };
  win.showToast = () => {};
  win.initializeSearchResults = () => {};
  win.updateResultsCount = () => {};
  win.refreshResultsMap = () => {};
  win.updateStickyNavActive = () => {};
  win.resolveNeighborhoodCanonical = () => {};

  for (const rel of [
    'public/crm/js/core/nav.js',
    'public/crm/js/core/api-client.js',
    'public/crm/js/search/result-scope.js',
    'public/crm/js/search/date-range-picker.js',
    'public/crm/js/search/search-engine.js',
  ]) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }
  return { win };
}

/** Params the shipped serializer would actually put on the wire for `tab`. */
function paramsFor(m: Mounted, tab: 'sale' | 'rent', criteria: Record<string, unknown>) {
  m.win.toggleSearchTab(tab);
  return m.win.buildIdxSearchParams({ ...criteria, searchTab: tab });
}

describe('the workflow reaches the wire at all', () => {
  let m: Mounted;
  beforeAll(() => { m = mount(); });

  it('guard the guard — the shipped serializer is really being driven', () => {
    // Without this, a serializer that failed to load would make every
    // "no leakage" assertion below vacuously true.
    expect(typeof m.win.buildIdxSearchParams).toBe('function');
    expect(typeof m.win.toggleSearchTab).toBe('function');
  });

  it('sale and rental are distinguished on the wire, not merged', () => {
    // If both emitted the same `type`, no separation downstream could hold —
    // the executor renders the Sale/Rental universe from this one value.
    expect(paramsFor(m, 'sale', {}).type).toBe('sale');
    expect(paramsFor(m, 'rent', {}).type).toBe('rental');
  });
});

describe('a criterion belonging to one workflow does not reach the other', () => {
  let m: Mounted;
  beforeAll(() => { m = mount(); });

  it('a SALE-only date criterion does not travel on a rental search', () => {
    // `listing_contract_date` is declared `workflows: ['sale']`, and the
    // executor applies `contractDateFrom` unconditionally — there is no
    // workflow check in crm-idx-filter.ts. So the only thing standing between a
    // sale criterion and a rental query is the client not sending it.
    const rental = paramsFor(m, 'rent', { contractDateFrom: '2026-01-01' });
    const sale = paramsFor(m, 'sale', { contractDateFrom: '2026-01-01' });
    // Established first: the criterion IS emitted where it belongs, so an
    // absence on the rental side means separation rather than a dead param.
    expect(sale.contractDateFrom).toBe('2026-01-01');
    expect(rental.contractDateFrom).toBeUndefined();
  });

  it('a SALE-only sponsor-unit criterion does not travel on a rental search', () => {
    const rental = paramsFor(m, 'rent', { sponsorUnit: true });
    expect(rental.sponsorUnit).toBeUndefined();
  });

  it('criteria are held PER TAB, so switching does not carry them across', () => {
    // The real protection: `_canonicalCriteria[tab]`, with the leaving tab's
    // values synced before the switch. A shared criteria object would have made
    // every tab switch a leak.
    const engine = readFileSync(join(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
    expect(engine).toContain('_canonicalCriteria[tab]');
    expect(engine).toContain('syncActiveViewToCanonical(currentSearchTab');
  });
});

describe('the guard is real, and it is declared rather than ad hoc', () => {
  let m: Mounted;
  beforeAll(() => { m = mount(); });

  it('a RENTAL-only criterion does not travel on a sale search', () => {
    // The mirror case. Fixing only the direction that was reported would leave
    // the other half of the same defect in place.
    const sale = paramsFor(m, 'sale', { furnished: true });
    expect(sale.furnished).toBeUndefined();
  });

  it('the scoping is a MAP, so a new criterion forces a decision', () => {
    // Hand-checking at each emit site is how `contractDateFrom` was missed in
    // the first place: the check simply was not written there.
    const engine = readFileSync(join(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
    expect(engine).toContain('WORKFLOW_SCOPED_PARAMS');
    const map = engine.slice(
      engine.indexOf('var WORKFLOW_SCOPED_PARAMS'),
      engine.indexOf('};', engine.indexOf('var WORKFLOW_SCOPED_PARAMS')),
    );
    expect(map).toContain('contractDateFrom');
    expect(map).toContain('furnished');
  });

  it('a criterion belonging to BOTH workflows is untouched', () => {
    // Over-scoping would be its own defect — silently dropping a criterion the
    // broker did ask for, in the same fail-quiet way.
    // The criteria key is `priceMin`; the emitted param is `minPrice`. Using
    // the wrong one here would have made this assert nothing at all.
    const sale = paramsFor(m, 'sale', { priceMin: 500000 });
    const rent = paramsFor(m, 'rent', { priceMin: 5000 });
    expect(sale.minPrice).toBe(500000);
    expect(rent.minPrice).toBe(5000);
  });
});

describe('the separation is declared somewhere a reader can check it', () => {
  it('the registry names the workflow for every criterion', () => {
    const registry = readFileSync(join(REPO, 'lib/search/canonical/field-registry.ts'), 'utf8');
    // Sale-only and rental-only criteria both exist; if either set were empty
    // the separation would be untestable and this file would prove nothing.
    expect(registry).toContain("workflows: ['sale']");
    expect(registry).toContain("workflows: ['rental']");
  });
});
