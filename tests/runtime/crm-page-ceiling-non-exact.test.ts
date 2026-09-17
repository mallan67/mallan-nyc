/// <reference types="jest" />
/**
 * C4B-FINAL-3 — serverTotal IS A HARD PAGE CEILING ONLY WHEN THE COUNT IS EXACT.
 *
 * MY OWN EARLIER TEST WAS THE REASON THIS SURVIVED. crm-last-page-non-exact-safety.test.ts asserted that
 * "First / Previous / Next are unchanged" — while STUBBING window.goToServerPage, the very function that
 * contains the clamp. Stubbing the unit under suspicion proves only that the wrappers do arithmetic.
 * goToNextPage() does increment currentPage; goToServerPage() then caps that increment with an uncertain
 * total. This file drives the REAL goToServerPage and stubs nothing below it.
 *
 * TWO READERS, one defect:
 *
 *   goToServerPage()   n = Math.min(Math.max(n, 1), ceil(serverTotal / perPage))
 *   after-fetch        if (page > totalPages) currentPage = totalPages
 *
 * Consequences by state:
 *   exact          correct — the ceiling is proven
 *   lower_bound    WRONG, and user-visible: the toolbar says "At least 100 Results" while Next refuses to
 *                  go past page 2. Real later pages become unreachable, and the UI contradicts itself on
 *                  one screen.
 *   upper_bound    the ceiling may be past the real end
 *   indeterminate  no justified ceiling exists at all
 *
 * THE RULE. The floor is always 1. The ceiling applies only when countMeaning === 'exact'. For every other
 * state the SERVER response decides whether a page has rows — the browser does not get a second
 * membership engine, and it does not invent a last page.
 *
 * ONE HELPER. _countHasExactPageCeiling() is the single browser expression of this rule; pagination.js's
 * _lastPageIsKnown() now delegates to it rather than restating it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

function boot(meaning: string | null, opts: { total?: number | null; page?: number } = {}) {
  const html = read('public/crm/html/search-form-and-results.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  const toasts: string[] = [];
  win.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  win.scrollTo = () => undefined;
  win.showSearchSection = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = {
    filteredListings: [], selectedListings: [], perPage: 50,
    currentPage: opts.page ?? 2,
    serverPaged: true,
    serverTotal: opts.total === undefined ? 100 : opts.total,
    serverCountMeaning: meaning,
    viewMode: 'gallery', sortField: 'price', sortOrder: 'desc',
    visibleColumns: ['address', 'price', 'status'],
  };
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/render/render-dispatcher.js'));
  win.eval(read('public/crm/js/core/nav.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/search/search-engine.js'));
  win.eval(read('public/crm/js/search/pagination.js'));
  win.showToast = (m: string) => { toasts.push(String(m)); };
  win.showSearchSection = () => undefined;
  // activeSearchCriteria is left undefined on purpose: goToServerPage then updates currentPage and skips
  // the refetch, so the assertion is about WHICH PAGE was accepted — nothing below it is stubbed.
  return { win, toasts, close: () => dom.window.close() };
}

/** Which page does the real goToServerPage actually accept? */
function pageAfter(meaning: string | null, request: number, opts: { total?: number | null; page?: number } = {}) {
  const h = boot(meaning, opts);
  try {
    h.win.goToServerPage(request);
    return Number(h.win.searchResultsState.currentPage);
  } finally { h.close(); }
}

/** Where does Next land, through the real wrapper AND the real clamp? */
function pageAfterNext(meaning: string | null, from = 2) {
  const h = boot(meaning, { page: from });
  try {
    h.win.goToNextPage();
    return Number(h.win.searchResultsState.currentPage);
  } finally { h.close(); }
}

