/// <reference types="jest" />
/**
 * REG-8 — the in-browser compliance doctor stops certifying what it cannot observe.
 *
 * THE FALSE-PASS MECHANISM, precisely. REBNYComplianceWiringTest reported
 *
 *     Test 9 · "Print/Email Compliance" — PASS — "All 8 output checks pass"
 *
 * by calling printListingSheet.toString() and emailListingSheet.toString() and searching the returned
 * SOURCE TEXT for 'checkListingCompliance', 'logAuditEntry', 'formatCurrency', 'updatedDate' and 'REBNY'.
 * W7 "Cross-Surface Consistency" did the same for its four email checks.
 *
 * Both functions early-return into openReportsModal(...) — emailListingSheet at
 * compliance-gates-and-output.js:319, printListingSheet at :228 — so every token it searched for sat in
 * unreachable fallback code. Three of them (formatCurrency, updatedDate, REBNY) appeared ONLY inside a
 * single comment line. Function.prototype.toString() returns comments and dead branches alike, so:
 *
 *   - deleting the live gate, the live audit call, the live price formatting and the live attribution
 *     would have left every one of those checks GREEN;
 *   - rewording one comment would have turned four of them RED.
 *
 * It measured the wrong branch of the wrong function, and reported the result as a compliance
 * certification. A truthful narrow PASS is worth more than an unsupported broad one.
 *
 * WHERE THE REAL PROOF LIVES NOW: tests/runtime/crm-report-outputs.test.ts boots the actual workflow —
 * generateReport() -> getReportListings() -> buildFullReportHTML() -> wrapReportForEmail() ->
 * sendEmailDirect(), and the print equivalent — and asserts on what the transport and the print sink
 * actually receive, each with a positive control.
 *
 * SCOPE: this repairs EVIDENCE, not behaviour. The early-return delegation is untouched and the legacy
 * fallback is untouched. C4C — getReportListings() not screening ownerOptOut / participantOnly — was open
 * when this file was written and has since landed; the assertion below tracks the closed behaviour.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOCTOR = 'public/crm/js/compliance/compliance-gates-and-output.js';
const BUILT = 'public/crm/index-built.html';

/** The doctor's own source, comments stripped — we are asserting about its executable assertions. */
const stripComments = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const doctorCode = stripComments(read(DOCTOR));

describe('A · the doctor no longer reads the source text of the two delegating output functions', () => {
  it.each(['printListingSheet', 'emailListingSheet'])(
    'it never calls %s.toString()',
    (fn) => {
      expect(doctorCode).not.toContain(`${fn}.toString()`);
    }
  );

  it('the compliance tokens it used to search for are no longer searched in that source text', () => {
    // The exact shape of the defect: indexOf over a function body. If any of these return, the doctor is
    // certifying unreachable code again.
    const offenders = ["indexOf('checkListingCompliance')", "indexOf('logAuditEntry')"]
      .filter((needle) => doctorCode.includes(needle));
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('it no longer CLAIMS "All 8 output checks pass"', () => {
    // Comment-stripped on BOTH sides. The replacement's own explanation quotes the retired
    // string so the next reader knows what was removed and why; a raw scan would flag that
    // documentation as the defect it documents. This trap has now bitten three times.
    expect(doctorCode).not.toContain('All 8 output checks pass');
    expect(stripComments(read(BUILT))).not.toContain('All 8 output checks pass');
  });

  it('W7 no longer derives email compliance from emailListingSheet source', () => {
    // The four checks that were satisfied by one comment line.
    for (const label of ['email:status', 'email:date', 'email:formatCurrency', 'email:attribution']) {
      expect(doctorCode).not.toContain(label);
    }
  });
});

describe('B · what the doctor says instead is narrower and true', () => {
  it('a Print/Email result still exists — the claim was narrowed, not deleted', () => {
    // Silently dropping the row would hide a compliance surface from the operator. It stays; it just stops
    // certifying output content it cannot see from the browser.
    expect(doctorCode).toContain("'Print/Email Compliance'");
  });

  it('it verifies the DELEGATION, which is a fact it can actually observe at runtime', () => {
    // typeof openReportsModal is observable in the live page; the contents of an emailed report are not.
    expect(doctorCode).toContain('openReportsModal');
  });

  it('its detail text points at where the real proof lives, so the narrower claim is not mistaken for a gap', () => {
    expect(read(DOCTOR)).toContain('crm-report-outputs');
  });
});

describe('C · the repair changed evidence only — the live delegation is untouched', () => {
  it('emailListingSheet still early-returns into the canonical reports modal', () => {
    const src = read(DOCTOR);
    expect(src).toContain('function emailListingSheet()');
    expect(src).toContain("openReportsModal(ids, 'email')");
  });

  it('printListingSheet still early-returns into the canonical reports modal', () => {
    const src = read(DOCTOR);
    expect(src).toContain('function printListingSheet()');
    expect(src).toContain("openReportsModal(ids, 'print')");
  });

  it('the legacy fallback outlived REG-8 and was retired later, by its own packet', () => {
    // WHEN REG-8 LANDED this asserted the fallback was still PRESENT. That was the point: REG-8 repaired
    // EVIDENCE, and deleting live-file code would have been a behaviour change outside its authorization,
    // so the pin proved the tidy-up had not been smuggled in.
    //
    // Retirement 1B removed it under its own authorization, after proving by control flow that the live
    // Print and Email buttons never reach it. The pin flips to the new truth rather than being deleted,
    // so the boundary it guarded stays legible: REG-8 touched no behaviour, 1B did — deliberately.
    const src = read(DOCTOR);
    expect(src).not.toContain('Legacy fallback');
    // What replaced it: two thin wrappers that fail closed rather than falling back.
    expect(src).toContain("openReportsModal(ids, 'print')");
    expect(src).toContain("openReportsModal(ids, 'email')");
    expect(src).not.toContain('function previewListingSheet');
  });

  it('C4C has landed: getReportListings defers to the one report-audience helper', () => {
    // Same CRLF-blind slice as the other two pins: '\n        }' never matched, so this was scanning far
    // more than the function it named. Normalised, and pointed at the requirement rather than the gap.
    const reports = read('public/crm/js/output/reports.js').replace(/\r\n/g, '\n');
    const start = reports.indexOf('function getReportListings()');
    const body = reports.slice(start, reports.indexOf('\n        }', start));
    expect(body).toContain('reportListingPassesAudience');
    expect(reports).toContain('function reportListingPassesAudience');
  });

  it('the bulk-export population gate is neither weakened nor deleted', () => {
    const t = read('tests/runtime/crm-bulk-export-population-gate.test.ts');
    expect(t.length).toBeGreaterThan(500);
    expect(t).toMatch(/ownerOptOut|owner_opt_out/);
  });
});
