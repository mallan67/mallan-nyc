/// <reference types="jest" />
/**
 * The Tools viewers show a SYNCED listing's multi-choice facts the way Cotality stores them: as comma-separated strings, and (for View and BuildingFeatures) in the features bucket.
 *
 * Found 2026-10-09 by an independent read-only review of the pets / View / building-amenity changes: the restores read raw_data only and accepted an array only. A listing the Cotality sync
 * stores keeps PetsAllowed in raw_data as Cotality's string ("Yes,CatsOk"), and View and BuildingFeatures only in its features bucket (they are not in the raw_data keep list), so none of the
 * three was shown for a synced listing, while the tests of those commits had used arrays in raw_data, a shape a synced row never has, and the messages said a synced listing's pets, View and
 * amenities were shown. listing-hydration.js now reads a list from raw_data, then from features, as an array or as the comma-separated string.
 *
 * The real viewers run on records shaped like the synced ones (typed columns, features, raw_data strings).
 */
import { bootViewer, field, rendered, until, type ViewerFile } from './tools-viewer-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const record = (type: 'sale' | 'rent', features: Record<string, unknown>, raw: Record<string, unknown>) => ({
  id: '77', listing_id: 'L77', mls_id: 'M77', status: 'Active', listing_type: type, property_type: type === 'sale' ? 'Residential' : 'ResidentialLease', property_sub_type: 'Apartment',
  list_price: '1250000', bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, living_area: '1050', borough: 'Manhattan', city: 'New York', postal_code: '10017',
  idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true, address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'Street' },
  features, agent_info: {}, media: [], raw_data: { CommonInterest: 'Condominium', ...raw },
});
const ticked = (d: Document, selector: string) => [...d.querySelectorAll(selector)].filter((b) => (b as HTMLInputElement).checked).map((b) => (b as HTMLInputElement).value).sort();
const boxLabel = (d: Document, id: string) => ((d.getElementById(id) as HTMLInputElement).parentElement?.textContent ?? '').trim();
const open = async (file: ViewerFile, listing: Record<string, unknown>) => { const b = bootViewer(file, { listing }); await until(() => rendered(b.d)); return b; };

describe('SALE-FORM-WITH-TOOLS: a synced listing', () => {
  it('shows the View from the features bucket as Cotality\'s string, and the pets from raw_data as Cotality\'s string', async () => {
    const b = await open('SALE-FORM-WITH-TOOLS', record('sale', { View: 'ParkGreenbelt,Ocean' }, { PetsAllowed: 'Yes,CatsOk' }));
    try {
      expect(ticked(b.d, 'input[name="saleViewList"]')).toEqual(['Ocean', 'ParkGreenbelt']);
      expect(ticked(b.d, 'input[name="salePetsAllowed"]')).toEqual(['CatsOk', 'Yes']);
    } finally { b.close(); }
  });

  it('also reads a list kept as an array, in raw_data (what the forms save) or in features, and raw_data wins when both hold one', async () => {
    const fromRaw = await open('SALE-FORM-WITH-TOOLS', record('sale', { View: ['Street'] }, { View: ['Ocean'], PetsAllowed: ['Yes'] }));
    try {
      expect(ticked(fromRaw.d, 'input[name="saleViewList"]')).toEqual(['Ocean']);
      expect(ticked(fromRaw.d, 'input[name="salePetsAllowed"]')).toEqual(['Yes']);
    } finally { fromRaw.close(); }
    const fromFeatures = await open('SALE-FORM-WITH-TOOLS', record('sale', { View: ['Street', 'Ocean'] }, {}));
    try { expect(ticked(fromFeatures.d, 'input[name="saleViewList"]')).toEqual(['Ocean', 'Street']); } finally { fromFeatures.close(); }
  });

  it('a cleared list (an empty array in raw_data) is not replaced by a stale one in features', async () => {
    const b = await open('SALE-FORM-WITH-TOOLS', record('sale', { View: ['Ocean'] }, { View: [] }));
    try { expect(ticked(b.d, 'input[name="saleViewList"]')).toEqual([]); } finally { b.close(); }
  });

  it('shows the Condition from Cotality\'s string (the first member), and the earlier View words of a saved listing as the live ones', async () => {
    const b = await open('SALE-FORM-WITH-TOOLS', record('sale', {}, { PropertyCondition: 'Turnkey,ShowsWell', View: ['Park', 'SeaOcean', 'Streets'] }));
    try {
      expect((field(b.d, 'saleCondition') as HTMLSelectElement).value).toBe('Turnkey');
      expect(ticked(b.d, 'input[name="saleViewList"]')).toEqual(['Ocean', 'ParkGreenbelt', 'Street']);
    } finally { b.close(); }
  });

  it('shows the building amenities of a synced listing from features.BuildingFeatures', async () => {
    const b = await open('SALE-FORM-WITH-TOOLS', record('sale', { BuildingFeatures: 'Elevators,FitnessCenter,ConferenceRoom,Doorman' }, {}));
    try {
      const on = ['saleBldgElevator', 'saleBldgGym', 'saleBldgConferenceRoom'];
      for (const id of on) expect({ id, on: (b.d.getElementById(id) as HTMLInputElement).checked }).toEqual({ id, on: true });
      expect((b.d.getElementById('saleBldgPool') as HTMLInputElement).checked).toBe(false);
    } finally { b.close(); }
  });
});

