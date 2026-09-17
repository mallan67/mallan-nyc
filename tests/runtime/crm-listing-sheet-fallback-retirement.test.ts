/// <reference types="jest" />
/**
 * RESIDUAL RETIREMENT 1B — THE LIVE PRINT/EMAIL BUTTONS HAVE ONE IMPLEMENTATION, NOT TWO.
 *
 * compliance-gates-and-output.js is a LIVE file, so this is branch surgery rather than file retirement.
 * Three things lived in it:
 *
 *   printListingSheet()    live button wrapper. Delegates to openReportsModal(ids, 'print') and returns.
 *                          Everything after that return was a second, older printing implementation.
 *   emailListingSheet()    live button wrapper. Delegates to openReportsModal(ids, 'email') and returns.
 *                          Everything after that return was a second, older emailing implementation —
 *                          its own client lookup, its own branded HTML, its own audit, its own send.
 *   previewListingSheet()  no live caller at all. Its buttons lived in client-delivery.html, deleted in
 *                          an earlier packet. Dormant output code.
 *
 * WHY THE DEAD BRANCHES MATTERED. They were not merely unused: they disagreed with the shipped product.
 * They gated on checkListingCompliance() — a two-gate IDX/Internet model — and announced refusals as
 * "blocked (IDX opt-out)" and "All selected listings have IDX display opted out". C4C established that an
 * empty report population equally means an owner opt-out or a participant-only restriction, and that the
 * audience is the report VERSION. So the fallbacks were a parallel system that would have been WRONG had
 * it ever run, sitting one `if` away from the live path.
 *
 * FAIL CLOSED, NOT FALL BACK. The canonical workflow is loaded by the same bundle as these wrappers; if it
 * is somehow absent, the honest response is to refuse and say so. Printing a different document, or
 * emailing one built by a retired renderer, is worse than printing nothing.
 *
 * PROOF IS BEHAVIOURAL. The live buttons are clicked in the booted bundle and the delegation is observed —
 * not read out of source text. That distinction is the REG-8 lesson, and it is also why the stale TP-29
 * check in offline-test-framework.js had to be corrected rather than preserved: it asserted that
 * printListingSheet.toString() CONTAINS "checkListingCompliance", which certifies source text of a
 * function instead of what the button does.
 *
 * NOT IN SCOPE: generateSingleListingSheet() / generateListingSheet() stay, because the compliance doctor
 * still reads them (:1695, :1704, :1886). Whether a compliance checker should keep a duplicate renderer
 * alive purely to inspect it is the registered W7 question, and is not smuggled in here.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.setTimeout(300_000);

/** Messages that belonged only to the retired fallbacks. */
const RETIRED_MESSAGES = [
  'blocked (IDX opt-out)',
  'All selected listings have IDX display opted out. Cannot preview.',
  'All selected listings have IDX display opted out. Cannot email.',
];

type Boot = {
  win: any;
  calls: { openReportsModal: any[][]; printable: string[]; emailed: any[]; audits: string[]; toasts: string[];
           compliance: number; listingSheet: number };
  close: () => void;
};

/**
 * Boot the shipped bundle. Everything under test is real: the buttons come from the built HTML and the
 * wrappers come from the inlined compliance-gates-and-output.js.
 *
 * ASYNC ON PURPOSE. The bundle pulls external scripts, so jsdom parses the document asynchronously and the
 * inline <script> blocks have not run when the JSDOM constructor returns. My first version asserted
 * synchronously and installed its spies immediately — so the assertions ran against an empty window, and
 * any spy that HAD been installed was then overwritten by the bundle's own definition moments later. Both
 * failure modes look like "the code is broken" and neither was. Wait for load, THEN spy.
 */
