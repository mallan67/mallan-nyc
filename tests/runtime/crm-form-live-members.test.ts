/// <reference types="jest" />
/**
 * Three more things the Add forms sent, or claimed to send, that live Cotality does not have (found 2026-10-09 by running each page's own collector with every option of every control set in turn and
 * checking what it EMITS against the repo's copy of the live metadata, data/cotality-enums.live.json; Maya: "there is no noise, there are errors and the need fixing. Do not assume, do actual corrections").
 *
 *  1. Rental BuildingFeatures. The collector pushed the VISIBLE LABELS of the building amenity boxes ("Gym/Fitness Center", "Roof Deck", ...) into BuildingFeatures, and with them the labels of nine boxes that
 *     are not building features ("Historic District", "Parents Buying Allowed", "Board Approval Required", ...). The Sale form translates the labels that have an unambiguous live member and keeps the others
 *     in its own list; the Rental form now does the same (rentalBuildingFeaturesInternal), and the boxes that are not building features no longer claim the field.
 *  2. Rental OwnerPays. "Owner Pays" is the broker-fee concession (beside "Free Rent" and "Owner Pays AND Free Rent"); live OwnerPays is the list of UTILITIES the owner pays (Heat, Water, ...). The form
 *     sent ['Yes'] to it. The box is saved under its own id and is not sent as that field.
 *  3. Sale View. Three boxes carried words the live View list does not have (Park, SeaOcean, Streets); they carry ParkGreenbelt, Ocean and Street, a listing saved with the old words still loads, and the one
 *     answer the live list has no member for ("Rooftops/Sky") is kept in the form's own list and not sent as a View.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, storedListing, type AddForm } from './add-form-harness';
import { bootViewer, rendered, until as viewerUntil, type ViewerFile } from './tools-viewer-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const live: { entities: Record<string, Record<string, string>>; enums: Record<string, string[]> } = JSON.parse(readFileSync(resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8'));
const read = (name: string) => readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8');
const docOf = (name: string): Document => new JSDOM(read(name)).window.document;

// ── 1. Rental BuildingFeatures ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The amenity boxes of the Rental building window: id -> [the label the box shows, the live member it translates to or null (kept in the form's own list)]. */
const AMENITIES: Record<string, [string, string | null]> = {
  bldgElevator: ['Elevator', 'Elevators'], bldgGym: ['Gym/Fitness Center', 'FitnessCenter'], bldgPlayroom: ["Children's Playroom", 'CommonPlayroom'], bldgLounge: ['Resident Lounge', 'CommonLounge'],
  bldgBikeRoom: ['Bike Room', 'BikeStorage'], bldgStorage: ['Storage Available', 'Storage'], bldgPackageRoom: ['Package Room', 'PackageRoom'], bldgColdStorage: ['Cold Storage', 'ColdStorage'],
  bldgPool: ['Pool', null], bldgRoofDeck: ['Roof Deck', null], bldgCourtyard: ['Courtyard/Garden', null], bldgBusinessCenter: ['Business Center', null], bldgConferenceRoom: ['Conference Room', null],
  bldgParking: ['Parking Garage', null], bldgValet: ['Valet Parking', null], bldgLiveInSuper: ['Live-In Super', null], bldgOnSiteManager: ['On-Site Manager', null],
  bldgWheelchairAccess: ['Wheelchair Access', null], bldgSpa: ['Spa', null],
};
/** The boxes of the same window (and of the Features tab) that are NOT building features: they are the form's own and must not claim the field. */
const NOT_FEATURES = ['bldgHistoric', 'bldgLEED', 'bldgConversion', 'bldgParentsAllowed', 'bldgCoBuyersAllowed', 'bldgCorpOwnAllowed', 'bldgGiftsAllowed', 'bldgBoardApproval',
  'rentalDoorman', 'rentalElevator', 'rentalGym', 'rentalBikeRoom', 'rentalStorage', 'rentalRoofDeck', 'rentalLiveInSuper', 'rentalParking', 'rentalPool', 'rentalConcierge', 'rentalValet'];
const MEMBERS = Object.values(AMENITIES).map(([, m]) => m).filter((m): m is string => !!m).sort();
const LABELS_KEPT = Object.values(AMENITIES).filter(([, m]) => !m).map(([label]) => label).sort();

