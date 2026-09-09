/// <reference types="jest" />
/**
 * THE SIX SEARCH ENTRY POINTS MUST ACTUALLY LAND ON THE SEARCH THEY NAME.
 *
 * The CRM's Property Search tab offers six doors - Sale Basic, Sale Advanced, Rental Basic, Rental
 * Advanced, Building, Comparables - and builds each link as `/crm/search?tab=sale-advanced`.
 *
 * `init-hash-routing.js` never reads that parameter. It restores mode/tab/type from `sessionStorage`
 * alone. So every one of the six doors opens the same page in whatever state the operator last left
 * it in: "Sale Advanced Search" and "Rental Basic Search" are the same button. Verified against the
 * shipped file before this suite was written, and against production's served copy.
 *
 * A named entry point is a promise about where you arrive. This suite drives the SHIPPED
 * `init-hash-routing.js` over the SHIPPED search partial and the SHIPPED engine, and asserts on the
 * resulting DOM and on the state the shipped toggles actually recorded. Nothing here greps source text.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Boot the shipped search partial + engine + hash routing at a given URL.
 * `seed` pre-loads sessionStorage the way a previous visit would have.
 */
function boot(url: string, seed?: Record<string, string>) {
  const html = read('public/crm/html/search-form-and-results.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    runScripts: 'dangerously',
    virtualConsole,
  });
  const win: any = dom.window;

  win.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  win.showToast = () => undefined;
  win.scrollTo = () => undefined;
  win.LOGGED_IN_AGENT = { id: 'agent-1' };
  win.listings = [];
  win.searchResultsState = { filteredListings: [], selectedListings: [], perPage: 50, currentPage: 1 };
  win.MallanAPI = {
    idx: { contract: () => Promise.resolve({ members: {}, statusChoices: { sale: [], rental: [] }, executableParams: [] }), search: () => Promise.resolve({ listings: [], total: 0 }) },
    onReady: (cb: () => void) => cb(),
  };
  // section switching lives in nav.js over shell markup the partial does not carry
  const sections: string[] = [];
  win.showSearchSection = (s: string) => { sections.push(s); };

  if (seed) for (const [k, v] of Object.entries(seed)) win.sessionStorage.setItem(k, v);

  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/render/render-dispatcher.js'));
  win.eval(read('public/crm/js/search/search-engine.js'));
  win.eval(read('public/crm/js/init/init-hash-routing.js'));

  // init-hash-routing binds on DOMContentLoaded; jsdom has already fired it by now.
  win.document.dispatchEvent(new win.Event('DOMContentLoaded'));

  const visible = (id: string) => {
    const el = win.document.getElementById(id);
    return !!el && el.style.display !== 'none';
  };
  const stored = (k: string) => win.sessionStorage.getItem(k);
  return { win, visible, stored, sections, close: () => win.close() };
}

const ADVANCED = 'searchAdvancedMode';

describe('a named search entry point lands on the search it names', () => {
  it('?mode=advanced&tab=rent opens the RENTAL ADVANCED search', () => {
    const t = boot('http://localhost/crm/search?mode=advanced&tab=rent#main');
    expect(t.stored('searchMode')).toBe('advanced');
    expect(t.stored('searchTab')).toBe('rent');
    expect(t.visible(ADVANCED)).toBe(true);
    t.close();
  });

  it('?mode=basic&tab=sale opens the SALE BASIC search', () => {
    const t = boot('http://localhost/crm/search?mode=basic&tab=sale#main');
    expect(t.stored('searchMode')).toBe('basic');
    expect(t.stored('searchTab')).toBe('sale');
    expect(t.visible(ADVANCED)).toBe(false);
    t.close();
  });

  it('?tab=building opens the BUILDING search', () => {
    const t = boot('http://localhost/crm/search?tab=building#main');
    expect(t.stored('searchTab')).toBe('building');
    t.close();
  });

  it('?type=comparables opens COMPARABLES, not the general search', () => {
    const t = boot('http://localhost/crm/search?type=comparables#main');
    expect(t.stored('searchType')).toBe('comparables');
    expect(t.visible('comparablesSection')).toBe(true);
    expect(t.visible('generalSearchSection')).toBe(false);
    t.close();
  });

  it('the URL wins over whatever the previous visit left in sessionStorage', () => {
    // Previous visit ended on rental advanced comparables; the link says sale basic general.
    const t = boot('http://localhost/crm/search?mode=basic&tab=sale&type=general#main', {
      searchMode: 'advanced', searchTab: 'rent', searchType: 'comparables',
    });
    expect(t.stored('searchMode')).toBe('basic');
    expect(t.stored('searchTab')).toBe('sale');
    expect(t.stored('searchType')).toBe('general');
    expect(t.visible(ADVANCED)).toBe(false);
    expect(t.visible('generalSearchSection')).toBe(true);
    t.close();
  });

  it('with NO parameters the previous visit is still restored — the fallback is not lost', () => {
    const t = boot('http://localhost/crm/search#main', { searchMode: 'advanced', searchTab: 'rent' });
    expect(t.stored('searchMode')).toBe('advanced');
    expect(t.stored('searchTab')).toBe('rent');
    expect(t.visible(ADVANCED)).toBe(true);
    t.close();
  });

  it('an unrecognised value is ignored rather than obeyed', () => {
    const t = boot('http://localhost/crm/search?mode=turbo&tab=spaceship#main', { searchMode: 'basic', searchTab: 'sale' });
    expect(t.stored('searchMode')).toBe('basic');
    expect(t.stored('searchTab')).toBe('sale');
    t.close();
  });
});
