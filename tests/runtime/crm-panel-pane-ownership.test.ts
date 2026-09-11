/// <reference types="jest" />
/**
 * A PANEL MUST NEVER PAINT OVER THE PANEL THAT REPLACED IT.
 *
 * Observed on production 2026-09-09 (Maya, screenshot of mallan.nyc/crm/dashboard#/ops/search): the
 * Property Search tab showed the Ops Dashboard body - "Seller / Buyer", "Landlord / Tenant",
 * "Unassigned Leads" - under a "Property Search" title. Property Search was not broken. It had been
 * PAINTED OVER.
 *
 * Mechanism, reproduced in a real browser before this file was written: `HomeScreen.render()` captures
 * the content pane, issues eight API calls, and writes `_renderCards(c, ...)` when they all resolve
 * (~2s on production). It never re-checks that the route still belongs to it. Every panel that paints
 * synchronously - Property Search does - therefore loses to any slower panel the operator visited first.
 * Production's home-screen.js was fetched and is byte-identical to the checkout under test.
 *
 * The fix is at the router, not in forty panels: navigating RETIRES the content pane and installs a
 * fresh one carrying the same id and layout classes. A late writer then holds a detached node and its
 * write goes nowhere visible.
 *
 * This suite drives the SHIPPED `router.js` and the SHIPPED `home-screen.js` in a real DOM. No assertion
 * here is a grep over source text.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

const STUBS = [
  "var LOGGED_IN_AGENT = { id: 1, role: 'broker' };",
  'var __titles = [];',
  "var Utils = { esc: function (s) { return String(s == null ? '' : s); }, formatMoney: function (n) { return '$' + (n || 0); } };",
  "var UI = { loading: function () { return '<div class=\"loading\">Loading</div>'; } };",
  'var Store = {',
  '  _route: null,',
  '  setRoute: function (p) { this._route = p; },',
  '  isBroker: function () { return true; },',
  '  isImpersonating: function () { return false; },',
  '  getCached: function () { return null; }',
  '};',
  'var Permissions = { canSeeBrokerConsole: function () { return true; } };',
  'var CRM = {',
  "  getContent: function () { return document.getElementById('content'); },",
  '  setPanelTitle: function (t) { __titles.push(t); },',
  '  toast: function () {}',
  '};',
  'var __pendingHomeFetches = [];',
  'var MallanAPI = {',
  '  _fetch: function () { return new Promise(function (res) { __pendingHomeFetches.push(function () { res({}); }); }); },',
  '  deals: { list: function () { return new Promise(function (res) { __pendingHomeFetches.push(function () { res({ deals: [] }); }); }); } }',
  '};',
].join('\n');

const ROUTES = [
  "Router.register('/ops/dashboard', function () { HomeScreen.render(); });",
  "Router.register('/ops/search', function () {",
  "  CRM.setPanelTitle('Property Search');",
  "  CRM.getContent().innerHTML = '<div id=\"searchLauncher\">Sale Basic Search</div>';",
  '});',
  'Router.init();',
].join('\n');

/** Boot the shipped router + the shipped HomeScreen over a real #content pane. */
function boot() {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(
    '<!doctype html><html><body><div id="content" class="flex-1 overflow-y-auto p-4"></div><div id="toasts"></div></body></html>',
    { url: 'http://localhost/crm/dashboard.html', runScripts: 'dangerously', virtualConsole },
  );
  const w: any = dom.window;

  w.eval(STUBS);
  w.eval(read('public/crm/js/dashboard/router.js'));
  w.eval(read('public/crm/js/dashboard/panels/home/home-screen.js'));
  w.eval(ROUTES);

  const pane = () => w.document.getElementById('content');
  const paneText = () => (pane()?.textContent || '').trim();
  const lastTitle = () => {
    const t = w.eval('__titles.slice()') as string[];
    return t[t.length - 1];
  };
  /** Let the eight dashboard calls come back, then drain the Promise.all continuation. */
  const settleHomeScreen = async () => {
    w.eval('__pendingHomeFetches.splice(0).forEach(function (f) { f(); })');
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  const go = async (path: string) => {
    w.eval("Router.navigate('" + path + "')");
    await new Promise((r) => setTimeout(r, 0));
  };
  return { w, pane, paneText, lastTitle, settleHomeScreen, go };
}

const DASHBOARD_CARDS = /Seller \/ Buyer|Landlord \/ Tenant|Unassigned Leads/;

describe('the Ops Dashboard cannot paint over Property Search', () => {
  it('reproduces the production symptom: navigate away, then let the dashboard reply land', async () => {
    const t = boot();

    await t.go('/ops/dashboard');
    expect(t.paneText()).toContain('Loading');

    // Operator clicks Property Search while the dashboard's eight calls are still in flight.
    await t.go('/ops/search');
    expect(t.paneText()).toContain('Sale Basic Search');
    expect(t.lastTitle()).toBe('Property Search');

    // The dashboard's calls now come back.
    await t.settleHomeScreen();

    // THE ASSERTION THAT FAILED BEFORE THE FIX.
    expect(t.paneText()).toContain('Sale Basic Search');
    expect(t.paneText()).not.toMatch(DASHBOARD_CARDS);
  });

  it('the router retires the pane on navigation, so a stale reference cannot reach the screen', async () => {
    const t = boot();
    await t.go('/ops/dashboard');
    const stale = t.pane();

    await t.go('/ops/search');
    const live = t.pane();

    expect(live).not.toBe(stale);
    expect(stale.isConnected).toBe(false);
    // the replacement is invisible to the operator: same id, same layout classes
    expect(live.id).toBe('content');
    expect(live.className).toBe(stale.className);
  });

  it('a panel that is still the current route is NOT retired mid-render', async () => {
    const t = boot();
    await t.go('/ops/dashboard');
    const pane = t.pane();
    await t.settleHomeScreen();

    expect(t.pane()).toBe(pane);
    expect(t.paneText()).toMatch(DASHBOARD_CARDS);
  });
});
