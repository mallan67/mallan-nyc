/// <reference types="jest" />
/**
 * MY PROFILE EDITOR — NO SILENT DESTRUCTION OF POPULATED AGENT DATA (2026-09-04)
 *
 * ── The proven defect ─────────────────────────────────────────────────────
 *
 * Executed once against a real record, black-box:
 *
 *   1. The CRM My Profile form loaded with `title`, `bio`, `specialties` and
 *      `languages` EMPTY while `GET /api/crm/agents/me` returned all four
 *      populated. `name` and `phone` hydrated; those four did not. Stable at
 *      t+3s/7s/12s/20s — not a race.
 *
 *   2. Opening the page and pressing Save Changes WITHOUT TOUCHING ANYTHING
 *      sent:
 *          PATCH /api/crm/agents/me
 *          {"title":"","bio":"","specialties":"","languages":"",
 *           "phone":"(646) 418-8388"}
 *      The server answered 200 with
 *          {"updated_fields":["bio","phone","specialties","languages"]}
 *      A 2,829-character bio, four specialties and two languages were
 *      destroyed. The UI displayed "Saved."
 *
 *   3. The UI serialised `specialties`/`languages` as comma-separated STRINGS.
 *      The API accepts only ARRAYS and coerced anything else to `[]`. So those
 *      two fields could not be saved from the CRM at all: every save emptied
 *      them whether or not the user typed a value.
 *
 * ── The chain, not the symptom ────────────────────────────────────────────
 *
 *   GET returns the profile at the TOP LEVEL. The panel read `res.agent`,
 *   which is `undefined`, and fell back to `Store.session.currentUser` — the
 *   `/api/auth/me` shape, which carries `name`/`phone` but has no `bio`,
 *   `specialties`, `languages` or `title`. That is why exactly those four were
 *   blank and exactly the other two were not.
 *
 *   Hydration alone is NOT the fix. The serializer posted EVERY editable
 *   control unconditionally, so any control that fails to hydrate — including
 *   one added years from now — writes its blank DOM default over stored data.
 *   These tests therefore assert the GENERAL fail-safe as well as the four
 *   known fields.
 *
 * ── What these tests assert ───────────────────────────────────────────────
 *
 * End-to-end, over the REAL browser file (`js/dashboard/panels.js`, executed
 * in a `vm` sandbox on a real jsdom document) wired to the REAL route handlers
 * (`app/api/crm/agents/me/route.ts`) over a mutable in-memory record.
 *
 * They assert on the PATCH PAYLOAD **and** on the RESULTING RECORD. A test
 * that asserted only on the response status would pass against the broken
 * version — the broken version returned 200.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const { JSDOM } = require('jsdom');

// ── Prisma: ONE MUTABLE ROW, so a destructive write is VISIBLE ─────────────

type Row = Record<string, unknown>;

const store: { row: Row } = { row: {} };
const updateCalls: Row[] = [];

const agentFindUnique = jest.fn(async () => ({ ...store.row }));
const agentUpdate = jest.fn(async (args: { data: Row }) => {
  updateCalls.push({ ...args.data });
  Object.assign(store.row, args.data);
  return { ...store.row };
});

const agentDelegate = {
  findUnique: (...a: unknown[]) => agentFindUnique(...(a as [])),
  update: (...a: unknown[]) => agentUpdate(...(a as [{ data: Row }])),
};

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    agent: agentDelegate,
    $transaction: async (cb: (tx: unknown) => unknown) => cb({ agent: agentDelegate }),
  },
}));

const AUTH = { userId: 7n, userType: 'agent', role: 'AGENT', sessionId: 'test-session' };

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => AUTH,
  isAuthError: (v: unknown) =>
    typeof v === 'object' && v !== null && 'status' in (v as Record<string, unknown>),
  logAuditEvent: async () => undefined,
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

// ── The stored profile under test ─────────────────────────────────────────

const BIO = 'B'.repeat(2829);
const SPECIALTIES = ['Upper East Side', 'Luxury Condos', 'First-Time Buyers', 'Negotiation'];
const LANGUAGES = ['English', 'Spanish'];
const TITLE = 'Licensed Real Estate Salesperson';
const PHONE = '(646) 418-8388';

function freshRow(): Row {
  return {
    id: 7n,
    first_name: 'Maya',
    last_name: 'Allan',
    full_name: 'Maya Allan',
    email: 'maya@mallan.nyc',
    phone: PHONE,
    license_no: '10311201806',
    license_type: 'salesperson',
    license_expiry: new Date('2027-01-31T00:00:00.000Z'),
    role: 'AGENT',
    status: 'active',
    sale_split: null,
    rental_split: null,
    public_slug: 'maya-allan',
    title: TITLE,
    bio: BIO,
    photo: '/images/agents/maya-allan.jpg',
    specialties: [...SPECIALTIES],
    languages: [...LANGUAGES],
    featured: true,
    created_at: new Date('2024-01-01T00:00:00.000Z'),
  };
}

/** The `/api/auth/me` user shape the CRM caches — NO bio/specialties/languages. */
function sessionUser() {
  return {
    id: '7',
    name: 'Maya Allan',
    email: 'maya@mallan.nyc',
    phone: PHONE,
    license: '10311201806',
    licenseTitle: TITLE,
    mlsId: null,
    companyKey: 'mallan',
    companyName: 'Mallan Real Estate Inc.',
    photo: null,
  };
}

