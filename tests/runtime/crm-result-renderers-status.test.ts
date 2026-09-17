/// <reference types="jest" />
/**
 * THE FIVE RESULT RENDERERS + THE RESULTS MAP ASK THE ONE STATUS AUTHORITY — owner rulings 2026-09-08/09.
 *
 * `lib/search/crm-idx-mapper.ts` now ships the EXACT live Cotality StandardStatus token (or null) as `status`,
 * plus a transaction-aware `status_label` and `status_transaction`. It used to ship an invented uppercase
 * vocabulary ('ACTIVE', 'PENDING', 'COMING_SOON', 'CLOSED', 'CANCELLED', 'OFF_MARKET', 'UNKNOWN'), and the
 * result renderers were written against THAT. Left unmigrated, every one of them fell through its 3-case
 * ternary to the grey "unknown" branch and printed the raw token — a sale's Closed read "Closed" instead of
 * "Sold", a rental's read "Closed" instead of "Rented", a sale's Pending read "Pending" instead of
 * "In Contract", and Canceled / Expired / Hold / ActiveUnderContract / Incomplete / Delete were all rendered
 * identically to a row that has no status at all.
 *
 * The ONE authority is public/crm/js/core/status-presentation.js (`MallanStatus`), which is itself ratcheted
 * against the server mappings by tests/runtime/crm-status-presentation-helper.test.ts. This file proves the
 * SHIPPED renderers ask it: each render function is lifted verbatim out of its real .js by brace matching,
 * evaluated in a real DOM together with the real status helper / reso map / shared badges, and asserted on the
 * RENDERED HTML — never on source text.
 *
 * What it holds to:
 *   1. a sale Closed renders "Sold", a rental Closed renders "Rented", a sale Pending renders "In Contract"
 *      and a rental Pending renders "Pending" — in EVERY view, and the strings are the server mappings' own;
 *   2. a row with no resolvable status renders "Status unavailable" — never "Active", never a blank badge, and
 *      no renderer invents a token for it;
 *   3. no renderer MUTATES the listing object it was handed;
 *   4. the two-L 'Cancelled' is never produced (a legacy row carrying it renders the one-L 'Canceled');
 *   5. badge colours / classes / map-pin colours come from the helper, so the six surfaces cannot drift;
 *   6. no status node is tagged `MlsStatus` — the provider suppresses it and it is not filterable.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING } from '@/lib/crm/status-mapping';

const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const OWNED = {
  grid: 'public/crm/js/render/grid-column-defs.js',
  gallery: 'public/crm/js/render/render-gallery.js',
  summary: 'public/crm/js/render/render-summary.js',
  shortSummary: 'public/crm/js/render/render-short-summary.js',
  masterDetail: 'public/crm/js/render/render-master-detail.js',
  map: 'public/crm/js/render/results-map.js',
};

/**
 * Lift a shipped declaration out of its real file by BRACE MATCHING (never by length or line number), the
 * pattern tests/runtime/crm-search-status-modes.test.ts uses. What runs in jsdom is therefore the production
 * function itself, not a copy of it.
 */
