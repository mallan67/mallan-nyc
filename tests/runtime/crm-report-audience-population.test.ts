/// <reference types="jest" />
/**
 * C4C — AUDIENCE-AWARE REPORT / EXPORT POPULATION.
 *
 * getReportListings() is the single population owner for every report output. Its only compliance screen
 * was reports.js:2641:
 *
 *     reportListings.filter(function(l) { return l.idxDisplayYN !== false && l.internetDisplayYN !== false; })
 *
 * Two of the four gates, applied to BOTH audiences. That is wrong in two directions at once, and this file
 * proves both before either is corrected:
 *
 *   UNDER-GATING the customer audience — owner-opted-out and participant-only inventory reaches a
 *     client-facing preview, CSV, workbook, printed report and email. The input population is the MEMBER
 *     universe (searchResultsState.filteredListings, served at audience "member" per C4B), so
 *     participant_only rows are LEGITIMATELY present and were simply never removed on the way out.
 *
 *   OVER-GATING the agent audience — idxDisplayYN / internetDisplayYN are client/public display
 *     restrictions, not professional-visibility restrictions. Applying them to an Agent report strips
 *     inventory an authenticated participant may legitimately work with.
 *
 * THE AUDIENCE IS reportState.version, and nothing else. Not the output type, not CSV-vs-print, not the
 * preparedFor text, not the recipient address, and not whether a file could theoretically be forwarded. An
 * Agent workbook is a professional working document; a Customer workbook is a distribution artifact.
 *
 *     version 'agent'    -> audience 'member'
 *     version 'customer' -> audience 'public'
 *
 * THE MATRIX (packet §P):
 *
 *                        AGENT/member   CUSTOMER/public
 *     A ordinary            PASS            PASS
 *     B ownerOptOut         BLOCK           BLOCK     UCBA Art. I §5(A) — no audience is an exception
 *     C participantOnly     PASS            BLOCK     RLS Permissions=Private — exists FOR the member
 *     D idxDisplayYN false  PASS            BLOCK     a client/public display restriction
 *     E internetDisplay f.  PASS            BLOCK     a client/public display restriction
 *
 * THE DANGEROUS TRANSITION is member inventory -> customer audience. Client delivery therefore applies
 * PUBLIC eligibility at the delivery boundary regardless of the version the agent had selected, so an Agent
 * report cannot become a client email merely by pressing Send.
 *
 * FIXTURE SHAPE. Every row here carries the shape js/core/data-loader.js:268-278 actually emits — the
 * permissions object AND the top-level display booleans. A prior characterisation test seeded ownerOptOut
 * at the TOP level, a shape getReportListings() does not read in either direction, so it demonstrated the
 * leak through a path production never takes. Corrected here and in crm-report-outputs.test.ts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsdom: any = require('jsdom');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS: any = require('exceljs');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
/**
 * reports.js is stored CRLF. Slicing a function body on '\n        }' silently returned -1 there, and
 * slice(0, -1) then handed back almost the whole file — so a "this function no longer contains X" assertion
 * was really scanning every other function too, and passed or failed for reasons unrelated to its subject.
 * Normalise first, then slice.
 */
