/// <reference types="jest" />
/**
 * C4B-FINAL-2 — NO NAVIGATION TREATS A NON-EXACT TOTAL AS AN EXACT LAST PAGE.
 *
 * c6f39df0 made the count SENTENCE and the "of Y" display truthful for the four-state contract. It left
 * one reader of the same number still assuming two states — the Last Page action:
 *
 *     function goToLastPage() {
 *       if (window.goToServerPage)
 *         goToServerPage(Math.ceil((searchResultsState.serverTotal || 0) / (searchResultsState.perPage || 50)));
 *     }
 *
 * No serverCountMeaning check at all. So the toolbar could say "At most 100 Results" while the button
 * beside it navigated to page 2 as though 100 were exact.
 *
 * WHAT EACH STATE PERMITS:
 *   exact          — the last page is known; navigate.
 *   lower_bound    — the total is a floor, so the computed page is a known MINIMUM, not the last one.
 *   upper_bound    — the total is a ceiling, so the computed page may be PAST the real last page.
 *   indeterminate  — neither direction is guaranteed; no last page can be inferred at all.
 *
 * Only `exact` supports the action, and the correction refuses rather than guessing: it does not pick a
 * nearby page, does not fall back to the current page, and does not invent a second paging engine. First,
 * Previous and Next are untouched — they navigate by the CURRENT page, not by a derived total.
 *
 * The function must fail safe even when invoked directly, because two live buttons call it
 * (search-form-and-results.html:5612 and :6011) and a disabled button is not a guarantee.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

function boot(meaning: string | null, total: number | null = 100) {
  const html = read('public/crm/html/search-form-and-results.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  const pages: number[] = [];
  const toasts: string[] = [];
  win.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  win.scrollTo = () => undefined;
  win.showSearchSection = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = {
    filteredListings: [], selectedListings: [], perPage: 50, currentPage: 1,
    serverPaged: true, serverTotal: total, serverCountMeaning: meaning, viewMode: 'gallery',
    sortField: 'price', sortOrder: 'desc', visibleColumns: ['address', 'price', 'status'],
  };
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/render/render-dispatcher.js'));
  win.eval(read('public/crm/js/core/nav.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/search/search-engine.js'));
  win.eval(read('public/crm/js/search/pagination.js'));
  // Record navigation instead of performing it: the question is which page the action ASKS for.
  win.goToServerPage = (n: number) => { pages.push(Number(n)); return true; };
  win.showToast = (m: string) => { toasts.push(String(m)); };
  win.showSearchSection = () => undefined;
  return { win, pages, toasts, close: () => dom.window.close() };
}

function lastPageRequest(meaning: string | null, total: number | null = 100) {
  const h = boot(meaning, total);
  try {
    h.win.goToLastPage();
    return { pages: h.pages.slice(), toasts: h.toasts.slice() };
  } finally { h.close(); }
}

const NON_EXACT = ['lower_bound', 'upper_bound', 'indeterminate'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// A — the action
// ─────────────────────────────────────────────────────────────────────────────
describe('A · Last Page navigates only when the count is exact', () => {
  it('exact, 100 over 50 per page → navigates to page 2', () => {
    expect(lastPageRequest('exact').pages).toEqual([2]);
  });

  it.each(NON_EXACT)('%s → navigates NOWHERE; no fabricated last page', (meaning) => {
    expect(lastPageRequest(meaning).pages).toEqual([]);
  });

  it.each(NON_EXACT)('%s → says why, rather than failing silently', (meaning) => {
    const { toasts } = lastPageRequest(meaning);
    expect(toasts.length).toBe(1);
    expect(toasts[0]).toMatch(/approximate|not exact|unavailable/i);
  });

  it('it refuses — it does not substitute a nearby page or fall back to page 1', () => {
    for (const m of NON_EXACT) {
      const { pages } = lastPageRequest(m);
      expect({ m, pages }).toEqual({ m, pages: [] });
    }
  });

  it('an absent meaning is treated as non-exact — fail closed, not open', () => {
    // The pre-server and client-filtered states leave this null. Nothing proves a last page there either.
    expect(lastPageRequest(null).pages).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — everything else about paging is untouched
// ─────────────────────────────────────────────────────────────────────────────
describe('B · First, Previous and Next are unchanged for every state', () => {
  it.each(['exact', ...NON_EXACT])('%s: first/prev/next still navigate by CURRENT page', (meaning) => {
    const h = boot(meaning);
    try {
      h.win.searchResultsState.currentPage = 3;
      h.win.goToFirstPage();
      h.win.goToPrevPage();
      h.win.goToNextPage();
      // They derive from currentPage, never from the uncertain total, so they were never affected.
      expect(h.pages).toEqual([1, 2, 4]);
    } finally { h.close(); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — the shipped artifact, and the earlier C4B work
// ─────────────────────────────────────────────────────────────────────────────
describe('C · the built bundle carries the guard, and prior C4B stands', () => {
  it('index-built.html no longer contains the unguarded last-page derivation', () => {
    const built = read('public/crm/index-built.html');
    expect(built).not.toMatch(/function goToLastPage\(\) \{ if \(window\.goToServerPage\) goToServerPage\(Math\.ceil/);
    expect(built).toContain('_lastPageIsKnown');
  });

  it('the count sentence helper from c6f39df0 is still the one interpreter', () => {
    const src = read('public/crm/js/search/search-engine.js');
    expect(src).toContain('function _countMeaningPresentation');
  });

  it('core C4B membership and cache identity are untouched', () => {
    expect(read('lib/search/engine/universe.ts')).toContain('if (!mallanRowPassesGate(');
    expect(read('lib/search/engine/executor.ts')).toContain('universeKeyOf(c, audience)');
  });
});
