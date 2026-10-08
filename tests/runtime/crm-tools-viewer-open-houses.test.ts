/// <reference types="jest" />
/**
 * The open houses of the Tools viewers (SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS), on the REAL pages.
 *
 * Both viewers had an Open Houses section that never loaded anything: it said "No open houses scheduled yet. Click "Add Open House" to create one." for every listing, even one whose open houses
 * the Add form had saved (as showings of the listing), and pointed at a button the viewer hides. The viewers now list the listing's upcoming open houses (read-only cards, from the same
 * showings the Add forms save), show the internal ones (Broker Only) only to an agent or a broker, and say what they could not do rather than that there are none.
 *
 * The showings route has no filter for a listing, answers 200 at a time, oldest first, and an agent's own only (a broker's: all of them), so a viewer that asked for "the showings" and picked its
 * listing's out of the first page would say "none" for a listing whose open houses came later. The harness answers as the server does (see showingsAnswer in tools-viewer-harness.ts).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootViewer, rendered, sleep, until, type Booted, type ViewerFile } from './tools-viewer-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const two = (n: number) => (n < 10 ? '0' : '') + n;
// a day, written as the route reads it: the agent's own calendar day, so many days from today
const localDay = (plus: number) => { const d = new Date(); d.setDate(d.getDate() + plus); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const label = (day: string) => new Date(day + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

describe.each([
  ['SALE-FORM-WITH-TOOLS', 'sale', 'SL-0404'],
  ['RENTAL-FORM-WITH-TOOLS', 'rental', 'RL-0404'],
] as const)('%s: open houses', (viewer, prefix, lid) => {
  // a showing as the server sends it (the date is a midnight, in UTC)
  const show = (over: Record<string, unknown> = {}) => ({
    id: 'S-1', listing_id: '404', date: `${localDay(3)}T00:00:00.000Z`, time: '2:00 PM - 4:30 PM', type: 'openhouse', status: 'confirmed', notes: '[Public] Bring ID', listing: { listing_id: lid }, ...over,
  });
  const at = (plus: number) => `${localDay(plus)}T00:00:00.000Z`;
  const SHOWINGS = [
    show({ id: 'S-1', date: at(3) }),                                                       // by both of the listing's ids
    show({ id: 'S-2', type: 'brokersopen', notes: '[BrokerOnly] Lockbox on the door', date: at(1) }),   // an internal event, earlier than the others
    show({ id: 'S-3', listing_id: '88', listing: { listing_id: 'OTHER-1' } }),            // another listing's
    show({ id: 'S-4', status: 'cancelled' }),                                              // cancelled
    show({ id: 'S-5', type: 'showing' }),                                                  // a private showing, not an open house
    show({ id: 'S-6', listing_id: '999', date: at(2) }),                                   // by the listing's own id only
    show({ id: 'S-7', listing: undefined, date: at(2) }),                                  // by its numeric id only
    show({ id: 'S-8', date: at(-1) }),                                                     // yesterday's
  ];
  const cards = (b: Booted) => [...b.d.querySelectorAll(`#${prefix}OpenHouseList [data-showing-id]`)] as HTMLElement[];
  const ids = (b: Booted) => cards(b).map((c) => c.getAttribute('data-showing-id'));
  const list = (b: Booted) => b.d.getElementById(`${prefix}OpenHouseList`) as HTMLElement;
  const asked = (b: Booted) => b.requests.filter((r) => /showings/.test(r));

  async function open(showings: unknown, extra: Record<string, unknown> = {}): Promise<Booted> {
    const b = bootViewer(viewer as ViewerFile, { search: `?id=${lid}`, showings, listing: { id: '404', listing_id: lid, status: 'Active', raw_data: {} }, ...extra });
    await until(() => rendered(b.d), 15000);
    if (!extra.noOpenHouses) await until(() => asked(b).length > 0, 5000);                    // (the list says "Loading open houses..." from the moment it asks)
    await until(() => !/Loading open houses/.test(text(list(b))), 5000);
    await sleep(50);
    return b;
  }

  describe('an agent opens a listing that has open houses', () => {
    let main: Booted;
    beforeAll(async () => { main = await open(SHOWINGS); });
    afterAll(() => { main.close(); });

    it('lists the upcoming open houses of the listing as read-only cards (the date, the time, the type and the note), by date, and only those', () => {
      const b = main;
      expect(ids(b)).toEqual(['S-2', 'S-6', 'S-7', 'S-1']);
      const [internal, , , last] = cards(b);
      expect(text(last)).toContain(label(localDay(3)));
      expect(text(last)).toContain('2:00 PM - 4:30 PM');
      expect(text(last)).toContain('Bring ID');
      expect(text(internal)).toContain(label(localDay(1)));
      expect(text(internal)).toContain('Broker Only');
      expect(text(internal)).toContain('Lockbox on the door');
      expect(list(b).querySelectorAll('button')).toHaveLength(0);
      expect(b.d.getElementById(`${prefix}OpenHouseEmpty`)).toBeNull();
      expect(asked(b)).toEqual([
        `GET /api/crm/showings?type=openhouse&date_from=${localDay(0)}&limit=200&offset=0`,
        `GET /api/crm/showings?type=brokersopen&date_from=${localDay(0)}&limit=200&offset=0`,
      ]);
      expect(b.requests.filter((r) => /^(POST|PATCH|PUT|DELETE) /.test(r))).toEqual([]);
      expect(b.errors).toEqual([]);
    });

    it('does nothing for a listing that is not there', () => {
      const b = main;
      const before = asked(b).length;
      expect(() => b.w.viewerShowOpenHouses(prefix, undefined)).not.toThrow();
      expect(() => b.w.viewerShowOpenHouses(prefix, null)).not.toThrow();
      expect(asked(b)).toHaveLength(before);                                                  // only what the listing itself asked for
      expect(ids(b)).toEqual(['S-2', 'S-6', 'S-7', 'S-1']);                                     // and the cards are as they were
    });
  });

  it('finds the listing\'s open house when the route has hundreds of other showings before it (it answers 200 at a time, the oldest first)', async () => {
    const others = Array.from({ length: 450 }, (_, i) => show({ id: `X-${i}`, listing_id: '88', listing: { listing_id: 'OTHER-1' }, date: at(1 + (i % 20)) }));
    const b = await open([...others, show({ id: 'S-LAST', date: at(40) })]);
    try {
      expect(ids(b)).toEqual(['S-LAST']);
      expect(asked(b).filter((r) => /type=openhouse/.test(r))).toEqual([0, 200, 400].map((n) => `GET /api/crm/showings?type=openhouse&date_from=${localDay(0)}&limit=200&offset=${n}`));
      expect(text(b.d.getElementById(`${prefix}OpenHouseList`))).not.toContain('could not be loaded');
    } finally { b.close(); }
  });

  it('shows the internal events (Broker Only) to a broker too', async () => {
    const b = await open(SHOWINGS, { role: 'broker' });
    try {
      expect(ids(b)).toEqual(['S-2', 'S-6', 'S-7', 'S-1']);
    } finally { b.close(); }
  });

  it('says the open houses could not be loaded to a reader who is not an agent or a broker: the route is theirs, and it refuses the others', async () => {
    const b = await open(SHOWINGS, { role: 'buyer' });
    try {
      expect(ids(b)).toEqual([]);
      expect(text(list(b))).toBe('Open houses could not be loaded.');
      expect(text(list(b))).not.toContain('Lockbox');
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });

  it.each(['buyer', 'tenant', 'seller', 'landlord'])('never lists an internal event to a %s, even when the route lets them read the showings; it does not even ask for them', async (role) => {
    const b = await open(SHOWINGS, { role, showingsOpen: true });
    try {
      expect(ids(b)).toEqual(['S-6', 'S-7', 'S-1']);
      expect(list(b).textContent).not.toContain('Lockbox');
      expect(asked(b)).toEqual([`GET /api/crm/showings?type=openhouse&date_from=${localDay(0)}&limit=200&offset=0`]);
    } finally { b.close(); }
  });

  it('says "No upcoming open houses found." when the listing has none', async () => {
    const b = await open([]);
    try {
      expect(ids(b)).toEqual([]);
      expect(text(b.d.getElementById(`${prefix}OpenHouseEmpty`))).toBe('No upcoming open houses found.');
      expect(text(list(b))).not.toContain('Add Open House');
    } finally { b.close(); }
  });

  it.each([[500, 'the route fails'], ['network', 'the network is down']] as const)(
    'says the open houses could not be loaded, not that there are none, when %s (%s)', async (fail, _why) => {
      const b = await open(SHOWINGS, { showingsFail: fail });
      try {
        expect(ids(b)).toEqual([]);
        expect(text(list(b))).toBe('Open houses could not be loaded.');
        expect(b.d.getElementById(`${prefix}OpenHouseEmpty`)).not.toBeNull();
        expect(b.errors).toEqual([]);
      } finally { b.close(); }
    });

  it('says the same before anything is loaded (the page says it itself)', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${viewer}.html`), 'utf8');
    const box = new JSDOM(html).window.document.getElementById(`${prefix}OpenHouseList`);          // (no script is run)
    expect(text(box)).toBe('Open houses could not be loaded.');
  });

  it('a page that could not load the module still renders, with the line the page says itself (it does not know the open houses, so it does not say there are none)', async () => {
    const b = await open(SHOWINGS, { noOpenHouses: true });
    try {
      expect(ids(b)).toEqual([]);
      expect(text(list(b))).toBe('Open houses could not be loaded.');
      expect(asked(b)).toEqual([]);
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });

  it('loads the module before the script of the page itself', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${viewer}.html`), 'utf8');
    const tag = html.indexOf('<script src="js/forms/listing-open-houses.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(html.indexOf('<script src="js/forms/listing-hydration.js"></script>'));
    expect(tag).toBeLessThan(html.indexOf('<script>', tag));
  });
});