const NON_EXACT = ['lower_bound', 'upper_bound', 'indeterminate'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// A — the ceiling
// ─────────────────────────────────────────────────────────────────────────────
describe('A · a hard page ceiling exists only for an exact count', () => {
  it('exact: page 2 of 100/50 is the proven last page — Next stays at 2', () => {
    expect(pageAfterNext('exact')).toBe(2);
  });

  it.each(NON_EXACT)('%s: Next reaches page 3 despite ceil(100/50) === 2', (meaning) => {
    // The defect in one assertion: the count says there may be more (or is unknown), and the browser
    // must not be the thing that refuses to look.
    expect(pageAfterNext(meaning)).toBe(3);
  });

  it.each(NON_EXACT)('%s: a direct request far beyond the computed ceiling is honoured', (meaning) => {
    expect(pageAfter(meaning, 9)).toBe(9);
  });

  it('exact: a direct request beyond the proven ceiling is still clamped', () => {
    expect(pageAfter('exact', 9)).toBe(2);
  });

  it('an absent meaning gets NO hard ceiling either — and that IS the conservative answer here', () => {
    // I first wrote this expecting a clamp, reasoning "fail closed". That was the wrong direction. The
    // conservative act in this lane is never to ASSERT a certainty the data does not support, and a
    // ceiling is exactly such an assertion. Refusing to navigate is a usability restriction, not a safety
    // property — whereas refusing to INVENT a destination (goToLastPage) genuinely is, which is why the
    // two treat null oppositely and both are right.
    expect(pageAfter(null, 9)).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the floor, and Previous
// ─────────────────────────────────────────────────────────────────────────────
describe('B · the floor is always page 1, for every state', () => {
  it.each(['exact', ...NON_EXACT])('%s: a request below 1 normalizes to 1', (meaning) => {
    expect(pageAfter(meaning, -5, { page: 3 })).toBe(1);
  });

  it.each(['exact', ...NON_EXACT])('%s: Previous never goes below page 1', (meaning) => {
    const h = boot(meaning, { page: 1 });
    try {
      h.win.goToPrevPage();
      expect(h.win.searchResultsState.currentPage).toBe(1);
    } finally { h.close(); }
  });

  it.each(['exact', ...NON_EXACT])('%s: First always reaches page 1', (meaning) => {
    const h = boot(meaning, { page: 4 });
    try {
      h.win.goToFirstPage();
      expect(h.win.searchResultsState.currentPage).toBe(1);
    } finally { h.close(); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — one helper, and Last Page still refuses
// ─────────────────────────────────────────────────────────────────────────────
describe('C · one expression of the rule, reused', () => {
  it('_countHasExactPageCeiling is the single interpreter', () => {
    const h = boot('exact');
    try {
      expect(typeof h.win._countHasExactPageCeiling).toBe('function');
      expect(h.win._countHasExactPageCeiling()).toBe(true);
    } finally { h.close(); }
  });

  it.each(NON_EXACT)('%s → no exact ceiling', (meaning) => {
    const h = boot(meaning);
    try { expect(h.win._countHasExactPageCeiling()).toBe(false); } finally { h.close(); }
  });

  it('pagination.js delegates rather than restating the rule', () => {
    const code = read('public/crm/js/search/pagination.js')
      .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(code).toContain('_countHasExactPageCeiling');
    expect(code).not.toContain("serverCountMeaning === 'exact'");
  });

  it('Last Page still refuses for every non-exact state (3a9ba6a4 preserved)', () => {
    for (const meaning of NON_EXACT) {
      const h = boot(meaning, { page: 1 });
      try {
        h.win.goToLastPage();
        expect({ meaning, page: h.win.searchResultsState.currentPage }).toEqual({ meaning, page: 1 });
      } finally { h.close(); }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — after-fetch, and the empty non-first page
// ─────────────────────────────────────────────────────────────────────────────
describe('D · the after-fetch clamp and empty-page feedback', () => {
  it('the after-fetch rewrite is gated on an exact count', () => {
    const code = read('public/crm/js/search/search-engine.js')
      .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    // It used to rewrite currentPage downward from an uncertain total unconditionally. Matched on the
    // GUARD rather than the inner line: the inner line still exists, correctly, inside the gate.
    expect(code).toMatch(/if \(_countHasExactPageCeiling\(\)\) \{[\s\S]{0,220}currentPage = totalPages;/);
    expect(code).toContain('_countHasExactPageCeiling()');
  });

  it('an empty page beyond the first is reported, and never called the last page unless exact', () => {
    const code = read('public/crm/js/search/search-engine.js')
      .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    // Previously only `rows.length === 0 && page === 1` produced any feedback, so an empty later page
    // showed nothing at all once the downward clamp stopped hiding it.
    expect(code).toMatch(/rows\.length === 0 && page > 1/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — the census result, as an assertion
// ─────────────────────────────────────────────────────────────────────────────
describe('E · no active navigation path uses an uncertain total as a hard ceiling', () => {
  it('every ceil(serverTotal / perPage) in navigation is guarded', () => {
    const src = read('public/crm/js/search/search-engine.js') + '\n' + read('public/crm/js/search/pagination.js');
    const code = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    // Each remaining derivation must sit within sight of the guard. The display derivation in
    // updateResultsCount() is exempt: it marks the figure rather than enforcing it (c6f39df0).
    const derivations = (code.match(/Math\.ceil\(\(?searchResultsState\.serverTotal/g) || []).length;
    const guards = (code.match(/_countHasExactPageCeiling\(\)/g) || []).length;
    expect({ guarded: guards >= derivations }).toEqual({ guarded: true });
  });

  it('the built artifact carries the guard', () => {
    expect(read('public/crm/index-built.html')).toContain('_countHasExactPageCeiling');
  });
});
