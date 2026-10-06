/// <reference types="jest" />
/**
 * The Rental Add / Edit form, proven create -> save -> reload -> edit -> save -> reload on the REAL page.
 *
 * Measured before this fix (every writable control filled in, saved through the real normalizer and persistence code, opened in edit mode): 358 controls were
 * entered and 36 came back. The edit load was a hand-written list of about 45 controls, the save kept one boolean per checkbox group instead of the values,
 * YearBuilt / NewDevelopmentYN were read before the building modal was swept, two controls shared the key rentalFurnished, Agreement on File had no id, and Save
 * Draft stored a shape Load Draft could not read.
 *
 * What this pins: a form that is filled in, saved, reloaded and saved again sends the same payload and stores the same row, a change made after the reload is
 * kept, and a browser draft restores everything it saved.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, controlState, fillForm, sleep, storedListing, type BootedForm, type Entered } from './add-form-harness';

jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
const win: any = {};
new Function('window', readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8'))(win);
const NUMERIC = new Set<string>(win.MallanListingHydration.tables.rental.FIELD_MAP.filter((r: any) => r.type === 'number').map((r: any) => r.form));

// Payload keys that legitimately differ between two saves of the same listing.
const VOLATILE = /^(_savedAt|_formVersion)$/;
const without = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !VOLATILE.test(k)));

/** What the agent does in a new form: a street address the form can read, then every other control. */
async function fillNewListing(): Promise<{ entered: Entered[]; payload: Record<string, any> }> {
  const f = await bootAddForm(FORM);
  try {
    const street = f.d.getElementById('rentalStreetAddress') as HTMLInputElement;
    street.value = '333 E 46th St';
    f.w.parseRentalAddress();                                  // the form reads the street, number, direction, suffix (and derives the area)
    const entered = fillForm(f.d, 'rental', NUMERIC);          // overwrites whatever the street read derived, like an agent typing over it
    entered.push({ key: 'rentalStreetAddress', kind: 'value', expected: '333 E 46th St' });
    return { entered, payload: f.w.collectRentalFormData() };
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
    stored1 = storedListing(payload1, 'rent') as Record<string, any>;
  });

  it('fills in the whole form (the number of entries is the number of controls, so a form that grows is noticed)', () => {
    expect(entered.length).toBeGreaterThan(330);
  });

  it('saves the values of every checkbox group, YearBuilt, NewDevelopmentYN, Furnished and Agreement on File', () => {
    const p = payload1;
    for (const group of ['Heating', 'Cooling', 'rentalCommSubtype', 'rentalBusinessType', 'rentalTHDocsAvailable', 'bldgHeating', 'bldgCooling', 'bldgDocsAvailable', 'PetsAllowed', 'BuildingPetsAllowed', 'AttendanceType', 'BuildingLaundryFeatures']) {
      expect(Array.isArray(p[group])).toBe(true);
      expect(p[group].length).toBeGreaterThan(1);                  // the values, not one boolean
    }
    expect(p.Heating).toContain('Steam');
    expect(p.YearBuilt).toBeGreaterThan(0);                        // read after the building modal is swept
    expect(p.NewDevelopmentYN).toBe(true);
    expect(p.rentalFurnished).toBeTruthy();
    expect(p.Furnished).toBe(p.rentalFurnished);                   // the live Cotality enum
    expect(p.rentalAgreementOnFile).toBe(true);
    expect(p.HeatingYN).toBe(false);                               // the agent answered "No" (the last radio) while ticking details: the answer is what is sent
    expect(p.TaxLot).toBeTruthy();                                 // Cotality's field
    expect(p).not.toHaveProperty('BuildingTaxLot');
    expect(p).toMatchObject({ ListAgentMlsId: '39361' });          // the agent's Cotality MLS ID (see crm-agent-defaults.test.ts)
  });

  it('a created listing opens as Draft: the status is not part of what the form saves', async () => {
    const f = await openForEdit(stored1);
    try { expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('Draft'); } finally { f.close(); }
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

  it('restores the hidden controls too (the tenant-agent picker keeps its company and agent)', async () => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    let stored: Record<string, any>;
    try {
      (f.d.getElementById('rentalTenantCompany') as HTMLInputElement).value = 'mallan';
      (f.d.getElementById('rentalTenantAgent') as HTMLInputElement).value = '4321';
      stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>;
      expect(stored.raw_data.rentalTenantAgent).toBe('4321');
    } finally { f.close(); }
    const g = await openForEdit(stored);
    try {
      expect((g.d.getElementById('rentalTenantCompany') as HTMLInputElement).value).toBe('mallan');
      expect((g.d.getElementById('rentalTenantAgent') as HTMLInputElement).value).toBe('4321');
    } finally { g.close(); }
  });

  it('saves the reloaded form exactly as it was first saved, and stores the same row', async () => {
    const f = await openForEdit(stored1);
    try {
      const payload2 = f.w.collectRentalFormData();
      const a = without(payload1);
      const b = without(payload2);
      const differ: Record<string, string> = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) differ[k] = `first save ${JSON.stringify(a[k])}, second save ${JSON.stringify(b[k])}`;
      }
      expect(differ).toEqual({});
      const stored2 = storedListing(payload2, 'rent') as Record<string, any>;
      expect(stored2.raw_data).toEqual(stored1.raw_data);
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
    try {
      (f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value = 'Edited description';
      (f.d.getElementById('rentalLeaseTerm') as HTMLSelectElement).value = (f.d.getElementById('rentalLeaseTerm') as HTMLSelectElement).options[1].value;
      const guarantors = [...f.d.querySelectorAll('input[name="rentalGuarantors"]')] as HTMLInputElement[];
      guarantors.forEach((r) => { r.checked = r.value === 'Yes'; });
      (f.d.getElementById('rentalFreeRent') as HTMLInputElement).checked = false;
      (f.d.querySelector('input[name="rentalHeating"][value="Steam"]') as HTMLInputElement).checked = false;
      const edited = f.w.collectRentalFormData();
      expect(edited.rentalDescription).toBe('Edited description');
      expect(edited.rentalGuarantors).toBe('Yes');
      expect(edited.rentalFreeRent).toBe(false);
      expect(edited.Heating).not.toContain('Steam');
      stored3 = storedListing(edited, 'rent') as Record<string, any>;
    } finally { f.close(); }
    const g = await openForEdit(stored3);
    try {
      expect(controlState(g.d, { key: 'rentalDescription', kind: 'value', expected: '' })).toBe('Edited description');
      expect(controlState(g.d, { key: 'rentalGuarantors', kind: 'radio', expected: '' })).toBe('Yes');
      expect(controlState(g.d, { key: 'rentalFreeRent', kind: 'check', expected: true })).toBe(false);
      expect(controlState(g.d, { key: 'rentalHeating', kind: 'group', expected: [] })).not.toContain('Steam');
      // everything else the agent filled in is still there
      const rest = entered.filter((e) => !['rentalDescription', 'rentalLeaseTerm', 'rentalGuarantors', 'rentalFreeRent', 'rentalHeating'].includes(e.key));
      expect(mismatches(g, rest).lost).toEqual({});
    } finally { g.close(); }
  });
});

