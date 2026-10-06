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
import { bootAddForm, sleep, type AddForm, type BootedForm } from './add-form-harness';

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
const TOWNHOUSE = { ...COOP, address: '40 W 12th St', name: '', common_interest: null, property_sub_type: 'MultiFamily', neighborhood: 'Greenwich Village', zip: '10011' };

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

  it('does not lock a type read from the property sub-type (that is a suggestion, not the building\'s Cotality classification)', async () => {
    const f = await bootAddForm(p.form, { buildings: [TOWNHOUSE], settle: 600 });
    try {
      await resolveAddress(f, p, '40 West 12th Street');
      if (p.prefix === 'rental') {
        expect(chosenType(f, p)).toBe('MultiFamily');
      }
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
