/// <reference types="jest" />
/**
 * What the four listing forms WRITE, and what they read back — the behavioural half of the status-select
 * work (the option-set half is tests/runtime/four-listing-forms-status-select-equivalence.test.ts).
 *
 * Three things are proven here, each by driving real code and asserting on a real result:
 *
 *  1. A workflow word the server mapping HAS can actually be chosen on the page. `select.value = 'Leased'`
 *     is a silent no-op on a select with no such option — the value simply stays where it was — so a rental
 *     agent could not set Leased / LeasedThruUs at all, and no status request was ever issued. Asserted on
 *     the live select in jsdom after the page boots, not on HTML source text.
 *
 *  2. The word the agent chose reaches the REAL handlers and stores the right things: the listing PATCH
 *     (app/api/crm/listings/[id]/route.ts) puts the WORD in raw_data._crmWorkflowStatus, the status PATCH
 *     (app/api/crm/listings/[id]/status/route.ts) puts the live Cotality TOKEN in listings.status, and the
 *     GET projection reads the pair back as the agent's own word with the server's label.
 *
 *  3. LEGACY STORAGE READ-COMPATIBILITY. The stored workflow word is the two-L 'Cancelled' — that spelling
 *     is the live contract (a member of SALE_WORKFLOW_STATUSES / RENTAL_WORKFLOW_STATUSES, written to
 *     raw_data._crmWorkflowStatus), and rows written before the token correction can even carry it in the
 *     `listings.status` column. Both must still LOAD. What is canonical is the DISPLAY: the server's label
 *     is the provider's one-L "Canceled", and the option the page selects must read "Canceled" while its
 *     value stays 'Cancelled'. Proven by feeding the real GET body to the page's own
 *     MallanAPI.renderListingStatus and reading the resulting option out of the DOM — including the
 *     assertion that api-client did NOT have to fabricate a missing option.
 *
 * What this does NOT prove (CLAUDE.md §J.8): the store is in-memory, so nothing here proves the Postgres
 * boundary; and none of it proves a StandardStatus member is live on Cotality — that authority is
 * lib/cotality/generated/contract.ts plus a live probe.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { formStatusForListing } from '@/lib/crm/status-mapping';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');

type Rec = Record<string, unknown>;
const ROOT = resolve(__dirname, '../..');

// ── In-memory persistence (the crm-listing-round-trip.test.ts harness) ────────────────────────────
const store: { rows: Map<string, Rec>; next: bigint } = { rows: new Map(), next: 900n };
function mem() {
  const listing = {
    create: jest.fn(async (args: { data: Rec }) => {
      const row = { id: store.next++, created_at: new Date(), updated_at: new Date(), ...args.data };
      store.rows.set(String(row.id), row);
      return row;
    }),
    findUnique: jest.fn(async (args: { where: Rec }) => {
      const w = args.where;
      if (w.id !== undefined) return store.rows.get(String(w.id)) ?? null;
      if (w.listing_id !== undefined) return [...store.rows.values()].find((r) => r.listing_id === w.listing_id) ?? null;
      return null;
    }),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    update: jest.fn(async (args: { where: Rec; data: Rec }) => {
      const row = store.rows.get(String(args.where.id))!;
      const next = { ...row, ...args.data, updated_at: new Date() };
      store.rows.set(String(row.id), next);
      return next;
    }),
  };
  const prisma: Rec = {
    listing,
    auditEvent: { create: jest.fn(async (a: { data: Rec }) => ({ id: 1n, ...a.data })) },
    protectedPeriod: { findUnique: jest.fn(async () => null), create: jest.fn(async (a: { data: Rec }) => ({ id: 1n, ...a.data })) },
    agent: { findUnique: jest.fn(async () => null) },
    listingSearchProjection: { upsert: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ max_seq: null }]),
  };
  prisma.$transaction = jest.fn(async (cb: (tx: Rec) => unknown) => cb(prisma));
  return prisma;
}
const prismaMock = mem();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' }),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/notifications/engine', () => ({ __esModule: true, createNotification: async () => undefined }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', rebnyListingUrl: 'https://www.mallan.nyc/listing/x' }) }));
jest.mock('@/lib/cache/public-cache', () => {
  const actual = jest.requireActual('@/lib/cache/public-cache');
  return { __esModule: true, ...actual, safeRevalidateTags: async () => undefined };
});

const jsonReq = (body: unknown, method: string, url: string) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function patchListing(id: string, body: Rec) {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(jsonReq(body, 'PATCH', `http://localhost/api/crm/listings/${id}`), { params: Promise.resolve({ id }) });
}
async function patchStatus(id: string, body: Rec) {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/status/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(jsonReq(body, 'PATCH', `http://localhost/api/crm/listings/${id}/status`), { params: Promise.resolve({ id }) });
}
async function getListing(id: string) {
  const { GET } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (GET as any)(new Request(`http://localhost/api/crm/listings/${id}`), { params: Promise.resolve({ id }) });
}

/** A CRM-created (mls_id null) Mallan exclusive of the given transaction, seeded straight into the store. */
function seed(row: Rec): string {
  const id = store.next++;
  store.rows.set(String(id), {
    id,
    listing_id: (row.listing_type === 'sale' ? 'SL-' : 'RL-') + id,
    mls_id: null,
    rls_eligible: false,
    status: 'Active',
    created_at: new Date(),
    updated_at: new Date(),
    raw_data: {},
    address: '400 East 90th Street',
    list_price: 4500,
    living_area: null,
    agent_id: null,
    ...row,
  });
  return String(id);
}
const stored = (id: string) => store.rows.get(id)!;

