/// <reference types="jest" />
/**
 * RESIDUAL RETIREMENT 1A — THREE PROVEN ORPHANS ARE GONE, AND THE APPLICATION STILL WORKS.
 *
 * Retired:
 *   public/crm/js/output/report-package.js      1,050 lines — buildSearchReportPackage, zero callers
 *   public/crm/js/output/client-feedback.js       138 lines — a feedback subsystem whose modals were
 *                                                             already deleted in an earlier packet
 *   public/crm/html/modals/add-edit-client.html   282 lines — addClientModal markup, 36 DOM ids, none live
 *
 * WHY THIS FILE EXISTS AT ALL. Absence is easy to prove and easy to OVER-prove: a source census cannot
 * distinguish deleting a dead subsystem from deleting a live one. Project §F — source-grep alone is never
 * sufficient for a behaviour claim. So the second half of this file boots the shipped bundle and proves the
 * canonical report and client paths still work with the three files gone.
 *
 * THE STRONGEST EVIDENCE IS THE BUILD ITSELF. build.js has no glob and no readdir: it reads index.html and
 * resolves only `<!-- @include path -->` and `<script src="js/...">`. Nothing else can enter the bundle.
 * Running crm:build after the deletion produced a BYTE-IDENTICAL index-built.html — the artifact cannot
 * tell the three files ever existed, because they were never in it.
 *
 * THE ONE LIVE MENTION, and why it stays. search-actions.js:81 carries a defensive Escape-key guard:
 *
 *     if (typeof closeAddClientModal === 'function') closeAddClientModal();
 *
 * `closeAddClientModal` is defined NOWHERE in the repository and was undefined before this packet too — the
 * retired HTML was markup only. So the guard was already inert, its deadness is not caused by this deletion,
 * and removing it would be an unrelated edit to a live file. It is proven harmless below instead: Escape is
 * actually pressed in the booted page.
 *
 * NOT TOUCHED HERE: the dormant fallback branches in js/compliance/compliance-gates-and-output.js
 * (Retirement 1B), and the stale pagination.js comment. Both remain registered.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const abs = (rel: string) => resolve(ROOT, rel);

/* eslint-disable @typescript-eslint/no-explicit-any */

const RETIRED_FILES = [
  'public/crm/js/output/report-package.js',
  'public/crm/js/output/client-feedback.js',
  'public/crm/html/modals/add-edit-client.html',
];

/** Deleted by the EARLIER client-retirement packet; they must not come back either. */
const PREVIOUSLY_RETIRED_FILES = [
  'public/crm/html/modals/client-feedback.html',
  'public/crm/html/modals/client-delivery.html',
  'public/crm/html/modals/client-report-view.html',
];

/** Live includes that this packet must NOT have disturbed. */
const PROTECTED_LIVE_FILES = [
  'public/crm/html/modals/save-search.html',
  'public/crm/html/modals/report-preview.html',
  'public/crm/html/modals/grid-layouts.html',
  'public/crm/html/modals/filter.html',
  'public/crm/html/modals/reports.html',
];

/** Entry symbols of the retired subsystem. None may resolve in a booted page. */
const RETIRED_GLOBALS = [
  'buildSearchReportPackage',
  'openClientFeedbackReplyModal',
  'closeClientFeedbackReplyModal',
  'openClientReportViewModal',
  'closeClientReportViewModal',
  'togglePassedProperties',
  'setClientFeedback',
  'submitClientFeedback',
  'openAddEditClientModal',
  'closeAddClientModal',
  'saveNewClient',
];

/** DOM ids that existed only inside the retired modal. */
const RETIRED_DOM_IDS = [
  'addClientModal', 'addClientModalTitle', 'editClientId', 'saveClientBtn',
  'newClientName', 'newClientEmail', 'newClientMustHaves', 'coViewersList',
];

