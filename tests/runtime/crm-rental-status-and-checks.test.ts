/// <reference types="jest" />
/**
 * Three things the Rental Add / Edit form said and did not do, on the REAL page.
 *
 *  - The badge in the header said DRAFT for every rental: nothing ever changed it (the Sale form's badge follows its status; the Rental form's validateStatusChange was an empty stub).
 *  - The "Required" switch in the sidebar did nothing (toggleRentalRequiredFields was an empty stub; the Sale form's switch marks the required boxes).
 *  - The sidebar summary said "All fields OK" whatever the form held, and kept saying it after the page had refused a Next because fields were missing.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };
const pick = (f: BootedForm, id: string) => { const s = f.d.getElementById(id) as HTMLSelectElement; s.value = [...s.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value; };
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('div.toast-notification')].map((t) => t.textContent ?? '');
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const badge = (f: BootedForm) => f.d.getElementById('rentalDraftBadge') as HTMLElement;
const badgeText = (f: BootedForm) => badge(f).textContent!.replace(/\s+/g, ' ').trim();
const choose = (f: BootedForm, step: string) => {
  const select = f.d.getElementById('rentalStatus') as HTMLSelectElement;
  select.value = step;
  select.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};
function fillRequired(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St'); pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest'); set(f, 'rentalMonthlyRent', '4200'); set(f, 'rentalDateListed', '2026-10-01'); set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01'); set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true; (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  set(f, 'rentalCity', 'New York'); pick(f, 'rentalState'); set(f, 'rentalZip', '10017'); pick(f, 'rentalBedrooms'); pick(f, 'rentalFullBathrooms');
}

// [step, the text of its option, colour]
const STEPS: [string, string, 'yellow' | 'green' | 'blue'][] = [
  ['Draft', 'DRAFT', 'yellow'], ['Future', 'FUTURE', 'yellow'], ['Incomplete', 'INCOMPLETE', 'yellow'],
  ['Active', 'ACTIVE', 'green'], ['BackOnMarket', 'BACK ON MARKET', 'green'],
  ['AppOut', 'APPLICATION OUT', 'blue'], ['AppThruUs', 'APPLICATION THRU US', 'blue'], ['AppAccepted', 'APPLICATION ACCEPTED', 'blue'], ['AppAcceptedThruUs', 'APPLICATION ACCEPTED THRU US', 'blue'],
  ['LeaseOut', 'LEASE OUT', 'blue'], ['LeaseOutThruUs', 'LEASE OUT THRU US', 'blue'], ['LeaseSigned', 'LEASE SIGNED', 'blue'], ['LeaseSignedThruUs', 'LEASE SIGNED THRU US', 'blue'], ['BoardApproved', 'BOARD APPROVED', 'blue'],
  ['Rented', 'RENTED', 'blue'], ['RentedThruUs', 'RENTED THRU US', 'blue'], ['Withdrawn', 'WITHDRAWN', 'blue'], ['Cancelled', 'CANCELLED', 'blue'], ['PermOffMarket', 'PERM OFF MARKET', 'blue'],
  ['TempOffMarket', 'TEMP OFF MARKET', 'blue'], ['Expired', 'EXPIRED', 'blue'], ['Pending', 'PENDING', 'blue'], ['Closed', 'CLOSED', 'blue'], ['Canceled', 'CANCELED', 'blue'], ['Hold', 'HOLD', 'blue'],
];
const COLOUR = { yellow: ['bg-yellow-100', 'text-yellow-800', 'border-yellow-300'], green: ['bg-green-100', 'text-green-800', 'border-green-300'], blue: ['bg-blue-100', 'text-blue-800', 'border-blue-300'] };

describe(`${FORM}: the badge in the header`, () => {
  it('says DRAFT for a new rental', async () => {
    const f = await boot();
    try {
      expect(badgeText(f)).toBe('DRAFT');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it.each(STEPS)('follows the status list: %s is %s (%s)', async (step, text, colour) => {
    const f = await boot();
    try {
      choose(f, step);
      expect(badgeText(f)).toBe(text);
      for (const c of COLOUR[colour]) expect([step, badge(f).classList.contains(c)]).toEqual([step, true]);
      for (const other of (['yellow', 'green', 'blue'] as const).filter((x) => x !== colour)) {
        expect([step, COLOUR[other].some((c) => badge(f).classList.contains(c))]).toEqual([step, false]);
      }
    } finally { await closeAfter(f); }
  });

  it('has the file icon of a draft, the broadcast tower of a live listing, and the contract of the rest', async () => {
    const f = await boot();
    try {
      const icon = () => badge(f).querySelector('i')!.className;
      expect(icon()).toContain('fa-file-alt');
      choose(f, 'Active');
      expect(icon()).toContain('fa-broadcast-tower');
      choose(f, 'LeaseSigned');
      expect(icon()).toContain('fa-file-contract');
      choose(f, 'Future');
      expect(icon()).toContain('fa-file-alt');
    } finally { await closeAfter(f); }
  });

  it('is its own text each time (nothing piles up)', async () => {
    const f = await boot();
    try {
      choose(f, 'Active'); choose(f, 'Rented'); choose(f, 'Draft');
      expect(badge(f).querySelectorAll('i')).toHaveLength(1);
      expect(badgeText(f)).toBe('DRAFT');
    } finally { await closeAfter(f); }
  });

  it('says no status was chosen when the list holds none', async () => {
    const f = await boot();
    try {
      (f.d.getElementById('rentalStatus') as HTMLSelectElement).selectedIndex = -1;
      f.w.validateStatusChange('rental');
      expect(badgeText(f)).toBe('NO STATUS CHOSEN');
      expect(badge(f).classList.contains('bg-yellow-100')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('an option with no words shows its value', async () => {
    const f = await boot();
    try {
      const list = f.d.getElementById('rentalStatus') as HTMLSelectElement;
      const option = f.d.createElement('option');
      option.value = 'Zeta';
      list.appendChild(option);
      choose(f, 'Zeta');
      expect(badgeText(f)).toBe('ZETA');
      expect(badge(f).classList.contains('bg-blue-100')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('a page without the badge, or without the status list, does not fail (and keeps what it shows)', async () => {
    const f = await boot();
    try {
      const list = f.d.getElementById('rentalStatus')!;
      list.remove();
      expect(() => f.w.validateStatusChange('rental')).not.toThrow();
      expect(badgeText(f)).toBe('DRAFT');
      f.d.body.appendChild(list);
      badge(f).remove();
      expect(() => f.w.validateStatusChange('rental')).not.toThrow();
    } finally { await closeAfter(f); }
  });

  it('shows the status of a saved listing when it is opened', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Active', raw_data: {} } });
    try {
      await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
      expect(badgeText(f)).toBe('ACTIVE');
      expect(badge(f).classList.contains('bg-green-100')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('shows the step the agent saved when the record is in the same family (a lease that is signed)', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Pending', raw_data: { rentalStatus: 'LeaseSigned' } } });
    try {
      await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
      expect(badgeText(f)).toBe('LEASE SIGNED');
    } finally { await closeAfter(f); }
  });

  it('shows a saved browser draft\'s status when the draft is put back', async () => {
    const f = await boot();
    try {
      choose(f, 'Active');
      f.w.saveRentalDraft();
      choose(f, 'Draft');
      expect(badgeText(f)).toBe('DRAFT');
      f.w.loadRentalDraft();
      expect(badgeText(f)).toBe('ACTIVE');
    } finally { await closeAfter(f); }
  });

  it('says the status the server has once a save has moved the listing', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      choose(f, 'Active');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect(badgeText(f)).toBe('ACTIVE');
    } finally { await closeAfter(f); }
  });

  it('is put back in line with the server when the server refused the change: the list and the badge say Draft', async () => {
    const f = await boot({ statusError: 'Invalid status transition: Draft → Pending' });
    try {
      fillRequired(f);
      choose(f, 'LeaseSigned');
      expect(badgeText(f)).toBe('LEASE SIGNED');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('Draft');
      expect(badgeText(f)).toBe('DRAFT');
      expect(toasts(f).some((t) => /The status change failed/.test(t))).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('keeps the step the agent chose when it is in the family the server has (Future for a Draft)', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      choose(f, 'Future');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('Future');
      expect(badgeText(f)).toBe('FUTURE');
    } finally { await closeAfter(f); }
  });

  it('keeps the step when the server\'s status has no single step (Pending covers several)', async () => {
    const f = await boot({ statusAnswer: { status: 'Pending' } });
    try {
      fillRequired(f);
      choose(f, 'LeaseSigned');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('LeaseSigned');
      expect(badgeText(f)).toBe('LEASE SIGNED');
    } finally { await closeAfter(f); }
  });

  it('is left alone when the server\'s status is one the form has no step for', async () => {
    const f = await boot({ statusAnswer: { status: 'ActiveUnderContract' } });
    try {
      fillRequired(f);
      choose(f, 'AppOut');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('AppOut');
    } finally { await closeAfter(f); }
  });

  it('is left alone when the server answers a status the form does not know at all', async () => {
    const f = await boot({ statusAnswer: { status: 'Zeta' } });
    try {
      fillRequired(f);
      choose(f, 'Active');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('Active');
      expect(badgeText(f)).toBe('ACTIVE');
    } finally { await closeAfter(f); }
  });

  it('is emptied for the agent to choose when the server holds a Pending listing and the list says another family (Pending has several steps)', async () => {
    const f = await boot({
      search: '?id=1', statusError: 'Invalid status transition: Pending → Active',
      listing: { id: '1', listing_id: 'RL-1', status: 'Pending', raw_data: { rentalStatus: 'LeaseSigned' } },
    });
    try {
      await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
      expect(badgeText(f)).toBe('LEASE SIGNED');
      fillRequired(f);
      choose(f, 'Active');
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('');
      expect(badgeText(f)).toBe('NO STATUS CHOSEN');
      expect(toasts(f).some((t) => /The status change failed/.test(t))).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('puts the fields of the step back as well: the rented date and price go away when the listing stayed a Draft', async () => {
    const f = await boot({ statusError: 'Invalid status transition: Draft → Rented' });
    try {
      fillRequired(f);
      const shown = (id: string) => (f.d.getElementById(id) as HTMLElement).style.display;
      choose(f, 'Rented');
      expect([shown('rentalRentedDateField'), shown('rentalRentedPriceField')]).toEqual(['', '']);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.statusCalls.length > 0, 10000);
      await sleep(500);
      expect((f.d.getElementById('rentalStatus') as HTMLSelectElement).value).toBe('Draft');
      expect([shown('rentalRentedDateField'), shown('rentalRentedPriceField')]).toEqual(['none', 'none']);
    } finally { await closeAfter(f); }
  });

  it('a page without the status list still saves, and does not fail when the server answers', async () => {
    const f = await boot({ statusAnswer: { status: 'Active' } });
    try {
      fillRequired(f);
      f.d.getElementById('rentalStatus')!.remove();
      f.w.validateRentalTab = () => true;                           // the list is one of the boxes the check asks for: this is the page without it
      const alerts: string[] = [];
      f.w.alert = (message: unknown) => { alerts.push(String(message)); };
      f.w.submitRentalListing();
      await until(() => alerts.length > 0, 10000);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatch(/^SUCCESS! Your rental listing has been submitted/);
      expect(f.saved).toHaveLength(1);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the Required switch`, () => {
  const required = (f: BootedForm) => [...f.d.querySelectorAll('[required]')] as HTMLElement[];
  const marked = (el: HTMLElement) => ['ring-2', 'ring-red-300', 'bg-red-50'].every((c) => el.classList.contains(c));
  const unmarked = (el: HTMLElement) => ['ring-2', 'ring-red-300', 'bg-red-50'].every((c) => !el.classList.contains(c));
  const toggle = (f: BootedForm) => f.d.getElementById('rentalShowRequiredOnly') as HTMLInputElement;
  const flip = (f: BootedForm) => { toggle(f).checked = !toggle(f).checked; toggle(f).dispatchEvent(new f.w.Event('change', { bubbles: true })); };

  it('marks every required box when it is on, and takes the marks away when it is off', async () => {
    const f = await boot();
    try {
      expect(required(f).length).toBeGreaterThan(0);
      expect(required(f).every(unmarked)).toBe(true);
      flip(f);
      expect(required(f).every(marked)).toBe(true);
      flip(f);
      expect(required(f).every(unmarked)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('marks only the required boxes', async () => {
    const f = await boot();
    try {
      flip(f);
      const others = [...f.d.querySelectorAll('input:not([required]), select:not([required]), textarea:not([required])')] as HTMLElement[];
      expect(others.some((el) => el.classList.contains('ring-red-300'))).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('the word "All" next to the switch flips it', async () => {
    const f = await boot();
    try {
      const word = toggle(f).closest('div')!.querySelector('span.cursor-pointer') as HTMLElement;
      word.click();
      expect(toggle(f).checked).toBe(true);
      expect(required(f).every(marked)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('is a page function the switch calls', async () => {
    const f = await boot();
    try {
      expect(toggle(f).getAttribute('onchange')).toBe('toggleRentalRequiredFields()');
      toggle(f).checked = true;
      f.w.toggleRentalRequiredFields();
      expect(required(f).every(marked)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('a page without the switch marks nothing and does not fail', async () => {
    const f = await boot();
    try {
      toggle(f).closest('div.border-t')!.remove();
      f.w.toggleRentalRequiredFields();
      expect(required(f).every(unmarked)).toBe(true);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the summary in the sidebar`, () => {
  const summary = (f: BootedForm) => f.d.getElementById('rentalValidationSummary') as HTMLElement;
  const text = (f: BootedForm) => summary(f).textContent!.replace(/\s+/g, ' ').trim();
  const groups = (f: BootedForm) => [...summary(f).querySelectorAll('div.mb-2')].map((g) => [g.querySelector('p')!.textContent, [...g.querySelectorAll('li')].map((li) => li.textContent)]);

  it('does not say the fields are fine before anything was checked', async () => {
    const f = await boot();
    try {
      expect(text(f)).not.toMatch(/OK|complete/i);
      expect(text(f)).toBe('Required fields are checked when you press Next or Submit.');
    } finally { await closeAfter(f); }
  });

  it('lists what is missing, by tab, once a Next has been refused', async () => {
    const f = await boot();
    try {
      expect(f.w.validateRentalTab(1)).toBe(false);
      const shown = groups(f);
      expect(shown.map(([name]) => name)).toEqual(['Listing Info:', 'Unit Info:']);
      // Property Type (Rental Building is pre-selected) and Listing Status (Draft is pre-selected) have answers on a new form, so they are not missing
      expect(shown[0][1]).toEqual(['Street Address', 'Borough', 'Ownership Type', 'Monthly Rent', 'Date Listed', 'Available Date', 'Exclusive Start Date', 'Listing Description',
        'Fair Housing Acknowledgment', 'Commission Negotiability Disclosure']);
      // City (a hidden box that holds New York) and State (New York) are pre-filled; Bedrooms and Full Bathrooms start on "Custom", which is no answer
      expect(shown[1][1]).toEqual(['ZIP Code', 'Bedrooms', 'Full Bathrooms']);
      expect(text(f)).not.toMatch(/OK|complete/i);
    } finally { await closeAfter(f); }
  });

  it('keeps up with the form after that: what is filled in goes off the list, and the last one says all is complete', async () => {
    const f = await boot();
    try {
      f.w.validateRentalTab(1);
      const before = groups(f)[0][1] as string[];
      set(f, 'rentalStreetAddress', '333 E 46th St');
      f.d.getElementById('rentalStreetAddress')!.dispatchEvent(new f.w.Event('input', { bubbles: true }));
      const after = groups(f)[0][1] as string[];
      expect(before).toContain('Street Address');
      expect(after).not.toContain('Street Address');
      expect(after).toHaveLength(before.length - 1);
      fillRequired(f);
      f.d.getElementById('rentalStreetAddress')!.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect(text(f)).toBe('All required fields complete');
      expect(groups(f)).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a field that is emptied again comes back on the list', async () => {
    const f = await boot();
    try {
      expect(f.w.validateRentalTab(1)).toBe(false);                                                  // a refused Next switches the list on
      fillRequired(f);
      f.d.getElementById('rentalStreetAddress')!.dispatchEvent(new f.w.Event('input', { bubbles: true }));
      expect(text(f)).toBe('All required fields complete');
      set(f, 'rentalCity', '');
      f.d.getElementById('rentalCity')!.dispatchEvent(new f.w.Event('input', { bubbles: true }));
      expect(groups(f)).toEqual([['Unit Info:', ['City']]]);
    } finally { await closeAfter(f); }
  });

  it('a refused Submit shows the list too', async () => {
    const f = await boot();
    try {
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await sleep(100);
      expect(groups(f).length).toBeGreaterThan(0);
      expect(f.saved).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a form that passes its checks says nothing is missing', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      for (const t of [1, 2, 3, 4]) expect(f.w.validateRentalTab(t)).toBe(true);
      expect(text(f)).toBe('Required fields are checked when you press Next or Submit.');         // nothing was refused: nothing to list
    } finally { await closeAfter(f); }
  });

  it('writes the names as text, never as markup', async () => {
    const f = await boot();
    try {
      f.w.validateRentalTab(1);
      expect(summary(f).querySelectorAll('li > *')).toHaveLength(0);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('writes a name that carries markup as text', async () => {
    const f = await boot();
    try {
      f.w.eval("RENTAL_REQUIRED_FIELDS[1][0].label = '<img src=x>'");
      f.w.validateRentalTab(1);
      expect(summary(f).querySelectorAll('img')).toHaveLength(0);
      expect((groups(f)[0][1] as string[])[0]).toBe('<img src=x>');
    } finally { await closeAfter(f); }
  });

  it('a box of blanks is not an answer', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      set(f, 'rentalStreetAddress', '   ');
      expect(f.w.validateRentalTab(1)).toBe(false);
      expect(groups(f)).toEqual([['Listing Info:', ['Street Address']]]);
    } finally { await closeAfter(f); }
  });

  it('a page without the summary does not fail when a Next is refused', async () => {
    const f = await boot();
    try {
      summary(f).remove();
      expect(f.w.validateRentalTab(1)).toBe(false);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: Bedrooms and Full Bathrooms start on "Custom", which is no answer`, () => {
  const BEDROOMS = ['Apartment', '1', '2', '3', '4', '5', '6+'];                     // the Bedrooms list after "Custom": Studio (Apartment), then the numbers
  const BATHS = ['1', '2', '3', '4', '5+'];
  const select = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLSelectElement;
  const missing = (f: BootedForm) => [...f.d.querySelectorAll('#rentalMissingFieldsList li')].map((li) => li.textContent);
  const answer = (f: BootedForm, bedrooms: string, baths: string) => { select(f, 'rentalBedrooms').value = bedrooms; select(f, 'rentalFullBathrooms').value = baths; };

  it('a new form starts on Custom for both, and the lists are as this test expects', async () => {
    const f = await boot();
    try {
      expect(select(f, 'rentalBedrooms').value).toBe('custom');
      expect(select(f, 'rentalFullBathrooms').value).toBe('custom');
      expect([...select(f, 'rentalBedrooms').options].map((o) => o.value).filter((v) => v !== 'custom')).toEqual(BEDROOMS);
      expect([...select(f, 'rentalFullBathrooms').options].map((o) => o.value).filter((v) => v !== 'custom')).toEqual(BATHS);
    } finally { await closeAfter(f); }
  });

  it('with the rest filled in, Unit Info is refused until both have an answer', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      answer(f, 'custom', 'custom');
      expect(f.w.validateRentalTab(2)).toBe(false);
      expect(missing(f)).toEqual(['Bedrooms', 'Full Bathrooms']);
      answer(f, '2', 'custom');
      expect(f.w.validateRentalTab(2)).toBe(false);
      expect(missing(f)).toEqual(['Full Bathrooms']);
      answer(f, 'custom', '1');
      expect(f.w.validateRentalTab(2)).toBe(false);
      expect(missing(f)).toEqual(['Bedrooms']);
      answer(f, '2', '1');
      expect(f.w.validateRentalTab(2)).toBe(true);
      expect(missing(f)).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it.each(BEDROOMS)('%s is an answer for Bedrooms (a studio is one: it is the Studio entry of the list)', async (value) => {
    const f = await boot();
    try {
      fillRequired(f);
      answer(f, value, '1');
      expect(f.w.validateRentalTab(2)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it.each(BATHS)('%s is an answer for Full Bathrooms', async (value) => {
    const f = await boot();
    try {
      fillRequired(f);
      answer(f, '1', value);
      expect(f.w.validateRentalTab(2)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('the box turns red while it has no answer and goes back to normal when it has one', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      answer(f, 'custom', 'custom');
      f.w.validateRentalTab(2);
      expect(select(f, 'rentalBedrooms').style.borderColor).not.toBe('');
      expect(select(f, 'rentalFullBathrooms').style.borderColor).not.toBe('');
      answer(f, '3', '2');
      f.w.validateRentalTab(2);
      expect(select(f, 'rentalBedrooms').style.borderColor).toBe('');
      expect(select(f, 'rentalFullBathrooms').style.borderColor).toBe('');
    } finally { await closeAfter(f); }
  });

  it('a Submit with Custom for either is refused and sends nothing; with real answers it is sent', async () => {
    const f = await boot();
    try {
      f.w.alert = () => undefined;
      fillRequired(f);
      answer(f, 'custom', '1');
      f.w.submitRentalListing();
      await sleep(100);
      expect(f.saved).toEqual([]);
      expect(toasts(f).some((t) => /Please fix validation errors before submitting/.test(t))).toBe(true);
      answer(f, '1', 'custom');
      f.w.submitRentalListing();
      await sleep(100);
      expect(f.saved).toEqual([]);
      answer(f, '1', '1');
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 8000);
      expect(f.saved).toHaveLength(1);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a refused Next scrolls to the first box that is missing`, () => {
  // what the page scrolled to: the id of a box, the name of a group of radio buttons (they have no id)
  const watch = (f: BootedForm) => {
    const seen: string[] = [];
    f.w.Element.prototype.scrollIntoView = function (this: Element) { seen.push((this as HTMLElement).id || (this as HTMLInputElement).name); };
    return seen;
  };

  it('the first one of the tab, then the next one once that is filled in', async () => {
    const f = await boot();
    try {
      const seen = watch(f);
      f.w.validateRentalTab(1);
      set(f, 'rentalStreetAddress', '333 E 46th St');
      f.w.validateRentalTab(1);
      pick(f, 'rentalBorough');
      f.w.validateRentalTab(1);
      expect(seen).toEqual(['rentalStreetAddress', 'rentalBorough', 'rentalCommonInterest']);
    } finally { await closeAfter(f); }
  });

  it('a group of radio buttons is scrolled to by its first button', async () => {
    const f = await boot();
    try {
      const seen = watch(f);
      set(f, 'rentalStreetAddress', '333 E 46th St'); pick(f, 'rentalBorough');
      (f.d.querySelector('input[name="rentalPropertyType"]:checked') as HTMLInputElement).checked = false;
      f.w.validateRentalTab(1);
      expect(seen).toEqual(['rentalPropertyType']);
    } finally { await closeAfter(f); }
  });

  it('a box that is not ticked is scrolled to as well (the Fair Housing acknowledgment, when everything before it is filled in)', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = false;
      const seen = watch(f);
      f.w.validateRentalTab(1);
      expect(seen).toEqual(['rentalFairHousingAck']);
    } finally { await closeAfter(f); }
  });

  it('nothing is scrolled to when nothing is missing', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      const seen = watch(f);
      expect(f.w.validateRentalTab(1)).toBe(true);
      expect(seen).toEqual([]);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a box that a refused Next marked red goes back to normal once it has an answer`, () => {
  const box = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLInputElement;
  const marked = (f: BootedForm, id: string) => box(f, id).style.borderColor !== '' && box(f, id).style.boxShadow !== '';
  const plain = (f: BootedForm, id: string) => box(f, id).style.borderColor === '' && box(f, id).style.boxShadow === '';
  const typed = (f: BootedForm, id: string, value: string) => { set(f, id, value); box(f, id).dispatchEvent(new f.w.Event('input', { bubbles: true })); };
  const chosen = (f: BootedForm, id: string, value: string) => { set(f, id, value); box(f, id).dispatchEvent(new f.w.Event('change', { bubbles: true })); };

  it('a text box, as soon as something is typed in it; the others stay marked', async () => {
    const f = await boot();
    try {
      expect(f.w.validateRentalTab(1)).toBe(false);
      expect(marked(f, 'rentalStreetAddress')).toBe(true);
      expect(marked(f, 'rentalBorough')).toBe(true);
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      expect(plain(f, 'rentalStreetAddress')).toBe(true);
      expect(marked(f, 'rentalBorough')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('a list, as soon as a real entry is chosen: "Custom" does not unmark it, and a box of blanks does not either', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      set(f, 'rentalStreetAddress', '   ');
      set(f, 'rentalBedrooms', 'custom');
      set(f, 'rentalFullBathrooms', 'custom');
      expect(f.w.validateRentalTab(1)).toBe(false);
      expect(f.w.validateRentalTab(2)).toBe(false);
      chosen(f, 'rentalBedrooms', 'custom');
      typed(f, 'rentalStreetAddress', '   ');
      expect(marked(f, 'rentalBedrooms')).toBe(true);
      expect(marked(f, 'rentalStreetAddress')).toBe(true);
      chosen(f, 'rentalBedrooms', '2');
      expect(plain(f, 'rentalBedrooms')).toBe(true);
      expect(marked(f, 'rentalFullBathrooms')).toBe(true);
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      expect(plain(f, 'rentalStreetAddress')).toBe(true);
      chosen(f, 'rentalFullBathrooms', '1');
      expect(plain(f, 'rentalFullBathrooms')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('typing marks nothing by itself: a box is red only after a check refused it', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalMonthlyRent', '');
      chosen(f, 'rentalBorough', '');
      expect(plain(f, 'rentalBorough')).toBe(true);
      expect(plain(f, 'rentalMonthlyRent')).toBe(true);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
