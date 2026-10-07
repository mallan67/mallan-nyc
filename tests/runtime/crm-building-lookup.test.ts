/// <reference types="jest" />
/**
 * The address finds the building (public/crm/js/forms/building-lookup.js, and the two Add forms' lookup).
 *
 * The agent types the property's address and leaves the box: the form asks the building index (GET /api/buildings/search), applies the one building the address names
 * (area, address atoms, building facts), sets the property type from the building's Cotality CommonInterest and locks it until the agent presses Override, and offers a
 * list when the address fits several buildings. The Sale form already did most of this; the Rental form's lookup never reached the index and its building fill wrote
 * to ids that do not exist. These tests drive the REAL pages with the building index stubbed.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, sleep, PAGE_MODULES, type AddForm, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const MODULE_SOURCE = readFileSync(resolve(__dirname, '../../public/crm/js/forms/building-lookup.js'), 'utf8');
const BL: any = (() => { const w: any = {}; new Function('window', 'document', MODULE_SOURCE)(w, {}); return w.MallanBuildingLookup; })();

// What GET /api/buildings/search answers for one building (snake_case, as the route returns it).
const COOP = {
  address: '200 E 66th St', name: 'The Plaza Tower', borough: 'Manhattan', zip: '10065', neighborhood: 'Lenox Hill', common_interest: 'StockCooperative',
  structure_type: 'HighRise', year_built: 1961, stories_total: 32, units_total: 160, elevator: true, gym: true, roof_deck: true, tax_block: '1423', tax_lot: '7',
  association_name: 'The Plaza Tower Corp', cross_street: 'Third Avenue', building_pets: ['BuildingYes'], building_laundry: ['CoinOperated'],
};
const CONDO = { ...COOP, address: '15 Central Park W', name: 'Trump Parc', neighborhood: 'Lincoln Square', zip: '10023', common_interest: 'Condominium', tax_block: '1112', tax_lot: '9' };
// A townhouse as GET /api/buildings/search really answers it: no CommonInterest, and no property_sub_type (the route does not emit that key; its database path puts the
// sub-type into common_interest, which is what TOWNHOUSE_IN_COMMON_INTEREST is).
const TOWNHOUSE = { ...COOP, address: '40 W 12th St', name: '', common_interest: null, neighborhood: 'Greenwich Village', zip: '10011' };
const TOWNHOUSE_IN_COMMON_INTEREST = { ...TOWNHOUSE, common_interest: 'MultiFamily' };

type Page = {
  form: AddForm; prefix: 'rental' | 'sale'; bld: string;                       // bld: the id prefix of the building tab's controls (saleBldg*, bldg*)
  modalSearch: string; modalResults: string; modalSearchInput: string; modalSearchFn: (f: BootedForm, q: string) => unknown; collector: string;
};
const PAGES: Page[] = [
  { form: 'RENTAL-FORM-REDESIGN', prefix: 'rental', bld: 'bldg', modalSearch: 'searchBuildingModal', modalResults: 'bldgSearchResults', modalSearchInput: 'bldgAddressSearch', modalSearchFn: (f, q) => f.w.searchBuildingModal(q), collector: 'collectRentalFormData' },
  { form: 'SALE-FORM-REDESIGN', prefix: 'sale', bld: 'saleBldg', modalSearch: 'searchBuildingByAddress', modalResults: 'saleBldgSearchResults', modalSearchInput: 'saleBldgAddressSearch', modalSearchFn: (f, q) => f.w.searchBuildingByAddress(q, 'sale'), collector: 'collectSaleFormData' },
];

const val = (f: BootedForm, id: string) => ((f.d.getElementById(id) as HTMLInputElement | null)?.value) ?? '';
const checked = (f: BootedForm, id: string) => !!(f.d.getElementById(id) as HTMLInputElement | null)?.checked;
const radios = (f: BootedForm, p: Page) => [...f.d.querySelectorAll(`input[name="${p.prefix}PropertyType"]`)] as HTMLInputElement[];
const chosenType = (f: BootedForm, p: Page) => radios(f, p).find((r) => r.checked)?.value ?? '';
const notice = (f: BootedForm, p: Page) => f.d.querySelector(`[data-building-lock="${p.prefix}"]`) as HTMLElement | null;
const hidden = (f: BootedForm, id: string) => f.d.getElementById(id)?.classList.contains('hidden') ?? true;
const typeAddress = (f: BootedForm, p: Page, text: string) => {
  const el = f.d.getElementById(`${p.prefix}StreetAddress`) as HTMLInputElement;
  el.value = text;
  el.dispatchEvent(new f.w.Event('input', { bubbles: true }));
};
const leaveAddress = async (f: BootedForm, p: Page, wait = 350) => {
  f.d.getElementById(`${p.prefix}StreetAddress`)!.dispatchEvent(new f.w.Event('blur'));
  await sleep(wait);
};
const resolveAddress = async (f: BootedForm, p: Page, text: string) => { typeAddress(f, p, text); await leaveAddress(f, p); };
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('.toast-notification, body > div[style*="99999"]')].map((t) => t.textContent ?? '');

// ── the module ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('building-lookup: comparing addresses', () => {
  it.each([
    ['200 East 66th Street', '200 E 66th St', true],
    ['200 E. 66th St.', '200 east 66 street', true],
    ['15 Central Park West', '15 Central Park W', true],
    ['200 East 66th Street', '200 East 67th Street', false],
    ['200 East 66th Street', '201 East 66th Street', false],
    ['200 East 66th Street', '', false],
  ])('%j vs %j: same address = %s', (a, b, same) => {
    expect(BL.normalizeAddress(a) === BL.normalizeAddress(b) && BL.normalizeAddress(a) !== '').toBe(same);
  });

  it('exactMatch returns the one candidate that IS the typed address, and nothing when there are none or several', () => {
    const list = [{ address: '200 E 66th St' }, { address: '200 E 66th St Annex' }];
    expect(BL.exactMatch(list, '200 East 66th Street')).toBe(list[0]);
    expect(BL.exactMatch(list, '200 East 66th')).toBeNull();
    expect(BL.exactMatch([{ address: '200 E 66th St' }, { address: '200 East 66th Street' }], '200 E 66th St')).toBeNull();   // two of the same: ambiguous
    expect(BL.exactMatch([], '200 E 66th St')).toBeNull();
    expect(BL.exactMatch([{ address: '' }], '')).toBeNull();                                      // nothing typed names nothing
    expect(BL.exactMatch(null, '200 E 66th St')).toBeNull();
  });
});

// ── the real forms ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe.each(PAGES)('$form: the address finds the building', (p) => {
  it('boots without a page error and has not asked the building index', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      expect(f.searched).toEqual([]);
      expect(typeof (f.w as any).MallanBuildingLookup.lock).toBe('function');
    } finally { f.close(); }
  });

  it('applies the one building the typed address names: address, area, address atoms, property type, banner and the building facts', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(f.searched).toEqual(['200 East 66th Street']);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');                      // the building's own address
      expect(val(f, `${p.prefix}Borough`)).toBe('Manhattan');
      expect(val(f, `${p.prefix}ZipCode`)).toBe('10065');
      expect(val(f, `${p.prefix}NeighborhoodFromAddress`)).toBe('Lenox Hill');
      expect(val(f, `${p.prefix}CountyOrParish`)).toBe('New York');                       // derived from the borough
      expect(val(f, `${p.prefix}PostalCity`)).toBe('New York');
      expect([val(f, `${p.prefix}StreetNumber`), val(f, `${p.prefix}StreetDirPrefix`), val(f, `${p.prefix}StreetName`), val(f, `${p.prefix}StreetSuffix`)]).toEqual(['200', 'E', '66th', 'St']);
      expect(chosenType(f, p)).toBe('Coop');
      expect(hidden(f, `${p.prefix}IdxMatchBanner`)).toBe(false);
      expect(f.d.getElementById(`${p.prefix}IdxDetectedType`)!.textContent).toBe('Coop');
      expect(f.d.getElementById(`${p.prefix}IdxDetectedBuilding`)!.textContent).toBe('The Plaza Tower');
      // the building tab
      expect(val(f, `${p.bld}Name`)).toBe('The Plaza Tower');
      expect(val(f, `${p.bld}YearBuilt`)).toBe('1961');
      expect(val(f, `${p.bld}TotalFloors`)).toBe('32');
      expect(val(f, `${p.bld}TotalUnits`)).toBe('160');
      expect(val(f, `${p.bld}TaxBlock`)).toBe('1423');
      expect(val(f, `${p.bld}TaxLot`)).toBe('7');
      expect(val(f, `${p.bld}CrossStreet1`)).toBe('Third Avenue');
      expect(checked(f, `${p.bld}Elevator`)).toBe(true);
      expect(checked(f, `${p.bld}Gym`)).toBe(true);
      expect(checked(f, `${p.bld}RoofDeck`)).toBe(true);
      expect(val(f, `${p.bld}AssociationName`)).toBe('The Plaza Tower Corp');
      expect([...f.d.querySelectorAll(`input[name="${p.prefix}BuildingLaundryFeatures"]:checked`)].map((c) => (c as HTMLInputElement).value)).toContain('CoinOperated');
      expect([...f.d.querySelectorAll(`input[name="${p.prefix}BuildingPetsAllowed"]:checked`)].length).toBeGreaterThan(0);
      expect([...new Set(f.errors)]).toEqual([]);
    } finally { f.close(); }
  });

  it('what it filled is what the form submits', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      const payload = (f.w as any)[p.collector]();
      expect(payload[`${p.bld}YearBuilt`]).toBe('1961');
      expect(payload[`${p.bld}TaxBlock`]).toBe('1423');
      expect(payload[`${p.prefix}PropertyType`]).toBe('Coop');
    } finally { f.close(); }
  });

  it('never touches the unit the agent entered', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      (f.d.getElementById(`${p.prefix}UnitNumber`) as HTMLInputElement).value = '5C';
      await resolveAddress(f, p, '200 East 66th Street');
      expect(val(f, `${p.prefix}UnitNumber`)).toBe('5C');
    } finally { f.close(); }
  });

  it('holds the property type a building\'s Cotality record names, and says why; Override releases it', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      expect(notice(f, p)!.textContent).toContain('locked to Co-op');
      expect(notice(f, p)!.textContent).toContain('StockCooperative');
      (f.w as any).confirm = () => false;                                                      // the agent changes their mind
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      (f.w as any).confirm = () => true;
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(notice(f, p)!.textContent).toBe('');
      expect((f.w as any).MallanBuildingLookup.isLocked(p.prefix)).toBe(false);
      expect(chosenType(f, p)).toBe('Coop');                                                   // releasing the lock does not change the type
    } finally { f.close(); }
  });

  it('shows the lock where the property type is chosen (the match banner can be hidden), with the Override control, one notice however many buildings are picked', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP, CONDO], settle: 600 });
    try {
      expect(notice(f, p)).toBeNull();                                                         // nothing locked: nothing added to the page
      await resolveAddress(f, p, '200 East 66th Street');
      const line = notice(f, p)!;
      const banner = f.d.getElementById(`${p.prefix}IdxMatchBanner`)!;
      expect(banner.contains(line)).toBe(false);
      expect(line.parentElement).toBe(radios(f, p)[0].closest('label')!.parentElement!.parentElement);   // in the block that holds the radios
      expect(line.previousElementSibling?.textContent).toContain('Listing Classification');                 // right under their heading
      banner.classList.add('hidden');                                                          // whatever hides the match banner
      expect(line.classList.contains('hidden')).toBe(false);
      expect(line.querySelector('[data-building-override]')).not.toBeNull();
      await resolveAddress(f, p, '15 Central Park West');                                      // a second building takes the lock over
      expect(f.d.querySelectorAll(`[data-building-lock="${p.prefix}"]`).length).toBe(1);
      expect(notice(f, p)!.textContent).toContain('locked to Condo');
      expect(notice(f, p)!.classList.contains('hidden')).toBe(false);
      (f.w as any).confirm = () => true;
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      expect(notice(f, p)!.classList.contains('hidden')).toBe(true);
    } finally { f.close(); }
  });

  it('locks a condo to Condo, and a co-op shows fields a condo does not (the field rules run on the type the building names)', async () => {
    const seen: Record<string, string[]> = {};
    for (const building of [COOP, CONDO]) {
      const f = await bootAddForm(p.form, { buildings: [building], settle: 600 });
      try {
        await resolveAddress(f, p, building.address);
        expect(chosenType(f, p)).toBe(building === COOP ? 'Coop' : 'Condo');
        expect(notice(f, p)!.textContent).toContain(building === COOP ? 'locked to Co-op' : 'locked to Condo');
        // every element the field rules hide or show, by id
        const ruleIds: string[] = f.w.eval(p.prefix === 'sale' ? 'Object.keys(SALES_FIELD_VISIBILITY_RULES)' : 'Object.keys(RENTAL_FIELD_VISIBILITY_RULES)');
        seen[building.common_interest as string] = ruleIds.filter((id) => { const e = f.d.getElementById(id); return e && !e.classList.contains('hidden') && e.style.display !== 'none'; });
      } finally { f.close(); }
    }
    const coopOnly = seen.StockCooperative.filter((id) => !seen.Condominium.includes(id));
    expect(coopOnly.length).toBeGreaterThan(0);
  });

  it.each([
    ['a building with no CommonInterest', TOWNHOUSE],
    ['a sub-type the index carries in common_interest', TOWNHOUSE_IN_COMMON_INTEREST],
  ])('%s sets and locks no property type (a sub-type is not the building\'s Cotality classification)', async (_name, building) => {
    const f = await bootAddForm(p.form, { buildings: [building], settle: 600 });
    try {
      const before = chosenType(f, p);
      await resolveAddress(f, p, '40 West 12th Street');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('40 W 12th St');                                // the building itself was applied
      expect(chosenType(f, p)).toBe(before);
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(notice(f, p)?.textContent ?? '').toBe('');
    } finally { f.close(); }
  });

  it('only a CommonInterest classification locks, and only a type the form is showing', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      const lookup = (f.w as any).MallanBuildingLookup;
      radios(f, p).find((r) => r.value === 'Coop')!.checked = true;
      expect(lookup.lock(p.prefix, { type: 'Coop', commonInterestRaw: '', address: '1 A St' })).toBe(false);                 // the type did not come from a CommonInterest
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(lookup.lock(p.prefix, { type: 'Condo', commonInterestRaw: 'Condominium', address: '1 A St' })).toBe(false);    // Condo is not what the form shows
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(lookup.lock(p.prefix, { type: 'Coop', commonInterestRaw: 'StockCooperative', address: '1 A St' })).toBe(true);
      expect(lookup.isLocked(p.prefix)).toBe(true);
    } finally { f.close(); }
  });

  it('an address the agent typed is not looked up again after they chose a building from the search box', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      typeAddress(f, p, '200 East 66th Street');                                                   // typed, not yet left
      f.w.searchBuildingForListing('200 east', p.prefix);
      await sleep(500);
      expect(f.searched).toEqual(['200 east']);
      (f.d.querySelector(`#${p.prefix}BuildingSearchResults [data-building]`) as HTMLElement).click();
      expect(val(f, `${p.bld}YearBuilt`)).toBe('1961');
      (f.d.getElementById(`${p.bld}YearBuilt`) as HTMLInputElement).value = '1999';                 // the agent corrects the building after choosing it
      await leaveAddress(f, p);
      expect(f.searched).toEqual(['200 east']);                                                    // the address the form wrote is not looked up
      expect(val(f, `${p.bld}YearBuilt`)).toBe('1999');                                           // (the building it names is not applied again over the correction)
    } finally { f.close(); }
  });

  it('releases the lock when the agent changes the address to something else', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      typeAddress(f, p, '200 East 66th Street');                                               // the same address, retyped: still the building
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      typeAddress(f, p, '300 East 66th Street');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(notice(f, p)!.textContent).toBe('');
    } finally { f.close(); }
  });

  it('offers the candidates when the address fits several buildings and none IS the typed address, and applies the one the agent picks', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP, CONDO], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th');
      const rows = [...f.d.querySelectorAll(`#${p.prefix}BuildingSearchResults [data-building]`)] as HTMLElement[];
      expect(rows.map((r) => r.getAttribute('data-building'))).toEqual(['200 E 66th St', '15 Central Park W']);
      expect(chosenType(f, p)).not.toBe('Coop');                                                // nothing was applied
      expect(val(f, `${p.prefix}Borough`)).toBe('');
      rows[1].click();
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('15 Central Park W');
      expect(chosenType(f, p)).toBe('Condo');
      expect([val(f, `${p.prefix}StreetNumber`), val(f, `${p.prefix}StreetDirPrefix`)]).toEqual(['15', '']);                  // the address atoms follow a pick from the list
      expect(val(f, `${p.prefix}StreetName`)).toContain('Central Park');
    } finally { f.close(); }
  });

  it('applies the one candidate whose address IS the typed address, though others came back too', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, address: '200 E 66th St Annex', name: 'Annex' }, COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');
      expect(chosenType(f, p)).toBe('Coop');
    } finally { f.close(); }
  });

  it('says so when no building matches, and still parses the typed address', async () => {
    const f = await bootAddForm(p.form, { buildings: [], settle: 600 });
    try {
      await resolveAddress(f, p, '1 Nowhere Lane');
      expect(f.d.getElementById(`${p.prefix}BuildingSearchResults`)!.textContent).toMatch(/No building match found/);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('1 Nowhere Lane');
      expect([val(f, `${p.prefix}StreetNumber`), val(f, `${p.prefix}StreetName`), val(f, `${p.prefix}StreetSuffix`)]).toEqual(['1', 'Nowhere', 'Lane']);
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
    } finally { f.close(); }
  });

  it('says what went wrong when the building index does', async () => {
    const down = await bootAddForm(p.form, { buildings: [], buildingsStatus: 500, buildingsHint: 'Cotality is not answering', settle: 600 });
    try {
      await resolveAddress(down, p, '200 East 66th Street');
      expect(toasts(down).some((t) => /Cotality is not answering/.test(t))).toBe(true);
      expect(val(down, `${p.prefix}Borough`)).toBe('');
    } finally { down.close(); }
    const out = await bootAddForm(p.form, { buildings: [], buildingsStatus: 401, settle: 600 });
    try {
      await resolveAddress(out, p, '200 East 66th Street');
      expect(toasts(out).some((t) => /Session expired/.test(t))).toBe(true);
    } finally { out.close(); }
  });

  it('shows building names, addresses and neighborhoods as text, never as markup', async () => {
    const hostile = '<img/src=x/onerror=window.__pwned=1>';
    const f = await bootAddForm(p.form, {
      buildings: [{ ...COOP, address: `1 ${hostile} Ave`, name: hostile, neighborhood: hostile }, { ...CONDO, address: `2 ${hostile} Ave`, name: hostile, neighborhood: hostile }], settle: 600,
    });
    try {
      await resolveAddress(f, p, '1 Hostile Avenue');
      const box = f.d.getElementById(`${p.prefix}BuildingSearchResults`) as HTMLElement;
      expect(box.querySelector('img')).toBeNull();
      expect(box.textContent).toContain(hostile);
      (box.querySelector('[data-building]') as HTMLElement).click();
      expect(f.d.getElementById(`${p.prefix}IdxMatchBanner`)!.querySelector('img')).toBeNull();
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });

  it('writes the list\'s messages as text', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      const box = f.d.getElementById(`${p.prefix}BuildingSearchResults`) as HTMLElement;
      (f.w as any).MallanBuildingLookup.message(box, '<img/src=x/onerror=window.__pwned=1>');
      expect(box.querySelector('img')).toBeNull();
      expect(box.textContent).toBe('<img/src=x/onerror=window.__pwned=1>');
      expect(box.classList.contains('hidden')).toBe(false);
    } finally { f.close(); }
  });

  it('ignores the answer for an address the agent has changed while the index was answering', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], buildingsDelay: 400, settle: 600 });
    try {
      typeAddress(f, p, '200 East 66th Street');
      f.d.getElementById(`${p.prefix}StreetAddress`)!.dispatchEvent(new f.w.Event('blur'));
      await sleep(100);
      typeAddress(f, p, '1 Somewhere Else Road');                                                   // before the answer arrives
      await sleep(600);
      expect(f.searched).toEqual(['200 East 66th Street']);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('1 Somewhere Else Road');
      expect(chosenType(f, p)).not.toBe('Coop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
    } finally { f.close(); }
  });

  it('looks an address up once: leaving the box again without changing it asks nothing', async () => {
    const f = await bootAddForm(p.form, { buildings: [], settle: 600 });
    try {
      await resolveAddress(f, p, '1 Nowhere Lane');
      await leaveAddress(f, p);
      await leaveAddress(f, p);
      expect(f.searched).toEqual(['1 Nowhere Lane']);
      typeAddress(f, p, '2 Nowhere Lane');
      await leaveAddress(f, p);
      expect(f.searched).toEqual(['1 Nowhere Lane', '2 Nowhere Lane']);
    } finally { f.close(); }
  });

  it('does not look up an address the form filled in itself (a saved listing), and leaves its property type alone', async () => {
    const f = await bootAddForm(p.form, {
      search: '?id=1', buildings: [COOP], settle: 1800,
      listing: {
        id: '1', listing_id: 'L-1', status: 'Draft', address: { StreetNumber: '200', StreetDirPrefix: 'E', StreetName: '66th', StreetSuffix: 'St', UnparsedAddress: '200 E 66th St' },
        features: {}, media: [], agent_info: {}, raw_data: { [`${p.prefix}StreetAddress`]: '200 E 66th St', [`${p.prefix}PropertyType`]: 'Condop' },
      },
    });
    try {
      const before = chosenType(f, p);
      await leaveAddress(f, p);                                                                  // the agent clicks into the box and out again
      expect(f.searched).toEqual([]);
      expect(chosenType(f, p)).toBe(before);
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
    } finally { f.close(); }
  });

  it('the Building tab searches the building index too (when the cache has no match) and fills the whole building when one is chosen', async () => {
    const f = await bootAddForm(p.form, { buildings: [CONDO], settle: 600 });
    try {
      (f.d.getElementById(p.modalSearchInput) as HTMLInputElement).value = 'central park';
      await p.modalSearchFn(f, 'central park');
      await sleep(500);
      expect(f.searched).toEqual(['central park']);
      const rows = [...f.d.querySelectorAll(`#${p.modalResults} [data-building]`)] as HTMLElement[];
      expect(rows.map((r) => r.getAttribute('data-building'))).toEqual(['15 Central Park W']);
      rows[0].click();
      expect(val(f, `${p.bld}Name`)).toBe('Trump Parc');
      expect(val(f, `${p.bld}TaxBlock`)).toBe('1112');
      expect(val(f, `${p.bld}TotalFloors`)).toBe('32');
      expect(chosenType(f, p)).toBe('Condo');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      expect(val(f, p.modalSearchInput)).toBe('15 Central Park W');
    } finally { f.close(); }
  });

  it('the Building tab says so when nothing matches', async () => {
    const f = await bootAddForm(p.form, { buildings: [], settle: 600 });
    try {
      await p.modalSearchFn(f, 'zzzz nowhere');
      await sleep(500);
      expect(f.d.getElementById(p.modalResults)!.textContent).toMatch(/No building match found/);
    } finally { f.close(); }
  });
});

describe('Sale: an In-House listing keeps the address the agent typed and still gets, and holds, the building\'s type', () => {
  it('applies the building\'s property type without replacing the typed address', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [COOP], settle: 600 });
    try {
      (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
      (f.w as any).confirm = () => false;                                                       // keep what I typed
      typeAddress(f, PAGES[1], '200 East 66th Street');
      await leaveAddress(f, PAGES[1]);
      expect(val(f, 'saleStreetAddress')).toBe('200 East 66th Street');
      expect(chosenType(f, PAGES[1])).toBe('Coop');
      expect(radios(f, PAGES[1]).every((r) => r.disabled)).toBe(true);
    } finally { f.close(); }
  });

  it('an Override stays here too: picking the building again does not set its type over the one the agent chose', async () => {
    const p = PAGES[1];
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [COOP], settle: 600 });
    try {
      (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
      (f.w as any).confirm = () => false;                                                       // keep what I typed
      typeAddress(f, p, '200 East 66th Street');
      await leaveAddress(f, p);
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      (f.w as any).confirm = () => true;
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      radios(f, p).find((r) => r.value === 'Condop')!.checked = true;
      (f.w as any).confirm = () => false;
      f.w.searchBuildingForListing('200 east', p.prefix);
      await sleep(500);
      rowsOf(f, `${p.prefix}BuildingSearchResults`)[0].click();                                  // a deliberate pick, the typed address kept again
      expect(val(f, 'saleStreetAddress')).toBe('200 East 66th Street');
      expect(chosenType(f, p)).toBe('Condop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
    } finally { f.close(); }
  });
});

describe('Sale: choosing an In-House listing type clears the building match, and with it the property type the building held', () => {
  it('releases the lock and hides the match banner, leaving the type as it was', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, PAGES[1], '200 East 66th Street');
      expect(radios(f, PAGES[1]).every((r) => r.disabled)).toBe(true);
      expect(hidden(f, 'saleIdxMatchBanner')).toBe(false);
      f.w.handleSaleListingTypeChange('InHouseInternal');
      expect(hidden(f, 'saleIdxMatchBanner')).toBe(true);
      expect(radios(f, PAGES[1]).some((r) => r.disabled)).toBe(false);                        // no disabled radios with nothing on screen to explain them
      expect(notice(f, PAGES[1])!.classList.contains('hidden')).toBe(true);
      expect((f.w as any).MallanBuildingLookup.isLocked('sale')).toBe(false);
      expect(chosenType(f, PAGES[1])).toBe('Coop');
    } finally { f.close(); }
  });
});

describe('Rental: the Building tab offers the neighborhoods Cotality has', () => {
  it('adds a neighborhood the page did not list', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { neighborhoods: { Manhattan: ['Testville Heights'] }, settle: 800 });
    try {
      const options = [...(f.d.getElementById('bldgNeighborhood') as HTMLSelectElement).options].map((o) => o.text);
      expect(options).toContain('Testville Heights');
    } finally { f.close(); }
  });
});

describe('Rental: Save Building applies the building to the listing', () => {
  it('mirrors the building tab\'s address and neighborhood into the main form and clears an address that was used as a building name', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 600 });
    try {
      (f.d.getElementById('rentalStreetAddress') as HTMLInputElement).value = '200 E 66th St';
      (f.d.getElementById('bldgName') as HTMLInputElement).value = '200 E 66th St';
      f.w.saveRentalBuilding();
      expect(val(f, 'bldgStreetAddress')).toBe('200 E 66th St');
      expect(val(f, 'bldgName')).toBe('');
      expect(toasts(f).some((t) => /Building information applied/.test(t))).toBe(true);
    } finally { f.close(); }
  });
});

// ══ What the independent review of the address -> building work (23843e22) found, and what this fixes ═══════════════════════════════════════════════════════════════════
// Both forms are driven the way an agent drives them, with the building index stubbed (add-form-harness.ts: per-request delay, status and reply).
const ALPHA = { ...CONDO, address: '100 Water St', name: 'Alpha Tower', borough: 'Manhattan', zip: '10038', neighborhood: 'Financial District' };
const BETA = { ...COOP, address: '100 Water St', name: 'Beta House', borough: 'Brooklyn', zip: '11201', neighborhood: 'DUMBO' };
const rowsOf = (f: BootedForm, boxId: string) => [...f.d.querySelectorAll(`#${boxId} [data-building]`)] as HTMLElement[];
const addressOf = (r: HTMLElement) => r.getAttribute('data-building');
const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };

describe('building-lookup: the street address behind what an agent typed', () => {
  it.each([
    ['200 East 66th Street', '200 East 66th Street', ''],
    ['200 East 66th Street Apt 12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street Apt. 12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street #12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street # 12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street Apt #12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street Apt. #4', '200 East 66th Street', '4'],
    ['200 East 66th Street Apt # 12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street Unit #4', '200 East 66th Street', '4'],
    ['350 5th Ave Ste #200', '350 5th Ave', '200'],
    ['350 5th Ave Fl #3', '350 5th Ave', '3'],
    ['10 Unit Street Apt 4', '10 Unit Street', '4'],                // a street called Unit, and then a unit
    ['10 Unit Street #4', '10 Unit Street', '4'],
    ['200 East 66th Street Unit 4', '200 East 66th Street', '4'],
    ['350 5th Ave Ste 200', '350 5th Ave', '200'],
    ['200 East 66th Street, Apt 12B', '200 East 66th Street', '12B'],
    ['200 East 66th Street, #4', '200 East 66th Street', '4'],
    ['200 E. 66th St., Apt. 5', '200 E. 66th St.', '5'],
    ['200 East 66th Street, New York, NY 10065', '200 East 66th Street', ''],
    ['  200   East 66th   Street ', '200 East 66th Street', ''],
    ['1 Unit Street', '1 Unit Street', ''],                       // a street called Unit is a street
    ['10 Suite Road', '10 Suite Road', ''],
    ['12 Fl Ave', '12 Fl Ave', ''],
    ['100 Park Avenue South', '100 Park Avenue South', ''],
    ['Apt 4', 'Apt 4', ''],
    ['', '', ''],
  ])('%j is the street address %j, unit %j', (typedText, street, unit) => {
    expect(BL.splitAddress(typedText)).toEqual({ street, unit });
    expect(BL.searchText(typedText)).toBe(street);
  });

  it('exactMatch compares the street address, and a lone candidate is a match only when its address is the typed one', () => {
    expect(BL.exactMatch([{ address: '200 E 66th St' }], '200 East 66th Street Apt 12B')).toEqual({ address: '200 E 66th St' });
    expect(BL.exactMatch([{ address: '200 E 66th St' }], '200 East 66th Street, New York, NY 10065')).toEqual({ address: '200 E 66th St' });
    expect(BL.exactMatch([{ address: '200 E 66th St' }], '20 East 66th Street')).toBeNull();                 // the index answered with another building
    expect(BL.exactMatch([{ address: '' }], '20 East 66th Street')).toBeNull();                               // a candidate with no address is nobody's address
    expect(BL.exactMatch([{ address: '100 Water St', borough: 'Manhattan' }, { address: '100 Water St', borough: 'Brooklyn' }], '100 Water Street')).toBeNull();   // two buildings
  });
});

describe('building-lookup: the Borough a building\'s answer names', () => {
  it.each([
    ['Manhattan', 'Manhattan'], ['manhattan', 'Manhattan'], ['MANHATTAN', 'Manhattan'], ['New York County', 'Manhattan'],
    ['Brooklyn', 'Brooklyn'], ['Kings', 'Brooklyn'], ['Kings County', 'Brooklyn'],
    ['Queens', 'Queens'], ['Queens County', 'Queens'],
    ['Bronx', 'Bronx'], ['The Bronx', 'Bronx'], ['Bronx County', 'Bronx'],
    ['Staten Island', 'StatenIsland'], ['StatenIsland', 'StatenIsland'], ['staten island', 'StatenIsland'], ['Richmond', 'StatenIsland'], ['Richmond County', 'StatenIsland'],
    ['Manhattan, NY', 'Manhattan'], ['Brooklyn NY', 'Brooklyn'], ['Staten Island, NY', 'StatenIsland'], ['New York, NY', ''], ['NY', ''], ['ny', ''],
    ['New York', ''], ['New York City', ''], ['Gotham', ''], ['', ''], [null, ''], [undefined, ''], [42, ''], ['constructor', ''], ['__proto__', ''],
  ])('%j is the Borough option %j', (spelling, option) => {
    expect(BL.boroughValue(spelling)).toBe(option);
  });
});

describe('building-lookup: which building the form applied, and what the agent overrode', () => {
  const A = { address: '200 E 66th St', borough: 'Manhattan', zip: '10065', type: 'Coop', commonInterestRaw: 'StockCooperative' };
  const B = { ...A, address: '15 Central Park W', zip: '10023', type: 'Condo', commonInterestRaw: 'Condominium' };
  const twin = { ...A, borough: 'Brooklyn' };                                                      // the same address and zip in another borough
  it('knows the building it applied by address, borough and zip (two buildings can share an address), and a spelling of the same address', () => {
    const lookup: any = (() => { const w: any = {}; new Function('window', 'document', MODULE_SOURCE)(w, {}); return w.MallanBuildingLookup; })();      // a module of its own: the state is per module
    expect(lookup.isApplied('sale', A)).toBe(false);
    lookup.markApplied('sale', A);
    expect(lookup.isApplied('sale', A)).toBe(true);
    expect(lookup.isApplied('sale', { ...A, address: '200 East 66th Street', borough: 'manhattan' })).toBe(true);
    expect(lookup.isApplied('sale', twin)).toBe(false);
    expect(lookup.isApplied('sale', { ...A, zip: '10099' })).toBe(false);                    // the zip is part of the building too
    // one building written two ways is one building: the borough as the form names it, the zip by its five digits
    expect(lookup.isApplied('sale', { ...A, borough: 'New York County', zip: '10065-1234' })).toBe(true);
    expect(lookup.isApplied('sale', { ...A, borough: 'Manhattan, NY' })).toBe(true);
    expect(lookup.isApplied('sale', { ...A, borough: 'MANHATTAN', zip: ' 10065 ' })).toBe(true);
    expect(lookup.isApplied('sale', { ...A, borough: 'New York' })).toBe(false);              // the city names no borough: that is not Manhattan
    expect(lookup.isApplied('sale', { ...A, zip: '' })).toBe(false);
    expect(lookup.isApplied('sale', B)).toBe(false);
    expect(lookup.isApplied('rental', A)).toBe(false);                    // each form has its own
    lookup.reset('sale');
    expect(lookup.isApplied('sale', A)).toBe(false);
    expect(lookup.isApplied('sale', null)).toBe(false);
  });
});

describe.each(PAGES)('$form: a candidate that is not the typed address is never applied for it', (p) => {
  it('a lone candidate for another address is offered in the list, and applied only when the agent picks it', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });                       // the index answers "200 E 66th St" for "20 East 66th Street"
    try {
      await resolveAddress(f, p, '20 East 66th Street');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('20 East 66th Street');                        // what the agent typed
      expect(chosenType(f, p)).not.toBe('Coop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(val(f, `${p.prefix}Borough`)).toBe('');
      expect(val(f, `${p.bld}Name`)).toBe('');
      const rows = rowsOf(f, `${p.prefix}BuildingSearchResults`);
      expect(rows.map(addressOf)).toEqual(['200 E 66th St']);
      rows[0].click();
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');
      expect(chosenType(f, p)).toBe('Coop');
    } finally { f.close(); }
  });

  it('a lone candidate that has no address of its own never erases the one the agent typed', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, address: '', name: 'Nameless Tower' }], settle: 600 });
    try {
      await resolveAddress(f, p, '1 Somewhere Road');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('1 Somewhere Road');
      const rows = rowsOf(f, `${p.prefix}BuildingSearchResults`);
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Nameless Tower');
      rows[0].click();                                                                               // even picked by hand
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('1 Somewhere Road');
      expect(val(f, `${p.bld}Name`)).toBe('Nameless Tower');
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: two buildings with one address', (p) => {
  it('neither is applied for the typed address, the one the agent clicks is, and the cache never picks one for them', async () => {
    const f = await bootAddForm(p.form, { buildings: [ALPHA, BETA], settle: 600 });
    try {
      await resolveAddress(f, p, '100 Water Street');
      const rows = rowsOf(f, `${p.prefix}BuildingSearchResults`);
      expect(rows).toHaveLength(2);
      expect(val(f, `${p.prefix}Borough`)).toBe('');
      rows[1].click();                                                                               // the SECOND row
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`), chosenType(f, p), val(f, `${p.bld}Name`)]).toEqual(['Brooklyn', '11201', 'Coop', 'Beta House']);
      rows[0].click();                                                                               // and the first one
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`), chosenType(f, p), val(f, `${p.bld}Name`)]).toEqual(['Manhattan', '10038', 'Condo', 'Alpha Tower']);
      typeAddress(f, p, '100 Water Street');                                                         // the same address typed again: two buildings are still two buildings
      await leaveAddress(f, p);
      typeAddress(f, p, '100 Water St');                                                             // spelled as the cache holds it
      await leaveAddress(f, p);
      expect(f.searched).toEqual(['100 Water Street', '100 Water Street', '100 Water St']);
      expect(rowsOf(f, `${p.prefix}BuildingSearchResults`)).toHaveLength(2);
      expect(val(f, `${p.bld}Name`)).toBe('Alpha Tower');                                            // nothing was applied over the one the agent chose
    } finally { f.close(); }
  });

  it('the Building tab applies the row the agent clicked', async () => {
    const f = await bootAddForm(p.form, { buildings: [ALPHA, BETA], settle: 600 });
    try {
      set(f, p.modalSearchInput, 'water');
      await p.modalSearchFn(f, 'water');
      await sleep(500);
      const rows = rowsOf(f, p.modalResults);
      expect(rows).toHaveLength(2);
      rows[1].click();
      expect([val(f, `${p.bld}Name`), val(f, `${p.bld}Borough`), val(f, `${p.bld}Zip`), chosenType(f, p)]).toEqual(['Beta House', 'Brooklyn', '11201', 'Coop']);
    } finally { f.close(); }
  });

  it('the Building tab applies the row the agent clicked when the list comes from what the address lookup already holds', async () => {
    const f = await bootAddForm(p.form, { buildings: [ALPHA, BETA], settle: 600 });
    try {
      await resolveAddress(f, p, '100 Water Street');                                                // the lookup holds both buildings now
      set(f, p.modalSearchInput, 'water');
      await p.modalSearchFn(f, 'water');
      const rows = rowsOf(f, p.modalResults);
      expect(rows).toHaveLength(2);
      expect(f.searched).toEqual(['100 Water Street']);                                              // no new query: the cache answered
      rows[1].click();
      expect([val(f, `${p.bld}Name`), val(f, `${p.bld}Borough`), val(f, `${p.bld}Zip`), chosenType(f, p)]).toEqual(['Beta House', 'Brooklyn', '11201', 'Coop']);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: an Override stays', (p) => {
  it('a keystroke and back neither sets the building\'s type again nor locks it; another building takes the lock, and coming back to the first applies it afresh', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP, CONDO], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      (f.w as any).confirm = () => true;
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      radios(f, p).find((r) => r.value === 'Condop')!.checked = true;                               // the agent knows better
      typeAddress(f, p, '200 East 66th Street');                                                     // one keystroke and back
      await leaveAddress(f, p);
      expect(chosenType(f, p)).toBe('Condop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect((f.w as any).MallanBuildingLookup.isLocked(p.prefix)).toBe(false);
      // the agent picks the same building from the list, or in the Building tab: its facts come, the type they chose stays theirs and unlocked
      set(f, `${p.bld}Name`, 'My Own Building Name');
      f.w.searchBuildingForListing('200 east', p.prefix);
      await sleep(500);
      rowsOf(f, `${p.prefix}BuildingSearchResults`)[0].click();
      expect(val(f, `${p.bld}Name`)).toBe('The Plaza Tower');
      expect(chosenType(f, p)).toBe('Condop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      set(f, `${p.modalSearchInput}`, 'plaza');
      await p.modalSearchFn(f, 'plaza');
      rowsOf(f, p.modalResults)[0].click();
      expect(chosenType(f, p)).toBe('Condop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      // an agent who overrode the lock and kept the building's own type is not locked in again by picking the building again
      radios(f, p).find((r) => r.value === 'Coop')!.checked = true;
      f.w.searchBuildingForListing('200 east', p.prefix);
      await sleep(500);
      rowsOf(f, `${p.prefix}BuildingSearchResults`)[0].click();
      expect(chosenType(f, p)).toBe('Coop');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect((f.w as any).MallanBuildingLookup.isLocked(p.prefix)).toBe(false);
      await resolveAddress(f, p, '15 Central Park West');                                            // another building: its type, its lock
      expect(chosenType(f, p)).toBe('Condo');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      await resolveAddress(f, p, '200 East 66th Street');                                            // the first one again is a new application of it
      expect(chosenType(f, p)).toBe('Coop');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: what the agent changed survives the next lookup of the same building', (p) => {
  it('the Building tab and the structure type stay as the agent left them; picking the building from the list again applies it again', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      set(f, `${p.bld}Name`, 'My Own Building Name'); set(f, `${p.bld}YearBuilt`, '1999'); set(f, `${p.bld}TotalFloors`, '99');
      set(f, `${p.bld}TaxBlock`, '555'); set(f, `${p.bld}AssociationName`, 'Mine Assoc'); set(f, `${p.prefix}StructureType`, 'Townhouse');
      (f.d.getElementById(`${p.bld}Gym`) as HTMLInputElement).checked = false;
      typeAddress(f, p, '200 East 66th Street');                                                     // a keystroke and back, then out of the box
      await leaveAddress(f, p);
      expect([val(f, `${p.bld}Name`), val(f, `${p.bld}YearBuilt`), val(f, `${p.bld}TotalFloors`), val(f, `${p.bld}TaxBlock`), val(f, `${p.bld}AssociationName`), val(f, `${p.prefix}StructureType`)])
        .toEqual(['My Own Building Name', '1999', '99', '555', 'Mine Assoc', 'Townhouse']);
      expect(checked(f, `${p.bld}Gym`)).toBe(false);
      f.w.searchBuildingForListing('200 east', p.prefix);                                            // a deliberate pick of the same building
      await sleep(500);
      rowsOf(f, `${p.prefix}BuildingSearchResults`)[0].click();
      expect([val(f, `${p.bld}Name`), val(f, `${p.bld}YearBuilt`), val(f, `${p.prefix}StructureType`)]).toEqual(['The Plaza Tower', '1961', 'HighRise']);
      expect(checked(f, `${p.bld}Gym`)).toBe(true);
    } finally { f.close(); }
  });

  it('a building picked in the Building tab counts as applied: its address left in the address box applies nothing over what the agent changed in the Building tab', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      set(f, p.modalSearchInput, 'plaza');
      await p.modalSearchFn(f, 'plaza');
      await sleep(500);
      rowsOf(f, p.modalResults)[0].click();
      expect(val(f, `${p.bld}Name`)).toBe('The Plaza Tower');
      set(f, `${p.bld}Name`, 'My Own Building Name');
      await resolveAddress(f, p, '200 East 66th Street');                                            // the same building, by its address
      expect(f.searched).toEqual(['plaza', '200 East 66th Street']);                                // (what a search by name returned is not the answer for an address: the index was asked)
      expect(val(f, `${p.bld}Name`)).toBe('My Own Building Name');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');                             // the box takes the building's own address, and the main form its area
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: an answer with missing or odd fields', (p) => {
  it.each([
    ['Manhattan', 'Manhattan'], ['manhattan', 'Manhattan'], ['Brooklyn', 'Brooklyn'], ['Kings', 'Brooklyn'], ['Queens', 'Queens'], ['Bronx', 'Bronx'], ['The Bronx', 'Bronx'],
    ['Staten Island', 'StatenIsland'], ['StatenIsland', 'StatenIsland'], ['Richmond', 'StatenIsland'],
  ])('the index says borough %j: the Borough is %j', async (spelling, option) => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, borough: spelling }], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(val(f, `${p.prefix}Borough`)).toBe(option);
      expect(val(f, `${p.bld}Borough`)).toBe(option);
    } finally { f.close(); }
  });

  it('a borough that is not one, and fields the answer does not carry, leave what the agent entered', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, borough: 'Gotham', zip: null, neighborhood: null }, ], settle: 600 });
    try {
      set(f, `${p.prefix}Borough`, 'Queens');
      set(f, `${p.prefix}ZipCode`, '11101');
      set(f, `${p.prefix}NeighborhoodFromAddress`, 'Astoria');
      await resolveAddress(f, p, '200 East 66th Street');
      expect(chosenType(f, p)).toBe('Coop');                                                         // the building itself was applied
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`), val(f, `${p.prefix}NeighborhoodFromAddress`)]).toEqual(['Queens', '11101', 'Astoria']);
    } finally { f.close(); }
  });
});

describe('Sale: opening the Commercial section does not change a property type a building holds', () => {
  it('the type stays while the building holds it, and the section selects Commercial once the agent has overridden the building', async () => {
    const p = PAGES[1];
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      const header = f.d.querySelector('[onclick*="selectSaleCommercial"]') as HTMLElement;
      (header.nextElementSibling as HTMLElement).style.display = 'block';
      f.w.selectSaleCommercial(header);
      expect(chosenType(f, p)).toBe('Coop');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      (f.w as any).confirm = () => true;
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      f.w.selectSaleCommercial(header);
      expect(chosenType(f, p)).toBe('Commercial');
    } finally { f.close(); }
  });
});

const FAILURES: [string, Partial<AddFormOpts>][] = [
  ['a 500', { buildingsStatus: (_q, call) => (call === 1 ? 500 : 200) }],
  ['a 401', { buildingsStatus: (_q, call) => (call === 1 ? 401 : 200) }],
  ['a 429', { buildingsStatus: (_q, call) => (call === 1 ? 429 : 200) }],
  ['an unreachable index', { buildingsReply: (_q, call) => { if (call === 1) throw new TypeError('Failed to fetch'); return undefined; } }],
  ['an answer that is not JSON', { buildingsReply: (_q, call) => (call === 1 ? { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); }, text: async () => '' } : undefined) }],
  ['an answer with no building list', { buildingsReply: (_q, call) => (call === 1 ? { ok: true, status: 200, json: async () => ({ buildings: null }), text: async () => '' } : undefined) }],
];
describe.each(PAGES)('$form: an index that cannot answer', (p) => {
  it.each(FAILURES)('%s: the box says the lookup is unavailable (not "no match"), and leaving the address again asks again', async (_name, failing) => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600, ...failing });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      const box = f.d.getElementById(`${p.prefix}BuildingSearchResults`) as HTMLElement;
      expect(box.textContent).toMatch(/Building lookup unavailable/);
      expect(box.textContent).not.toMatch(/No building match/);
      expect(val(f, `${p.prefix}Borough`)).toBe('');
      expect([val(f, `${p.prefix}StreetNumber`), val(f, `${p.prefix}StreetName`)]).toEqual(['200', '66th']);        // the typed address is still parsed
      await leaveAddress(f, p);                                                                        // the same address, left again: the index answers now
      expect(f.searched).toEqual(['200 East 66th Street', '200 East 66th Street']);
      expect(chosenType(f, p)).toBe('Coop');
      expect(val(f, `${p.prefix}Borough`)).toBe('Manhattan');
      await leaveAddress(f, p);
      expect(f.searched).toHaveLength(2);                                                              // answered: not asked again
    } finally { f.close(); }
  });

  it('the search box and the Building tab say so too, and an answer is never taken for "no match"', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], buildingsStatus: 500, settle: 600 });
    try {
      f.w.searchBuildingForListing('200 east', p.prefix);
      await sleep(600);
      expect(f.d.getElementById(`${p.prefix}BuildingSearchResults`)!.textContent).toMatch(/Building lookup unavailable/);
      set(f, p.modalSearchInput, 'central park');
      await p.modalSearchFn(f, 'central park');
      await sleep(600);
      expect(f.d.getElementById(p.modalResults)!.textContent).toMatch(/Building lookup unavailable/);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a building named after its street number', (p) => {
  it.each([
    ['5 Beekman St', 'Beekman Tower 55'],
    ['15 W 81st St', 'Park West 15'],
    ['200 Amsterdam Ave', '200 Amsterdam'],
  ])('%s, called %s, keeps its address', async (address, name) => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, address, name }], settle: 600 });
    try {
      await resolveAddress(f, p, address);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe(address);
      expect(chosenType(f, p)).toBe('Coop');
      expect(val(f, `${p.bld}Name`)).toBe(name);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: the building\'s doorman and concierge', (p) => {
  const ticked = (f: BootedForm) => [...f.d.querySelectorAll(`input[name="${p.prefix}AttendanceType"]:checked`)].map((c) => (c as HTMLInputElement).value);
  it('go into the Building Attendance Type the form has, when the agent has chosen none', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, doorman: true, concierge: true }], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(ticked(f)).toEqual(['DoormanYes', 'ConciergeYes']);
    } finally { f.close(); }
  });
  it('only the one the building has, and nothing for a building with neither', async () => {
    const only = await bootAddForm(p.form, { buildings: [{ ...COOP, doorman: true, concierge: false }], settle: 600 });
    const none = await bootAddForm(p.form, { buildings: [{ ...COOP, doorman: false, concierge: false }], settle: 600 });
    try {
      await resolveAddress(only, p, '200 East 66th Street');
      await resolveAddress(none, p, '200 East 66th Street');
      expect(ticked(only)).toEqual(['DoormanYes']);
      expect(ticked(none)).toEqual([]);
    } finally { only.close(); none.close(); }
  });
  it('never replace what the agent chose', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, doorman: true, concierge: true }], settle: 600 });
    try {
      (f.d.querySelector(`input[name="${p.prefix}AttendanceType"][value="LobbyAttendantFullTime"]`) as HTMLInputElement).checked = true;
      await resolveAddress(f, p, '200 East 66th Street');
      expect(ticked(f)).toEqual(['LobbyAttendantFullTime']);
    } finally { f.close(); }
  });
});

describe('Rental: an In-House listing keeps the address the agent typed and still gets, and holds, the building\'s type', () => {
  const p = PAGES[0];
  const inHouse = (f: BootedForm) => { (f.d.querySelector('input[name="rentalListingType"][value="InHouse"]') as HTMLInputElement).checked = true; };
  it('asks before replacing the typed address, and keeps it when the agent says keep', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      inHouse(f);
      let asked = 0;
      (f.w as any).confirm = () => { asked += 1; return false; };
      typeAddress(f, p, '200 East 66th Street');
      await leaveAddress(f, p);
      expect(asked).toBe(1);
      expect(val(f, 'rentalStreetAddress')).toBe('200 East 66th Street');
      expect(chosenType(f, p)).toBe('Coop');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      expect(val(f, 'bldgYearBuilt')).toBe('1961');                                                  // the building's facts still come
      await leaveAddress(f, p);                                                                      // the same building found again: the typed address is still the agent's
      typeAddress(f, p, '200 East 66th Street');
      await leaveAddress(f, p);
      expect(asked).toBe(1);
      expect(val(f, 'rentalStreetAddress')).toBe('200 East 66th Street');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
    } finally { f.close(); }
  });

  it('uses the building\'s own address when the agent says so, and asks nothing when the typed address is the building\'s', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      inHouse(f);
      let asked = 0;
      (f.w as any).confirm = () => { asked += 1; return true; };
      await resolveAddress(f, p, '200 East 66th Street');
      expect(asked).toBe(1);
      expect(val(f, 'rentalStreetAddress')).toBe('200 E 66th St');
    } finally { f.close(); }
    const same = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      inHouse(same);
      let askedAgain = 0;
      (same.w as any).confirm = () => { askedAgain += 1; return false; };
      await resolveAddress(same, p, '200 E 66th St');                                                // the building's own address, typed
      expect(askedAgain).toBe(0);
      expect(chosenType(same, p)).toBe('Coop');
    } finally { same.close(); }
  });

  it('a listing that is not In-House is never asked: the building\'s address replaces the typed one', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      let asked = 0;
      (f.w as any).confirm = () => { asked += 1; return false; };
      await resolveAddress(f, p, '200 East 66th Street');
      expect(asked).toBe(0);
      expect(val(f, 'rentalStreetAddress')).toBe('200 E 66th St');
    } finally { f.close(); }
  });

  it('choosing In-House after a match releases the lock and hides the match banner, leaving the type as it was', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      expect(hidden(f, 'rentalIdxMatchBanner')).toBe(false);
      f.w.handleRentalListingTypeChange('InHouse');
      expect(hidden(f, 'rentalIdxMatchBanner')).toBe(true);
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(notice(f, p)!.classList.contains('hidden')).toBe(true);
      expect((f.w as any).MallanBuildingLookup.isLocked('rental')).toBe(false);
      expect(chosenType(f, p)).toBe('Coop');
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a page that could not load building-lookup.js still boots', (p) => {
  it('parses the typed address, takes an In-House listing type, and answers the search boxes without a page error', async () => {
    const f = await bootAddForm(p.form, { modules: PAGE_MODULES.filter((m) => m !== 'building-lookup'), buildings: [COOP], settle: 600 });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const box = f.d.getElementById(`${p.prefix}StreetAddress`) as HTMLInputElement;
      box.value = '200 East 66th Street';
      box.dispatchEvent(new f.w.Event('input', { bubbles: true }));
      box.dispatchEvent(new f.w.Event('blur'));
      await sleep(300);
      expect([val(f, `${p.prefix}StreetNumber`), val(f, `${p.prefix}StreetName`), val(f, `${p.prefix}StreetSuffix`)]).toEqual(['200', '66th', 'Street']);
      expect(f.searched).toEqual([]);
      if (p.prefix === 'sale') {
        f.w.handleSaleListingTypeChange('InHouseInternal');
        const gate = f.d.getElementById('saleDist_IDX') as HTMLInputElement;
        expect([gate.checked, gate.disabled]).toEqual([false, true]);                                   // the handler ran to its end
      } else {
        f.w.handleRentalListingTypeChange('InHouse');
        expect(f.d.getElementById('rentalInHouseWarning')!.style.display).toBe('');
      }
      f.w.searchBuildingForListing('200 east', p.prefix);
      await p.modalSearchFn(f, 'central park');
      await sleep(500);
      expect([...new Set(f.errors)]).toEqual([]);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a search that is typed over', (p) => {
  it('a shorter query cancels the one still waiting', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      f.w.searchBuildingForListing('200 e', p.prefix);
      await sleep(50);
      f.w.searchBuildingForListing('20', p.prefix);
      await sleep(700);
      expect(f.searched).toEqual([]);
      expect(hidden(f, `${p.prefix}BuildingSearchResults`)).toBe(true);
    } finally { f.close(); }
  });

  it('a late answer for an earlier query never replaces the list of a newer one', async () => {
    const f = await bootAddForm(p.form, {
      buildings: (q) => (q === '200 e' ? [COOP] : [CONDO]), buildingsDelay: (q) => (q === '200 e' ? 700 : 0), settle: 600,
    });
    try {
      f.w.searchBuildingForListing('200 e', p.prefix);                                                // answered slowly
      await sleep(450);                                                                                // the request is on its way
      f.w.searchBuildingForListing('15 central', p.prefix);                                           // answered at once
      await sleep(1200);
      expect(rowsOf(f, `${p.prefix}BuildingSearchResults`).map(addressOf)).toEqual(['15 Central Park W']);
      expect(f.searched).toEqual(['200 e', '15 central']);
    } finally { f.close(); }
  });

  it('the Building tab sends one query for a word typed letter by letter, and a late answer never replaces a newer list', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (q === 'central' ? [CONDO] : [COOP]), buildingsDelay: (q) => (q === 'central' ? 0 : 700), settle: 600 });
    try {
      for (const q of ['cen', 'cent', 'centr', 'central']) {
        set(f, p.modalSearchInput, q);
        void p.modalSearchFn(f, q);
        await sleep(30);
      }
      await sleep(900);
      expect(f.searched).toEqual(['central']);
      expect(rowsOf(f, p.modalResults).map(addressOf)).toEqual(['15 Central Park W']);
      set(f, p.modalSearchInput, 'plaza');                                                            // slow
      void p.modalSearchFn(f, 'plaza');
      await sleep(450);
      set(f, p.modalSearchInput, 'central p');                                                        // answered at once (the cache has it by now)
      void p.modalSearchFn(f, 'central p');
      await sleep(1200);
      expect(rowsOf(f, p.modalResults).map(addressOf)).toEqual(['15 Central Park W']);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: an address typed with its unit, or its city and zip', (p) => {
  it.each([
    ['200 East 66th Street Apt 12B', '12B'],
    ['200 East 66th Street #12B', '12B'],
    ['200 East 66th Street, Apt 12B', '12B'],
    ['200 East 66th Street, New York, NY 10065', ''],
  ])('%s: the street address is looked up and applied, and the unit goes to the Unit Number', async (typedText, unit) => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, typedText);
      expect(f.searched).toEqual(['200 East 66th Street']);
      expect(chosenType(f, p)).toBe('Coop');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');
      expect(val(f, `${p.prefix}UnitNumber`)).toBe(unit);
    } finally { f.close(); }
  });

  it('the unit the agent entered wins over the one typed in the street box', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      set(f, `${p.prefix}UnitNumber`, '5C');
      await resolveAddress(f, p, '200 East 66th Street Apt 12B');
      expect(val(f, `${p.prefix}UnitNumber`)).toBe('5C');
    } finally { f.close(); }
  });

  it('a street called Unit is a street', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, address: '1 Unit St' }], settle: 600 });
    try {
      await resolveAddress(f, p, '1 Unit Street');
      expect(f.searched).toEqual(['1 Unit Street']);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('1 Unit St');
      expect(val(f, `${p.prefix}UnitNumber`)).toBe('');
    } finally { f.close(); }
  });
});

describe('Rental: the building\'s pets are not this unit\'s pet policy', () => {
  it('a building lookup fills the building\'s pet policy and leaves the unit\'s Pets Allowed to the agent', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { buildings: [{ ...COOP, pets_allowed: 'CatsOk,DogsOk', building_pets: ['BuildingYes'] }], settle: 600 });
    try {
      await resolveAddress(f, PAGES[0], '200 East 66th Street');
      expect([...f.d.querySelectorAll('input[name="rentalPetsAllowed"]:checked')]).toHaveLength(0);
      expect([...f.d.querySelectorAll('input[name="rentalBuildingPetsAllowed"]:checked')].length).toBeGreaterThan(0);
    } finally { f.close(); }
  });
});

describe('Rental: the mixed-use unit-count rule reads the Building tab\'s unit count', () => {
  it('a mixed-use building of five units or fewer shows the UCBA notice; more units do not', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 600 });
    try {
      (f.d.querySelector('input[name="rentalPropertyType"][value="MixedUse"]') as HTMLInputElement).checked = true;
      set(f, 'bldgTotalUnits', '3');
      f.w.applyRentalFieldRules();
      expect(f.d.getElementById('rentalMixedUseNotice')!.style.display).toBe('');
      set(f, 'bldgTotalUnits', '8');
      f.w.applyRentalFieldRules();
      expect(f.d.getElementById('rentalMixedUseNotice')!.style.display).toBe('none');
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a lookup that is still waiting, and one that is forgotten', (p) => {
  it('leaving the address again while the index is still answering asks nothing more', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], buildingsDelay: 400, settle: 600 });
    try {
      typeAddress(f, p, '200 East 66th Street');
      f.d.getElementById(`${p.prefix}StreetAddress`)!.dispatchEvent(new f.w.Event('blur'));
      await sleep(100);
      f.d.getElementById(`${p.prefix}StreetAddress`)!.dispatchEvent(new f.w.Event('blur'));
      await sleep(800);
      expect(f.searched).toEqual(['200 East 66th Street']);
      expect(chosenType(f, p)).toBe('Coop');
    } finally { f.close(); }
  });

  it('choosing In-House forgets the match, and an Override with it: the building applies afresh once the listing is not In-House', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      (f.w as any).confirm = () => true;
      (notice(f, p)!.querySelector('[data-building-override]') as HTMLButtonElement).click();
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      if (p.prefix === 'sale') f.w.handleSaleListingTypeChange('InHouseInternal'); else f.w.handleRentalListingTypeChange('InHouse');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      typeAddress(f, p, '200 East 66th Street');                                                      // the listing type radio still says "not In-House": a lookup runs
      await leaveAddress(f, p);
      expect(chosenType(f, p)).toBe('Coop');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);                                       // locked again: the Override was forgotten with the match
    } finally { f.close(); }
  });
});

// ══ What the second independent review of the address -> building work (a4a87f64) found, and what this fixes ═════════════════════════════
const PLAZA_FULL = { ...COOP, doorman: true, concierge: true, pool: true, parking: true, open_parking_spaces: 12, association_fee: 3000, association_fee_frequency: 'Monthly', building_pets: ['BuildingYes'] };
const TURTLE = { address: '333 E 46th St', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', common_interest: 'Condominium', association_fee: 1200, association_fee_frequency: 'Quarterly' };
const twoBuildings = (q: string) => (/^200/.test(q) ? [PLAZA_FULL] : /^333/.test(q) ? [TURTLE] : []);
const attendance = (f: BootedForm, p: Page) => [...f.d.querySelectorAll(`input[name="${p.prefix}AttendanceType"]:checked`)].map((c) => (c as HTMLInputElement).value);
const tick = (f: BootedForm, id: string, on = true) => { (f.d.getElementById(id) as HTMLInputElement).checked = on; };
const change = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};
// the elements the field rules show for the property type the form holds now, by id
const visibleRuleIds = (f: BootedForm, p: Page): string[] => {
  const ruleIds: string[] = f.w.eval(p.prefix === 'sale' ? 'Object.keys(SALES_FIELD_VISIBILITY_RULES)' : 'Object.keys(RENTAL_FIELD_VISIBILITY_RULES)');
  return ruleIds.filter((id) => { const e = f.d.getElementById(id); return !!e && !e.classList.contains('hidden') && e.style.display !== 'none'; });
};

describe.each(PAGES)('$form: another building replaces what the lookup wrote for the last one', (p) => {
  it('the unit, the facts, the amenities, the attendance and the parking of the first building are gone, and the second building\'s are there', async () => {
    const f = await bootAddForm(p.form, { buildings: twoBuildings, settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street Apt 12B');
      expect(val(f, `${p.prefix}UnitNumber`)).toBe('12B');
      expect([val(f, `${p.bld}Name`), val(f, `${p.bld}YearBuilt`), val(f, `${p.bld}ParkingSpaces`)]).toEqual(['The Plaza Tower', '1961', '12']);
      expect(['Elevator', 'Gym', 'Pool', 'Parking'].map((b) => checked(f, `${p.bld}${b}`))).toEqual([true, true, true, true]);
      expect(attendance(f, p)).toEqual(['DoormanYes', 'ConciergeYes']);
      if (p.prefix === 'sale') expect([val(f, 'saleMaintCC'), val(f, 'saleMaintCCFreq')]).toEqual(['3000', 'Monthly']);
      await resolveAddress(f, p, '333 East 46th Street Apt 4');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('333 E 46th St');
      expect(val(f, `${p.prefix}UnitNumber`)).toBe('4');                                             // the new address's unit, not the last one's
      expect(val(f, `${p.prefix}ZipCode`)).toBe('10017');
      expect(val(f, `${p.prefix}NeighborhoodFromAddress`)).toBe('Turtle Bay');
      expect([val(f, `${p.bld}Name`), val(f, `${p.bld}YearBuilt`), val(f, `${p.bld}ParkingSpaces`), val(f, `${p.bld}TotalFloors`)]).toEqual(['', '', '', '']);
      expect(['Elevator', 'Gym', 'Pool', 'Parking'].map((b) => checked(f, `${p.bld}${b}`))).toEqual([false, false, false, false]);
      expect(attendance(f, p)).toEqual([]);
      expect(chosenType(f, p)).toBe('Condo');
      expect(f.d.getElementById(`${p.prefix}IdxDetectedBuilding`)!.textContent).toBe('');
      if (p.prefix === 'sale') expect([val(f, 'saleMaintCC'), val(f, 'saleMaintCCFreq')]).toEqual(['1200', 'Quarterly']);
    } finally { f.close(); }
  });

  it('an address that names no building takes back the last building: its facts, its banner, the hold on the type and the type itself', async () => {
    const f = await bootAddForm(p.form, { buildings: twoBuildings, settle: 600 });
    try {
      const startType = chosenType(f, p);
      await resolveAddress(f, p, '200 East 66th Street Apt 12B');
      expect(chosenType(f, p)).toBe('Coop');
      expect(hidden(f, `${p.prefix}IdxMatchBanner`)).toBe(false);
      await resolveAddress(f, p, '1 Nowhere Lane');
      expect(hidden(f, `${p.prefix}IdxMatchBanner`)).toBe(true);
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
      expect(notice(f, p)!.classList.contains('hidden')).toBe(true);
      expect(chosenType(f, p)).toBe(startType);
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`), val(f, `${p.prefix}UnitNumber`), val(f, `${p.bld}Name`), val(f, `${p.bld}YearBuilt`)]).toEqual(['', '', '', '', '']);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('1 Nowhere Lane');                              // what the agent typed is theirs
      expect(f.d.getElementById(`${p.prefix}BuildingSearchResults`)!.textContent).toMatch(/No building match found/);
    } finally { f.close(); }
  });

  it('several buildings fit the new address and none is it: the last building is taken back, and the list is offered', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (/^200/.test(q) ? [PLAZA_FULL] : [{ ...TURTLE, address: '10 Oak Ave' }, { ...TURTLE, address: '12 Oak Ave' }]), settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(val(f, `${p.bld}Name`)).toBe('The Plaza Tower');
      await resolveAddress(f, p, 'Oak Avenue');
      expect(val(f, `${p.bld}Name`)).toBe('');
      expect(hidden(f, `${p.prefix}IdxMatchBanner`)).toBe(true);
      expect(rowsOf(f, `${p.prefix}BuildingSearchResults`)).toHaveLength(2);
    } finally { f.close(); }
  });

  it('a choice the agent made in another group of radio buttons since stays theirs when the building is taken back', async () => {
    const f = await bootAddForm(p.form, { buildings: twoBuildings, settle: 600 });
    try {
      const status = `${p.prefix}BuildingStatus`;
      const startStatus = (f.d.querySelector(`input[name="${status}"]:checked`) as HTMLInputElement).value;
      await resolveAddress(f, p, '200 East 66th Street');
      (f.d.querySelector(`input[name="${status}"][value="NewDevelopment"]`) as HTMLInputElement).checked = true;
      await resolveAddress(f, p, '1 Nowhere Lane');
      expect((f.d.querySelector(`input[name="${status}"]:checked`) as HTMLInputElement).value).toBe('NewDevelopment');       // not put back to what it was
      expect(startStatus).not.toBe('NewDevelopment');
      expect(chosenType(f, p)).not.toBe('Coop');                                                       // the property type, which the lookup chose, is taken back
    } finally { f.close(); }
  });

  it('what the agent changed since stays: a name they typed, a box they unticked', async () => {
    const f = await bootAddForm(p.form, { buildings: twoBuildings, settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      set(f, `${p.bld}Name`, 'My Own Name');
      tick(f, `${p.bld}Gym`, false);
      set(f, `${p.bld}YearBuilt`, '1999');
      await resolveAddress(f, p, '333 East 46th Street');
      expect(val(f, `${p.bld}Name`)).toBe('My Own Name');
      expect(checked(f, `${p.bld}Gym`)).toBe(false);
      expect(val(f, `${p.bld}YearBuilt`)).toBe('1999');
      expect(checked(f, `${p.bld}Elevator`)).toBe(false);                                           // the lookup's own tick went with the building
    } finally { f.close(); }
  });

  it('the building picked in the Building tab replaces the last one\'s facts, and leaves the address the main box applied as it is', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (/plaza|^200/i.test(q) ? [PLAZA_FULL] : [TURTLE]), settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(checked(f, `${p.bld}Pool`)).toBe(true);
      await p.modalSearchFn(f, 'turtle');
      await sleep(500);
      rowsOf(f, p.modalResults)[0].click();
      expect(checked(f, `${p.bld}Pool`)).toBe(false);                                               // the Plaza's tick is gone
      expect(val(f, `${p.bld}Name`)).toBe('');
      expect(val(f, `${p.prefix}ZipCode`)).toBe('10065');                                           // the address the main box applied is not touched by the Building tab
      expect(val(f, `${p.prefix}Borough`)).toBe('Manhattan');
    } finally { f.close(); }
  });

  it('the Building tab\'s pick takes back only the facts: the address the main box applied is still taken back with its building', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (/plaza|^200/i.test(q) ? [PLAZA_FULL] : /^1 Nowhere/.test(q) ? [] : [TURTLE]), settle: 600 });
    try {
      const startType = chosenType(f, p);
      await resolveAddress(f, p, '200 East 66th Street');
      await p.modalSearchFn(f, 'turtle');
      await sleep(500);
      rowsOf(f, p.modalResults)[0].click();                                                         // facts only
      expect(val(f, `${p.prefix}ZipCode`)).toBe('10065');
      await resolveAddress(f, p, '1 Nowhere Lane');                                                 // the address names no building: what the main box applied goes
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`), val(f, `${p.prefix}NeighborhoodFromAddress`)]).toEqual(['', '', '']);
      expect(chosenType(f, p)).toBe(startType);
    } finally { f.close(); }
  });

  it('a co-op\'s fields go when the lookup\'s type is taken back: by an address that names no building, and by a building that sets no type', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (/^200/.test(q) ? [COOP] : /^40/.test(q) ? [TOWNHOUSE] : []), settle: 600 });
    try {
      const start = visibleRuleIds(f, p);
      await resolveAddress(f, p, '200 East 66th Street');
      const coopOnly = visibleRuleIds(f, p).filter((id) => !start.includes(id));
      expect(coopOnly.length).toBeGreaterThan(0);                                                   // a co-op shows fields the form did not
      await resolveAddress(f, p, '40 West 12th Street');                                            // another building, which sets no type: the co-op's type goes
      expect(chosenType(f, p)).not.toBe('Coop');
      expect(visibleRuleIds(f, p).filter((id) => coopOnly.includes(id))).toEqual([]);
      await resolveAddress(f, p, '200 East 66th Street');
      expect(visibleRuleIds(f, p).filter((id) => coopOnly.includes(id)).length).toBe(coopOnly.length);
      await resolveAddress(f, p, '1 Nowhere Lane');                                                 // an address that names no building
      expect(chosenType(f, p)).not.toBe('Coop');
      expect(visibleRuleIds(f, p).filter((id) => coopOnly.includes(id))).toEqual([]);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: an address typed before a saved listing loaded is not a lookup of the saved address', (p) => {
  it('the form rewrote the box: leaving it does not apply a building over the saved listing', async () => {
    const f = await bootAddForm(p.form, {
      search: '?id=1', buildings: [COOP], getDelay: 900, settle: 300,
      listing: {
        id: '1', listing_id: 'L-1', status: 'Draft', address: { StreetNumber: '200', StreetDirPrefix: 'E', StreetName: '66th', StreetSuffix: 'St', UnparsedAddress: '200 E 66th St' },
        features: {}, media: [], agent_info: {}, raw_data: { [`${p.prefix}StreetAddress`]: '200 E 66th St', [`${p.prefix}PropertyType`]: 'Condop' },
      },
    });
    try {
      typeAddress(f, p, '1 Typed Early Road');                                                       // before the listing arrives
      await sleep(1800);                                                                             // it arrives, and the form writes the saved address into the box
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');
      const before = chosenType(f, p);
      await leaveAddress(f, p);
      expect(f.searched).toEqual([]);
      expect(chosenType(f, p)).toBe(before);
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);
    } finally { f.close(); }
  });

  it('an address typed after the rewrite is a lookup again', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      typeAddress(f, p, '1 Typed Early Road');
      (f.d.getElementById(`${p.prefix}StreetAddress`) as HTMLInputElement).value = '200 East 66th Street';       // the form rewrites the box (no input event)
      await leaveAddress(f, p);
      expect(f.searched).toEqual([]);
      await resolveAddress(f, p, '200 East 66th Street');                                           // the agent types it
      expect(f.searched).toEqual(['200 East 66th Street']);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a lookup ticks boxes and never unticks them', (p) => {
  it('what the agent ticked stays ticked when the building reports none of it', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...TURTLE, address: '200 E 66th St' }], settle: 600 });
    try {
      const boxes = ['Pool', 'Elevator', 'Gym', 'RoofDeck', 'Parking', 'Storage', 'BikeRoom'];
      for (const b of boxes) tick(f, `${p.bld}${b}`);
      await resolveAddress(f, p, '200 East 66th Street');
      expect(boxes.map((b) => checked(f, `${p.bld}${b}`))).toEqual(boxes.map(() => true));
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: the mixed-use unit-count rule runs whenever the count changes', (p) => {
  const gate = (f: BootedForm) => f.d.getElementById(`${p.prefix}Dist_IDX`) as HTMLInputElement;
  const mixedUse = (f: BootedForm) => { (f.d.querySelector(`input[name="${p.prefix}PropertyType"][value="MixedUse"]`) as HTMLInputElement).checked = true; };
  const unitsBox = (p.prefix === 'sale' ? 'saleBldgTotalUnits' : 'bldgTotalUnits');
  const townhouseUnits = (p.prefix === 'sale' ? 'saleTHUnitsTotal' : 'rentalTHUnitsTotal');

  it('typing the Building tab\'s unit count (a change event) enables and disables the IDX gate', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      mixedUse(f);
      change(f, unitsBox, '12');
      expect([gate(f).checked, gate(f).disabled]).toEqual([false, true]);                             // more than five units: not RLS-eligible
      change(f, unitsBox, '3');
      expect(gate(f).disabled).toBe(false);
      expect(f.d.getElementById(`${p.prefix}MixedUseNotice`)!.style.display).toBe('');
    } finally { f.close(); }
  });

  it('the count a lookup writes is read too (a mixed-use listing, a building of twelve units)', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...TOWNHOUSE, units_total: 12 }], settle: 600 });
    try {
      mixedUse(f);
      await resolveAddress(f, p, '40 West 12th Street');
      expect(val(f, unitsBox)).toBe('12');
      expect(chosenType(f, p)).toBe('MixedUse');                                                     // the building names no ownership type: the agent's choice stands
      expect([gate(f).checked, gate(f).disabled]).toEqual([false, true]);
    } finally { f.close(); }
  });

  it('the rule reads the Building tab\'s count, the one the save sends, before the townhouse section\'s', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      mixedUse(f);
      set(f, townhouseUnits, '2');
      change(f, unitsBox, '12');
      expect([gate(f).checked, gate(f).disabled]).toEqual([false, true]);
      expect(f.d.getElementById(`${p.prefix}MixedUseNotice`)!.style.display).toBe('none');
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a unit written after a designator with its own #', (p) => {
  it.each([
    ['200 East 66th Street Apt #12B', '12B'],
    ['200 East 66th Street Apt. #4', '4'],
    ['200 East 66th Street Unit #4', '4'],
    ['200 East 66th Street, Apt #12B', '12B'],
  ])('%j finds the building and puts %j in the Unit Number', async (typed, unit) => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, typed);
      expect(f.searched).toEqual(['200 East 66th Street']);
      expect(val(f, `${p.prefix}UnitNumber`)).toBe(unit);
      expect(chosenType(f, p)).toBe('Coop');
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: the cached answer is complete only for the address it was asked for', (p) => {
  it('a search by name that returned one of two buildings at an address does not stand in for the address', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (/alpha/i.test(q) ? [ALPHA] : /^100 water/i.test(q) ? [ALPHA, BETA] : []), settle: 600 });
    try {
      const startType = chosenType(f, p);
      await p.modalSearchFn(f, 'Alpha');
      await sleep(500);
      expect(f.searched).toEqual(['Alpha']);
      await resolveAddress(f, p, '100 Water Street');
      expect(f.searched).toEqual(['Alpha', '100 Water Street']);                                      // the index was asked: the cache held one of two
      expect(rowsOf(f, `${p.prefix}BuildingSearchResults`)).toHaveLength(2);
      expect(chosenType(f, p)).toBe(startType);                                                      // nothing was applied
      expect(val(f, `${p.prefix}ZipCode`)).toBe('');
    } finally { f.close(); }
  });

  it('a later search by name does not leave the earlier address\'s claim on the cache standing', async () => {
    const f = await bootAddForm(p.form, { buildings: (q) => (/gamma/i.test(q) ? [ALPHA] : /^100 water/i.test(q) ? [ALPHA, BETA] : []), settle: 600 });
    try {
      await resolveAddress(f, p, '100 Water Street');                                                // two buildings: a list, nothing applied; the cache is for this address
      expect(rowsOf(f, `${p.prefix}BuildingSearchResults`)).toHaveLength(2);
      await p.modalSearchFn(f, 'Gamma');                                                             // the Building tab's search finds one of them by another name
      await sleep(500);
      expect(f.searched).toEqual(['100 Water Street', 'Gamma']);
      await resolveAddress(f, p, '100 Water Street');                                                // the cache now holds one of the two: it is not the answer for the address
      expect(f.searched).toEqual(['100 Water Street', 'Gamma', '100 Water Street']);
      expect(rowsOf(f, `${p.prefix}BuildingSearchResults`)).toHaveLength(2);
    } finally { f.close(); }
  });

  it('the same street, typed again, is served from the cache', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      await resolveAddress(f, p, '200 E 66th St');
      expect(f.searched).toEqual(['200 East 66th Street']);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: the building applied again by its address (the same building found again)', (p) => {
  it('a typo fixed in the box holds the property type again', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      typeAddress(f, p, '200 East 66th Streetx');
      expect(radios(f, p).some((r) => r.disabled)).toBe(false);                                       // the first keystroke released it
      typeAddress(f, p, '200 East 66th Street');
      await leaveAddress(f, p);
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
      expect(notice(f, p)!.classList.contains('hidden')).toBe(false);
    } finally { f.close(); }
  });

  it('a unit added after the address goes to the Unit Number, the box says the building\'s own address, and the hold stays', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      typeAddress(f, p, '200 E 66th St Apt 12B');
      await leaveAddress(f, p);
      expect(val(f, `${p.prefix}UnitNumber`)).toBe('12B');
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');
      expect([val(f, `${p.prefix}StreetNumber`), val(f, `${p.prefix}StreetName`), val(f, `${p.prefix}StreetSuffix`)]).toEqual(['200', '66th', 'St']);
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
    } finally { f.close(); }
  });

  it('a building picked in the Building tab first gives the main form its area when its address is typed', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await p.modalSearchFn(f, 'Plaza');
      await sleep(500);
      rowsOf(f, p.modalResults)[0].click();
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`)]).toEqual(['', '']);
      await resolveAddress(f, p, '200 East 66th Street');
      expect([val(f, `${p.prefix}Borough`), val(f, `${p.prefix}ZipCode`), val(f, `${p.prefix}CountyOrParish`), val(f, `${p.prefix}PostalCity`)]).toEqual(['Manhattan', '10065', 'New York', 'New York']);
      expect(val(f, `${p.prefix}StreetAddress`)).toBe('200 E 66th St');
      expect(radios(f, p).every((r) => r.disabled)).toBe(true);
    } finally { f.close(); }
  });

  it('what the agent put in the area since is not overwritten', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      set(f, `${p.prefix}NeighborhoodFromAddress`, 'My Neighborhood');
      set(f, `${p.prefix}ZipCode`, '10001');
      typeAddress(f, p, '200 East 66th Street');
      await leaveAddress(f, p);
      expect([val(f, `${p.prefix}NeighborhoodFromAddress`), val(f, `${p.prefix}ZipCode`)]).toEqual(['My Neighborhood', '10001']);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: the index saying it cannot look is not "no match"', (p) => {
  it('an answer with no buildings and the unavailable hint says so, and leaving the box again asks again', async () => {
    const f = await bootAddForm(p.form, { buildings: [], buildingsHint: 'Building lookup temporarily unavailable.', settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(f.d.getElementById(`${p.prefix}BuildingSearchResults`)!.textContent).toMatch(/Building lookup unavailable/);
      await leaveAddress(f, p);
      expect(f.searched).toEqual(['200 East 66th Street', '200 East 66th Street']);
    } finally { f.close(); }
  });

  it('an answer with no buildings and another hint is a real "no match", asked once', async () => {
    const f = await bootAddForm(p.form, { buildings: [], buildingsHint: 'No Cotality building match found.', settle: 600 });
    try {
      await resolveAddress(f, p, '1 Nowhere Lane');
      expect(f.d.getElementById(`${p.prefix}BuildingSearchResults`)!.textContent).toMatch(/No building match found/);
      await leaveAddress(f, p);
      expect(f.searched).toEqual(['1 Nowhere Lane']);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$form: a value a select has no option for does not blank the agent\'s choice', (p) => {
  const mainType = `${p.prefix}StructureType`;
  // the main control has thirteen structure types, the Building tab's three more (Apartment, Commercial, Other): a value the control has is written, any other is not
  it.each([
    ['MidRise', 'Townhouse'], ['LowRise', 'Townhouse'], ['Apartment', 'Apartment'], ['Other', 'Other'], ['Apartment, MidRise', 'Apartment'], ['MidRise, Apartment', 'Apartment'],
  ])('structure type %s: the main control keeps Townhouse, the Building tab\'s becomes %s', async (answer, inTab) => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, structure_type: answer }], settle: 600 });
    try {
      set(f, mainType, 'Townhouse');
      set(f, `${p.bld}Type`, 'Townhouse');
      await resolveAddress(f, p, '200 East 66th Street');
      expect(val(f, mainType)).toBe('Townhouse');
      expect(val(f, `${p.bld}Type`)).toBe(inTab);
    } finally { f.close(); }
  });

  it('a list takes the first member the select has, whatever the case', async () => {
    const f = await bootAddForm(p.form, { buildings: [{ ...COOP, structure_type: 'MidRise,highrise' }], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(val(f, mainType)).toBe('HighRise');
      expect(val(f, `${p.bld}Type`)).toBe('HighRise');
    } finally { f.close(); }
  });

  it('a state the Building tab\'s select has, spelt in lower case, is chosen; one it has not leaves the state alone', async () => {
    const lower = await bootAddForm(p.form, { buildings: [{ ...COOP, state: 'nj' }], settle: 600 });
    const other = await bootAddForm(p.form, { buildings: [{ ...COOP, state: 'New York' }], settle: 600 });
    try {
      set(other, `${p.bld}State`, 'CT');
      await resolveAddress(lower, p, '200 East 66th Street');
      await resolveAddress(other, p, '200 East 66th Street');
      expect(val(lower, `${p.bld}State`)).toBe('NJ');
      expect(val(other, `${p.bld}State`)).toBe('CT');
    } finally { lower.close(); other.close(); }
  });

  if (p.prefix === 'sale') {
    it('a fee frequency the select does not have leaves the frequency alone', async () => {
      const f = await bootAddForm(p.form, { buildings: [{ ...COOP, association_fee: 900, association_fee_frequency: 'SeeRemarks' }], settle: 600 });
      try {
        await resolveAddress(f, p, '200 East 66th Street');
        expect([val(f, 'saleMaintCC'), val(f, 'saleMaintCCFreq')]).toEqual(['900', 'Monthly']);
      } finally { f.close(); }
    });
  }
});

describe.each(PAGES)('$form: the structure type the agent chooses is the one that is saved', (p) => {
  const mainType = `${p.prefix}StructureType`;
  it('a change to the main control reaches the Building tab, and the save sends it', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      expect(f.w[p.collector]().StructureType).toBe('HighRise');
      change(f, mainType, 'Townhouse');
      expect(val(f, `${p.bld}Type`)).toBe('Townhouse');
      expect(f.w[p.collector]().StructureType).toBe('Townhouse');
    } finally { f.close(); }
  });

  it('a change to the Building tab\'s control reaches the main control', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      change(f, `${p.bld}Type`, 'Townhouse');
      expect(val(f, mainType)).toBe('Townhouse');
      expect(f.w[p.collector]().StructureType).toBe('Townhouse');
    } finally { f.close(); }
  });

  it('a main value the Building tab has no option for clears the Building tab, so the save sends the main one', async () => {
    const f = await bootAddForm(p.form, { buildings: [COOP], settle: 600 });
    try {
      await resolveAddress(f, p, '200 East 66th Street');
      const tab = f.d.getElementById(`${p.bld}Type`) as HTMLSelectElement;
      const only = f.d.createElement('option');                                                      // a main-only option
      only.value = 'MainOnly';
      (f.d.getElementById(mainType) as HTMLSelectElement).appendChild(only);
      change(f, mainType, 'MainOnly');
      expect(tab.value).toBe('');
      expect(f.w[p.collector]().StructureType).toBe('MainOnly');
    } finally { f.close(); }
  });
});
