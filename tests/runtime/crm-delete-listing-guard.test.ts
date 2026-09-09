/// <reference types="jest" />
/**
 * ONLY A MALLAN-AUTHORED LISTING MAY BE WITHDRAWN FROM THE CRM.
 *
 * A row that came from the licensed Cotality feed is not Mallan's to remove: withdrawing it here
 * would assert a status change Mallan has no authority to make. The backend enforces this (409,
 * "Only CRM-created listings can be withdrawn from this dashboard") and the UI must not offer the
 * control in the first place.
 *
 * ── WHY THIS FILE CHANGED, 2026-09-09 ──────────────────────────────────────────────────────────
 *
 * Its two frontend assertions were source-greps over public/crm/js/dashboard/panels.js, looking for
 * `!l.mls_id ... fa-trash`. That markup lived in the DUPLICATE My Listings implementation, which was
 * deleted in da8e3046 when the CRM converged on one listing manager. The greps then matched nothing
 * and the suite went red - correctly, because deleting the duplicate had also taken the withdraw
 * control with it. The canonical manager (js/manage/manage-listings.js) had no withdraw capability
 * at all, and its listing model did not even carry mls_id, so the guard could not be evaluated.
 *
 * The capability is restored on the canonical manager and the assertions are now BEHAVIOURAL: they
 * drive the shipped predicate and the shipped withdraw function and assert on what happens. The
 * backend assertions are unchanged - they were passing and they are the real enforcement.
 */
export {};
import { readFileSync } from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = path.resolve(__dirname, '../..');
const ROUTE_PATH = path.resolve(ROOT, 'app/api/crm/listings/[id]/route.ts');
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

/** Boot the shipped canonical listing manager with one listing on the board. */
function boot(listing: Record<string, unknown>, opts: { removeResult?: 'ok' | 'refused' } = {}) {
  const { removeResult = 'ok' } = opts;
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="section-manage"></div></body></html>', {
    url: 'http://localhost/crm', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  const removed: string[] = [];
  const toasts: { msg: string; kind: string }[] = [];
  win.__removed = removed;
  win.__toasts = toasts;
  win.__removeResult = removeResult;
  win.confirm = () => true;

  win.eval(`
    var Utils = { esc: function (s) { return String(s == null ? '' : s); } };
    var MallanAPI = {
      listings: {
        list: function () { return Promise.resolve({ listings: [] }); },
        remove: function (id) {
          __removed.push(String(id));
          return __removeResult === 'ok'
            ? Promise.resolve({ ok: true })
            : Promise.reject(Object.assign(new Error('Only CRM-created listings can be withdrawn from this dashboard.'), { status: 409 }));
        },
      },
      _fetch: function () { return Promise.resolve({}); },
      onReady: function (cb) { cb(); },
    };
  `);
  win.eval(readFileSync(path.resolve(ROOT, 'public/crm/js/manage/manage-listings.js'), 'utf8'));
  win.eval(`
    manageShowToast = function (m, k) { __toasts.push({ msg: String(m), kind: k || 'info' }); };
    showToast = manageShowToast;
    renderManageSection = function () {};
    myManagementListings = [${JSON.stringify(listing)}];
  `);
  return {
    win, removed, toasts,
    canWithdraw: () => win.eval('manageCanWithdraw(myManagementListings[0])') as boolean,
    withdraw: async (id: string) => {
      win.eval(`manageWithdrawListing('${id}')`);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    },
    close: () => win.close(),
  };
}

const MALLAN_LISTING = { id: 'SL-42', _dbId: 'SL-42', category: 'sales', address: '400 E 90th St', unit: '17C', mlsId: null, status: 'Active' };
const FEED_LISTING = { id: 'RLS20059088', _dbId: 991, category: 'sales', address: '212 E 47th St', unit: '9F', mlsId: 'RLS20059088', status: 'Active' };

describe('DELETE listing guard — CRM-created only', () => {
  test('backend blocks DELETE for listings with mls_id', () => {
    expect(routeSource).toMatch(/if\s*\(listing\.mls_id\)/);
    expect(routeSource).toMatch(/Only CRM-created listings can be withdrawn/);
    expect(routeSource).toMatch(/status:\s*409/);
  });

  test('backend sets status to Withdrawn on success', () => {
    expect(routeSource).toMatch(/status:\s*"Withdrawn"/);
  });

  test('GET endpoint returns mls_id for frontend filtering', () => {
    const getRoute = readFileSync(path.resolve(ROOT, 'app/api/crm/listings/route.ts'), 'utf-8');
    expect(getRoute).toMatch(/mls_id:\s*true/);
  });
});

describe('the canonical manager offers withdraw only on a Mallan-authored listing', () => {
  test('a feed-sourced listing cannot be withdrawn', () => {
    const t = boot(FEED_LISTING);
    expect(t.canWithdraw()).toBe(false);
    t.close();
  });

  test('a Mallan-authored listing can be', () => {
    const t = boot(MALLAN_LISTING);
    expect(t.canWithdraw()).toBe(true);
    t.close();
  });

  test('the normaliser carries the provider id through, so the guard can be evaluated at all', () => {
    // The guard is only as good as the data behind it. Drive the SHIPPED mapper with an API row and
    // assert on what it produced - if mls_id is dropped here, every feed row looks Mallan-authored.
    const t = boot(MALLAN_LISTING);
    const feed = t.win.eval("JSON.stringify(_mapApiListingToManage({ id: 991, listing_id: 'RLS20059088', mls_id: 'RLS20059088', listing_type: 'sale', status: 'Active' }))");
    const mallan = t.win.eval("JSON.stringify(_mapApiListingToManage({ id: 'SL-42', listing_id: 'SL-42', mls_id: null, listing_type: 'sale', status: 'Active' }))");
    t.close();
    expect(JSON.parse(feed).mlsId).toBe('RLS20059088');
    expect(JSON.parse(mallan).mlsId).toBeNull();
  });
});

describe('withdrawing is honest about what the server did', () => {
  test('a Mallan listing is sent to the withdraw endpoint', async () => {
    const t = boot(MALLAN_LISTING);
    await t.withdraw('SL-42');
    expect(t.removed).toEqual(['SL-42']);
    t.close();
  });

  test('a feed-sourced listing is never sent, even if the function is called directly', async () => {
    const t = boot(FEED_LISTING);
    await t.withdraw('RLS20059088');
    expect(t.removed).toEqual([]);
    expect(t.toasts.some((x) => /cotality|feed|not.*mallan|cannot/i.test(x.msg))).toBe(true);
    t.close();
  });

  test('a server refusal is reported as a refusal, never as a withdrawal', async () => {
    const t = boot(MALLAN_LISTING, { removeResult: 'refused' });
    await t.withdraw('SL-42');
    expect(t.toasts.some((x) => /\bwithdrawn\b/i.test(x.msg) && !/not/i.test(x.msg))).toBe(false);
    expect(t.toasts.some((x) => x.kind === 'error')).toBe(true);
    t.close();
  });
});
