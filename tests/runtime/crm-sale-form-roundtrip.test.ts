/// <reference types="jest" />
/**
 * The Sale Add / Edit form, proven create -> save -> reload -> edit -> save -> reload on the REAL page (the Rental form's proof, crm-rental-form-roundtrip.test.ts,
 * for Sale).
 *
 * Measured before this change (every writable control filled in, saved through the real normalizer and persistence code, opened in edit mode): 359 controls were
 * entered and 263 came back. The edit load was a hand-written list of controls: the Commercial, Townhouse financials, Commission Request, fireplace, building tab
 * and media controls the list did not name returned to their defaults, and the next Save wrote those defaults over what the agent had entered. YearBuilt (a Cotality
 * field) and SubdivisionName were read BEFORE the building modal was swept, so they were never saved from the building tab; the First Showing date and time was
 * blanked by a table row that only knows dates; the status shown was the workflow step the agent once picked, not the status the record stores; and Load Draft
 * restored only controls that have an id, so every checkbox group stayed as it was.
 *
 * What this pins: a form that is filled in, saved, reloaded and saved again sends the same payload and stores the same row, a change made after the reload is kept,
 * a browser draft restores everything it saved, the status shown is the record's, and a page that could not put the listing back refuses to save over it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, controlState, fillForm, PAGE_MODULES, sleep, storedListing, type BootedForm, type Entered } from './add-form-harness';

jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'SALE-FORM-REDESIGN';
const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
const win: any = {};
new Function('window', readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8'))(win);
const NUMERIC = new Set<string>(win.MallanListingHydration.tables.sale.FIELD_MAP.filter((r: any) => r.type === 'number').map((r: any) => r.form));

// Payload keys that legitimately differ between two saves of the same listing.
const VOLATILE = /^(_savedAt|_formVersion)$/;
const without = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !VOLATILE.test(k)));
// The form derives these on its own: from the annual tax, the listing id and the address. A new listing has no listing id, so its public URL cannot be the saved one.
const DERIVED_ON_LOAD = new Set(['saleListingUrl']);

/** What the agent does in a new form: a street address the form can read, then every other control, then the form's own derivations (what typing triggers). */
async function fillNewListing(): Promise<{ entered: Entered[]; payload: Record<string, any> }> {
  const f = await bootAddForm(FORM);
  try {
    const street = f.d.getElementById('saleStreetAddress') as HTMLInputElement;
    street.value = '333 E 46th St';
    f.w.parseSaleAddress();                                  // the form reads the street, number, direction, suffix (and derives the area)
    const entered = fillForm(f.d, 'sale', NUMERIC);          // overwrites whatever the street read derived, like an agent typing over it
    entered.push({ key: 'saleStreetAddress', kind: 'value', expected: '333 E 46th St' });
    // what the form derives from what was typed (its own input / change handlers): the monthly tax from the annual one, the monthly total, the building's mirror of the address
    f.w.autoCalcTaxMonthly();
    f.w.calculateSaleTotalMonthly();
    f.w._syncSaleBuildingAddressFields();
    for (const e of entered) {
      if (e.kind === 'value' && ['saleTaxMonthly', 'saleBldgStreetAddress', 'saleNeighborhoodFromAddress', 'saleTotalMonthly'].includes(e.key)) e.expected = (f.d.getElementById(e.key) as HTMLInputElement).value;
    }
    return { entered, payload: f.w.collectSaleFormData() };
  } finally { f.close(); }
}

async function openForEdit(listing: Record<string, unknown>): Promise<BootedForm> {
  return bootAddForm(FORM, { search: '?id=1', listing, settle: 1800 });
}

const mismatches = (f: BootedForm, entered: Entered[]) => {
  const lost: Record<string, string> = {};
  const absent: string[] = [];
  for (const e of entered) {
    const got = controlState(f.d, e);
    if (got === null) { absent.push(`${e.kind}:${e.key}`); continue; }
    if (JSON.stringify(got) !== JSON.stringify(e.expected)) lost[e.key] = `entered ${JSON.stringify(e.expected)}, form shows ${JSON.stringify(got)}`;
  }
  return { lost, absent };
};

