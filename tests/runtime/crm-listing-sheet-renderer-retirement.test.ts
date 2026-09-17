/// <reference types="jest" />
/**
 * W7 — A DEAD RENDERER KEPT ALIVE SO A CHECKER COULD READ ITS SOURCE.
 *
 * generateSingleListingSheet() and generateListingSheet() had no live output caller. Retirement 1B proved
 * it: printListingSheet() and emailListingSheet() delegate to openReportsModal() and nothing else, and the
 * legacy branches that once called these renderers were deleted. The only thing still referring to them
 * was the in-browser compliance doctor, which read their SOURCE TEXT:
 *
 *     W7  generateSingleListingSheet.toString() -> 'formatCurrency' -> checks.push('print:formatCurrency')
 *                                              -> 'listing.status'  -> checks.push('print:status')
 *                                              -> 'updatedDate'     -> checks.push('print:date')
 *         generateListingSheet.toString()      -> 'REBNY'           -> checks.push('print:attribution')
 *                                              -> 'Equal Housing'   -> checks.push('print:fairHousing')
 *     C2  generateListingSheet.toString()      -> legal-footer, branding
 *
 * So the doctor reported that PRINT carried REBNY attribution and a Fair Housing notice by finding those
 * strings in a function the product no longer calls. Every one of those claims was about a renderer that
 * could not reach a page. A compliance checker asserting the presence of a legal notice from dead source
 * text is worse than no check: it is a green light with nothing behind it.
 *
 * THIS IS THE SAME CORRECTION REG-8 ALREADY MADE TO THE OTHER HALF OF W7. The comment at
 * compliance-gates-and-output.js:1578-1582 records it: four EMAIL checks read emailListingSheet.toString()
 * and were satisfied by a single comment line inside an unreachable fallback. The print half survived that
 * packet. It does not survive this one.
 *
 * WHERE THE PROOF ACTUALLY LIVES, and why removing the checks loses nothing:
 *   crm-report-outputs.test.ts:193 captures the real sink (openPrintableWindow) and asserts on the HTML it
 *   RECEIVES - RLS attribution (:481, :682), Equal Housing (:684), brokerage identity and address (:555).
 *   crm-report-audience-population.test.ts group F drives generateReport() to print and proves owner
 *   opt-out never reaches the page, that participant-only follows the report audience, and that the audit
 *   count describes the emitted population rather than the selection.
 * Those execute the workflow. The doctor's checks read a string.
 *
 * THE DOCTOR IS NOT MADE TO PRINT INSTEAD. Giving a diagnostic tool the side effect of generating output
 * would trade a false claim for a real hazard. It narrows to what it can safely observe in the loaded DOM
 * - @media print rules, page-break rules, the no-print class - and says plainly where the content proof
 * lives.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
/** Source with line comments stripped: history may name these symbols, code may not use them. */
const executable = (rel: string) =>
  read(rel).split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

const GATES = 'public/crm/js/compliance/compliance-gates-and-output.js';
const BUILT = 'public/crm/index-built.html';
const DEAD = ['generateSingleListingSheet', 'generateListingSheet'];