function lift(src: string, needle: string): string {
  const start = src.indexOf(needle);
  if (start < 0) throw new Error('lift: not found — ' + needle);
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error('lift: unbalanced braces — ' + needle);
  return src.slice(start, end);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;

function row(over: Row): Row {
  const built: Row = {
    lid: 'RLS-0001', wid: 'W-0001',
    address: '100 Park Avenue', unit: '4B',
    price: 1250000, totalMonthly: 3200, maintCC: 1200, reTaxes: 900, originalPrice: 0,
    rooms: 4, beds: 2, baths: 2, intSqft: 1100, photoCount: 9,
    neighborhood: 'Upper East Side', zip: '10128', era: 'Pre-War', ownership: 'Condominium',
    company: 'Mallan Real Estate Inc.', agentName: 'Maya Allan', agentPhone: '', agentEmail: '',
    dom: 12, listedDate: '2026-08-01', updatedDate: '2026-09-01',
    latitude: 40.7808, longitude: -73.9502,
    permissions: {}, images: [],
    ...over,
  };
  built.id = 'id-' + String(over.id);
  return built;
}

/** The real DTO shape: exact token + the server's own transaction-aware label. */
const SALE_ACTIVE = row({ id: 'sale-active', status: 'Active', status_label: 'Active', status_transaction: 'sale' });
const SALE_PENDING = row({ id: 'sale-pending', status: 'Pending', status_label: 'In Contract', status_transaction: 'sale' });
const SALE_CLOSED = row({ id: 'sale-closed', status: 'Closed', status_label: 'Sold', status_transaction: 'sale' });
const SALE_COMING_SOON = row({ id: 'sale-cs', status: 'ComingSoon', status_label: 'Coming Soon', status_transaction: 'sale', comingSoonDate: '2026-09-20' });
const SALE_AUC = row({ id: 'sale-auc', status: 'ActiveUnderContract', status_label: 'Active Under Contract', status_transaction: 'sale' });
const RENTAL_CLOSED = row({ id: 'rent-closed', status: 'Closed', status_label: 'Rented', status_transaction: 'rent', listingCategory: 'rental', price: 4200 });
const RENTAL_PENDING = row({ id: 'rent-pending', status: 'Pending', status_label: 'Pending', status_transaction: 'rent', listingCategory: 'rental', price: 4200 });

/** A cached / older payload: token only, no server label. The BROWSER must supply the transaction's word. */
const SALE_CLOSED_BARE = row({ id: 'sale-closed-bare', status: 'Closed' });
const RENTAL_CLOSED_BARE = row({ id: 'rent-closed-bare', status: 'Closed', listingCategory: 'rental', price: 4200 });
const SALE_PENDING_BARE = row({ id: 'sale-pending-bare', status: 'Pending' });
const RENTAL_PENDING_BARE = row({ id: 'rent-pending-bare', status: 'Pending', listingCategory: 'rental', price: 4200 });

/** Read-compatibility: the retired uppercase word and the two-L spelling still render correctly. */
const LEGACY_UPPER = row({ id: 'legacy-upper', status: 'COMING_SOON' });
const LEGACY_CANCELLED = row({ id: 'legacy-cancelled', status: 'Cancelled' });

/** Fail-closed: no status at all, and the retired 'UNKNOWN' sentinel, which is NOT a status. */
const NO_STATUS = row({ id: 'no-status', status: null });
const SENTINEL = row({ id: 'sentinel', status: 'UNKNOWN' });

const ALL: Row[] = [
  SALE_ACTIVE, SALE_PENDING, SALE_CLOSED, SALE_COMING_SOON, SALE_AUC,
  RENTAL_CLOSED, RENTAL_PENDING,
  SALE_CLOSED_BARE, RENTAL_CLOSED_BARE, SALE_PENDING_BARE, RENTAL_PENDING_BARE,
  LEGACY_UPPER, LEGACY_CANCELLED, NO_STATUS, SENTINEL,
];

// ── The real page, in a real DOM ──────────────────────────────────────────────────────────────────
function boot(rows: Row[] = ALL) {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(
    `<!doctype html><html><body>
      <div id="galleryResults"></div>
      <div id="summaryResults"></div>
      <div id="shortSummaryResults"></div>
      <div id="masterListPanel"></div>
      <div id="detailPanel"></div>
    </body></html>`,
    { url: 'http://localhost/crm/', runScripts: 'outside-only', virtualConsole },
  );
  const win: any = dom.window;
  win.listings = rows;
  win.searchResultsState = { selectedListings: [], filteredListings: rows };
  win.currentWorkspaceClientId = null;
  win.getFilteredListings = () => rows;

  // The page's own shared modules, in the page's load order (index.html: status-presentation → nav →
  // reso-field-map → shared-badges → renderers). This file owns none of these four.
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/core/nav.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/render/shared-badges.js'));

  // The renderers under test, each brace-matched out of its shipped file.
  win.eval(lift(read(OWNED.grid), 'var gridColumnDefs'));
  win.eval(lift(read(OWNED.gallery), 'function renderGalleryView'));
  win.eval(lift(read(OWNED.summary), 'function renderSummaryView'));
  win.eval(lift(read(OWNED.shortSummary), 'function renderShortSummaryView'));
  win.eval(lift(read(OWNED.masterDetail), 'function renderMasterDetailView'));
  win.eval(lift(read(OWNED.masterDetail), 'function showListingInDetailPanel'));

  return { win, doc: win.document, close: () => dom.window.close() };
}

/** The results map is an IIFE with no exported internals, so its three functions are lifted and given the
 *  module-private bindings they close over, plus a MapLibre popup double that captures the emitted HTML. */
function bootMap() {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/crm/', runScripts: 'outside-only', virtualConsole,
  });
  const win: any = dom.window;
  const src = read(OWNED.map);
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(`
    var _centroids = null, _popup = null, _map = null;
    var __popupHTML = null;
    var maplibregl = { Popup: function () {
      this.setLngLat = function () { return this; };
      this.setHTML = function (h) { __popupHTML = h; return this; };
      this.addTo = function () { return this; };
      this.remove = function () {};
    } };
  `);
  win.eval(lift(src, 'function buildGeoJSON'));
  win.eval(lift(src, 'function fmtPrice'));
  win.eval(lift(src, 'function createMarkerEl'));
  win.eval(lift(src, 'function showPopup'));
  return { win, close: () => dom.window.close() };
}

