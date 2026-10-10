/// <reference types="jest" />
/**
 * Co-listing agents on the Sale and Rental Redesign forms, proven create -> save -> reload -> edit -> save -> reload.
 *
 * The REAL pages run in jsdom with a stubbed network; the save goes through the REAL edit route (mocked prisma) and the stored row is
 * handed back to the form's own edit hydration, so every step between a click in the form and the value shown after reload is real code.
 *
 * Live Cotality (2026-10-06): Property keeps up to three co-listing agents (CoListAgent, CoListAgent2, CoListAgent3) and two co-listing
 * offices (CoListOffice, CoListOffice2), separate from the primary ListAgent and ListOffice fields, independent of the listing agreement. The cases
 * below all occur in the feed: two agents of one office, two offices of one firm (Corcoran Group's 334 and 40076 share main office 334),
 * and agents of different firms.
 */
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
const requireAgentOrBrokerMock: jest.Mock = jest.fn();
const isAuthErrorMock: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> => requireAgentOrBrokerMock(req),
  isAuthError: (v: unknown): boolean => Boolean(isAuthErrorMock(v)),
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', realPlusUrl: 'https://realplus/x' }) }));

import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');
jest.setTimeout(90000);

/* eslint-disable @typescript-eslint/no-explicit-any */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Member = { key: string; mlsId: string; fullName: string; status: string; officeKey: string; officeMlsId: string; officeName: string };
const DIRECTORY: Member[] = [
  { key: '25233925', mlsId: '108207', fullName: 'Caroline Gruchawka', status: 'Active', officeKey: '5658932', officeMlsId: '7222', officeName: 'Compass' },
  { key: '25277777', mlsId: '70707', fullName: 'Dara Dixon', status: 'Active', officeKey: '5658932', officeMlsId: '7222', officeName: 'Compass' },
  { key: '25211111', mlsId: '97052', fullName: 'Paeder Alexander Varnam', status: 'Active', officeKey: '5658936', officeMlsId: '334', officeName: 'Corcoran Group' },
  { key: '25222222', mlsId: '94043', fullName: 'Angelina C Martinez', status: 'Active', officeKey: '5700001', officeMlsId: '40076', officeName: 'Corcoran Group' },
  { key: '25244444', mlsId: '555', fullName: 'Pat Elliman', status: 'Active', officeKey: '5658911', officeMlsId: '51', officeName: 'Douglas Elliman Real Estate' },
  { key: '25255555', mlsId: '42201', fullName: 'LEDA GORGONE', status: 'Active', officeKey: '5671398', officeMlsId: '7041', officeName: 'MAllan Real Estate Inc' },
];

function directory(path: string, rows: Member[] = DIRECTORY) {
  const q = new URL(path, 'https://mallan.nyc').searchParams;
  const words = (q.get('name') || '').toLowerCase().split(/\s+/).filter(Boolean);
  const ids = (q.get('mlsId') || '').split(',').filter(Boolean);
  const firm = (q.get('firm') || '').toLowerCase();
  const hit = rows.filter((m) =>
    (!ids.length || ids.includes(m.mlsId)) && words.every((w) => m.fullName.toLowerCase().includes(w)) && (!firm || m.officeName.toLowerCase().includes(firm)));
  return { members: hit, total: hit.length, source: 'cotality-live' };
}

type Booted = { w: any; d: Document; errors: string[]; close: () => Promise<void> };