describe('RENTAL-FORM-WITH-TOOLS: a synced listing', () => {
  it('shows the building amenities from features.BuildingFeatures as Cotality\'s string, the live members including Conference Room', async () => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', record('rent', { BuildingFeatures: 'Elevators,FitnessCenter,ConferenceRoom,BikeStorage,Doorman' }, {}));
    try {
      const on = ['bldgElevator', 'bldgGym', 'bldgConferenceRoom', 'bldgBikeRoom'];
      expect(on.map((id) => [id, boxLabel(b.d, id), (b.d.getElementById(id) as HTMLInputElement).checked])).toEqual([
        ['bldgElevator', 'Elevator', true], ['bldgGym', 'Gym/Fitness Center', true], ['bldgConferenceRoom', 'Conference Room', true], ['bldgBikeRoom', 'Bike Room', true],
      ]);
      expect((b.d.getElementById('bldgPool') as HTMLInputElement).checked).toBe(false);
    } finally { b.close(); }
  });

  it('shows the pets from raw_data as Cotality\'s string', async () => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', record('rent', {}, { PetsAllowed: 'CatsOk,DogsOk' }));
    try { expect(ticked(b.d, 'input[name="rentalPetsAllowed"]')).toEqual(['CatsOk', 'DogsOk']); } finally { b.close(); }
  });

  it('a listing saved before the other building boxes stopped being sent as BuildingFeatures labels still shows them ticked, when it holds no value under the box\'s own id', async () => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', record('rent', {}, { BuildingFeatures: ['Historic District', 'Parents Buying Allowed', 'Board Approval Required', 'Elevators'] }));
    try {
      for (const id of ['bldgHistoric', 'bldgParentsAllowed', 'bldgBoardApproval']) expect({ id, on: (b.d.getElementById(id) as HTMLInputElement).checked }).toEqual({ id, on: true });
      expect((b.d.getElementById('bldgLEED') as HTMLInputElement).checked).toBe(false);
    } finally { b.close(); }
  });

  it('...but a value the box\'s own id holds wins: an unticked box stays unticked', async () => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', record('rent', {}, { BuildingFeatures: ['Historic District'], bldgHistoric: false }));
    try { expect((b.d.getElementById('bldgHistoric') as HTMLInputElement).checked).toBe(false); } finally { b.close(); }
  });
});

describe.each([['SALE-FORM-WITH-TOOLS', 'sale', 'saleStreetAddress'], ['RENTAL-FORM-WITH-TOOLS', 'rent', 'rentalStreetAddress']] as const)('%s: the street line', (file, type, id) => {
  const shown = (b: { d: Document }) => (b.d.getElementById(id) as HTMLInputElement).value;

  it('a listing the form saved shows the street as the agent typed it, though its atoms hold the live members (the parser stores "St" as Street)', async () => {
    const b = await open(file, record(type, {}, { [id]: '333 E 46th St' }));
    try { expect(shown(b)).toBe('333 E 46th St'); } finally { b.close(); }
  });

  it('a synced listing, which carries no typed line, shows it composed from its atoms', async () => {
    const b = await open(file, record(type, {}, {}));
    try { expect(shown(b)).toBe('333 E 46th Street'); } finally { b.close(); }
  });

  it('an empty typed line is no line: the atoms compose it', async () => {
    const b = await open(file, record(type, {}, { [id]: '   ' }));
    try { expect(shown(b)).toBe('333 E 46th Street'); } finally { b.close(); }
  });
});

describe('SALE-FORM-WITH-TOOLS: a list under the control\'s own Cotality key', () => {
  // The pets are a list of the same name in the record (PetsAllowed): a synced listing keeps it in raw_data as Cotality's string, and some records keep it in the features bucket.
  it('is read from the features bucket when raw_data holds none, as an array or as Cotality\'s string', async () => {
    const asArray = await open('SALE-FORM-WITH-TOOLS', record('sale', { PetsAllowed: ['Yes', 'CatsOk'] }, {}));
    try { expect(ticked(asArray.d, 'input[name="salePetsAllowed"]')).toEqual(['CatsOk', 'Yes']); } finally { asArray.close(); }
    const asString = await open('SALE-FORM-WITH-TOOLS', record('sale', { PetsAllowed: 'DogsOk,CatsOk' }, {}));
    try { expect(ticked(asString.d, 'input[name="salePetsAllowed"]')).toEqual(['CatsOk', 'DogsOk']); } finally { asString.close(); }
  });

  it('raw_data wins when both hold one', async () => {
    const b = await open('SALE-FORM-WITH-TOOLS', record('sale', { PetsAllowed: ['Yes'] }, { PetsAllowed: ['CatsOk'] }));
    try { expect(ticked(b.d, 'input[name="salePetsAllowed"]')).toEqual(['CatsOk']); } finally { b.close(); }
  });
});
