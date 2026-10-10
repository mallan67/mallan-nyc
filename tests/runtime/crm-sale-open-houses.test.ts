/// <reference types="jest" />
/**
 * The Sale Add / Edit form's Open Houses sub-tab, on the REAL page.
 *
 * The Sale form kept its own copy of the open-house code (the Rental form's moved onto js/forms/listing-open-houses.js, which is tested apart in crm-listing-open-houses.test.ts). The copy
 *  - asked GET /api/crm/showings?limit=200 and picked the listing's open houses out of the first page: the route answers the OLDEST showings first and only 200 at a time (and only the agent's
 *    own, unless the reader is a broker), so a listing whose open houses came after the 200th showing was shown "none yet" and could not have them cancelled;
 *  - saved an open house that ended before it began ("2:00 PM - 1:00 PM" is what the public feed prints);
 *  - built its cards from strings of markup, and carried the showing's id into an onclick attribute.
 * The page now uses the module, the way the Rental page does. These tests pin the page's side of it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, PAGE_MODULES, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'SALE-FORM-REDESIGN';
// the page's own toasts (its alert() is a toast too)
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('body > div[style*="99999"]')].map((t) => t.textContent ?? '');
const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };
const click = (f: BootedForm, selector: string) => (f.d.querySelector(selector) as HTMLElement).click();
const cards = (f: BootedForm) => [...f.d.querySelectorAll('#saleOpenHouseList [data-showing-id]')] as HTMLElement[];
const posts = (f: BootedForm) => f.requests.filter((r) => r.method === 'POST' && r.url === '/api/crm/showings');
const form = (f: BootedForm) => f.d.getElementById('saleAddOpenHouseForm') as HTMLElement;
const fillOpenHouse = (f: BootedForm, o: { start?: string; end?: string } = {}) => { set(f, 'saleNewOHDate', '2026-10-11'); set(f, 'saleNewOHStart', o.start ?? '14:00'); set(f, 'saleNewOHEnd', o.end ?? '16:30'); set(f, 'saleNewOHNotes', 'Bring ID'); };
const SAVED = { id: '9', listing_id: 'SL-9', status: 'Draft', address: {}, features: {}, agent_info: {}, media: [], raw_data: {} };
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const loaded = (f: BootedForm) => until(() => f.w.eval('_saleEditLoad') === 'loaded', 40000);
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const choose = (f: BootedForm, step: string) => {
  const select = f.d.getElementById('saleStatus') as HTMLSelectElement;
  if (![...select.options].some((o) => o.value === step)) {
    const option = f.d.createElement('option');
    option.value = step; option.textContent = step;
    select.appendChild(option);
  }
  select.value = step;
};

describe(`${FORM}: the Open Houses sub-tab`, () => {
  it('loads the open house module with the others, before the script of the page itself, and the Save button is the one the module turns off while it sends', () => {
    const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
    const tag = page.indexOf('<script src="js/forms/listing-open-houses.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(page.indexOf('<script src="js/forms/listing-hydration.js"></script>'));
    expect(tag).toBeLessThan(page.indexOf('<script>', tag));
    expect(PAGE_MODULES).toContain('listing-open-houses');
    expect(page).toMatch(/<button type="button" onclick="saveSaleOpenHouse\(\)" data-oh-save /);
  });

  it('no longer carries a copy of the open-house code of its own', () => {
    const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
    for (const gone of ['_renderSaleOpenHouseCard', '_ohShowingType', '_ohTime12h', 'loadSaleOpenHouses', 'removeSaleOpenHouse', 'openHouseCount']) expect([gone, page.includes(gone)]).toEqual([gone, false]);
    expect(page).not.toMatch(/fetch\(\s*['"`]\/api\/crm\/showings/);                           // the page asks the route through the module, a type and a page at a time
  });

  it('starts with the "none yet" line and a closed form', async () => {
    const f = await boot();
    try {
      expect(f.d.getElementById('saleOpenHouseEmpty')!.textContent).toContain('No open houses scheduled yet');
      expect(form(f).style.display).toBe('none');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('every control of the form has an id, so what is typed can be read', async () => {
    const f = await boot();
    try {
      for (const suffix of ['Date', 'Start', 'End', 'Type', 'Notes']) expect([suffix, f.d.getElementById('saleNewOH' + suffix)]).not.toEqual([suffix, null]);
      expect([...f.d.querySelectorAll('#saleAddOpenHouseForm input, #saleAddOpenHouseForm select')].filter((el) => !el.id)).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('Add Open House opens the form, Cancel closes it', async () => {
    const f = await boot();
    try {
      click(f, '[onclick="addSaleOpenHouse()"]');
      expect(form(f).style.display).toBe('block');
      click(f, '[onclick="cancelSaleOpenHouse()"]');
      expect(form(f).style.display).toBe('none');
    } finally { await closeAfter(f); }
  });

  it('on a listing that is not saved, Save says to save the listing first (as a draft) and sends nothing', async () => {
    const f = await boot();
    try {
      fillOpenHouse(f);
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await sleep(100);
      expect(toasts(f).some((t) => /Save the listing first \(as a draft\), then add open houses/.test(t))).toBe(true);
      expect(posts(f)).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('asks for the date and both times', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      fillOpenHouse(f);
      set(f, 'saleNewOHEnd', '');
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await sleep(100);
      expect(toasts(f).some((t) => /Please fill in Date, Start Time, and End Time/.test(t))).toBe(true);
      expect(posts(f)).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('while the listing is Coming Soon (UCBA Art. I Sec. 16: no showings until it is activated) an open house is not scheduled', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      choose(f, 'ComingSoon');
      fillOpenHouse(f);
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await sleep(100);
      expect(toasts(f).some((t) => /Open houses cannot be scheduled while the listing is in Coming Soon status/.test(t))).toBe(true);
      expect(posts(f)).toEqual([]);
      choose(f, 'Active');
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await until(() => posts(f).length === 1, 10000);
    } finally { await closeAfter(f); }
  });

  it.each([['13:00', '14:00'], ['14:00', '14:00']])('an end of %s with a start of %s is refused, with the reason, and nothing is sent', async (end, start) => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      click(f, '[onclick="addSaleOpenHouse()"]');
      fillOpenHouse(f, { start, end });
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await sleep(100);
      expect(toasts(f).some((t) => /The end time must be after the start time/.test(t))).toBe(true);
      expect(posts(f)).toEqual([]);
      expect(form(f).style.display).toBe('block');
      expect((f.d.getElementById('saleNewOHEnd') as HTMLInputElement).value).toBe(end);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a saved listing`, () => {
  it('Save puts the open house on the listing, shows it as a card, and closes the form', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      click(f, '[onclick="addSaleOpenHouse()"]');
      fillOpenHouse(f);
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await until(() => cards(f).length === 1, 10000);
      expect(posts(f)).toHaveLength(1);
      expect(JSON.parse(posts(f)[0].body)).toEqual({ listing_id: 'SL-9', date: '2026-10-11', time: '2:00 PM - 4:30 PM', type: 'openhouse', notes: '[Public] Bring ID' });
      expect(cards(f)[0].getAttribute('data-showing-id')).toBe('S-1');
      expect(form(f).style.display).toBe('none');
      expect(toasts(f).filter((t) => /Open house saved$/.test(t))).toHaveLength(1);
      expect(['Date', 'Start', 'End', 'Notes'].map((s) => (f.d.getElementById('saleNewOH' + s) as HTMLInputElement).value)).toEqual(['', '', '', '']);
    } finally { await closeAfter(f); }
  });

  it('the type list offers Public, Broker Only, By Appointment and Virtual, and Broker Only is saved as an internal showing', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      expect([...(f.d.getElementById('saleNewOHType') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['Public', 'BrokerOnly', 'ByAppointment', 'Virtual']);
      click(f, '[onclick="addSaleOpenHouse()"]');
      fillOpenHouse(f);
      set(f, 'saleNewOHType', 'BrokerOnly');
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await until(() => cards(f).length === 1, 10000);
      expect(JSON.parse(posts(f)[0].body)).toMatchObject({ type: 'brokersopen', notes: '[BrokerOnly] Bring ID' });
      expect(cards(f)[0].textContent).toContain('(internal)');
      expect(toasts(f).filter((t) => /Open house saved \(internal/.test(t))).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it('a save the server refuses is said, and the form stays open with what was typed', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      f.w.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Invalid date' }) });
      click(f, '[onclick="addSaleOpenHouse()"]');
      fillOpenHouse(f);
      click(f, '[onclick="saveSaleOpenHouse()"]');
      await until(() => toasts(f).some((t) => /Could not save open house: Invalid date/.test(t)), 10000);
      expect(cards(f)).toHaveLength(0);
      expect(form(f).style.display).toBe('block');
      expect((f.d.getElementById('saleNewOHNotes') as HTMLInputElement).value).toBe('Bring ID');
    } finally { await closeAfter(f); }
  });

  it('the Save button is off while the request is out, and on again after', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      let release: () => void = () => undefined;
      const held = new Promise<void>((r) => { release = r; });
      f.w.fetch = async () => { await held; return { ok: true, status: 201, json: async () => ({ showing: { id: 'S-5' } }) }; };
      click(f, '[onclick="addSaleOpenHouse()"]');
      fillOpenHouse(f);
      const save = f.d.querySelector('#saleAddOpenHouseForm button[data-oh-save]') as HTMLButtonElement;
      save.click();
      await sleep(50);
      expect(save.disabled).toBe(true);
      release();
      await until(() => cards(f).length === 1, 10000);
      expect(save.disabled).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('shows the open houses it already has when it is opened (and not another listing\'s)', async () => {
    const rows = [
      { id: 'S-1', listing_id: '9', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[ByAppointment] RSVP', listing: { listing_id: 'SL-9' } },
      { id: 'S-2', listing_id: '88', date: '2026-10-12T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'openhouse', status: 'confirmed', notes: '', listing: { listing_id: 'SL-2' } },
      { id: 'S-3', listing_id: '9', date: '2026-10-13T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'brokersopen', status: 'confirmed', notes: '[BrokerOnly] Lockbox', listing: { listing_id: 'SL-9' } },
    ];
    const f = await boot({ search: '?id=SL-9', listing: SAVED, showings: rows });
    try {
      await until(() => cards(f).length === 2, 30000);
      expect(cards(f).map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1', 'S-3']);
      expect(cards(f)[0].textContent).toContain('By Appt');
      expect(cards(f)[1].textContent).toContain('(internal)');
      // it asks for the upcoming open houses and the Broker Only ones, a type and a page at a time (the route answers 200 at a time, the oldest first: see crm-listing-open-houses.test.ts),
      // not for "the first 200 showings" and picking its own out of them
      const asked = f.requests.filter((r) => r.method === 'GET' && r.url.startsWith('/api/crm/showings')).map((r) => r.url.replace(/date_from=\d{4}-\d{2}-\d{2}/, 'date_from=TODAY'));
      expect(asked).toEqual(['/api/crm/showings?type=openhouse&date_from=TODAY&limit=200&offset=0', '/api/crm/showings?type=brokersopen&date_from=TODAY&limit=200&offset=0']);
    } finally { await closeAfter(f); }
  });

  it('finds its open houses by the listing id the showing carries, or by the numeric id of the record', async () => {
    const rows = [
      { id: 'S-4', listing_id: '9', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] by the record id' },
      { id: 'S-5', listing_id: 'unrelated', date: '2026-10-12T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] by the listing id', listing: { listing_id: 'SL-9' } },
      { id: 'S-6', listing_id: '78', date: '2026-10-13T00:00:00.000Z', time: '1:00 PM - 2:00 PM', type: 'openhouse', status: 'confirmed', notes: '', listing: { listing_id: 'SL-8' } },
    ];
    const f = await boot({ search: '?id=SL-9', listing: SAVED, showings: rows });
    try {
      await until(() => cards(f).length === 2, 30000);
      expect(cards(f).map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-4', 'S-5']);
    } finally { await closeAfter(f); }
  });

  it('says the open houses could not be loaded, not that there are none, when the route does not answer (the copy showed "none yet" and said nothing)', async () => {
    const f = await boot({ search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      f.w.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
      f.w._openHouses().load(['SL-9', '9']);
      await until(() => /could not be loaded/.test(f.d.getElementById('saleOpenHouseEmpty')?.textContent ?? ''), 10000);
      expect(f.d.getElementById('saleOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
      expect(cards(f)).toHaveLength(0);
    } finally { await closeAfter(f); }
  });

  it('a note or a time that came from the server is text on its card, never markup', async () => {
    const rows = [{ id: 'S-1', listing_id: '9', date: '2026-10-11T00:00:00.000Z', time: '<b>2:00 PM</b>', type: 'openhouse', status: 'confirmed', notes: '[Public] <img src=x onerror=alert(1)>', listing: { listing_id: 'SL-9' } }];
    const f = await boot({ search: '?id=SL-9', listing: SAVED, showings: rows });
    try {
      await until(() => cards(f).length === 1, 30000);
      expect(cards(f)[0].querySelector('img')).toBeNull();
      expect(cards(f)[0].querySelector('b')).toBeNull();
      expect(cards(f)[0].textContent).toContain('<img src=x onerror=alert(1)>');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('Remove cancels the showing and takes the card away', async () => {
    const rows = [{ id: 'S-1', listing_id: '9', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] x', listing: { listing_id: 'SL-9' } }];
    const f = await boot({ search: '?id=SL-9', listing: SAVED, showings: rows });
    try {
      await until(() => cards(f).length === 1, 30000);
      (cards(f)[0].querySelector('button') as HTMLElement).click();
      await until(() => cards(f).length === 0, 10000);
      const patch = f.requests.find((r) => r.method === 'PATCH' && r.url === '/api/crm/showings/S-1')!;
      expect(JSON.parse(patch.body)).toEqual({ status: 'cancelled' });
      expect(f.d.getElementById('saleOpenHouseEmpty')).not.toBeNull();
      expect(toasts(f).filter((t) => /Open house removed$/.test(t))).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it('a listing that was just saved by the form (Save Draft) takes open houses at once', async () => {
    const f = await boot();
    try {
      (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
      f.w.manualSaveDraft();
      await until(() => f.calls.includes('create'), 15000);
      await until(() => !(f.d.querySelector('[onclick*="manualSaveDraft"]') as HTMLButtonElement).disabled, 15000);
      fillOpenHouse(f);
      click(f, '[onclick="saveSaleOpenHouse()"]');
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
      click(f, '[onclick="addSaleOpenHouse()"]');
      expect(toasts(f).filter((t) => /open house manager did not load/.test(t))).toHaveLength(1);
      click(f, '[onclick="saveSaleOpenHouse()"]');
      expect(toasts(f).filter((t) => /open house manager did not load/.test(t))).toHaveLength(2);
      click(f, '[onclick="cancelSaleOpenHouse()"]');                               // Cancel needs nothing to close
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('opens a saved listing without it', async () => {
    const f = await boot({ modules: without, search: '?id=SL-9', listing: SAVED });
    try {
      await loaded(f);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