async function boot(opts: { reportsAvailable?: boolean } = {}): Promise<Boot> {
  const html = read('public/crm/index-built.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  class DenyAll extends jsdom.ResourceLoader {
    fetch() { return Promise.reject(new Error('410 GONE (denied by test)')); }
  }
  const dom = new jsdom.JSDOM(html, {
    url: 'https://mallan.nyc/crm/search', runScripts: 'dangerously',
    resources: new DenyAll(), pretendToBeVisual: true, virtualConsole,
  });
  const win: any = dom.window;
  win.scrollTo = () => undefined;
  win.fetch = () => Promise.reject(new Error('network down (denied by test)'));

  await new Promise<void>((r) => {
    if (win.document.readyState === 'complete') { r(); return; }
    win.addEventListener('load', () => r());
    setTimeout(() => r(), 60_000);
  });
  await new Promise((r) => setTimeout(r, 300));

  const calls: Boot['calls'] = { openReportsModal: [], printable: [], emailed: [], audits: [],
    toasts: [], compliance: 0, listingSheet: 0 };

  // Observe the canonical destination and every retired-path side effect. Installed AFTER load so the
  // bundle's own definitions are in place and these genuinely replace them.
  if (opts.reportsAvailable === false) {
    win.openReportsModal = undefined;
  } else {
    expect(typeof win.openReportsModal).toBe('function');   // the real one existed before we replaced it
    win.openReportsModal = (...args: any[]) => { calls.openReportsModal.push(args); };
  }
  win.openPrintableWindow = (h: string) => { calls.printable.push(String(h)); };
  win.sendEmailDirect = (o: any) => { calls.emailed.push(o); return { ok: true }; };
  win.showToast = (m: string) => { calls.toasts.push(String(m)); };
  win.closeDeliveryModal = () => undefined;

  const realAudit = win.logAuditEntry;
  win.logAuditEntry = (action: string, detail: any) => {
    calls.audits.push(String(action));
    if (typeof realAudit === 'function') { try { realAudit.call(win, action, detail); } catch { /* storage */ } }
  };
  if (typeof win.checkListingCompliance === 'function') {
    const realCheck = win.checkListingCompliance;
    win.checkListingCompliance = (...a: any[]) => { calls.compliance += 1; return realCheck.apply(win, a); };
  }
  if (typeof win.generateListingSheet === 'function') {
    const realSheet = win.generateListingSheet;
    win.generateListingSheet = (...a: any[]) => { calls.listingSheet += 1; return realSheet.apply(win, a); };
  }

  win.searchResultsState = win.searchResultsState || {};
  win.searchResultsState.selectedListings = ['L1', 'L2'];

  return { win, calls, close: () => { try { win.close(); } catch { /* nothing */ } } };
}

const clickPrint = (b: Boot) => {
  const btn = b.win.document.querySelector('button[onclick="printListingSheet()"]');
  expect(btn).not.toBeNull();
  btn.click();
};
const clickEmail = (b: Boot) => {
  const btn = b.win.document.querySelector('button[onclick="emailListingSheet()"]');
  expect(btn).not.toBeNull();
  btn.click();
};