describe(`${FORM}: create -> save -> reload -> edit -> save -> reload`, () => {
  let entered: Entered[];
  let payload1: Record<string, any>;
  let stored1: Record<string, any>;
  beforeAll(async () => {
    ({ entered, payload: payload1 } = await fillNewListing());
    stored1 = storedListing(payload1, 'sale') as Record<string, any>;
  });

  it('fills in the whole form (the number of entries is the number of controls, so a form that grows is noticed)', () => {
    expect(entered.length).toBeGreaterThan(330);
  });

  it('saves the values of every checkbox group, YearBuilt and the neighborhood from the building tab, and the agent\'s Cotality MLS ID', () => {
    const p = payload1;
    for (const group of ['Heating', 'Cooling', 'saleCommSubtype', 'saleBusinessType', 'saleTHDocsAvailable', 'saleBldgHeating', 'saleBldgCooling', 'saleBldgDocsAvailable', 'PetsAllowed',
      'BuildingPetsAllowed', 'AttendanceType', 'BuildingLaundryFeatures', 'saleResidentialType', 'saleCommercialFeatures', 'salePrivateOutdoorSpace', 'saleExposure', 'saleViewList',
      'saleAdditionalRooms', 'saleKitchenType', 'saleKitchenFeatures', 'saleDining', 'saleBathroomFeatures', 'saleFeatureDetails', 'saleWindows', 'saleCeilings', 'saleFlooring',
      'saleStorage', 'saleWasherDryerBrand', 'saleFreshAirSystem', 'saleHvacSystem']) {
      expect(Array.isArray(p[group])).toBe(true);
      expect(p[group].length).toBeGreaterThan(0);                  // the values, not one boolean
    }
    expect(p.Heating).toContain('Steam');
    expect(p.YearBuilt).toBeGreaterThan(0);                        // read after the building modal is swept (it was always null)
    expect(p.SubdivisionName).toBeTruthy();                        // the building tab's neighborhood (it was never saved from the building tab)
    expect(p.SubdivisionName).toBe(p.saleBldgNeighborhood);
    expect(p).toMatchObject({ ListAgentMlsId: '39361' });          // the agent's Cotality MLS ID (see crm-agent-defaults.test.ts)
  });

  it('opens for editing with every control the agent filled in', async () => {
    const f = await openForEdit(stored1);
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const { lost, absent } = mismatches(f, entered);
      expect(absent).toEqual([]);
      expect(lost).toEqual({});
    } finally { f.close(); }
  });

  it('restores the hidden controls too (the buyer-agent picker keeps its company and agent)', async () => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    let stored: Record<string, any>;
    try {
      (f.d.getElementById('saleBuyerCompany') as HTMLInputElement).value = 'mallan';
      (f.d.getElementById('saleBuyerAgent') as HTMLInputElement).value = '4321';
      stored = storedListing(f.w.collectSaleFormData(), 'sale') as Record<string, any>;
      expect(stored.raw_data.saleBuyerAgent).toBe('4321');
    } finally { f.close(); }
    const g = await openForEdit(stored);
    try {
      expect((g.d.getElementById('saleBuyerCompany') as HTMLInputElement).value).toBe('mallan');
      expect((g.d.getElementById('saleBuyerAgent') as HTMLInputElement).value).toBe('4321');
    } finally { g.close(); }
  });

  it('saves the reloaded form exactly as it was first saved, and stores the same row', async () => {
    const f = await openForEdit(stored1);
    try {
      const payload2 = f.w.collectSaleFormData();
      const a = without(payload1);
      const b = without(payload2);
      const differ: Record<string, string> = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (DERIVED_ON_LOAD.has(k)) continue;
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) differ[k] = `first save ${JSON.stringify(a[k])}, second save ${JSON.stringify(b[k])}`;
      }
      expect(differ).toEqual({});
      expect(b.saleListingUrl).toMatch(/\/listing\/.*\/sl-0001$/);       // the form fills the public URL in on load, from the address and the listing id
      const stored2 = storedListing(payload2, 'sale') as Record<string, any>;
      const { saleListingUrl: _u1, ...raw1 } = stored1.raw_data;
      const { saleListingUrl: _u2, ...raw2 } = stored2.raw_data;
      expect(raw2).toEqual(raw1);
      for (const col of ['status', 'list_price', 'bedrooms_total', 'bathrooms_full', 'bathrooms_half', 'living_area', 'list_agent_mls_id', 'list_office_mls_id']) {
        expect(stored2[col]).toEqual(stored1[col]);
      }
      expect(stored2.address).toEqual(stored1.address);
      expect(stored2.features).toEqual(stored1.features);
    } finally { f.close(); }
  });

  it('keeps an edit made after the reload: a text, a select, a radio, a single checkbox and a checkbox group member', async () => {
    const f = await openForEdit(stored1);
    let stored3: Record<string, any>;
    let editedFreq = '';
    let editedFloors = '';
    try {
      (f.d.getElementById('saleDescription') as HTMLTextAreaElement).value = 'Edited description';
      const freq = f.d.getElementById('saleMaintCCFreq') as HTMLSelectElement;
      const otherFreq = [...freq.options].map((o) => o.value).filter((v) => v && v !== freq.value)[0];
      freq.value = otherFreq;
      const floors = [...f.d.querySelectorAll('input[name="saleNumFloors"]')] as HTMLInputElement[];
      const otherFloors = floors.find((r) => !r.checked)!;
      floors.forEach((r) => { r.checked = r === otherFloors; });
      (f.d.getElementById('saleBldgElevator') as HTMLInputElement).checked = false;
      (f.d.querySelector('input[name="saleHeating"][value="Steam"]') as HTMLInputElement).checked = false;
      const edited = f.w.collectSaleFormData();
      expect(edited.saleDescription).toBe('Edited description');
      expect(edited.saleNumFloors).toBe(otherFloors.value);
      expect(edited.saleBldgElevator).toBe(false);
      expect(edited.Heating).not.toContain('Steam');
      stored3 = storedListing(edited, 'sale') as Record<string, any>;
      editedFreq = otherFreq;
      editedFloors = otherFloors.value;
    } finally { f.close(); }
    const g = await openForEdit(stored3);
    try {
      expect(controlState(g.d, { key: 'saleDescription', kind: 'value', expected: '' })).toBe('Edited description');
      expect(controlState(g.d, { key: 'saleMaintCCFreq', kind: 'value', expected: '' })).toBe(editedFreq);
      expect(controlState(g.d, { key: 'saleNumFloors', kind: 'radio', expected: '' })).toBe(editedFloors);
      expect(controlState(g.d, { key: 'saleBldgElevator', kind: 'check', expected: true })).toBe(false);
      expect(controlState(g.d, { key: 'saleHeating', kind: 'group', expected: [] })).not.toContain('Steam');
      // everything else the agent filled in is still there
      const rest = entered.filter((e) => !['saleDescription', 'saleMaintCCFreq', 'saleNumFloors', 'saleBldgElevator', 'saleHeating'].includes(e.key));
      expect(mismatches(g, rest).lost).toEqual({});
    } finally { g.close(); }
  });
});

