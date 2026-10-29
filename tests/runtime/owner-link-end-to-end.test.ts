/// <reference types="jest" />
/**
 * The owner / client relationship, end to end, on a rollback-only fixture (Maya, 2026-10-28 closing brief, item 3):
 *   the REAL Sale form page (jsdom) → its Owner picker → Save Draft → the REAL create route → the REAL read route → the form reloaded
 *   in edit mode (the picker shows the owner by name) → the owner changed → Save → the REAL edit route → reloaded again → the REAL list
 *   route with ?owner_client_id= (what the client workspace's Owned Listings card calls).
 * Every row lives in memory (tests/runtime/in-memory-prisma.ts); no database, no SL-0008, no existing record is touched.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NextRequest } from 'next/server';
import { inMemoryPrisma } from './in-memory-prisma';
import { makeRequest, readJson } from './helpers';
import { PAGE_MODULES } from './add-form-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');
jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const BROKER_ID = 7n;
const CLIENTS = [
  { id: 12n, agent_id: BROKER_ID, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.test', roles: ['seller'], status: 'active' },
  { id: 56n, agent_id: BROKER_ID, first_name: 'Diego', last_name: 'Gomez', email: 'diego@example.test', roles: ['landlord'], status: 'active' },
];
const { prisma: prismaMock, tables } = inMemoryPrisma({ lead: CLIENTS, agent: [{ id: BROKER_ID, role: 'BROKER', trestle_mls_id: null, first_name: 'Maya', last_name: 'Allan' }] });
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 7n, userType: 'agent', role: 'BROKER' })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/cache/public-cache', () => ({ __esModule: true, safeRevalidateTags: jest.fn(), listingCacheTag: (id: string) => `listing:${id}`, buildingAndManifestInvalidationTags: () => [], SEARCH_CACHE_TAG: 'search' }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));
jest.mock('@/lib/notifications/engine', () => ({ __esModule: true, createNotification: jest.fn(async () => undefined) }));

import { POST, GET as LIST } from '@/app/api/crm/listings/route';
import { GET as GET_ONE, PATCH } from '@/app/api/crm/listings/[id]/route';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 20000, what = 'condition') { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(50); } }

/** The route answer as the API client would hand it to the page: the JSON body, or a thrown error carrying the server's words. */
async function answer(p: Promise<Response>) {
  const res = await p; const json: any = await readJson(res);
  if (!res.ok) { const e: any = new Error(json?.error || `Request failed: ${res.status}`); e.status = res.status; e.data = json; throw e; }
  return json;
}
const routeCalls: string[] = [];