describe('Rental BuildingFeatures: the live members', () => {
  it('the members the translation uses are members of the live BuildingFeatures list', () => {
    expect(MEMBERS).toHaveLength(8);
    for (const m of MEMBERS) expect(live.enums.BuildingFeatures).toContain(m);
  });

  it.each(['RENTAL-FORM-REDESIGN', 'RENTAL-FORM-WITH-TOOLS'])('%s: only the 19 amenity boxes claim BuildingFeatures; the boxes that are not building features claim nothing', (file) => {
    const doc = docOf(file);
    const claiming = [...doc.querySelectorAll('[data-rls-field="BuildingFeatures"]')].map((e) => e.id).sort();
    expect(claiming).toEqual(Object.keys(AMENITIES).sort());
    for (const id of NOT_FEATURES) expect({ id, claim: doc.getElementById(id)?.getAttribute('data-rls-field') ?? null }).toEqual({ id, claim: null });
    expect(doc.querySelector('input[name="rentalBoardApproval"][value="Yes"]')!.hasAttribute('data-rls-field')).toBe(false);
  });

  describe('the Add form', () => {
    const tick = (f: any, ids: string[], on = true) => ids.forEach((id) => { const box = f.d.getElementById(id) as HTMLInputElement; box.checked = on; });
    const shown = (g: any) => Object.keys(AMENITIES).filter((id) => (g.d.getElementById(id) as HTMLInputElement).checked).sort();
    // a listing that carries the building features only as Cotality's list (a synced one, or one saved before the form kept its boxes under their ids): the boxes' own ids are not in it
    const withoutBoxIds = (raw: Record<string, any>) => Object.fromEntries(Object.entries(raw).filter(([key]) => !(key in AMENITIES)));

    it('sends the live member of each amenity that has one, keeps the others in its own list, and sends a box that is not a building feature nowhere', async () => {
      const f = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { settle: 300 });
      try {
        tick(f, [...Object.keys(AMENITIES), 'bldgHistoric', 'bldgParentsAllowed', 'bldgBoardApproval']);
        const data = f.w.collectRentalFormData();
        expect([...data.BuildingFeatures].sort()).toEqual(MEMBERS);
        for (const m of data.BuildingFeatures) expect(live.enums.BuildingFeatures).toContain(m);
        expect([...data.rentalBuildingFeaturesInternal].sort()).toEqual(LABELS_KEPT);
        for (const word of ['Historic District', 'Parents Buying Allowed', 'Board Approval Required']) {
          expect(data.BuildingFeatures).not.toContain(word);
          expect(data.rentalBuildingFeaturesInternal).not.toContain(word);
        }
        // the three boxes that are not building features are saved under their own ids
        expect([data.bldgHistoric, data.bldgParentsAllowed, data.bldgBoardApproval]).toEqual([true, true, true]);
      } finally { f.close(); }
    });

    it('nothing ticked sends two empty lists', async () => {
      const f = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { settle: 300 });
      try {
        const data = f.w.collectRentalFormData();
        expect([data.BuildingFeatures, data.rentalBuildingFeaturesInternal]).toEqual([[], []]);
      } finally { f.close(); }
    });

    it('a saved listing comes back with the same boxes ticked (the live members and the kept labels), and the three other boxes too', async () => {
      const f = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { settle: 300 });
      let stored: Record<string, any>;
      try {
        tick(f, ['bldgGym', 'bldgElevator', 'bldgPool', 'bldgSpa', 'bldgHistoric', 'bldgBoardApproval']);
        stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>;
      } finally { f.close(); }
      expect(stored.raw_data.BuildingFeatures.sort()).toEqual(['Elevators', 'FitnessCenter']);
      expect(stored.raw_data.rentalBuildingFeaturesInternal.sort()).toEqual(['Pool', 'Spa']);
      const g = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: stored, settle: 1500 });
      try {
        expect(shown(g)).toEqual(['bldgElevator', 'bldgGym', 'bldgPool', 'bldgSpa']);
        expect([(g.d.getElementById('bldgHistoric') as HTMLInputElement).checked, (g.d.getElementById('bldgBoardApproval') as HTMLInputElement).checked]).toEqual([true, true]);
      } finally { g.close(); }
    });

    it('a listing saved before (the labels the boxes show) still loads', async () => {
      const f = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { settle: 300 });
      let stored: Record<string, any>;
      try { stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>; } finally { f.close(); }
      const old = { ...stored, raw_data: { ...withoutBoxIds(stored.raw_data), BuildingFeatures: ['Gym/Fitness Center', 'Pool', 'Cold Storage'], rentalBuildingFeaturesInternal: undefined } };
      const g = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: old, settle: 1500 });
      try { expect(shown(g)).toEqual(['bldgColdStorage', 'bldgGym', 'bldgPool']); } finally { g.close(); }
    });

    it('a synced listing (the live members only) ticks the boxes that have them', async () => {
      const f = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { settle: 300 });
      let stored: Record<string, any>;
      try { stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>; } finally { f.close(); }
      const synced = { ...stored, raw_data: { ...withoutBoxIds(stored.raw_data), BuildingFeatures: ['Elevators', 'BikeStorage', 'SomeMemberNoBoxHas'] } };
      const g = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: synced, settle: 1500 });
      try { expect(shown(g)).toEqual(['bldgBikeRoom', 'bldgElevator']); } finally { g.close(); }
    });
  });

  describe.each(['RENTAL-FORM-WITH-TOOLS'] as ViewerFile[])('the viewer %s', (file) => {
    const listing = (raw: Record<string, unknown>) => ({
      id: '77', listing_id: 'L77', mls_id: 'M77', status: 'Active', listing_type: 'rent', property_type: 'Residential', list_price: '4500',
      address: { StreetNumber: '333', StreetName: '46th', StreetSuffix: 'St', City: 'New York', PostalCode: '10017', StateOrProvince: 'NY' },
      features: {}, agent_info: {}, media: [], raw_data: { CommonInterest: 'Condominium', ...raw },
    });
    const ticked = async (raw: Record<string, unknown>) => {
      const b = bootViewer(file, { listing: listing(raw) });
      try {
        await viewerUntil(() => rendered(b.d));
        return Object.keys(AMENITIES).filter((id) => (b.d.getElementById(id) as HTMLInputElement).checked).sort();
      } finally { b.close(); }
    };
    it('shows the live members, the kept labels and the old labels of a stored listing in their boxes', async () => {
      expect(await ticked({ BuildingFeatures: ['Elevators', 'FitnessCenter'], rentalBuildingFeaturesInternal: ['Pool'] })).toEqual(['bldgElevator', 'bldgGym', 'bldgPool']);
      expect(await ticked({ BuildingFeatures: ['Gym/Fitness Center', 'Spa'] })).toEqual(['bldgGym', 'bldgSpa']);
      expect(await ticked({})).toEqual([]);
    });
  });
});

