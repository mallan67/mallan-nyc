/// <reference types="jest" />
/**
 * C4B-FINAL — THE BROWSER SPEAKS THE SAME countMeaning VOCABULARY AS THE SERVER.
 *
 * C4B (a82a0841) widened the server contract from two states to four:
 *
 *     exact | lower_bound | upper_bound | indeterminate
 *
 * and left one live consumer on the old vocabulary. public/crm/js/search/search-engine.js recognised
 * ONLY 'lower_bound' and rendered everything else as a bare "N Results" — so the two NEW states, the ones
 * added precisely because the count could be wrong in the other direction, were presented to an agent as
 * exact fact:
 *
 *     upper_bound   -> "100 Results"   an over-count stated as certainty
 *     indeterminate -> "100 Results"   an unknown stated as certainty
 *
 * That is the failure mode the contract change existed to prevent, relocated one layer down. Widening a
 * contract without walking its readers leaves the readers asserting the old one.
 *
 * PAGINATION HAS THE SAME SHAPE. updateResultsCount() derives `Math.ceil(count / perPage)` and writes it
 * into "Page X of Y" for every countMeaning. From an upper_bound that manufactures pages that may not
 * exist; from a lower_bound it hides pages that do.
 *
 * CHARACTERISED FIRST, per the packet: the browser carries NO `hasMore` — zero occurrences anywhere in
 * public/crm/js. So this makes the smallest truthful correction — the displayed page total is marked
 * non-exact — rather than inventing a pagination engine the page has never had.
 *
 * WORDING RULES. `indeterminate` deliberately gets neither "at least" nor "at most": when the provider
 * walk is incomplete AND rows were lost after counting, neither direction is guaranteed, and claiming
 * either would be a third wrong answer.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

function boot() {
  const html = read('public/crm/html/search-form-and-results.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  win.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  win.showToast = () => undefined;
  win.scrollTo = () => undefined;
  win.showSearchSection = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = {
    filteredListings: [], selectedListings: [], perPage: 50, currentPage: 1,
    serverPaged: true, serverTotal: 100, serverCountMeaning: 'exact', viewMode: 'gallery',
    sortField: 'price', sortOrder: 'desc', visibleColumns: ['address', 'price', 'status'],
  };
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/render/render-dispatcher.js'));
  win.eval(read('public/crm/js/core/nav.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/search/search-engine.js'));
  win.showToast = () => undefined;
  win.showSearchSection = () => undefined;
  return { win, doc: win.document, close: () => dom.window.close() };
}

/** Render the label for one server answer. */
function labelFor(meaning: string, total = 100): string {
  const h = boot();
  try {
    h.win.searchResultsState.serverPaged = true;
    h.win.searchResultsState.serverTotal = total;
    h.win.searchResultsState.serverCountMeaning = meaning;
    return String(h.win._resultsCountLabel());
  } finally { h.close(); }
}

/** Render the "of Y" page total the toolbar shows for one server answer. */
function pageTotalFor(meaning: string, total = 100): string {
  const h = boot();
  try {
    h.win.searchResultsState.serverPaged = true;
    h.win.searchResultsState.serverTotal = total;
    h.win.searchResultsState.serverCountMeaning = meaning;
    h.win.updateResultsCount();
    return String(h.win.document.getElementById('totalPages')?.textContent ?? '');
  } finally { h.close(); }
}

