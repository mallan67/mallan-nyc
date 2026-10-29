/// <reference types="jest" />
/**
 * A3 (board #415) — `RENTAL-FORM-REDESIGN.html` existing-rental edit hydration.
 *
 * `_populateRentalFormFromApi()` once wrote API values into ~21 nonexistent controls (price/baths/size/rooms/dates/IDX+internet display flags/building/co-list/
 * feature groups). For controls the SAVE path reads (collectRentalFormData), that blanked the real control on edit and a subsequent save could overwrite good data,
 * including the compliance display gates. The fix pointed each write at the real control; this file used to pin that by scanning the source for `setVal(...)`
 * lines. The edit load now goes through one module (public/crm/js/forms/listing-hydration.js, the one the Tools viewers use), so the guard is behavioural: the
 * module's Rental tables may only target controls the form has, and a stored listing lands in the controls the save reads.
 * crm-rental-form-roundtrip.test.ts proves create -> save -> reload -> edit -> save -> reload across every control.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, val } from './add-form-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const page = readFileSync(resolve(__dirname, '../../public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');
const doc: Document = new JSDOM(page).window.document;
const win: any = {};
new Function('window', readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8'))(win);
const TABLES = win.MallanListingHydration.tables.rental;
const has = (key: string) => !!doc.getElementById(key) || doc.getElementsByName(key).length > 0;

describe('A3 static guard — every hydration target maps to a real control', () => {
  it.each([...new Set<string>(TABLES.FIELD_MAP.map((r: any) => r.form))])("field row target '%s' exists on the form", (id) => {
    expect(has(id)).toBe(true);
  });
  it.each(TABLES.RADIO_MAP.map((r: any) => r.name) as string[])("radio row target '%s' has matching name= radios", (name) => {
    expect(doc.getElementsByName(name).length).toBeGreaterThan(0);
  });
  it.each(TABLES.CHECKBOX_ARRAY_MAP.map((r: any) => r.name) as string[])("checkbox group target '%s' has matching name= checkboxes", (name) => {
    expect(doc.querySelectorAll(`input[type="checkbox"][name="${name}"]`).length).toBeGreaterThan(0);
  });
  it('no phantom group / building / co-list target (those are collected through checkbox groups, the building association and the co-list section)', () => {
    const targets = new Set<string>([...TABLES.FIELD_MAP.map((r: any) => r.form), ...TABLES.RADIO_MAP.map((r: any) => r.name), ...TABLES.CHECKBOX_ARRAY_MAP.map((r: any) => r.name)]);
    for (const dead of ['rentalAppliances', 'rentalInteriorFeatures', 'rentalLaundry', 'rentalPets', 'rentalYearBuilt', 'rentalBuildingName', 'rentalBuildingUnits',
      'rentalBuildingStories', 'rentalCoListingAgent', 'rentalCoListingCompany', 'rentalListPrice', 'rentalBathsFull', 'rentalBathsHalf', 'rentalLivingArea',
      'rentalRooms', 'rentalIdxDisplayYN', 'rentalInternetDisplayYN', 'rentalInternetAddressYN', 'rentalExpirationDate']) {
      expect(targets.has(dead)).toBe(false);
    }
  });
});

describe('A3 regression — a stored listing hydrates into the REAL save controls', () => {
  // typed columns and provider keys only (what a synced or promoted listing carries), none of the form's own control keys
  const listing = {
    id: '9', listing_id: 'RL-9', status: 'Active',
    list_price: '3200', bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 1, living_area: '850',
    idx_display_yn: false, internet_entire_listing_display_yn: false, internet_address_display_yn: true,
    expiration_date: '2027-01-31T00:00:00.000Z', listing_contract_date: '2026-02-01T00:00:00.000Z',
    address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'St', UnitNumber: '5C', PostalCode: '10017' },
    features: {}, agent_info: {}, media: [],
    raw_data: { RoomsTotal: 5, AvailabilityDate: '2026-04-01', OnMarketDate: '2026-03-01' },
  };
  let f: Awaited<ReturnType<typeof bootAddForm>>;
  beforeAll(async () => { f = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=9', listing, settle: 1800 }); });
  afterAll(() => f.close());

  it('boots clean', () => { expect([...new Set(f.errors)]).toEqual([]); });
  it('price → rentalMonthlyRent (not the nonexistent rentalListPrice)', () => { expect(val(f.d, 'rentalMonthlyRent')).toBe('3200'); });
  it('full baths → rentalFullBathrooms; half baths → rentalHalfBathrooms', () => {
    expect(val(f.d, 'rentalFullBathrooms')).toBe('1');
    expect(val(f.d, 'rentalHalfBathrooms')).toBe('1');
  });
  it('size → rentalSqFt; rooms → rentalTotalRooms', () => {
    expect(val(f.d, 'rentalSqFt')).toBe('850');
    expect(val(f.d, 'rentalTotalRooms')).toBe('5');
  });
  it('IDX / internet display flags hydrate into the real compliance controls', () => {
    expect((f.d.getElementById('rentalIDXEntireListingDisplayYN') as HTMLInputElement).checked).toBe(false);
    expect((f.d.getElementById('rentalInternetEntireListingDisplayYN') as HTMLInputElement).checked).toBe(false);
    expect((f.d.getElementById('rentalInternetAddressDisplayYN') as HTMLInputElement).checked).toBe(true);
  });
  it('the expiration date goes to rentalExclusiveExpires and the contract date to rentalExclusiveStart (they were swapped)', () => {
    expect(val(f.d, 'rentalExclusiveExpires')).toBe('2027-01-31');
    expect(val(f.d, 'rentalExclusiveStart')).toBe('2026-02-01');
  });
  it('the street direction survives (333 E 46th St, not 333 46th St) and the street line is composed from the canonical atoms', () => {
    expect(val(f.d, 'rentalStreetDirPrefix')).toBe('E');
    expect(val(f.d, 'rentalStreetAddress')).toBe('333 E 46th St');
    expect(val(f.d, 'rentalUnitNumber')).toBe('5C');
    expect(val(f.d, 'rentalZipCode')).toBe('10017');
  });
  it('does not add the viewer "Other stored fields" card to the form', () => {
    expect(f.d.getElementById('viewerStoredElsewhere')).toBeNull();
  });
  it('the dates the provider keeps go to their controls', () => {
    expect(val(f.d, 'rentalAvailableDate')).toBe('2026-04-01');
    expect(val(f.d, 'rentalDateListed')).toBe('2026-03-01');
  });
});

describe('the area: the neighborhood column, else the provider MLSAreaMajor', () => {
  const open = async (listing: Record<string, unknown>) => {
    const g = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=9', listing: { id: '9', listing_id: 'RL-9', status: 'Draft', address: {}, features: {}, agent_info: {}, media: [], ...listing }, settle: 1500 });
    try { return val(g.d, 'rentalNeighborhood'); } finally { g.close(); }
  };
  it('reads the neighborhood column first and MLSAreaMajor when the column is empty (an area the page does not list is still shown)', async () => {
    expect(await open({ neighborhood: 'Chelsea', raw_data: { MLSAreaMajor: 'Midtown East' } })).toBe('Chelsea');
    expect(await open({ raw_data: { MLSAreaMajor: 'Midtown East' } })).toBe('Midtown East');
    expect(await open({ raw_data: {} })).toBe('');
  });
});

describe('TaxLot is the Cotality field, with the older BuildingTaxLot still readable', () => {
  const open = async (raw: Record<string, unknown>) => {
    const g = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=9', listing: { id: '9', listing_id: 'RL-9', status: 'Draft', address: {}, features: {}, agent_info: {}, media: [], raw_data: raw }, settle: 1500 });
    try { return val(g.d, 'bldgTaxLot'); } finally { g.close(); }
  };
  it('reads TaxLot, then the BuildingTaxLot an older save wrote', async () => {
    expect(await open({ TaxLot: '88' })).toBe('88');
    expect(await open({ BuildingTaxLot: '77' })).toBe('77');
    expect(await open({ TaxLot: '88', BuildingTaxLot: '77' })).toBe('88');
  });
});