describe(`${FORM}: the status shown is the record's, not a stale workflow step`, () => {
  const open = async (typed: string | null, workflow: string | null) => {
    const f = await bootAddForm(FORM, { search: '?id=1', listing: { id: '1', listing_id: 'SL-1', status: typed, raw_data: workflow ? { saleStatus: workflow, _crmWorkflowStatus: workflow } : {} }, settle: 1500 });
    try { return (f.d.getElementById('saleStatus') as HTMLSelectElement).value; } finally { f.close(); }
  };
  // The status the record stores is the truth (a create always starts as Draft and transitions go through the status route: a publish that failed, or a change made outside
  // this form, leaves the record disagreeing with the step the agent picked). The workflow step is shown only while it is in the same family as the stored status.
  it('keeps the workflow step the agent chose while it agrees with the record', async () => {
    expect(await open('Pending', 'ContractSigned')).toBe('ContractSigned');
    expect(await open('Pending', 'BoardApproved')).toBe('BoardApproved');
    expect(await open('ActiveUnderContract', 'OfferAccepted')).toBe('OfferAccepted');
    expect(await open('Draft', 'Future')).toBe('Future');
    expect(await open('Active', 'BackOnMarket')).toBe('BackOnMarket');
    expect(await open('Sold', 'SoldThruUs')).toBe('SoldThruUs');
    expect(await open('Closed', 'SoldThruUs')).toBe('SoldThruUs');
  });
  it('follows the record when the status was changed outside the form, or the publish failed', async () => {
    expect(await open('Draft', 'Active')).toBe('Draft');                 // saved as Draft, "Publish failed": the form must not say Active
    expect(await open('Sold', 'Active')).toBe('Sold');
    expect(await open('Withdrawn', 'Active')).toBe('Withdrawn');
    expect(await open('Expired', 'Active')).toBe('Expired');
    expect(await open('Cancelled', 'Active')).toBe('Cancelled');
    expect(await open('Canceled', 'Active')).toBe('Cancelled');
    expect(await open('Hold', 'Active')).toBe('TempOffMarket');
    expect(await open('ComingSoon', 'Active')).toBe('ComingSoon');
  });
  it('asks the agent to choose when the stored status has several workflow steps and the saved one disagrees', async () => {
    expect(await open('Pending', 'Active')).toBe('');
    expect(await open('ActiveUnderContract', 'Active')).toBe('');
  });
  it('shows the saved step when the record carries no status of its own, or one this form does not know', async () => {
    expect(await open(null, 'OfferOut')).toBe('OfferOut');
    expect(await open('SomethingElse', 'OfferOut')).toBe('OfferOut');
  });
});