const readLF = (rel: string) => read(rel).replace(/\r\n/g, '\n');
function bodyOf(src: string, decl: string): string {
  const start = src.indexOf(decl);
  if (start === -1) throw new Error('function not found: ' + decl);
  const end = src.indexOf('\n        }', start);
  if (end === -1) throw new Error('function body is unterminated: ' + decl);
  return src.slice(start, end).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.setTimeout(60_000);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — the canonical DTO shape from js/core/data-loader.js:268-278
// ─────────────────────────────────────────────────────────────────────────────

type Perm = { ownerOptOut: boolean; participantOnly: boolean; idxDisplay: boolean; internetDisplay: boolean };

function mk(
  id: string,
  address: string,
  lid: string,
  over: { idxDisplayYN?: boolean; internetDisplayYN?: boolean; perm?: Partial<Perm> } = {},
) {
  const idx = over.idxDisplayYN ?? true;
  const inet = over.internetDisplayYN ?? true;
  return {
    id,
    lid,
    address,
    unit: '',
    status: 'Active',
    status_transaction: 'sale',
    listingType: 'Sale',
    price: 1_000_000,
    beds: 2,
    baths: 2,
    intSqft: 1000,
    dom: 10,
    description: 'Description for ' + address + '.',
    privateRemarks: 'AGENT ONLY',
    agentName: 'Maya Allan',
    images: [],
    idxDisplayYN: idx,
    internetDisplayYN: inet,
    addressDisplayYN: true,
    permissions: {
      ownerOptOut: false,
      participantOnly: false,
      idxDisplay: idx,
      internetDisplay: inet,
      syndication: true,
      ...(over.perm || {}),
    },
  };
}

const ORDINARY   = mk('A', '1 Ordinary Way',          'RLS-ORD-A');
const OWNER_OUT  = mk('B', '2 Owner Optout Road',     'RLS-OPTOUT-B',   { perm: { ownerOptOut: true } });
const PARTICIPANT= mk('C', '3 Participant Only Court','RLS-PARTONLY-C', { perm: { participantOnly: true } });
const IDX_FALSE  = mk('D', '4 Idx False Lane',        'RLS-IDXFALSE-D', { idxDisplayYN: false });
const INET_FALSE = mk('E', '5 Internet False Street', 'RLS-INETFALSE-E',{ internetDisplayYN: false });

const ALL_ROWS = [ORDINARY, OWNER_OUT, PARTICIPANT, IDX_FALSE, INET_FALSE];

/** Address of every row, for population assertions. */
const ADDR = {
  ordinary: ORDINARY.address,
  ownerOut: OWNER_OUT.address,
  participant: PARTICIPANT.address,
  idxFalse: IDX_FALSE.address,
  inetFalse: INET_FALSE.address,
};
/** RLS id of every row — the identity that survives the CUSTOMER csv/xlsx field allowlist. */
const RLSID = {
  ordinary: ORDINARY.lid,
  ownerOut: OWNER_OUT.lid,
  participant: PARTICIPANT.lid,
  idxFalse: IDX_FALSE.lid,
  inetFalse: INET_FALSE.lid,
};

// ─────────────────────────────────────────────────────────────────────────────
// Harness — the shipped report workflow, nothing under test stubbed
// ─────────────────────────────────────────────────────────────────────────────

type Capture = {
  audits: { action: string; detail: Record<string, unknown> }[];
  blobs: { type: string; bytes: number[]; text: string }[];
  printed: string[];
  toasts: string[];
  emailjs: Record<string, unknown>[];
};
type Harness = { win: any; cap: Capture; close: () => void };

/** The SHIPPED reportState initialiser, lifted from js/core/data-loader.js rather than retyped. */
const CANONICAL_REPORT_STATE = (() => {
  const dl = read('public/crm/js/core/data-loader.js');
  const start = dl.indexOf('var reportState = {');
  if (start === -1) throw new Error('canonical reportState initialiser not found in data-loader.js');
  const MARKER = '\n        };';
  const end = dl.indexOf(MARKER, start);
  if (end === -1) throw new Error('canonical reportState initialiser is unterminated');
  return dl.slice(start, end + MARKER.length);
})();

function boot(opts: { version?: string; rows?: Record<string, unknown>[]; emailConfigured?: boolean } = {}): Harness {
  const rows = opts.rows ?? ALL_ROWS;
  const modal = read('public/crm/html/modals/reports.html') + read('public/crm/html/modals/report-preview.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${modal}</body></html>`, {
    url: 'http://localhost/crm/', runScripts: 'dangerously', virtualConsole,
  });
  const win = dom.window;
  const cap: Capture = { audits: [], blobs: [], printed: [], toasts: [], emailjs: [] };

  const RealBlob = win.Blob;
  function BlobSpy(this: unknown, parts: unknown[], options: { type?: string }) {
    const first = parts && parts[0];
    let bytes: number[] = [];
    let text = '';
    if (typeof first === 'string') text = first;
    else if (first && typeof (first as { length?: number }).length === 'number') bytes = Array.from(first as ArrayLike<number>);
    cap.blobs.push({ type: (options && options.type) || '', bytes, text });
    return new RealBlob(parts, options);
  }
  win.Blob = BlobSpy;
  win.URL.createObjectURL = () => 'blob:http://localhost/mock';
  win.URL.revokeObjectURL = () => undefined;
  win.HTMLAnchorElement.prototype.click = function () { /* never navigate to a blob: URL in jsdom */ };

  win.__cap = cap;
  win.__emailConfigured = opts.emailConfigured === true;
  win.__rows = JSON.parse(JSON.stringify(rows));

  win.eval(`
    var LOGGED_IN_AGENT = { id: 'agent-1', name: 'Maya Allan', email: 'maya@mallan.nyc' };
    var AGENT_PROFILE = { name: 'Maya Allan', title: 'Principal Broker', company: 'Mallan Real Estate Inc.',
      email: 'maya@mallan.nyc', phone: '646-258-4460', license: '10311201806',
      companyLicense: '10991205323', address: '400 East 90th Street, Suite 17C', website: 'mallan.nyc' };
    var listings = window.__rows;
    var searchResultsState = { filteredListings: window.__rows, selectedListings: [] };
    ${CANONICAL_REPORT_STATE}
    reportState.version = ${JSON.stringify(opts.version ?? 'agent')};
    reportState.output = 'email';
    var customerDB = {};
    var listingFlags = {};
    var currentReportFieldType = 'sale';
    var activeSearchCriteria = null;
    function logAuditEntry(action, detail) { window.__cap.audits.push({ action: action, detail: detail || {} }); }
    function showToast(msg) { window.__cap.toasts.push(String(msg)); }
    function isEmailConfigured() { return window.__emailConfigured === true; }
    function getConfiguredAgentEmail() { return window.__emailConfigured ? 'maya@mallan.nyc' : ''; }
    function openEmailSettings() {}
    function getListingColor(id) { return { bg: '#f8fafc', accent: '#94a3b8', icon: '#cbd5e1' }; }
    function openPrintableWindow(html) { window.__cap.printed.push(html); }
    function sendViaEmailJS(params) {
      if (!window.__emailConfigured) return Promise.reject(new Error('Email not configured'));
      window.__cap.emailjs.push(params);
      return Promise.resolve({ status: 200 });
    }
      // TRANSPORT MOVED SERVER-SIDE (Lane 3 Packet 1). The report used to be handed to EmailJS from the
      // browser; it now POSTs to /api/crm/clients/:id/report-send so the send is governed and recorded as
      // durable brokerage history. These assertions are about report CONTENT, which did not change - so the
      // capture is translated into the same shape rather than the tests being rewritten around transport.
      // A canonical client is now required, so the harness supplies one.
      window.fetch = function (url, init) {
        var u = String(url);
        if (u.indexOf('/report-send') !== -1) {
          var b = {};
          try { b = JSON.parse((init && init.body) || '{}'); } catch (e) { b = {}; }
          window.__cap.emailjs.push({
          to_email: (window.customerDB[String(u).split('/clients/')[1] ? String(u).split('/clients/')[1].split('/')[0] : ''] || {}).email || 'client@example.com',
          to_name: (window.customerDB[String(u).split('/clients/')[1] ? String(u).split('/clients/')[1].split('/')[0] : ''] || {}).name || 'Client',
            subject: b.subject,
            message_html: b.html,
            purpose: b.purpose,
            listing_ids: b.listing_ids
          });
          return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ success: true }); } });
        }
        return Promise.reject(new Error('network down (denied by test): ' + u));
      };
    function checkListingCompliance() { return { ok: true, violations: [] }; }
  `);

  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/output/reports.js'));

  const realToast = win.showReportToast;
  win.showReportToast = function (msg: string) { cap.toasts.push(String(msg)); return realToast.call(win, msg); };

  win.openReportsModal(rows.map((r) => (r as { id: string }).id));
  // A client report is now bound to a canonical client record, so the harness supplies one. Tests that
  // care about recipient resolution override this with their own selection afterwards.
  win.customerDB['c-default'] = { id: 'c-default', name: 'Client', email: 'client@example.com' };
  const _sel = win.document.getElementById('reportRecipientClient');
  if (_sel) { _sel.innerHTML = '<option value="c-default">Client</option>'; _sel.value = 'c-default'; }
  return { win, cap, close: () => win.close() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(1600);

/** The addresses the ONE population function actually returns. */
function population(version: string): string[] {
  const h = boot({ version });
  try {
    return (h.win.getReportListings() as { address: string }[]).map((l) => l.address);
  } finally { h.close(); }
}

/** Tick the RLS ID column so identity survives the CUSTOMER csv/xlsx allowlist. */
function selectRlsIdColumn(h: Harness) {
  const box = h.win.document.querySelector('#reportSalesFields input[data-field="rlsId"]');
  expect(box).not.toBeNull();
  box.checked = true;
}

const lastBlob = (h: Harness) => h.cap.blobs[h.cap.blobs.length - 1];

const RESTRICTED_FOR_CUSTOMER = [ADDR.ownerOut, ADDR.participant, ADDR.idxFalse, ADDR.inetFalse];

// ═════════════════════════════════════════════════════════════════════════════
// A — the one population gate, both directions
// ═════════════════════════════════════════════════════════════════════════════
describe('A · getReportListings() is audience-aware (packet §B, §D, §P)', () => {
  it('CUSTOMER: only the ordinary row survives — the four restrictions all block', () => {
    expect(population('customer')).toEqual([ADDR.ordinary]);
  });

  it('AGENT: owner opt-out blocks, everything else a participant may legitimately use survives', () => {
    // The over-gating half of the defect. idx/internet display are client/public restrictions; applying
    // them here erased professional inventory from the brokerage's own working document.
    expect(population('agent').sort()).toEqual(
      [ADDR.ordinary, ADDR.participant, ADDR.idxFalse, ADDR.inetFalse].sort(),
    );
  });

  it('owner opt-out blocks at EVERY audience — UCBA Art. I §5(A) has no member exception', () => {
    expect(population('agent')).not.toContain(ADDR.ownerOut);
    expect(population('customer')).not.toContain(ADDR.ownerOut);
  });

  it('participant-only is the gate that DIFFERS by audience, and that difference is the point', () => {
    expect(population('agent')).toContain(ADDR.participant);
    expect(population('customer')).not.toContain(ADDR.participant);
  });

  it('only EXPLICIT restrictions block — absent permissions are not inferred as denial', () => {
    // A row with no permissions object and no display booleans at all must still be reportable. Treating
    // missing as false would fail closed on an unloaded field and silently empty the report.
    const bare = { id: 'Z', lid: 'RLS-BARE-Z', address: '9 Bare Row Plaza', status: 'Active',
      status_transaction: 'sale', price: 500000, beds: 1, baths: 1, intSqft: 500, dom: 1, images: [] };
    for (const version of ['agent', 'customer']) {
      const h = boot({ version, rows: [bare] });
      try {
        expect({ version, out: (h.win.getReportListings() as { address: string }[]).map((l) => l.address) })
          .toEqual({ version, out: ['9 Bare Row Plaza'] });
      } finally { h.close(); }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the canonical helper (packet §E)
// ═════════════════════════════════════════════════════════════════════════════
describe('B · ONE report-audience interpreter, in the member/public vocabulary', () => {
  it('reportListingPassesAudience(listing, audience) exists and is pure', () => {
    const h = boot({});
    try {
      expect(typeof h.win.reportListingPassesAudience).toBe('function');
      const f = h.win.reportListingPassesAudience;
      expect({
        memberOrdinary: f(ORDINARY, 'member'),     publicOrdinary: f(ORDINARY, 'public'),
        memberOwnerOut: f(OWNER_OUT, 'member'),    publicOwnerOut: f(OWNER_OUT, 'public'),
        memberPartOnly: f(PARTICIPANT, 'member'),  publicPartOnly: f(PARTICIPANT, 'public'),
        memberIdxFalse: f(IDX_FALSE, 'member'),    publicIdxFalse: f(IDX_FALSE, 'public'),
        memberInetFals: f(INET_FALSE, 'member'),   publicInetFals: f(INET_FALSE, 'public'),
      }).toEqual({
        memberOrdinary: true,  publicOrdinary: true,
        memberOwnerOut: false, publicOwnerOut: false,
        memberPartOnly: true,  publicPartOnly: false,
        memberIdxFalse: true,  publicIdxFalse: false,
        memberInetFals: true,  publicInetFals: false,
      });
    } finally { h.close(); }
  });

  it('an unknown or absent audience is treated as PUBLIC — fail closed', () => {
    const h = boot({});
    try {
      const f = h.win.reportListingPassesAudience;
      expect({ undef: f(PARTICIPANT), nonsense: f(PARTICIPANT, 'whatever') })
        .toEqual({ undef: false, nonsense: false });
    } finally { h.close(); }
  });

  it('version maps to audience, and NOTHING else does', () => {
    const h = boot({});
    try {
      expect({ agent: h.win.reportAudienceForVersion('agent'), customer: h.win.reportAudienceForVersion('customer') })
        .toEqual({ agent: 'member', customer: 'public' });
      // An unrecognised version is a client/public audience, not a member one.
      expect(h.win.reportAudienceForVersion('something-else')).toBe('public');
    } finally { h.close(); }
  });

  it('getReportListings does not restate the four flags itself', () => {
    const code = bodyOf(readLF('public/crm/js/output/reports.js'), 'function getReportListings()');
    expect(code).toContain('reportListingPassesAudience');
    // The decision is delegated, not copied: no hand-typed flag comparison survives in this function.
    expect(code).not.toMatch(/ownerOptOut/);
    expect(code).not.toMatch(/participantOnly/);
    expect(code).not.toMatch(/idxDisplayYN/);
    expect(code).not.toMatch(/internetDisplayYN/);
  });

  it('the Send-to-Client hand-written three-flag copy is gone (packet §G)', () => {
    const code = bodyOf(readLF('public/crm/js/output/reports.js'), 'function copyReportAndEmail()');
    // It may DELEGATE to the canonical helper; it may not re-derive the rule.
    expect(code).not.toMatch(/perm\.ownerOptOut/);
    expect(code).not.toMatch(/internetDisplayYN/);
    expect(code).not.toMatch(/idxDisplayYN/);
  });

  it('MUTATION PROOF — deleting the customer participantOnly rejection breaks a behavioural test', () => {
    // Not a source assertion: the helper's own source is mutated, re-evaluated in a live window, and the
    // population re-derived. If this row were being excluded by something else, the mutant would still
    // exclude it and this proof would fail.
    const src = readLF('public/crm/js/output/reports.js');
    const LINE = '            if (perm.participantOnly === true) return false;';
    expect(src).toContain(LINE);
    const mutated = src.replace(LINE, '            /* mutant: rejection removed */');

    const h = boot({ version: 'customer' });
    try {
      expect((h.win.getReportListings() as { address: string }[]).map((l) => l.address)).toEqual([ADDR.ordinary]);
      h.win.eval(mutated);
      expect((h.win.getReportListings() as { address: string }[]).map((l) => l.address))
        .toEqual([ADDR.ordinary, ADDR.participant]);
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — preview is part of the boundary (packet §H)
// ═════════════════════════════════════════════════════════════════════════════
describe('C · preview shows exactly what the output may contain', () => {
  const previewText = (version: string) => {
    const h = boot({ version });
    try {
      h.win.previewReport();
      return String(h.win.document.getElementById('reportPreviewModal').textContent || '');
    } finally { h.close(); }
  };

  it('CUSTOMER preview contains none of the four restricted rows', () => {
    const text = previewText('customer');
    expect(text).toContain(ADDR.ordinary);                       // positive control
    for (const a of RESTRICTED_FOR_CUSTOMER) expect(text).not.toContain(a);
  });

  it('AGENT preview keeps legitimate professional inventory and still drops owner opt-out', () => {
    const text = previewText('agent');
    expect(text).toContain(ADDR.participant);
    expect(text).toContain(ADDR.idxFalse);
    expect(text).not.toContain(ADDR.ownerOut);
  });

  it('the preview email context counts the GATED population, not the selection', () => {
    const h = boot({ version: 'customer' });
    try {
      h.win.previewReport();
      expect(h.win._reportEmailContext.count).toBe(1);
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — CSV bytes (packet §I)
// ═════════════════════════════════════════════════════════════════════════════
describe('D · CSV carries only the audience-eligible population', () => {
  it('CUSTOMER csv bytes contain no restricted listing identity', () => {
    const h = boot({ version: 'customer' });
    try {
      selectRlsIdColumn(h);
      h.win.exportReportCSV();
      const text = lastBlob(h).text;
      expect(text).toContain(RLSID.ordinary);                    // positive control
      for (const id of [RLSID.ownerOut, RLSID.participant, RLSID.idxFalse, RLSID.inetFalse]) {
        expect({ id, present: text.includes(id) }).toEqual({ id, present: false });
      }
    } finally { h.close(); }
  });

  it('AGENT csv retains participant-only professional inventory', () => {
    const h = boot({ version: 'agent' });
    try {
      selectRlsIdColumn(h);
      h.win.exportReportCSV();
      const text = lastBlob(h).text;
      expect(text).toContain(RLSID.participant);
      expect(text).not.toContain(RLSID.ownerOut);
    } finally { h.close(); }
  });

  it('the customer FIELD allowlist is untouched — C4C is population, not columns', () => {
    const h = boot({ version: 'customer' });
    try {
      selectRlsIdColumn(h);
      const box = h.win.document.querySelector('#reportSalesFields input[data-field="privateRemarks"]');
      if (box) box.checked = true;
      h.win.exportReportCSV();
      expect(lastBlob(h).text).not.toContain('AGENT ONLY');
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — XLSX workbook (packet §I)
// ═════════════════════════════════════════════════════════════════════════════
describe('E · the parsed workbook carries only the audience-eligible population', () => {
  const cells = async (h: Harness) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(Uint8Array.from(lastBlob(h).bytes)));
    const out: string[] = [];
    wb.worksheets[0].eachRow((row: any) => {
      row.eachCell((c: any) => out.push(String(c.value ?? '')));
    });
    return out.join('');
  };

  it('CUSTOMER workbook excludes every restricted row', async () => {
    const h = boot({ version: 'customer' });
    try {
      selectRlsIdColumn(h);
      h.win.exportReportExcel();
      const text = await cells(h);
      expect(text).toContain(RLSID.ordinary);
      for (const id of [RLSID.ownerOut, RLSID.participant, RLSID.idxFalse, RLSID.inetFalse]) {
        expect({ id, present: text.includes(id) }).toEqual({ id, present: false });
      }
    } finally { h.close(); }
  });

  it('AGENT workbook keeps participant-only and drops owner opt-out', async () => {
    const h = boot({ version: 'agent' });
    try {
      selectRlsIdColumn(h);
      h.win.exportReportExcel();
      const text = await cells(h);
      expect(text).toContain(RLSID.participant);
      expect(text).not.toContain(RLSID.ownerOut);
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F — print / Save as PDF (packet §J)
// ═════════════════════════════════════════════════════════════════════════════
describe('F · the print sink receives the gated population', () => {
  const printed = (version: string) => {
    const h = boot({ version });
    try {
      h.win.reportState.output = 'print';
      h.win.generateReport();
      expect(h.cap.printed.length).toBe(1);
      return h.cap.printed[0];
    } finally { h.close(); }
  };

  it('CUSTOMER print contains none of the four restricted rows', () => {
    const html = printed('customer');
    expect(html).toContain(ADDR.ordinary);
    for (const a of RESTRICTED_FOR_CUSTOMER) expect(html).not.toContain(a);
  });

  it('AGENT print keeps participant-only, and still never carries owner opt-out', () => {
    const html = printed('agent');
    expect(html).toContain(ADDR.participant);
    expect(html).not.toContain(ADDR.ownerOut);
  });

  it('quickPrintReport REFUSES an ineligible client sheet rather than printing an empty one', () => {
    // My first expectation here was "prints, but without the address" — wrong. quickPrintReport declares
    // itself a customer sheet and builds its title FROM the address, so gating only the population still
    // printed "3 Participant Only Court — Detail Report" over a blank page. Refusing is the correct
    // behaviour for a single-listing sheet: there is no remaining report to render.
    const h = boot({ version: 'agent' });
    try {
      h.win.quickPrintReport('C');
      expect(h.cap.printed.length).toBe(0);
      expect(h.cap.toasts.join(' ')).toMatch(/cannot be shared with a client/i);
    } finally { h.close(); }
  });

  it('quickPrintReport still prints an eligible listing — positive control', () => {
    const h = boot({ version: 'agent' });
    try {
      h.win.quickPrintReport('A');
      expect(h.cap.printed.length).toBe(1);
      expect(h.cap.printed[0]).toContain(ADDR.ordinary);
    } finally { h.close(); }
  });

  it('an empty gated population leaves NO stale panel for print to pick up', () => {
    // populateReportPreview() used to clear only previewGrid, so the other eight format panels kept the
    // previous population — and buildFullReportHTML() returns whichever panel the format names.
    const h = boot({ version: 'customer', rows: [ORDINARY, PARTICIPANT] });
    try {
      h.win.reportState.format = 'detail';
      h.win.previewReport();                                   // renders the ordinary row into previewDetail
      expect(h.win.document.getElementById('previewDetail').innerHTML).toContain(ADDR.ordinary);
      h.win.searchResultsState.filteredListings = [PARTICIPANT];
      h.win.reportState.selectedListingIds = ['C'];
      h.win.populateReportPreview();
      expect(h.win.document.getElementById('previewDetail').innerHTML).not.toContain(ADDR.ordinary);
      expect(h.win.document.getElementById('previewDetail').innerHTML).toContain('No Listings Available');
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G — client delivery always applies PUBLIC eligibility (packet §G, §K)
// ═════════════════════════════════════════════════════════════════════════════
describe('G · sending to a client is a public-audience act, whatever the version says', () => {
  it('Send to Client from an AGENT-version report still excludes participant-only', async () => {
    // The dangerous transition named in the packet: member inventory -> customer audience. The version
    // selector must not be able to carry professional-only inventory into a client's inbox.
    const h = boot({ version: 'agent', emailConfigured: true });
    try {
      h.win.previewReport();
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.copyReportAndEmail();
      await settle();
      expect(h.cap.emailjs.length).toBe(1);
      const body = String(h.cap.emailjs[0].message_html || '');
      expect(body).toContain(ADDR.ordinary);
      for (const a of RESTRICTED_FOR_CUSTOMER) expect(body).not.toContain(a);
    } finally { h.close(); }
  });

  it('the normal email output from an AGENT-version report is equally public-gated', async () => {
    const h = boot({ version: 'agent', emailConfigured: true });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.generateReport();
      await settle();
      expect(h.cap.emailjs.length).toBe(1);
      const body = String(h.cap.emailjs[0].message_html || '');
      for (const a of RESTRICTED_FOR_CUSTOMER) expect(body).not.toContain(a);
    } finally { h.close(); }
  });

  it('a CUSTOMER-version email is identical — the audience was already public', async () => {
    const h = boot({ version: 'customer', emailConfigured: true });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.generateReport();
      await settle();
      const body = String(h.cap.emailjs[0].message_html || '');
      expect(body).toContain(ADDR.ordinary);
      for (const a of RESTRICTED_FOR_CUSTOMER) expect(body).not.toContain(a);
    } finally { h.close(); }
  });

  it('the report version is NOT silently relabelled by sending it', async () => {
    const h = boot({ version: 'agent', emailConfigured: true });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.generateReport();
      await settle();
      expect(h.win.reportState.version).toBe('agent');
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H — counts and audits describe the EMITTED population (packet §O)
// ═════════════════════════════════════════════════════════════════════════════
describe('H · every count describes what was actually emitted', () => {
  it('the print audit counts 1, not the 5 selected', () => {
    const h = boot({ version: 'customer' });
    try {
      h.win.reportState.output = 'print';
      h.win.generateReport();
      const audit = h.cap.audits.find((a) => a.action === 'report_generate');
      expect(audit).toBeDefined();
      expect((audit as { detail: { count?: number } }).detail.count).toBe(1);
    } finally { h.close(); }
  });

  it('the csv audit and toast agree with the emitted row count', () => {
    const h = boot({ version: 'customer' });
    try {
      selectRlsIdColumn(h);
      h.win.reportState.output = 'csv';
      h.win.generateReport();
      const audit = h.cap.audits.find((a) => a.action === 'report_generate');
      expect((audit as { detail: { count?: number } }).detail.count).toBe(1);
      expect(h.cap.toasts.join(' ')).toContain('1 listings');
    } finally { h.close(); }
  });

  it('the emailed count and listing ids describe the DELIVERED body, not the agent population', async () => {
    // The old Send-to-Client filter narrowed its local array but not the body, which buildFullReportHTML()
    // re-derived ungated — so the email announced "2 listings" and rendered 3, owner opt-out included.
    const h = boot({ version: 'agent', emailConfigured: true });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.generateReport();
      await settle();
      const sent = h.cap.audits.find((a) => a.action === 'email_sent');
      expect(sent).toBeDefined();
      const detail = (sent as { detail: { count?: number; listingIds?: string[] } }).detail;
      expect(detail.count).toBe(1);
      expect(detail.listingIds).toEqual(['A']);
      const body = String(h.cap.emailjs[0].message_html || '');
      expect(body).toContain('with 1 listing');
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// I — the validation message tells the truth (packet §L)
// ═════════════════════════════════════════════════════════════════════════════
describe('I · validation agrees with the same audience rule', () => {
  it('a CUSTOMER report of only restricted rows refuses, without blaming IDX for an owner opt-out', () => {
    const h = boot({ version: 'customer', rows: [OWNER_OUT, PARTICIPANT] });
    try {
      const errors: string[] = h.win.validateReportState();
      expect(errors.length).toBeGreaterThan(0);
      const joined = errors.join(' ');
      expect(joined).toMatch(/eligible for the Customer report/i);
      expect(joined).not.toMatch(/All selected listings have display opted out \(IDX or Internet\)/);
    } finally { h.close(); }
  });

  it('an AGENT report of participant-only inventory is NOT called non-compliant', () => {
    const h = boot({ version: 'agent', rows: [PARTICIPANT, IDX_FALSE] });
    try {
      expect(h.win.validateReportState()).toEqual([]);
    } finally { h.close(); }
  });

  it('a mixed CUSTOMER population proceeds, and the restricted rows are simply excluded', () => {
    const h = boot({ version: 'customer', rows: [ORDINARY, OWNER_OUT] });
    try {
      expect(h.win.validateReportState()).toEqual([]);
      expect((h.win.getReportListings() as { address: string }[]).map((l) => l.address)).toEqual([ADDR.ordinary]);
    } finally { h.close(); }
  });

  it('an AGENT report of owner-opted-out inventory only is still refused', () => {
    const h = boot({ version: 'agent', rows: [OWNER_OUT] });
    try {
      expect(h.win.validateReportState().length).toBeGreaterThan(0);
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// J — the standalone client Detail sheet is on the same boundary
// ═════════════════════════════════════════════════════════════════════════════
describe('J · openClientDetailReport is a client surface and obeys the public rule', () => {
  it('a participant-only listing does not become a client Detail sheet', () => {
    const h = boot({ version: 'agent' });
    try {
      h.win.openClientDetailReport('C');
      const anyPrinted = h.cap.printed.join(' ');
      expect(anyPrinted).not.toContain(ADDR.participant);
    } finally { h.close(); }
  });

  it('an ordinary listing still produces its client Detail sheet — positive control', () => {
    const h = boot({ version: 'agent' });
    try {
      h.win.openClientDetailReport('A');
      expect(h.cap.printed.join(' ')).toContain(ADDR.ordinary);
    } finally { h.close(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// K — the artifact ships it, and C4B is not reopened (packet §Q)
// ═════════════════════════════════════════════════════════════════════════════
describe('K · the built bundle carries the gate, and C4B stands', () => {
  it('index-built.html carries the canonical helper', () => {
    expect(read('public/crm/index-built.html')).toContain('function reportListingPassesAudience');
  });

  it('the misleading "every export is client-facing" claim is corrected (packet §I)', () => {
    const src = read('public/crm/js/output/reports.js');
    expect(src).not.toContain('Every export is a client-facing advertising surface');
  });

  it('C4B search membership, cache identity and page-ceiling semantics are untouched', () => {
    expect(read('lib/search/engine/universe.ts')).toContain('if (!mallanRowPassesGate(');
    expect(read('lib/search/engine/executor.ts')).toContain('universeKeyOf(c, audience)');
    expect(read('public/crm/js/search/search-engine.js')).toContain('function _countHasExactPageCeiling');
  });
});
