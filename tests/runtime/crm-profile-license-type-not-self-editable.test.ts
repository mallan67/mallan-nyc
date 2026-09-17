/// <reference types="jest" />
/**
 * `Agent.license_type` HAS EXACTLY ONE CANONICAL WRITER (2026-09-04)
 *
 * ── The fact and its authority ────────────────────────────────────────────
 *
 * `Agent.license_type` is the NY LICENCE CLASS — a governed regulated identity
 * fact, and the sole input from which the advertised 19 NYCRR §175.25
 * professional designation (`Agent.title`) is derived. Its ONE canonical
 * writer is:
 *
 *   Broker Agent Management -> PATCH /api/crm/agents/[id] (requireBroker)
 *                           -> Agent.license_type -> canonicalTitleFor()
 *
 * `/api/crm/agents/me` is the SELF-SERVICE PROFILE route. Self-service profile
 * facts are bio, photo, specialties, languages and phone. The licence class is
 * not one of them, and this route was a SECOND writer of it: a BROKER's
 * `license_type` was accepted here and `title` re-derived from it, entirely
 * outside the governed Agent Management path.
 *
 * ── Why a silent drop would be the wrong fix ──────────────────────────────
 *
 * Ignoring the field and answering 200 is a FALSE SUCCESS — the same defect
 * class this branch exists to remove: My Profile rendered an editable `title`
 * that the route silently discarded, so typing a designation and pressing Save
 * reported success and changed nothing. A supplied `license_type` is therefore
 * REFUSED, loudly, with 403, and the affordance is closed at BOTH ends: the
 * browser no longer offers a writable control either.
 *
 * ── What these tests assert ───────────────────────────────────────────────
 *
 * The route cases call the REAL handlers over a mutable in-memory record and
 * assert the STATUS, the BODY and the RESULTING RECORD. A status-only
 * assertion is not enough: the pre-change route answered 200 and wrote.
 *
 * The UI cases execute the REAL browser file (`js/dashboard/panels.js`) in a
 * `vm` sandbox on a real jsdom document and assert the RENDERED CONTROL — not
 * the field table it was built from. A field-table assertion would pass
 * against a UI that still presented an editable input.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const { JSDOM } = require('jsdom');

// ── Prisma: ONE MUTABLE ROW, so any write is VISIBLE ──────────────────────

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

/** Mutable so a case can run as the BROKER or as a plain licensee. */
const auth: { role: string; userType: string } = { role: 'BROKER', userType: 'agent' };
const AUTH = () => ({ userId: 7n, sessionId: 'test-session', ...auth });

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => AUTH(),
  // The canonical Agent Management writer. Authorised in every case below —
  // the point of section 3 is that CLOSING the self-service path did not
  // close it.
  requireBroker: async () => AUTH(),
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
const PHONE = '(646) 418-8388';

/** licence class -> the ONE §175.25 designation derived from it. */
const DESIGNATION: Record<string, string> = {
  salesperson: 'Licensed Real Estate Salesperson',
  associate_broker: 'Licensed Associate Real Estate Broker',
  broker: 'Licensed Real Estate Broker',
};

function freshRow(licenseType = 'salesperson', role = 'SALESPERSON'): Row {
  return {
    id: 7n,
    first_name: 'Maya',
    last_name: 'Allan',
    full_name: 'Maya Allan',
    email: 'maya@mallan.nyc',
    phone: PHONE,
    license_no: '10311201806',
    license_type: licenseType,
    license_expiry: new Date('2027-01-31T00:00:00.000Z'),
    role,
    status: 'active',
    sale_split: null,
    rental_split: null,
    public_slug: 'maya-allan',
    title: DESIGNATION[licenseType],
    bio: BIO,
    photo: '/images/agents/maya-allan.jpg',
    specialties: [...SPECIALTIES],
    languages: [...LANGUAGES],
    featured: true,
    trestle_mls_id: null,
    created_at: new Date('2024-01-01T00:00:00.000Z'),
  };
}

