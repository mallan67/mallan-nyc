/// <reference types="jest" />
/**
 * The Rental Add / Edit form asks the server for the status the agent chose.
 *
 * Submit saved the listing and stopped. A listing starts as a Draft on the server, the listing route does not write the status column ("transitions go through /status"), and the Rental
 * form never called the status route (the Sale form does). Whatever the agent chose in the status list, the rental stayed a Draft, and the form, which opens a listing with the status
 * the RECORD stores, showed it as one. Now the form saves the listing and then asks the status route for the server's status that stands for the step the agent chose; the server's own state
 * machine decides (a Draft moves only to Active), and a refusal is said, not hidden. The Rental form has no server vocabulary of its own (lib/crm/status-mapping.ts knows the Sale steps
 * only), so the steps are taken through the status of the live Cotality MlsStatus the form already maps them to (Pending, Closed ...), and a closed rental is the server's "Rented".
 * These tests drive the REAL page.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';

// [the step the agent picks, the status the server is asked for ('' = none)]
const STEPS: [string, string][] = [
  ['Draft', ''], ['Future', ''], ['Incomplete', ''],
  ['Active', 'Active'], ['BackOnMarket', 'Active'],
  ['AppOut', 'Pending'], ['AppThruUs', 'Pending'], ['AppAccepted', 'Pending'], ['AppAcceptedThruUs', 'Pending'], ['LeaseOut', 'Pending'], ['LeaseOutThruUs', 'Pending'],
  ['LeaseSigned', 'Pending'], ['LeaseSignedThruUs', 'Pending'], ['BoardApproved', 'Pending'], ['Pending', 'Pending'],
  ['Rented', 'Rented'], ['RentedThruUs', 'Rented'], ['Closed', 'Rented'],
  ['Withdrawn', 'Withdrawn'], ['PermOffMarket', 'Withdrawn'],
  ['Cancelled', 'Cancelled'], ['Canceled', 'Cancelled'],
  ['TempOffMarket', 'Hold'], ['Hold', 'Hold'],
  ['Expired', 'Expired'],
];

const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };
const pick = (f: BootedForm, id: string) => {
  const select = f.d.getElementById(id) as HTMLSelectElement;
  select.value = [...select.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value;
};
const choose = (f: BootedForm, step: string) => {
  const select = f.d.getElementById('rentalStatus') as HTMLSelectElement;
  if (![...select.options].some((o) => o.value === step)) {
    const option = f.d.createElement('option');
    option.value = step; option.textContent = step;
    select.appendChild(option);
  }
  select.value = step;
};
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('div.toast-notification')].map((t) => t.textContent ?? '');     // the Rental page's own toast: a div of this class, removed after 3 seconds

/** Every control the page asks for before it submits (the required fields of its tabs), filled in. */
function fillRequired(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St');
  pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest');
  set(f, 'rentalMonthlyRent', '4200');
  set(f, 'rentalDateListed', '2026-10-01');
  set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01');
  set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true;
  (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  set(f, 'rentalCity', 'New York');
  pick(f, 'rentalState');
  set(f, 'rentalZip', '10017');
  pick(f, 'rentalBedrooms');
  pick(f, 'rentalFullBathrooms');
}

/** Opens the form (new, or as the saved listing given), fills it in, picks the step, submits and waits for the page to finish. */
async function submit(step: string, o: AddFormOpts = {}) {
  const f = await bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
  if (o.search) await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);        // a saved listing is saved over only once it is back in the form (a slow machine: wait for it)
  const alerts: string[] = [];
  f.w.alert = (message: unknown) => { alerts.push(String(message)); };
  fillRequired(f);
  choose(f, step);
  f.w.submitRentalListing();
  await until(() => f.saved.length > 0, 8000);                 // the listing is saved first...
  await sleep(800);                                            // ...and the page then asks for a status, if it is going to
  return { f, alerts };
}

