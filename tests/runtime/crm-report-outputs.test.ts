/// <reference types="jest" />
/**
 * THE REPORT / EXPORT / DELIVERY WORKFLOW — the five outputs behind "Generate & Send".
 *
 * Audit: docs/status/crm-audit-2026-09-09/cma-buttons-and-pdf.md, defects D9 and D13–D15.
 *
 * The rule this file enforces is one sentence: THE UI MAY NOT REPORT SUCCESS FOR SOMETHING THAT DID NOT
 * HAPPEN. Three of the five outputs violated it.
 *
 *   D15  Email — with EmailJS unconfigured, `sendEmailDirect()` waited 1.2s and rendered a green check
 *        reading "Email sent (simulated)", after `generateReport()` had already closed the modal. An agent
 *        walked away believing a client had the report. Nothing had been sent.
 *   D14  Shareable Link — the clipboard received `https://mallan.nyc/reports/view?config=…`. `app/reports/`
 *        does not exist in this repo, so that link 404s for whoever it is sent to; the workflow still closed
 *        the modal and wrote a `report_shareable_link` success audit.
 *   D13  Excel — the download was an HTML `<table>` string saved as `.xls`. Excel opens it behind a
 *        "the file format and extension don't match" warning.
 *   D9   PDF — no output produces one. `switch (output) { … case 'email': default: }` meant any output the
 *        workflow does not implement fell through to the email branch and silently emailed instead.
 *
 * EVERY assertion below runs the SHIPPED function — `public/crm/js/output/reports.js` evaluated verbatim in
 * a real DOM built from the SHIPPED modal markup — and asserts on what it produced: the rendered DOM, the
 * bytes of the downloaded file, the audit entries written, the clipboard. No test greps source text for a
 * behaviour claim. The Excel bytes are read back with `exceljs`, the workbook library this repo already
 * depends on, so "it is a real workbook" is proven by a real spreadsheet reader, not by a magic number
 * alone.
 */
export {};
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const ExcelJS: any = require('exceljs');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

// ── Two rows with everything the exporters read. A sale and a rental, both Closed, so the transaction-aware
//    broker language ("Sold" vs "Rented") is exercised by the same token. ──────────────────────────────────
const SALE_ROW = {
  id: 'L1',
  lid: 'RLS-1',
  address: '432 Park Avenue',
  unit: '55A',
  status: 'Closed',
  status_transaction: 'sale',
  listingCategory: 'sale',
  listingType: 'Condo',
  price: 12500000,
  beds: 3,
  baths: 4,
  intSqft: 4000,
  dom: 41,
  description: 'Park Avenue condominium.',
  privateRemarks: 'AGENT ONLY — seller is motivated',
  agentName: 'Maya Allan',
  images: [],
  idxDisplayYN: true,
  internetDisplayYN: true,
};
const RENTAL_ROW = {
  id: 'L2',
  lid: 'RLS-2',
  address: '15 Hudson Yards',
  unit: '32C',
  status: 'Closed',
  status_transaction: 'rent',
  listingCategory: 'rental',
  listingType: 'Rental',
  price: 9500,
  beds: 2,
  baths: 2,
  intSqft: 1200,
  dom: 12,
  description: 'Hudson Yards rental.',
  privateRemarks: 'AGENT ONLY — landlord pays',
  agentName: 'Maya Allan',
  images: [],
  idxDisplayYN: true,
  internetDisplayYN: true,
};
// A row whose status cannot be resolved: it must never be advertised as live inventory.
const STATUSLESS_ROW = { ...SALE_ROW, id: 'L3', lid: 'RLS-3', address: '1 Blank Street', status: '', status_transaction: 'sale' };

type Capture = {
  audits: { action: string; detail: Record<string, unknown> }[];
  blobs: { type: string; bytes: number[]; text: string }[];
  clicks: { download: string }[];
  clipboard: string[];
  printed: string[];
  toasts: string[];
  emailjs: { sent: Record<string, unknown>[] };
};

