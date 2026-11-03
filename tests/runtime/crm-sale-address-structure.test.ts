/// <reference types="jest" />
/**
 * What the Sale form does with an address (Maya, 2026-11-03: "go through the form as a human and see how it works, it needs specific understanding of the structure").
 *
 * Walking the real form as an agent found, and these tests now pin:
 *  - A HOUSE address was not recognised. The building index says what kind of building an address is (building_kind: townhouse, multi-family, single-family, mixed-use: they have no
 *    CommonInterest); the Rental form read it and the Sale form did not, so a townhouse address left the Sale form on its default Condo, with the TH / Building tab locked and the match
 *    banner saying "Property type: | Building:".
 *  - A locked TH / Building tab gave no reason (a disabled tab takes no hover). It now has a lock icon and a line that says why and where the building's facts are.
 *  - The sidebar said "All fields OK" before anything had been checked.
 *  - The lookup copy still said "Trestle/RLS reference" (it is Cotality), and the header's Save Draft button was squeezed into three lines once the draft notice showed.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, sleep, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

// What GET /api/buildings/search answers for a building (snake_case, as the route returns it).
const HOUSE = { address: '40 W 12th St', name: '', borough: 'Manhattan', zip: '10011', neighborhood: 'Greenwich Village', common_interest: null, structure_type: 'Townhouse', year_built: 1899, stories_total: 4, units_total: 1 };
const COOP = { ...HOUSE, address: '200 E 66th St', name: 'The Plaza Tower', zip: '10065', neighborhood: 'Lenox Hill', common_interest: 'StockCooperative', structure_type: 'HighRise', stories_total: 32, units_total: 160 };

const checkedType = (f: BootedForm) => (f.d.querySelector('input[name="salePropertyType"]:checked') as HTMLInputElement | null)?.value ?? '';
const tab3Locked = (f: BootedForm) => (f.d.getElementById('sidebarTab3') as HTMLElement).style.pointerEvents === 'none';
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const banner = (f: BootedForm) => ({ type: text(f.d.getElementById('saleIdxDetectedType')), building: text(f.d.getElementById('saleIdxDetectedBuilding')), shown: !f.d.getElementById('saleIdxMatchBanner')!.classList.contains('hidden') });

/** the agent types the address in the lookup box and picks the building that is offered */
async function pickBuilding(row: Record<string, unknown>, typed: string = String(row.address).slice(0, 9)): Promise<BootedForm> {
  const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [row], settle: 700 });
  const box = f.d.getElementById('saleBuildingSearch') as HTMLInputElement;
  box.value = typed;
  box.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await sleep(500);
  const offered = f.d.querySelector('#saleBuildingSearchResults > div') as HTMLElement;
  expect(offered).not.toBeNull();
  offered.click();
  await sleep(150);
  return f;
}

