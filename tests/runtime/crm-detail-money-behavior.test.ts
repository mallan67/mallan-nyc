import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DETAIL RENDERER IS ACTUALLY EXECUTED HERE.
 *
 * The companion suite reads `pagination.js` and evaluates its helpers. Those
 * invariants are worth keeping, but a source scan cannot prove the panel renders
 * — and "does it throw?" is precisely the question that matters after the
 * null-to-zero coercion was removed. A regex has no opinion about a
 * `TypeError: Cannot read properties of null`.
 *
 * So this mounts the file and calls `showListingDetail()` on real listing
 * records, then reads what the DOM actually contains:
 *
 *   null      unknown   -> "Unavailable", no throw
 *   0         real zero -> "$0"
 *   positive  amount    -> the formatted figure
 *
 * `$0 maintenance` and `maintenance not supplied` are different statements about
 * a co-op. A broker reads this panel before telling a client what a place costs.
 */

/** The containers `showListingDetail` writes into, plus what its siblings need. */
const SHELL = `
  <div id="listingDetailPage" class="hidden">
    <div id="detailHeaderRight"></div>
    <div id="listingDetailContent"></div>
    <div id="detailSimilarNeighborhood"></div>
    <div id="detailSimilarNearby"></div>
  </div>
  <div id="searchResultsSection"></div>
  <select id="perPageSelect"><option value="25">25</option></select>
  <div id="averagesRow"></div>
  <button id="toggleAveragesBtn"></button>
`;

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'L1',
    lid: 'RLS1',
    address: '845 FIFTH AVE',
    displayAddress: '845 FIFTH AVE',
    unit: '17C',
    neighborhood: 'Upper East Side',
    borough: 'Manhattan',
    zip: '10128',
    status: 'Active',
    propertyType: 'Residential',
    price: 2500000,
    beds: 2,
    baths: 2,
    rooms: 5,
    intSqft: 1200,
    dom: 30,
    cdom: 30,
    images: [],
    // The three money facts under test — unknown by default.
    maintCC: null,
    reTaxes: null,
    totalMonthly: null,
    originalPrice: null,
    ...overrides,
  };
}

function mount(rows: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const virtualConsole = new VirtualConsole();
  const errors: string[] = [];
  virtualConsole.on('jsdomError', (e: Error) => errors.push(e.message));

  const dom = new JSDOM(`<!DOCTYPE html><html><body>${SHELL}</body></html>`, {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole,
  });
  const win = dom.window as any;

  win.listings = rows;
  win.searchResultsState = { filteredListings: rows, currentPage: 1, perPage: 25, selectedListings: [] };
  win.LOGGED_IN_AGENT = { id: 1, name: 'Test Agent' };
  win.showToast = () => {};
  win.escapeHtml = (s: unknown) => String(s ?? '');
  win.updateStickyNavActive = () => {};
  win.fetch = () => Promise.reject(new Error('no network in tests'));
  win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [] }) } };

  // index.html order: reso-field-map defines getStatusBadgeClasses, which the
  // detail renderer calls before writing any markup. Loading the REAL dependency
  // rather than stubbing it keeps the harness honest about what the page needs —
  // stubbing it would have hidden that this renderer has an upstream contract.
  // The page's own script chain, in index.html order, up to and including
  // pagination.js. Chasing missing globals one stub at a time hides the fact
  // that this renderer has real upstream contracts — getStatusBadgeClasses,
  // comingSoonBadge and others all come from siblings.
  const idx = readFileSync(join(REPO, 'public/crm/index.html'), 'utf8');
  const all = [...idx.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(
    (m) => 'public/crm/' + m[1],
  );
  const chain = all.slice(0, all.findIndex((f) => f.endsWith('pagination.js')) + 1);
  for (const rel of chain) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }

  // AFTER the scripts load. `data-loader.js` resets the shared `listings`
  // array on load, so seeding it beforehand left `listings.find()` returning
  // undefined and the renderer taking its early return — producing an empty
  // panel that every assertion would then have passed against.
  win.listings = rows;
  win.searchResultsState = { filteredListings: rows, currentPage: 1, perPage: 25, selectedListings: [] };
  return { win, errors };
}

/** Render one listing's detail panel and return its text. */
function renderDetail(rows: Record<string, unknown>[]) {
  const { win, errors } = mount(rows);
  if (typeof win.showListingDetail !== 'function') {
    throw new Error('showListingDetail did not load — the harness is not exercising the renderer');
  }
  win.showListingDetail(rows[0].id);
  const html = win.document.getElementById('listingDetailContent').innerHTML;
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), errors };
}

describe('the listing detail panel renders unknown money honestly', () => {
  it('mounts and renders at all — guard the guard', () => {
    // If the panel never rendered, every assertion below would pass against an
    // empty string. That is how the existing render-safety suite stayed green
    // while never loading this file.
    const { html } = renderDetail([listing({ maintCC: 1850 })]);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('Maint');
  });

  it('renders UNKNOWN maintenance as Unavailable, not $0', () => {
    const { text } = renderDetail([listing({ maintCC: null })]);
    expect(text).toContain('Unavailable');
    expect(text).not.toMatch(/Maint\/CC\s*\$0/);
  });

  it('does NOT throw when every money fact is unknown', () => {
    // The crash path introduced by removing the null-to-zero coercion without
    // tracing the readers: `listing.totalMonthly.toLocaleString()` on a null.
    expect(() =>
      renderDetail([
        listing({ maintCC: null, reTaxes: null, totalMonthly: null, originalPrice: null, price: null }),
      ]),
    ).not.toThrow();
  });

  it('renders a GENUINE ZERO as $0, not as unknown', () => {
    // A co-op that genuinely reports $0 taxes is stating a fact. Truthiness
    // showed it as "---", telling the broker the figure was missing.
    const { text } = renderDetail([listing({ maintCC: 0, reTaxes: 0, totalMonthly: 0 })]);
    expect(text).toContain('$0');
    expect(text).not.toContain('Unavailable');
  });

  it('renders positive amounts correctly', () => {
    const { text } = renderDetail([
      listing({ maintCC: 1850, reTaxes: 940, totalMonthly: 2790 }),
    ]);
    expect(text).toContain('$1,850');
    expect(text).toContain('$940');
    expect(text).toContain('$2,790');
  });

  it('keeps the three states distinguishable in ONE render', () => {
    // The whole point: unknown, zero and an amount must not collapse into each
    // other on the same panel.
    const { text } = renderDetail([
      listing({ maintCC: 0, reTaxes: null, totalMonthly: 2790 }),
    ]);
    expect(text).toContain('$0');
    expect(text).toContain('Unavailable');
    expect(text).toContain('$2,790');
  });

  it('renders an unknown PRICE as Unavailable rather than $0', () => {
    const { text } = renderDetail([listing({ price: null, originalPrice: null })]);
    expect(text).toContain('Unavailable');
    expect(text).not.toMatch(/List Price\s*\$0/);
  });

  it('never mutates the shared inventory record while rendering', () => {
    // `listings.find()` returns a REFERENCE; the renderer works on a copy so one
    // opened panel cannot rewrite the row the grid, reports and CMA read.
    const rows = [listing({ maintCC: null, totalMonthly: null })];
    renderDetail(rows);
    expect(rows[0].maintCC).toBeNull();
    expect(rows[0].totalMonthly).toBeNull();
  });
});
