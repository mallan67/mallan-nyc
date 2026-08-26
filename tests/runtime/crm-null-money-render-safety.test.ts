/// <reference types="jest" />
/**
 * A NULL PROVIDER MONEY VALUE MUST NOT TAKE DOWN THE RESULTS LIST.
 *
 * `lib/search/crm-idx-mapper.ts` deliberately stopped manufacturing zeros:
 * `price` (:114), `totalMonthly` (:216-218), `reTaxes` (:231), `maintCC` (:232),
 * `beds`, `baths`, `rooms`, `intSqft`, `dom` can all now be null. That is
 * correct data semantics — an unknown tax is not a tax of zero.
 *
 * The renderers were never updated. Several call `.toLocaleString()` straight
 * on those values. Because the throw happens inside the `.map()` that builds
 * the markup, `container.innerHTML` is never assigned and the ENTIRE results
 * list stays blank — and `render-gallery` is the DEFAULT view
 * (public/crm/js/core/data-loader.js:77), so this is the first thing an agent
 * hits, not an edge case. `maintCC` in particular is null whenever
 * `AssociationFeeFrequency` is not exactly 'Monthly', which is the common case.
 *
 * THE FIX IS NOT A FAKE ZERO. `render-grid.js` previously coerced
 * `price/totalMonthly/beds/baths` to 0 on a display copy, which renders "$0" —
 * a price of zero is a factual claim, and a broker can quote it. Unknown must
 * render as unavailable while a genuine provider zero still renders as zero.
 *
 * These tests mount the REAL renderer files in JSDOM. Before this suite there
 * was no render-time coverage at all for gallery, summary, short-summary or
 * master-detail — the default view and three of the other four.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

const RENDERERS: Array<[string, string, string]> = [
  // [label, renderer file, container id it writes into]
  ['gallery (DEFAULT VIEW)', 'public/crm/js/render/render-gallery.js', 'galleryResults'],
  ['summary', 'public/crm/js/render/render-summary.js', 'summaryResults'],
  ['short-summary', 'public/crm/js/render/render-short-summary.js', 'shortSummaryResults'],
  ['master-detail', 'public/crm/js/render/render-master-detail.js', 'masterListPanel'],
  ['grid', 'public/crm/js/render/render-grid.js', 'resultsTable'],
];

/** A provider row with identity and every money/numeric fact UNKNOWN. */
const allUnknownRow = () => ({
  id: '1183681390',
  wid: '1183681390',
  address: '123 Test Street',
  unit: '4B',
  company: 'Test Brokerage',
  status: 'Active',
  listingCategory: 'sale',
  images: [],
  permissions: {},
  // every one of these is a legitimate null off the live feed
  price: null,
  totalMonthly: null,
  reTaxes: null,
  maintCC: null,
  associationFee: null,
  beds: null,
  baths: null,
  rooms: null,
  intSqft: null,
  dom: null,
  neighborhood: null,
  borough: null,
});

function mount(rel: string, containerId: string, rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>` +
      `<div id="${containerId}"></div><div id="detailPanel"></div><table id="resultsTable"></table><tbody id="resultsBody"></tbody>` +
      `</body></html>`,
    { runScripts: 'dangerously', url: 'https://mallan.test/crm/', virtualConsole: new VirtualConsole() },
  );
  const win = dom.window as any;

  win.escapeHtml = (s: unknown) => (s == null ? '' : String(s));
  win.searchResultsState = {
    visibleColumns: [],
    selectedListings: [],
    sortField: null,
    sortOrder: 'asc',
    viewMode: 'gallery',
    currentPage: 1,
    perPage: 50,
    filteredListings: rows,
  };
  win.getFilteredListings = () => rows;
  win.getListingPhoto = () => '';
  win.ownershipLabel = () => '';
  win.resoData = () => '';
  win.statusBadge = () => '';
  win.fareActDisclosure = () => '';
  win.currentWorkspaceClientId = null;
  win.listings = rows;
  win.formatCurrency = (a: unknown) => (a === null || a === undefined ? '—' : '$' + Number(a).toLocaleString('en-US'));

  for (const dep of [
    'public/crm/js/core/reso-field-map.js',
    'public/crm/js/render/shared-badges.js',
    'public/crm/js/render/grid-column-defs.js',
    rel,
  ]) {
    try {
      const script = win.document.createElement('script');
      script.textContent = readFileSync(join(REPO, dep), 'utf8');
      win.document.body.appendChild(script);
    } catch {
      /* optional dependency for this renderer */
    }
  }
  return win;
}

function renderFnFor(win: any): (() => void) | null {
  for (const name of [
    'renderGalleryView',
    'renderSummaryView',
    'renderShortSummaryView',
    'renderMasterDetailView',
    'renderGridView',
  ]) {
    if (typeof win[name] === 'function') return win[name];
  }
  return null;
}

describe.each(RENDERERS)('%s renders an all-unknown row without throwing', (_label, rel, containerId) => {
  it('does not throw when every money and numeric fact is null', () => {
    const win = mount(rel, containerId, [allUnknownRow()]);
    const render = renderFnFor(win);
    expect(render).not.toBeNull();
    expect(() => (render as () => void)()).not.toThrow();
  });

  it('writes markup rather than leaving the container empty', () => {
    // The specific production failure: the throw happens inside .map(), so
    // container.innerHTML is never assigned and the list silently stays blank.
    const win = mount(rel, containerId, [allUnknownRow()]);
    const render = renderFnFor(win);
    try {
      (render as () => void)();
    } catch {
      /* the assertion below reports it */
    }
    const el = win.document.getElementById(containerId) || win.document.getElementById('resultsTable');
    expect((el?.innerHTML || '').length).toBeGreaterThan(0);
  });

  it('never prints the literal string "null" to the broker', () => {
    const win = mount(rel, containerId, [allUnknownRow()]);
    const render = renderFnFor(win);
    try {
      (render as () => void)();
    } catch {
      /* covered above */
    }
    const el = win.document.getElementById(containerId) || win.document.getElementById('resultsTable');
    expect(el?.innerHTML || '').not.toMatch(/&gt;null|>null<|\bnull\b\s*(bd|ba|sf)/);
  });

  it('does not invent $0 for an unknown amount', () => {
    // A price of zero is a factual claim a broker can quote. Unknown is not it.
    const win = mount(rel, containerId, [allUnknownRow()]);
    const render = renderFnFor(win);
    try {
      (render as () => void)();
    } catch {
      /* covered above */
    }
    const el = win.document.getElementById(containerId) || win.document.getElementById('resultsTable');
    expect(el?.innerHTML || '').not.toMatch(/\$0\b/);
  });
});

describe('a genuine provider zero is still rendered as zero', () => {
  it('keeps $0 when the provider actually said 0', () => {
    const row = { ...allUnknownRow(), price: 0, maintCC: 0 };
    const win = mount('public/crm/js/render/render-gallery.js', 'galleryResults', [row]);
    const render = renderFnFor(win);
    expect(() => (render as () => void)()).not.toThrow();
    const html = win.document.getElementById('galleryResults')?.innerHTML || '';
    expect(html).toMatch(/\$0\b/);
  });
});
