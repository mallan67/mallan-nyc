/// <reference types="jest" />
/**
 * C4C-FINAL — THE EMPTY-POPULATION MESSAGE TELLS THE TRUTH.
 *
 * ab68fc1b made the report POPULATION audience-aware. One downstream reader still described the old
 * two-gate contract, at reports.js:3293:
 *
 *     var listings = getReportListings();
 *     if (listings.length === 0) {
 *       renderReportErrors(['No compliant listings available. All selected listings may have IDX display
 *                            opted out.']);
 *
 * Under the C4C contract an empty population means any of: owner opt-out, participant-only in a Customer
 * report, an IDX restriction, an Internet restriction, or a combination. Naming IDX sends the agent to the
 * wrong field, and in a Customer report it can name a reason that is not even a restriction on the listing
 * — participant-only inventory is perfectly valid, just not distributable to a client.
 *
 * NO CAUSE IS ENUMERATED. getReportListings() returns a filtered array; it does not retain per-row rejection
 * reasons, and nothing downstream could recover them. Inventing a specific cause here would be the same
 * class of error as the message being replaced, so the wording states eligibility for the named audience and
 * stops there.
 *
 * WHICH PATH ACTUALLY REACHES IT. generateReport() validates first, and validateReportState() — corrected in
 * ab68fc1b — already refuses an all-ineligible selection with the audience-truthful sentence. So this reader
 * is reached when validation PASSES and the population is still empty, which happens through the selection
 * radio: 'picked' / 'liked' draw from listingFlags, a set validateReportState() never consults. Group A
 * records that reachability honestly instead of asserting a path that no longer exists.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.setTimeout(60_000);

const PERM_OK = { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true };

function mk(id: string, address: string, over: Record<string, unknown> = {}) {
  return {
    id, lid: 'RLS-' + id, address, unit: '', status: 'Active', status_transaction: 'sale',
    listingType: 'Sale', price: 1_000_000, beds: 2, baths: 2, intSqft: 1000, dom: 10,
    description: 'Description for ' + address + '.', agentName: 'Maya Allan', images: [],
    idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true,
    permissions: { ...PERM_OK }, ...over,
  };
}

const ORDINARY    = mk('A', '1 Ordinary Way');
const OWNER_OUT   = mk('B', '2 Owner Optout Road',      { permissions: { ...PERM_OK, ownerOptOut: true } });
const PARTICIPANT = mk('C', '3 Participant Only Court', { permissions: { ...PERM_OK, participantOnly: true } });
const IDX_FALSE   = mk('D', '4 Idx False Lane',         { idxDisplayYN: false, permissions: { ...PERM_OK, idxDisplay: false } });

const CANONICAL_REPORT_STATE = (() => {
  const dl = read('public/crm/js/core/data-loader.js');
  const start = dl.indexOf('var reportState = {');
  if (start === -1) throw new Error('canonical reportState initialiser not found in data-loader.js');
  const MARKER = '\n        };';
  const end = dl.indexOf(MARKER, start);
  if (end === -1) throw new Error('canonical reportState initialiser is unterminated');
  return dl.slice(start, end + MARKER.length);
})();

type Harness = { win: any; toasts: string[]; close: () => void };

function boot(opts: { version?: string; rows?: Record<string, unknown>[]; flags?: Record<string, unknown> } = {}): Harness {
  const rows = opts.rows ?? [ORDINARY];
  const modal = read('public/crm/html/modals/reports.html') + read('public/crm/html/modals/report-preview.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${modal}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win = dom.window;
  const toasts: string[] = [];
  win.URL.createObjectURL = () => 'blob:http://localhost/mock';
  win.URL.revokeObjectURL = () => undefined;
  win.HTMLAnchorElement.prototype.click = function () { /* no blob: navigation in jsdom */ };
  win.__rows = JSON.parse(JSON.stringify(rows));
  win.__flags = JSON.parse(JSON.stringify(opts.flags ?? {}));
  win.__toasts = toasts;
  win.eval(`
    var LOGGED_IN_AGENT = { id: 'agent-1', name: 'Maya Allan', email: 'maya@mallan.nyc' };
    var AGENT_PROFILE = { name: 'Maya Allan', company: 'Mallan Real Estate Inc.', email: 'maya@mallan.nyc',
      phone: '646-258-4460', license: '10311201806', companyLicense: '10991205323',
      address: '400 East 90th Street, Suite 17C' };
    var listings = window.__rows;
    var searchResultsState = { filteredListings: window.__rows, selectedListings: [] };
    ${CANONICAL_REPORT_STATE}
    reportState.version = ${JSON.stringify(opts.version ?? 'customer')};
    reportState.output = 'print';
    var customerDB = {};
    var listingFlags = window.__flags;
    var currentReportFieldType = 'sale';
    var activeSearchCriteria = null;
    function logAuditEntry() {}
    function showToast(msg) { window.__toasts.push(String(msg)); }
    function isEmailConfigured() { return false; }
    function getConfiguredAgentEmail() { return ''; }
    function openEmailSettings() {}
    function getListingColor() { return { bg: '#f8fafc', accent: '#94a3b8', icon: '#cbd5e1' }; }
    function openPrintableWindow() {}
    function sendViaEmailJS() { return Promise.reject(new Error('not configured')); }
    function checkListingCompliance() { return { ok: true, violations: [] }; }
  `);
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/output/reports.js'));
  const realToast = win.showReportToast;
  win.showReportToast = function (msg: string) { toasts.push(String(msg)); return realToast.call(win, msg); };
  win.openReportsModal(rows.map((r) => (r as { id: string }).id));
  return { win, toasts, close: () => win.close() };
}

