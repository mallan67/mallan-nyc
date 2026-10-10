/// <reference types="jest" />
/**
 * The Rental Add / Edit form after a reload: the status, the sub-selectors of a classification, and everything that depends on a control's state (notices,
 * conditional sections, locked controls). crm-rental-form-roundtrip.test.ts proves every control comes back; this proves what they switch on.
 */
import { bootAddForm, sleep, storedListing, type BootedForm } from './add-form-harness';
import { bootViewer, rendered, until } from './tools-viewer-harness';

jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';

async function openForEdit(listing: Record<string, unknown>): Promise<BootedForm> {
  return bootAddForm(FORM, { search: '?id=1', listing, settle: 1800 });
}
describe(`${FORM}: the saved status is the record's, not a stale workflow step`, () => {
  const open = async (typed: string | null, workflow: string | null) => {
    const f = await bootAddForm(FORM, { search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: typed, raw_data: workflow ? { rentalStatus: workflow } : {} }, settle: 1500 });
    try { return (f.d.getElementById('rentalStatus') as HTMLSelectElement).value; } finally { f.close(); }
  };
  // The status the record stores is the truth (a create always starts as Draft and transitions go through the status route, so the form's own status control never
  // changes it). The workflow step the agent chose is shown only while it is in the same family as the stored status.
  it('keeps the workflow step the agent chose while it agrees with the record', async () => {
    expect(await open('Pending', 'LeaseSigned')).toBe('LeaseSigned');
    expect(await open('Draft', 'Future')).toBe('Future');
    expect(await open('Incomplete', 'Future')).toBe('Future');
    expect(await open('Closed', 'RentedThruUs')).toBe('RentedThruUs');
    expect(await open('Sold', 'Rented')).toBe('Rented');
  });
  it('follows the record when the status was changed outside the form', async () => {
    expect(await open('Closed', 'Active')).toBe('Rented');
    expect(await open('Withdrawn', 'Active')).toBe('Withdrawn');
    expect(await open('Expired', 'Active')).toBe('Expired');
    expect(await open('Cancelled', 'Active')).toBe('Cancelled');
    expect(await open('Hold', 'Active')).toBe('TempOffMarket');
    expect(await open('Draft', 'Active')).toBe('Draft');          // a create always starts as Draft, whatever step the form had
  });
  it('asks the agent to choose when the stored status has several workflow steps and the saved one disagrees', async () => {
    expect(await open('Pending', 'Active')).toBe('');
  });
  it('shows the saved step when the record carries no status of its own, or one this form does not know', async () => {
    expect(await open(null, 'AppOut')).toBe('AppOut');
    expect(await open('SomethingElse', 'AppOut')).toBe('AppOut');
  });
});

describe(`${FORM}: the Office / Retail and Commercial sub-selectors come back with their classification`, () => {
  it.each([
    ['Office', 'rentalOfficeRetailOwnership', 'Condo'],
    ['Retail', 'rentalOfficeRetailOwnership', 'FeeSimple'],
    ['Commercial', 'rentalCommercialOwnership', 'LandOnly'],
  ])('%s with %s = %s', async (classification, group, choice) => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    let payload: Record<string, any>;
    try {
      (f.d.querySelector(`input[name="rentalPropertyType"][value="${classification}"]`) as HTMLInputElement).checked = true;
      f.w.applyRentalFieldRules();
      (f.d.querySelector(`input[name="${group}"][value="${choice}"]`) as HTMLInputElement).checked = true;
      payload = f.w.collectRentalFormData();
    } finally { f.close(); }
    const g = await openForEdit(storedListing(payload, 'rent'));
    try {
      expect((g.d.querySelector('input[name="rentalPropertyType"]:checked') as HTMLInputElement).value).toBe(classification);
      expect((g.d.querySelector(`input[name="${group}"]:checked`) as HTMLInputElement | null)?.value).toBe(choice);
    } finally { g.close(); }
  });
});

