/// <reference types="jest" />
/**
 * THE LISTING FORMS MUST OPEN FROM WHEREVER THE CRM IS ENTERED.
 *
 * manage-listings.js opened the sale and rental forms with a RELATIVE url:
 *
 *     window.open('SALE-FORM-REDESIGN.html', '_blank')
 *
 * A relative url resolves against the directory of the address currently in the bar, not against the
 * file the server happens to serve. That was survivable only while the canonical CRM was reached at
 * /crm/search, whose directory is /crm/ - so it resolved to /crm/SALE-FORM-REDESIGN.html.
 *
 * Restoring the canonical CRM to /crm (2026-09-09) changes the directory to /, and every one of these
 * would have resolved to /SALE-FORM-REDESIGN.html - a 404. Creating or editing any listing would have
 * opened a blank tab. The rewrite is invisible to the browser: vercel.json maps /crm to
 * /crm/index-built.html without changing the address, so the page cannot infer its own directory.
 *
 * The fix is to stop depending on the entry path at all and use the governed absolute routes that
 * vercel.json already publishes (/crm/sale-listing, /crm/rental-listing).
 *
 * This suite drives the SHIPPED manageCreateListing / manageEditListing in a real DOM, at BOTH entry
 * paths, and asserts on the url the browser was actually asked to open.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Boot manage-listings.js at a given entry url and capture every window.open target, resolved. */
function boot(entryUrl: string) {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body></body></html>', {
    url: entryUrl,
    runScripts: 'dangerously',
    virtualConsole,
  });
  const win: any = dom.window;
  const opened: string[] = [];

  win.eval('var MallanAPI = { listings: { list: function () { return Promise.resolve({ listings: [] }); } }, _fetch: function () { return Promise.resolve({}); }, onReady: function (cb) { cb(); } };');
  win.eval('var showToast = function () {}; var Utils = { esc: function (s) { return String(s == null ? "" : s); } };');
  win.eval(read('public/crm/js/manage/manage-listings.js'));

  // Capture AFTER the module loads so we replace the real opener, and resolve exactly as a browser would.
  win.open = (url: string) => { opened.push(new win.URL(url, win.location.href).pathname + (new win.URL(url, win.location.href).search || '')); return null; };

  return { win, opened, close: () => win.close() };
}

/** The two entry paths the CRM is reachable at. Both must behave identically. */
const ENTRIES = [
  ['the restored front door', 'http://localhost/crm'],
  ['the legacy search path', 'http://localhost/crm/search'],
] as const;

describe('creating a listing opens a real form from every entry path', () => {
  for (const [label, url] of ENTRIES) {
    it(`sale form resolves under /crm/ when entered at ${label}`, () => {
      const t = boot(url);
      t.win.eval("currentManageMode = 'sales'; manageCreateListing();");
      expect(t.opened).toHaveLength(1);
      expect(t.opened[0].startsWith('/crm/')).toBe(true);
      expect(t.opened[0]).not.toBe('/SALE-FORM-REDESIGN.html');
      t.close();
    });

    it(`rental form resolves under /crm/ when entered at ${label}`, () => {
      const t = boot(url);
      t.win.eval("currentManageMode = 'rentals'; manageCreateListing();");
      expect(t.opened).toHaveLength(1);
      expect(t.opened[0].startsWith('/crm/')).toBe(true);
      expect(t.opened[0]).not.toBe('/RENTAL-FORM-REDESIGN.html');
      t.close();
    });
  }

  it('sale and rental stay separate destinations, never one shared form', () => {
    const a = boot('http://localhost/crm');
    a.win.eval("currentManageMode = 'sales'; manageCreateListing();");
    const b = boot('http://localhost/crm');
    b.win.eval("currentManageMode = 'rentals'; manageCreateListing();");
    expect(a.opened[0]).not.toBe(b.opened[0]);
    a.close(); b.close();
  });
});

describe('editing a listing carries its id to the right form', () => {
  it('a sale listing opens the sale form with its id, resolved under /crm/', () => {
    const t = boot('http://localhost/crm');
    t.win.eval("myManagementListings = [{ id: 7, _dbId: 'SL-42', category: 'sales' }]; manageEditListing(7);");
    expect(t.opened).toHaveLength(1);
    expect(t.opened[0].startsWith('/crm/')).toBe(true);
    expect(t.opened[0]).toContain('id=SL-42');
    t.close();
  });

  it('a rental listing opens the rental form with its id, resolved under /crm/', () => {
    const t = boot('http://localhost/crm');
    t.win.eval("myManagementListings = [{ id: 8, _dbId: 'RL-99', category: 'rentals' }]; manageEditListing(8);");
    expect(t.opened).toHaveLength(1);
    expect(t.opened[0].startsWith('/crm/')).toBe(true);
    expect(t.opened[0]).toContain('id=RL-99');
    t.close();
  });
});
