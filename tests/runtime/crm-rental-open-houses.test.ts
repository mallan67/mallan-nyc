/// <reference types="jest" />
/**
 * The Rental Add / Edit form's Open Houses sub-tab, on the REAL page.
 *
 * "Add Open House" built a card of inputs that had no id and no name: nothing the agent entered was saved (the form sweeps controls by id or name), a saved listing never showed its open
 * houses, and the sub-tab said "Open house information will be syndicated to REBNY RLS and partner sites." The page now uses js/forms/listing-open-houses.js (tested apart in
 * crm-listing-open-houses.test.ts): an open house is a showing of the saved listing. These tests pin the page's side of it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, PAGE_MODULES, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('div.toast-notification')].map((t) => t.textContent ?? '');
const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };
const pick = (f: BootedForm, id: string) => { const s = f.d.getElementById(id) as HTMLSelectElement; s.value = [...s.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value; };
const click = (f: BootedForm, selector: string) => (f.d.querySelector(selector) as HTMLElement).click();
const cards = (f: BootedForm) => [...f.d.querySelectorAll('#rentalOpenHouseList [data-showing-id]')] as HTMLElement[];
const posts = (f: BootedForm) => f.requests.filter((r) => r.method === 'POST' && r.url === '/api/crm/showings');
const fillOpenHouse = (f: BootedForm) => { set(f, 'rentalNewOHDate', '2026-10-11'); set(f, 'rentalNewOHStart', '14:00'); set(f, 'rentalNewOHEnd', '16:30'); set(f, 'rentalNewOHNotes', 'Bring ID'); };
const saved = { id: '77', listing_id: 'RL-1', status: 'Draft', raw_data: {} };
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const loaded = (f: BootedForm) => until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
function fillRequired(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St'); pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest'); set(f, 'rentalMonthlyRent', '4200'); set(f, 'rentalDateListed', '2026-10-01'); set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01'); set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true; (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  set(f, 'rentalCity', 'New York'); pick(f, 'rentalState'); set(f, 'rentalZip', '10017'); pick(f, 'rentalBedrooms'); pick(f, 'rentalFullBathrooms');
}

describe(`${FORM}: the Open Houses sub-tab`, () => {
  it('loads the open house module with the others, before the script of the page itself', () => {
    const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
    const tag = page.indexOf('<script src="js/forms/listing-open-houses.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(page.indexOf('<script src="js/forms/listing-hydration.js"></script>'));
    expect(tag).toBeLessThan(page.indexOf('<script>', tag));
    expect(PAGE_MODULES).toContain('listing-open-houses');
  });

  it('starts with the "none yet" line and a closed form, and no longer says the open houses go to REBNY RLS', async () => {
    const f = await boot();
    try {
      expect(f.d.getElementById('rentalOpenHouseEmpty')!.textContent).toContain('No open houses scheduled yet');
      expect((f.d.getElementById('rentalAddOpenHouseForm') as HTMLElement).style.display).toBe('none');
      const text = (f.d.getElementById('rentalSubTabContent1_4') as HTMLElement).textContent!.replace(/\s+/g, ' ');
      expect(text).not.toMatch(/will be syndicated/i);
      expect(text).toContain('not sent to REBNY RLS from this page');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('every control of the form has an id, so what is typed can be read', async () => {
    const f = await boot();
    try {
      for (const suffix of ['Date', 'Start', 'End', 'Type', 'Notes']) expect([suffix, f.d.getElementById('rentalNewOH' + suffix)]).not.toEqual([suffix, null]);
      expect([...f.d.querySelectorAll('#rentalAddOpenHouseForm input, #rentalAddOpenHouseForm select')].filter((el) => !el.id)).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('Add Open House opens the form, Cancel closes it', async () => {
    const f = await boot();
    try {
      click(f, '[onclick="addRentalOpenHouse()"]');
      expect((f.d.getElementById('rentalAddOpenHouseForm') as HTMLElement).style.display).toBe('block');
      click(f, '[onclick="cancelRentalOpenHouse()"]');
      expect((f.d.getElementById('rentalAddOpenHouseForm') as HTMLElement).style.display).toBe('none');
    } finally { await closeAfter(f); }
  });

  it('on a listing that is not saved, Save says to save the listing first and sends nothing', async () => {
    const f = await boot();
    try {
      fillOpenHouse(f);
      click(f, '[onclick="saveRentalOpenHouse()"]');
      await sleep(100);
      expect(toasts(f).some((t) => /Save the listing first \(as a draft\), then add open houses/.test(t))).toBe(true);
      expect(posts(f)).toEqual([]);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a saved listing`, () => {
  it('Save puts the open house on the listing, shows it as a card, and closes the form', async () => {
    const f = await boot({ search: '?id=RL-1', listing: saved });
    try {
      await loaded(f);
      click(f, '[onclick="addRentalOpenHouse()"]');
      fillOpenHouse(f);
      click(f, '[onclick="saveRentalOpenHouse()"]');
      await until(() => cards(f).length === 1, 10000);
      expect(posts(f)).toHaveLength(1);
      expect(JSON.parse(posts(f)[0].body)).toEqual({ listing_id: 'RL-1', date: '2026-10-11', time: '2:00 PM - 4:30 PM', type: 'openhouse', notes: '[Public] Bring ID' });
      expect(cards(f)[0].getAttribute('data-showing-id')).toBe('S-1');
      expect((f.d.getElementById('rentalAddOpenHouseForm') as HTMLElement).style.display).toBe('none');
      expect(toasts(f).filter((t) => /^\s*Open house saved$/.test(t))).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it('the type list offers Public, Broker Only, By Appointment and Virtual, and Broker Only is saved as an internal showing', async () => {
    const f = await boot({ search: '?id=RL-1', listing: saved });
    try {
      await loaded(f);
      expect([...(f.d.getElementById('rentalNewOHType') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['Public', 'BrokerOnly', 'ByAppointment', 'Virtual']);
      click(f, '[onclick="addRentalOpenHouse()"]');
      fillOpenHouse(f);
      set(f, 'rentalNewOHType', 'BrokerOnly');
      click(f, '[onclick="saveRentalOpenHouse()"]');
      await until(() => cards(f).length === 1, 10000);
      expect(JSON.parse(posts(f)[0].body)).toMatchObject({ type: 'brokersopen', notes: '[BrokerOnly] Bring ID' });
      expect(cards(f)[0].textContent).toContain('(internal)');
      expect(toasts(f).filter((t) => /^\s*Open house saved \(internal/.test(t))).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it('a save the server refuses is said, and the form stays open with what was typed', async () => {
    const f = await boot({ search: '?id=RL-1', listing: saved });
    try {
      await loaded(f);
      f.w.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Invalid date' }) });
      click(f, '[onclick="addRentalOpenHouse()"]');
      fillOpenHouse(f);
      click(f, '[onclick="saveRentalOpenHouse()"]');
      await until(() => toasts(f).some((t) => /Could not save open house: Invalid date/.test(t)), 10000);
      expect(cards(f)).toHaveLength(0);
      expect((f.d.getElementById('rentalAddOpenHouseForm') as HTMLElement).style.display).toBe('block');
      expect((f.d.getElementById('rentalNewOHNotes') as HTMLInputElement).value).toBe('Bring ID');
    } finally { await closeAfter(f); }
  });

  it('shows the open houses it already has when it is opened (and not another listing\'s)', async () => {
    const rows = [
      { id: 'S-1', listing_id: '77', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[ByAppointment] RSVP', listing: { listing_id: 'RL-1' } },
      { id: 'S-2', listing_id: '88', date: '2026-10-12T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'openhouse', status: 'confirmed', notes: '', listing: { listing_id: 'RL-2' } },
      { id: 'S-3', listing_id: '77', date: '2026-10-13T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'brokersopen', status: 'confirmed', notes: '[BrokerOnly] Lockbox', listing: { listing_id: 'RL-1' } },
    ];
    const f = await boot({ search: '?id=RL-1', listing: saved, showings: rows });
    try {
      await until(() => cards(f).length === 2, 30000);
      expect(cards(f).map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1', 'S-3']);
      expect(cards(f)[0].textContent).toContain('By Appt');
      expect(cards(f)[1].textContent).toContain('(internal)');
      expect(f.requests.some((r) => r.method === 'GET' && r.url === '/api/crm/showings?limit=200')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('finds its open houses by the listing id the showing carries, or by the numeric id of the record', async () => {
    const rows = [
      { id: 'S-4', listing_id: '77', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] by the record id' },
      { id: 'S-5', listing_id: 'unrelated', date: '2026-10-12T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] by the listing id', listing: { listing_id: 'RL-1' } },
      { id: 'S-6', listing_id: '78', date: '2026-10-13T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'openhouse', status: 'confirmed', notes: '', listing: { listing_id: 'RL-9' } },
    ];
    const f = await boot({ search: '?id=RL-1', listing: saved, showings: rows });
    try {
      await until(() => cards(f).length === 2, 30000);
      expect(cards(f).map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-4', 'S-5']);
    } finally { await closeAfter(f); }
  });

  it('Remove cancels the showing and takes the card away', async () => {
    const rows = [{ id: 'S-1', listing_id: '77', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] x', listing: { listing_id: 'RL-1' } }];
    const f = await boot({ search: '?id=RL-1', listing: saved, showings: rows });
    try {
      await until(() => cards(f).length === 1, 30000);
      (cards(f)[0].querySelector('button') as HTMLElement).click();
      await until(() => cards(f).length === 0, 10000);
      const patch = f.requests.find((r) => r.method === 'PATCH' && r.url === '/api/crm/showings/S-1')!;
      expect(JSON.parse(patch.body)).toEqual({ status: 'cancelled' });
      expect(f.d.getElementById('rentalOpenHouseEmpty')).not.toBeNull();
      expect(toasts(f).filter((t) => /^\s*Open house removed$/.test(t))).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it('a listing that was just saved by the form takes open houses at once', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 10000);
      await sleep(600);
      fillOpenHouse(f);
      click(f, '[onclick="saveRentalOpenHouse()"]');
      await until(() => posts(f).length === 1, 10000);
      expect(JSON.parse(posts(f)[0].body).listing_id).toBe('L-1');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a page that could not load the open house module`, () => {
  const without = PAGE_MODULES.filter((m) => m !== 'listing-open-houses');

  it('still boots, and the buttons say the manager did not load', async () => {
    const f = await boot({ modules: without });
    try {
      expect(f.errors).toEqual([]);
      click(f, '[onclick="addRentalOpenHouse()"]');
      expect(toasts(f).filter((t) => /open house manager did not load/.test(t))).toHaveLength(1);
      click(f, '[onclick="saveRentalOpenHouse()"]');
      expect(toasts(f).filter((t) => /open house manager did not load/.test(t))).toHaveLength(2);
      click(f, '[onclick="cancelRentalOpenHouse()"]');                               // Cancel needs nothing to close
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('opens a saved listing without it', async () => {
    const f = await boot({ modules: without, search: '?id=RL-1', listing: saved });
    try {
      await loaded(f);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