// ── 2. Rental OwnerPays ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('Rental OwnerPays: the broker-fee concession is not the utilities field', () => {
  it.each(['RENTAL-FORM-REDESIGN', 'RENTAL-FORM-WITH-TOOLS'])('%s: the Owner Pays box claims no Cotality field', (file) => {
    const doc = docOf(file);
    expect(doc.getElementById('rentalOwnerPays')!.hasAttribute('data-rls-field')).toBe(false);
    expect(doc.querySelector('[data-rls-field="OwnerPays"]')).toBeNull();
  });

  it('the collector does not send OwnerPays, the box is saved under its own id, and it comes back ticked', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { settle: 300 });
    let stored: Record<string, any>;
    try {
      (f.d.getElementById('rentalOwnerPays') as HTMLInputElement).checked = true;
      const data = f.w.collectRentalFormData();
      expect(data).not.toHaveProperty('OwnerPays');
      expect(data.rentalOwnerPays).toBe(true);
      stored = storedListing(data, 'rent') as Record<string, any>;
    } finally { f.close(); }
    expect(stored.raw_data).not.toHaveProperty('OwnerPays');
    const g = await bootAddForm('RENTAL-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: stored, settle: 1500 });
    try { expect((g.d.getElementById('rentalOwnerPays') as HTMLInputElement).checked).toBe(true); } finally { g.close(); }
  });
});

// ── 3. Sale View ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OLD_VIEW_WORDS: Record<string, string> = { Park: 'ParkGreenbelt', SeaOcean: 'Ocean', Streets: 'Street' };
const VIEW_KEPT = 'RooftopsSky';                                // no member of the live View list stands for it

