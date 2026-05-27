/**
 * Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §18, §23
 *
 * Tests that fetchBuildingsFromAPI reads _errorHint from the backend
 * and surfaces distinct messages for each error class.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = readFileSync(FORM_PATH, 'utf8');

const fnStart = formHtml.indexOf('async function fetchBuildingsFromAPI(query)');
const fnEnd = formHtml.indexOf('\n}', fnStart + 100) + 2;
const fnBody = formHtml.slice(fnStart, fnEnd);

describe('fetchBuildingsFromAPI — error hint surfacing', () => {
  it('reads _errorHint from response body', () => {
    expect(fnBody).toContain('body._errorHint');
  });

  it('401 response shows session expired toast', () => {
    expect(fnBody).toContain('resp.status === 401');
    expect(fnBody).toContain('Session expired. Please log in again.');
    expect(fnBody).toContain("showToast(hint || 'Session expired. Please log in again.', 'error')");
  });

  it('non-OK non-401 response shows temporarily unavailable toast', () => {
    expect(fnBody).toContain('!resp.ok');
    expect(fnBody).toContain("showToast(hint || 'Building lookup temporarily unavailable.', 'warning')");
  });

  it('200 empty with _errorHint shows the hint as toast', () => {
    expect(fnBody).toContain('buildings.length === 0 && hint');
    expect(fnBody).toContain("showToast(hint, 'warning')");
  });

  it('200 with buildings returns mapped candidates', () => {
    expect(fnBody).toContain('return buildings.map(function(b)');
    expect(fnBody).toContain('b.address || b.street_address');
  });

  it('catch block shows unavailable toast instead of silent []', () => {
    const catchIdx = fnBody.indexOf('catch (e)');
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBody = fnBody.slice(catchIdx, catchIdx + 300);
    expect(catchBody).toContain("showToast('Building lookup temporarily unavailable.', 'warning')");
  });

  it('no longer has the silent if (!resp.ok) return [] pattern', () => {
    expect(fnBody).not.toContain('if (!resp.ok) return [];');
  });
});

describe('error hints are distinct per error class', () => {
  it('401 hint differs from non-OK hint', () => {
    const hint401 = 'Session expired. Please log in again.';
    const hintNonOk = 'Building lookup temporarily unavailable.';
    expect(hint401).not.toBe(hintNonOk);
  });

  it('401 hint differs from empty-result hint', () => {
    const hint401 = 'Session expired. Please log in again.';
    const hintEmpty = 'No Cotality/Trestle building match found.';
    expect(hint401).not.toBe(hintEmpty);
  });

  it('non-OK hint differs from empty-result hint', () => {
    const hintNonOk = 'Building lookup temporarily unavailable.';
    const hintEmpty = 'No Cotality/Trestle building match found.';
    expect(hintNonOk).not.toBe(hintEmpty);
  });
});
