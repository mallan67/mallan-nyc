/// <reference types="jest" />
/**
 * ORPHAN CLIENT RETIREMENT PACKET A — BEHAVIOURAL PROOF.
 *
 * The companion file (crm-search-client-orphan-retirement.test.ts) proves the subsystem is GONE by
 * reading source, CSS and the built artifact. Absence is easy to prove and easy to over-prove: a
 * source census cannot tell the difference between deleting a dead subsystem and deleting a live one.
 * This file boots the shipped bundle and proves the application still WORKS without it.
 *
 * Project rule §F: source-grep verification alone is never sufficient for a rendering or behaviour
 * claim. Nine functions, one module, seven HTML fragments, five render call sites and four CSS rules
 * were removed from a running application; "the tests still pass" is worth very little if nothing
 * actually executed the page afterwards.
 *
 * BOOTED WITH THE CRM UNAVAILABLE, which is the architecturally load-bearing condition: Backend Search
 * must boot, authenticate and execute with the brokerage CRM absent (Master Plan §5.1, mirrored in
 * CLAUDE.md §A.0). The retired subsystem was the one place Search kept its own Client state, so its
 * removal is exactly where a hidden CRM dependency would surface.
 *
 * Only /api/auth/me and /api/crm/clients are served — an authenticated session and the canonical client
 * population, nothing else. Every other request is recorded and denied, so a regression that reintroduces
 * the Lead-route population cannot pass by accident: it would have to ask, and asking is what test 10
 * fails on. The auth stub is load-bearing rather than incidental — _loadClients() is registered through
 * MallanAPI.onReady, whose callbacks fire only when init() sees `authenticated: true`, so an
 * unauthenticated boot would make every picker assertion below vacuously true.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** The canonical population the server would return, shaped like /api/crm/clients. */