type Harness = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  win: any;
  cap: Capture;
  close: () => void;
};

/**
 * The SHIPPED reportState initialiser, lifted verbatim from js/core/data-loader.js rather than retyped.
 *
 * This harness previously seeded `options: {}`. That is not a configuration any agent can produce:
 * reports.js:40 reverse-syncs every Customize checkbox FROM reportState.options, so an empty object
 * silently unchecked the whole panel — including `fullListingAddress`, which the shipped default has ON
 * and the modal markup carries as `checked`. Every assertion about report CONTENT was therefore being
 * made against a report with its content options switched off.
 *
 * Reading the real block keeps the two from drifting: if the shipped defaults change, these tests change
 * with them instead of quietly testing a fiction.
 */
const CANONICAL_REPORT_STATE = (() => {
  const dl = read('public/crm/js/core/data-loader.js');
  const start = dl.indexOf('var reportState = {');
  if (start === -1) throw new Error('canonical reportState initialiser not found in data-loader.js');
  const MARKER = '\n        };';
  const end = dl.indexOf(MARKER, start);
  if (end === -1) throw new Error('canonical reportState initialiser is unterminated');
  return dl.slice(start, end + MARKER.length);
})();

function boot(opts: { emailConfigured?: boolean; rows?: Record<string, unknown>[]; version?: string } = {}): Harness {
  const rows = opts.rows ?? [SALE_ROW, RENTAL_ROW];
  // Both shipped partials: the reports modal drives the workflow, the preview modal holds the nine format
  // panels that buildFullReportHTML() renders the printed / emailed body from.
  const modal = read('public/crm/html/modals/reports.html') + read('public/crm/html/modals/report-preview.html');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${modal}</body></html>`, {
    url: 'http://localhost/crm/',
    runScripts: 'dangerously',
    virtualConsole,
  });
  const win = dom.window;

  const cap: Capture = { audits: [], blobs: [], clicks: [], clipboard: [], printed: [], toasts: [], emailjs: { sent: [] } };

  // ── Capture the produced file without changing how the shipped code produces it: the real Blob is still
  //    constructed, we simply keep its parts so the bytes can be inspected. ──
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
  const realAnchorClick = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function (this: { download: string }) {
    cap.clicks.push({ download: this.download });
    // Deliberately NOT delegating to the real click: jsdom would try to navigate to the blob: URL.
    void realAnchorClick;
  };
  win.navigator.clipboard = { writeText: (t: string) => { cap.clipboard.push(t); return Promise.resolve(); } };
  win.prompt = (_msg: string, value: string) => { cap.clipboard.push(value); return value; };

  win.__cap = cap;
  win.__emailConfigured = opts.emailConfigured === true;
  win.__rows = JSON.parse(JSON.stringify(rows));

  // Globals the CRM page owns elsewhere (dashboard, search, email service). Everything reports.js itself
  // declares is left to reports.js.
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
    // A pure colour-palette helper from js/render/render-grid.js; nothing under test depends on its values.
    function getListingColor(id) { return { bg: '#f8fafc', accent: '#94a3b8', icon: '#cbd5e1' }; }
    function openPrintableWindow(html) { window.__cap.printed.push(html); }
    function sendViaEmailJS(params) {
      if (!window.__emailConfigured) return Promise.reject(new Error('Email not configured'));
      window.__cap.emailjs.sent.push(params);
      return Promise.resolve({ status: 200 });
    }
    function checkListingCompliance() { return { ok: true, violations: [] }; }
  `);

  // THE one browser status presentation authority, the shipped RESO field map (ownershipLabel /
  // getListingPhoto, which the report formats call), then the shipped report workflow — all verbatim.
  win.eval(read('public/crm/js/core/status-presentation.js'));
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/output/reports.js'));

  // showReportToast is reports.js's own; record what it renders into the DOM.
  const realToast = win.showReportToast;
  win.showReportToast = function (msg: string) { cap.toasts.push(String(msg)); return realToast.call(win, msg); };

  win.openReportsModal(rows.map((r) => r.id));
  return { win, cap, close: () => win.close() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 1600) { await sleep(ms); }