describe(`${FORM}: a new listing`, () => {
  it.each(STEPS)('the %s step asks the server for %j', async (step, status) => {
    const { f } = await submit(step);
    try {
      expect(f.errors).toEqual([]);
      expect(f.statusCalls).toEqual(status ? [['1', status]] : []);
      expect(toasts(f).filter((t) => /not one this form can set/.test(t))).toEqual([]);              // every step of the list is one the form knows
    } finally { await sleep(100); f.close(); }
  });

  it('a step the form does not know saves the listing, changes its status in no way, and says so', async () => {
    const { f } = await submit('Bogus');
    try {
      expect(f.saved).toHaveLength(1);
      expect(f.statusCalls).toEqual([]);
      expect(toasts(f).some((t) => /status "Bogus" is not one this form can set/.test(t))).toBe(true);
    } finally { await sleep(100); f.close(); }
  });

  it('a form with no status control asks for no status, and says nothing about one', async () => {
    const f = await bootAddForm(FORM, { settle: 800 });
    try {
      fillRequired(f);
      f.w.validateRentalTab = () => true;                              // the page asks for the status before it submits: this is the page without it
      f.d.getElementById('rentalStatus')!.remove();
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 8000);
      await sleep(800);
      expect(f.statusCalls).toEqual([]);
      expect(toasts(f).filter((t) => /not one this form can set/.test(t))).toEqual([]);
    } finally { await sleep(100); f.close(); }
  });

  it.each([['constructor'], ['__proto__'], ['toString']])('a step called %s is no step either', async (step) => {
    const { f } = await submit(step);
    try {
      expect(f.statusCalls).toEqual([]);
      expect(toasts(f).some((t) => t.includes(`status "${step}" is not one this form can set`))).toBe(true);
    } finally { await sleep(100); f.close(); }
  });

  it('says the status the server answered with, in the message that confirms the listing', async () => {
    const { f, alerts } = await submit('Active', { statusAnswer: { status: 'Active' } });
    try {
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatch(/^SUCCESS! Your rental listing has been submitted\./);
      expect(alerts[0]).toContain('Listing ID: L-1');
      expect(alerts[0]).toContain('Status: Active');
    } finally { await sleep(100); f.close(); }
  });

  it('says the status the listing has when nothing was asked for: a Draft', async () => {
    const { f, alerts } = await submit('Draft');
    try {
      expect(alerts[0]).toContain('Status: Draft');
    } finally { await sleep(100); f.close(); }
  });

  it('a change the server refuses is said, and the message does not claim it', async () => {
    const { f, alerts } = await submit('LeaseSigned', { statusError: 'Invalid status transition: Draft → Pending' });
    try {
      expect(f.statusCalls).toEqual([['1', 'Pending']]);
      expect(toasts(f).some((t) => /Saved as Draft\..*Invalid status transition: Draft → Pending/.test(t))).toBe(true);
      expect(alerts[0]).toContain('Status: Draft');
      expect(alerts[0]).not.toContain('Pending');
    } finally { await sleep(100); f.close(); }
  });

  it('a listing that is saved and published stays open for editing: the next save updates it', async () => {
    const { f } = await submit('Active');
    try {
      expect(f.w.eval('_rentalEditMode')).toBe(true);
      expect(f.w.eval('_rentalEditDbId')).toBe('1');
      expect(f.w.eval('_rentalEditListingId')).toBe('L-1');
    } finally { await sleep(100); f.close(); }
  });
});

