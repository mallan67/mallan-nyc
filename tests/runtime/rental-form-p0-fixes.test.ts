/// <reference types="jest" />
/**
 * Rental form P0 fixes — Sentinel-L S-RENT-001 + S-DB-008.
 *
 * S-RENT-001: the auth-gate redirects were `'/crm/login.html;` — an
 * unterminated string literal (missing closing quote, semicolon inside the
 * string). That is a parse error that breaks the entire rental form before
 * any workflow code runs.
 *
 * S-DB-008: rental autosave wrote `localStorage.setItem('rentalListingDraft')`
 * unconditionally, even when editing an existing DB listing — the same
 * phantom-draft class the sales form already guards with
 * `_saleEditMode && _saleEditDbId`. A browser draft must never shadow or
 * overwrite a real DB rental listing.
 */

import fs from 'node:fs';
import path from 'node:path';

const FORM_PATH = path.resolve(__dirname, '../../public/crm/RENTAL-FORM-REDESIGN.html');
const form = fs.readFileSync(FORM_PATH, 'utf8');

describe('Rental form — login redirect is a well-formed string (S-RENT-001)', () => {
  test('no unterminated /crm/login.html redirect remains', () => {
    expect(form).not.toMatch(/['"]\/crm\/login\.html;/);
  });

  test('login redirects use a valid quoted path', () => {
    expect(form).toContain("window.location.href = '/crm/login.html';");
  });
});

describe('Rental form — phantom-draft guard on save (S-DB-008)', () => {
  const fnStart = form.indexOf('function saveRentalDraft()');
  const fnBody = form.slice(fnStart, fnStart + 1400);

  test('saveRentalDraft exists', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  test('edit-mode guard appears BEFORE the localStorage draft write', () => {
    const guardIdx = fnBody.indexOf('_rentalEditMode && _rentalEditDbId');
    const setItemIdx = fnBody.indexOf("localStorage.setItem('rentalListingDraft'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(setItemIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(setItemIdx);
  });

  test('edit-mode path clears the stale draft and returns before writing a new one', () => {
    const guardIdx = fnBody.indexOf('_rentalEditMode && _rentalEditDbId');
    const setItemIdx = fnBody.indexOf("localStorage.setItem('rentalListingDraft'");
    const guardBlock = fnBody.slice(guardIdx, setItemIdx);
    expect(guardBlock).toContain("removeItem('rentalListingDraft')");
    expect(guardBlock).toContain('return');
  });
});

describe('Rental form — stale draft cannot shadow a DB listing on load (S-DB-008)', () => {
  const loadStart = form.indexOf('function loadRentalDraft()');
  const loadBody = form.slice(loadStart, loadStart + 700);

  test('loadRentalDraft skips/clears the browser draft when editing a DB listing', () => {
    expect(loadStart).toBeGreaterThan(-1);
    // It must detect edit mode (the ?id= URL param, set before _rentalEditMode)
    // and clear the stale draft rather than restore it over the DB row.
    expect(loadBody).toMatch(/URLSearchParams|\.get\(['"]id['"]\)/);
    expect(loadBody).toContain("removeItem('rentalListingDraft')");
  });
});