/** Stable, comparable snapshot of the stored row (BigInt/Date safe). */
function snapshot(): string {
  return JSON.stringify(store.row, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v,
  );
}

// ── Browser harness ───────────────────────────────────────────────────────

const CRM_ROOT = path.resolve(__dirname, '../../public/crm');
const P = (rel: string) => path.join(CRM_ROOT, rel);
const src = (f: string) => readFileSync(f, 'utf8');

interface Harness {
  /** Every PATCH body the browser actually sent, parsed. */
  patches: Record<string, unknown>[];
  toasts: { msg: string; kind: string }[];
  value(field: string): string;
  set(field: string, v: string): void;
  render(): Promise<void>;
  save(): Promise<void>;
}

interface HarnessOpts {
  /** Mutate the GET body before the browser sees it (contract-drift cases). */
  mangleGet?: (body: Record<string, unknown>) => Record<string, unknown>;
  /** Make the profile GET reject outright. */
  failGet?: boolean;
  isBroker?: boolean;
}

async function bootProfile(opts: HarnessOpts = {}): Promise<Harness> {
  const { GET, PATCH } = await import('@/app/api/crm/agents/me/route');
  const callGet = GET as unknown as (r: Request) => Promise<Response>;
  const callPatch = PATCH as unknown as (r: Request) => Promise<Response>;

  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>');
  const doc: Document = dom.window.document;
  const content = doc.getElementById('content')!;

  const patches: Record<string, unknown>[] = [];
  const toasts: { msg: string; kind: string }[] = [];

  async function _fetch(url: string, options?: { method?: string; body?: string }) {
    const method = (options && options.method) || 'GET';
    if (url === '/api/crm/agents/me' && method === 'GET') {
      if (opts.failGet) throw new Error('Request failed: 500');
      const res = await callGet(new Request('http://localhost/api/crm/agents/me'));
      const body = (await res.json()) as Record<string, unknown>;
      return opts.mangleGet ? opts.mangleGet(body) : body;
    }
    if (url === '/api/crm/agents/me' && method === 'PATCH') {
      patches.push(JSON.parse(String(options!.body)) as Record<string, unknown>);
      const res = await callPatch(
        new Request('http://localhost/api/crm/agents/me', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: options!.body,
        }),
      );
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Request failed');
      return body;
    }
    throw new Error('unexpected fetch: ' + method + ' ' + url);
  }

  const sandbox: Record<string, unknown> = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Date,
    Math,
    Error,
    RegExp,
    setTimeout,
    document: doc,
    Node: dom.window.Node,
    FormData: dom.window.FormData,
    CRM: {
      setPanelTitle() {},
      getContent: () => content,
      toast(msg: string, kind: string) {
        toasts.push({ msg, kind });
      },
    },
    MallanAPI: { _fetch },
    Store: { session: { currentUser: sessionUser() } },
    Router: { go() {}, navigate() {} },
    Permissions: { can: () => true, isBroker: () => Boolean(opts.isBroker) },
    Events: { on() {}, emit() {}, log() {} },
    Alerts: {},
    Documents: { listAll: () => Promise.resolve({}) },
    Workspace: {},
    ClientNormalizer: { normalize: (c: unknown) => c, normalizeAll: (c: unknown[]) => c },
  };
  sandbox.window = sandbox;
  sandbox.location = { href: '/crm/dashboard.html', hash: '' };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(src(P('js/dashboard/utils.js')), ctx, { filename: 'utils.js' });
  vm.runInContext(src(P('js/dashboard/ui-components.js')), ctx, { filename: 'ui-components.js' });
  vm.runInContext(src(P('js/dashboard/panels.js')), ctx, { filename: 'panels.js' });

  const Panels = sandbox.Panels as Record<string, () => unknown>;

  async function settle() {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  }

  function control(field: string) {
    const el = doc.querySelector('#profileForm [name="' + field + '"]') as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (!el) throw new Error('no control named ' + field);
    return el;
  }

  const h: Harness = {
    patches,
    toasts,
    value: (field) => control(field).value,
    set: (field, v) => {
      control(field).value = v;
    },
    async render() {
      Panels.profile();
      await settle();
    },
    async save() {
      Panels._saveProfile();
      await settle();
    },
  };

  await h.render();
  return h;
}

