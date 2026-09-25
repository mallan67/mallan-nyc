/// <reference types="jest" />
/**
 * Sale form save/load retention — surgical stabilization PR A-F.
 *
 * Diagnostic: docs/crm/sales-form-save-load-gap-report-2026-05-28.md
 * Maya's directive: open PR fix/sales-form-save-load-retention-p0 with 10 tests.
 *
 * These are static source-verification tests in the same style as
 * `building-autofill-mapping.test.ts` and `streetdirprefix-systematic-audit.test.ts`.
 * They lock in the contract so a future edit cannot silently reintroduce any of
 * the C1/C2/C4/C5/C9 root causes documented in the gap report.
 *
 * Live DOM round-trip behavior is exercised by `npm run crm:test` (172-smoke)
 * and the Playwright e2e tests; this file is the static guardrail.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const ROUTE_PATH = resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts');

const formHtml = readFileSync(FORM_PATH, 'utf8');
const routeTs = readFileSync(ROUTE_PATH, 'utf8');

// Helper — slice from a function signature for `lengthChars`. We slice on
// fixed length (rather than tracking braces) because the JS bodies in this
// file contain regex literals + escaped strings that defeat a simple brace
// counter. Slice sizes are calibrated to current function bodies (collect=15842,
// populate=17047) with a generous margin; if a function grows past the margin
// the relevant assertions will start silently missing content — bump then.
function functionBody(haystack: string, signature: string, lengthChars: number): string {
  const start = haystack.indexOf(signature);
  if (start === -1) {
    throw new Error(`function signature not found: ${signature}`);
  }
  return haystack.slice(start, start + lengthChars);
}

describe('Sale form save/load retention — PR-A/F backend address persistence', () => {
  // ── Test 8: PATCH stores alias keys in structured address bucket ──
  const patchBody = functionBody(routeTs, 'export async function PATCH', 25000);

  it('addressKeys includes CityRegion (PR-A C2)', () => {
    expect(patchBody).toMatch(/['"]CityRegion['"]/);
  });

  it('addressKeys includes SubdivisionName (PR-A C2)', () => {
    expect(patchBody).toMatch(/['"]SubdivisionName['"]/);
  });

  it('addressKeys includes CountyOrParish (PR-A C2)', () => {
    expect(patchBody).toMatch(/['"]CountyOrParish['"]/);
  });

  it('addressKeys includes PostalCity (PR-A C2)', () => {
    expect(patchBody).toMatch(/['"]PostalCity['"]/);
  });

  it('UnParsedAddress (capital P) is normalized to UnparsedAddress (lowercase p) in the address bucket (PR-F)', () => {
    expect(patchBody).toMatch(
      /body\.UnParsedAddress\s*!==\s*undefined[\s\S]*?body\.UnparsedAddress\s*===\s*undefined[\s\S]*?updatedAddress\.UnparsedAddress\s*=\s*body\.UnParsedAddress/,
    );
  });

  // ── Test 9: borough/neighborhood DB columns mirror structured address ──
  it('listings.borough column mirrors CityRegion when Borough is absent (PR-A C2)', () => {
    expect(patchBody).toMatch(
      /if\s*\(\s*body\.Borough\s*!==\s*undefined\s*\)\s*update\.borough\s*=\s*String\(body\.Borough\)\s*;\s*else\s+if\s*\(\s*body\.CityRegion\s*!==\s*undefined\s*\)\s*update\.borough\s*=\s*String\(body\.CityRegion\)/,
    );
  });

  it('listings.neighborhood column mirrors SubdivisionName when Neighborhood is absent (PR-A C2)', () => {
    expect(patchBody).toMatch(
      /if\s*\(\s*body\.Neighborhood\s*!==\s*undefined\s*\)\s*update\.neighborhood\s*=\s*String\(body\.Neighborhood\)\s*;\s*else\s+if\s*\(\s*body\.SubdivisionName\s*!==\s*undefined\s*\)\s*update\.neighborhood\s*=\s*String\(body\.SubdivisionName\)/,
    );
  });

  it('UnparsedAddress (lowercase p) remains in addressKeys for Trestle-sourced rows (no regression)', () => {
    expect(patchBody).toMatch(/['"]UnparsedAddress['"]/);
  });
});

describe('Sale form save/load retention — PR-B saleStatus overwrite removed', () => {
  // ── Test 7: populate does NOT unconditionally overwrite saleStatus with canonical ──
  const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 20000);

  it('populate restores saleStatus via the workflow-priority chain (raw._crmWorkflowStatus first)', () => {
    expect(populateBody).toMatch(
      /restoredWorkflowStatus\s*=\s*[\s\S]*?raw\._crmWorkflowStatus[\s\S]*?raw\.saleStatus[\s\S]*?listing\.status[\s\S]*?raw\.StandardStatus[\s\S]*?'Draft'/,
    );
  });

  it('populate does NOT contain the legacy unconditional canonical-status overwrite (the line we removed)', () => {
    // Before PR-B, populate had a second:
    //   setVal('saleStatus', listing.status || raw.StandardStatus || raw.MlsStatus || 'Draft');
    // that clobbered the workflow value with the canonical RESO value. This
    // test asserts that exact pattern no longer executes.
    expect(populateBody).not.toMatch(
      /setVal\(['"]saleStatus['"]\s*,\s*listing\.status\s*\|\|\s*raw\.StandardStatus\s*\|\|\s*raw\.MlsStatus\s*\|\|\s*['"]Draft['"]\s*\)/,
    );
  });

  it('the workflow-priority chain is applied via setVal exactly once for saleStatus (excluding comments)', () => {
    // Count real call sites only — strip line comments first so the C5
    // explanation block we added doesn't trip the count.
    const codeOnly = populateBody
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    const setValSaleStatusMatches = codeOnly.match(/setVal\(['"]saleStatus['"]/g) || [];
    expect(setValSaleStatusMatches.length).toBe(1);
  });
});

describe('Sale form save/load retention — PR-C _crmWorkflowStatus persisted from every save path', () => {
  // ── Test 5 + 6: draft + autosave both persist _crmWorkflowStatus ──
  const collectBody = functionBody(formHtml, 'function collectSaleFormData()', 24000);

  it('collectSaleFormData assigns _crmWorkflowStatus from saleStatus (PR-C C5)', () => {
    expect(collectBody).toMatch(/data\._crmWorkflowStatus\s*=\s*data\.saleStatus/);
  });

  it('collectSaleFormData is called by performAutoSave (autosave inherits _crmWorkflowStatus)', () => {
    const autoSaveBody = functionBody(formHtml, 'function performAutoSave()', 3000);
    expect(autoSaveBody).toMatch(/collectSaleFormData\(\)/);
  });

  it('collectSaleFormData is called by manualSaveDraft (draft inherits _crmWorkflowStatus)', () => {
    const draftBody = functionBody(formHtml, 'async function manualSaveDraft()', 3000);
    expect(draftBody).toMatch(/collectSaleFormData\(\)/);
  });
});

describe('Sale form save/load retention — PR-D checkbox-array collector', () => {
  // ── Tests 1-4: Heating, Cooling, SyndicateTo, saleCommSubtype as arrays ──
  const collectBody = functionBody(formHtml, 'function collectSaleFormData()', 24000);

  it('Test 1 — Heating is derived as an array from name="saleHeating":checked (PR-D C1)', () => {
    expect(collectBody).toMatch(/data\.Heating\s*=\s*\[\]/);
    expect(collectBody).toMatch(
      /document\.querySelectorAll\(['"]input\[name="saleHeating"\]:checked['"]\)\.forEach\(function\s*\(\s*cb\s*\)\s*\{\s*data\.Heating\.push\(cb\.value\)/,
    );
  });

  it('Test 2 — Cooling is derived as an array from name="saleCooling":checked (PR-D C1)', () => {
    expect(collectBody).toMatch(/data\.Cooling\s*=\s*\[\]/);
    expect(collectBody).toMatch(
      /document\.querySelectorAll\(['"]input\[name="saleCooling"\]:checked['"]\)\.forEach\(function\s*\(\s*cb\s*\)\s*\{\s*data\.Cooling\.push\(cb\.value\)/,
    );
  });

  it('Test 3 — SyndicateTo is derived as an array from SALE_SYNDICATION_MAP checked ids (PR-D C1)', () => {
    expect(collectBody).toMatch(/data\.SyndicateTo\s*=\s*\[\]/);
    expect(collectBody).toMatch(/SALE_SYNDICATION_MAP[\s\S]*?\.forEach[\s\S]*?data\.SyndicateTo\.push\(entry\.cotality\)/);
  });

  it('Test 4 — saleCommSubtype is derived as an array from name="saleCommSubtype":checked (PR-D C1)', () => {
    expect(collectBody).toMatch(/data\.saleCommSubtype\s*=\s*\[\]/);
    expect(collectBody).toMatch(
      /document\.querySelectorAll\(['"]input\[name="saleCommSubtype"\]:checked['"]\)\.forEach\(function\s*\(\s*cb\s*\)\s*\{\s*data\.saleCommSubtype\.push\(cb\.value\)/,
    );
  });

  it('SALE_CHECKBOX_ARRAY_MAP populate-side mapping still reads `Heating` and `Cooling` as arrays (round-trip parity)', () => {
    // Populate-side restore was already correct (SALE_CHECKBOX_ARRAY_MAP at
    // line ~8487 maps { rls: 'Heating', name: 'saleHeating' }). This test
    // pins the restore side so a refactor cannot break round-trip parity
    // even after the collect side now actually emits the array.
    expect(formHtml).toMatch(/\{\s*rls:\s*['"]Heating['"]\s*,\s*name:\s*['"]saleHeating['"]\s*\}/);
    expect(formHtml).toMatch(/\{\s*rls:\s*['"]Cooling['"]\s*,\s*name:\s*['"]saleCooling['"]\s*\}/);
  });
});

describe('Sale form save/load retention — PR-E populate/autosave race hardening', () => {
  // ── Test 10: populate setters do not dispatch change events during populate ──
  // Slice bumped to 24000 (the tax features-first branch 2026-06-23 added a few
  // lines inside populate, pushing its single guarded applySalesFieldRules() call to
  // +23078 chars, past the old 23000 window; the next function _offerDraftRestore
  // begins at +24733, so 24000 reaches the real call but stops before that next call).
  const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 24000);

  it('setVal inside populate gates the change-event dispatch on !_salePopulateInProgress (PR-E C9)', () => {
    // Helper is local to _populateSaleFormFromApi; assert it is gated.
    expect(populateBody).toMatch(
      /function setVal\(id, val\)\s*\{[\s\S]*?el\.value\s*=\s*String\(val\);[\s\S]*?if\s*\(\s*!\s*window\._salePopulateInProgress\s*\)[\s\S]*?el\.dispatchEvent\(new Event\(['"]change['"]/,
    );
  });

  it('setChecked inside populate gates the change-event dispatch on !_salePopulateInProgress (PR-E C9)', () => {
    expect(populateBody).toMatch(
      /function setChecked\(id, val\)\s*\{[\s\S]*?el\.checked\s*=\s*!!val;[\s\S]*?if\s*\(\s*!\s*window\._salePopulateInProgress\s*\)[\s\S]*?el\.dispatchEvent\(new Event\(['"]change['"]/,
    );
  });

  it('setRadio inside populate gates the change-event dispatch on !_salePopulateInProgress (PR-E C9)', () => {
    expect(populateBody).toMatch(
      /function setRadio\(name, val\)\s*\{[\s\S]*?radio\.checked\s*=\s*true;[\s\S]*?if\s*\(\s*!\s*window\._salePopulateInProgress\s*\)[\s\S]*?radio\.dispatchEvent\(new Event\(['"]change['"]/,
    );
  });

  it('_checkSaleEditMode still sets _salePopulateInProgress=true before populate and false after (lock window intact)', () => {
    const checkEditBody = functionBody(formHtml, 'function _checkSaleEditMode()', 3000);
    expect(checkEditBody).toMatch(/window\._salePopulateInProgress\s*=\s*true/);
    expect(checkEditBody).toMatch(/_populateSaleFormFromApi\(listing\)/);
    expect(checkEditBody).toMatch(/window\._salePopulateInProgress\s*=\s*false/);
  });

  it('_checkSaleEditMode clears any queued autosave timer before enabling autosave (PR-E)', () => {
    const checkEditBody = functionBody(formHtml, 'function _checkSaleEditMode()', 3000);
    expect(checkEditBody).toMatch(/clearTimeout\(autoSaveTimer\)[\s\S]*?window\._saleAutoSaveReady\s*=\s*true/);
  });

  it('autoSaveDraft and performAutoSave both bail when _salePopulateInProgress is true (already in place; pinned here)', () => {
    const autoDraftBody = functionBody(formHtml, 'function autoSaveDraft()', 1000);
    expect(autoDraftBody).toMatch(/window\._salePopulateInProgress/);
    const performBody = functionBody(formHtml, 'function performAutoSave()', 1000);
    expect(performBody).toMatch(/window\._salePopulateInProgress/);
  });

  it('applySalesFieldRules is invoked exactly once inside populate (excluding comments)', () => {
    // BOUNDED BY THE NEXT FUNCTION, NOT BY A CHARACTER COUNT.
    //
    // This used to slice a fixed 24,000-char window, with a comment explaining
    // that the number was tuned to reach the real call at +23078 while stopping
    // before _offerDraftRestore at +24733. Any edit inside populate moved the
    // call, and the window silently stopped covering it: adding the canonical
    // owner hydrate at the top of the function left ONLY the C9 comment mention
    // inside the window, which comment-stripping then removed, so the assertion
    // read 0 and failed for a reason that had nothing to do with the invariant.
    //
    // The invariant is "exactly one call INSIDE THIS FUNCTION". Slicing to the
    // next function's signature expresses that directly and cannot drift.
    const populateStart = formHtml.indexOf('function _populateSaleFormFromApi(listing)');
    const nextFunctionStart = formHtml.indexOf('function _offerDraftRestore', populateStart);
    expect(populateStart).toBeGreaterThan(-1);
    expect(nextFunctionStart).toBeGreaterThan(populateStart);
    const trueBody = formHtml.slice(populateStart, nextFunctionStart);

    // Real call sites only. The C9 comment block mentions the function by
    // name; strip line comments first.
    const codeOnly = trueBody
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    const calls = codeOnly.match(/applySalesFieldRules\s*\(\s*\)/g) || [];
    expect(calls.length).toBe(1);
  });
});

describe('Sale form save/load retention — collect/populate shape parity (cross-cutting)', () => {
  // Round-trip-shape sanity. If anyone ever changes collect to emit a key the
  // populate side cannot read (or vice-versa), this catches it.
  const collectBody = functionBody(formHtml, 'function collectSaleFormData()', 24000);
  const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 20000);

  it('every checkbox-array group collect emits has a populate-side restorer in SALE_CHECKBOX_ARRAY_MAP', () => {
    // Heating/Cooling/saleCommSubtype groups newly added by PR-D must have
    // their corresponding SALE_CHECKBOX_ARRAY_MAP entries.
    const arrayGroups = ['PetsAllowed', 'BuildingPetsAllowed', 'AttendanceType', 'BuildingLaundryFeatures', 'Heating', 'Cooling', 'saleCommSubtype'];
    for (const group of arrayGroups) {
      const collectEmits = new RegExp(`data\\.${group}\\s*=\\s*\\[\\]`).test(collectBody);
      expect({ group, emittedByCollect: collectEmits }).toEqual({ group, emittedByCollect: true });
    }
  });

  it('_crmWorkflowStatus is read by populate priority chain', () => {
    expect(populateBody).toMatch(/raw\._crmWorkflowStatus/);
  });

  it('_crmWorkflowStatus is written by collect (round-trip)', () => {
    expect(collectBody).toMatch(/data\._crmWorkflowStatus\s*=\s*data\.saleStatus/);
  });

  it('collect emits the canonical Cotality View array (mirrors Heating/Cooling) — Codex #280 F7', () => {
    // Server RLS conditional (ViewYN=true → require View) reads the canonical
    // `View` field; collect must emit it from saleViewList.
    expect(collectBody).toMatch(/data\.View\s*=\s*data\.saleViewList/);
  });

  it('_deriveSaleYNFields maps each form YN to its canonical Cotality field', () => {
    const deriveBody = functionBody(formHtml, 'function _deriveSaleYNFields(data)', 2000);
    expect(deriveBody).toMatch(/canonical:\s*'HeatingYN'/);
    expect(deriveBody).toMatch(/canonical:\s*'CoolingYN'/);
    expect(deriveBody).toMatch(/canonical:\s*'ViewYN'/);
  });

  // ── Cotality-only field-name corrections (audit F1–F3, 2026-05-30) ──
  // Each: collect emits the CANONICAL Cotality field, the phantom/old key is no
  // longer emitted, and SALE_FIELD_MAP restores from the canonical key with a
  // legacy fallback so already-saved rows still reload.
  // Brace-matched full body (the 20000-char collectBody slice truncates before
  // these emits, which live near the end of collectSaleFormData).
  const fullCollect = extractFunction(formHtml, 'function collectSaleFormData()');

  it('F1: collect emits canonical ActivationDate (not phantom FirstShowingDate); restore has legacy fallback', () => {
    expect(fullCollect).toMatch(/data\.ActivationDate\s*=/);
    expect(fullCollect).not.toMatch(/data\.FirstShowingDate\s*=/);
    expect(formHtml).toMatch(/rls:\s*'ActivationDate',\s*form:\s*'saleFirstShowingDate'[^}]*fallbackRls:\s*'FirstShowingDate'/);
  });

  it('F2: collect emits canonical TaxLot (not BuildingTaxLot); restore has legacy fallback', () => {
    expect(fullCollect).toMatch(/data\.TaxLot\s*=/);
    expect(fullCollect).not.toMatch(/data\.BuildingTaxLot\s*=/);
    expect(formHtml).toMatch(/rls:\s*'TaxLot',\s*form:\s*'saleBldgTaxLot'[^}]*fallbackRls:\s*'BuildingTaxLot'/);
  });

  it('F3 (revised by Cotality-clean sweep): collect does NOT write a date into the Cotality enum Possession; legacy reload retained', () => {
    // Possession is a Multi.Possession ENUM in live Cotality $metadata — a date must
    // not be written into it. The occupancy date persists as saleAvailableOccupancy;
    // legacy Possession/PossessionDate rows still reload via the SALE_FIELD_MAP fallback.
    expect(fullCollect).not.toMatch(/data\.Possession\s*=/);
    expect(fullCollect).not.toMatch(/data\.PossessionDate\s*=/);
    expect(formHtml).toMatch(/rls:\s*'Possession',\s*form:\s*'saleAvailableOccupancy'[^}]*fallbackRls:\s*'PossessionDate'/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2026-05-29 save/update hotfix — EXECUTABLE round-trip tests.
//
// Unlike the static guards above, these EXECUTE the real shipped functions
// (extracted verbatim from the form) against a real DOM built with jsdom (the
// runtime jest env is node, but the `jsdom` library is available). This catches
// behavior regressions a source-grep cannot — the false-confidence gap called
// out in the audit.
// ════════════════════════════════════════════════════════════════════════════

// Brace-matched extraction of a single function (the three targets contain no
// '{'/'}' inside strings or regex, so a simple depth counter is exact).
function extractFunction(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error('function not found: ' + signature);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

describe('Sale form save/update hotfix — executable round-trip (jsdom)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom');

  function makeWindow(bodyHtml: string): any {
    return new JSDOM('<!DOCTYPE html><html><body>' + bodyHtml + '</body></html>').window;
  }

  function loadFns(win: any): any {
    const src = [
      extractFunction(formHtml, 'function fieldHasValue(field)'),
      extractFunction(formHtml, 'function _restoreSaleNeighborhoodSelect(value, boroughHint)'),
      extractFunction(formHtml, 'function _autoSetYesWhenTypeChosen(typeGroupName, ynRadioName)'),
      extractFunction(formHtml, 'function _deriveSaleYNFields(data)'),
    ].join('\n');
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'document', 'window', 'Event', 'HTMLElement',
      src + '\nreturn { fieldHasValue: fieldHasValue, _restoreSaleNeighborhoodSelect: _restoreSaleNeighborhoodSelect, _autoSetYesWhenTypeChosen: _autoSetYesWhenTypeChosen, _deriveSaleYNFields: _deriveSaleYNFields };',
    );
    return factory(win.document, win, win.Event, win.HTMLElement);
  }

  const heatYn =
    '<input type="radio" name="saleHeatingYN" value="Yes">' +
    '<input type="radio" name="saleHeatingYN" value="No">' +
    '<input type="checkbox" name="saleHeating" value="Steam">' +
    '<input type="checkbox" name="saleHeating" value="ForcedAir">';
  const coolYn =
    '<input type="radio" name="saleCoolingYN" value="Yes">' +
    '<input type="radio" name="saleCoolingYN" value="No">' +
    '<input type="checkbox" name="saleCooling" value="CentralAir">';
  const viewYn =
    '<input type="radio" name="saleHasViews" value="Yes">' +
    '<input type="radio" name="saleHasViews" value="No" checked>' +
    '<input type="checkbox" name="saleViewList" value="River">';

  it('Heating required is SATISFIED when a heating type checkbox is checked (YN blank)', () => {
    const win = makeWindow(heatYn);
    win.document.querySelector('input[name="saleHeating"][value="Steam"]').checked = true;
    const fns = loadFns(win);
    expect(fns.fieldHasValue({ name: 'saleHeatingYN', type: 'radio', orCheckboxName: 'saleHeating' })).toBe(true);
  });

  it('Cooling required is SATISFIED when a cooling type checkbox is checked (YN blank)', () => {
    const win = makeWindow(coolYn);
    win.document.querySelector('input[name="saleCooling"][value="CentralAir"]').checked = true;
    const fns = loadFns(win);
    expect(fns.fieldHasValue({ name: 'saleCoolingYN', type: 'radio', orCheckboxName: 'saleCooling' })).toBe(true);
  });

  it('Views required is SATISFIED when a view checkbox is checked', () => {
    const win = makeWindow(viewYn);
    win.document.querySelector('input[name="saleViewList"][value="River"]').checked = true;
    const fns = loadFns(win);
    expect(fns.fieldHasValue({ name: 'saleHasViews', type: 'radio', orCheckboxName: 'saleViewList' })).toBe(true);
  });

  it('Heating required is still MISSING when neither YN nor any type is selected (no false-pass)', () => {
    const win = makeWindow(heatYn);
    const fns = loadFns(win);
    expect(fns.fieldHasValue({ name: 'saleHeatingYN', type: 'radio', orCheckboxName: 'saleHeating' })).toBe(false);
  });

  it('explicit "No" on the YN radio is honored and never auto-flipped to Yes (no regression)', () => {
    const win = makeWindow(heatYn);
    win.document.querySelector('input[name="saleHeatingYN"][value="No"]').checked = true;
    const fns = loadFns(win);
    expect(fns.fieldHasValue({ name: 'saleHeatingYN', type: 'radio', orCheckboxName: 'saleHeating' })).toBe(true);
    // Choosing a heating type must NOT override the explicit No.
    win.document.querySelector('input[name="saleHeating"][value="Steam"]').checked = true;
    fns._autoSetYesWhenTypeChosen('saleHeating', 'saleHeatingYN');
    expect(win.document.querySelector('input[name="saleHeatingYN"][value="No"]').checked).toBe(true);
    expect(win.document.querySelector('input[name="saleHeatingYN"][value="Yes"]').checked).toBe(false);
  });

  it('auto-set flips YN to "Yes" when a type is chosen and the radio was unset', () => {
    const win = makeWindow(heatYn);
    win.document.querySelector('input[name="saleHeating"][value="Steam"]').checked = true;
    const fns = loadFns(win);
    fns._autoSetYesWhenTypeChosen('saleHeating', 'saleHeatingYN');
    expect(win.document.querySelector('input[name="saleHeatingYN"][value="Yes"]').checked).toBe(true);
  });

  // Codex review (#280): the Views radio shipped with value="No" CHECKED by
  // default, so the auto-set guard ("respect existing Yes/No") saw the default as
  // a real choice and never flipped to Yes when a view detail was selected — the
  // listing saved ViewYN=No with views present. Fix: Views must NOT pre-check No
  // (consistent with Heating/Cooling, which start unset), so a fresh form's
  // auto-set works while an explicit user "No" is still honored.
  it('regression: the real form does NOT pre-check saleHasViews "No" (Codex #280)', () => {
    const m = formHtml.match(/<input[^>]*name="saleHasViews"[^>]*value="No"[^>]*>/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/\bchecked\b/);
  });

  it('Views auto-set flips YN to "Yes" when a view is checked and YN was unset (Codex #280)', () => {
    const viewUnset =
      '<input type="radio" name="saleHasViews" value="Yes">' +
      '<input type="radio" name="saleHasViews" value="No">' +
      '<input type="checkbox" name="saleViewList" value="River">';
    const win = makeWindow(viewUnset);
    win.document.querySelector('input[name="saleViewList"][value="River"]').checked = true;
    const fns = loadFns(win);
    fns._autoSetYesWhenTypeChosen('saleViewList', 'saleHasViews');
    expect(win.document.querySelector('input[name="saleHasViews"][value="Yes"]').checked).toBe(true);
    expect(win.document.querySelector('input[name="saleHasViews"][value="No"]').checked).toBe(false);
  });

  it('Views explicit "No" is never overridden by checking a view (Codex #280)', () => {
    const viewNo =
      '<input type="radio" name="saleHasViews" value="Yes">' +
      '<input type="radio" name="saleHasViews" value="No" checked>' +
      '<input type="checkbox" name="saleViewList" value="River">';
    const win = makeWindow(viewNo);
    win.document.querySelector('input[name="saleViewList"][value="River"]').checked = true;
    const fns = loadFns(win);
    fns._autoSetYesWhenTypeChosen('saleViewList', 'saleHasViews');
    expect(win.document.querySelector('input[name="saleHasViews"][value="No"]').checked).toBe(true);
    expect(win.document.querySelector('input[name="saleHasViews"][value="Yes"]').checked).toBe(false);
  });

  // Codex follow-up review (#280): editing a saved listing restores detail
  // checkboxes via SALE_CHECKBOX_ARRAY_MAP WITHOUT firing change, so the YN radio
  // stays unset; validateREBNYRequired passes on checkbox-only (orCheckboxName)
  // but collectSaleFormData only emitted the YN when a radio was checked → an
  // active submit carried details with NO Y/N value. Also: Heating/Cooling radios
  // are keyed by id (saleHeatingYes) in the generic collector, so saleHeatingYN
  // was never collected under its canonical name. _deriveSaleYNFields fixes both.
  const heatGroup =
    '<input type="radio" name="saleHeatingYN" id="saleHeatingYes" value="Yes">' +
    '<input type="radio" name="saleHeatingYN" id="saleHeatingNo" value="No">' +
    '<input type="checkbox" name="saleHeating" value="Steam">';

  it('derives saleHeatingYN="Yes" from a checked detail when the radio is unset (edit-reload case)', () => {
    const win = makeWindow(heatGroup);
    win.document.querySelector('input[name="saleHeating"][value="Steam"]').checked = true; // restored, no change event
    const fns = loadFns(win);
    const data: Record<string, unknown> = {};
    fns._deriveSaleYNFields(data);
    expect(data.saleHeatingYN).toBe('Yes');
  });

  it('collects saleHeatingYN by NAME even though the radios are keyed by id', () => {
    const win = makeWindow(heatGroup);
    win.document.querySelector('#saleHeatingYes').checked = true;
    const fns = loadFns(win);
    const data: Record<string, unknown> = {};
    fns._deriveSaleYNFields(data);
    expect(data.saleHeatingYN).toBe('Yes');
    // the stray id-keyed duplicates must not leak into the payload
    expect('saleHeatingYes' in data).toBe(false);
    expect('saleHeatingNo' in data).toBe(false);
  });

  it('respects an explicit "No" even when a detail checkbox is checked (never overridden)', () => {
    const win = makeWindow(heatGroup);
    win.document.querySelector('#saleHeatingNo').checked = true;
    win.document.querySelector('input[name="saleHeating"][value="Steam"]').checked = true;
    const fns = loadFns(win);
    const data: Record<string, unknown> = {};
    fns._deriveSaleYNFields(data);
    expect(data.saleHeatingYN).toBe('No');
  });

  it('leaves the YN unset when neither a radio nor any detail is selected (no false value)', () => {
    const win = makeWindow(heatGroup);
    const fns = loadFns(win);
    const data: Record<string, unknown> = {};
    fns._deriveSaleYNFields(data);
    expect('saleHeatingYN' in data).toBe(false);
  });

  it('derives all three groups (Heating/Cooling/Views) from details', () => {
    const win = makeWindow(
      '<input type="radio" name="saleHeatingYN" id="saleHeatingYes" value="Yes"><input type="radio" name="saleHeatingYN" id="saleHeatingNo" value="No"><input type="checkbox" name="saleHeating" value="Steam">' +
      '<input type="radio" name="saleCoolingYN" id="saleCoolingYes" value="Yes"><input type="radio" name="saleCoolingYN" id="saleCoolingNo" value="No"><input type="checkbox" name="saleCooling" value="CentralAir">' +
      '<input type="radio" name="saleHasViews" value="Yes"><input type="radio" name="saleHasViews" value="No"><input type="checkbox" name="saleViewList" value="River">',
    );
    ['saleHeating', 'saleCooling', 'saleViewList'].forEach((n) => {
      win.document.querySelector('input[name="' + n + '"]').checked = true;
    });
    const fns = loadFns(win);
    const data: Record<string, unknown> = {};
    fns._deriveSaleYNFields(data);
    expect(data.saleHeatingYN).toBe('Yes');
    expect(data.saleCoolingYN).toBe('Yes');
    expect(data.saleHasViews).toBe('Yes');
    // Canonical Cotality boolean YN fields the server-side RLS enforcement reads
    // (Codex #280 follow-up #2). HeatingYN/CoolingYN/ViewYN ∈ Cotality $metadata.
    expect(data.HeatingYN).toBe(true);
    expect(data.CoolingYN).toBe(true);
    expect(data.ViewYN).toBe(true);
  });

  it('writes canonical Cotality YN=true on derive and =false on explicit No (server RLS sees the condition)', () => {
    // derive (detail checked, radio unset) → canonical true
    const w1 = makeWindow(heatGroup);
    w1.document.querySelector('input[name="saleHeating"][value="Steam"]').checked = true;
    const d1: Record<string, unknown> = {};
    loadFns(w1)._deriveSaleYNFields(d1);
    expect(d1.HeatingYN).toBe(true);
    // explicit No → canonical false (not undefined, not true)
    const w2 = makeWindow(heatGroup);
    w2.document.querySelector('#saleHeatingNo').checked = true;
    const d2: Record<string, unknown> = {};
    loadFns(w2)._deriveSaleYNFields(d2);
    expect(d2.HeatingYN).toBe(false);
    // nothing answered → canonical absent (not asserted false)
    const w3 = makeWindow(heatGroup);
    const d3: Record<string, unknown> = {};
    loadFns(w3)._deriveSaleYNFields(d3);
    expect('HeatingYN' in d3).toBe(false);
  });

  it('saved neighborhood restores even when the option was NOT preloaded (dynamic add under borough)', () => {
    const win = makeWindow('<select id="saleBldgNeighborhood"><optgroup label="Manhattan"><option value="Chelsea">Chelsea</option></optgroup></select>');
    const fns = loadFns(win);
    fns._restoreSaleNeighborhoodSelect('TurtleBay', 'Manhattan');
    const sel = win.document.getElementById('saleBldgNeighborhood');
    expect(sel.value).toBe('TurtleBay');
    const added = sel.querySelector('option[data-cotality-added="true"]');
    expect(added).not.toBeNull();
    expect(added.value).toBe('TurtleBay');
  });

  it('compact-value vs display-label mismatch matches the existing option (no duplicate)', () => {
    const win = makeWindow('<select id="saleBldgNeighborhood"><optgroup label="Manhattan"><option value="TurtleBay">Turtle Bay</option></optgroup></select>');
    const fns = loadFns(win);
    fns._restoreSaleNeighborhoodSelect('Turtle Bay', 'Manhattan'); // display label; option value is compact
    const sel = win.document.getElementById('saleBldgNeighborhood');
    expect(sel.value).toBe('TurtleBay');
    expect(sel.querySelectorAll('option').length).toBe(1); // matched existing, no duplicate
  });

  it('dynamically added neighborhood option persists and is selected (reload survives missing option)', () => {
    const win = makeWindow('<select id="saleBldgNeighborhood"></select>');
    const fns = loadFns(win);
    fns._restoreSaleNeighborhoodSelect('Lincoln Square', '');
    const sel = win.document.getElementById('saleBldgNeighborhood');
    expect(sel.options.length).toBe(1);
    expect(sel.value).toBe('LincolnSquare');
    expect(sel.options[0].text).toBe('Lincoln Square');
  });
});

describe('Sale form save/update hotfix — wiring guards (static)', () => {
  it('SALE_REQUIRED_FIELDS pairs each YN radio with its checkbox group via orCheckboxName', () => {
    expect(formHtml).toMatch(/name:\s*'saleHeatingYN'[^}]*orCheckboxName:\s*'saleHeating'/);
    expect(formHtml).toMatch(/name:\s*'saleCoolingYN'[^}]*orCheckboxName:\s*'saleCooling'/);
    expect(formHtml).toMatch(/name:\s*'saleHasViews'[^}]*orCheckboxName:\s*'saleViewList'/);
  });

  it('fieldHasValue honors orCheckboxName', () => {
    expect(formHtml).toMatch(/field\.orCheckboxName\s*&&[\s\S]{0,120}field\.orCheckboxName/);
  });

  it('_populateSaleFormFromApi invokes the neighborhood dynamic-restore', () => {
    const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 22000);
    expect(populateBody).toMatch(/_restoreSaleNeighborhoodSelect\(/);
  });

  it('DOMContentLoaded wires the auto-set listeners for all three groups', () => {
    expect(formHtml).toMatch(/\['saleHeating',\s*'saleHeatingYN'\]/);
    expect(formHtml).toMatch(/\['saleCooling',\s*'saleCoolingYN'\]/);
    expect(formHtml).toMatch(/\['saleViewList',\s*'saleHasViews'\]/);
    expect(formHtml).toMatch(/_autoSetYesWhenTypeChosen\(pair\[0\],\s*pair\[1\]\)/);
  });

  it('no regression: Heating/Cooling array collect + SALE_CHECKBOX_ARRAY_MAP restore intact', () => {
    expect(formHtml).toMatch(/data\.Heating\s*=\s*\[\]/);
    expect(formHtml).toMatch(/data\.Cooling\s*=\s*\[\]/);
    expect(formHtml).toMatch(/\{\s*rls:\s*['"]Heating['"]\s*,\s*name:\s*['"]saleHeating['"]\s*\}/);
    expect(formHtml).toMatch(/\{\s*rls:\s*['"]Cooling['"]\s*,\s*name:\s*['"]saleCooling['"]\s*\}/);
  });
});
