/// <reference types="jest" />
/**
 * ONE HASHCHANGE OWNER. NOT TWO ROUTERS SHARING A BAR.
 *
 * The convergence moves the duplicate shell's 56 routed panels into the canonical CRM. The naive way
 * to do that - load js/dashboard/router.js into the canonical app and call Router.start() - creates a
 * SECOND hashchange listener beside the one the canonical app already has in
 * js/init/init-hash-routing.js. Two independent routers then react to the same hash change:
 *
 *   canonical owns   #main  #results  #detail/<id>  #my  #last  #manage      (no leading slash)
 *   dashboard owns   #/broker/*  #/ops/*  #/settings/*  #/workspace/...      (leading slash)
 *
 * Each router treats the other's hashes as unknown. init-hash-routing's `route` defaults to 'main'
 * for anything it does not recognise, so `#/ops/tasks` would ALSO be handled as "show the search
 * form"; and Router._handleRoute falls back to /ops/dashboard for anything IT does not recognise, so
 * `#results` would ALSO navigate to the ops dashboard. Search state restoration, listing detail,
 * browser back/forward and Manage Listings all sit on that path. Fixing duplication by introducing an
 * interaction bug is the cycle this convergence exists to end.
 *
 * So there is ONE routing authority. It owns the only hashchange listener, and it dispatches on the
 * leading slash: brokerage panels one way, search/listing routes the other. The parameterised route
 * matcher is REUSED from the proven dashboard implementation rather than reimplemented.
 *
 * This suite drives the shipped module. It counts real listener registrations and asserts on which
 * side actually handled each hash - no assertion here is a grep over source text.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

function boot() {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'http://localhost/crm', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;

  // Count every hashchange registration made on window, whoever makes it.
  win.eval(`
    window.__hashListeners = 0;
    var __add = window.addEventListener.bind(window);
    window.addEventListener = function (type) {
      if (type === 'hashchange') window.__hashListeners++;
      return __add.apply(null, arguments);
    };
    window.__searchCalls = [];
    window.__panelCalls = [];
  `);

  win.eval(read('public/crm/js/core/crm-routing.js'));

  win.eval(`
    CrmRouting.registerPanel('/ops/tasks', function () { __panelCalls.push('/ops/tasks'); });
    CrmRouting.registerPanel('/workspace/client/:id/overview', function (p) { __panelCalls.push('client:' + p.id); });
    CrmRouting.registerPanel('/broker/people/agents', function () { __panelCalls.push('/broker/people/agents'); });
    CrmRouting.install({ onSearchRoute: function (h) { __searchCalls.push(h); } });
  `);

  const go = async (hash: string) => {
    win.eval(`window.location.hash = ${JSON.stringify(hash)};`);
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    win, go,
    listeners: () => win.eval('window.__hashListeners') as number,
    searchCalls: () => win.eval('__searchCalls.slice()') as string[],
    panelCalls: () => win.eval('__panelCalls.slice()') as string[],
    close: () => win.close(),
  };
}

describe('there is exactly one hashchange owner', () => {
  it('installing the authority registers a single listener', () => {
    const t = boot();
    expect(t.listeners()).toBe(1);
    t.close();
  });

  it('installing twice does not add a second listener', () => {
    const t = boot();
    t.win.eval('CrmRouting.install({ onSearchRoute: function (h) { __searchCalls.push(h); } });');
    expect(t.listeners()).toBe(1);
    t.close();
  });
});

describe('the authority dispatches each namespace to exactly one side', () => {
  it('a brokerage route reaches the panel router and NOT the search handler', async () => {
    const t = boot();
    await t.go('#/ops/tasks');
    expect(t.panelCalls()).toEqual(['/ops/tasks']);
    expect(t.searchCalls()).toEqual([]);
    t.close();
  });

  it('a search route reaches the search handler and NOT the panel router', async () => {
    const t = boot();
    await t.go('#results');
    expect(t.searchCalls()).toEqual(['results']);
    expect(t.panelCalls()).toEqual([]);
    t.close();
  });

  it('a listing detail route stays with search, id intact', async () => {
    const t = boot();
    await t.go('#detail/RLS20059088');
    expect(t.searchCalls()).toEqual(['detail/RLS20059088']);
    expect(t.panelCalls()).toEqual([]);
    t.close();
  });

  it('every legacy search section stays with search', async () => {
    const t = boot();
    for (const h of ['#main', '#my', '#last', '#manage']) await t.go(h);
    expect(t.searchCalls()).toEqual(['main', 'my', 'last', 'manage']);
    expect(t.panelCalls()).toEqual([]);
    t.close();
  });

  it('a parameterised workspace route resolves its id', async () => {
    const t = boot();
    await t.go('#/workspace/client/C-77/overview');
    expect(t.panelCalls()).toEqual(['client:C-77']);
    expect(t.searchCalls()).toEqual([]);
    t.close();
  });
});

describe('an unknown hash is not silently handed to the wrong namespace', () => {
  it('an unknown brokerage route does not fall through to search', async () => {
    const t = boot();
    await t.go('#/broker/nope');
    expect(t.searchCalls()).toEqual([]);
    t.close();
  });

  it('an unknown bare hash is still search\'s business, not the panel router\'s', async () => {
    const t = boot();
    await t.go('#somethingelse');
    expect(t.panelCalls()).toEqual([]);
    expect(t.searchCalls()).toEqual(['somethingelse']);
    t.close();
  });
});

describe('the shipped search router hands over instead of registering its own listener', () => {
  /** Boot the REAL init-hash-routing beside the authority and count what actually registered. */
  function bootReal(withAuthority: boolean) {
    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on('jsdomError', () => undefined);
    const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
      url: 'http://localhost/crm', runScripts: 'dangerously', virtualConsole,
    });
    const win: any = dom.window;
    win.eval(`
      window.__hashListeners = 0;
      var __add = window.addEventListener.bind(window);
      window.addEventListener = function (type) {
        if (type === 'hashchange') window.__hashListeners++;
        return __add.apply(null, arguments);
      };
      var showSearchSection = function () {};
      var listings = [];
      var MallanAPI = { onReady: function (cb) { cb(); }, idx: { search: function () { return Promise.resolve({ listings: [] }); } } };
    `);
    if (withAuthority) win.eval(read('public/crm/js/core/crm-routing.js'));
    win.eval(read('public/crm/js/init/init-hash-routing.js'));
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
    const n = win.eval('window.__hashListeners') as number;
    win.close();
    return n;
  }

  it('with the authority present, exactly ONE hashchange listener exists in total', () => {
    expect(bootReal(true)).toBe(1);
  });

  it('without it, the search router still works standalone — one listener, not zero', () => {
    expect(bootReal(false)).toBe(1);
  });
});

describe('navigation helpers keep both namespaces addressable', () => {
  it('navigating to a panel route sets a leading-slash hash and runs the panel', async () => {
    const t = boot();
    t.win.eval("CrmRouting.navigate('/broker/people/agents');");
    await new Promise((r) => setTimeout(r, 0));
    expect(t.panelCalls()).toEqual(['/broker/people/agents']);
    expect(t.win.location.hash).toBe('#/broker/people/agents');
    t.close();
  });

  it('back and forward keep working — each hash is handled once by one side', async () => {
    const t = boot();
    await t.go('#results');
    await t.go('#/ops/tasks');
    t.win.history.back();

    // Wait for the navigation to actually be PROCESSED, not for a fixed number of milliseconds.
    // A fixed wait is fine alone and insufficient when ~60 suites compete for CPU - which is exactly
    // the flake this repo just fixed in crm-designation-no-fabrication. Poll, bounded, so a genuinely
    // broken back-navigation still fails fast rather than hanging.
    for (let i = 0; i < 200 && t.searchCalls().length < 2; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(t.searchCalls()).toEqual(['results', 'results']);
    expect(t.panelCalls()).toEqual(['/ops/tasks']);
    t.close();
  });
});
