/// <reference types="jest" />
/**
 * Sale-form save IDEMPOTENCY guardrail.
 *
 * Bug (browser QA, 2026-06-22): saving created THREE identical Active listings.
 * Root cause: a create() resolves _saleEditDbId only AFTER its await, and the
 * Save/Publish buttons were not disabled, so rapid clicks on a slow first save
 * each hit create() with _saleEditDbId still null → duplicate rows.
 *
 * Fix: a single `_saleSaveInFlight` latch + button-disable guards every save
 * path (manualSaveDraft / submitSalesListing / publishSaleListing). These static
 * guards lock the latch in so it cannot be silently removed; live behavior is
 * covered by browser QA.
 *
 * @module tests/runtime/sale-form-idempotency
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORM_PATH = resolve(__dirname, '..', '..', 'public', 'crm', 'SALE-FORM-REDESIGN.html');

function fnBody(html: string, sig: string): string {
  const start = html.indexOf(sig);
  if (start === -1) throw new Error(`not found: ${sig}`);
  // slice generously to the next top-level function declaration
  const next = html.indexOf('\nfunction ', start + sig.length);
  return html.slice(start, next === -1 ? start + 8000 : next);
}

describe('SALE-FORM-REDESIGN.html — save idempotency (no duplicate listings)', () => {
  let html: string;
  beforeAll(() => {
    html = readFileSync(FORM_PATH, 'utf8');
  });

  it('declares the in-flight latch + helpers', () => {
    expect(html).toContain('var _saleSaveInFlight = false;');
    expect(html).toContain('function _saleSaveBusy()');
    expect(html).toContain('function _setSaleSaveButtonsDisabled');
  });

  it('Save Draft and Publish buttons carry ids so they can be disabled mid-save', () => {
    expect(html).toMatch(/id="saleSaveDraftBtn"[^>]*onclick="manualSaveDraft/);
    expect(html).toMatch(/id="salePublishBtn"[^>]*onclick="publishSaleListing/);
  });

  it('submitSalesListing latches BEFORE create/update and releases in finally', () => {
    const body = fnBody(html, 'function submitSalesListing()');
    // latch is set after validation, immediately before the create/update call
    expect(body).toMatch(/_saleSaveBusy\(\)\) return;[\s\S]{0,200}_saleSaveInFlight = true;[\s\S]{0,200}var apiCall;/);
    // and released once the promise settles
    expect(body).toMatch(/\.finally\(function \(\) \{[\s\S]{0,200}_saleSaveInFlight = false;/);
  });

  it('manualSaveDraft latches BEFORE the API path and releases in finally', () => {
    const body = fnBody(html, 'async function manualSaveDraft()');
    expect(body).toMatch(/_saleSaveBusy\(\)\) return;[\s\S]{0,200}_saleSaveInFlight = true;/);
    expect(body).toMatch(/finally \{[\s\S]{0,120}_saleSaveInFlight = false;/);
  });

  it('publishSaleListing bails immediately when a save is already running', () => {
    const body = fnBody(html, 'function publishSaleListing()');
    // the guard must be the very first statement (before confirms / API calls)
    expect(body).toMatch(/function publishSaleListing\(\) \{\s*if \(_saleSaveBusy\(\)\) return;/);
  });

  it('behavioral: the REAL _saleSaveBusy latch blocks a concurrent second save → one create', () => {
    // Extract the shipped guard helper and drive it through the EXACT sequence
    // every save path uses: `if (_saleSaveBusy()) return; _saleSaveInFlight = true;`.
    // The flag is set synchronously BEFORE any await, so on single-threaded JS two
    // rapid clicks (before the async first save settles) yield exactly ONE create.
    const startIdx = html.indexOf('function _saleSaveBusy()');
    const busyFn = html.slice(startIdx, html.indexOf('\n}', startIdx) + 2);
    const runner = new Function('showToast', `
      var _saleSaveInFlight = false;
      ${busyFn}
      var creates = 0;
      function attemptSave() {
        if (_saleSaveBusy()) return;   // real shipped guard
        _saleSaveInFlight = true;      // set synchronously, exactly as the form does
        creates++;                     // models reaching MallanAPI.listings.create()
      }
      attemptSave();                   // first click → proceeds
      attemptSave();                   // second rapid click → must be blocked
      attemptSave();                   // third rapid click → must be blocked
      return creates;
    `);
    const creates = runner(() => {});
    expect(creates).toBe(1); // three clicks, ONE create → no duplicate listings
  });

  it('autosave only ever UPDATEs an existing listing (never create)', () => {
    // performAutoSave / autosave path must be gated on _saleEditMode && _saleEditDbId
    // and call update(), so it can never spawn a duplicate.
    expect(html).toMatch(/if \(_saleEditMode && _saleEditDbId\)/);
    expect(html).not.toMatch(/autoSaveTimer[\s\S]{0,400}listings\.create/);
  });
});