// ═════════════════════════════════════════════════════════════════════════════
// A — the live controls reach the canonical workflow (true before AND after)
// ═════════════════════════════════════════════════════════════════════════════
describe('A · the live Print and Email buttons delegate to the canonical reports workflow', () => {
  it('1 · Print opens the canonical workflow with the selected ids and the print preset', async () => {
    const b = await boot();
    try {
      clickPrint(b);
      expect(b.calls.openReportsModal).toEqual([[['L1', 'L2'], 'print']]);
    } finally { b.close(); }
  });

  it('2 · Email opens the canonical workflow with the selected ids and the email preset', async () => {
    const b = await boot();
    try {
      clickEmail(b);
      expect(b.calls.openReportsModal).toEqual([[['L1', 'L2'], 'email']]);
    } finally { b.close(); }
  });

  it('3 · openReportsModal really is defined by the shipped bundle before either wrapper runs', async () => {
    // Without the test's own spy: the canonical workflow must already be there in the real page.
    const html = read('public/crm/index-built.html');
    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on('jsdomError', () => undefined);
    const dom = new jsdom.JSDOM(html, { url: 'https://mallan.nyc/crm/search', runScripts: 'dangerously',
      resources: new (class extends jsdom.ResourceLoader { fetch() { return Promise.reject(new Error('denied')); } })(),
      virtualConsole });
    try {
      await new Promise<void>((r) => {
        if (dom.window.document.readyState === 'complete') { r(); return; }
        dom.window.addEventListener('load', () => r());
        setTimeout(() => r(), 60_000);
      });
      expect(typeof dom.window.openReportsModal).toBe('function');
      expect(typeof dom.window.printListingSheet).toBe('function');
      expect(typeof dom.window.emailListingSheet).toBe('function');
    } finally { dom.window.close(); }
  });

  it('4 · the no-selection warnings still fire, and nothing is delegated', async () => {
    for (const [click, word] of [[clickPrint, 'print'], [clickEmail, 'email']] as const) {
      const b = await boot();
      try {
        b.win.searchResultsState.selectedListings = [];
        click(b);
        expect(b.calls.openReportsModal).toEqual([]);
        expect(b.calls.toasts.join(' ')).toContain('Please select at least one listing to ' + word);
      } finally { b.close(); }
    }
  });

  it('5 · the retired implementation does not run during a live click', async () => {
    // The observable signature of the old path: a compliance census, a legacy sheet render, a printable
    // window, an email send, or a success audit. None of them may occur.
    for (const click of [clickPrint, clickEmail]) {
      const b = await boot();
      try {
        click(b);
        expect({
          compliance: b.calls.compliance, listingSheet: b.calls.listingSheet,
          printable: b.calls.printable.length, emailed: b.calls.emailed.length,
          audits: b.calls.audits,
        }).toEqual({ compliance: 0, listingSheet: 0, printable: 0, emailed: 0, audits: [] });
      } finally { b.close(); }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — fail closed when the canonical workflow is absent
// ═════════════════════════════════════════════════════════════════════════════
describe('B · with the canonical workflow unavailable, both controls refuse', () => {
  it('6 · Print prints nothing, renders no legacy sheet, writes no success audit, and says so', async () => {
    const b = await boot({ reportsAvailable: false });
    try {
      clickPrint(b);
      expect({
        printable: b.calls.printable.length, listingSheet: b.calls.listingSheet,
        compliance: b.calls.compliance, audits: b.calls.audits,
      }).toEqual({ printable: 0, listingSheet: 0, compliance: 0, audits: [] });
      expect(b.calls.toasts.length).toBe(1);
      expect(b.calls.toasts[0]).toMatch(/unavailable|cannot/i);
      expect(b.calls.toasts[0]).toMatch(/nothing was printed|not printed/i);
    } finally { b.close(); }
  });

  it('7 · Email sends nothing, builds no branded fallback, writes no success audit, and says so', async () => {
    const b = await boot({ reportsAvailable: false });
    try {
      clickEmail(b);
      expect({
        emailed: b.calls.emailed.length, listingSheet: b.calls.listingSheet,
        compliance: b.calls.compliance, audits: b.calls.audits,
      }).toEqual({ emailed: 0, listingSheet: 0, compliance: 0, audits: [] });
      expect(b.calls.toasts.length).toBe(1);
      expect(b.calls.toasts[0]).toMatch(/unavailable|cannot/i);
      expect(b.calls.toasts[0]).toMatch(/nothing was sent|not sent|no email/i);
    } finally { b.close(); }
  });

  it('8 · refusal is not a silent no-op — the wrapper still ran and still warned', async () => {
    const b = await boot({ reportsAvailable: false });
    try {
      b.win.searchResultsState.selectedListings = [];
      clickPrint(b);
      // Empty selection is still reported first; the two refusals are distinguishable.
      expect(b.calls.toasts[0]).toContain('Please select at least one listing');
    } finally { b.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — previewListingSheet is gone, and the retired vocabulary with it
// ═════════════════════════════════════════════════════════════════════════════
describe('C · the dormant preview path and the retired messages are absent', () => {
  it('9 · previewListingSheet is not defined, in source or in the booted page', async () => {
    expect(read('public/crm/js/compliance/compliance-gates-and-output.js'))
      .not.toContain('function previewListingSheet');
    expect(read('public/crm/index-built.html')).not.toContain('function previewListingSheet');
    const b = await boot();
    try { expect(typeof b.win.previewListingSheet).toBe('undefined'); } finally { b.close(); }
  });

  it('10 · the retired IDX-only fallback messages are gone from source and artifact', () => {
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js');
    const built = read('public/crm/index-built.html');
    for (const m of RETIRED_MESSAGES) {
      expect({ m, inSource: src.includes(m), inBuilt: built.includes(m) })
        .toEqual({ m, inSource: false, inBuilt: false });
    }
  });

  it('11 · emailListingSheet no longer owns a client lookup or a second email renderer', () => {
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js').replace(/\r\n/g, '\n');
    const start = src.indexOf('function emailListingSheet()');
    const body = src.slice(start, src.indexOf('\n}', start));
    expect(start).toBeGreaterThan(-1);
    for (const banned of ['customerDB', 'clientSelect', 'buildBrandedEmailHTML', 'sendEmailDirect',
      'checkListingCompliance', 'logAuditEntry']) {
      expect({ banned, present: body.includes(banned) }).toEqual({ banned, present: false });
    }
    expect(body).toContain("openReportsModal(ids, 'email')");
  });

  it('12 · printListingSheet no longer renders or prints anything itself', () => {
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js').replace(/\r\n/g, '\n');
    const start = src.indexOf('function printListingSheet()');
    const body = src.slice(start, src.indexOf('\n}', start));
    for (const banned of ['generateListingSheet', 'openPrintableWindow', 'checkListingCompliance',
      'logAuditEntry', 'clientDeliveryMenu']) {
      expect({ banned, present: body.includes(banned) }).toEqual({ banned, present: false });
    }
    expect(body).toContain("openReportsModal(ids, 'print')");
  });

  it('13 · the stale manifest baseline no longer asserts the retired function', () => {
    // Precedent: crm-no-fabricated-listing-content.test.ts removed deleted ids from this baseline so it
    // would stop asserting something that no longer exists.
    expect(read('public/crm/scripts/manifest.json')).not.toContain('previewListingSheet');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — what this packet deliberately did NOT touch
// ═════════════════════════════════════════════════════════════════════════════
describe('D · the shared infrastructure and the registered residuals are untouched', () => {
  it('the functions the packet protects are all still defined', () => {
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js');
    for (const fn of ['checkListingCompliance', 'generateSingleListingSheet', 'generateListingSheet',
      'formatCurrency', 'getSelectedListingIds']) {
      expect({ fn, present: src.includes('function ' + fn) }).toEqual({ fn, present: true });
    }
  });

  it('the compliance doctor still finds the two wrappers it requires', async () => {
    // :1413-1414 and :1692 assert these are functions. Slimming them must not remove them.
    const b = await boot();
    try {
      expect(typeof b.win.printListingSheet).toBe('function');
      expect(typeof b.win.emailListingSheet).toBe('function');
    } finally { b.close(); }
  });

  it('the doctor still reads the renderers it inspects — W7 is not started here', () => {
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js');
    expect(src).toContain('generateSingleListingSheet.toString()');
    expect(src).toContain('generateListingSheet.toString()');
  });

  it('pagination.js and the C4B/C4C boundaries are untouched', () => {
    expect(read('public/crm/js/search/pagination.js')).toContain('First / Previous / Next are unaffected');
    expect(read('public/crm/js/output/reports.js')).toContain('function reportListingPassesAudience');
    expect(read('public/crm/js/search/search-engine.js')).toContain('function _countHasExactPageCeiling');
    expect(read('lib/search/engine/universe.ts')).toContain('if (!mallanRowPassesGate(');
  });
});