// ═════════════════════════════════════════════════════════════════════════════
// A — the renderers are gone from executable code
// ═════════════════════════════════════════════════════════════════════════════
describe('A · the dead listing-sheet renderers are retired', () => {
  it.each(DEAD)('%s is not defined anywhere in the CRM source', (fn) => {
    const src = executable(GATES);
    expect({ fn, defined: src.includes('function ' + fn) }).toEqual({ fn, defined: false });
  });

  it.each(DEAD)('%s is not referenced by any executable CRM code', (fn) => {
    const offenders: string[] = [];
    for (const f of ['public/crm/js/compliance/compliance-gates-and-output.js',
      'public/crm/js/output/reports.js', 'public/crm/js/output/calculators.js',
      'public/crm/js/search/pagination.js', 'public/crm/js/core/data-loader.js']) {
      if (executable(f).includes(fn)) offenders.push(f);
    }
    expect({ fn, offenders }).toEqual({ fn, offenders: [] });
  });

  it.each(DEAD)('%s is absent from the shipped artifact as executable code', (fn) => {
    // Comment-stripped for the same reason group A above is: the tombstone left in the source NAMES
    // these functions so a future reader knows what was retired and why, and build.js inlines
    // comments verbatim. What must not survive is a reference the browser can execute. Holding the
    // artifact to a stricter rule than the source would only teach the next person to delete the
    // explanation.
    const built = executable(BUILT);
    expect({ fn, inBuilt: built.includes(fn) }).toEqual({ fn, inBuilt: false });
  });

  it.each(DEAD)('the stale manifest no longer declares %s', (fn) => {
    expect(read('public/crm/scripts/manifest.json')).not.toContain('"' + fn + '"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the doctor stops certifying source text as print behaviour
// ═════════════════════════════════════════════════════════════════════════════
describe('B · no compliance check reads a renderer’s source to claim print content', () => {
  it.each(DEAD)('the doctor never calls %s.toString()', (fn) => {
    expect(executable(GATES)).not.toContain(fn + '.toString()');
  });

  it('the five source-derived print claims are gone', () => {
    // Each of these was pushed into the W7 result purely because a substring appeared in dead source.
    const src = executable(GATES);
    for (const claim of ['print:formatCurrency', 'print:status', 'print:date',
      'print:attribution', 'print:fairHousing']) {
      expect({ claim, present: src.includes(claim) }).toEqual({ claim, present: false });
    }
  });

  it('they were NOT replaced by source inspection of reports.js', () => {
    // Swapping one dead-source read for a live-source read would repeat the defect with a better subject.
    const src = executable(GATES);
    for (const banned of ['buildFullReportHTML.toString()', 'generateReport.toString()',
      'populateReportPreview.toString()', 'printReportViaIframe.toString()']) {
      expect({ banned, present: src.includes(banned) }).toEqual({ banned, present: false });
    }
  });

  it('C2 no longer claims legal-footer or branding from a renderer', () => {
    const src = executable(GATES);
    const c2 = src.slice(src.indexOf("'C2', 'Print CSS'") - 1200, src.indexOf("'C2', 'Print CSS'") + 200);
    expect(c2).not.toContain('legal-footer');
    expect(c2).not.toContain('branding');
  });

  it('C2 keeps the print facts it can actually observe in the loaded DOM', () => {
    const src = executable(GATES);
    expect(src).toContain('@media print');
    expect(src).toContain('page-break-inside');
    expect(src).toContain('.no-print');
  });

  it('the doctor was NOT given the side effect of printing to replace the bad check', () => {
    // A diagnostic that generates output is a worse defect than the claim it replaced.
    const src = executable(GATES);
    const w7 = src.slice(src.indexOf("W7: Cross-Surface Consistency"), src.indexOf("W7: Cross-Surface Consistency") + 3000);
    for (const sideEffect of ['generateReport(', 'buildFullReportHTML(', 'printReportViaIframe(',
      'openPrintableWindow(', 'window.print(']) {
      expect({ sideEffect, present: w7.includes(sideEffect) }).toEqual({ sideEffect, present: false });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — the live wrappers are unchanged by this packet
// ═════════════════════════════════════════════════════════════════════════════
describe('C · the canonical delegation from Retirement 1B still stands', () => {
  it('printListingSheet delegates exactly once to the reports workflow', () => {
    const src = executable(GATES);
    expect(src.split("openReportsModal(ids, 'print')").length - 1).toBe(1);
  });

  it('emailListingSheet delegates exactly once to the reports workflow', () => {
    const src = executable(GATES);
    expect(src.split("openReportsModal(ids, 'email')").length - 1).toBe(1);
  });

  it('neither wrapper renders anything itself', () => {
    const src = executable(GATES).replace(/\r\n/g, '\n');
    for (const fn of ['printListingSheet', 'emailListingSheet']) {
      const start = src.indexOf('function ' + fn + '()');
      const body = src.slice(start, src.indexOf('\n}', start));
      for (const banned of [...DEAD, 'openPrintableWindow', 'sendEmailDirect']) {
        expect({ fn, banned, present: body.includes(banned) }).toEqual({ fn, banned, present: false });
      }
    }
  });

  it('checkListingCompliance survives — it is live shared infrastructure, not a renderer', () => {
    expect(executable(GATES)).toContain('function checkListingCompliance');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — the real print proof is where it belongs, and still executes the sink
// ═════════════════════════════════════════════════════════════════════════════
describe('D · print content is proven behaviourally, against the real sink', () => {
  it('the report suite captures the actual print sink rather than reading source', () => {
    const t = read('tests/runtime/crm-report-outputs.test.ts');
    expect(t).toContain('function openPrintableWindow(html) { window.__cap.printed.push(html); }');
    expect(t).toContain('h.cap.printed[0]');
  });

  it('it asserts the compliance furniture on what the sink RECEIVED', () => {
    const t = read('tests/runtime/crm-report-outputs.test.ts');
    expect(t).toContain('REBNY Listing Service (RLS)');
    expect(t).toMatch(/Equal Housing Opportunity/);
    expect(t).toContain('400 East 90th Street');
  });

  it('audience gating over print is proven by driving generateReport, not by grep', () => {
    const t = read('tests/runtime/crm-report-audience-population.test.ts');
    expect(t).toContain("h.win.reportState.output = 'print'");
    expect(t).toContain('h.win.generateReport()');
  });
});
