/// <reference types="jest" />
/**
 * `/api/crm/agents/me` IS A SELF-SERVICE PROFILE WRITER — DENY BY DEFAULT
 * (2026-09-04)
 *
 * ── The contradiction this closes ─────────────────────────────────────────
 *
 * The route's own header declared the boundary:
 *
 *     Agent can edit:    bio, photo, specialties, languages, phone
 *     Agent CANNOT edit: title, name, email, license, splits, role, status,
 *                        featured, slug
 *
 * and then, lower in the same file, an `if (auth.role === "BROKER")` block
 * self-wrote eight of the fields it had just declared off-limits:
 *
 *     first_name · last_name · license_no · sale_split · rental_split ·
 *     featured · public_slug · status
 *
 * Only `license_type` was actually refused. The code contradicted the
 * boundary it declared, and the contradiction was invisible because each
 * field was its own line.
 *
 * ── Why an allowlist rather than eight more refusals ──────────────────────
 *
 * Eight `if (hasOwnProperty(x)) reject` blocks would close today's eight
 * fields and leave the ninth wide open: the next developer adding a
 * self-writable administrative field would trip nothing. The writable set is
 * therefore stated ONCE —
 *
 *     SELF_EDITABLE_FIELDS = bio | phone | specialties | languages
 *
 * — and EVERYTHING else is refused, including a key that does not exist
 * today. Section 4 below proves that property directly, with keys no column
 * has ever had. That is the construction under test, not the enumeration.
 *
 * ── WHY `photo` LEFT THE ALLOWLIST (2026-09-04) ──────────────────────────
 *
 * `photo` was a SECOND media writer. A JSON string posted here set the
 * column directly — no image validation, no EXIF/GPS strip, no WebP
 * optimisation, no R2 upload. It let any authenticated licensee point their
 * public headshot at an arbitrary string, while the dedicated route did all
 * of that work for the same column.
 *
 * The canonical self-service photo writer is POST /api/crm/agents/me/photo
 * and nothing else. A JSON `photo` key is now refused by the SAME general
 * deny-by-default gate that refuses `status` or an invented column — there
 * is deliberately NO special case for it, and section 10 proves that by
 * comparing the refusal against the refusal for a column no schema has.
 *
 * Section 9 closes the other half of the same broken contract: the CRM
 * appended the file part as `photo` while both photo routes read `file`, so
 * choosing a headshot in My Profile answered 400 `Missing 'file' field`.
 * Removing the JSON writer without fixing that key would have left NO
 * working way to set a headshot at all.
 *
 * ── Why the WHOLE request is refused ──────────────────────────────────────
 *
 * A partial apply is indistinguishable from a full one at the call site. A
 * caller that believed it was setting an account status must not be told
 * "saved" because the bio in the same body happened to be legal. Section 3
 * asserts the STORED BIO, before and after — not merely that the status did
 * not change.
 *
 * ── The canonical writer is untouched ─────────────────────────────────────
 *
 *   Broker Agent Management -> PATCH /api/crm/agents/[id] (requireBroker)
 *                           -> the governed Agent fields
 *
 * Maya can still change every one of these facts there, where the action is
 * explicitly a broker administrative action rather than a self-profile edit.
 * Section 6 proves that closing the self-service path did not close it.
 *
 * Route cases call the REAL handlers over a mutable in-memory record and
 * assert the STATUS, the BODY and the RESULTING RECORD — a status-only
 * assertion is not enough, because the pre-change route answered 200 AND
 * wrote. UI cases execute the REAL browser file in a `vm` sandbox on a real
 * jsdom document and assert the RENDERED CONTROL.
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
const sessionDeleteMany = jest.fn(async () => ({ count: 3 }));
const mfaDeleteMany = jest.fn(async () => ({ count: 1 }));
const auditCreate = jest.fn(async () => ({ id: 1n }));

const agentDelegate = {
  findUnique: (...a: unknown[]) => agentFindUnique(...(a as [])),
  update: (...a: unknown[]) => agentUpdate(...(a as [{ data: Row }])),
};
const txClient = {
  agent: agentDelegate,
  session: { deleteMany: sessionDeleteMany },
  mfaSession: { deleteMany: mfaDeleteMany },
  auditEvent: { create: auditCreate },
};

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    ...txClient,
    $transaction: async (cb: (tx: unknown) => unknown) => cb(txClient),
  },
}));

/** Mutable so a case can run as the BROKER or as a plain licensee. */
const auth: { role: string; userType: string } = { role: 'BROKER', userType: 'agent' };
const AUTH = () => ({ userId: 7n, sessionId: 'test-session', ...auth });

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => AUTH(),
  // The canonical Agent Management writer. Authorised in every case below —
  // the point of section 6 is that CLOSING the self-service path did not
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