describe('an address names a house', () => {
  it.each([
    ['SingleFamilyTownhouse', 'Single Family TH'],
    ['MultiFamilyTownhouse', 'Multi-Family TH'],
    ['SingleFamily', 'Single Family'],
    ['MultiFamily', 'Multi-Family'],
    ['MixedUse', 'Mixed Use'],
  ])('building_kind %s: the type is chosen, the TH / Building tab opens, and the banner names the type', async (kind, label) => {
    const f = await pickBuilding({ ...HOUSE, building_kind: kind });
    try {
      expect(checkedType(f)).toBe(kind);
      expect(tab3Locked(f)).toBe(false);
      expect(banner(f)).toEqual({ shown: true, type: expect.stringContaining(label.split(' ')[0]), building: '40 W 12th St' });     // no building name: the address names it
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('a building the index cannot classify (no ownership tag, no kind) leaves the type to the agent and says so, instead of a blank banner', async () => {
    const f = await pickBuilding({ ...HOUSE });
    try {
      expect(checkedType(f)).toBe('Condo');                                                  // the form's own default, untouched
      expect(banner(f).type).toBe('not named by Cotality: choose it below');
    } finally { f.close(); }
  });

  it('a kind the Sale form has no type for (a rental building) names nothing', async () => {
    const f = await pickBuilding({ ...HOUSE, building_kind: 'RentalBuilding' });
    try {
      expect(checkedType(f)).toBe('Condo');
      expect(banner(f).type).not.toBe('');
    } finally { f.close(); }
  });

  it('a house is a house whatever ownership tag a record still carries (152 W 121st Street: a townhouse with one listing tagged Condominium): the kind decides, the stray tag fills nothing', async () => {
    const f = await pickBuilding({ ...HOUSE, address: '152 W 121st Street', common_interest: 'Condominium', building_kind: 'MultiFamilyTownhouse' });
    try {
      expect(checkedType(f)).toBe('MultiFamilyTownhouse');
      expect(tab3Locked(f)).toBe(false);
      expect(banner(f).type).toContain('Multi-Family');
      expect((f.d.getElementById('saleCommonInterest') as HTMLSelectElement).value).toBe('');     // Ownership Type is not told "Condominium" for a house
    } finally { f.close(); }
  });

  it('an apartment building is not turned into a house: a co-op the index calls a Coop stays a Co-op, and its TH / Building tab stays shut', async () => {
    const f = await pickBuilding({ ...COOP, building_kind: 'Coop' });
    try {
      expect(checkedType(f)).toBe('Coop');
      expect(tab3Locked(f)).toBe(true);
      expect(banner(f)).toEqual({ shown: true, type: 'Co-op', building: 'The Plaza Tower' });
    } finally { f.close(); }
  });

  it('an ownership tag with no kind at all still decides (a building the index could not classify)', async () => {
    const f = await pickBuilding({ ...COOP });
    try {
      expect(checkedType(f)).toBe('Coop');
      expect(tab3Locked(f)).toBe(true);
    } finally { f.close(); }
  });

  it('a Condo building is a Condo (kind Condo sent as well), as before', async () => {
    const f = await pickBuilding({ ...COOP, common_interest: 'Condominium', building_kind: 'Condo' });
    try {
      expect(checkedType(f)).toBe('Condo');
      expect(banner(f).type).toBe('Condo');
    } finally { f.close(); }
  });
});

describe('a locked TH / Building tab says why', () => {
  const noteOf = (f: BootedForm) => ({ icon: !f.d.getElementById('saleTHTabLock')!.classList.contains('hidden'), note: text(f.d.getElementById('saleTHTabNote')), noteShown: !f.d.getElementById('saleTHTabNote')!.classList.contains('hidden') });
  const choose = (f: BootedForm, name: string, value: string) => (f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement).click();

  it('a unit type: lock icon and a line naming the type and the Building window; a house type: both gone', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 700 });
    try {
      expect(noteOf(f)).toEqual({ icon: true, noteShown: true, note: expect.stringMatching(/TH \/ Building is not used for Condo: the building's facts are in the Building window \(the Building button at the top\)\./) });
      choose(f, 'salePropertyType', 'Coop');
      expect(noteOf(f).note).toMatch(/not used for Co-op:/);
      choose(f, 'salePropertyType', 'SingleFamily');
      expect(noteOf(f)).toEqual({ icon: false, noteShown: false, note: '' });
      expect(tab3Locked(f)).toBe(false);
    } finally { f.close(); }
  });

  it('on a phone the sidebar is hidden, so the tab bar carries the same words and the greyed tab points at them', async () => {
    expect(FORM).toMatch(/@media \(min-width: 768px\) \{ \.mobile-th-note \{ display: none !important; \} \}/);     // shown under 768px only, like the tab bar it belongs to
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 700 });
    try {
      const mobileNote = f.d.getElementById('saleTHTabNoteMobile') as HTMLElement;
      const mobileTab = f.d.querySelectorAll('.mobile-tab')[2] as HTMLElement;
      expect(mobileNote.classList.contains('hidden')).toBe(false);
      expect(text(mobileNote)).toBe(text(f.d.getElementById('saleTHTabNote')));
      expect(text(mobileNote)).toMatch(/TH \/ Building is not used for Condo: the building's facts are in the Building window/);
      expect(mobileTab.getAttribute('aria-disabled')).toBe('true');
      expect(mobileTab.getAttribute('aria-describedby')).toBe('saleTHTabNoteMobile');
      choose(f, 'salePropertyType', 'SingleFamily');
      expect(mobileNote.classList.contains('hidden')).toBe(true);
      expect(mobileTab.getAttribute('aria-disabled')).toBe('false');
      expect(mobileTab.hasAttribute('aria-describedby')).toBe(false);
    } finally { f.close(); }
  });

  it('a commercial condo is named as one', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 700 });
    try {
      choose(f, 'salePropertyType', 'Commercial');
      choose(f, 'saleCommercialOwnership', 'CommercialCondo');
      expect(tab3Locked(f)).toBe(true);
      expect(noteOf(f).note).toMatch(/not used for Commercial Condo:/);
      choose(f, 'saleCommercialOwnership', 'WholeBuilding');
      expect(noteOf(f)).toEqual({ icon: false, noteShown: false, note: '' });
    } finally { f.close(); }
  });
});