describe(`${FORM}: the browser draft`, () => {
  /** The same fill as a new listing, then the form's own autosave: what lands in the browser's storage. */
  async function fillAndAutosave(): Promise<{ entered: Entered[]; draft: string }> {
    const f = await bootAddForm(FORM);
    try {
      (f.d.getElementById('saleStreetAddress') as HTMLInputElement).value = '333 E 46th St';
      f.w.parseSaleAddress();
      const entered = fillForm(f.d, 'sale', NUMERIC);
      entered.push({ key: 'saleStreetAddress', kind: 'value', expected: '333 E 46th St' });
      f.w.autoCalcTaxMonthly();
      f.w.calculateSaleTotalMonthly();
      f.w._syncSaleBuildingAddressFields();
      for (const e of entered) {
        if (e.kind === 'value' && ['saleTaxMonthly', 'saleBldgStreetAddress', 'saleNeighborhoodFromAddress', 'saleTotalMonthly'].includes(e.key)) e.expected = (f.d.getElementById(e.key) as HTMLInputElement).value;
      }
      f.w.performAutoSave();
      return { entered, draft: f.w.localStorage.getItem('mallan_draft_sale') as string };
    } finally { f.close(); }
  }

  it('is what Save sends: the building and media modals and the values of every checkbox group, not one boolean per group', async () => {
    const { draft } = await fillAndAutosave();
    const saved = JSON.parse(draft);
    expect(typeof saved._savedAt).toBe('string');
    expect(saved.listing_type).toBe('sale');
    expect(saved.saleBldgName).toBeTruthy();                      // the building modal
    expect(saved.salePhotoSortOrder).toBeTruthy();                // the media modal
    expect(saved.YearBuilt).toBeGreaterThan(0);
    expect(Array.isArray(saved.Heating)).toBe(true);
    expect(saved.Heating).toContain('Steam');
    expect(Array.isArray(saved.saleKitchenFeatures)).toBe(true);
  });

  it('restores everything the draft saved when the page is opened with ?restore=local (My Listings offers that), the checkbox groups and the modals too', async () => {
    const { entered, draft } = await fillAndAutosave();
    const f = await bootAddForm(FORM, { search: '?restore=local', storage: { mallan_draft_sale: draft }, settle: 1800 });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const { lost, absent } = mismatches(f, entered);
      expect(absent).toEqual([]);
      expect(lost).toEqual({});
      expect([...f.d.querySelectorAll('body > div[style*="99999"]')].some((t) => /Draft restored \(\d+ fields\)/.test(t.textContent ?? ''))).toBe(true);
    } finally { f.close(); }
  });

  it('says so when a saved draft cannot be read, and the form still opens', async () => {
    const f = await bootAddForm(FORM, { search: '?restore=local', storage: { mallan_draft_sale: '{not json' }, settle: 1200 });
    try {
      expect([...f.d.querySelectorAll('body > div[style*="99999"]')].some((t) => /Draft data is corrupted/.test(t.textContent ?? ''))).toBe(true);
      expect((f.d.getElementById('saleDescription') as HTMLTextAreaElement).value).toBe('');
    } finally { f.close(); }
  });

  it('a draft never replaces a listing opened for editing', async () => {
    const draft = JSON.stringify({ _savedAt: new Date().toISOString(), saleDescription: 'Stale draft' });
    const f = await bootAddForm(FORM, { search: '?id=1&restore=local', listing: { id: '1', listing_id: 'SL-1', status: 'Active', raw_data: { saleDescription: 'Saved description' } }, storage: { mallan_draft_sale: draft }, settle: 1500 });
    try {
      expect((f.d.getElementById('saleDescription') as HTMLTextAreaElement).value).toBe('Saved description');
    } finally { f.close(); }
  });
});

describe(`${FORM}: a page that could not put the listing back is not "loaded"`, () => {
  it('refuses to save over it, and says the listing did not load, when listing-hydration.js did not run', async () => {
    const stored = storedListing({ saleDescription: 'Kept', ListPrice: 1250000 }, 'sale');
    const f = await bootAddForm(FORM, { search: '?id=1', listing: stored, modules: PAGE_MODULES.filter((m) => m !== 'listing-hydration'), settle: 900 });
    try {
      const toasts = () => [...f.d.querySelectorAll('body > div[style*="99999"]')].map((t) => t.textContent ?? '');
      expect(toasts().some((t) => /Failed to load listing: js\/forms\/listing-hydration\.js did not load/.test(t))).toBe(true);
      for (const saver of ['manualSaveDraft', 'submitSalesListing']) {
        const before = toasts().filter((t) => /This listing did not load/.test(t)).length;
        await f.w[saver]();
        await sleep(150);
        expect(toasts().filter((t) => /This listing did not load/.test(t)).length).toBe(before + 1);
      }
      expect(f.saved).toEqual([]);                                          // nothing was written: a half-restored form would have replaced the stored listing
    } finally { f.close(); }
  });

  it('loads the module on the page', () => {
    expect(page).toContain('<script src="js/forms/listing-hydration.js"></script>');
  });
});