// ── The photo route's own collaborators ───────────────────────────────────
// POST /api/crm/agents/me/photo is `photo`'s CANONICAL writer: it stores the
// file and writes agent.photo itself. It is a SEPARATE route reading
// multipart form data, so the JSON allowlist above plays no part in it. These
// mocks exist so that fact can be PROVEN rather than assumed.

const uploadToR2 = jest.fn(async () => 'https://cdn.mallan.nyc/agents/maya-allan/headshot.webp');

jest.mock('@/lib/images/r2', () => ({
  __esModule: true,
  hasR2Config: () => true,
  uploadToR2: (...a: unknown[]) => uploadToR2(...(a as [])),
}));

/**
 * Mutable so a case can make image validation FAIL without the route being
 * touched. `mock`-prefixed so jest's hoist plugin permits the reference.
 */
const mockImageValidation: { valid: boolean; error?: string } = { valid: true };

jest.mock('@/lib/images/optimize', () => ({
  __esModule: true,
  validateImage: () => ({ ...mockImageValidation }),
  optimizeImage: async () => [{ variant: 'card', buffer: Buffer.from('img') }],
}));

// ── The stored profile under test ─────────────────────────────────────────

const BIO = 'A stored professional bio that must survive every refusal.';
const SPECIALTIES = ['Upper East Side', 'Luxury Condos', 'First-Time Buyers'];
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

