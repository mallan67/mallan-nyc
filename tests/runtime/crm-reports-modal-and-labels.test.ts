/// <reference types="jest" />
export {};
/**
 * TWO REPORT-SURFACE DEFECTS, PROVED BY BEHAVIOUR.
 *
 * 1. ONE ESCAPE PRESS PERMANENTLY KILLS THE REPORTS MODAL.
 *    `#reportsModal` is shown and hidden by a CSS class: `openReportsModal()` does
 *    `classList.remove('hidden')` and `closeReportsModal()` does `classList.add('hidden')`
 *    (public/crm/js/output/reports.js). But `closeDeliveryModal()` in
 *    public/crm/js/search/search-actions.js sets an INLINE `style.display = 'none'` on that same element, and
 *    the Escape handler calls it on every press. An inline style beats a class, and nothing ever clears it — so
 *    after one Escape the modal removes `hidden` and still renders nothing, forever, for the rest of the session.
 *
 * 2. "Print" IS NOT PDF.
 *    The report workflow has no PDF generator. Print opens the browser print dialog, where the user may choose
 *    "Save as PDF" themselves. Owner instruction 2026-09-09: *"rename Print to 'Print / Save as PDF' and remove
 *    the orphan PDF controls. Do not claim PDF is supported while it exists only as unused markup."* The label
 *    must describe what the control actually does.
 *
 * Both are asserted against real DOM, not source text: the shipped function is lifted from its `.js` and
 * executed, and the partials are parsed so the assertion is on a button's rendered text.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
// `@types/jsdom` is not installed in this repo; every other runtime suite uses the require form.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Lift a shipped top-level function out of a browser bundle by brace matching, so the TEST runs the REAL code. */
function liftFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

describe('the reports modal survives an Escape press', () => {
  it('closing the delivery modal does not leave an inline style the class toggle cannot undo', () => {
    const dom = new JSDOM('<div id="reportsModal" class="hidden"></div>', { runScripts: 'outside-only' });
    const { window } = dom;
    window.eval(liftFunction(read('public/crm/js/search/search-actions.js'), 'closeDeliveryModal'));

    const modal = window.document.getElementById('reportsModal') as HTMLElement;

    // The user opens the reports modal, presses Escape, then opens it again.
    modal.classList.remove('hidden');                 // openReportsModal()
    (window as unknown as { closeDeliveryModal: () => void }).closeDeliveryModal(); // the Escape handler
    modal.classList.remove('hidden');                 // openReportsModal() a second time

    // After the second open the modal must actually be visible. An inline display:none survives the class
    // toggle, which is the whole defect.
    expect(modal.style.display).not.toBe('none');
    expect(modal.classList.contains('hidden')).toBe(false);
  });

  it('the delivery close still hides the modal when it is open', () => {
    const dom = new JSDOM('<div id="reportsModal"></div>', { runScripts: 'outside-only' });
    const { window } = dom;
    window.eval(liftFunction(read('public/crm/js/search/search-actions.js'), 'closeDeliveryModal'));
    const modal = window.document.getElementById('reportsModal') as HTMLElement;
    (window as unknown as { closeDeliveryModal: () => void }).closeDeliveryModal();
    // Hidden by the same mechanism the opener uses, so the opener can reverse it.
    expect(modal.classList.contains('hidden')).toBe(true);
  });
});

describe('the print control does not claim to generate a PDF', () => {
  it.each([
    ['public/crm/html/modals/report-preview.html'],
    ['public/crm/html/modals/reports.html'],
  ])('%s labels it "Print / Save as PDF"', (file) => {
    const doc = new JSDOM(`<body>${read(file)}</body>`).window.document;
    const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Print / Save as PDF');
    // and never advertises a bare PDF generator this workflow does not have
    expect(text).not.toMatch(/\bPrint\/PDF\b/);
  });
});
