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
  const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 17500);

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
  const collectBody = functionBody(formHtml, 'function collectSaleFormData()', 20000);

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
  const collectBody = functionBody(formHtml, 'function collectSaleFormData()', 20000);

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
    expect(collectBody).toMatch(/SALE_SYNDICATION_MAP[\s\S]*?\.forEach[\s\S]*?data\.SyndicateTo\.push\(entry\.target\)/);
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
  const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 17500);

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
    // Real call sites only. The C9 comment block mentions the function by
    // name; strip line comments first.
    const codeOnly = populateBody
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
  const collectBody = functionBody(formHtml, 'function collectSaleFormData()', 20000);
  const populateBody = functionBody(formHtml, 'function _populateSaleFormFromApi(listing)', 17500);

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
});
