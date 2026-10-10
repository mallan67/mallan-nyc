/// <reference types="jest" />
/**
 * An edit of a saved listing can CLEAR an answer: the Condition, the Special Listing Conditions (Sale), and the earlier wrong "Owner Pays" utilities (Rental).
 *
 * Found 2026-10-09 by an independent read-only review: the collectors leave a live Multi key out when its box is empty (a create must, or the empty list would count as an answer for the gate), and the
 * update route stores `{ ...what is stored, ...what the form sent }`, so an edit that blanked the Condition or unticked the last Special Listing Condition kept the old answer, and the form showed it again
 * when the listing was opened (the canonical key wins on reload). The collectors now send an empty list when they are in edit mode and the box is empty; a create still leaves the key out.
 *
 * The real pages run: a listing is saved the way the create route stores it (storedListing), opened for edit, cleared, saved the way the update route stores it (the merge, and the features bucket the
 * persistence map names: tests/runtime/crm-listing-update-features-parity.test.ts), and opened again.
 */
import { bootAddForm, storedListing, sleep, type BootedForm } from './add-form-harness';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FEATURE_KEYS = Object.entries(REBNY_FIELD_TABLES.persistenceMap as Record<string, { features?: boolean; removed?: boolean }>).filter(([, t]) => t.features && !t.removed).map(([k]) => k);
/** What PATCH /api/crm/listings/[id] leaves in the record: raw_data = {...stored, ...body}; features = stored, plus every persistence-map key the body carries. */
function afterEdit(stored: Record<string, any>, body: Record<string, any>): Record<string, any> {
  const features = { ...(stored.features ?? {}) };
  for (const key of FEATURE_KEYS) if (body[key] !== undefined) features[key] = body[key];
  return { ...stored, raw_data: { ...stored.raw_data, ...body }, features };
}
const setSelect = (f: BootedForm, id: string, value: string) => { const el = f.d.getElementById(id) as HTMLSelectElement; el.value = value; el.dispatchEvent(new (f.w as any).Event('change', { bubbles: true })); };
const ticked = (f: BootedForm, name: string) => [...f.d.querySelectorAll(`input[type="checkbox"][name="${name}"]`)].filter((b) => (b as HTMLInputElement).checked).map((b) => (b as HTMLInputElement).value);

describe('SALE-FORM-REDESIGN: clearing the Condition and the Special Listing Conditions', () => {
  it('a create with nothing chosen leaves both keys out (the gate must ask), and an edit that clears them sends empty lists', async () => {
    const created = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    let stored: Record<string, any>;
    try {
      const empty = created.w.collectSaleFormData();
      expect('PropertyCondition' in empty).toBe(false);                              // a create: no answer, no key
      expect('SpecialListingConditions' in empty).toBe(false);
      setSelect(created, 'saleCondition', 'Turnkey');
      (created.d.querySelector('input[name="saleSpecialListingConditions"][value="Estate"]') as HTMLInputElement).checked = true;
      (created.d.querySelector('input[name="saleSpecialListingConditions"][value="Model"]') as HTMLInputElement).checked = true;
      const body = created.w.collectSaleFormData();
      expect(body.PropertyCondition).toEqual(['Turnkey']);
      expect(body.SpecialListingConditions).toEqual(['Estate', 'Model']);
      stored = storedListing(body, 'sale') as Record<string, any>;
    } finally { created.close(); }

    const editing = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: stored, settle: 1500 });
    let cleared: Record<string, any>;
    try {
      expect((editing.d.getElementById('saleCondition') as HTMLSelectElement).value).toBe('Turnkey');
      expect(ticked(editing, 'saleSpecialListingConditions')).toEqual(['Estate', 'Model']);
      setSelect(editing, 'saleCondition', '');
      editing.d.querySelectorAll('input[name="saleSpecialListingConditions"]').forEach((b) => { (b as HTMLInputElement).checked = false; });
      const body = editing.w.collectSaleFormData();
      expect(body.PropertyCondition).toEqual([]);                                    // an edit: the empty list clears what is stored
      expect(body.SpecialListingConditions).toEqual([]);
      cleared = afterEdit(stored, body);
    } finally { editing.close(); }

    const reopened = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: cleared, settle: 1500 });
    try {
      expect((reopened.d.getElementById('saleCondition') as HTMLSelectElement).value).toBe('');              // it stays blank (it used to come back as Turnkey)
      expect(ticked(reopened, 'saleSpecialListingConditions')).toEqual([]);                                   // and stays unticked (it used to come back as Estate, Model)
    } finally { reopened.close(); }
  });

  it('an edit that keeps an answer sends it (the empty list is only for an empty box)', async () => {
    const created = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    let stored: Record<string, any>;
    try {
      setSelect(created, 'saleCondition', 'Excellent');
      (created.d.querySelector('input[name="saleSpecialListingConditions"][value="Estate"]') as HTMLInputElement).checked = true;
      stored = storedListing(created.w.collectSaleFormData(), 'sale') as Record<string, any>;
    } finally { created.close(); }
    const editing = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: stored, settle: 1500 });
    try {
      const body = editing.w.collectSaleFormData();
      expect(body.PropertyCondition).toEqual(['Excellent']);
      expect(body.SpecialListingConditions).toEqual(['Estate']);
    } finally { editing.close(); }
  });
});