describe(`${FORM}: what depends on a control's state is shown again after a reload`, () => {
  const display = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLElement).style.display;
  const change = (f: BootedForm, el: Element) => el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  const pick = (f: BootedForm, name: string, value: string) => {
    const r = f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement;
    r.checked = true;
    change(f, r);
  };
  /** Do something in a fresh form the way an agent would, save it, and open the saved listing for editing. */
  const reopen = async (arrange: (f: BootedForm) => void, record: Record<string, unknown> = {}): Promise<BootedForm> => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    let payload: Record<string, any>;
    try { arrange(f); payload = f.w.collectRentalFormData(); } finally { f.close(); }
    return openForEdit({ ...storedListing(payload, 'rent'), ...record });
  };

  it('tenant pays the broker fee: the warning is shown and the internet display controls stay switched off', async () => {
    const g = await reopen((f) => pick(f, 'rentalFareActLandlordPays', 'no'));
    try {
      expect(display(g, 'fareActWarning')).toBe('block');
      for (const id of ['rentalInternetEntireListingDisplayYN', 'rentalInternetAddressDisplayYN', 'rentalInternetConsumerCommentYN']) {
        const el = g.d.getElementById(id) as HTMLInputElement;
        expect([id, el.checked, el.disabled]).toEqual([id, false, true]);
      }
    } finally { g.close(); }
  });

  it('a building that allows no pets keeps the unit pets locked to "no pets"', async () => {
    const g = await reopen((f) => {
      const cb = f.d.querySelector('input[name="rentalBuildingPetsAllowed"][value="BuildingNo"]') as HTMLInputElement;
      cb.checked = true;
      change(f, cb);
    });
    try {
      expect(g.d.getElementById('rentalPetsAllowedLocked')!.classList.contains('hidden')).toBe(false);
      const unit = [...g.d.querySelectorAll('input[name="rentalPetsAllowed"]')] as HTMLInputElement[];
      expect(unit.every((c) => c.disabled)).toBe(true);
      expect(unit.filter((c) => c.checked).map((c) => c.value)).toEqual(['No']);
    } finally { g.close(); }
  });

  it.each([['Yes', 'block'], ['No', 'none']])('heating answered %s: the heating types are %s', async (answer, shown) => {
    const g = await reopen((f) => pick(f, 'rentalHeatingYN', answer));
    try { expect(display(g, 'rentalHeatingTypes')).toBe(shown); } finally { g.close(); }
  });
  it.each([['Yes', 'block'], ['No', 'none']])('cooling answered %s: the cooling types are %s', async (answer, shown) => {
    const g = await reopen((f) => pick(f, 'rentalCoolingYN', answer));
    try { expect(display(g, 'rentalCoolingTypes')).toBe(shown); } finally { g.close(); }
  });

  it('a land lease shows its fields', async () => {
    const g = await reopen((f) => {
      const lease = f.d.getElementById('rentalTHLandLeaseYN') as HTMLSelectElement;
      lease.value = 'Yes';
      change(f, lease);
    });
    try {
      expect(display(g, 'rentalTHLandLeaseFields')).toBe('block');
    } finally { g.close(); }
  });

  it('a tax abatement shows its details', async () => {
    const g = await reopen((f) => {
      const abatement = f.d.getElementById('bldgTaxAbatementYN') as HTMLSelectElement;
      abatement.value = 'Yes';
      change(f, abatement);
    });
    try { expect(display(g, 'bldgTaxAbatementDetails')).toBe('grid'); } finally { g.close(); }
  });

  it('the header shows the address and unit, the description counter its length, and the preview the furnished answer', async () => {
    const g = await reopen((f) => {
      (f.d.getElementById('rentalStreetAddress') as HTMLInputElement).value = '333 E 46th St';
      f.w.parseRentalAddress();
      (f.d.getElementById('rentalUnitNumber') as HTMLInputElement).value = '5C';
      (f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value = 'Hello there';
      (f.d.getElementById('rentalFurnished') as HTMLSelectElement).value = 'Partially';
    });
    try {
      expect(g.d.getElementById('rentalAddressDisplay')!.textContent).toBe('333 E 46th St');
      expect(g.d.getElementById('rentalUnitDisplay')!.textContent).toBe('5C');
      expect(g.d.getElementById('rentalDescCharCount')!.textContent).toBe('11 / 5000 characters');
      g.w.updateRentalPreview();
      expect(g.d.getElementById('rentalPreviewSiteDetailFurnished')!.textContent).toBe('Partially Furnished');
    } finally { g.close(); }
  });

  it('a rented listing shows the rented date and price fields (the stored status decides)', async () => {
    const g = await reopen(() => undefined, { status: 'Closed' });
    try {
      expect((g.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('Rented');
      expect(display(g, 'rentalRentedDateField')).toBe('');
      expect(display(g, 'rentalRentedPriceField')).toBe('');
    } finally { g.close(); }
  });

  it('an owner opt-out listing shows its notice and its form section', async () => {
    const g = await reopen((f) => pick(f, 'rentalListingType', 'RLS-Owner-OptOut'));
    try {
      expect(display(g, 'rentalOwnerOptOutWarning')).toBe('');
      expect(display(g, 'rentalOptOutFormSection')).toBe('');
    } finally { g.close(); }
  });

  it.each([['Office', ''], ['Condo', 'none']])('classification %s: the Office / Retail building type selector shows "%s"', async (classification, shown) => {
    const g = await reopen((f) => pick(f, 'rentalPropertyType', classification));
    try { expect(display(g, 'rentalOfficeRetailBuildingType')).toBe(shown); } finally { g.close(); }
  });
});

describe(`${FORM}: HeatingYN and CoolingYN`, () => {
  it('are sent only when answered, or when details were chosen without an answer', async () => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    try {
      let p = f.w.collectRentalFormData();
      expect(p).not.toHaveProperty('HeatingYN');
      expect(p).not.toHaveProperty('CoolingYN');
      (f.d.querySelector('input[name="rentalHeating"][value="Steam"]') as HTMLInputElement).checked = true;
      p = f.w.collectRentalFormData();
      expect(p.HeatingYN).toBe(true);
      expect(p.Heating).toEqual(['Steam']);
      (f.d.querySelector('input[name="rentalCoolingYN"][value="No"]') as HTMLInputElement).checked = true;
      p = f.w.collectRentalFormData();
      expect(p.CoolingYN).toBe(false);
      expect(p.Cooling).toEqual([]);
    } finally { f.close(); }
  });
});