const STATES = ['exact', 'lower_bound', 'upper_bound', 'indeterminate'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// A — the count sentence
// ─────────────────────────────────────────────────────────────────────────────
describe('A · every server countMeaning gets a truthful sentence', () => {
  it('exact states the number plainly', () => {
    expect(labelFor('exact')).toBe('100 Results');
  });

  it('lower_bound says "At least"', () => {
    expect(labelFor('lower_bound')).toBe('At least 100 Results');
  });

  it('upper_bound says "At most" — an over-count must never read as fact', () => {
    expect(labelFor('upper_bound')).toBe('At most 100 Results');
  });

  it('indeterminate claims NEITHER direction', () => {
    const label = labelFor('indeterminate');
    expect(label).toContain('100');
    expect(label).not.toMatch(/^100 Results$/);   // not exact
    expect(label).not.toMatch(/at least/i);       // not a floor
    expect(label).not.toMatch(/at most/i);        // not a ceiling
  });

  it('NO non-exact state is ever rendered as the bare exact sentence', () => {
    for (const m of STATES.filter((s) => s !== 'exact')) {
      expect({ m, label: labelFor(m) }).not.toEqual({ m, label: '100 Results' });
    }
  });

  it('an unknown/absent meaning falls back to the plain count, as before', () => {
    // Client-side filtering and the pre-server state both leave this null; that path is unchanged.
    const h = boot();
    try {
      h.win.searchResultsState.serverPaged = false;
      h.win.searchResultsState.serverTotal = null;
      h.win.searchResultsState.serverCountMeaning = null;
      h.win.searchResultsState.filteredListings = new Array(7).fill({});
      expect(String(h.win._resultsCountLabel())).toBe('7 Results');
    } finally { h.close(); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the page total
// ─────────────────────────────────────────────────────────────────────────────
describe('B · "Page X of Y" is not stated exactly from an inexact count', () => {
  it('exact renders the plain page total', () => {
    expect(pageTotalFor('exact')).toBe('2');   // 100 / 50
  });

  it.each(['lower_bound', 'upper_bound', 'indeterminate'])('%s does NOT render a bare exact page total', (m) => {
    const shown = pageTotalFor(m);
    expect(shown).toContain('2');       // the known figure is still shown
    expect(shown).not.toBe('2');        // but never as a bare certainty
  });

  it('the direction of the uncertainty is carried, not flattened', () => {
    // A lower-bound total understates the pages; an upper-bound overstates them. Same figure, opposite
    // meaning — so they must not print identically.
    expect(pageTotalFor('lower_bound')).not.toBe(pageTotalFor('upper_bound'));
  });

  it('the current page is untouched — navigation is not what was wrong here', () => {
    const h = boot();
    try {
      h.win.searchResultsState.serverPaged = true;
      h.win.searchResultsState.serverTotal = 100;
      h.win.searchResultsState.serverCountMeaning = 'upper_bound';
      h.win.searchResultsState.currentPage = 3;
      h.win.updateResultsCount();
      expect(h.win.document.getElementById('currentPage')?.textContent).toBe('3');
    } finally { h.close(); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — one helper, and the generated artifact carries it
// ─────────────────────────────────────────────────────────────────────────────
describe('C · interpretation lives in one place, and ships', () => {
  it('the four states are not scattered as string comparisons through the UI', () => {
    const src = read('public/crm/js/search/search-engine.js');
    const code = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    // Exactly one place decides what a meaning means.
    expect(code).toContain('function _countMeaningPresentation');
    const comparisons = (code.match(/serverCountMeaning === '/g) || []).length;
    expect({ comparisons }).toEqual({ comparisons: 0 });
  });

  it('the built artifact carries the same helper — source alone is not what ships', () => {
    expect(read('public/crm/index-built.html')).toContain('function _countMeaningPresentation');
  });

  it('the stale two-state comment in the engine is gone', () => {
    const hydrate = read('lib/search/engine/hydrate.ts');
    // It used to say gate exclusions degrade exact -> lower_bound, which is now the OPPOSITE of the
    // truth. The claim spanned TWO lines, so a single-line pattern passed vacuously — match across.
    expect(hydrate).not.toMatch(/gateExcluded[\s\S]{0,240}from 'exact' to 'lower_bound'/);
    expect(hydrate).toMatch(/upper_bound/);
    expect(hydrate).toMatch(/indeterminate/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — the a82a0841 membership correction is untouched
// ─────────────────────────────────────────────────────────────────────────────
describe('D · core C4B is not reopened by this closure', () => {
  it('the audience gate still runs at universe membership', () => {
    expect(read('lib/search/engine/universe.ts')).toContain('if (!mallanRowPassesGate(');
  });

  it('cache identity still carries audience', () => {
    expect(read('lib/search/engine/executor.ts')).toContain('universeKeyOf(c, audience)');
  });

  it('hydration still applies the same gate as defence in depth', () => {
    expect(read('lib/search/engine/hydrate.ts')).toContain('_providerGate(raw, audience)');
  });
});