describe('SALE-FORM-REDESIGN: the View answer follows the live View members', () => {
  // "Rooftops/Sky" is the one view box with no live View member. It used to make ViewYN true and send View: [] (the gate counts an empty list as an answer, so "a View is needed when ViewYN is true"
  // was met by nothing); now ViewYN follows the live members, an empty live list is not sent as an empty list on a create (so VIEW-001 can fire), and an edit sends [] to clear a stored View.
  const viewBody = async (tick: string[], hasViews?: 'Yes' | 'No', editing?: boolean) => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', editing ? { settle: 400 } : { settle: 400 });
    try {
      f.d.querySelectorAll('input[name="saleViewList"]').forEach((b) => { (b as HTMLInputElement).checked = tick.includes((b as HTMLInputElement).value); });
      f.d.querySelectorAll('input[name="saleHasViews"]').forEach((b) => { (b as HTMLInputElement).checked = hasViews !== undefined && (b as HTMLInputElement).value === hasViews; });
      if (editing) f.w._saleEditDbId = 5;
      return f.w.collectSaleFormData();
    } finally { f.close(); }
  };
  const viewGate = (body: Record<string, any>) => assertRlsCompliantPayload({ PropertyType: 'Residential', ...body }, { listingType: 'sale', rlsEligible: true }).blockers.filter((b) => b.code.includes('VIEW-001')).map((b) => b.code);

  it('a live member makes ViewYN true and is sent as View; Rooftops/Sky next to it is kept in the form\'s own list, not sent', async () => {
    const body = await viewBody(['Ocean', 'RooftopsSky']);
    expect([body.ViewYN, body.View, body.saleViewList]).toEqual([true, ['Ocean'], ['Ocean', 'RooftopsSky']]);
    expect(viewGate(body)).toEqual([]);
  });

  it('Rooftops/Sky alone is not a Cotality view: ViewYN is not made true by it, View is not sent, and the choice stays in the form\'s own list', async () => {
    const body = await viewBody(['RooftopsSky']);
    expect('ViewYN' in body).toBe(false);
    expect('View' in body).toBe(false);
    expect(body.saleViewList).toEqual(['RooftopsSky']);
    expect(viewGate(body)).toEqual([]);
  });

  it('"Has views: Yes" with only Rooftops/Sky is asked for a View by the gate (VIEW-001), instead of passing on an empty list', async () => {
    const body = await viewBody(['RooftopsSky'], 'Yes');
    expect(body.ViewYN).toBe(true);
    expect('View' in body).toBe(false);
    expect(viewGate(body)).toEqual(['CF-VIEW-001']);
  });

  it('an edit that ticks no view sends an empty View, so a stored one is cleared; a create sends none', async () => {
    expect((await viewBody([], undefined, true)).View).toEqual([]);
    expect('View' in (await viewBody([]))).toBe(false);
    expect((await viewBody(['Ocean'], undefined, true)).View).toEqual(['Ocean']);
  });
});

describe('SALE-FORM-REDESIGN: the pet lock is applied when a listing is opened', () => {
  // A building whose policy is "No Pets" (BuildingNo) locks the unit's pet boxes to "No". The lock ran only when the building box was changed by hand (and the Rental form re-applies it on load), so a
  // saved Sale listing opened with the unit boxes enabled, and an agent could save BuildingNo with a unit policy of Yes. The lookup of a building that says "No Pets" ticks the box without a change event too.
  const lockState = (f: BootedForm) => ({
    disabled: [...f.d.querySelectorAll('.sale-unit-pets-cb')].every((c) => (c as HTMLInputElement).disabled),
    checked: [...f.d.querySelectorAll('.sale-unit-pets-cb')].filter((c) => (c as HTMLInputElement).checked).map((c) => (c as HTMLInputElement).value).sort(),
    messageHidden: f.d.getElementById('salePetsAllowedLocked')?.classList.contains('hidden'),
  });

  it('a stored listing whose building says "No Pets" opens with the unit boxes locked to "No"; one that does not opens unlocked', async () => {
    const created = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    let stored: Record<string, any>;
    try { stored = storedListing(created.w.collectSaleFormData(), 'sale') as Record<string, any>; } finally { created.close(); }
    const locked = { ...stored, raw_data: { ...stored.raw_data, BuildingPetsAllowed: ['BuildingNo'], PetsAllowed: ['Yes'] } };
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: locked, settle: 1500 });
    try { expect(lockState(f)).toEqual({ disabled: true, checked: ['No'], messageHidden: false }); } finally { f.close(); }

    const open = { ...stored, raw_data: { ...stored.raw_data, BuildingPetsAllowed: ['BuildingYes'], PetsAllowed: ['Yes', 'CatsOk'] } };
    const g = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: open, settle: 1500 });
    try { expect(lockState(g)).toEqual({ disabled: false, checked: ['CatsOk', 'Yes'], messageHidden: true }); } finally { g.close(); }
  });
});