/** The `/api/auth/me` user shape the CRM caches. */
function sessionUser() {
  return {
    id: '7',
    name: 'Maya Allan',
    email: 'maya@mallan.nyc',
    phone: PHONE,
    license: '10311201806',
    licenseTitle: DESIGNATION.salesperson,
    photo: null,
  };
}

/** Stable, comparable snapshot of the stored row (BigInt/Date safe). */
function snapshot(): string {
  return JSON.stringify(store.row, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v,
  );
}

type Res = { status: number; body: Record<string, unknown> };

async function patchMe(body: unknown): Promise<Res> {
  const { PATCH } = await import('@/app/api/crm/agents/me/route');
  const res = await (PATCH as unknown as (r: Request) => Promise<Response>)(
    new Request('http://localhost/api/crm/agents/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function patchAgentManagement(id: string, body: unknown): Promise<Res> {
  const mod = await import('@/app/api/crm/agents/[id]/route');
  const call = mod.PATCH as unknown as (
    r: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  const res = await call(
    new Request('http://localhost/api/crm/agents/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// ── Browser harness ───────────────────────────────────────────────────────

const CRM_ROOT = path.resolve(__dirname, '../../public/crm');
const P = (rel: string) => path.join(CRM_ROOT, rel);
const src = (f: string) => readFileSync(f, 'utf8');

interface Harness {
  patches: Record<string, unknown>[];
  doc: Document;
  /** A control INSIDE the profile form, by `name`. `null` when absent. */
  named(name: string): HTMLInputElement | HTMLTextAreaElement | null;
  /** Any element by id. */
  byId(id: string): HTMLInputElement | null;
  value(name: string): string;
  set(name: string, v: string): void;
  render(): Promise<void>;
  save(): Promise<void>;
}

async function bootProfile(opts: { isBroker?: boolean } = {}): Promise<Harness> {
  const { GET, PATCH } = await import('@/app/api/crm/agents/me/route');
  const callGet = GET as unknown as (r: Request) => Promise<Response>;
  const callPatch = PATCH as unknown as (r: Request) => Promise<Response>;

  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>');
  const doc: Document = dom.window.document;
  const content = doc.getElementById('content')!;
  const patches: Record<string, unknown>[] = [];

  async function _fetch(url: string, options?: { method?: string; body?: string }) {
    const method = (options && options.method) || 'GET';
    if (url === '/api/crm/agents/me' && method === 'GET') {
      const res = await callGet(new Request('http://localhost/api/crm/agents/me'));
      return (await res.json()) as Record<string, unknown>;
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
    CRM: { setPanelTitle() {}, getContent: () => content, toast() {} },
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

  function named(name: string) {
    return doc.querySelector('#profileForm [name="' + name + '"]') as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
  }

  const h: Harness = {
    patches,
    doc,
    named,
    byId: (id) => doc.getElementById(id) as HTMLInputElement | null,
    value(name) {
      const el = named(name);
      if (!el) throw new Error('no control named ' + name);
      return el.value;
    },
    set(name, v) {
      const el = named(name);
      if (!el) throw new Error('no control named ' + name);
      el.value = v;
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
  auth.role = 'BROKER';
  auth.userType = 'agent';
  agentFindUnique.mockClear();
  agentUpdate.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE SELF-SERVICE ROUTE REFUSES THE REGULATED FACT — LOUDLY
// ═══════════════════════════════════════════════════════════════════════════

const REFUSAL = 'license_type is not self-editable; use Agent Management';

describe('PATCH /api/crm/agents/me rejects a supplied license_type', () => {
  it('a BROKER supplying a licence class is refused 403, not accepted', async () => {
    const res = await patchMe({ license_type: 'associate_broker' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(REFUSAL);
    // not a success shape
    expect(res.body.updated_fields).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });

  it('after the refusal the record is byte-for-byte unchanged', async () => {
    const before = snapshot();
    const res = await patchMe({ license_type: 'associate_broker' });
    expect(res.status).toBe(403);
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
    expect(store.row.license_type).toBe('salesperson');
    expect(store.row.title).toBe(DESIGNATION.salesperson);
    expect(store.row.role).toBe('SALESPERSON');
  });

  it('the refusal is not silently dropped alongside a legitimate field', async () => {
    const before = snapshot();
    const res = await patchMe({ license_type: 'broker', bio: 'a new bio' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(REFUSAL);
    // the WHOLE request is refused: the bio is not written either
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('re-sending the SAME stored class is still refused, not treated as a no-op', async () => {
    const res = await patchMe({ license_type: 'salesperson' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(REFUSAL);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('an explicit null is refused rather than nulling the licence class', async () => {
    const before = snapshot();
    const res = await patchMe({ license_type: null });
    expect(res.status).toBe(403);
    expect(store.row.license_type).toBe('salesperson');
    expect(snapshot()).toBe(before);
  });

  it('a designation display string is refused as NOT SELF-EDITABLE, not as bad vocabulary', async () => {
    // Ordering matters: "you may not write this field" outranks "this value is
    // not a licence class". A 400 here would tell a caller to retry with the
    // canonical spelling on a route that must never accept it at all.
    const res = await patchMe({ license_type: 'Licensed Real Estate Broker' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(REFUSAL);
  });

  it('a plain licensee supplying a licence class is refused the same way', async () => {
    auth.role = 'AGENT';
    const before = snapshot();
    const res = await patchMe({ license_type: 'broker' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(REFUSAL);
    expect(snapshot()).toBe(before);
  });

  it('title cannot be re-derived through this route by any means', async () => {
    await patchMe({ license_type: 'broker' });
    await patchMe({ license_type: 'broker', title: 'Licensed Real Estate Broker' });
    expect(store.row.title).toBe(DESIGNATION.salesperson);
    expect(store.row.license_type).toBe('salesperson');
  });

  it('a request that supplies NO license_type still works normally', async () => {
    const res = await patchMe({ bio: 'a new bio' });
    expect(res.status).toBe(200);
    expect(store.row.bio).toBe('a new bio');
    expect(store.row.license_type).toBe('salesperson');
    expect(store.row.title).toBe(DESIGNATION.salesperson);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE UI CLOSES THE AFFORDANCE TOO — READ-ONLY, NOT HIDDEN
// ═══════════════════════════════════════════════════════════════════════════

describe('My Profile renders License Type read-only for every professional class', () => {
  const CLASSES: { licence: string; role: string; isBroker: boolean }[] = [
    { licence: 'salesperson', role: 'SALESPERSON', isBroker: false },
    { licence: 'associate_broker', role: 'ASSOCIATE_BROKER', isBroker: false },
    { licence: 'broker', role: 'BROKER', isBroker: true },
  ];

  for (const c of CLASSES) {
    it(`${c.role}: the rendered licence control is readonly and carries the stored class`, async () => {
      store.row = freshRow(c.licence, c.role);
      const h = await bootProfile({ isBroker: c.isBroker });

      // RENDERED CONTROL, not the field table.
      const display = h.byId('profileLicenseType');
      expect(display).not.toBeNull();
      expect(display!.readOnly).toBe(true);
      // still DISPLAYED — read-only, not hidden
      expect(display!.value).toBe(c.licence);

      // and there is no writable control claiming the field
      expect(h.named('license_type')).toBeNull();
    });

    it(`${c.role}: the derived designation is shown read-only as well`, async () => {
      store.row = freshRow(c.licence, c.role);
      const h = await bootProfile({ isBroker: c.isBroker });
      const title = h.named('title') as HTMLInputElement | null;
      expect(title).not.toBeNull();
      expect(title!.readOnly).toBe(true);
      expect(title!.value).toBe(DESIGNATION[c.licence]);
    });
  }

  it('the help copy directs a regulated change to Agent Management', async () => {
    store.row = freshRow('broker', 'BROKER');
    const h = await bootProfile({ isBroker: true });
    expect(h.doc.body.textContent || '').toContain('Agent Management');
  });

  it('a BROKER editing My Profile can never put license_type on the wire', async () => {
    store.row = freshRow('broker', 'BROKER');
    const h = await bootProfile({ isBroker: true });
    h.set('bio', 'edited by the broker');
    await h.save();
    expect(h.patches.length).toBe(1);
    expect(Object.keys(h.patches[0])).toEqual(['bio']);
    expect(store.row.license_type).toBe('broker');
    expect(store.row.title).toBe(DESIGNATION.broker);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE CANONICAL WRITER STILL WORKS
//    A closure that also broke the legitimate path would be the worse defect.
// ═══════════════════════════════════════════════════════════════════════════

describe('Broker Agent Management remains the ONE working writer', () => {
  it('performs an authorised licence-class change', async () => {
    const res = await patchAgentManagement('7', { license_type: 'associate_broker' });
    expect(res.status).toBe(200);
    expect(store.row.license_type).toBe('associate_broker');
  });

  it('derives the §175.25 designation from the new licence class', async () => {
    await patchAgentManagement('7', { license_type: 'associate_broker' });
    expect(store.row.title).toBe(DESIGNATION.associate_broker);
  });

  it('derives the principal-broker designation too', async () => {
    store.row = freshRow('salesperson', 'BROKER');
    const res = await patchAgentManagement('7', { license_type: 'broker' });
    expect(res.status).toBe(200);
    expect(store.row.license_type).toBe('broker');
    expect(store.row.title).toBe(DESIGNATION.broker);
  });

  it('still refuses a designation display string with 400 and the canonical spelling', async () => {
    const res = await patchAgentManagement('7', {
      license_type: 'Licensed Associate Real Estate Broker',
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('associate_broker');
    expect(store.row.license_type).toBe('salesperson');
  });

  it('does not re-derive the title on an unrelated edit', async () => {
    store.row = freshRow('broker', 'ASSOCIATE_BROKER');
    store.row.title = DESIGNATION.associate_broker; // legacy ambiguous row
    const res = await patchAgentManagement('7', { phone: '212-555-1234' });
    expect(res.status).toBe(200);
    expect(store.row.title).toBe(DESIGNATION.associate_broker);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CASE 6 IS UNTOUCHED — the changed-field guard from the previous commit
// ═══════════════════════════════════════════════════════════════════════════

describe('the populated-profile save guard still holds', () => {
  it('open -> save untouched -> reload is IDENTICAL and issues no PATCH', async () => {
    const before = snapshot();
    const h = await bootProfile();
    await h.save();
    expect(h.patches.length).toBe(0);
    expect(snapshot()).toBe(before);
    await h.render();
    expect(h.value('bio')).toBe(BIO);
    expect(h.value('specialties')).toBe(SPECIALTIES.join(', '));
    expect(h.value('languages')).toBe(LANGUAGES.join(', '));
  });

  it('the same holds for a BROKER, whose form no longer carries a licence control', async () => {
    store.row = freshRow('broker', 'BROKER');
    const before = snapshot();
    const h = await bootProfile({ isBroker: true });
    await h.save();
    expect(h.patches.length).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('open -> edit bio/specialties/languages -> save -> reload keeps the exact values', async () => {
    const h = await bootProfile();
    h.set('bio', 'A new professional bio.');
    h.set('specialties', 'Negotiation, Buyer Representation');
    h.set('languages', 'English, French');
    await h.save();

    expect(store.row.bio).toBe('A new professional bio.');
    expect(store.row.specialties).toEqual(['Negotiation', 'Buyer Representation']);
    expect(store.row.languages).toEqual(['English', 'French']);
    expect(Array.isArray(h.patches[0].specialties)).toBe(true);

    await h.render();
    expect(h.value('bio')).toBe('A new professional bio.');
    expect(h.value('specialties')).toBe('Negotiation, Buyer Representation');
    expect(h.value('languages')).toBe('English, French');
  });
});