const CLIENTS = [
  { id: 'c1', first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com', client_type: 'buyer', agent_id: 'agent-1' },
  { id: 'c2', first_name: 'Sam', last_name: 'Renter', email: 'sam@example.com', client_type: 'renter', agent_id: 'agent-2' },
];

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — absence, in the source tree and in the build graph
// ═════════════════════════════════════════════════════════════════════════════
describe('1 · the three orphans are gone, and nothing in the build graph wants them', () => {
  it('the retired files do not exist', () => {
    for (const f of RETIRED_FILES) expect({ f, exists: existsSync(abs(f)) }).toEqual({ f, exists: false });
  });

  it('the previously retired client modals are still absent — not recreated', () => {
    for (const f of PREVIOUSLY_RETIRED_FILES) expect({ f, exists: existsSync(abs(f)) }).toEqual({ f, exists: false });
  });

  it('the live modal includes this packet protects are all still present', () => {
    for (const f of PROTECTED_LIVE_FILES) expect({ f, exists: existsSync(abs(f)) }).toEqual({ f, exists: true });
  });

  it('no HTML host references them — index.html or any other entry point', () => {
    const hosts = ['index.html', 'dashboard.html', 'dev.html', 'login.html',
      'BUYER-DEAL-FORM.html', 'TENANT-DEAL-FORM.html', 'SALE-FORM-REDESIGN.html', 'RENTAL-FORM-REDESIGN.html'];
    const offenders: string[] = [];
    for (const h of hosts) {
      const src = read('public/crm/' + h);
      for (const name of ['report-package', 'client-feedback', 'add-edit-client']) {
        if (src.includes(name)) offenders.push(h + ' -> ' + name);
      }
    }
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('crm:build CAN succeed — every include target index.html names still resolves on disk', () => {
    // build.js has no glob and no readdir; it reads index.html and resolves `<!-- @include path -->` plus
    // `<script src="...">`. A missing target would throw at build time, so a complete graph is the
    // buildability proof. (crm-build-drift.test.ts separately proves the artifact matches byte for byte.)
    const index = read('public/crm/index.html');
    const targets = [
      ...Array.from(index.matchAll(/<!-- @include ([^\s]+) -->/g)).map((m) => m[1]),
      ...Array.from(index.matchAll(/<script src="((?:js|tests)\/[^"]+)"/g)).map((m) => m[1]),
      ...Array.from(index.matchAll(/<link[^>]+href="(css\/[^"]+)"/g)).map((m) => m[1]),
    ];
    expect(targets.length).toBeGreaterThan(50);            // the graph is real, not an empty match
    const missing = targets.filter((t) => !existsSync(abs('public/crm/' + t)));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('the built artifact carries no marker from any retired file', () => {
    const built = read('public/crm/index-built.html');
    // closeAddClientModal is excluded here and pinned separately below: it legitimately reaches the bundle
    // through the inlined Escape guard, and lumping it in would force this assertion to be weakened rather
    // than made precise.
    const found = [...RETIRED_GLOBALS.filter((s) => s !== 'closeAddClientModal'),
      ...RETIRED_DOM_IDS, 'clientFeedbackResponses'].filter((s) => built.includes(s));
    expect({ found }).toEqual({ found: [] });
  });

  it('closeAddClientModal survives in the bundle ONLY inside the defensive guard', () => {
    const built = read('public/crm/index-built.html');
    const occurrences = built.split('closeAddClientModal').length - 1;
    // Two: the typeof test and the guarded call, both on the one line.
    expect(occurrences).toBe(2);
    expect(built).toContain("if (typeof closeAddClientModal === 'function') closeAddClientModal();");
  });

  it('no live runtime file still calls the retired subsystem', () => {
    // Enumerated from disk rather than hard-coded: a stale list silently skips files, and this repo has
    // already deleted whole modules (client-database.js went with cb6693a3).
    const ALLOWED = "if (typeof closeAddClientModal === 'function') closeAddClientModal();";
    const walk = (dir: string): string[] => readdirSync(abs(dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(dir + '/' + e.name)
        : /\.(js|html)$/.test(e.name) ? [dir + '/' + e.name] : []));
    const files = [...walk('public/crm/js'), ...walk('public/crm/html')];
    expect(files.length).toBeGreaterThan(40);              // the walk really found the tree
    const offenders: string[] = [];
    for (const f of files) {
      read(f).split('\n').forEach((line, i) => {
        if (line.includes(ALLOWED)) return;
        for (const s of RETIRED_GLOBALS) if (line.includes(s)) offenders.push(f + ':' + (i + 1) + ' ' + s);
      });
    }
    expect({ offenders }).toEqual({ offenders: [] });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 — the shipped bundle still boots and still works
// ═════════════════════════════════════════════════════════════════════════════
describe('2 · Backend Search still boots, and the canonical report/client paths still work', () => {
  jest.setTimeout(300_000);

  const booted = (() => {
    const html = read('public/crm/index-built.html');
    const requested: string[] = [];
    const pageErrors: string[] = [];
    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on('jsdomError', (e: Error) => pageErrors.push(String(e && e.message)));

    class DenyAll extends jsdom.ResourceLoader {
      fetch(url: string) { requested.push(url); return Promise.reject(new Error('410 GONE (denied by test): ' + url)); }
    }

    const dom = new jsdom.JSDOM(html, {
      url: 'https://mallan.nyc/crm/search', runScripts: 'dangerously',
      resources: new DenyAll(), pretendToBeVisual: true, virtualConsole,
    });
    const win: any = dom.window;
    win.scrollTo = () => undefined;
    try { win.document.cookie = 'session_token=test-session'; } catch { /* init still runs */ }

    win.fetch = (u: any) => {
      const url = String((u && u.url) || u);
      requested.push(url);
      const json = (body: unknown) => Promise.resolve({
        ok: true, status: 200, headers: { get: () => 'application/json' },
        json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)),
      });
      if (url.includes('/api/auth/me')) {
        return json({ authenticated: true, principalType: 'agent', role: 'BROKER', portalRole: null,
          user: { id: 'agent-1', email: 'maya@mallan.nyc', first_name: 'Maya', last_name: 'Allan', role: 'BROKER' } });
      }
      if (url.includes('/api/crm/clients')) return json({ clients: CLIENTS, total: CLIENTS.length, limit: 200, offset: 0 });
      return Promise.reject(new Error('network down (denied by test): ' + url));
    };

    const ready = new Promise<void>((r) => {
      if (win.document.readyState === 'complete') { r(); return; }
      win.addEventListener('load', () => r());
      setTimeout(() => r(), 60_000);
    });
    return { dom, win, requested, pageErrors, ready };
  })();

  beforeAll(async () => {
    await booted.ready;
    await new Promise((r) => setTimeout(r, 1500));
  });
  afterAll(() => { try { booted.dom.window.close(); } catch { /* nothing to clean */ } });

  it('5 · Search boots with the CRM unavailable, and threw nothing about a missing retired symbol', () => {
    expect(booted.win.document.querySelector('#searchSection, #section-main, body')).not.toBeNull();
    expect(typeof booted.win.performSearch).toBe('function');
    const relevant = booted.pageErrors.filter((e) =>
      RETIRED_GLOBALS.some((s) => e.includes(s)) || /add-edit-client|report-package|client-feedback/.test(e));
    expect({ relevant }).toEqual({ relevant: [] });
  });

  it('every retired identifier is genuinely undefined in the booted page', () => {
    const defined = RETIRED_GLOBALS.filter((s) => typeof booted.win[s] !== 'undefined');
    expect({ defined }).toEqual({ defined: [] });
  });

  it('the retired modal left no DOM behind', () => {
    const present = RETIRED_DOM_IDS.filter((id) => booted.win.document.getElementById(id) !== null);
    expect({ present }).toEqual({ present: [] });
  });

  it('6 · the Reports modal still opens, through the canonical reports.js', () => {
    const modal = booted.win.document.getElementById('reportsModal');
    expect(modal).not.toBeNull();
    expect(modal.classList.contains('hidden')).toBe(true);
    booted.win.openReportsModal(['L1']);
    expect(modal.classList.contains('hidden')).toBe(false);
    // It is the canonical workflow, not a survivor of the retired package: these exist only in reports.js.
    expect(typeof booted.win.reportListingPassesAudience).toBe('function');
    expect(typeof booted.win.getReportListings).toBe('function');
    booted.win.closeReportsModal();
  });

  it('7 · the live report preview and output controls are still present', () => {
    const d = booted.win.document;
    expect(d.getElementById('reportPreviewModal')).not.toBeNull();
    expect(d.querySelector('button[onclick="generateReport()"]')).not.toBeNull();
    expect(typeof booted.win.previewReport).toBe('function');
    expect(typeof booted.win.exportReportCSV).toBe('function');
    expect(typeof booted.win.exportReportExcel).toBe('function');
  });

  it('8 · the canonical client population still comes from /api/crm/clients', () => {
    const asked = booted.requested.filter((u) => u.includes('/api/crm/clients'));
    expect(asked.length).toBeGreaterThan(0);
    expect(booted.requested.filter((u) => u.includes('/api/crm/leads'))).toEqual([]);
  });

  it('9 · client selection still works with add-edit-client.html deleted', () => {
    // The recipient picker is the live consumer of the client population in the Search application.
    const sel = booted.win.document.getElementById('reportRecipientClient');
    expect(sel).not.toBeNull();
    booted.win.populateReportRecipientDropdown();
    const emails = Array.from(sel.options as ArrayLike<{ textContent: string }>)
      .map((o) => String(o.textContent));
    expect(emails.join(' ')).toContain('jane@example.com');
  });

  it('9b · pressing Escape is safe with the retired modal gone — the defensive guard holds', () => {
    // The one permitted live mention of a retired symbol, exercised rather than asserted.
    const before = booted.pageErrors.length;
    const ev = new booted.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    expect(() => booted.win.document.dispatchEvent(ev)).not.toThrow();
    expect(booted.pageErrors.length).toBe(before);
  });

  it('10 · no active control points at the retired modal or function family', () => {
    const d = booted.win.document;
    const handlers = Array.from(d.querySelectorAll('[onclick], [onchange], [onsubmit]') as ArrayLike<Element>)
      .flatMap((el) => ['onclick', 'onchange', 'onsubmit'].map((a) => el.getAttribute(a) || ''))
      .filter(Boolean);
    expect(handlers.length).toBeGreaterThan(20);           // there really are controls to inspect
    const offenders = handlers.filter((h) => RETIRED_GLOBALS.some((s) => h.includes(s)));
    expect({ offenders }).toEqual({ offenders: [] });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 3 — the packet's own boundaries
// ═════════════════════════════════════════════════════════════════════════════
describe('3 · Retirement 1B and the other registered residuals were NOT started', () => {
  it('the dormant listing-sheet fallbacks were retired by 1B, not by this packet', () => {
    // WHEN 1A LANDED this asserted the fallbacks were still PRESENT, because removing them was a
    // separate authorization and their disappearance here would have meant 1A exceeded its scope.
    // Retirement 1B has since removed them. The pin is flipped to the new truth rather than deleted,
    // so the boundary it guarded stays legible: 1A deleted whole-file orphans, 1B did branch surgery
    // inside a live file, and neither did the other's work.
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js');
    expect(src).not.toContain('function previewListingSheet');
    expect(src).toContain("openReportsModal(ids, 'print')");
    expect(src).toContain("openReportsModal(ids, 'email')");
  });

  it('the stale pagination.js comment is still registered, not opportunistically fixed here', () => {
    expect(read('public/crm/js/search/pagination.js'))
      .toContain('First / Previous / Next are unaffected');
  });

  it('the C4B/C4C boundaries are untouched', () => {
    expect(read('public/crm/js/output/reports.js')).toContain('function reportListingPassesAudience');
    expect(read('public/crm/js/search/search-engine.js')).toContain('function _countHasExactPageCeiling');
    expect(read('lib/search/engine/universe.ts')).toContain('if (!mallanRowPassesGate(');
  });
});
