/// <reference types="jest" />
/**
 * js/forms/listing-open-houses.js: the open houses of an Add / Edit listing form.
 *
 * The Rental form's "Add Open House" built a card of inputs that had no id and no name, so nothing the agent entered was saved, and the page said "Open house information will be
 * syndicated to REBNY RLS and partner sites." The Sale form saves open houses as showings of the listing (POST /api/crm/showings) and loads them again when the listing is opened; that
 * is this module, one piece both forms can use (the Rental form uses it; the Sale form keeps its own copy until it is moved over). These tests run it on a plain page with a fake
 * network, so every request it makes is seen.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCE = readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-open-houses.js'), 'utf8');

type Call = { url: string; method: string; headers?: Record<string, string>; body?: any; credentials?: string };
type Reply = { ok: boolean; status: number; body?: any; reject?: string };

function boot(o: { savedId?: string; blocked?: () => string; answers?: (call: Call) => Reply | undefined; confirm?: boolean; readOnly?: boolean; showInternal?: boolean; now?: Date } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="rentalOpenHouseList"><p id="rentalOpenHouseEmpty">none</p></div>
    <div id="rentalAddOpenHouseForm" style="display: none;">
      <input type="date" id="rentalNewOHDate"><input type="time" id="rentalNewOHStart"><input type="time" id="rentalNewOHEnd">
      <select id="rentalNewOHType"><option value="Public">Public</option><option value="BrokerOnly">Broker Only</option><option value="ByAppointment">By Appointment</option><option value="Virtual">Virtual</option></select>
      <input type="text" id="rentalNewOHNotes"><button type="button" data-oh-save>Save</button>
    </div></body>`, { url: 'https://mallan.nyc/crm/RENTAL-FORM-REDESIGN.html', runScripts: 'outside-only' });
  const w: any = dom.window;
  w.eval(SOURCE);
  const calls: Call[] = [];
  const toasts: [string, string | undefined][] = [];
  const told: string[] = [];
  const asked: string[] = [];                                   // every confirmation the manager asked for
  let savedId = o.savedId ?? '';
  const defaultAnswer = (call: Call): Reply => {
    if (call.method === 'POST') return { ok: true, status: 201, body: { showing: { id: 'S-9' } } };
    if (call.method === 'PATCH') return { ok: true, status: 200, body: {} };
    return { ok: true, status: 200, body: { showings: [] } };
  };
  const manager = w.MallanOpenHouses.create({
    prefix: 'rental',
    readOnly: o.readOnly,
    showInternal: o.showInternal,
    now: () => o.now ?? new Date(2026, 9, 10, 12),                // the day the page is open: 10 October 2026
    listingId: () => savedId,
    blocked: o.blocked,
    toast: (message: string, type?: string) => toasts.push([message, type]),
    alert: (message: string) => told.push(message),
    confirm: (message: string) => { asked.push(message); return o.confirm ?? true; },
    fetch: (url: string, init: any = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', headers: init.headers, body: init.body, credentials: init.credentials };
      calls.push(call);
      const r = o.answers?.(call) ?? defaultAnswer(call);
      if (r.reject) return Promise.reject(new Error(r.reject));
      return Promise.resolve({ ok: r.ok, status: r.status, json: () => (r.body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(r.body)) });
    },
  });
  const d: Document = w.document;
  const field = (suffix: string) => d.getElementById('rentalNewOH' + suffix) as HTMLInputElement;
  const fill = (v: Partial<Record<'Date' | 'Start' | 'End' | 'Type' | 'Notes', string>>) => { for (const [k, x] of Object.entries(v)) field(k).value = x!; };
  return {
    w, d, manager, calls, toasts, told, asked, field, fill,
    setSaved: (id: string) => { savedId = id; },
    list: () => d.getElementById('rentalOpenHouseList') as HTMLElement,
    form: () => d.getElementById('rentalAddOpenHouseForm') as HTMLElement,
    saveButton: () => d.querySelector('button[data-oh-save]') as HTMLButtonElement,
    cards: () => [...d.querySelectorAll('[data-showing-id]')] as HTMLElement[],
    flush: () => new Promise<void>((r) => setTimeout(r, 30)),
  };
}
const FULL = { Date: '2026-10-11', Start: '14:00', End: '16:30', Type: 'Public', Notes: 'Bring ID' };

// The showings route as it answers: one type at a time (type=), from a date on (date_from=), a page at a time (limit=, offset=), with the number of them all (total)
const route = (rows: unknown[], shape: (page: unknown[], total: number) => unknown = (page, total) => ({ showings: page, total })) => (c: Call): Reply | undefined => {
  if (c.method !== 'GET') return undefined;
  const q = new URL(c.url, 'https://mallan.nyc').searchParams;
  const type = q.get('type'), from = q.get('date_from') ?? '', limit = Math.min(Number(q.get('limit') ?? 50), 200), offset = Number(q.get('offset') ?? 0);
  const wanted = rows.filter((s: any) => !s || typeof s !== 'object' || ((!type || s.type === type) && String(s.date ?? '').slice(0, 10) >= from));
  return { ok: true, status: 200, body: shape(wanted.slice(offset, offset + limit), wanted.length) };
};

describe('the form', () => {
  it('opens and closes', () => {
    const p = boot();
    p.manager.showForm();
    expect(p.form().style.display).toBe('block');
    p.manager.cancelForm();
    expect(p.form().style.display).toBe('none');
  });

  it('a page without the form does not fail', () => {
    const p = boot();
    p.form().remove();
    expect(() => { p.manager.showForm(); p.manager.cancelForm(); }).not.toThrow();
  });
});

describe('saving an open house', () => {
  it('asks for the date and both times', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill({ ...FULL, Date: '' });
    await p.manager.save();
    expect(p.told).toEqual(['Please fill in Date, Start Time, and End Time.']);
    for (const missing of ['Start', 'End'] as const) {
      p.fill(FULL);
      p.fill({ [missing]: '' });
      await p.manager.save();
    }
    expect(p.told).toHaveLength(3);
    expect(p.calls).toEqual([]);
  });

  it('says why the form cannot schedule one now, when the page says so', async () => {
    const p = boot({ savedId: 'RL-7', blocked: () => 'Open houses cannot be scheduled while the listing is in Coming Soon status.' });
    p.fill(FULL);
    await p.manager.save();
    expect(p.told).toEqual(['Open houses cannot be scheduled while the listing is in Coming Soon status.']);
    expect(p.calls).toEqual([]);
  });

  it('asks the agent to save the listing first: an open house is attached to a saved listing', async () => {
    const p = boot();
    p.fill(FULL);
    await p.manager.save();
    expect(p.told).toEqual(['Save the listing first (as a draft), then add open houses — they attach to the saved listing.']);
    expect(p.calls).toEqual([]);
  });

  it('is saved as a showing of the listing, with the time as the public feed reads it and the type kept in the notes', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill(FULL);
    await p.manager.save();
    expect(p.calls).toHaveLength(1);
    const call = p.calls[0];
    expect([call.method, call.url, call.credentials, call.headers]).toEqual(['POST', '/api/crm/showings', 'include', { 'Content-Type': 'application/json' }]);
    expect(JSON.parse(call.body)).toEqual({ listing_id: 'RL-7', date: '2026-10-11', time: '2:00 PM - 4:30 PM', type: 'openhouse', notes: '[Public] Bring ID' });
  });

  it('shows the saved open house as a card with its date, time, type and notes, and says so', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill(FULL);
    await p.manager.save();
    const [card] = p.cards();
    expect(card.getAttribute('data-showing-id')).toBe('S-9');
    expect(card.textContent).toContain('Oct 11');
    expect(card.textContent).toContain('2:00 PM - 4:30 PM');
    expect(card.textContent).toContain('Public');
    expect(card.textContent).toContain('Bring ID');
    expect(card.textContent).not.toContain('(internal)');
    expect(card.querySelector('span')!.className).toContain('bg-green-100');
    expect(p.toasts.at(-1)).toEqual(['Open house saved', 'success']);
    expect(p.d.getElementById('rentalOpenHouseEmpty')).toBeNull();                 // the "none yet" line goes
  });

  it('takes the id from an answer that is the showing itself', async () => {
    const p = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: true, status: 201, body: { id: 'S-5' } } : undefined) });
    p.fill(FULL);
    await p.manager.save();
    expect(p.cards()[0].getAttribute('data-showing-id')).toBe('S-5');
  });

  it('empties the form and closes it after a save', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.manager.showForm();
    p.fill({ ...FULL, Type: 'Virtual' });
    await p.manager.save();
    expect(['Date', 'Start', 'End', 'Notes'].map((k) => p.field(k).value)).toEqual(['', '', '', '']);
    expect(p.field('Type').value).toBe('Public');
    expect(p.form().style.display).toBe('none');
  });

  it.each([['Public', 'openhouse', true], ['Virtual', 'openhouse', true], ['ByAppointment', 'openhouse', true], ['BrokerOnly', 'brokersopen', false]])('the %s type is saved as %s', async (type, showing, isPublic) => {
    const p = boot({ savedId: 'RL-7' });
    p.fill({ ...FULL, Type: type });
    await p.manager.save();
    expect(JSON.parse(p.calls[0].body)).toMatchObject({ type: showing, notes: `[${type}] Bring ID` });
    expect(p.cards()[0].textContent!.includes('(internal)')).toBe(!isPublic);
    expect(p.toasts.at(-1)![0]).toBe(isPublic ? 'Open house saved' : 'Open house saved (internal — not shown publicly)');
  });

  it('an internal event is badged and worded as one; the labels of the other types are short', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill({ ...FULL, Type: 'BrokerOnly' });
    await p.manager.save();
    p.fill({ ...FULL, Type: 'ByAppointment' });
    await p.manager.save();
    const [internal, byAppt] = p.cards();
    expect(internal.textContent).toContain('Broker Only');
    expect(internal.querySelector('span')!.className).toContain('bg-blue-100');
    expect(byAppt.textContent).toContain('By Appt');
    expect(byAppt.querySelector('span')!.className).toContain('bg-yellow-100');
  });

  it('the listing id is sent as a text, whatever it is (a number too)', async () => {
    const p = boot({ savedId: 77 as any });
    p.fill(FULL);
    await p.manager.save();
    expect(JSON.parse(p.calls[0].body).listing_id).toBe('77');
  });

  it('a page that lost its list still saves, and does not fail drawing the card', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.list().remove();
    p.fill(FULL);
    await p.manager.save();
    expect(p.calls).toHaveLength(1);
    expect(p.toasts.at(-1)).toEqual(['Open house saved', 'success']);
  });

  it('the date on a card is the month and the day, and a Virtual event is badged purple', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill({ ...FULL, Type: 'Virtual' });
    await p.manager.save();
    expect(p.cards()[0].querySelector('.text-lg')!.textContent).toBe('Oct 11');
    expect(p.cards()[0].querySelector('span')!.className).toContain('bg-purple-100');
  });

  it('a type that is nobody\'s is internal: it is never put on a public page by mistake', async () => {
    const p = boot({ savedId: 'RL-7' });
    const option = p.d.createElement('option'); option.value = 'Surprise'; option.textContent = 'Surprise';
    p.field('Type').appendChild(option);
    p.fill({ ...FULL, Type: 'Surprise' });
    await p.manager.save();
    expect(JSON.parse(p.calls[0].body).type).toBe('brokersopen');
  });

  it('an open house with no notes carries only its type in them', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill({ ...FULL, Notes: '' });
    await p.manager.save();
    expect(JSON.parse(p.calls[0].body).notes).toBe('[Public] ');
    expect(p.cards()[0].querySelectorAll('p')).toHaveLength(0);
  });

  it('the type defaults to Public when the box has none', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.field('Type').innerHTML = '';
    p.fill({ ...FULL, Type: '' });
    await p.manager.save();
    expect(JSON.parse(p.calls[0].body)).toMatchObject({ type: 'openhouse', notes: '[Public] Bring ID' });
  });

  it('the Save button is off while the request is out, and on again after', async () => {
    let finish: (r: Reply) => void = () => undefined;
    const held = new Promise<Reply>((r) => { finish = r; });
    const p = boot({ savedId: 'RL-7' });
    const slow = p.w.MallanOpenHouses.create({
      prefix: 'rental', listingId: () => 'RL-7', toast: () => undefined, alert: () => undefined,
      fetch: () => held.then((r) => ({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) })),
    });
    p.fill(FULL);
    const done = slow.save();
    expect(p.saveButton().disabled).toBe(true);
    finish({ ok: true, status: 201, body: { showing: { id: 'S-1' } } });
    await done;
    expect(p.saveButton().disabled).toBe(false);
  });

  it('a refusal is said with the server\'s words, or its status; the form keeps what was entered; the button is on again', async () => {
    const p = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: false, status: 400, body: { error: 'Invalid date format' } } : undefined) });
    p.manager.showForm();
    p.fill(FULL);
    await p.manager.save();
    expect(p.toasts.at(-1)).toEqual(['Could not save open house: Invalid date format', 'error']);
    expect(p.field('Date').value).toBe('2026-10-11');
    expect(p.form().style.display).toBe('block');
    expect(p.cards()).toHaveLength(0);
    expect(p.saveButton().disabled).toBe(false);
    const q = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: false, status: 500 } : undefined) });
    q.fill(FULL);
    await q.manager.save();
    expect(q.toasts.at(-1)).toEqual(['Could not save open house: 500', 'error']);
  });

  it('a network failure is said, and the button is on again', async () => {
    const p = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: false, status: 0, reject: 'offline' } : undefined) });
    p.fill(FULL);
    await p.manager.save();
    expect(p.toasts.at(-1)).toEqual(['Could not save open house: offline', 'error']);
    expect(p.saveButton().disabled).toBe(false);
  });

  it('a page without a Save button (data-oh-save) still saves', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.saveButton().remove();
    p.fill(FULL);
    await p.manager.save();
    expect(p.cards()).toHaveLength(1);
  });
});

describe('the time of day', () => {
  it.each([['00:05', '12:05 AM'], ['09:30', '9:30 AM'], ['12:00', '12:00 PM'], ['12:59', '12:59 PM'], ['13:30', '1:30 PM'], ['23:59', '11:59 PM'], ['2:00', '2:00 AM']])('%s is %s', (t, text) => {
    const w: any = boot().w;
    expect(w.MallanOpenHouses.time12h(t)).toBe(text);
  });
  it('a time that is not one is left as it is, and no time is none', () => {
    const w: any = boot().w;
    expect(w.MallanOpenHouses.time12h('soon')).toBe('soon');
    expect(w.MallanOpenHouses.time12h('')).toBe('');
    expect(w.MallanOpenHouses.time12h(undefined)).toBe('');
  });
});

describe('the type of the showing', () => {
  it.each([['Public', 'openhouse', true], ['Virtual', 'openhouse', true], ['ByAppointment', 'openhouse', true], ['BrokerOnly', 'brokersopen', false], ['', 'brokersopen', false], ['other', 'brokersopen', false], [undefined, 'brokersopen', false]])('%s', (t, type, isPublic) => {
    const w: any = boot().w;
    expect(w.MallanOpenHouses.showingType(t)).toEqual({ type, isPublic });
  });
});

describe('removing an open house', () => {
  const withCards = async (o: Parameters<typeof boot>[0] = {}) => {
    const p = boot({ savedId: 'RL-7', ...o });
    p.fill(FULL);
    await p.manager.save();
    p.fill({ ...FULL, Start: '10:00', End: '11:00' });
    await p.manager.save();
    return p;
  };
  const removeButton = (card: HTMLElement) => card.querySelector('button') as HTMLButtonElement;

  it('asks first, and does nothing when the agent says no', async () => {
    const p = await withCards({ confirm: false });
    const before = p.calls.length;
    removeButton(p.cards()[0]).click();
    await p.flush();
    expect(p.calls).toHaveLength(before);
    expect(p.cards()).toHaveLength(2);
  });

  it('cancels the showing (no hard delete), and the card goes once the server has done it', async () => {
    const p = await withCards();
    const before = p.calls.length;
    removeButton(p.cards()[0]).click();
    expect(p.cards()).toHaveLength(2);                                            // the server has not answered yet
    await p.flush();
    const call = p.calls[before];
    expect([call.method, call.url, call.credentials, call.headers]).toEqual(['PATCH', '/api/crm/showings/S-9', 'include', { 'Content-Type': 'application/json' }]);
    expect(JSON.parse(call.body)).toEqual({ status: 'cancelled' });
    expect(p.cards()).toHaveLength(1);
    expect(p.toasts.at(-1)).toEqual(['Open house removed', 'success']);
  });

  it('puts the "none yet" line back when the last one goes', async () => {
    const p = boot({ savedId: 'RL-7' });
    p.fill(FULL);
    await p.manager.save();
    removeButton(p.cards()[0]).click();
    await p.flush();
    expect(p.cards()).toHaveLength(0);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('No open houses scheduled yet. Click "Add Open House" to create one.');
  });

  it('keeps the card and says so when the server refuses, or the network is down', async () => {
    const p = await withCards({ answers: (c) => (c.method === 'PATCH' ? { ok: false, status: 403 } : undefined) });
    removeButton(p.cards()[0]).click();
    await p.flush();
    expect(p.cards()).toHaveLength(2);
    expect(p.toasts.at(-1)).toEqual(['Could not remove open house (HTTP 403)', 'error']);
    const q = await withCards({ answers: (c) => (c.method === 'PATCH' ? { ok: false, status: 0, reject: 'offline' } : undefined) });
    removeButton(q.cards()[0]).click();
    await q.flush();
    expect(q.cards()).toHaveLength(2);
    expect(q.toasts.at(-1)).toEqual(['Could not remove open house: offline', 'error']);
  });

  it('an open house with no id cannot be cancelled: the card stays and the agent is told', async () => {
    const p = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: true, status: 201, body: {} } : undefined) });
    p.fill(FULL);
    await p.manager.save();
    const before = p.calls.length;
    removeButton(p.cards()[0]).click();
    await p.flush();
    expect(p.calls).toHaveLength(before);
    expect(p.cards()).toHaveLength(1);
    expect(p.toasts.at(-1)).toEqual(['This open house has no id, so it cannot be cancelled here.', 'error']);
  });

  it('encodes the id in the address', async () => {
    const p = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: true, status: 201, body: { showing: { id: 'S 9/1' } } } : undefined) });
    p.fill(FULL);
    await p.manager.save();
    removeButton(p.cards()[0]).click();
    await p.flush();
    expect(p.calls.at(-1)!.url).toBe('/api/crm/showings/S%209%2F1');
  });
});

describe('the open houses of a saved listing', () => {
  const show = (over: Record<string, unknown>) => ({ id: 'S-1', listing_id: '77', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] Bring ID', listing: { listing_id: 'RL-7' }, ...over });
  const loaded = async (rows: unknown[], keys: unknown[] = ['RL-7', '77'], shape?: (page: unknown[], total: number) => unknown) => {
    const p = boot({ answers: route(rows, shape) });
    await p.manager.load(keys);
    return p;
  };

  it('asks for the upcoming open houses and the Broker Only ones, a type at a time, and shows the ones of this listing as cards, in the order of their dates', async () => {
    const p = await loaded([
      show({ id: 'S-1' }),
      show({ id: 'S-2', type: 'brokersopen', notes: '[BrokerOnly] Lockbox on the door', date: '2026-10-12' }),
      show({ id: 'S-3', type: 'showing' }),                                        // not an open house
      show({ id: 'S-4', status: 'cancelled' }),                                    // cancelled
      show({ id: 'S-5', listing: { listing_id: 'RL-8' }, listing_id: '88' }),      // another listing
      show({ id: 'S-6', listing: undefined, listing_id: 77 }),                     // this listing, by its numeric id
      show({ id: 'S-7', date: '2026-10-09T00:00:00.000Z' }),                       // yesterday
    ]);
    expect(p.calls.map((c) => c.url)).toEqual([
      '/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=0',
      '/api/crm/showings?type=brokersopen&date_from=2026-10-10&limit=200&offset=0',
    ]);
    expect(p.calls.every((c) => c.method === 'GET' && c.credentials === 'include')).toBe(true);
    expect(p.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1', 'S-6', 'S-2']);
    const [first, , second] = p.cards();
    expect(first.textContent).toContain('Oct 11');
    expect(first.textContent).toContain('2:00 PM - 4:30 PM');
    expect(first.querySelector('.text-lg')!.textContent).toBe('Oct 11');
    expect(first.textContent).toContain('Bring ID');
    expect(first.textContent).not.toContain('[Public]');
    expect(second.textContent).toContain('Oct 12');
    expect(second.textContent).toContain('Broker Only');
    expect(second.textContent).toContain('(internal)');
    expect(second.textContent).toContain('Lockbox on the door');
  });

  it('gets the type the agent chose back from the notes (By Appointment), and a type from the showing when the notes have none', async () => {
    const p = await loaded([show({ id: 'S-1', notes: '[ByAppointment] RSVP' }), show({ id: 'S-2', notes: 'plain note' }), show({ id: 'S-3', type: 'brokersopen', notes: null })]);
    const [a, b, c] = p.cards();                                                   // (the same day: the order they came in)
    expect(a.textContent).toContain('By Appt');
    expect(a.textContent).not.toContain('(internal)');
    expect(b.textContent).toContain('Public');
    expect(b.textContent).toContain('plain note');
    expect(c.textContent).toContain('Broker Only');
    expect(c.textContent).toContain('(internal)');
  });

  it('reads the list from showings, data, or an answer that is the list', async () => {
    for (const shape of [(page: unknown[]) => ({ showings: page }), (page: unknown[]) => ({ data: page }), (page: unknown[]) => page]) {
      const p = await loaded([show({})], ['RL-7'], shape);
      expect(p.cards()).toHaveLength(1);
    }
    const none = await loaded([show({})], ['RL-7'], () => ({ showings: 'none' }));
    expect(none.cards()).toHaveLength(0);
    expect(none.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('No open houses scheduled yet. Click "Add Open House" to create one.');       // (an answer with no list is none)
    const weird = await loaded([show({})], ['RL-7'], () => 42);
    expect(weird.cards()).toHaveLength(0);
  });

  it('says it is asking while it waits, then shows the cards', async () => {
    const p = boot({ answers: route([show({})]) });
    const pending = p.manager.load(['RL-7']);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Loading open houses...');
    await pending;
    expect(p.d.getElementById('rentalOpenHouseEmpty')).toBeNull();
    expect(p.cards()).toHaveLength(1);
  });

  it('shows the cards by date, the internal ones among the others; the ones of one day stay in the order they came in', async () => {
    const p = await loaded([
      show({ id: 'S-1', date: '2026-10-14' }),
      show({ id: 'S-2', type: 'brokersopen', notes: '[BrokerOnly] early', date: '2026-10-11' }),
      show({ id: 'S-3', date: '2026-10-12' }),
      show({ id: 'S-4', type: 'brokersopen', notes: '[BrokerOnly] same day', date: '2026-10-12' }),
      show({ id: 'S-5', date: '2026-10-12' }),
    ]);
    expect(p.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-2', 'S-3', 'S-5', 'S-4', 'S-1']);
  });

  it('reads every page the route has (it answers 200 at a time, and says how many there are), so an open house past the 200th is found', async () => {
    const many = Array.from({ length: 450 }, (_, i) => show({ id: `S-${1000 + i}`, listing: { listing_id: i === 449 ? 'RL-7' : 'RL-9' }, listing_id: i === 449 ? '77' : '99', date: '2026-10-11' }));
    const p = await loaded(many);
    const asked = (type: string) => p.calls.map((c) => c.url).filter((url) => url.includes(`type=${type}&`));
    expect(asked('openhouse')).toEqual([
      '/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=0',
      '/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=200',
      '/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=400',
    ]);
    expect(asked('brokersopen')).toEqual(['/api/crm/showings?type=brokersopen&date_from=2026-10-10&limit=200&offset=0']);
    expect(p.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1449']);
  });

  it('reads exactly ten pages of a type, and no more', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => show({ id: `S-${i}`, listing: { listing_id: i === 1999 ? 'RL-7' : 'RL-9' }, listing_id: '99' }));
    const p = await loaded(rows);
    expect(p.calls.filter((c) => /type=openhouse&/.test(c.url))).toHaveLength(10);
    expect(p.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1999']);                      // (the last row of the tenth page is found)
  });

  it('says the list could not be had when there are more than ten pages of a type, rather than showing a list that may be missing the listing\'s', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => show({ id: `S-${i}`, listing: { listing_id: 'RL-9' }, listing_id: '99' }));
    const p = await loaded(rows);
    expect(p.calls.filter((c) => /type=openhouse&/.test(c.url))).toHaveLength(10);
    expect(p.cards()).toHaveLength(0);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
  });

  it('asks again while the page is full when the route does not say how many there are, and stops at a page that is not', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => show({ id: `S-${i}`, listing: { listing_id: i === 200 ? 'RL-7' : 'RL-9' }, listing_id: '99' }));
    const bare = await loaded(rows, ['RL-7'], (page) => page);                     // an answer that is the list, with no total
    expect(bare.calls.filter((c) => /type=openhouse&/.test(c.url)).map((c) => c.url)).toEqual([
      '/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=0',
      '/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=200',
    ]);
    expect(bare.cards()).toHaveLength(1);
    const short = await loaded(rows.slice(0, 199), ['RL-7'], (page) => ({ showings: page }));
    expect(short.calls.filter((c) => /type=openhouse&/.test(c.url))).toHaveLength(1);
  });

  it('stops at an empty page, whatever total the route says', async () => {
    const p = boot({ answers: (c) => (c.method === 'GET' ? { ok: true, status: 200, body: { showings: [], total: 500 } } : undefined) });
    await p.manager.load(['RL-7']);
    expect(p.calls).toHaveLength(2);                                               // one page of each type
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('No open houses scheduled yet. Click "Add Open House" to create one.');
  });

  it('shows a showing once, however many times it is sent (a page can overlap the next)', async () => {
    const p = boot({ answers: (c) => (c.method === 'GET' ? { ok: true, status: 200, body: { showings: [show({ id: 'S-1' }), show({ id: 'S-1' })], total: 2 } } : undefined) });
    await p.manager.load(['RL-7']);
    expect(p.cards()).toHaveLength(1);
  });

  it('counts today as the agent\'s own calendar day, written with two digits', async () => {
    const p = boot({ now: new Date(2026, 2, 5, 23, 59), answers: route([]) });
    await p.manager.load(['RL-7']);
    expect(p.calls.map((c) => c.url)).toEqual([
      '/api/crm/showings?type=openhouse&date_from=2026-03-05&limit=200&offset=0',
      '/api/crm/showings?type=brokersopen&date_from=2026-03-05&limit=200&offset=0',
    ]);
  });

  it('asks for the open houses only when the page says not to list the internal ones', async () => {
    const p = boot({ showInternal: false, answers: route([show({})]) });
    await p.manager.load(['RL-7']);
    expect(p.calls.map((c) => c.url)).toEqual(['/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=0']);
  });

  it('skips an entry that is not a record', async () => {
    const p = await loaded([null, 'x', 7, show({})]);
    expect(p.cards()).toHaveLength(1);
  });

  it('a note that is markup is text', async () => {
    const p = await loaded([show({ notes: '[Public] <img src=x onerror=alert(1)>' })]);
    expect(p.list().querySelectorAll('img')).toHaveLength(0);
    expect(p.cards()[0].textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('a date that is not one is shown as it is', async () => {
    const p = await loaded([show({ date: 'tomorrow' })]);
    expect(p.cards()[0].textContent).toContain('tomorrow');
  });

  it('asks for nothing for a listing that has no id, and shows the "none yet" line', async () => {
    const p = boot();
    p.list().innerHTML = '<div data-showing-id="old">old</div>';
    await p.manager.load(['', undefined, null]);
    expect(p.calls).toEqual([]);
    expect(p.cards()).toHaveLength(0);
    expect(p.d.getElementById('rentalOpenHouseEmpty')).not.toBeNull();
  });

  it('replaces the cards it showed before', async () => {
    const p = await loaded([show({})]);
    await p.manager.load(['RL-7', '77']);
    expect(p.cards()).toHaveLength(1);
  });

  it('says the list could not be loaded, not that there are none, when it cannot be had (no toast: the list is not what the agent came to do)', async () => {
    const p = boot({ answers: () => ({ ok: false, status: 500 }) });
    await p.manager.load(['RL-7']);
    expect(p.cards()).toHaveLength(0);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
    const q = boot({ answers: () => ({ ok: false, status: 0, reject: 'offline' }) });
    await q.manager.load(['RL-7']);
    expect(q.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
    expect(q.toasts).toEqual([]);
    const refused = boot({ answers: () => ({ ok: false, status: 403, body: { error: 'Forbidden' } }) });          // (the route's refusals come with a body: it is not a list)
    await refused.manager.load(['RL-7']);
    expect(refused.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
  });

  it('shows every showing that has no id: they cannot be told apart, so none is a copy of another', async () => {
    const p = await loaded([show({ id: undefined }), show({ id: undefined }), show({ id: null }), show({ id: null }), show({ id: 'S-1' })]);
    expect(p.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['', '', '', '', 'S-1']);
  });

  it('says it could not be loaded when only one of the two types could be had: the list may be missing the listing\'s', async () => {
    const p = boot({ answers: (c) => (/type=brokersopen/.test(c.url) ? { ok: false, status: 503 } : { ok: true, status: 200, body: { showings: [{ id: 'S-1', listing_id: '77', date: '2026-10-11', type: 'openhouse', status: 'confirmed', listing: { listing_id: 'RL-7' } }], total: 1 } }) });
    await p.manager.load(['RL-7']);
    expect(p.cards()).toHaveLength(0);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
  });

  it('says it could not be loaded when a later page fails', async () => {
    const p = boot({ answers: (c) => (/offset=200/.test(c.url) ? { ok: false, status: 500 } : { ok: true, status: 200, body: { showings: Array.from({ length: 200 }, (_, i) => ({ id: `S-${i}`, listing_id: '99', date: '2026-10-11', type: 'openhouse', status: 'confirmed' })), total: 400 } }) });
    await p.manager.load(['RL-7']);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
  });

  it('says it could not be loaded, and does not throw, when the request cannot even be made', async () => {
    const p = boot({ answers: () => { throw new Error('no network layer'); } });
    await expect(p.manager.load(['RL-7'])).resolves.toBeUndefined();
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
  });

  it('does not fail when the page is closed while the list is being asked for (a continuation of a page that is gone has nothing to write to)', async () => {
    for (const answers of [route([show({})]), () => ({ ok: false, status: 500 } as Reply)]) {
      const p = boot({ answers });
      const loading = p.manager.load(['RL-7']);
      p.w.close();
      await expect(loading).resolves.toBeUndefined();
    }
  });

  it('shows what a later load finds after a failed one', async () => {
    let up = false;
    const p = boot({ answers: (c) => (up ? route([show({})])(c) : { ok: false, status: 500 }) });
    await p.manager.load(['RL-7']);
    expect(p.cards()).toHaveLength(0);
    up = true;
    await p.manager.load(['RL-7']);
    expect(p.cards()).toHaveLength(1);
    expect(p.d.querySelectorAll('#rentalOpenHouseEmpty')).toHaveLength(0);
  });

  it('a page without the list does nothing', async () => {
    const p = boot();
    p.list().remove();
    await p.manager.load(['RL-7']);
    expect(p.calls).toEqual([]);
  });
});

describe('a read-only list (the Tools viewers show a listing\'s open houses; nothing there adds or removes one)', () => {
  const rows = [
    { id: 'S-1', listing_id: '77', date: '2026-10-11T00:00:00.000Z', time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] Bring ID', listing: { listing_id: 'RL-7' } },
    { id: 'S-2', listing_id: '77', date: '2026-10-12', time: '10:00 AM - 11:00 AM', type: 'brokersopen', status: 'confirmed', notes: '[BrokerOnly] Lockbox', listing: { listing_id: 'RL-7' } },
  ];
  const answers = route(rows);
  // a route that sends every row whatever type was asked for: the page's own rules still hold
  const everything = (c: Call): Reply | undefined => (c.method === 'GET' ? { ok: true, status: 200, body: { showings: rows, total: rows.length } } : undefined);

  it('shows the open houses as cards with no Remove button', async () => {
    const p = boot({ readOnly: true, answers });
    await p.manager.load(['RL-7', '77']);
    expect(p.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1', 'S-2']);
    expect(p.list().querySelectorAll('button')).toHaveLength(0);
    expect(p.list().textContent).not.toContain('Remove');
    expect(p.cards()[0].textContent).toContain('Oct 11');
    expect(p.cards()[0].textContent).toContain('Bring ID');
  });

  it('keeps the Remove button on a list that is not read-only (the Add forms)', async () => {
    const p = boot({ answers });
    await p.manager.load(['RL-7', '77']);
    expect(p.list().querySelectorAll('button')).toHaveLength(2);
  });

  it('says "No upcoming open houses found." when there are none, without advice about a button the page does not show', async () => {
    const p = boot({ readOnly: true });
    await p.manager.load(['RL-7']);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('No upcoming open houses found.');
    const q = boot();
    await q.manager.load(['RL-7']);
    expect(q.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('No open houses scheduled yet. Click "Add Open House" to create one.');
  });

  it('says "No upcoming open houses found." for a listing with no key too, and "could not be loaded" when it cannot be had', async () => {
    const p = boot({ readOnly: true });
    await p.manager.load([]);
    expect(p.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('No upcoming open houses found.');
    const q = boot({ readOnly: true, answers: () => ({ ok: false, status: 500 }) });
    await q.manager.load(['RL-7']);
    expect(q.d.getElementById('rentalOpenHouseEmpty')!.textContent).toBe('Open houses could not be loaded.');
  });

  it('lists the internal events (Broker Only) unless the page says not to', async () => {
    const all = boot({ readOnly: true, answers });
    await all.manager.load(['RL-7']);
    expect(all.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1', 'S-2']);
    const publicOnly = boot({ readOnly: true, showInternal: false, answers });
    await publicOnly.manager.load(['RL-7']);
    expect(publicOnly.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1']);
    expect(publicOnly.calls.map((c) => c.url)).toEqual(['/api/crm/showings?type=openhouse&date_from=2026-10-10&limit=200&offset=0']);
    expect(publicOnly.list().textContent).not.toContain('Lockbox');
    const explicit = boot({ readOnly: true, showInternal: true, answers });
    await explicit.manager.load(['RL-7']);
    expect(explicit.cards()).toHaveLength(2);
  });

  it('leaves an internal event out even when the route sends one among the open houses; a row sent twice is shown once', async () => {
    const publicOnly = boot({ readOnly: true, showInternal: false, answers: everything });
    await publicOnly.manager.load(['RL-7']);
    expect(publicOnly.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1']);
    expect(publicOnly.list().textContent).not.toContain('Lockbox');
    const all = boot({ readOnly: true, answers: everything });
    await all.manager.load(['RL-7']);
    expect(all.cards().map((c) => c.getAttribute('data-showing-id'))).toEqual(['S-1', 'S-2']);      // (both asked for, both rows sent twice)
  });

  it('adds and removes nothing: no request, no form, no toast', async () => {
    const p = boot({ readOnly: true, savedId: 'RL-7', answers });
    await p.manager.load(['RL-7']);
    p.calls.length = 0;
    p.manager.showForm();
    expect(p.form().style.display).toBe('none');
    p.fill(FULL);
    expect(await p.manager.save()).toBeNull();
    expect(await p.manager.remove('S-1', p.cards()[0])).toBe(false);
    expect(p.calls).toEqual([]);
    expect(p.toasts).toEqual([]);
    expect(p.told).toEqual([]);
    expect(p.asked).toEqual([]);                                  // not even asked whether to remove
    expect(p.cards()).toHaveLength(2);
  });
});

describe('a page without a toast, an alert, a confirmation or a network', () => {
  it('is built with the page\'s own when none is given', async () => {
    const dom = new JSDOM('<!doctype html><body><div id="rentalOpenHouseList"></div></body>', { url: 'https://mallan.nyc/', runScripts: 'outside-only' });
    const w: any = dom.window;
    w.eval(SOURCE);
    let alerted = '';
    w.alert = (m: string) => { alerted = m; };
    const manager = w.MallanOpenHouses.create({ prefix: 'rental' });
    await manager.save();
    expect(alerted).toBe('Please fill in Date, Start Time, and End Time.');
    manager.render({ id: 'S-1', date: '2026-10-11', time: '2 PM', type: 'Public', notes: '', isPublic: true });
    w.confirm = () => false;
    const button = w.document.querySelector('button') as HTMLButtonElement;
    button.click();
    expect(w.document.querySelectorAll('[data-showing-id]')).toHaveLength(1);
  });
});