describe(`${FORM}: a saved listing`, () => {
  const saved = (status: string) => ({ id: '1', listing_id: 'RL-1', status, raw_data: {} });

  it('is not asked for the status it has', async () => {
    const { f } = await submit('Active', { search: '?id=1', listing: saved('Active'), updated: { status: 'Active' } });
    try {
      expect(f.saved).toHaveLength(1);
      expect(f.statusCalls).toEqual([]);
    } finally { await sleep(100); f.close(); }
  });

  it('moves on to the next step: an Active rental whose lease is signed is Pending', async () => {
    const { f, alerts } = await submit('LeaseSigned', { search: '?id=1', listing: saved('Active'), updated: { status: 'Active' }, statusAnswer: { status: 'Pending' } });
    try {
      expect(f.statusCalls).toEqual([['1', 'Pending']]);
      expect(alerts[0]).toMatch(/^SUCCESS! Listing updated\./);
      expect(alerts[0]).toContain('Listing ID: RL-1');
      expect(alerts[0]).toContain('Status: Pending');
    } finally { await sleep(100); f.close(); }
  });

  it('is asked for the status the server says the listing has now, not the one it was opened with', async () => {
    const { f } = await submit('Active', { search: '?id=1', listing: saved('Active'), updated: { status: 'Hold' } });         // moved to Hold since it was opened
    try {
      expect(f.statusCalls).toEqual([['1', 'Active']]);
    } finally { await sleep(100); f.close(); }
  });

  it('is not asked for a status when the answer does not say what it has but the record loaded did', async () => {
    const { f } = await submit('Active', { search: '?id=1', listing: saved('Active') });       // the update answers nothing: the status the listing was opened with is the one it has
    try {
      expect(f.statusCalls).toEqual([]);
    } finally { await sleep(100); f.close(); }
  });

  it.each([['Draft'], ['Future'], ['Incomplete']])('an Active listing picked as %s: the server decides, and its refusal is said, not hidden', async (step) => {
    const { f, alerts } = await submit(step, { search: '?id=1', listing: saved('Active'), updated: { status: 'Active' }, statusError: 'Invalid status transition: Active → Draft' });
    try {
      expect(f.statusCalls).toEqual([['1', 'Draft']]);
      expect(toasts(f).some((t) => /Saved as Active\..*Invalid status transition: Active → Draft/.test(t))).toBe(true);
      expect(alerts[0]).toContain('Status: Active');
    } finally { await sleep(100); f.close(); }
  });

  it.each([['Hold'], ['Withdrawn'], ['Expired']])('a listing that is %s, picked as Draft, goes back to Draft, which the server allows', async (status) => {
    const { f, alerts } = await submit('Draft', { search: '?id=1', listing: saved(status), updated: { status }, statusAnswer: { status: 'Draft' } });
    try {
      expect(f.statusCalls).toEqual([['1', 'Draft']]);
      expect(alerts[0]).toContain('Status: Draft');
    } finally { await sleep(100); f.close(); }
  });

  it('the second save of a listing that was just published asks for nothing: the status it was moved to is the one it has', async () => {
    const { f } = await submit('Active');
    try {
      expect(f.statusCalls).toEqual([['1', 'Active']]);
      f.w.submitRentalListing();                                   // the update answers nothing about the status
      await until(() => f.saved.length > 1, 8000);
      await sleep(800);
      expect(f.saved).toHaveLength(2);
      expect(f.statusCalls).toEqual([['1', 'Active']]);
    } finally { await sleep(100); f.close(); }
  });
});

describe(`${FORM}: what the server answers`, () => {
  it('a save that answers without an id has no listing to ask the status route about', async () => {
    const { f, alerts } = await submit('Active', { created: { id: undefined } });
    try {
      expect(f.saved).toHaveLength(1);
      expect(f.statusCalls).toEqual([]);
      expect(alerts[0]).toContain('Status: Draft');
    } finally { await sleep(100); f.close(); }
  });

  it('a save that answers without a status is a Draft: a Draft step asks for nothing', async () => {
    const { f, alerts } = await submit('Draft', { created: { status: undefined } });
    try {
      expect(f.statusCalls).toEqual([]);
      expect(alerts[0]).toContain('Status: Draft');
    } finally { await sleep(100); f.close(); }
  });

  it('the status shown is the one the server answered with, not the one that was asked for', async () => {
    const { f, alerts } = await submit('LeaseSigned', { statusAnswer: { status: 'ActiveUnderContract' } });
    try {
      expect(f.statusCalls).toEqual([['1', 'Pending']]);
      expect(alerts[0]).toContain('Status: ActiveUnderContract');
      expect(alerts[0]).not.toContain('Status: Pending');
    } finally { await sleep(100); f.close(); }
  });
});