const text = (el: any) => (el ? String(el.textContent).replace(/\s+/g, ' ').trim() : null);

/** Every view's primary status badge carries data-status-badge; the coming-soon / participant-only badges
 *  beside it do not, so this selector is the status badge and nothing else. */
function badgeIn(scope: any) {
  return scope ? scope.querySelector('[data-status-badge]') : null;
}

function cardsOf(win: any, containerId: string, renderFn: string) {
  win[renderFn]();
  const container = win.document.getElementById(containerId);
  const out: Record<string, any> = {};
  for (const el of [...container.querySelectorAll('[data-listing-id]')]) {
    out[(el as any).getAttribute('data-listing-id')] = el;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the shipped renderers no longer carry the retired uppercase vocabulary', () => {
  it('no owned renderer compares against ACTIVE / PENDING / COMING_SOON / CLOSED / CANCELLED / OFF_MARKET', () => {
    const offenders: string[] = [];
    for (const [name, rel] of Object.entries(OWNED)) {
      const src = read(rel);
      for (const word of ['ACTIVE_UNDER_CONTRACT', 'COMING_SOON', 'OFF_MARKET', 'CANCELLED', "'ACTIVE'", "'PENDING'", "'CLOSED'"]) {
        if (src.includes(word)) offenders.push(`${name}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no status node is tagged MlsStatus — the provider suppresses it and it is not filterable', () => {
    for (const rel of Object.values(OWNED)) expect({ rel, hit: read(rel).includes('MlsStatus') }).toEqual({ rel, hit: false });
  });
});

describe('grid — the STATUS column', () => {
  let h: ReturnType<typeof boot>;
  beforeAll(() => { h = boot(); });
  afterAll(() => h?.close());

  const render = (l: Row) => {
    const host = h.doc.createElement('div');
    host.innerHTML = h.win.gridColumnDefs.status.render(l);
    return host;
  };

  it('the column is bound to StandardStatus', () => {
    expect(h.win.gridColumnDefs.status.reso).toBe('StandardStatus');
  });

  it.each([
    ['sale Active', SALE_ACTIVE, 'Active'],
    ['sale Pending', SALE_PENDING, 'In Contract'],
    ['sale Closed', SALE_CLOSED, 'Sold'],
    ['sale ActiveUnderContract', SALE_AUC, 'Active Under Contract'],
    ['sale ComingSoon', SALE_COMING_SOON, 'Coming Soon'],
    ['rental Closed', RENTAL_CLOSED, 'Rented'],
    ['rental Pending', RENTAL_PENDING, 'Pending'],
    ['sale Closed (no server label)', SALE_CLOSED_BARE, 'Sold'],
    ['rental Closed (no server label)', RENTAL_CLOSED_BARE, 'Rented'],
    ['sale Pending (no server label)', SALE_PENDING_BARE, 'In Contract'],
    ['rental Pending (no server label)', RENTAL_PENDING_BARE, 'Pending'],
    ['legacy COMING_SOON', LEGACY_UPPER, 'Coming Soon'],
    ['legacy two-L Cancelled', LEGACY_CANCELLED, 'Canceled'],
    ['no status', NO_STATUS, 'Status unavailable'],
    ['UNKNOWN sentinel', SENTINEL, 'Status unavailable'],
  ])('%s renders "%s"', (_name, listing, expected) => {
    expect(text(badgeIn(render(listing)))).toBe(expected);
  });

  it('the badge value is the exact live token, and empty when there is none', () => {
    expect(badgeIn(render(SALE_CLOSED))!.getAttribute('data-reso-value')).toBe('Closed');
    expect(badgeIn(render(RENTAL_CLOSED))!.getAttribute('data-reso-value')).toBe('Closed');
    expect(badgeIn(render(LEGACY_UPPER))!.getAttribute('data-reso-value')).toBe('ComingSoon');
    expect(badgeIn(render(LEGACY_CANCELLED))!.getAttribute('data-reso-value')).toBe('Canceled');
    expect(badgeIn(render(NO_STATUS))!.getAttribute('data-reso-value')).toBe('');
    expect(badgeIn(render(SENTINEL))!.getAttribute('data-reso-value')).toBe('');
    for (const l of ALL) expect(badgeIn(render(l))!.getAttribute('data-reso-field')).toBe('StandardStatus');
  });

  it('the badge classes are the helper\'s, so the grid cannot drift from the cards', () => {
    for (const l of ALL) {
      const cls = badgeIn(render(l))!.getAttribute('class');
      for (const c of String(h.win.MallanStatus.classes(l)).split(' ')) expect(cls).toContain(c);
    }
    // and a real off-market status is no longer painted like a status-less row
    expect(badgeIn(render(SALE_CLOSED))!.getAttribute('class'))
      .not.toBe(badgeIn(render(NO_STATUS))!.getAttribute('class'));
  });
});

describe.each([
  ['gallery', 'galleryResults', 'renderGalleryView'],
  ['summary', 'summaryResults', 'renderSummaryView'],
  ['short summary', 'shortSummaryResults', 'renderShortSummaryView'],
  ['master list', 'masterListPanel', 'renderMasterDetailView'],
])('%s — every card badge speaks its own transaction', (_view, containerId, fn) => {
  let h: ReturnType<typeof boot>;
  let cards: Record<string, any>;
  beforeAll(() => { h = boot(); cards = cardsOf(h.win, containerId, fn); });
  afterAll(() => h?.close());

  it.each([
    ['sale-active', 'Active'],
    ['sale-pending', 'In Contract'],
    ['sale-closed', 'Sold'],
    ['sale-auc', 'Active Under Contract'],
    ['sale-cs', 'Coming Soon'],
    ['rent-closed', 'Rented'],
    ['rent-pending', 'Pending'],
    ['sale-closed-bare', 'Sold'],
    ['rent-closed-bare', 'Rented'],
    ['sale-pending-bare', 'In Contract'],
    ['rent-pending-bare', 'Pending'],
    ['legacy-upper', 'Coming Soon'],
    ['legacy-cancelled', 'Canceled'],
    ['no-status', 'Status unavailable'],
    ['sentinel', 'Status unavailable'],
  ])('%s renders "%s"', (id, expected) => {
    expect(text(badgeIn(cards['id-' + id]))).toBe(expected);
  });

  it('the two-L "Cancelled" is never produced anywhere in the view', () => {
    expect(h.doc.getElementById(containerId).innerHTML).not.toMatch(/Cancelled/);
  });

  it('the retired uppercase words are never rendered', () => {
    const html = h.doc.getElementById(containerId).innerHTML;
    for (const word of ['COMING_SOON', 'OFF_MARKET', 'UNKNOWN', '>ACTIVE<', '>PENDING<', '>CLOSED<']) {
      expect({ word, hit: html.includes(word) }).toEqual({ word, hit: false });
    }
  });

  it('a status-less row is never advertised as live inventory', () => {
    // Some views badge with Tailwind classes and some with inline colours; either way the presentation must be
    // the helper's own "unknown" one, and it must not look like a live Active row.
    const sig = (el: any) => `${el.getAttribute('class') || ''}|${el.getAttribute('style') || ''}`;
    const bare = badgeIn(cards['id-no-status']);
    expect(text(bare)).toBe('Status unavailable');
    const cls = String(h.win.MallanStatus.classes(NO_STATUS));
    const col = h.win.MallanStatus.colors(NO_STATUS);
    const mine = sig(bare);
    expect({ helperPresentation: mine.includes(cls) || (mine.includes(col.bg) && mine.includes(col.fg)) })
      .toEqual({ helperPresentation: true });
    expect(mine).not.toBe(sig(badgeIn(cards['id-sale-active'])));
  });
});

describe('master detail panel — the header badge and the STATUS cell', () => {
  let h: ReturnType<typeof boot>;
  beforeAll(() => { h = boot(); });
  afterAll(() => h?.close());

  const open = (l: Row) => { h.win.showListingInDetailPanel(l.id); return h.doc.getElementById('detailPanel'); };

  it.each([
    ['sale-closed', SALE_CLOSED, 'Sold'],
    ['rent-closed', RENTAL_CLOSED, 'Rented'],
    ['sale-pending', SALE_PENDING, 'In Contract'],
    ['rent-pending', RENTAL_PENDING, 'Pending'],
    ['legacy-cancelled', LEGACY_CANCELLED, 'Canceled'],
    ['no-status', NO_STATUS, 'Status unavailable'],
  ])('%s: both status nodes read "%s"', (_id, listing, expected) => {
    const panel = open(listing);
    const badges = [...panel.querySelectorAll('[data-status-badge]')];
    expect(badges.length).toBe(2); // header badge + the STATUS grid cell
    for (const b of badges) expect(text(b)).toBe(expected);
  });
});

describe('the rendered words are the server mappings\' own — one vocabulary, not a browser copy', () => {
  let h: ReturnType<typeof boot>;
  beforeAll(() => { h = boot(); });
  afterAll(() => h?.close());

  it('sale Closed / Pending and rental Closed / Pending match lib/crm/status-mapping.ts exactly', () => {
    const render = (l: Row) => {
      const host = h.doc.createElement('div');
      host.innerHTML = h.win.gridColumnDefs.status.render(l);
      return text(badgeIn(host));
    };
    expect(render(SALE_CLOSED_BARE)).toBe(SALE_STATUS_MAPPING.canonicalLabels.Closed);
    expect(render(SALE_PENDING_BARE)).toBe(SALE_STATUS_MAPPING.canonicalLabels.Pending);
    expect(render(RENTAL_CLOSED_BARE)).toBe(RENTAL_STATUS_MAPPING.canonicalLabels.Closed);
    expect(render(RENTAL_PENDING_BARE)).toBe(RENTAL_STATUS_MAPPING.canonicalLabels.Pending);
    expect(SALE_STATUS_MAPPING.canonicalLabels.Closed).toBe('Sold');
    expect(RENTAL_STATUS_MAPPING.canonicalLabels.Closed).toBe('Rented');
  });
});

describe('no renderer mutates the listing it was handed', () => {
  it('every view leaves all fifteen rows byte-identical', () => {
    const before = JSON.stringify(ALL);
    const h = boot();
    h.win.renderGalleryView();
    h.win.renderSummaryView();
    h.win.renderShortSummaryView();
    h.win.renderMasterDetailView();
    for (const l of ALL) h.win.showListingInDetailPanel(l.id);
    for (const l of ALL) h.win.gridColumnDefs.status.render(l);
    expect(JSON.stringify(ALL)).toBe(before);
    h.close();
  });
});

describe('gallery inline colours and the Coming Soon badge', () => {
  let h: ReturnType<typeof boot>;
  let cards: Record<string, any>;
  beforeAll(() => { h = boot(); cards = cardsOf(h.win, 'galleryResults', 'renderGalleryView'); });
  afterAll(() => h?.close());

  it('the badge background / foreground are the helper\'s colours for that token', () => {
    for (const l of ALL) {
      const badge = badgeIn(cards[l.id]);
      const want = h.win.MallanStatus.colors(l);
      const style = String(badge.getAttribute('style')).replace(/\s+/g, '');
      expect({ id: l.id, bg: style.includes('background:' + want.bg), fg: style.includes('color:' + want.fg) })
        .toEqual({ id: l.id, bg: true, fg: true });
    }
  });

  it('the Coming Soon photo badge is tagged StandardStatus, never MlsStatus', () => {
    const cs = cards['id-sale-cs'].querySelector('[data-compliance="coming-soon-badge"]');
    expect(cs).not.toBeNull();
    expect(cs.getAttribute('data-reso-field')).toBe('StandardStatus');
    expect(cs.getAttribute('data-reso-value')).toBe('ComingSoon');
    expect(h.doc.getElementById('galleryResults').innerHTML).not.toContain('MlsStatus');
  });

  it('the legacy uppercase COMING_SOON row still gets the badge (read-compatible)', () => {
    expect(cards['id-legacy-upper'].querySelector('[data-compliance="coming-soon-badge"]')).not.toBeNull();
  });

  it('a row that is not Coming Soon gets no Coming Soon badge', () => {
    expect(cards['id-sale-active'].querySelector('[data-compliance="coming-soon-badge"]')).toBeNull();
    expect(cards['id-no-status'].querySelector('[data-compliance="coming-soon-badge"]')).toBeNull();
  });
});

describe('results map — pins and popup', () => {
  let m: ReturnType<typeof bootMap>;
  beforeAll(() => { m = bootMap(); });
  afterAll(() => m?.close());

  const props = (id: string) => {
    const fc = m.win.buildGeoJSON(ALL);
    return fc.features.find((f: any) => f.properties.id === id).properties;
  };

  it('a feature carries the exact live token, and an empty one when the row has no status', () => {
    expect(props('id-sale-closed').status).toBe('Closed');
    expect(props('id-legacy-upper').status).toBe('ComingSoon');
    expect(props('id-legacy-cancelled').status).toBe('Canceled');
    expect(props('id-no-status').status).toBe('');
    expect(props('id-sentinel').status).toBe('');
  });

  it('a feature carries the transaction-aware label: sale Closed = Sold, rental Closed = Rented', () => {
    expect(props('id-sale-closed').statusLabel).toBe('Sold');
    expect(props('id-rent-closed-bare').statusLabel).toBe('Rented');
    expect(props('id-sale-pending-bare').statusLabel).toBe('In Contract');
    expect(props('id-rent-pending-bare').statusLabel).toBe('Pending');
    expect(props('id-no-status').statusLabel).toBe('Status unavailable');
  });

  it('the pin colour is the helper\'s — ComingSoon purple, ActiveUnderContract amber, and they are distinct', () => {
    const bg = (status: string) => String(m.win.createMarkerEl(1000000, status).style.background);
    const S = m.win.MallanStatus;
    const toRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    for (const t of ['Active', 'ComingSoon', 'ActiveUnderContract', 'Pending', 'Closed', 'Canceled']) {
      expect({ t, bg: bg(t) }).toEqual({ t, bg: toRgb(S.pinColor(t)) });
    }
    expect(bg('ComingSoon')).toBe(toRgb('#7c3aed'));
    expect(bg('ActiveUnderContract')).toBe(toRgb('#d97706'));
    expect(bg('ComingSoon')).not.toBe(bg('ActiveUnderContract'));
    // a status-less pin is the helper's unknown grey, not a fabricated colour
    expect(bg('')).toBe(toRgb(S.pinColor('')));
  });

  it('the popup shows the transaction-aware label, and never a raw token', () => {
    const fc = m.win.buildGeoJSON(ALL);
    const pop = (id: string) => {
      m.win.showPopup(fc.features.find((f: any) => f.properties.id === id));
      const host = m.win.document.createElement('div');
      host.innerHTML = m.win.eval('__popupHTML');
      return host;
    };
    expect(text(badgeIn(pop('id-sale-closed')))).toBe('Sold');
    expect(text(badgeIn(pop('id-rent-closed-bare')))).toBe('Rented');
    expect(text(badgeIn(pop('id-sale-pending-bare')))).toBe('In Contract');
    expect(text(badgeIn(pop('id-no-status')))).toBe('Status unavailable');
    expect(pop('id-legacy-cancelled').innerHTML).not.toMatch(/Cancelled/);
    expect(pop('id-sale-cs').innerHTML).not.toContain('COMING_SOON');
  });
});
