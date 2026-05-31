/// <reference types="jest" />
/**
 * Building auto-pull on edit-load.
 *
 * Edit-load (_populateSaleFormFromApi) restored SAVED building data only and
 * never queried Cotality, so an existing listing created without a building
 * lookup showed an empty building section. Now, when the section is still empty,
 * edit-load runs the building lookup from the listing's address and populates
 * the Cotality-backed fields — gated to an empty section so it never overwrites
 * saved building data or the manual Mallan Building Profile.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`not found: ${name}`);
  const b = src.indexOf('{', start); let d = 0;
  for (let i = b; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); } }
  throw new Error('unbalanced');
}
function load(document: unknown, fetchMock: unknown, popSpy: unknown) {
  const src = `${extractFn(FORM, '_saleBuildingSectionIsEmpty')}\n${extractFn(FORM, '_autoLookupBuildingOnLoad')}`;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function('document', 'fetchBuildingsFromAPI', 'populateBuildingFromIDX',
    `var buildingDatabase = [];\n${src}\n; return { _saleBuildingSectionIsEmpty, _autoLookupBuildingOnLoad };`)(document, fetchMock, popSpy);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('edit-load wiring', () => {
  it('_populateSaleFormFromApi calls _autoLookupBuildingOnLoad', () => {
    expect(extractFn(FORM, '_populateSaleFormFromApi')).toMatch(/_autoLookupBuildingOnLoad\(\)/);
  });
});

describe('_saleBuildingSectionIsEmpty', () => {
  function isEmpty(els: Record<string, { value?: string }>, amenityChecked = false) {
    const doc = { getElementById: (id: string) => els[id] || null, querySelector: () => (amenityChecked ? {} : null) };
    return load(doc, async () => [], () => {})._saleBuildingSectionIsEmpty();
  }
  it('true when no building fields set + no amenity checked', () => {
    expect(isEmpty({ saleStreetAddress: { value: '333 East 46th Street' } })).toBe(true);
  });
  it('false when a building field has a value', () => {
    expect(isEmpty({ saleBldgName: { value: 'The Grand' } })).toBe(false);
  });
  it('false when a building amenity is checked', () => {
    expect(isEmpty({}, true)).toBe(false);
  });
});

describe('_autoLookupBuildingOnLoad', () => {
  it('pulls + populates when the section is empty', async () => {
    const els: Record<string, { value?: string }> = { saleStreetAddress: { value: '333 East 46th Street' } };
    const doc = { getElementById: (id: string) => els[id] || null, querySelector: () => null };
    let populated: unknown = null;
    const api = load(doc, async () => [{ name: 'X', roof_deck: true, building_pets: ['BuildingCatsOK'] }], (_p: string, b: unknown) => { populated = b; });
    api._autoLookupBuildingOnLoad();
    await tick();
    expect(populated).toEqual({ name: 'X', roof_deck: true, building_pets: ['BuildingCatsOK'] });
  });
  it('does NOT pull when the section already has saved data (no clobber)', async () => {
    const els: Record<string, { value?: string }> = { saleStreetAddress: { value: '333 E 46th' }, saleBldgName: { value: 'Saved Name' } };
    const doc = { getElementById: (id: string) => els[id] || null, querySelector: () => null };
    let called = false;
    const api = load(doc, async () => { called = true; return []; }, () => {});
    api._autoLookupBuildingOnLoad();
    await tick();
    expect(called).toBe(false);
  });
  it('does NOT pull when there is no address', async () => {
    const doc = { getElementById: () => null, querySelector: () => null };
    let called = false;
    const api = load(doc, async () => { called = true; return []; }, () => {});
    api._autoLookupBuildingOnLoad();
    await tick();
    expect(called).toBe(false);
  });
});