const CLIENTS = [
  { id: 'c1', first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com', client_type: 'buyer', agent_id: 'agent-1' },
  { id: 'c2', first_name: 'Sam', last_name: 'Renter', email: 'sam@example.com', client_type: 'renter', agent_id: 'agent-2' },
  { id: 'c3', first_name: 'Dana', last_name: 'Seller', email: 'dana@example.com', client_type: 'seller', agent_id: 'agent-1' },
];

// Identifiers that must no longer resolve to anything in a booted page.
const RETIRED_GLOBALS = [
  'getMyClients',
  'renderClientGrid',
  'populateClientSelect',
  'filterClientList',
  'sortClientColumn',
  'openClientWorkspace',
  'openWorkWithSelected',
  'saveSelectedToClient',
  'populateClientList',
  'buildClientListHTML',
  'toggleWorkWithCustomer',
  'markClientFeedback',
  'getClientFeedbackStatus',
  'clientFeedbackIcons',
];

describe('Backend Search boots and works after the Client subsystem was retired', () => {
  jest.setTimeout(300_000);

  const booted = (() => {
    const html = read('public/crm/index-built.html');
    const requested: string[] = [];
    const pageErrors: string[] = [];

    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on('jsdomError', (e: Error) => pageErrors.push(String(e && e.message)));

    class DenyAll extends jsdom.ResourceLoader {
      fetch(url: string) {
        requested.push(url);
        return Promise.reject(new Error(`410 GONE (denied by test): ${url}`));
      }
    }

    const dom = new jsdom.JSDOM(html, {
      url: 'https://mallan.nyc/crm/search',
      runScripts: 'dangerously',
      resources: new DenyAll(),
      pretendToBeVisual: true,
      virtualConsole,
    });

    const win: any = dom.window;
    win.scrollTo = () => undefined;
    // hasToken checks for this before init() will run.
    try { win.document.cookie = 'session_token=test-session'; } catch { /* jsdom may refuse; init still runs */ }

    // Serve ONLY the canonical client route. Everything else is recorded and refused.
    win.fetch = (u: any, init?: any) => {
      const url = String((u && u.url) || u);
      requested.push(url);
      const json = (body: unknown) =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(JSON.stringify(body)),
        });
      // An AUTHENTICATED session. MallanAPI.init() sets _ready from `authenticated === true`, and
      // onReady callbacks fire only on that path — _loadClients() is registered through onReady, so an
      // unauthenticated boot never requests the client population at all. Serving this is what makes the
      // picker assertions meaningful rather than vacuous.
      if (url.includes('/api/auth/me')) {
        return json({
          authenticated: true,
          principalType: 'agent',
          role: 'BROKER',
          portalRole: null,
          user: { id: 'agent-1', email: 'maya@mallan.nyc', first_name: 'Maya', last_name: 'Allan', role: 'BROKER' },
        });
      }
      if (url.includes('/api/crm/clients')) {
        return json({ clients: CLIENTS, total: CLIENTS.length, limit: 200, offset: 0 });
      }
      return Promise.reject(new Error('network down (denied by test): ' + url));
    };

    const ready = new Promise<void>((resolve) => {
      if (win.document.readyState === 'complete') { resolve(); return; }
      win.addEventListener('load', () => resolve());
      setTimeout(() => resolve(), 60_000);
    });

    return { dom, win, requested, pageErrors, ready };
  })();

  beforeAll(async () => {
    await booted.ready;
    // The client load is kicked off via MallanAPI.onReady; give the microtask chain room to settle.
    await new Promise((r) => setTimeout(r, 1500));
  });

  afterAll(() => { try { booted.dom.window.close(); } catch { /* nothing to clean up */ } });

  // ── H1 + H2 ────────────────────────────────────────────────────────────────
  it('1 · Search loads with the CRM unavailable', () => {
    expect(booted.win.document.readyState).toBe('complete');
    expect(booted.win.document.querySelectorAll('script').length).toBeGreaterThan(10);
  });

  it('2 · Search executes — its own globals came up', () => {
    const w = booted.win;
    expect({
      MallanAPI: typeof w.MallanAPI,
      searchResultsState: typeof w.searchResultsState,
      listAll: typeof (w.MallanAPI && w.MallanAPI.clients && w.MallanAPI.clients.listAll),
    }).toEqual({ MallanAPI: 'object', searchResultsState: 'object', listAll: 'function' });
  });

  // ── H9: the removals left no hole ──────────────────────────────────────────
  it('9a · every retired identifier is genuinely undefined in the booted page', () => {
    const w = booted.win;
    const stillDefined = RETIRED_GLOBALS.filter((g) => typeof w[g] !== 'undefined');
    expect({ stillDefined }).toEqual({ stillDefined: [] });
  });

  it('9b · nothing threw about a missing retired function while booting', () => {
    // The real risk of this packet: a live render path calling a function that no longer exists.
    // clientFeedbackIcons had FIVE call sites, four of them unguarded template interpolations.
    const relevant = booted.pageErrors.filter((e) =>
      RETIRED_GLOBALS.some((g) => e.includes(g)) || /is not defined|is not a function/.test(e)
    );
    expect({ relevant }).toEqual({ relevant: [] });
  });

  // ── H10 + the canonical population ─────────────────────────────────────────
  it('10 · the page asked /api/crm/clients and never /api/crm/leads', () => {
    const clients = booted.requested.filter((u) => u.includes('/api/crm/clients'));
    const leads = booted.requested.filter((u) => u.includes('/api/crm/leads'));
    expect({ askedClients: clients.length > 0, askedLeads: leads }).toEqual({ askedClients: true, askedLeads: [] });
  });

  it('3-6a · the canonical population actually reached the browser store', () => {
    // customerDB survives the deletion because data-loader.js declares AND fills it; the retired module
    // only re-declared it. Every live picker reads from this same population.
    const db = booted.win.customerDB;
    expect(typeof db).toBe('object');
    expect(Object.keys(db).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('3-6b · the loader every picker uses still returns the full population in the booted page', async () => {
    // The showing picker, the portal-send picker and the Saved Search picker all call exactly this.
    const rows = await booted.win.MallanAPI.clients.listAll();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((r: any) => r.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  // ── H6 behaviourally ───────────────────────────────────────────────────────
  it('6 · the report/email recipient dropdown still populates from that population', () => {
    const w = booted.win;
    expect(typeof w.populateReportRecipientDropdown).toBe('function');
    let sel = w.document.getElementById('reportRecipientClient');
    if (!sel) {
      sel = w.document.createElement('select');
      sel.id = 'reportRecipientClient';
      w.document.body.appendChild(sel);
    }
    w.populateReportRecipientDropdown();
    const labels = Array.from(sel.options).map((o: any) => o.textContent);
    // One placeholder plus the three clients, each rendered with the email the picker needs.
    expect(labels.length).toBe(4);
    expect(labels.join(' | ')).toContain('jane@example.com');
    expect(labels.join(' | ')).toContain('dana@example.com');
  });

  // ── H7 ─────────────────────────────────────────────────────────────────────
  it('7 · the Email control still routes into the canonical reports modal', () => {
    const w = booted.win;
    expect(typeof w.emailListingSheet).toBe('function');
    expect(typeof w.openReportsModal).toBe('function');

    const calls: any[] = [];
    const realOpen = w.openReportsModal;
    w.openReportsModal = (ids: unknown, preset: unknown) => { calls.push({ ids, preset }); };
    w.searchResultsState.selectedListings = [101, 102];
    try {
      w.emailListingSheet();
    } finally {
      w.openReportsModal = realOpen;
    }
    // Proves delegation behaviourally, not by reading the source for a call it might never reach.
    expect(calls).toEqual([{ ids: [101, 102], preset: 'email' }]);
  });

  // ── H8 ─────────────────────────────────────────────────────────────────────
  it('8 · the Work With control is ABSENT, not merely inert', () => {
    const w = booted.win;
    const byHandler = w.document.querySelectorAll('[onclick*="openWorkWithSelected"]');
    const dropdowns = w.document.querySelectorAll('[id^="workWithCustomerDropdown"]');
    const labelled = Array.from(w.document.querySelectorAll('button')).filter((b: any) =>
      (b.textContent || '').trim().toLowerCase() === 'work with'
    );
    // A disabled-but-present control would still read as a promised workflow. It is gone.
    expect({ byHandler: byHandler.length, dropdowns: dropdowns.length, labelled: labelled.length })
      .toEqual({ byHandler: 0, dropdowns: 0, labelled: 0 });
  });

  it('8b · the retired Client screens left no DOM behind either', () => {
    const w = booted.win;
    const ids = ['section-client', 'clientTableBody', 'clientDirectorySearch', 'clientCardGrid', 'clientSelect', 'clientList', 'clientList2'];
    const present = ids.filter((id) => w.document.getElementById(id) !== null);
    expect({ present }).toEqual({ present: [] });
  });

  // ── the surviving selection toolbar still functions ────────────────────────
  it('the selection toolbar survivors still work — the packet removed one control, not the toolbar', () => {
    const w = booted.win;
    expect({
      toggleListingSelection: typeof w.toggleListingSelection,
      toggleSelectAll: typeof w.toggleSelectAll,
      updateSelectionActionBar: typeof w.updateSelectionActionBar,
      removeFromResults: typeof w.removeFromResults,
      printListingSheet: typeof w.printListingSheet,
    }).toEqual({
      toggleListingSelection: 'function',
      toggleSelectAll: 'function',
      updateSelectionActionBar: 'function',
      removeFromResults: 'function',
      printListingSheet: 'function',
    });
  });
});