/** POST a multipart headshot to `photo`'s canonical writer. */
async function postPhoto(fieldName: string): Promise<Res> {
  const { POST } = await import('@/app/api/crm/agents/me/photo/route');
  const fd = new FormData();
  fd.append(fieldName, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'h.jpg');
  const res = await (POST as unknown as (r: Request) => Promise<Response>)(
    new Request('http://localhost/api/crm/agents/me/photo', { method: 'POST', body: fd }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// ── Browser harness ───────────────────────────────────────────────────────

const CRM_ROOT = path.resolve(__dirname, '../../public/crm');
const P = (rel: string) => path.join(CRM_ROOT, rel);
const src = (f: string) => readFileSync(f, 'utf8');

interface Harness {
  patches: Record<string, unknown>[];
  photoPosts: string[];
  /**
   * The multipart PART NAMES the client actually appended, per POST. This is
   * the difference between proving a request was made and proving the
   * request carries the key the route reads.
   */
  photoParts: string[][];
  doc: Document;
  /** Give the file picker a chosen file, as the browser would. */
  chooseFile(): void;
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
  const photoPosts: string[] = [];
  const photoParts: string[][] = [];

  async function _fetch(
    url: string,
    options?: { method?: string; body?: string | FormData },
  ) {
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
          body: String(options!.body),
        }),
      );
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Request failed');
      return body;
    }
    if (url === '/api/crm/agents/me/photo' && method === 'POST') {
      photoPosts.push(url);
      const sent = options && options.body;
      const names: string[] = [];
      if (sent && typeof (sent as FormData).forEach === 'function') {
        (sent as FormData).forEach((_v, k) => names.push(k));
      } else {
        names.push('<NOT-FORM-DATA>');
      }
      photoParts.push(names);
      return { photo: '/uploaded.webp' };
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
    photoPosts,
    photoParts,
    doc,
    named,
    chooseFile() {
      const el = doc.getElementById('profilePhotoFile')!;
      Object.defineProperty(el, 'files', {
        configurable: true,
        value: [new dom.window.Blob(['x'], { type: 'image/jpeg' })],
      });
    },
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
  uploadToR2.mockClear();
  mockImageValidation.valid = true;
  delete mockImageValidation.error;
  sessionDeleteMany.mockClear();
  mfaDeleteMany.mockClear();
  auditCreate.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE ALLOWLIST — the four self-service facts, and only those, still work
// ═══════════════════════════════════════════════════════════════════════════

const SELF_EDITABLE = ['bio', 'phone', 'specialties', 'languages'];

describe('the four self-service profile facts are writable and stored correctly', () => {
  it('bio / phone in one body succeed and store exactly', async () => {
    const storedPhoto = store.row.photo;
    const res = await patchMe({
      bio: 'A rewritten professional bio.',
      phone: '212-555-1234',
    });
    expect(res.status).toBe(200);
    expect(store.row.bio).toBe('A rewritten professional bio.');
    expect(store.row.phone).toBe('212-555-1234');
    // The headshot is not a JSON fact on this route, so a legal save leaves
    // it exactly where the media endpoint put it.
    expect(store.row.photo).toBe(storedPhoto);
    expect((res.body.updated_fields as string[]).sort()).toEqual(['bio', 'phone']);
  });

  it('specialties / languages store as ARRAYS, not strings', async () => {
    const res = await patchMe({
      specialties: ['Negotiation', 'Buyer Representation'],
      languages: ['English', 'French'],
    });
    expect(res.status).toBe(200);
    expect(store.row.specialties).toEqual(['Negotiation', 'Buyer Representation']);
    expect(store.row.languages).toEqual(['English', 'French']);
    expect(Array.isArray(store.row.specialties)).toBe(true);
  });

  it('a non-array specialties value is still a 400, never a silent wipe', async () => {
    const res = await patchMe({ specialties: 'Negotiation, Buyer Representation' });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('must be an array');
    expect(store.row.specialties).toEqual(SPECIALTIES);
  });

  it('the whole allowlist together succeeds for a plain licensee', async () => {
    auth.role = 'AGENT';
    const res = await patchMe({
      bio: 'b',
      phone: 'ph',
      specialties: ['s'],
      languages: ['l'],
    });
    expect(res.status).toBe(200);
    expect((res.body.updated_fields as string[]).sort()).toEqual([...SELF_EDITABLE].sort());
  });

  it('the SAME allowlist applies to a BROKER — the set is not role-widened', async () => {
    auth.role = 'BROKER';
    const res = await patchMe({
      bio: 'b',
      phone: 'ph',
      specialties: ['s'],
      languages: ['l'],
    });
    expect(res.status).toBe(200);
    expect((res.body.updated_fields as string[]).sort()).toEqual([...SELF_EDITABLE].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. EVERY GOVERNED FIELD IS REFUSED — for a BROKER as well as anyone else
// ═══════════════════════════════════════════════════════════════════════════

/** Every fact that left the self-service writer, and why it left. */
const GOVERNED: { key: string; value: unknown; why: string }[] = [
  { key: 'license_type', value: 'associate_broker', why: 'regulated licence class' },
  { key: 'license_no', value: '99999999999', why: 'regulated licence identity' },
  { key: 'first_name', value: 'Impostor', why: 'canonical professional identity' },
  { key: 'last_name', value: 'Impostor', why: 'canonical professional identity' },
  { key: 'sale_split', value: 95, why: 'compensation terms' },
  { key: 'rental_split', value: 95, why: 'compensation terms' },
  { key: 'featured', value: false, why: 'brokerage publication authority' },
  { key: 'public_slug', value: 'someone-else', why: 'public identity and routing' },
  { key: 'status', value: 'inactive', why: 'account lifecycle and session authority' },
  { key: 'title', value: 'Licensed Real Estate Broker', why: 'regulated designation' },
  { key: 'role', value: 'BROKER', why: 'authorisation grant' },
];

for (const role of ['BROKER', 'AGENT'] as const) {
  describe(`a ${role} is refused every governed field through /me`, () => {
    for (const f of GOVERNED) {
      it(`${f.key} (${f.why}) is refused 403 and never written`, async () => {
        auth.role = role;
        const before = snapshot();
        const res = await patchMe({ [f.key]: f.value });

        expect(res.status).toBe(403);
        // the refusal NAMES the offending key, so it is diagnosable
        expect(String(res.body.error)).toContain(f.key);
        // not a success shape
        expect(res.body.updated_fields).toBeUndefined();
        expect(res.body.id).toBeUndefined();
        // NO Prisma mutation at all
        expect(agentUpdate).not.toHaveBeenCalled();
        expect(updateCalls.length).toBe(0);
        // the full row is byte-for-byte unchanged
        expect(snapshot()).toBe(before);
      });
    }

    it('a body of ALL the governed fields at once is refused as a whole', async () => {
      auth.role = role;
      const before = snapshot();
      const body: Record<string, unknown> = {};
      for (const f of GOVERNED) body[f.key] = f.value;
      const res = await patchMe(body);

      expect(res.status).toBe(403);
      for (const f of GOVERNED) expect(String(res.body.error)).toContain(f.key);
      expect(agentUpdate).not.toHaveBeenCalled();
      expect(snapshot()).toBe(before);
    });
  });
}

describe('the refusal is about the KEY, not the value', () => {
  it('an explicit null is a write attempt too', async () => {
    const before = snapshot();
    const res = await patchMe({ public_slug: null });
    expect(res.status).toBe(403);
    expect(store.row.public_slug).toBe('maya-allan');
    expect(snapshot()).toBe(before);
  });

  it('re-sending the SAME stored value is refused, not treated as a no-op', async () => {
    const res = await patchMe({ status: 'active' });
    expect(res.status).toBe(403);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('an INVALID value is refused as NOT SELF-EDITABLE (403), not as bad vocabulary (400)', async () => {
    // Ordering matters: "you may not write this field" outranks "this value is
    // wrong". A 400 would invite a retry with the canonical spelling on a route
    // that must never accept the field at all.
    const res = await patchMe({ status: 'not-a-status' });
    expect(res.status).toBe(403);
  });

  it('license_type keeps its established refusal wording', async () => {
    const res = await patchMe({ license_type: 'associate_broker' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('license_type is not self-editable; use Agent Management');
  });

  it('status never reaches the lifecycle authority from this route', async () => {
    const res = await patchMe({ status: 'inactive' });
    expect(res.status).toBe(403);
    expect(sessionDeleteMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(store.row.status).toBe('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. NO PARTIAL APPLY — the case that proves the refusal is total
// ═══════════════════════════════════════════════════════════════════════════

describe('a mixed body rejects the ENTIRE request', () => {
  it('{ bio, status } refuses AND leaves the STORED BIO untouched', async () => {
    const storedBioBefore = store.row.bio;
    expect(storedBioBefore).toBe(BIO);

    const res = await patchMe({ bio: 'new text', status: 'inactive' });

    expect(res.status).toBe(403);
    expect(String(res.body.error)).toContain('status');
    // THE ASSERTION THAT MATTERS: the legal half of the body did not land.
    expect(store.row.bio).toBe(BIO);
    expect(store.row.bio).not.toBe('new text');
    expect(store.row.status).toBe('active');
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('{ bio, photo } refuses AND leaves the STORED BIO AND PHOTO untouched', async () => {
    const storedBioBefore = store.row.bio;
    const storedPhotoBefore = store.row.photo;
    expect(storedBioBefore).toBe(BIO);
    expect(storedPhotoBefore).toBe('/images/agents/maya-allan.jpg');

    const res = await patchMe({ bio: 'new text', photo: '/attacker-controlled.jpg' });

    expect(res.status).toBe(403);
    expect(res.body.rejected_fields).toEqual(['photo']);
    // THE ASSERTION THAT MATTERS: the legal half of the body did not land.
    expect(store.row.bio).toBe(BIO);
    expect(store.row.bio).not.toBe('new text');
    expect(store.row.photo).toBe(storedPhotoBefore);
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(updateCalls.length).toBe(0);
  });

  it('{ bio, photo, phone, specialties, languages, featured } refuses all six', async () => {
    const before = snapshot();
    const res = await patchMe({
      bio: 'new text',
      photo: '/new.jpg',
      phone: '000',
      specialties: ['New'],
      languages: ['New'],
      featured: false,
    });
    expect(res.status).toBe(403);
    expect(snapshot()).toBe(before);
    expect(store.row.bio).toBe(BIO);
    expect(store.row.specialties).toEqual(SPECIALTIES);
  });

  it('every legal field survives when an illegal one accompanies it', async () => {
    for (const legal of SELF_EDITABLE) {
      store.row = freshRow();
      agentUpdate.mockClear();
      const before = snapshot();
      const value = legal === 'specialties' || legal === 'languages' ? ['X'] : 'X';
      const res = await patchMe({ [legal]: value, sale_split: 99 });
      expect(res.status).toBe(403);
      expect(snapshot()).toBe(before);
      expect(agentUpdate).not.toHaveBeenCalled();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. DENY BY DEFAULT — the construction, not the enumeration
// ═══════════════════════════════════════════════════════════════════════════

describe('a key that does not exist today is refused too', () => {
  it('an arbitrary unknown key alongside a legal one is refused', async () => {
    const before = snapshot();
    const res = await patchMe({ bio: 'x', some_future_field: 1 });
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toContain('some_future_field');
    expect(store.row.bio).toBe(BIO);
    expect(snapshot()).toBe(before);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('an unknown key ALONE is refused', async () => {
    const res = await patchMe({ totally_invented_column: 'x' });
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toContain('totally_invented_column');
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('several unknown keys are ALL named in the refusal', async () => {
    const res = await patchMe({ alpha_field: 1, beta_field: 2 });
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toContain('alpha_field');
    expect(String(res.body.error)).toContain('beta_field');
  });

  it('a key that merely LOOKS self-editable is not admitted by resemblance', async () => {
    // `photo_url` was posted by an older client and read by nothing. Under a
    // denylist it sails through; under an allowlist it is refused.
    const res = await patchMe({ photo_url: '/x.jpg' });
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toContain('photo_url');
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('prototype-borrowed keys are not mistaken for allowlist members', async () => {
    const res = await patchMe({ constructor: 'x', toString: 'y' });
    expect(res.status).toBe(403);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('the response states the writable set, so the refusal is actionable', async () => {
    const res = await patchMe({ some_future_field: 1 });
    expect(res.status).toBe(403);
    expect((res.body.self_editable_fields as string[]).sort()).toEqual(
      [...SELF_EDITABLE].sort(),
    );
    expect(res.body.rejected_fields).toEqual(['some_future_field']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. INTEGRITY — Prisma is never called on any rejected request
// ═══════════════════════════════════════════════════════════════════════════

describe('the update-call count is ZERO across every refusal', () => {
  it('no rejected request in the whole matrix reaches prisma.agent.update', async () => {
    const before = snapshot();
    const bodies: unknown[] = [
      ...GOVERNED.map((f) => ({ [f.key]: f.value })),
      { bio: 'new text', status: 'inactive' },
      { bio: 'x', some_future_field: 1 },
      { totally_invented_column: 'x' },
      { photo_url: '/x.jpg' },
      { photo: '/x.jpg' },
      { bio: 'x', photo: '/x.jpg' },
      { first_name: 'A', last_name: 'B' },
    ];
    for (const b of bodies) {
      const res = await patchMe(b);
      expect(res.status).toBe(403);
    }
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(updateCalls.length).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('a legal request still reaches prisma exactly once', async () => {
    await patchMe({ bio: 'legal' });
    expect(agentUpdate).toHaveBeenCalledTimes(1);
    expect(updateCalls.length).toBe(1);
    expect(Object.keys(updateCalls[0])).toEqual(['bio']);
  });

  it('an empty body is a 400, not a 403 and not a write', async () => {
    const res = await patchMe({});
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE CANONICAL WRITER STILL WORKS — closing /me did not close it
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /api/crm/agents/[id] remains the ONE governed writer', () => {
  it('changes the professional identity a broker legitimately owns', async () => {
    const res = await patchAgentManagement('7', { first_name: 'Maya', last_name: 'Allan-Smith' });
    expect(res.status).toBe(200);
    expect(store.row.last_name).toBe('Allan-Smith');
    expect(store.row.full_name).toBe('Maya Allan-Smith');
  });

  it('changes the regulated licence number', async () => {
    const res = await patchAgentManagement('7', { license_no: '10991205323' });
    expect(res.status).toBe(200);
    expect(store.row.license_no).toBe('10991205323');
  });

  it('changes compensation terms', async () => {
    const res = await patchAgentManagement('7', { sale_split: 70, rental_split: 60 });
    expect(res.status).toBe(200);
    expect(store.row.sale_split).toBe(70);
    expect(store.row.rental_split).toBe(60);
  });

  it('changes publication and public routing', async () => {
    const res = await patchAgentManagement('7', { featured: false, public_slug: 'maya-a' });
    expect(res.status).toBe(200);
    expect(store.row.featured).toBe(false);
    expect(store.row.public_slug).toBe('maya-a');
  });

  it('changes account lifecycle AND revokes sessions', async () => {
    const res = await patchAgentManagement('7', { status: 'inactive' });
    expect(res.status).toBe(200);
    expect(store.row.status).toBe('inactive');
    expect(sessionDeleteMany).toHaveBeenCalledWith({
      where: { user_type: 'agent', user_id: 7n },
    });
  });

  it('DERIVES the §175.25 designation from a licence-class change', async () => {
    const res = await patchAgentManagement('7', { license_type: 'associate_broker' });
    expect(res.status).toBe(200);
    expect(store.row.license_type).toBe('associate_broker');
    expect(store.row.title).toBe(DESIGNATION.associate_broker);
  });

  it('derives the principal-broker designation too', async () => {
    store.row = freshRow('salesperson', 'BROKER');
    const res = await patchAgentManagement('7', { license_type: 'broker' });
    expect(res.status).toBe(200);
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
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CASE 6 IS INTACT — the changed-field guard and the type round-trip
// ═══════════════════════════════════════════════════════════════════════════

describe('the populated-profile save guard still holds', () => {
  it('open -> save untouched -> NO PATCH issued, record identical', async () => {
    const before = snapshot();
    const h = await bootProfile();
    await h.save();
    expect(h.patches.length).toBe(0);
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('the same holds for a BROKER', async () => {
    store.row = freshRow('broker', 'BROKER');
    const before = snapshot();
    const h = await bootProfile({ isBroker: true });
    await h.save();
    expect(h.patches.length).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('edit bio/phone/specialties/languages -> save -> reload gives the exact values, arrays as arrays', async () => {
    const storedPhoto = store.row.photo;
    const h = await bootProfile();
    h.set('bio', 'A new professional bio.');
    h.set('phone', '(212) 555-0143');
    h.set('specialties', 'Negotiation, Buyer Representation');
    h.set('languages', 'English, French');
    await h.save();

    // All FOUR self-service facts travel in ONE body and all four land.
    expect(h.patches.length).toBe(1);
    expect(Object.keys(h.patches[0]).sort()).toEqual(
      ['bio', 'languages', 'phone', 'specialties'],
    );
    expect(store.row.bio).toBe('A new professional bio.');
    expect(store.row.phone).toBe('(212) 555-0143');
    expect(store.row.specialties).toEqual(['Negotiation', 'Buyer Representation']);
    expect(store.row.languages).toEqual(['English', 'French']);
    expect(Array.isArray(h.patches[0].specialties)).toBe(true);
    // A full four-field save still never touches the headshot column.
    expect(store.row.photo).toBe(storedPhoto);

    await h.render();
    expect(h.value('bio')).toBe('A new professional bio.');
    expect(h.value('phone')).toBe('(212) 555-0143');
    expect(h.value('specialties')).toBe('Negotiation, Buyer Representation');
    expect(h.value('languages')).toBe('English, French');
  });

  it('a BROKER save puts ONLY allowlisted keys on the wire', async () => {
    store.row = freshRow('broker', 'BROKER');
    const h = await bootProfile({ isBroker: true });
    h.set('bio', 'edited by the broker');
    await h.save();
    expect(h.patches.length).toBe(1);
    for (const k of Object.keys(h.patches[0])) {
      expect(SELF_EDITABLE).toContain(k);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. THE UI OFFERS NO AFFORDANCE FOR A FIELD THE ROUTE WILL REFUSE
// ═══════════════════════════════════════════════════════════════════════════

describe('My Profile presents no writable control for a governed field', () => {
  const ROLES: { licence: string; role: string; isBroker: boolean }[] = [
    { licence: 'salesperson', role: 'SALESPERSON', isBroker: false },
    { licence: 'broker', role: 'BROKER', isBroker: true },
  ];

  for (const r of ROLES) {
    it(`${r.role}: every rendered control for a governed field is read-only or absent`, async () => {
      store.row = freshRow(r.licence, r.role);
      const h = await bootProfile({ isBroker: r.isBroker });

      for (const f of GOVERNED) {
        const el = h.named(f.key);
        if (el) expect((el as HTMLInputElement).readOnly).toBe(true);
      }
      // the identity and administrative facts have no named control at all
      for (const k of [
        'first_name',
        'last_name',
        'sale_split',
        'rental_split',
        'featured',
        'public_slug',
        'status',
        'role',
        'license_no',
        'license_type',
      ]) {
        expect(h.named(k)).toBeNull();
      }
      // the derived designation IS displayed, read-only
      const title = h.named('title') as HTMLInputElement | null;
      expect(title).not.toBeNull();
      expect(title!.readOnly).toBe(true);
    });
  }

  it('the licence controls remain visible read-only, not hidden', async () => {
    store.row = freshRow('broker', 'BROKER');
    const h = await bootProfile({ isBroker: true });
    expect(h.byId('profileLicenseType')!.readOnly).toBe(true);
    expect(h.byId('profileLicenseType')!.value).toBe('broker');
    expect(h.byId('profileLicenseNumber')!.readOnly).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. `photo` HAS EXACTLY ONE SELF-SERVICE WRITER, AND IT NOW WORKS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/crm/agents/me/photo is the ONE self-service photo writer', () => {
  it('stores the headshot and writes agent.photo through its own route', async () => {
    const res = await postPhoto('file');
    expect(res.status).toBe(200);
    expect(uploadToR2).toHaveBeenCalled();
    expect(store.row.photo).toBe('https://cdn.mallan.nyc/agents/maya-allan/headshot.webp');
    expect(res.body.photo).toBe('https://cdn.mallan.nyc/agents/maya-allan/headshot.webp');
  });

  it('the allowlist never sees it — it reads multipart form data, not a JSON body', async () => {
    // The refusal shape produced by the /me PATCH gate must not appear here.
    const res = await postPhoto('file');
    expect(res.body.rejected_fields).toBeUndefined();
    expect(res.body.self_editable_fields).toBeUndefined();
    expect(res.status).not.toBe(403);
  });

  it('a BROKER uploads a headshot exactly as any other licensee does', async () => {
    auth.role = 'BROKER';
    store.row = freshRow('broker', 'BROKER');
    const res = await postPhoto('file');
    expect(res.status).toBe(200);
    expect(store.row.photo).toBe('https://cdn.mallan.nyc/agents/maya-allan/headshot.webp');
  });

  it('still VALIDATES the image — a refused file is 400 and never reaches R2', async () => {
    mockImageValidation.valid = false;
    mockImageValidation.error = 'File too large (max 10MB)';
    const res = await postPhoto('file');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('File too large (max 10MB)');
    expect(uploadToR2).not.toHaveBeenCalled();
    expect(store.row.photo).toBe('/images/agents/maya-allan.jpg');
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  // ── THE HALF THAT MADE THE CORRECT PATH UNUSABLE ───────────────────────
  //
  // The CRM appended the file part as `photo`; both photo routes read
  // `file`. Choosing a headshot in My Profile therefore answered
  // 400 Missing 'file' field. Removing the JSON `photo` writer without
  // fixing this key would have left no working way to set a headshot.

  it('the CRM appends the part under the key the ROUTE reads', async () => {
    const h = await bootProfile();
    h.chooseFile();
    await h.save();

    // Not merely 'a request was made' — the KEY the client built.
    expect(h.photoPosts).toEqual(['/api/crm/agents/me/photo']);
    expect(h.photoParts).toEqual([['file']]);
    expect(h.photoParts[0]).not.toContain('photo');
  });

  it('the key the CLIENT sends is the key the ROUTE accepts — end to end', async () => {
    const h = await bootProfile();
    h.chooseFile();
    await h.save();
    const clientKeys = h.photoParts[0];
    expect(clientKeys.length).toBe(1);

    // Feed the CLIENT'S OWN part name into the REAL route. Before this
    // commit the client sent `photo` and this answered 400.
    const res = await postPhoto(clientKeys[0]);
    expect(res.status).toBe(200);
    expect(uploadToR2).toHaveBeenCalled();
    expect(store.row.photo).toBe('https://cdn.mallan.nyc/agents/maya-allan/headshot.webp');
  });

  it('the ROUTE was not loosened — the old `photo` part is still refused', async () => {
    // The client was corrected, NOT the route. A route that accepted both
    // names would hide the next occurrence of this same defect.
    const res = await postPhoto('photo');
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("Missing 'file' field");
    expect(uploadToR2).not.toHaveBeenCalled();
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('a photo-only save issues NO /me PATCH — no empty body, no spurious refusal', async () => {
    const h = await bootProfile();
    h.chooseFile();
    await h.save();
    expect(h.photoPosts).toEqual(['/api/crm/agents/me/photo']);
    expect(h.patches.length).toBe(0);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('a photo + bio save uploads the photo AND patches only the bio', async () => {
    const h = await bootProfile();
    h.chooseFile();
    h.set('bio', 'a new bio with a new headshot');
    await h.save();
    expect(h.photoPosts.length).toBe(1);
    expect(h.patches.length).toBe(1);
    expect(Object.keys(h.patches[0])).toEqual(['bio']);
    expect(store.row.bio).toBe('a new bio with a new headshot');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. A JSON `photo` IS REFUSED — BY THE GENERAL GATE, NOT A SPECIAL CASE
// ═══════════════════════════════════════════════════════════════════════════
//
// `photo` used to sit in SELF_EDITABLE_FIELDS, which made this route a
// SECOND writer of the headshot column: it set the column to whatever
// string was posted, bypassing image validation, EXIF/GPS stripping, WebP
// optimisation and R2 entirely. Its removal is deliberately NOT accompanied
// by a bespoke `if (body.photo)` refusal — the deny-by-default boundary
// built in the previous commit is what must refuse it. These cases prove
// the refusal is the GENERAL one.

describe('a JSON `photo` key is refused by the general deny-by-default gate', () => {
  const ROLES: { label: string; role: string; licence: string; agentRole: string }[] = [
    { label: 'BROKER', role: 'BROKER', licence: 'broker', agentRole: 'BROKER' },
    {
      label: 'ordinary licensee',
      role: 'AGENT',
      licence: 'salesperson',
      agentRole: 'SALESPERSON',
    },
  ];

  for (const r of ROLES) {
    it(r.label + ': { photo } alone is 403 and the column is untouched', async () => {
      auth.role = r.role;
      store.row = freshRow(r.licence, r.agentRole);
      const before = snapshot();

      const res = await patchMe({ photo: '/attacker-controlled.jpg' });

      expect(res.status).toBe(403);
      expect(res.body.rejected_fields).toEqual(['photo']);
      expect(store.row.photo).toBe('/images/agents/maya-allan.jpg');
      expect(agentUpdate).not.toHaveBeenCalled();
      expect(updateCalls.length).toBe(0);
      expect(snapshot()).toBe(before);
    });
  }

  it('`photo` is absent from the writable set the refusal advertises', async () => {
    const res = await patchMe({ photo: '/x.jpg' });
    expect(res.body.self_editable_fields).not.toContain('photo');
    expect((res.body.self_editable_fields as string[]).sort()).toEqual(
      [...SELF_EDITABLE].sort(),
    );
  });

  // ── THE PROOF THAT NO SPECIAL CASE EXISTS ──────────────────────────────

  it('the refusal is INDISTINGUISHABLE from one for a column no schema has', async () => {
    const forPhoto = await patchMe({ photo: '/x.jpg' });

    store.row = freshRow();
    agentUpdate.mockClear();
    const forInvented = await patchMe({ column_that_has_never_existed: '/x.jpg' });

    // Same status, same body SHAPE, same wording — only the name differs.
    expect(forPhoto.status).toBe(forInvented.status);
    expect(Object.keys(forPhoto.body).sort()).toEqual(Object.keys(forInvented.body).sort());
    expect(forPhoto.body.self_editable_fields).toEqual(forInvented.body.self_editable_fields);
    expect(String(forPhoto.body.error).replace('photo', 'X')).toBe(
      String(forInvented.body.error).replace('column_that_has_never_existed', 'X'),
    );

    // A bespoke branch would say something bespoke. This says the general
    // thing, which is the exact refusal a JSON `photo` now receives.
    expect(String(forPhoto.body.error)).toBe(
      'photo is not self-editable; use Agent Management',
    );
  });

  it('the route SOURCE carries no `photo` branch at all', async () => {
    // Supplementary to the behavioural cases above, not a substitute for
    // them: it pins that the refusal cannot have come from a per-field test.
    const routeSrc = readFileSync(
      path.resolve(__dirname, '../../app/api/crm/agents/me/route.ts'),
      'utf8',
    );
    // Comments may DISCUSS photo; executable code must not branch on it.
    const code = routeSrc
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/body\.photo/);
    expect(code).not.toMatch(/update\.photo/);
    expect(code).not.toMatch(/["']photo["']/);
  });

  it('a photo-only save from the CRM emits no JSON `photo` anywhere', async () => {
    const h = await bootProfile();
    h.chooseFile();
    await h.save();

    // The upload happened; NO /me PATCH was issued at all, so there is no
    // body in which a `photo` key could travel.
    expect(h.photoPosts.length).toBe(1);
    expect(h.patches.length).toBe(0);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('a photo + bio save sends the bio ONLY, never a photo key', async () => {
    const h = await bootProfile();
    h.chooseFile();
    h.set('bio', 'a new bio with a new headshot');
    await h.save();

    expect(h.photoParts).toEqual([['file']]);
    expect(h.patches.length).toBe(1);
    expect(Object.keys(h.patches[0])).toEqual(['bio']);
    expect(Object.keys(h.patches[0])).not.toContain('photo');
    expect(store.row.bio).toBe('a new bio with a new headshot');
  });
});