describe(`${FORM}: Save Draft and Load Draft`, () => {
  it('restores everything a draft saved, with the time it was saved', async () => {
    const { entered, payload } = await fillNewListing();
    const draft = JSON.stringify({ _savedAt: '2026-04-02T10:00:00.000Z', ...payload });
    const f = await bootAddForm(FORM, { storage: { rentalListingDraft: draft }, settle: 1800 });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const { lost, absent } = mismatches(f, entered);
      expect(absent).toEqual([]);
      expect(lost).toEqual({});
      expect([...f.d.querySelectorAll('.toast-notification')].map((t) => t.textContent)).toContain(` Draft restored from ${new Date('2026-04-02T10:00:00.000Z').toLocaleString()}`);
    } finally { f.close(); }
  });

  it('Save Draft writes what collectRentalFormData produced, so Load Draft can read it back', async () => {
    const f = await bootAddForm(FORM, { settle: 1200 });
    try {
      (f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value = 'Draft description';
      f.w.saveRentalDraft();
      const saved = JSON.parse(f.w.localStorage.getItem('rentalListingDraft'));
      expect(saved.rentalDescription).toBe('Draft description');
      expect(saved.ListPrice).toBe(0);
      expect(typeof saved._savedAt).toBe('string');
      expect(page).not.toContain('_collectRentalFormDataLegacy');        // nothing reads the superseded serializer's keys
    } finally { f.close(); }
  });

  it('says so when a saved draft cannot be read, and the form still opens', async () => {
    const f = await bootAddForm(FORM, { storage: { rentalListingDraft: '{not json' }, settle: 1200 });
    try {
      const toasts = [...f.d.querySelectorAll('.toast-notification')].map((t) => t.textContent ?? '');
      expect(toasts.some((t) => /The saved draft could not be restored/.test(t))).toBe(true);
      expect((f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value).toBe('');
    } finally { f.close(); }
  });

  it('a draft never replaces a listing opened for editing, and is cleared', async () => {
    const draft = JSON.stringify({ rentalDescription: 'Stale draft' });
    const f = await bootAddForm(FORM, { search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Active', raw_data: { rentalDescription: 'Saved description' } }, storage: { rentalListingDraft: draft }, settle: 1500 });
    try {
      expect((f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value).toBe('Saved description');
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
    } finally { f.close(); }
  });
});

describe(`${FORM}: Furnished is one control`, () => {
  it('has a single control with the key rentalFurnished, and an empty first option', () => {
    expect(page.split('name="rentalFurnished"').length - 1).toBe(0);
    expect(page.split('id="rentalFurnished"').length - 1).toBe(1);
    expect(page).toMatch(/id="rentalFurnished"[^>]*>\s*<option value="">Select\.\.\.<\/option>/);
  });
  it('shows the furnished-rent fields for Furnished and Partially, and sends no Furnished answer until one is chosen', async () => {
    const f = await bootAddForm(FORM, { settle: 1000 });
    try {
      const sel = f.d.getElementById('rentalFurnished') as HTMLSelectElement;
      const details = f.d.getElementById('rentalFurnishedDetails') as HTMLElement;
      expect(sel.value).toBe('');
      expect(f.w.collectRentalFormData()).not.toHaveProperty('Furnished');
      for (const [value, shown] of [['Furnished', 'block'], ['Partially', 'block'], ['Unfurnished', 'none'], ['Negotiable', 'none']] as const) {
        sel.value = value;
        sel.dispatchEvent(new f.w.Event('change', { bubbles: true }));
        expect(details.style.display).toBe(shown);
      }
      sel.value = 'Partially';
      expect(f.w.collectRentalFormData().Furnished).toBe('Partially');
      await sleep(10);
    } finally { f.close(); }
  });
});
