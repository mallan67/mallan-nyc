/// <reference types="jest" />
/**
 * The Property Location card of the Rental Add / Edit form's Unit Info tab, on the REAL page.
 *
 * The card says it is "read-only from Tab 1", and it was not: its street address and unit boxes were never filled (they said "Auto-populated from Tab 1" for ever), its city showed "New York" and its
 * state "New York" whatever the listing held, and its ZIP code was a second box beside the one on the first tab. Nothing kept the two ZIP boxes alike: the building lookup filled the first, the Next
 * check on the Unit Info tab asked for the second (so the agent typed the ZIP code again), and the listing was saved with the first (so a ZIP typed only on the card was lost). The state chosen on the card
 * never reached the saved state. These tests pin the card as one view of the values that are saved.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const box = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLInputElement;
const set = (f: BootedForm, id: string, value: string) => { box(f, id).value = value; };
const pick = (f: BootedForm, id: string) => { const s = f.d.getElementById(id) as HTMLSelectElement; s.value = [...s.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value; };
const typed = (f: BootedForm, id: string, value: string) => { set(f, id, value); box(f, id).dispatchEvent(new f.w.Event('input', { bubbles: true })); };
const chosen = (f: BootedForm, id: string, value: string) => { set(f, id, value); box(f, id).dispatchEvent(new f.w.Event('change', { bubbles: true })); };
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const loaded = (f: BootedForm) => until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);

/** Every box the checks ask for, but the ZIP code: each test says where the ZIP code comes from. */
function fillRequiredButZip(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St'); pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest'); set(f, 'rentalMonthlyRent', '4200'); set(f, 'rentalDateListed', '2026-10-01'); set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01'); set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true; (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  pick(f, 'rentalBedrooms'); pick(f, 'rentalFullBathrooms');
}
async function submit(f: BootedForm) {
  f.w.alert = () => undefined;
  f.w.submitRentalListing();
  await until(() => f.saved.length > 0, 10000);
  return f.saved[0] as Record<string, any>;
}