const isHidden = (h: Harness) => h.win.document.getElementById('reportsModal').classList.contains('hidden');
const errorText = (h: Harness) => {
  const el = h.win.document.getElementById('reportErrors');
  return el.classList.contains('hidden') ? '' : (el.textContent || '').trim();
};
const lastBlob = (h: Harness) => h.cap.blobs[h.cap.blobs.length - 1];
const lastDownload = (h: Harness) => h.cap.clicks[h.cap.clicks.length - 1];

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D13 — Excel
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('D13 · the Excel output is a real workbook', () => {
  jest.setTimeout(60_000);

  it('the downloaded file starts with the OOXML/ZIP magic number and is named .xlsx — not an HTML table wearing a .xls extension', () => {
    const h = boot();
    try {
      h.win.exportReportExcel();
      const blob = lastBlob(h);
      expect(blob).toBeDefined();
      // An HTML table saved as .xls starts with "<html"; a workbook starts with PK\x03\x04.
      expect(blob.text.slice(0, 5)).not.toBe('<html');
      expect(blob.bytes.slice(0, 4)).toEqual([0x50, 0x4b, 0x03, 0x04]);
      expect(lastDownload(h).download).toMatch(/\.xlsx$/);
      expect(blob.type).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } finally { h.close(); }
  });

  it('exceljs opens the exported file and reads back the exported header and rows', async () => {
    const h = boot();
    try {
      h.win.exportReportExcel();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(Uint8Array.from(lastBlob(h).bytes)));
      const ws = wb.worksheets[0];
      expect(ws).toBeDefined();

      const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ''));
      expect(headers).toContain('Status');
      expect(headers).toContain('Price');

      // Rows come out in the report's own sort order (price ascending), so assert on the set.
      const priceCol = headers.indexOf('Price') + 1;
      const prices = [ws.getRow(2).getCell(priceCol).value, ws.getRow(3).getCell(priceCol).value];
      // A price must survive as a NUMBER, not a string — that is what makes it a workbook rather than a table.
      for (const p of prices) expect(typeof p).toBe('number');
      expect(prices.slice().sort((a, b) => Number(a) - Number(b))).toEqual([9500, 12500000]);
    } finally { h.close(); }
  });

  it('the Status column carries the transaction-aware broker label from the one status authority: a sale Closed reads Sold, a rental Closed reads Rented', async () => {
    const h = boot();
    try {
      h.win.exportReportExcel();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(Uint8Array.from(lastBlob(h).bytes)));
      const ws = wb.worksheets[0];
      const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ''));
      const statusCol = headers.indexOf('Status') + 1;
      expect(statusCol).toBeGreaterThan(0);

      const cells = [String(ws.getRow(2).getCell(statusCol).value), String(ws.getRow(3).getCell(statusCol).value)];
      expect(cells).toContain('Sold');
      expect(cells).toContain('Rented');
      // The raw token and the retired uppercase vocabulary must not reach a client's spreadsheet.
      expect(cells).not.toContain('Closed');
      expect(cells).not.toContain('CLOSED');
    } finally { h.close(); }
  });

  it('an unresolvable status exports as "Status unavailable" — never as Active', async () => {
    const h = boot({ rows: [STATUSLESS_ROW] });
    try {
      h.win.exportReportExcel();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(Uint8Array.from(lastBlob(h).bytes)));
      const ws = wb.worksheets[0];
      const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ''));
      const statusCol = headers.indexOf('Status') + 1;
      expect(String(ws.getRow(2).getCell(statusCol).value)).toBe('Status unavailable');
    } finally { h.close(); }
  });

  it('the customer version workbook still drops agent-only fields', async () => {
    const h = boot({ version: 'customer' });
    try {
      // Turn on the Private Remarks column the agent version would export.
      const cb = h.win.document.querySelector('#reportSalesFields .report-field[data-field="privateRemarks"]');
      if (cb) cb.checked = true;
      h.win.exportReportExcel();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(Uint8Array.from(lastBlob(h).bytes)));
      const ws = wb.worksheets[0];
      const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ''));
      expect(headers).not.toContain('Private Remarks');
      let seen = '';
      ws.eachRow((row: { eachCell: (cb: (c: { value: unknown }) => void) => void }) => row.eachCell((c) => { seen += String(c.value ?? ''); }));
      expect(seen).not.toContain('AGENT ONLY');
    } finally { h.close(); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D14 — Shareable Link
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('D14 · Shareable Link never claims a link was created', () => {
  jest.setTimeout(60_000);

  it('the premise: the /reports/view page the old link pointed at does not exist in this repo', () => {
    const candidates = ['app/reports/view/page.tsx', 'app/reports/view/page.ts', 'app/reports/page.tsx'];
    expect(candidates.some((c) => existsSync(resolve(ROOT, c)))).toBe(false);
  });

  it('choosing Shareable Link renders an error, keeps the modal open, copies nothing, and writes no success audit', () => {
    const h = boot();
    try {
      h.win.reportState.output = 'share';
      h.win.generateReport();

      expect(h.cap.clipboard).toEqual([]);
      expect(isHidden(h)).toBe(false);
      expect(errorText(h)).toMatch(/shareable link/i);
      expect(errorText(h)).toMatch(/not available|unavailable|not deployed/i);

      const actions = h.cap.audits.map((a) => a.action);
      expect(actions).not.toContain('report_shareable_link');
      const generated = h.cap.audits.filter((a) => a.action === 'report_generate');
      expect(generated).toEqual([]);
      // And no toast may congratulate the agent.
      expect(h.cap.toasts.join(' ')).not.toMatch(/copied|clipboard/i);
    } finally { h.close(); }
  });

  it('nothing anywhere in the workflow still hands out a mallan.nyc/reports/view URL', () => {
    const h = boot();
    try {
      h.win.reportState.output = 'share';
      h.win.generateReport();
      try { h.win.generateShareableLink(); } catch { /* refusing by throwing is acceptable */ }
      const everything = h.cap.clipboard.join(' ') + ' ' + h.win.document.body.innerHTML;
      expect(everything).not.toContain('/reports/view');
    } finally { h.close(); }
  });

  it('the Shareable Link tile is disabled when the modal opens, so a dead output cannot be chosen', () => {
    const h = boot();
    try {
      const tile = h.win.document.querySelector('[data-step="output"] .report-tile[data-value="share"]');
      expect(tile).not.toBeNull();
      expect(tile.disabled).toBe(true);
      expect((tile.textContent || '').toLowerCase()).toMatch(/unavailable/);
    } finally { h.close(); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D15 — Email
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('D15 · Email never simulates a send and calls it delivered', () => {
  jest.setTimeout(60_000);

  it('with delivery unconfigured, the real Generate & Send button refuses BEFORE the modal closes', async () => {
    const h = boot({ emailConfigured: false });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';

      const btn = h.win.document.querySelector('button[onclick="generateReport()"]');
      expect(btn).not.toBeNull();
      btn.click();
      await settle();

      expect(isHidden(h)).toBe(false);
      expect(errorText(h)).toMatch(/email/i);
      expect(errorText(h)).toMatch(/not configured|cannot send|unavailable/i);
      expect(h.win.document.getElementById('emailSendingOverlay')).toBeNull();

      const actions = h.cap.audits.map((a) => a.action);
      expect(actions).not.toContain('email_sent');
      expect(h.cap.audits.filter((a) => a.action === 'report_generate')).toEqual([]);

      const stored = JSON.parse(h.win.localStorage.getItem('sentEmails_agent-1') || '[]');
      expect(stored.filter((r: { status: string }) => r.status === 'delivered')).toEqual([]);
    } finally { h.close(); }
  });

  it('sendEmailDirect itself never renders a green "sent" for a send that did not happen', async () => {
    const h = boot({ emailConfigured: false });
    try {
      h.win.sendEmailDirect({ to: 'client@example.com', toName: 'Client', subject: 'Report', htmlBody: '<p>x</p>', listingIds: ['L1'], count: 1, source: 'test' });
      await settle();

      const msg = h.win.document.getElementById('emailSendingMsg');
      const rendered = msg ? (msg.textContent || '') : '';
      expect(rendered).not.toMatch(/sent|delivered/i);
      expect(rendered).toMatch(/not configured|not sent|could not|failed/i);
      expect(rendered).not.toMatch(/simulated/i);

      const delivered = h.cap.audits.filter((a) => a.action === 'email_sent' && (a.detail as { method?: string }).method !== 'emailjs');
      expect(delivered).toEqual([]);
      const stored = JSON.parse(h.win.localStorage.getItem('sentEmails_agent-1') || '[]');
      expect(stored.filter((r: { status: string; method: string }) => r.status === 'delivered' || r.method === 'simulated')).toEqual([]);
    } finally { h.close(); }
  });

  it('POSITIVE CONTROL — with EmailJS configured the send still happens, still closes the modal, and is audited as delivered', async () => {
    const h = boot({ emailConfigured: true });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      expect(h.cap.emailjs.sent.length).toBe(1);
      expect(h.cap.emailjs.sent[0].to_email).toBe('client@example.com');
      expect(isHidden(h)).toBe(true);
      const msg = h.win.document.getElementById('emailSendingMsg');
      expect(msg && msg.textContent).toMatch(/delivered/i);
      const sent = h.cap.audits.filter((a) => a.action === 'email_sent');
      expect(sent.length).toBe(1);
      expect((sent[0].detail as { method?: string }).method).toBe('emailjs');
    } finally { h.close(); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D9 — PDF / Print honesty
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('D9 · no control claims a PDF it cannot produce, and no unimplemented output is silently emailed', () => {
  jest.setTimeout(60_000);

  it('an output the workflow does not implement is REFUSED — it does not fall through to the email branch', async () => {
    const h = boot({ emailConfigured: true });
    try {
      // 'pdf' is the obvious one an agent or a future tile would ask for. The workflow has no PDF renderer.
      h.win.reportState.output = 'pdf';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.generateReport();
      await settle();

      expect(h.cap.emailjs.sent).toEqual([]);
      expect(isHidden(h)).toBe(false);
      expect(errorText(h)).toMatch(/pdf/i);
      expect(h.cap.audits.filter((a) => a.action === 'report_generate')).toEqual([]);
    } finally { h.close(); }
  });

  it('the Print output tells the agent how to actually get a PDF file, and the printable page says so too', () => {
    const h = boot();
    try {
      h.win.reportState.output = 'print';
      h.win.generateReport();

      expect(h.cap.printed.length).toBe(1);
      const page = h.cap.printed[0];
      expect(page).toMatch(/Save as PDF/i);
      expect(h.cap.toasts.join(' ')).toMatch(/Save as PDF/i);
      // and the print output is still the real report, not an empty shell: both seeded listings, the RLS
      // attribution and the commission disclosure are all in the page the print tab receives.
      expect(page).toContain('$12,500,000');
      expect(page).toContain('Park Avenue condominium.');
      expect(page).toContain('$9,500/mo');
      expect(page).toContain('REBNY Listing Service (RLS)');
      expect(page).toMatch(/Commission rates are not set by law/);
    } finally { h.close(); }
  });

  it('the CSV output stays honest, and carries the same broker status language as the workbook', () => {
    const h = boot();
    try {
      h.win.reportState.output = 'csv';
      h.win.generateReport();
      const csv = lastBlob(h).text;
      expect(lastDownload(h).download).toMatch(/\.csv$/);
      expect(csv).toContain('"Status"');
      expect(csv).toContain('12500000');
      // One status authority means CSV and Excel cannot disagree.
      expect(csv).toContain('"Sold"');
      expect(csv).toContain('"Rented"');
      expect(csv).not.toContain('"Closed"');
      expect(h.cap.audits.map((a) => a.action)).toContain('report_csv_export');
      expect(isHidden(h)).toBe(true);
    } finally { h.close(); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// REG-8 — the live report path is the evidence, because the old evidence was source text
//
// WHAT WAS WRONG. The in-browser compliance doctor certified "Print/Email Compliance — All 8 output checks
// pass" by reading printListingSheet.toString() and emailListingSheet.toString() and looking for the
// strings checkListingCompliance, logAuditEntry, formatCurrency, updatedDate and REBNY. Both functions
// early-return into openReportsModal(...), so every one of those tokens sat in unreachable fallback code —
// and three of them (formatCurrency, updatedDate, REBNY) existed only inside a COMMENT on one line. The
// checks would have stayed green if the live output had no gate, no audit, no formatted price and no
// attribution at all, and would have gone red if someone reworded that comment. They measured the wrong
// branch of the wrong function.
//
// WHAT REPLACES IT. These tests run the real workflow — generateReport() -> getReportListings() ->
// buildFullReportHTML() -> wrapReportForEmail() -> sendEmailDirect(), and the print equivalent — and
// assert on what the transport and the print sink actually receive. Every assertion has a positive
// control, because "the output contained the word REBNY" is only evidence if something would have made it
// absent.
//
// WHAT THIS DOES NOT DO. C4C is untouched and still open: getReportListings() screens idxDisplayYN and
// internetDisplayYN but does NOT screen ownerOptOut / participantOnly, so those can still reach
// print/CSV/XLSX/preview. The last group below pins that gap open deliberately rather than letting a
// green REG-8 suite imply it was fixed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The compliance content the live email/print body is required to carry. */
const sentBody = (h: Harness) => String((h.cap.emailjs.sent[0] || {}).message_html || '');

describe('REG-8 · the EMAIL a client receives, asserted on the wire', () => {
  it('carries the generated report — listings, formatted money, attribution and brokerage identity', async () => {
    const h = boot({ emailConfigured: true });
    try {
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      expect(h.cap.emailjs.sent.length).toBe(1);
      const body = sentBody(h);

      // The listings themselves.
      expect(body).toContain('432 Park Avenue');
      expect(body).toContain('15 Hudson Yards');
      // Money formatted by the workflow, never raw.
      expect(body).toContain('$12,500,000');
      expect(body).not.toMatch(/>\s*12500000\s*</);
      // REBNY/RLS attribution in the live output — not in a comment about the live output.
      expect(body).toContain('REBNY Listing Service (RLS)');
      expect(body).toMatch(/Equal Housing Opportunity/i);
      // NY DOS 19 NYCRR 175.25 brokerage identity.
      expect(body).toContain('Mallan Real Estate Inc.');
      expect(body).toContain('400 East 90th Street');
      expect(body).toMatch(/Commission rates are not set by law/);
    } finally { h.close(); }
  });

  it('renders STATUS through the one status authority, in the format that displays it', async () => {
    // The default 'grid' format shows no status badge at all, so asserting Sold/Rented against it would
    // have been a wrong expectation rather than a compliance finding. 'list' is the format whose builder
    // calls statusBadge() -> MallanStatus, and it is transaction-aware: a Closed SALE reads Sold, a
    // Closed RENTAL reads Rented.
    const h = boot({ emailConfigured: true });
    try {
      h.win.reportState.format = 'list';
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      const body = sentBody(h);
      expect(body).toMatch(/Sold/);
      expect(body).toMatch(/Rented/);
    } finally { h.close(); }
  });

  it('renders the listed date when the agent enables that content option', async () => {
    // updatedSoldDate is OFF in the shipped defaults, so this proves the option actually drives the live
    // output rather than asserting a date the default report never promised.
    const DATED = { ...SALE_ROW, listedDate: '2026-08-01' };
    const h = boot({ emailConfigured: true, rows: [DATED] });
    try {
      h.win.reportState.format = 'comparison';
      // Tick the real Customize checkbox rather than writing reportState directly: generateReport() calls
      // syncUIToReportState() first, which re-reads every checkbox, so a programmatic option is discarded.
      // That round-trip is itself worth exercising — it is how the agent's choice actually reaches output.
      const box = h.win.document.querySelector('#optionalContentOptions input[data-option="updatedSoldDate"]');
      expect(box).not.toBeNull();
      box.checked = true;
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      const body = sentBody(h);
      expect(body).toContain('Listed Date');
      expect(body).toContain('2026-08-01');
    } finally { h.close(); }
  });

  it('NON-VACUITY — the emailed body really is buildFullReportHTML output, not a fallback', async () => {
    // The precise failure the old test could not see: if the live path stopped using the generated report,
    // a toString() scan would not notice. Replace the generator and watch the wire change.
    const h = boot({ emailConfigured: true });
    try {
      const SENTINEL = 'REG8-GENERATED-BODY-SENTINEL';
      h.win.buildFullReportHTML = () => '<div>' + SENTINEL + '</div>';
      h.win.reportState.output = 'email';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      const body = sentBody(h);
      expect(body).toContain(SENTINEL);
      // The report body was swapped, so the listing content must be gone — proving the previous test's
      // assertions came from the generator and not from the surrounding email chrome.
      expect(body).not.toContain('432 Park Avenue');
      // The wrapper's own compliance furniture still surrounds it, which is where attribution lives.
      expect(body).toContain('REBNY Listing Service (RLS)');
    } finally { h.close(); }
  });

  it('resolves the recipient from the canonical client population', async () => {
    const h = boot({ emailConfigured: true });
    try {
      h.win.customerDB['c1'] = { id: 'c1', name: 'Jane Buyer', email: 'jane@example.com' };
      const sel = h.win.document.getElementById('reportRecipientClient');
      sel.innerHTML = '<option value="">—</option><option value="c1">Jane Buyer</option>';
      sel.value = 'c1';
      h.win.reportState.output = 'email';
      h.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      expect(h.cap.emailjs.sent.length).toBe(1);
      expect(h.cap.emailjs.sent[0].to_email).toBe('jane@example.com');
      expect(String(h.cap.emailjs.sent[0].to_name)).toContain('Jane');
    } finally { h.close(); }
  });

  it('delivery is audited only AFTER the configured transport accepted it', async () => {
    const configured = boot({ emailConfigured: true });
    try {
      configured.win.reportState.output = 'email';
      configured.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      configured.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();
      expect(configured.cap.audits.filter((a) => a.action === 'email_sent').length).toBe(1);
    } finally { configured.close(); }

    // The control: same click, no transport. Nothing sent, nothing audited as delivered, modal still open.
    const unconfigured = boot({ emailConfigured: false });
    try {
      unconfigured.win.reportState.output = 'email';
      unconfigured.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      unconfigured.win.document.querySelector('button[onclick="generateReport()"]').click();
      await settle();

      expect(unconfigured.cap.emailjs.sent.length).toBe(0);
      expect(unconfigured.cap.audits.filter((a) => a.action === 'email_sent').length).toBe(0);
      expect(unconfigured.cap.audits.filter((a) => a.action === 'report_generate').length).toBe(0);
      expect(isHidden(unconfigured)).toBe(false);
      expect(errorText(unconfigured)).toMatch(/not configured/i);
      // And it is recorded as a refusal rather than silently dropped.
      expect(unconfigured.cap.audits.filter((a) => a.action === 'report_email_blocked').length).toBe(1);
    } finally { unconfigured.close(); }
  });
});

describe('REG-8 · the PRINT output, asserted on what the print sink receives', () => {
  it('carries the listings, formatted money, attribution, brokerage identity and the disclosures', () => {
    const h = boot();
    try {
      h.win.reportState.output = 'print';
      h.win.generateReport();

      expect(h.cap.printed.length).toBe(1);
      const page = h.cap.printed[0];
      expect(page).toContain('432 Park Avenue');
      expect(page).toContain('$12,500,000');
      expect(page).toContain('REBNY Listing Service (RLS)');
      expect(page).toContain('Mallan Real Estate Inc.');
      expect(page).toMatch(/Equal Housing Opportunity/i);
      expect(page).toMatch(/Commission rates are not set by law/);
      // Still the real printable workflow, not a silent PDF claim.
      expect(page).toMatch(/Save as PDF/i);
    } finally { h.close(); }
  });

  it('NON-VACUITY — the printed page really is buildFullReportHTML output', () => {
    const h = boot();
    try {
      const SENTINEL = 'REG8-PRINT-BODY-SENTINEL';
      h.win.buildFullReportHTML = () => '<div>' + SENTINEL + '</div>';
      h.win.reportState.output = 'print';
      h.win.generateReport();

      expect(h.cap.printed.length).toBe(1);
      expect(h.cap.printed[0]).toContain(SENTINEL);
      expect(h.cap.printed[0]).not.toContain('432 Park Avenue');
    } finally { h.close(); }
  });

  it('print does not silently become an email', () => {
    const h = boot({ emailConfigured: true });
    try {
      h.win.reportState.output = 'print';
      h.win.document.getElementById('reportRecipientEmail').value = 'client@example.com';
      h.win.generateReport();

      expect(h.cap.printed.length).toBe(1);
      expect(h.cap.emailjs.sent.length).toBe(0);
      const audits = h.cap.audits.filter((a) => a.action === 'report_generate');
      expect(audits.length).toBe(1);
      expect((audits[0].detail as { output?: string }).output).toBe('print');
    } finally { h.close(); }
  });
});

describe('REG-8 · C4C stays open — this packet repaired evidence, not distribution', () => {
  it('getReportListings still screens ONLY idxDisplayYN / internetDisplayYN — ownerOptOut and participantOnly are not filtered', () => {
    // Deliberately a characterisation test, not a requirement. It documents the CURRENT behaviour so a
    // green REG-8 suite cannot be read as "report distribution is correct". The fix is C4C and is not
    // authorised here; if this assertion ever starts failing because the screen was widened, that is C4C
    // landing and this test should be replaced by the real one rather than relaxed.
    const src = read('public/crm/js/output/reports.js');
    const fn = src.slice(src.indexOf('function getReportListings()'));
    const body = fn.slice(0, fn.indexOf('\n        }'));
    expect(body).toMatch(/idxDisplayYN/);
    expect(body).toMatch(/internetDisplayYN/);
    expect({ ownerOptOut: /ownerOptOut/.test(body), participantOnly: /participantOnly/.test(body) })
      .toEqual({ ownerOptOut: false, participantOnly: false });
  });

  it('an ownerOptOut row still reaches the printed output — C4C, confirmed and left visible', () => {
    // CONFIRMATION of the registered defect, recorded per the packet's instruction to surface rather than
    // silently fix. A row the owner opted out of is still rendered into a client-facing print body.
    const OPTED_OUT = { ...SALE_ROW, id: 'L9', lid: 'RLS-9', address: '9 Opted Out Lane', ownerOptOut: true };
    const h = boot({ rows: [OPTED_OUT] });
    try {
      h.win.reportState.output = 'print';
      h.win.generateReport();
      expect(h.cap.printed.length).toBe(1);
      // If this ever stops containing the address, C4C has been fixed — update this test, do not delete it.
      expect(h.cap.printed[0]).toContain('9 Opted Out Lane');
    } finally { h.close(); }
  });
});
