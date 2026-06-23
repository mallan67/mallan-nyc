/// <reference types="jest" />
/**
 * Sale-form media manager + publish/refresh wiring guardrail (P1 packet).
 *
 * Static file-string + JS-parse checks (jest runtime is node-env; jsdom is not a
 * dependency — see auction-form-flow.test.ts). The first test parses EVERY inline
 * <script> in the form via `new Function(...)`, which fails on any brace/paren
 * error introduced by an edit — a cheap, real syntax safety net for the 10k-line
 * file. The rest lock the new behaviors.
 *
 * @module tests/runtime/sale-form-media-manager
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORM_PATH = resolve(__dirname, '..', '..', 'public', 'crm', 'SALE-FORM-REDESIGN.html');

describe('SALE-FORM-REDESIGN.html — media manager / publish / refresh (P1)', () => {
  let html: string;
  beforeAll(() => {
    html = readFileSync(FORM_PATH, 'utf8');
  });

  it('every inline <script> parses without a SyntaxError', () => {
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .filter((s) => s.trim().length > 0);
    expect(blocks.length).toBeGreaterThan(0);
    for (const body of blocks) {
      // new Function compiles (syntax-checks) without executing — browser globals
      // like document/window are never touched, so undefined refs don't matter.
      expect(() => new Function(body)).not.toThrow();
    }
  });

  it('legacy JSON render path is removed (single keyed manager)', () => {
    // The fragile regex that scraped media ids from onclick attrs must be gone.
    expect(html).not.toContain("button[onclick*=\"removeServerMedia\"]')?.getAttribute('onclick')");
    expect(html).not.toContain("data-media-idx");
  });

  it('CRM-vs-feed lanes: helper + locked feed lane + lock badge', () => {
    expect(html).toContain('function _isCrmMediaKey');
    expect(html).toContain('function _renderMediaLane');
    expect(html).toMatch(/lane === 'feed'/);
    expect(html).toContain('From MLS feed'); // locked-lane header
    expect(html).toMatch(/fa-lock[\s\S]{0,40}MLS/); // lock badge on feed tiles
  });

  it('feed photos are not draggable and have no delete/cover controls', () => {
    // tile builds drag handlers only when NOT locked, and delete only when not locked
    expect(html).toMatch(/if \(!isFloor && !locked\)/);
    expect(html).toMatch(/var delBtn = locked \? ''/);
  });

  it('reorder shows success ONLY after backend confirms rows_updated', () => {
    const fn = html.slice(html.indexOf('function _persistMediaRowOrder'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    expect(body).toContain('rows_updated');
    expect(body).toMatch(/rows > 0/);
    expect(body).toContain('skipped_trestle_keys');
    // only crm: keys are ever sent
    expect(html).toMatch(/filter\(function \(k\) \{ return _isCrmMediaKey\(k\); \}\)/);
  });

  it('delete removes the tile only after the backend confirms', () => {
    const fn = html.slice(html.indexOf('async function removeServerMedia'));
    const body = fn.slice(0, fn.indexOf('\nasync function ') > 0 ? fn.indexOf('\nasync function ') : fn.indexOf('\nfunction '));
    expect(body).toContain('await fetch');
    expect(body).toMatch(/body\.deleted/);
    expect(body).toContain('It is still saved.'); // failure keeps the photo
  });

  it('Publish action: button + function with photo gate + confirm', () => {
    expect(html).toContain('onclick="publishSaleListing()"');
    expect(html).toContain('function publishSaleListing');
    const fn = html.slice(html.indexOf('function publishSaleListing'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    expect(body).toContain('Featured'); // photo-eligibility gate text
    expect(body).toMatch(/statusEl\.value = 'Active'/);
    expect(body).toContain('submitSalesListing()'); // reuses validation+save+transition
  });

  it('Refresh action: button + function reloads saved listing, warns, no Cotality re-pull', () => {
    expect(html).toContain('onclick="refreshSaleListing()"');
    expect(html).toContain('function refreshSaleListing');
    const fn = html.slice(html.indexOf('function refreshSaleListing'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    expect(body).toContain('MallanAPI.listings.get');
    expect(body).toContain('_populateSaleFormFromApi');
    expect(body).toMatch(/unsaved changes/i);
    expect(body).toMatch(/does NOT re-pull Cotality/i);
  });

  it('Draft remains the default initial status', () => {
    expect(html).toMatch(/<option value="Draft" selected>Draft<\/option>/);
  });

  it('Save Draft AND Publish re-render keyed tiles after upload (so photos become draggable, not stacked previews)', () => {
    // Both save paths must call renderServerMediaRows() right after
    // uploadPendingMedia(), or the non-draggable upload previews persist and
    // stack up (the "can\'t sort / triple pictures" bug).
    const draft = html.slice(html.indexOf('async function manualSaveDraft()'));
    const draftBody = draft.slice(0, draft.indexOf('\nfunction '));
    expect(draftBody).toMatch(/await uploadPendingMedia\([\s\S]{0,1200}renderServerMediaRows\(/);

    const submit = html.slice(html.indexOf('function submitSalesListing()'));
    const submitBody = submit.slice(0, submit.indexOf('\nfunction validateAndNextSaleTab'));
    expect(submitBody).toMatch(/await uploadPendingMedia\([\s\S]{0,1200}renderServerMediaRows\(/);
  });
});