describe(`${FORM}: the street address and the unit of the card`, () => {
  it('start empty and show what is typed on the first tab', async () => {
    const f = await boot();
    try {
      expect(box(f, 'rentalStreetAddress2').value).toBe('');
      typed(f, 'rentalStreetAddress', '200 East 66th Street');
      typed(f, 'rentalUnitNumber', '15A');
      expect(box(f, 'rentalStreetAddress2').value).toBe('200 East 66th Street');
      expect(box(f, 'rentalUnitNumber2').value).toBe('15A');
      typed(f, 'rentalUnitNumber', '');
      expect(box(f, 'rentalUnitNumber2').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('follow the building lookup, which fills the first tab without an event', async () => {
    const f = await boot();
    try {
      set(f, 'rentalStreetAddress', '1 Lookup Plaza');
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalStreetAddress2').value).toBe('1 Lookup Plaza');
    } finally { await closeAfter(f); }
  });

  it('are read-only, and the address that is saved is the first tab\'s', async () => {
    const f = await boot();
    try {
      expect(box(f, 'rentalStreetAddress2').readOnly).toBe(true);
      expect(box(f, 'rentalUnitNumber2').readOnly).toBe(true);
      fillRequiredButZip(f);
      typed(f, 'rentalZipCode', '10017');
      typed(f, 'rentalUnitNumber', '15A');
      const saved = await submit(f);
      expect(saved.UnitNumber).toBe('15A');
      expect(saved.rentalStreetAddress).toBe('333 E 46th St');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the ZIP code`, () => {
  it('typed on the first tab is on the card, and the Next check on the Unit Info tab passes without asking again', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      set(f, 'rentalCity', 'New York');
      expect(f.w.validateRentalTab(2)).toBe(false);                            // no ZIP code yet
      typed(f, 'rentalZipCode', '10017');
      expect(box(f, 'rentalZip').value).toBe('10017');
      expect(f.w.validateRentalTab(2)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('typed on the card is the first tab\'s, and is the one saved', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      typed(f, 'rentalZip', '10065');
      expect(box(f, 'rentalZipCode').value).toBe('10065');
      const saved = await submit(f);
      expect(saved.PostalCode).toBe('10065');
    } finally { await closeAfter(f); }
  });

  it('filled by the building lookup (no event) is on the card, and is saved', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      set(f, 'rentalZipCode', '10022');
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZip').value).toBe('10022');
      const saved = await submit(f);
      expect(saved.PostalCode).toBe('10022');
    } finally { await closeAfter(f); }
  });

  it('taken back by the lookup\'s undo (no event, no header update): the card does not bring it back, and the next check says it is missing', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      set(f, 'rentalZipCode', '10022');                                         // what the lookup writes
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZip').value).toBe('10022');
      set(f, 'rentalZipCode', '');                                              // what its undo does to the box
      expect(f.w.validateRentalTab(2)).toBe(false);
      expect(box(f, 'rentalZipCode').value).toBe('');
      expect(box(f, 'rentalZip').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('typed on the card and then taken back on the first tab by a lookup is the first tab\'s again', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalZip', '10065');
      expect(box(f, 'rentalZipCode').value).toBe('10065');
      set(f, 'rentalZipCode', '10128');                                         // the lookup writes another
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZip').value).toBe('10128');
    } finally { await closeAfter(f); }
  });

  it('cleared on the first tab is cleared on the card', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalZipCode', '10017');
      expect(box(f, 'rentalZip').value).toBe('10017');
      typed(f, 'rentalZipCode', '');
      expect(box(f, 'rentalZip').value).toBe('');
      expect(box(f, 'rentalZipCode').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('cleared on the first tab is cleared on the card even when the card holds a value that was never copied from it', async () => {
    const f = await boot();
    try {
      set(f, 'rentalZip', '10017');                                             // a value nobody mirrored
      set(f, 'rentalZipCode', '11201');
      typed(f, 'rentalZipCode', '');
      expect(box(f, 'rentalZip').value).toBe('');
      expect(box(f, 'rentalZipCode').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('typed on the card and then taken back on the first tab (an undo, no event): the card follows', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalZip', '10065');
      set(f, 'rentalZipCode', '');
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZip').value).toBe('');
      expect(box(f, 'rentalZipCode').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('held only by the card of an older listing, and then taken back on the first tab (an undo, no event): the card follows', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: { rentalZip: '10017' } } });
    try {
      await loaded(f);
      expect(box(f, 'rentalZipCode').value).toBe('10017');
      set(f, 'rentalZipCode', '');
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZip').value).toBe('');
      expect(box(f, 'rentalZipCode').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('held only by the card (set with no event), taken into the first tab at once, and then taken back there (an undo): the card follows', async () => {
    const f = await boot();
    try {
      set(f, 'rentalZip', '10017');                                             // nobody mirrored it
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZipCode').value).toBe('10017');
      set(f, 'rentalZipCode', '');
      f.w.updateListingHeaderBar('rental');
      expect(box(f, 'rentalZip').value).toBe('');
      expect(box(f, 'rentalZipCode').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('typed on the card with nothing seen to change (a draft saved at once) is the ZIP code that is collected', async () => {
    const f = await boot();
    try {
      set(f, 'rentalZip', '10017');
      expect(f.w.collectRentalFormData().PostalCode).toBe('10017');
      expect(box(f, 'rentalZipCode').value).toBe('10017');
    } finally { await closeAfter(f); }
  });

  it('written on the first tab with nothing seen to change is on the card when the Unit Info tab is shown', async () => {
    const f = await boot();
    try {
      set(f, 'rentalZipCode', '10022');
      set(f, 'rentalStreetAddress', '5 Show Street');
      f.w.showRentalMainTab(2);
      expect(box(f, 'rentalZip').value).toBe('10022');
      expect(box(f, 'rentalStreetAddress2').value).toBe('5 Show Street');
    } finally { await closeAfter(f); }
  });

  it('typed on the first tab, it is gone from the summary in the sidebar at once (the summary is worked out after the card has it)', async () => {
    const f = await boot();
    try {
      const listed = () => [...f.d.querySelectorAll('#rentalValidationSummary li')].map((li) => li.textContent);
      expect(f.w.validateRentalTab(2)).toBe(false);
      expect(listed()).toContain('ZIP Code');
      typed(f, 'rentalZipCode', '10017');
      expect(listed()).not.toContain('ZIP Code');
      expect(listed()).toContain('Bedrooms');
    } finally { await closeAfter(f); }
  });

  it('cleared on the card is cleared on the first tab', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalZip', '10017');
      typed(f, 'rentalZip', '');
      expect(box(f, 'rentalZipCode').value).toBe('');
    } finally { await closeAfter(f); }
  });

  it('both boxes hold the saved ZIP code when a saved listing is opened', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', postal_code: '11201', address: { PostalCode: '11201' }, raw_data: {} } });
    try {
      await loaded(f);
      expect(box(f, 'rentalZipCode').value).toBe('11201');
      expect(box(f, 'rentalZip').value).toBe('11201');
    } finally { await closeAfter(f); }
  });

  it('a listing saved with the ZIP code on the card only (the first tab\'s was empty) shows it in both boxes', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: { rentalZip: '10017' } } });
    try {
      await loaded(f);
      expect(box(f, 'rentalZip').value).toBe('10017');
      expect(box(f, 'rentalZipCode').value).toBe('10017');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the state`, () => {
  it('chosen on the card is the saved state', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      typed(f, 'rentalZipCode', '07030');
      chosen(f, 'rentalState', 'NJ');
      expect(box(f, 'rentalStateOrProvince').value).toBe('NJ');
      const saved = await submit(f);
      expect(saved.StateOrProvince).toBe('NJ');
    } finally { await closeAfter(f); }
  });

  it('starts as New York in the card and in the saved listing', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      typed(f, 'rentalZipCode', '10017');
      expect(box(f, 'rentalState').value).toBe('NY');
      const saved = await submit(f);
      expect(saved.StateOrProvince).toBe('NY');
    } finally { await closeAfter(f); }
  });

  it('a saved listing shows its own state on the card', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', address: { StateOrProvince: 'CT' }, raw_data: {} } });
    try {
      await loaded(f);
      expect(box(f, 'rentalStateOrProvince').value).toBe('CT');
      expect(box(f, 'rentalState').value).toBe('CT');
    } finally { await closeAfter(f); }
  });

  it('a state the card does not list is left alone, in the card and in the saved listing', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', address: { StateOrProvince: 'MA' }, raw_data: {} } });
    try {
      await loaded(f);
      expect(box(f, 'rentalStateOrProvince').value).toBe('MA');
      expect(box(f, 'rentalState').value).toBe('NY');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the city`, () => {
  it('typed on the card is the saved city', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      typed(f, 'rentalZipCode', '11201');
      chosen(f, 'rentalCityDisplay', 'Brooklyn');
      expect(box(f, 'rentalCity').value).toBe('Brooklyn');
      const saved = await submit(f);
      expect(saved.City).toBe('Brooklyn');
    } finally { await closeAfter(f); }
  });

  it('a saved listing shows its own city on the card', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', city: 'Brooklyn', address: { City: 'Brooklyn' }, raw_data: {} } });
    try {
      await loaded(f);
      expect(box(f, 'rentalCity').value).toBe('Brooklyn');
      expect(box(f, 'rentalCityDisplay').value).toBe('Brooklyn');
    } finally { await closeAfter(f); }
  });

  it('emptied on the card, it is missing for the Next check (it was New York for ever behind the empty box)', async () => {
    const f = await boot();
    try {
      fillRequiredButZip(f);
      typed(f, 'rentalZipCode', '10017');
      expect(f.w.validateRentalTab(2)).toBe(true);
      chosen(f, 'rentalCityDisplay', '');
      expect(box(f, 'rentalCity').value).toBe('');
      expect(f.w.validateRentalTab(2)).toBe(false);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a draft put back and a page without the card`, () => {
  it('a browser draft with its own ZIP, city and state shows them on the card', async () => {
    const f = await boot();
    try {
      f.w._restoreRentalControls({ id: '', listing_id: '', raw_data: { rentalStreetAddress: '9 Draft Way', rentalZipCode: '10128', rentalCity: 'New York', rentalStateOrProvince: 'NJ' } });
      expect(box(f, 'rentalZip').value).toBe('10128');
      expect(box(f, 'rentalState').value).toBe('NJ');
      expect(box(f, 'rentalStreetAddress2').value).toBe('9 Draft Way');
    } finally { await closeAfter(f); }
  });

  it('a page without the boxes of the first tab does not fail when the header is refreshed or a tab is shown', async () => {
    const f = await boot();
    try {
      for (const id of ['rentalStreetAddress', 'rentalUnitNumber', 'rentalZipCode', 'rentalCity', 'rentalStateOrProvince']) f.d.getElementById(id)!.remove();
      expect(() => f.w.updateListingHeaderBar('rental')).not.toThrow();
      expect(() => f.w.showRentalMainTab(2)).not.toThrow();
      typed(f, 'rentalZip', '10017');
      chosen(f, 'rentalState', 'NJ');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a page without the card still saves, and does not fail when an address is typed', async () => {
    const f = await boot();
    try {
      for (const id of ['rentalStreetAddress2', 'rentalUnitNumber2', 'rentalCityDisplay', 'rentalState', 'rentalZip']) f.d.getElementById(id)!.remove();
      fillRequiredButZip(f);
      typed(f, 'rentalZipCode', '10017');
      typed(f, 'rentalStreetAddress', '1 Plain Street');
      f.w.validateRentalTab = () => true;                                       // the card's boxes are some of the boxes the check asks for: this is the page without them
      const saved = await submit(f);
      expect(saved.PostalCode).toBe('10017');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