// ── The page in a real DOM ────────────────────────────────────────────────────────────────────────
class LocalOnly extends jsdom.ResourceLoader {
  fetch(url: string) {
    const m = url.match(/^http:\/\/localhost\/crm\/(.+)$/);
    if (!m) return null;
    try { return Promise.resolve(readFileSync(resolve(ROOT, 'public/crm', m[1].split('?')[0]))); } catch { return null; }
  }
}
const AUTH_ME = { authenticated: true, principalType: 'agent', role: 'broker', portalRole: 'broker', user: { id: '7', name: 'Maya Allan' } };
const respond = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
  headers: new Map([['content-type', 'application/json']]),
});

/**
 * Boot a form page with its api-client wired to the REAL handlers: /api/auth/me answers as Maya, the
 * status-options endpoint answers from the REAL route, and every /api/crm/listings call reaches the real
 * route over the in-memory store. Every request the page made is recorded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPage(file: string, sent: { method: string; path: string; body: Rec | null; status: number }[], query = ''): Promise<any> {
  const html = readFileSync(resolve(ROOT, 'public/crm', file), 'utf8');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(html, {
    url: `http://localhost/crm/${file}${query}`,
    runScripts: 'dangerously',
    resources: new LocalOnly(),
    pretendToBeVisual: true,
    virtualConsole,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeParse(window: any) {
      window.fetch = async (input: unknown, init?: { method?: string; body?: string }) => {
        const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        const method = (init?.method ?? 'GET').toUpperCase();
        const payload: Rec | null = init?.body ? (JSON.parse(init.body) as Rec) : null;
        if (path.startsWith('/api/auth/me')) return respond(200, AUTH_ME);
        if (path.startsWith('/api/crm/status-options')) {
          const { GET } = await import('@/app/api/crm/status-options/route');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (GET as any)(new Request(`http://localhost${path}`));
          const data = JSON.parse(await res.text());
          sent.push({ method, path, body: null, status: res.status });
          return respond(res.status, data);
        }
        const m = path.split('?')[0].match(/^\/api\/crm\/listings\/([^/]+)(\/status)?$/);
        if (m) {
          const [, id, isStatus] = m;
          let res: Response | null = null;
          if (isStatus && method === 'PATCH') res = await patchStatus(id, payload ?? {});
          else if (!isStatus && method === 'PATCH') res = await patchListing(id, payload ?? {});
          else if (!isStatus && method === 'GET') res = await getListing(id);
          if (res) {
            const data = JSON.parse(await res.text());
            sent.push({ method, path: path.split('?')[0], body: payload, status: res.status });
            return respond(res.status, data);
          }
        }
        return respond(200, {});
      };
      window.scrollTo = () => {};
      window.alert = () => {};
      window.confirm = () => true;
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    },
  });
  await new Promise<void>((done) => {
    if (dom.window.document.readyState === 'complete') return done();
    const fallback = setTimeout(done, 8000);
    dom.window.addEventListener('load', () => { clearTimeout(fallback); done(); });
  });
  return dom;
}
const tick = () => new Promise<void>((r) => setTimeout(r, 25));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settled(dom: any): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (dom.window.__mallanStatusOptions && dom.window.__mallanStatusOptions.settled) break;
    await tick();
  }
  await tick();
}

/** Choose a status the way an agent does: set the select and fire its own change handlers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function choose(win: any, formKey: string, word: string): string {
  const select = win.document.getElementById(formKey);
  expect(select).toBeTruthy();
  select.value = word;
  select.dispatchEvent(new win.Event('change', { bubbles: true }));
  return select.value;
}

describe('the status a listing form writes, and the status it reads back', () => {
  jest.setTimeout(300_000);

  describe('RENTAL-FORM-REDESIGN.html — a rental close the server mapping has must be choosable', () => {
    it.each([
      ['Leased', 'Leased'],
      ['LeasedThruUs', 'Leased Thru Us'],
      ['Rented', 'Rented'],
      ['ActiveUnderContract', 'Active Under Contract'],
    ])('%s is a real choice on #rentalStatus and carries the server label "%s"', async (word, label) => {
      const sent: { method: string; path: string; body: Rec | null; status: number }[] = [];
      const dom = await loadPage('RENTAL-FORM-REDESIGN.html', sent);
      await settled(dom);
      const win = dom.window;

      // the agent's choice STICKS — on a select with no such option this is a silent no-op
      expect(choose(win, 'rentalStatus', word)).toBe(word);

      const option = win.document.querySelector(`#rentalStatus option[value="${word}"]`);
      expect(option).toBeTruthy();
      expect(option.textContent.trim()).toBe(label);
      dom.window.close();
    });
  });

  describe('the write reaches the real handlers and stores the live token', () => {
    it('rental Leased → the WORD in raw_data._crmWorkflowStatus, the TOKEN Closed in listings.status, read back as "Leased"', async () => {
      // A rental reaches its close from Pending (Lease Signed), never straight from Active —
      // RENTAL_CANONICAL_TRANSITIONS.Active has no Closed. The row starts where the agent's would.
      const id = seed({ listing_type: 'rent', status: 'Pending', raw_data: { CloseDate: '2026-09-20', ClosePrice: 4800 } });

      // 1. the listing PATCH carries the workflow word the select holds (the form's own field name)
      const saved = await patchListing(id, { rentalStatus: 'Leased' });
      expect(saved.status).toBe(200);
      expect((stored(id).raw_data as Rec)._crmWorkflowStatus).toBe('Leased');

      // 2. the status PATCH resolves it through the RENTAL mapping only
      const moved = await patchStatus(id, { status: 'Leased', facts: { CloseDate: '2026-09-20', ClosePrice: 4800 } });
      expect(moved.status).toBe(200);
      expect(stored(id).status).toBe('Closed');

      // 3. the projection reads the pair back as the agent's own word, with the rental label
      expect(formStatusForListing(stored(id) as never)).toMatchObject({ value: 'Leased', label: 'Leased' });
    });

    it('a rental word is refused on a sale listing (one mapping per transaction — never a shared list)', async () => {
      const id = seed({ listing_type: 'sale', status: 'Active' });
      const res = await patchStatus(id, { status: 'Leased', facts: { CloseDate: '2026-09-20', ClosePrice: 900000 } });
      expect(res.status).toBe(400);
      expect(JSON.parse(await res.text()).code).toBe('form_mapping');
      expect(stored(id).status).toBe('Active');
    });
  });

  describe('legacy storage read-compatibility: the two-L "Cancelled" still loads, and displays as "Canceled"', () => {
    it.each([
      ['sale', 'SALE-FORM-REDESIGN.html', 'saleStatus', ''],
      ['rent', 'RENTAL-FORM-REDESIGN.html', 'rentalStatus', ''],
    ])('%s: a row storing the workflow word "Cancelled" selects value=Cancelled labelled "Canceled"', async (type, file, formKey) => {
      // the token correction spelling in the status column, the two-L workflow word in raw_data
      const id = seed({ listing_type: type, status: 'Canceled', raw_data: { _crmWorkflowStatus: 'Cancelled', CancellationDate: '2026-03-03' } });

      const res = await getListing(id);
      expect(res.status).toBe(200);
      const listing = JSON.parse(await res.text());
      // the server projection keeps the agent's word and applies the provider's one-L label
      expect(listing.form_status).toMatchObject({ value: 'Cancelled', label: 'Canceled' });

      const sent: { method: string; path: string; body: Rec | null; status: number }[] = [];
      const dom = await loadPage(file, sent);
      await settled(dom);
      const win = dom.window;

      const select = win.document.getElementById(formKey);
      const before = select.options.length;
      win.MallanAPI.renderListingStatus(formKey, listing);

      // the stored value loads — and the option was ALREADY there: api-client never had to fabricate one
      expect(select.value).toBe('Cancelled');
      expect(select.options.length).toBe(before);
      const option = win.document.querySelector(`#${formKey} option[value="Cancelled"]`);
      expect(option).toBeTruthy();
      expect(option.textContent.trim()).toBe('Canceled');
      // and the banned two-L spelling is nowhere in what the agent reads
      const labels = Array.prototype.map.call(select.options, (o: HTMLOptionElement) => (o.textContent ?? '').trim());
      expect(labels.join('|')).not.toMatch(/Cancelled/);
      dom.window.close();
    });

    it.each([
      ['sale', 'SALE-FORM-REDESIGN.html', 'saleStatus'],
      ['rent', 'RENTAL-FORM-REDESIGN.html', 'rentalStatus'],
    ])('%s: a row whose status COLUMN is the pre-correction "Cancelled" still loads', async (type, file, formKey) => {
      const id = seed({ listing_type: type, status: 'Cancelled', raw_data: { _crmWorkflowStatus: 'Cancelled', CancellationDate: '2026-03-04' } });
      const res = await getListing(id);
      expect(res.status).toBe(200);
      const listing = JSON.parse(await res.text());
      expect(listing.form_status).toMatchObject({ value: 'Cancelled', label: 'Canceled' });

      const sent: { method: string; path: string; body: Rec | null; status: number }[] = [];
      const dom = await loadPage(file, sent);
      await settled(dom);
      const win = dom.window;
      win.MallanAPI.renderListingStatus(formKey, listing);
      expect(win.document.getElementById(formKey).value).toBe('Cancelled');
      dom.window.close();
    });

    it('the value the form WRITES for a cancellation is the workflow word, and the server stores the one-L token', async () => {
      const id = seed({ listing_type: 'rent', status: 'Active' });
      const sent: { method: string; path: string; body: Rec | null; status: number }[] = [];
      const dom = await loadPage('RENTAL-FORM-REDESIGN.html', sent);
      await settled(dom);
      const win = dom.window;

      // what the agent picks in the DOM is what the page sends — the label is canonical, the value is not touched
      expect(choose(win, 'rentalStatus', 'Cancelled')).toBe('Cancelled');
      const chosen = win.document.getElementById('rentalStatus').value;

      const res = await win.MallanAPI.listings.updateStatus(id, chosen, { CancellationDate: '2026-04-01' });
      const statusCall = sent.filter((s) => s.path.endsWith('/status')).pop();
      expect(statusCall).toBeTruthy();
      expect(statusCall!.body).toMatchObject({ status: 'Cancelled' });
      expect(statusCall!.status).toBe(200);
      expect(res.status).toBe('Canceled');
      expect(stored(id).status).toBe('Canceled');
      expect((stored(id).raw_data as Rec).CancellationDate).toBe('2026-04-01');
      dom.window.close();
    });
  });
});