/**
 * What the LIVE Cotality answers showed (walk-through against the real API, 2026-11-03; fixtures below have the live shape of 310 W 72nd Street).
 * A co-op's corporation is named "310/72 Owners Corp."; the name contains the street number, and the form took the name for the address: the Street Address box read
 * "310/72 Owners Corp." (number "310/72", street "Owners Corp."). The same record says StructureType "None", which the form filled as "None (Land)" into a 16-story co-op.
 */
describe('live Cotality answers', () => {
  const LIVE_COOP = { address: '310 W 72nd Street', name: '310/72 Owners Corp.', borough: 'Manhattan', zip: '10023', neighborhood: 'Lincoln Square', common_interest: 'StockCooperative', structure_type: 'None', year_built: 1924, stories_total: 16, units_total: null, building_kind: 'Coop' };
  const value = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;

  it('a co-op whose name holds the street number keeps its street address; the name stays the name', async () => {
    const f = await pickBuilding(LIVE_COOP);
    try {
      expect(value(f, 'saleStreetAddress')).toBe('310 W 72nd Street');
      expect(value(f, 'saleStreetNumber')).toBe('310');
      expect(value(f, 'saleBldgStreetAddress')).toBe('310 W 72nd Street');
      expect(banner(f)).toEqual({ shown: true, type: 'Co-op', building: '310/72 Owners Corp.' });
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('a record with no address at all is still addressed by its name (nothing else to use)', async () => {
    const f = await pickBuilding({ ...LIVE_COOP, address: '' }, '310 W 72nd');
    try {
      expect(value(f, 'saleStreetAddress')).toBe('310/72 Owners Corp.');
    } finally { f.close(); }
  });

  it('StructureType "None" is not filled into a building the lookup typed; a real structure still is', async () => {
    const none = await pickBuilding(LIVE_COOP);
    try {
      expect(value(none, 'saleStructureType')).toBe('');
      expect(value(none, 'saleBldgType')).toBe('');
    } finally { none.close(); }
    const real = await pickBuilding({ ...LIVE_COOP, structure_type: 'HighRise' });
    try {
      expect(value(real, 'saleStructureType')).toBe('HighRise');
      expect(value(real, 'saleBldgType')).toBe('HighRise');
    } finally { real.close(); }
  });

  it('the lookup row names the type the way the banner does ("Single Family", "Co-op"), not by its code', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [{ ...HOUSE, address: '34 E 70TH Street', building_kind: 'SingleFamily' }], settle: 700 });
    try {
      const box = f.d.getElementById('saleBuildingSearch') as HTMLInputElement;
      box.value = '34 E 70th';
      box.dispatchEvent(new f.w.Event('input', { bubbles: true }));
      await sleep(500);
      const row = f.d.querySelector('#saleBuildingSearchResults > div') as HTMLElement;
      expect(text(row.querySelector('span'))).toBe('Single Family');
    } finally { f.close(); }
  });
});

describe('the rest of what the walk-through found', () => {
  it('the sidebar does not say "All fields OK" before anything was checked; it says when fields are checked, and lists what is missing once they have been', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 700 });
    try {
      const summary = () => text(f.d.getElementById('saleValidationSummary'));
      expect(summary()).toBe('Required fields are checked when you press Next or Submit.');
      expect(summary()).not.toMatch(/All fields OK/);
      f.w.activateSaleValidation();
      expect(summary()).not.toBe('Required fields are checked when you press Next or Submit.');
      expect(summary()).toMatch(/Price/);                                                    // the empty form lists what it still needs
    } finally { f.close(); }
  });

  it('the lookup says Cotality, not Trestle', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 700 });
    try {
      const card = text(f.d.getElementById('saleBuildingSearch')!.closest('.form-card'));
      expect(card).toContain("fill in the building's facts from Cotality");
      expect(card).toContain('Building facts filled in from Cotality');
      expect(card).not.toMatch(/Trestle/);
    } finally { f.close(); }
  });

  it('the header buttons keep their shape when the draft notice shows (they do not wrap or shrink)', () => {
    expect(FORM).toMatch(/<div class="flex flex-wrap items-center gap-2 shrink-0">\s*<button onclick="showSaleMediaDocs\(\)"/);     // flex-wrap: on a phone Submit and Cancel wrap under the others instead of running off the edge
    expect(FORM).toMatch(/onclick="manualSaveDraft\('sale'\)"[^>]*whitespace-nowrap/);
  });
});