beforeEach(() => {
  store.row = freshRow();
  updateCalls.length = 0;
  agentFindUnique.mockClear();
  agentUpdate.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
// 0. The response contract the hydration must read
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/crm/agents/me response contract', () => {
  it('returns the profile at the TOP LEVEL, not under an `agent` key', async () => {
    const { GET } = await import('@/app/api/crm/agents/me/route');
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me'),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.agent).toBeUndefined();
    expect(body.bio).toBe(BIO);
    expect(body.title).toBe(TITLE);
    expect(body.specialties).toEqual(SPECIALTIES);
    expect(body.languages).toEqual(LANGUAGES);
  });

  it('owns specialties and languages as ARRAYS', async () => {
    const { GET } = await import('@/app/api/crm/agents/me/route');
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me'),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.specialties)).toBe(true);
    expect(Array.isArray(body.languages)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. HYDRATE
// ═══════════════════════════════════════════════════════════════════════════

describe('the form hydrates from the server response', () => {
  it('shows the stored bio, specialties, languages and title', async () => {
    const h = await bootProfile();
    expect(h.value('bio')).toBe(BIO);
    expect(h.value('specialties')).toBe(SPECIALTIES.join(', '));
    expect(h.value('languages')).toBe(LANGUAGES.join(', '));
    expect(h.value('title')).toBe(TITLE);
    expect(h.value('phone')).toBe(PHONE);
  });

  it('does not fall back to the /api/auth/me session cache when the GET succeeded', async () => {
    const h = await bootProfile();
    // the cache carries no bio at all; if the cache were the source, this is ''
    expect(h.value('bio').length).toBe(2829);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. SAVE WITHOUT TOUCHING ANYTHING — the destroyed-data case
// ═══════════════════════════════════════════════════════════════════════════

describe('open -> Save Changes without touching anything -> reload', () => {
  it('sends no destructive field and leaves the record IDENTICAL', async () => {
    const before = snapshot();

    const h = await bootProfile();
    await h.save();

    // ── the payload ──
    const sent = h.patches[0] || {};
    expect(sent.bio).toBeUndefined();
    expect(sent.specialties).toBeUndefined();
    expect(sent.languages).toBeUndefined();
    expect(sent.phone).toBeUndefined();
    expect(sent.title).toBeUndefined();

    // ── the record ──
    expect(snapshot()).toEqual(before);
    expect(store.row.bio).toBe(BIO);
    expect(store.row.specialties).toEqual(SPECIALTIES);
    expect(store.row.languages).toEqual(LANGUAGES);
  });

  it('reloads to the same profile it opened with', async () => {
    const h = await bootProfile();
    await h.save();
    await h.render();
    expect(h.value('bio')).toBe(BIO);
    expect(h.value('specialties')).toBe(SPECIALTIES.join(', '));
    expect(h.value('languages')).toBe(LANGUAGES.join(', '));
  });

  it('never reports success while destroying data', async () => {
    const h = await bootProfile();
    await h.save();
    expect(h.toasts.filter((t) => t.kind === 'error')).toEqual([]);
    expect(store.row.bio).toBe(BIO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. EDIT AND ROUND-TRIP THE TYPES
// ═══════════════════════════════════════════════════════════════════════════

describe('open -> edit bio, specialties, languages -> save -> reload', () => {
  it('stores the exact intended values, arrays as arrays', async () => {
    const h = await bootProfile();
    h.set('bio', 'A new professional bio.');
    h.set('specialties', 'Negotiation, Buyer Representation');
    h.set('languages', 'English, French');
    await h.save();

    expect(store.row.bio).toBe('A new professional bio.');
    expect(store.row.specialties).toEqual(['Negotiation', 'Buyer Representation']);
    expect(store.row.languages).toEqual(['English', 'French']);

    await h.render();
    expect(h.value('bio')).toBe('A new professional bio.');
    expect(h.value('specialties')).toBe('Negotiation, Buyer Representation');
    expect(h.value('languages')).toBe('English, French');
  });

  it('never sends a STRING the API would coerce to []', async () => {
    const h = await bootProfile();
    h.set('specialties', 'Negotiation, Buyer Representation');
    await h.save();
    const sent = h.patches[0] || {};
    expect(Array.isArray(sent.specialties)).toBe(true);
    expect(sent.specialties).toEqual(['Negotiation', 'Buyer Representation']);
  });

  it('sends ONLY the field that changed', async () => {
    const h = await bootProfile();
    h.set('bio', 'Only the bio moved.');
    await h.save();
    expect(Object.keys(h.patches[0] || {}).sort()).toEqual(['bio']);
  });

  it('a changed phone still saves', async () => {
    const h = await bootProfile();
    h.set('phone', '212-555-1234');
    await h.save();
    expect(h.patches[0]).toEqual({ phone: '212-555-1234' });
    expect(store.row.phone).toBe('212-555-1234');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. THE EXPLICIT CLEARING RULE
// ═══════════════════════════════════════════════════════════════════════════

describe('intentionally clearing an editable field still works', () => {
  it('clearing a populated bio writes an empty bio', async () => {
    const h = await bootProfile();
    h.set('bio', '');
    await h.save();
    expect(h.patches[0]).toEqual({ bio: '' });
    expect(store.row.bio).toBe('');
  });

  it('clearing populated specialties writes an empty ARRAY', async () => {
    const h = await bootProfile();
    h.set('specialties', '');
    await h.save();
    expect(h.patches[0]).toEqual({ specialties: [] });
    expect(store.row.specialties).toEqual([]);
  });

  it('a field that was ALREADY empty is not re-sent as a clear', async () => {
    store.row.bio = '';
    const h = await bootProfile();
    await h.save();
    expect(h.patches.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. REGULATED IDENTITY STAYS PROTECTED
// ═══════════════════════════════════════════════════════════════════════════

describe('title, license_type and role are unwritable from this path', () => {
  it('survive an untouched save', async () => {
    const h = await bootProfile();
    await h.save();
    expect(store.row.title).toBe(TITLE);
    expect(store.row.license_type).toBe('salesperson');
    expect(store.row.role).toBe('AGENT');
  });

  it('survive an edited save', async () => {
    const h = await bootProfile();
    h.set('bio', 'edited');
    await h.save();
    expect(store.row.title).toBe(TITLE);
    expect(store.row.license_type).toBe('salesperson');
    expect(store.row.role).toBe('AGENT');
  });

  it('survive a cleared save', async () => {
    const h = await bootProfile();
    h.set('bio', '');
    await h.save();
    expect(store.row.title).toBe(TITLE);
    expect(store.row.license_type).toBe('salesperson');
    expect(store.row.role).toBe('AGENT');
  });

  it('the browser never puts title, role or license_type in the payload', async () => {
    const h = await bootProfile();
    h.set('bio', 'edited');
    await h.save();
    for (const p of h.patches) {
      expect(p.title).toBeUndefined();
      expect(p.role).toBeUndefined();
      expect(p.license_type).toBeUndefined();
    }
  });

  it('the route refuses to write title even when a body carries one', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    await (PATCH as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Licensed Real Estate Broker', bio: 'x' }),
      }),
    );
    expect(updateCalls[0].title).toBeUndefined();
    expect(updateCalls[0].bio).toBe('x');
    expect(store.row.title).toBe(TITLE);
  });

  it('the route refuses to write role from this path', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    await (PATCH as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'BROKER', bio: 'x' }),
      }),
    );
    expect(updateCalls[0].role).toBeUndefined();
    expect(store.row.role).toBe('AGENT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5b. THE BROKER RENDERING OF THE SAME FORM
// ═══════════════════════════════════════════════════════════════════════════

describe('the broker view of My Profile obeys the same guard', () => {
  it('hydrates the licence class and still sends nothing on an untouched save', async () => {
    const before = snapshot();
    const h = await bootProfile({ isBroker: true });
    expect(h.value('license_type')).toBe('salesperson');
    await h.save();
    expect(h.patches.length).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it('still never offers title as a writable control', async () => {
    const h = await bootProfile({ isBroker: true });
    expect(h.value('title')).toBe(TITLE);
    h.set('bio', 'edited');
    await h.save();
    expect(Object.keys(h.patches[0] || {})).toEqual(['bio']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE GENERAL FAIL-SAFE — not just the four known fields
// ═══════════════════════════════════════════════════════════════════════════

describe('an UNHYDRATED control can never overwrite a stored value', () => {
  it('a field missing from the GET body is never written back blank', async () => {
    // Exactly the shape of a future contract drift: the control exists, the
    // server no longer sends the key, so the control renders blank.
    const h = await bootProfile({
      mangleGet: (b) => {
        const copy = { ...b };
        delete copy.bio;
        return copy;
      },
    });
    expect(h.value('bio')).toBe(''); // unhydrated, by construction
    await h.save();
    expect((h.patches[0] || {}).bio).toBeUndefined();
    expect(store.row.bio).toBe(BIO); // the 2,829 characters survive
  });

  it('the same protection covers specialties and languages', async () => {
    const h = await bootProfile({
      mangleGet: (b) => {
        const copy = { ...b };
        delete copy.specialties;
        delete copy.languages;
        return copy;
      },
    });
    await h.save();
    const sent = h.patches[0] || {};
    expect(sent.specialties).toBeUndefined();
    expect(sent.languages).toBeUndefined();
    expect(store.row.specialties).toEqual(SPECIALTIES);
    expect(store.row.languages).toEqual(LANGUAGES);
  });

  it('a FAILED profile GET cannot be saved over the stored record', async () => {
    const before = snapshot();
    const h = await bootProfile({ failGet: true });
    await h.save();
    expect(h.patches.length).toBe(0);
    expect(snapshot()).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. THE SERVER REFUSES THE COERCION THAT DESTROYED THE ARRAYS
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH refuses a non-array specialties/languages instead of storing []', () => {
  it('a comma-separated STRING is a 400, not a silent wipe', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    const res = await (PATCH as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ specialties: 'Negotiation, Buyer Representation' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(store.row.specialties).toEqual(SPECIALTIES);
  });

  it('an empty STRING is a 400, not a silent wipe', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    const res = await (PATCH as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ languages: '' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(store.row.languages).toEqual(LANGUAGES);
  });

  it('an explicit empty ARRAY still clears', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    const res = await (PATCH as unknown as (r: Request) => Promise<Response>)(
      new Request('http://localhost/api/crm/agents/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ specialties: [] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(store.row.specialties).toEqual([]);
  });
});