describe('Sale View: the live members', () => {
  it.each(['SALE-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS'])('%s: every View box carries a live member, but the one answer the live list has no member for', (file) => {
    const values = [...docOf(file).querySelectorAll('input[name="saleViewList"]')].map((e) => (e as HTMLInputElement).value);
    expect(values.length).toBe(12);
    expect(values.filter((v) => !live.enums.View.includes(v))).toEqual([VIEW_KEPT]);
    for (const old of Object.keys(OLD_VIEW_WORDS)) expect(values).not.toContain(old);
    for (const live_ of Object.values(OLD_VIEW_WORDS)) expect(values).toContain(live_);
  });

  describe('the Add form', () => {
    const tick = (f: any, values: string[]) => values.forEach((v) => { (f.d.querySelector(`input[name="saleViewList"][value="${v}"]`) as HTMLInputElement).checked = true; });
    const shown = (g: any) => [...g.d.querySelectorAll('input[name="saleViewList"]:checked')].map((e: any) => e.value).sort();

    it('sends the live members as the View, keeps "Rooftops/Sky" in the form\'s own list, and reloads all of them', async () => {
      const f = await bootAddForm('SALE-FORM-REDESIGN' as AddForm, { settle: 300 });
      let stored: Record<string, any>;
      try {
        tick(f, ['Street', 'ParkGreenbelt', 'Ocean', 'Skyline', VIEW_KEPT]);
        const data = f.w.collectSaleFormData();
        expect([...data.View].sort()).toEqual(['Ocean', 'ParkGreenbelt', 'Skyline', 'Street']);
        for (const v of data.View) expect(live.enums.View).toContain(v);
        expect([...data.saleViewList].sort()).toEqual(['Ocean', 'ParkGreenbelt', 'RooftopsSky', 'Skyline', 'Street']);
        stored = storedListing(data, 'sale') as Record<string, any>;
      } finally { f.close(); }
      const g = await bootAddForm('SALE-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: stored, settle: 1500 });
      try { expect(shown(g)).toEqual(['Ocean', 'ParkGreenbelt', 'RooftopsSky', 'Skyline', 'Street']); } finally { g.close(); }
    });

    it('a listing saved with the old words (Park, SeaOcean, Streets) still loads, as the live members', async () => {
      const f = await bootAddForm('SALE-FORM-REDESIGN' as AddForm, { settle: 300 });
      let stored: Record<string, any>;
      try { stored = storedListing(f.w.collectSaleFormData(), 'sale') as Record<string, any>; } finally { f.close(); }
      const old = { ...stored, raw_data: { ...stored.raw_data, saleViewList: ['Streets', 'Park', 'SeaOcean', 'City'], View: ['Streets', 'Park', 'SeaOcean', 'City'] } };
      const g = await bootAddForm('SALE-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: old, settle: 1500 });
      try { expect(shown(g)).toEqual(['City', 'Ocean', 'ParkGreenbelt', 'Street']); } finally { g.close(); }
    });

    it('a synced listing (a View and no form list) ticks the boxes that have its members', async () => {
      const f = await bootAddForm('SALE-FORM-REDESIGN' as AddForm, { settle: 300 });
      let stored: Record<string, any>;
      try { stored = storedListing(f.w.collectSaleFormData(), 'sale') as Record<string, any>; } finally { f.close(); }
      const raw: Record<string, any> = { ...stored.raw_data, View: ['Skyline', 'Street', 'Lake'] };
      delete raw.saleViewList;
      const g = await bootAddForm('SALE-FORM-REDESIGN' as AddForm, { search: '?id=1', listing: { ...stored, raw_data: raw }, settle: 1500 });
      try { expect(shown(g)).toEqual(['Skyline', 'Street']); } finally { g.close(); }
    });
  });

  describe.each(['SALE-FORM-WITH-TOOLS'] as ViewerFile[])('the viewer %s', (file) => {
    const listing = (raw: Record<string, unknown>) => ({
      id: '77', listing_id: 'L77', mls_id: 'M77', status: 'Active', listing_type: 'sale', property_type: 'Residential', list_price: '1250000',
      address: { StreetNumber: '333', StreetName: '46th', StreetSuffix: 'St', City: 'New York', PostalCode: '10017', StateOrProvince: 'NY' },
      features: {}, agent_info: {}, media: [], raw_data: { CommonInterest: 'Condominium', ...raw },
    });
    const ticked = async (raw: Record<string, unknown>) => {
      const b = bootViewer(file, { listing: listing(raw) });
      try {
        await viewerUntil(() => rendered(b.d));
        return [...b.d.querySelectorAll('input[name="saleViewList"]:checked')].map((e: any) => e.value).sort();
      } finally { b.close(); }
    };
    it('shows a synced listing\'s View, and the old words of a stored one', async () => {
      expect(await ticked({ View: ['Skyline', 'Street'] })).toEqual(['Skyline', 'Street']);
      expect(await ticked({ saleViewList: ['Streets', 'Park'] })).toEqual(['ParkGreenbelt', 'Street']);
    });
  });
});