describe('RENTAL-FORM-REDESIGN: clearing the Condition, and the earlier wrong OwnerPays', () => {
  it('a create leaves PropertyCondition and OwnerPays out; an edit clears the Condition and replaces a stored OwnerPays [\'Yes\'] (the broker-fee box was once sent as the utilities field) with an empty list', async () => {
    const created = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 400 });
    let stored: Record<string, any>;
    try {
      const empty = created.w.collectRentalFormData();
      expect('PropertyCondition' in empty).toBe(false);
      expect('OwnerPays' in empty).toBe(false);                                      // a create sends no utilities list
      setSelect(created, 'rentalCondition', 'Turnkey');
      stored = storedListing(created.w.collectRentalFormData(), 'rent') as Record<string, any>;
    } finally { created.close(); }
    stored.raw_data = { ...stored.raw_data, OwnerPays: ['Yes'] };                    // what the earlier version of the page saved for a ticked "Owner Pays"

    const editing = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: stored, settle: 1500 });
    let cleared: Record<string, any>;
    try {
      expect((editing.d.getElementById('rentalCondition') as HTMLSelectElement).value).toBe('Turnkey');
      setSelect(editing, 'rentalCondition', '');
      const body = editing.w.collectRentalFormData();
      expect(body.PropertyCondition).toEqual([]);
      expect(body.OwnerPays).toEqual([]);
      cleared = afterEdit(stored, body);
    } finally { editing.close(); }
    expect(cleared.raw_data.OwnerPays).toEqual([]);                                  // the wrong answer is gone from the record

    const reopened = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: cleared, settle: 1500 });
    try {
      expect((reopened.d.getElementById('rentalCondition') as HTMLSelectElement).value).toBe('');
      await sleep(10);
    } finally { reopened.close(); }
  });
});

describe('an edit is known by the listing id alone as well as by the database id', () => {
  // A form that holds a listing id and no database id yet is still editing that listing (the page sets the two in different places: after a save, after a load).
  it('SALE-FORM-REDESIGN: an empty Condition, Special Listing Conditions and View are sent as empty lists', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    try {
      expect(f.w._saleEditDbId).toBeNull();
      f.w._saleEditListingId = 'SL-0001';
      const body = f.w.collectSaleFormData();
      expect([body.PropertyCondition, body.SpecialListingConditions, body.View]).toEqual([[], [], []]);
    } finally { f.close(); }
  });

  it('RENTAL-FORM-REDESIGN: an empty Condition is sent as an empty list, and the earlier OwnerPays is cleared', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 400 });
    try {
      expect(f.w._rentalEditDbId).toBeNull();
      f.w._rentalEditListingId = 'RL-0001';
      const body = f.w.collectRentalFormData();
      expect([body.PropertyCondition, body.OwnerPays]).toEqual([[], []]);
    } finally { f.close(); }
  });
});

describe('SALE-FORM-REDESIGN: the pet lock after a building is looked up', () => {
  // The lookup of a building whose policy is "No Pets" (BuildingNo) ticks the building box without the change event that applies the lock.
  const BUILDING = {
    address: '200 E 66th St', name: 'The Plaza Tower', borough: 'Manhattan', zip: '10065', neighborhood: 'Lenox Hill', common_interest: 'StockCooperative', structure_type: 'HighRise',
    year_built: 1961, stories_total: 32, units_total: 160, elevator: true, gym: true, roof_deck: true, tax_block: '1423', tax_lot: '7', association_name: 'The Plaza Tower Corp', cross_street: 'Third Avenue',
    building_laundry: ['CoinOperated'],
  };
  const lookUp = async (policy: string) => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [{ ...BUILDING, building_pets: [policy] }], settle: 600 });
    const street = f.d.getElementById('saleStreetAddress') as HTMLInputElement;
    street.value = '200 East 66th Street';
    street.dispatchEvent(new (f.w as any).Event('input', { bubbles: true }));
    street.dispatchEvent(new (f.w as any).Event('blur'));
    await sleep(350);
    return f;
  };
  const unitBoxes = (f: BootedForm) => [...f.d.querySelectorAll('.sale-unit-pets-cb')] as HTMLInputElement[];

  it('a building that says "No Pets" locks the unit\'s pet boxes to "No"', async () => {
    const f = await lookUp('BuildingNo');
    try {
      expect(ticked(f, 'saleBuildingPetsAllowed')).toEqual(['BuildingNo']);
      expect(unitBoxes(f).every((c) => c.disabled)).toBe(true);
      expect(unitBoxes(f).filter((c) => c.checked).map((c) => c.value)).toEqual(['No']);
    } finally { f.close(); }
  });

  it('a building that allows pets leaves them open', async () => {
    const f = await lookUp('BuildingYes');
    try {
      expect(ticked(f, 'saleBuildingPetsAllowed')).toEqual(['BuildingYes']);
      expect(unitBoxes(f).some((c) => c.disabled)).toBe(false);
    } finally { f.close(); }
  });
});