async function boot(form: string, handler: (path: string) => unknown = (p) => directory(p)): Promise<Booted> {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => errors.push(String(e.detail?.message ?? e.message)));
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${form}.html`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w: any) {
      w.tailwind = { config: {} };
      w.alert = () => undefined; w.confirm = () => true; w.scrollTo = () => undefined; w.print = () => undefined;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      const context = { authenticated: true, role: 'agent', portalRole: 'agent' };
      w.MallanAPI = {
        onReady: (cb: () => void) => setTimeout(cb, 5),
        getContext: () => context,
        init: () => Promise.resolve({ authenticated: true, user: { id: 'AG-9', mlsId: '39361', name: 'Sender Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } }),
        listings: { get: async () => ({}), update: async () => ({}), updateStatus: async () => ({}) },
        idx: { search: async () => ({ results: [] }) },
        _fetch: async (path: string) => {
          if (!path.startsWith('/api/crm/directory/members')) return {};
          const out = handler(path);
          if (out instanceof Error) throw out;
          return out;
        },
      };
      // jsdom does not fetch external scripts: load the shared scripts the page references (their tags are asserted separately below),
      // before any page script runs, in the order the page lists them.
      for (const file of ['directory-picker', 'colist-section', 'agent-defaults', 'listing-hydration']) w.eval(readFileSync(resolve(__dirname, `../../public/crm/js/forms/${file}.js`), 'utf8'));
    },
  });
  await sleep(1000);
  return { w: dom.window, d: dom.window.document, errors, close: async () => { await sleep(300); dom.window.close(); } };
}

// ── The real edit route, over an in-memory row ─────────────────────────────────────────────────────────────
let stored: Record<string, any>;
function freshRow() {
  return {
    id: 404n, listing_id: 'SL-0404', mls_id: null, status: 'Draft', rls_eligible: false, listing_type: 'sale', agent_id: 5n,
    raw_data: {}, address: {}, features: {}, internet_address_display_yn: false, agent_info: {},
    list_agent_full_name: 'Maya Allan', list_office_name: 'Mallan Real Estate Inc.', list_agent_email: 'maya@mallan.nyc', list_agent_direct_phone: '646-000-0000',
    list_office_mls_id: '7041', list_agent_mls_id: '39361', co_list_office_mls_id: null, co_list_agent_mls_id: null,
  };
}
function wirePrisma() {
  const m = prismaMock as any;
  m.agent.findUnique = jest.fn(async () => ({ id: 5n, full_name: 'Maya Allan', first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc', phone: '646-000-0000' }));
  m.listing.findUnique = jest.fn(async () => stored);
  m.listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => {
    stored = { ...stored, ...args.data };
    return stored;
  });
}
async function saveThroughRoute(body: Record<string, unknown>): Promise<void> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request('http://localhost/api/crm/listings/404', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const res = await (PATCH as any)(req, { params: Promise.resolve({ id: '404' }) });
  if (res.status >= 400) throw new Error(`PATCH answered ${res.status}: ${JSON.stringify(await res.json())}`);
}
const asApiListing = () => ({
  ...JSON.parse(JSON.stringify(stored, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
  agent_info: {}, address: stored.address || {}, features: stored.features || {}, media: [],
});

beforeEach(() => {
  stored = freshRow();
  wirePrisma();
  requireAgentOrBrokerMock.mockReset().mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' });
  isAuthErrorMock.mockReset().mockReturnValue(false);
});

const coList = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([k]) => /^CoList(Agent|Office)/.test(k)));
const BLANK = {
  CoListAgentMlsId: '', CoListAgentFullName: '', CoListAgentKey: '', CoListAgent2MlsId: '', CoListAgent2FullName: '', CoListAgent2Key: '',
  CoListAgent3MlsId: '', CoListAgent3FullName: '', CoListAgent3Key: '',
  CoListOfficeMlsId: '', CoListOfficeName: '', CoListOfficeKey: '', CoListOffice2MlsId: '', CoListOffice2Name: '', CoListOffice2Key: '',
};

describe.each([
  ['SALE-FORM-REDESIGN', 'collectSaleFormData', '_populateSaleFormFromApi', 'addSaleCoListAgent', 'saleCoListAgentsContainer', 'saleAgentContactsTable'],
  ['RENTAL-FORM-REDESIGN', 'collectRentalFormData', '_populateRentalFormFromApi', 'addRentalCoListAgent', 'rentalCoListAgents', 'rentalAgentContactsTable'],
] as const)('%s: co-listing agents', (form, collectFn, populateFn, addFn, containerId, tableId) => {
  let page: Booted;
  beforeAll(async () => { page = await boot(form); });
  afterAll(async () => { await page.close(); });

  const rows = (p: Booted = page) => [...p.d.querySelectorAll(`#${containerId} [data-colist-row]`)] as HTMLElement[];
  const typeInto = async (p: Booted, row: HTMLElement, text: string) => {
    const input = row.querySelector('[data-colist-picker] input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    await sleep(330); // the picker debounces 250 ms
  };
  const pick = (p: Booted, row: HTMLElement, index = 0) =>
    ([...row.querySelectorAll('[role="option"]')][index] as HTMLElement).dispatchEvent(new p.w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const addAgent = async (text: string, p: Booted = page) => {
    p.w[addFn]();
    const row = rows(p)[rows(p).length - 1];
    await typeInto(p, row, text);
    pick(p, row, 0);
    return row;
  };
  const clearAll = (p: Booted = page) => { rows(p).forEach((r) => (r.querySelector('[data-colist-remove]') as HTMLElement).click()); };
  const reload = async (p: Booted = page) => { clearAll(p); p.w[populateFn](asApiListing()); await sleep(150); };

  beforeEach(() => { clearAll(); });

  it('boots clean, shows the empty note once, and sends every co-list key blank', () => {
    expect([...new Set(page.errors)]).toEqual([]);
    expect(page.d.querySelectorAll(`#${containerId} [data-colist-empty]`)).toHaveLength(1);
    expect(coList(page.w[collectFn]())).toEqual(BLANK);
  });

  it('the page loads the directory picker, then the co-list section, after the API client', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
    const api = html.indexOf('<script src="js/core/api-client.js"></script>');
    const picker = html.indexOf('<script src="js/forms/directory-picker.js"></script>');
    const section = html.indexOf('<script src="js/forms/colist-section.js"></script>');
    expect(api).toBeGreaterThan(-1);
    expect(picker).toBeGreaterThan(api);
    expect(section).toBeGreaterThan(picker);
  });

  it('two agents of one office (a Mallan co-listing agent): one agent, one office, the primary side untouched', async () => {
    await addAgent('leda');
    const payload = page.w[collectFn]();
    expect(coList(payload)).toEqual({
      ...BLANK, CoListAgentMlsId: '42201', CoListAgentFullName: 'LEDA GORGONE', CoListAgentKey: '25255555',
      CoListOfficeMlsId: '7041', CoListOfficeName: 'MAllan Real Estate Inc', CoListOfficeKey: '5671398',
    });
    expect(payload.ListAgentMlsId).not.toBe('42201'); // the primary side is separate
  });

  it('two offices of one firm: both offices are recorded, nothing assumes they are one company', async () => {
    await addAgent('paeder');
    await addAgent('angelina');
    expect(coList(page.w[collectFn]())).toMatchObject({
      CoListAgentMlsId: '97052', CoListAgent2MlsId: '94043',
      CoListOfficeMlsId: '334', CoListOfficeName: 'Corcoran Group', CoListOffice2MlsId: '40076', CoListOffice2Name: 'Corcoran Group',
    });
  });

  it('three agents of two firms: offices are deduplicated, so the third agent shares an office slot', async () => {
    await addAgent('caroline');
    await addAgent('paeder');
    await addAgent('dara');
    expect(coList(page.w[collectFn]())).toMatchObject({
      CoListAgentMlsId: '108207', CoListAgent2MlsId: '97052', CoListAgent3MlsId: '70707',
      CoListOfficeMlsId: '7222', CoListOffice2MlsId: '334',
    });
  });

  it('a third distinct office is refused with a visible reason, because Cotality has only two co-listing office slots', async () => {
    await addAgent('caroline');
    await addAgent('paeder');
    const refused = await addAgent('pat');
    expect(refused.querySelector('[data-colist-error]')?.textContent).toMatch(/at most two co-listing offices/);
    const out = coList(page.w[collectFn]());
    expect(out).toMatchObject({ CoListAgentMlsId: '108207', CoListAgent2MlsId: '97052', CoListAgent3MlsId: '', CoListOfficeMlsId: '7222', CoListOffice2MlsId: '334' });
  });

  it('the same agent cannot be added twice, and no more than three agents can be added', async () => {
    await addAgent('caroline');
    const duplicate = await addAgent('caroline');
    expect(duplicate.querySelector('[data-colist-error]')?.textContent).toMatch(/already listed/);
    expect(coList(page.w[collectFn]()).CoListAgent2MlsId).toBe('');
    clearAll();
    for (let i = 0; i < 5; i++) page.w[addFn]();
    expect(rows()).toHaveLength(3);
  });

  it('a firm filter narrows the agent search', async () => {
    page.w[addFn]();
    const row = rows()[0];
    (row.querySelector('[data-colist-firm]') as HTMLInputElement).value = 'corcoran';
    await typeInto(page, row, 'a'); // too short on its own
    await typeInto(page, row, 'an');
    const names = [...row.querySelectorAll('[role="option"]')].map((o) => o.textContent || '');
    expect(names.join('|')).toContain('Angelina C Martinez');
    expect(names.join('|')).not.toContain('Caroline');
  });

  it('create -> save -> reload -> edit -> save -> reload through the real edit route and the form\'s own hydration', async () => {
    await addAgent('caroline');
    await addAgent('paeder');
    const created = page.w[collectFn]();
    await saveThroughRoute(created);
    expect(stored.co_list_agent_mls_id).toBe('108207'); // typed columns follow slot 1
    expect(stored.co_list_office_mls_id).toBe('7222');
    expect(coList(stored.raw_data)).toEqual({
      ...BLANK, CoListAgentMlsId: '108207', CoListAgentFullName: 'Caroline Gruchawka', CoListAgentKey: '25233925',
      CoListAgent2MlsId: '97052', CoListAgent2FullName: 'Paeder Alexander Varnam', CoListAgent2Key: '25211111',
      CoListOfficeMlsId: '7222', CoListOfficeName: 'Compass', CoListOfficeKey: '5658932',
      CoListOffice2MlsId: '334', CoListOffice2Name: 'Corcoran Group', CoListOffice2Key: '5658936',
    });
    // the primary side comes only from the primary payload keys: the co-list identifiers never land in the primary typed columns
    expect(stored.list_agent_mls_id).toBe(created.ListAgentMlsId || null);
    expect(stored.list_agent_mls_id).not.toBe('108207');

    await reload(); // a reload shows the same two agents and re-saves the same keys
    expect(rows()).toHaveLength(2);
    expect(coList(page.w[collectFn]())).toEqual(coList(created));

    // edit: drop the first agent; the second moves to slot 1 and the cleared slots are cleared on save
    (rows()[0].querySelector('[data-colist-remove]') as HTMLElement).click();
    const edited = page.w[collectFn]();
    expect(coList(edited)).toEqual({
      ...BLANK, CoListAgentMlsId: '97052', CoListAgentFullName: 'Paeder Alexander Varnam', CoListAgentKey: '25211111',
      CoListOfficeMlsId: '334', CoListOfficeName: 'Corcoran Group', CoListOfficeKey: '5658936',
    });
    await saveThroughRoute(edited);
    expect(stored.co_list_agent_mls_id).toBe('97052');
    expect(stored.co_list_office_mls_id).toBe('334');
    expect(coList(stored.raw_data)).toEqual(coList(edited));

    await reload();
    expect(rows()).toHaveLength(1);
    expect(coList(page.w[collectFn]())).toEqual(coList(edited));

    // remove the last co-listing agent: everything is cleared, typed columns included
    (rows()[0].querySelector('[data-colist-remove]') as HTMLElement).click();
    await saveThroughRoute(page.w[collectFn]());
    expect(stored.co_list_agent_mls_id).toBeNull();
    expect(stored.co_list_office_mls_id).toBeNull();
    expect(coList(stored.raw_data)).toEqual(BLANK);
    await reload();
    expect(rows()).toHaveLength(0);
  });

  it('a listing stored without co-list keys loads with no co-listing agents and saves with every key blank', async () => {
    await reload();
    expect(rows()).toHaveLength(0);
    expect(coList(page.w[collectFn]())).toEqual(BLANK);
  });

  it('hydration prefers the typed co-list MLS IDs and falls back to raw_data', async () => {
    stored.raw_data = {};
    stored.co_list_agent_mls_id = '97052';
    stored.co_list_office_mls_id = '334';
    await reload();
    expect(rows()).toHaveLength(1);
    expect(coList(page.w[collectFn]())).toMatchObject({ CoListAgentMlsId: '97052', CoListOfficeMlsId: '334' });
  });

  it('co-list agents appear in the agent contacts table as text, never as HTML', async () => {
    const hostile = await boot(form, (p) =>
      directory(p, [{ ...DIRECTORY[5], fullName: '<img src=x onerror="window.__pwned=1">', officeName: '<b>office</b>' }]));
    try {
      const row = await (async () => { hostile.w[addFn](); const r = rows(hostile)[0]; await typeInto(hostile, r, 'img'); pick(hostile, r, 0); return r; })();
      const table = hostile.d.getElementById(tableId) as HTMLElement;
      expect(table.querySelector('tr[data-colist="1"]')?.textContent).toContain('<img src=x');
      expect(table.querySelector('img')).toBeNull();
      expect(table.querySelector('b')).toBeNull();
      expect(row.querySelector('img')).toBeNull();
      expect(hostile.w.__pwned).toBeUndefined();
    } finally { await hostile.close(); }
  });

  it('if the directory is unavailable on reload, the stored names stay and a re-save keeps the stored offices', async () => {
    stored.raw_data = {
      CoListAgentMlsId: '108207', CoListAgentFullName: 'Caroline Gruchawka', CoListAgentKey: '25233925',
      CoListOfficeMlsId: '7222', CoListOfficeName: 'Compass', CoListOfficeKey: '5658932',
    };
    stored.co_list_agent_mls_id = '108207';
    stored.co_list_office_mls_id = '7222';
    const down = await boot(form, () => new Error('directory down'));
    try {
      down.w[populateFn](asApiListing());
      await sleep(200);
      expect(coList(down.w[collectFn]())).toMatchObject({
        CoListAgentMlsId: '108207', CoListAgentFullName: 'Caroline Gruchawka', CoListAgentKey: '25233925',
        CoListOfficeMlsId: '7222', CoListOfficeName: 'Compass', CoListOfficeKey: '5658932',
      });
    } finally { await down.close(); }
  });
});