describe(`${FORM}: Furnished and a missing hydration module`, () => {
  it.each([['Furnished', 'block'], ['Partially', 'block'], ['Unfurnished', 'none'], ['Negotiable', 'none']])('Furnished "%s" is saved and the furnished-rent fields are %s after the reload', async (answer, shown) => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    let stored: Record<string, any>;
    try {
      (f.d.getElementById('rentalFurnished') as HTMLSelectElement).value = answer;
      stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>;
    } finally { f.close(); }
    const g = await openForEdit(stored);
    try {
      expect((g.d.getElementById('rentalFurnished') as HTMLSelectElement).value).toBe(answer);
      expect((g.d.getElementById('rentalFurnishedDetails') as HTMLElement).style.display).toBe(shown);
    } finally { g.close(); }
  });

  it('says so, loudly, when the hydration module did not load (the form is not silently left blank)', async () => {
    const g = await bootAddForm(FORM, {
      search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: { rentalDescription: 'Saved description' } },
      modules: ['directory-picker', 'colist-section', 'agent-defaults'], settle: 1200,
    });
    try {
      expect([...g.d.querySelectorAll('.toast-notification')].map((t) => t.textContent)).toContain(' Could not load all of the stored listing into the form. Please reload the page.');
    } finally { g.close(); }
  });
});

describe(`${FORM}: the classification comes from what the agent chose, else from the provider dimensions`, () => {
  it('keeps the saved classification even when the provider ownership points elsewhere (the two are independent controls)', async () => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    let stored: Record<string, any>;
    try {
      const co = f.d.querySelector('input[name="rentalPropertyType"][value="Coop"]') as HTMLInputElement;
      co.checked = true;
      co.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      (f.d.getElementById('rentalCommonInterest') as HTMLSelectElement).value = 'Condominium';
      stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>;
      expect(stored.raw_data.CommonInterest).toBe('Condominium');
    } finally { f.close(); }
    const g = await openForEdit(stored);
    try {
      expect((g.d.querySelector('input[name="rentalPropertyType"]:checked') as HTMLInputElement).value).toBe('Coop');
      expect((g.d.getElementById('rentalCommonInterest') as HTMLSelectElement).value).toBe('Condominium');
    } finally { g.close(); }
  });

  it.each([
    ['StockCooperative', undefined, 'Coop'],
    ['Condominium', undefined, 'Condo'],
    [null, 'SingleFamilyResidence', 'SingleFamily'],
  ])('a listing with no form state (a synced one) is classified from CommonInterest %s / PropertySubType %s as %s', async (commonInterest, subType, expected) => {
    const raw: Record<string, unknown> = {};
    if (commonInterest) raw.CommonInterest = commonInterest;
    const g = await openForEdit({ id: '1', listing_id: 'RL-1', status: 'Active', property_sub_type: subType, address: {}, features: {}, agent_info: {}, media: [], raw_data: raw });
    try {
      expect((g.d.querySelector('input[name="rentalPropertyType"]:checked') as HTMLInputElement | null)?.value).toBe(expected);
    } finally { g.close(); }
  });
});

describe('RENTAL-FORM-WITH-TOOLS: the viewer preview shows the furnished answer', () => {
  it.each([['Partially', 'Partially Furnished'], ['Unfurnished', 'Unfurnished'], ['', '--']])('Furnished "%s" is shown as "%s"', async (answer, shown) => {
    const listing = { id: '5', listing_id: 'RL-5', status: 'Active', address: {}, features: {}, agent_info: {}, media: [], raw_data: answer ? { rentalFurnished: answer } : {} };
    const b = bootViewer('RENTAL-FORM-WITH-TOOLS', { listing });
    try {
      await until(() => rendered(b.d), 15000);
      await sleep(1200);                                   // the page refreshes its preview a moment after it renders
      expect(b.d.getElementById('rentalPreviewSiteDetailFurnished')!.textContent).toBe(shown);
    } finally { b.close(); }
  });
});