/** What the modal's error panel actually says after a refused generate. */
function errorTextAfterGenerate(h: Harness): string {
  h.win.generateReport();
  const el = h.win.document.getElementById('reportErrors');
  return String(el ? el.textContent : '');
}

/** Select the 'liked' radio — a population source validateReportState() never consults. */
function chooseLikedRadio(h: Harness) {
  const radio = h.win.document.querySelector('input[name="reportSelection"][value="liked"]');
  expect(radio).not.toBeNull();
  radio.checked = true;
}

// ═════════════════════════════════════════════════════════════════════════════
// A — reachability, recorded honestly
// ═════════════════════════════════════════════════════════════════════════════
describe('A · which path reaches the empty-population reader at all', () => {
  it('an all-ineligible CUSTOMER selection is caught EARLIER, by the validator corrected in ab68fc1b', () => {
    // So the packet's first two red fingerprints do not reach :3293 through generateReport() any more —
    // validation refuses first, already speaking the audience. Recording that rather than asserting a path
    // that no longer exists.
    for (const rows of [[OWNER_OUT], [PARTICIPANT]]) {
      const h = boot({ version: 'customer', rows });
      try {
        const text = errorTextAfterGenerate(h);
        expect(text).toContain('No selected listings are eligible for the Customer report.');
        expect(text).not.toMatch(/IDX display opted out/);
      } finally { h.close(); }
    }
  });

  it('the reader IS reachable when validation passes but the population is empty', () => {
    // 'liked' draws from listingFlags, which validateReportState() does not look at, so validation sees an
    // eligible selection and the population still comes back empty. This is the live path to the message.
    const h = boot({ version: 'customer', rows: [ORDINARY], flags: {} });
    try {
      chooseLikedRadio(h);
      const text = errorTextAfterGenerate(h);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/IDX display opted out/);
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the wording is audience-truthful and names no cause it cannot know
// ═════════════════════════════════════════════════════════════════════════════
describe('B · the message states eligibility for the named audience', () => {
  it('CUSTOMER: names the Customer report, and never IDX', () => {
    const h = boot({ version: 'customer', rows: [ORDINARY], flags: {} });
    try {
      chooseLikedRadio(h);
      const text = errorTextAfterGenerate(h);
      expect(text).toContain('No selected listings are eligible for the Customer report.');
      expect(text).not.toMatch(/IDX/);
      expect(text).not.toMatch(/opted out/);
    } finally { h.close(); }
  });

  it('AGENT: names the Agent report', () => {
    const h = boot({ version: 'agent', rows: [ORDINARY], flags: {} });
    try {
      chooseLikedRadio(h);
      const text = errorTextAfterGenerate(h);
      expect(text).toContain('No selected listings are eligible for the Agent report.');
      expect(text).not.toMatch(/IDX/);
    } finally { h.close(); }
  });

  it('it enumerates NO cause — the population retains no per-row rejection reason to report', () => {
    const h = boot({ version: 'customer', rows: [ORDINARY], flags: {} });
    try {
      chooseLikedRadio(h);
      const text = errorTextAfterGenerate(h);
      for (const claim of [/owner opt-?out/i, /participant/i, /internet/i, /idx/i, /display/i]) {
        expect({ claim: String(claim), named: claim.test(text) }).toEqual({ claim: String(claim), named: false });
      }
    } finally { h.close(); }
  });

  it('ONE wording, held once and delegated to — not two copies that can drift apart', () => {
    const src = read('public/crm/js/output/reports.js');
    expect(src).toContain('function reportAudienceIneligibleMessage');
    // Each sentence is a literal in exactly one place: the helper.
    for (const s of ['No selected listings are eligible for the Customer report.',
                     'No selected listings are eligible for the Agent report.']) {
      expect(src.split(s).length - 1).toBe(1);
    }
    // And both readers reach it through the helper.
    expect(src.split('reportAudienceIneligibleMessage()').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('the validator and the generate-time reader agree, audience for audience', () => {
    // The two refusals an agent can actually hit must read identically for the same audience — the whole
    // point of sharing the sentence rather than restating it.
    for (const [version, expected] of [['customer', 'Customer'], ['agent', 'Agent']] as const) {
      const viaValidator = boot({ version, rows: [OWNER_OUT] });
      const viaReader = boot({ version, rows: [ORDINARY], flags: {} });
      try {
        chooseLikedRadio(viaReader);
        expect({
          version,
          validator: errorTextAfterGenerate(viaValidator),
          reader: errorTextAfterGenerate(viaReader),
        }).toEqual({
          version,
          validator: 'No selected listings are eligible for the ' + expected + ' report.',
          reader: 'No selected listings are eligible for the ' + expected + ' report.',
        });
      } finally { viaValidator.close(); viaReader.close(); }
    }
  });

  it('the old sentence is gone from source and from the shipped artifact', () => {
    const STALE = 'All selected listings may have IDX display opted out';
    expect(read('public/crm/js/output/reports.js')).not.toContain(STALE);
    expect(read('public/crm/index-built.html')).not.toContain(STALE);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — nothing else in the report workflow was changed
// ═════════════════════════════════════════════════════════════════════════════
describe('C · the C4C population boundary is untouched', () => {
  it('the gate, the mapping and the membership call all still stand', () => {
    const src = read('public/crm/js/output/reports.js');
    expect(src).toContain('function reportListingPassesAudience');
    expect(src).toContain('function reportAudienceForVersion');
    expect(src).toContain('reportListingPassesAudience(l, _audience)');
    expect(src).toContain("withDeliveryAudience('public'");
  });

  it('an eligible report still generates — this packet refuses nothing new', () => {
    const h = boot({ version: 'customer', rows: [ORDINARY] });
    try {
      const text = errorTextAfterGenerate(h);
      expect(text).toBe('');
    } finally { h.close(); }
  });

  it('a CUSTOMER report still drops participant-only and keeps the ordinary row', () => {
    const h = boot({ version: 'customer', rows: [ORDINARY, PARTICIPANT, IDX_FALSE] });
    try {
      expect((h.win.getReportListings() as { address: string }[]).map((l) => l.address))
        .toEqual([ORDINARY.address]);
    } finally { h.close(); }
  });
});