/** The real Sale form page, its API client replaced by the real route handlers over the in-memory rows. */
async function bootSaleForm(search: string) {
  const html = read('public/crm/SALE-FORM-REDESIGN.html');
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: any) => errors.push(String(e?.detail?.message ?? e?.message)));
  const user = { id: 'AG-9', mlsId: '39361', name: 'Sender Agent', email: 'sender@mallan.nyc', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' };
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/SALE-FORM-REDESIGN.html${search}`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(w: any) {
      w.tailwind = { config: {} };
      w.alert = () => undefined; w.confirm = () => true; w.scrollTo = () => undefined; w.print = () => undefined;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      const context = { authenticated: true, role: 'agent', portalRole: 'agent', user };
      w.MallanAPI = {
        isReady: true,
        onReady: (cb: (u: unknown) => void) => w.setTimeout(() => cb(user), 5),
        getContext: () => context,
        init: () => Promise.resolve({ authenticated: true, user }),
        listings: {
          create: (payload: Record<string, unknown>) => { routeCalls.push('POST /api/crm/listings'); return answer(POST(makeRequest({ method: 'POST', body: payload }))); },
          update: (id: unknown, payload: Record<string, unknown>) => { routeCalls.push(`PATCH /api/crm/listings/${id}`); return answer(PATCH(makeRequest({ method: 'PATCH', body: payload }), { params: Promise.resolve({ id: String(id) }) })); },
          get: (id: unknown) => { routeCalls.push(`GET /api/crm/listings/${id}`); return answer(GET_ONE(makeRequest({ method: 'GET' }), { params: Promise.resolve({ id: String(id) }) })); },
          updateStatus: async () => ({}),
        },
        clients: { list: async () => ({ clients: CLIENTS.map((c) => ({ id: String(c.id), first_name: c.first_name, last_name: c.last_name, email: c.email, roles: c.roles })) }) },
        idx: { search: async () => ({ results: [] }) },
        _fetch: async () => ({ members: [] }),
      };
      for (const name of PAGE_MODULES) w.eval(read(`public/crm/js/forms/${name}.js`));
    },
  });
  await sleep(1200);
  return { w: dom.window as any, d: dom.window.document as Document, errors, close: () => dom.window.close() };
}

const picker = (d: Document) => d.getElementById('saleOwnerClientId') as HTMLSelectElement;
const pickerText = (d: Document) => { const s = picker(d); return s.options[s.selectedIndex]?.textContent ?? null; };

describe('Owner picker → save → reload → edit → reload → Owned Listings, on the real pages and routes over in-memory rows', () => {
  let dbId = '';
  let listingId = '';

  it('1. a new Sale listing saved as Draft with an owner picked: the create route stores the typed column', async () => {
    const f = await bootSaleForm('');
    try {
      await until(() => picker(f.d)?.dataset.loaded === 'true', 10000, 'the Owner picker to load the CRM clients');
      expect([...picker(f.d).options].map((o) => o.textContent)).toEqual(['— No owner linked —', 'Ada Lovelace (seller)', 'Diego Gomez (landlord)']);
      (f.d.getElementById('saleStreetAddress') as HTMLInputElement).value = '400 East 90th Street';
      (f.d.getElementById('saleUnitNumber') as HTMLInputElement).value = 'E2E-17C';
      (f.d.getElementById('salePrice') as HTMLInputElement).value = '1250000';
      picker(f.d).value = '56';
      f.w.manualSaveDraft();
      await until(() => tables.listing?.length === 1 && !!f.w._saleEditDbId, 20000, 'the Draft to be created through the route');
      const row = tables.listing[0];
      dbId = String(row.id); listingId = String(row.listing_id);
      expect(listingId).toMatch(/^SL-\d{4}$/);
      expect(listingId).not.toBe('SL-0008');
      expect(row.status).toBe('Draft');
      expect(String(row.owner_client_id)).toBe('56');
      expect(row.raw_data).not.toHaveProperty('owner_client_id');          // the typed column, never a raw_data key
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('2. reloaded in edit mode: the read route serialises the owner and the picker shows the client by name', async () => {
    const f = await bootSaleForm(`?id=${dbId}`);
    try {
      await until(() => f.w._saleEditLoad === 'loaded', 20000, 'the listing to load through the route');
      await until(() => picker(f.d)?.dataset.loaded === 'true' && picker(f.d).value === '56', 10000, 'the picker to show the stored owner');
      expect(pickerText(f.d)).toBe('Diego Gomez (landlord)');
      expect(f.w.collectSaleFormData().owner_client_id).toBe('56');
      expect((f.d.getElementById('saleListingIdDisplay') as HTMLElement).textContent).toBe(listingId);
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('3. the owner changed and saved: the edit route re-links (connect), the row is updated, nothing is created', async () => {
    const f = await bootSaleForm(`?id=${dbId}`);
    try {
      await until(() => f.w._saleEditLoad === 'loaded' && picker(f.d)?.dataset.loaded === 'true', 20000, 'the listing and the picker');
      picker(f.d).value = '12';
      const before = routeCalls.length;
      f.w.manualSaveDraft();
      await until(() => routeCalls.slice(before).some((c) => c.startsWith('PATCH')) && String(tables.listing[0].owner_client_id) === '12', 20000, 'the edit to reach the route');
      expect(tables.listing.length).toBe(1);                                 // an edit, never a second create
      expect(routeCalls.slice(before).filter((c) => c.startsWith('POST'))).toEqual([]);
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('4. reloaded once more: the new owner survives', async () => {
    const f = await bootSaleForm(`?id=${dbId}`);
    try {
      await until(() => f.w._saleEditLoad === 'loaded' && picker(f.d)?.value === '12', 20000, 'the picker to show the new owner');
      expect(pickerText(f.d)).toBe('Ada Lovelace (seller)');
      expect(f.w.collectSaleFormData().owner_client_id).toBe('12');
    } finally { f.close(); }
  });

  it('5. the client workspace reads Owned Listings through the list route filtered by owner_client_id', async () => {
    const owned = async (client: string) => (await readJson<{ listings: Array<{ listing_id: string; owner_client_id: string }> }>(await LIST(new NextRequest(`http://localhost/api/crm/listings?owner_client_id=${client}&limit=50`)))).listings;
    expect((await owned('12')).map((l) => [l.listing_id, l.owner_client_id])).toEqual([[listingId, '12']]);
    expect(await owned('56')).toEqual([]);
    // the card calls exactly this
    expect(read('public/crm/js/dashboard/workspace.js')).toContain("MallanAPI.listings.list({ owner_client_id: _clientId, limit: 50 })");
  });

  it('6. the fixture touched nothing else: one listing, the two seeded clients unchanged, no real record', () => {
    expect(tables.listing.map((l) => l.listing_id)).toEqual([listingId]);
    expect(tables.lead.map((l) => [String(l.id), l.first_name])).toEqual([['12', 'Ada'], ['56', 'Diego']]);
    expect(routeCalls.every((c) => !/SL-0008|RL-0001/.test(c))).toBe(true);
  });
});
