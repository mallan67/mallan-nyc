/// <reference types="jest" />
/**
 * The persistence proof Maya asked for (2026-09-08) for BOTH canonical entry forms, run in a REAL DOM:
 *
 *   create → save → reload → edit → save → reload
 *
 * Each form page (public/crm/SALE-FORM-REDESIGN.html / RENTAL-FORM-REDESIGN.html) is loaded into jsdom with
 * its own scripts running (Tailwind / fonts skipped, the page's fetch stubbed). Every editable control is
 * filled deterministically as an agent would (events dispatched, the page's own address parser run), the
 * form's OWN collector builds the payload, the REAL route handlers persist it (POST / PATCH / GET against an
 * in-memory store — the same harness as crm-listing-round-trip.test.ts, RLS enforcement gate included), the
 * form's OWN loader hydrates a fresh page from the GET body, and the collector runs again. A control whose
 * value does not survive is reported by key: that is a listing fact the agent typed and then lost.
 *
 * The form's collector is the mirror of its loader by contract: a key the collector saves that the loader
 * never restores is a defect, not a difference to allow-list.
 *
 * What it does NOT prove: the Postgres boundary (the store is in-memory — column widths, Decimal precision and
 * JSONB coercion are not exercised) and the page's own save / load wiring (its fetch is stubbed; the collector
 * and the loader are called directly). Those are covered by crm-listing-round-trip.test.ts (handlers) and the
 * page tests (rental-form-p0-fixes, sale-form-workflow-save-reload).
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');

type Rec = Record<string, unknown>;
const ROOT = resolve(__dirname, '../..');

// ── In-memory persistence (mirror of crm-listing-round-trip.test.ts) ──────────────────────────────────
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
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', rebnyListingUrl: 'https://www.mallan.nyc/listing/x' }) }));
// public-cache revalidation needs the Next request store; the persistence proof does not
jest.mock('@/lib/cache/public-cache', () => {
  const actual = jest.requireActual('@/lib/cache/public-cache');
  return { __esModule: true, ...actual, safeRevalidateTags: async () => undefined };
});

const json = (body: unknown, method: string, url: string) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function post(body: Rec) {
  const { POST } = await import('@/app/api/crm/listings/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (POST as any)(json(body, 'POST', 'http://localhost/api/crm/listings'));
}
async function get(id: string) {
  const { GET } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (GET as any)(new Request(`http://localhost/api/crm/listings/${id}`), { params: Promise.resolve({ id }) });
}
async function patch(id: string, body: Rec) {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(json(body, 'PATCH', `http://localhost/api/crm/listings/${id}`), { params: Promise.resolve({ id }) });
}

// ── The page in a real DOM ────────────────────────────────────────────────────────────────────────────
class LocalOnly extends jsdom.ResourceLoader {
  fetch(url: string) {
    const m = url.match(/^http:\/\/localhost\/crm\/(.+)$/);
    if (!m) return null; // CDN (Tailwind, fonts, icons) — not needed for behaviour
    try { return Promise.resolve(readFileSync(resolve(ROOT, 'public/crm', m[1].split('?')[0]))); } catch { return null; }
  }
}
/** `api` serves JSON bodies to the page's own fetches by URL prefix (the CRM API the viewer boots against). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPage(file: string, api: Record<string, unknown> = {}): Promise<any> {
  const html = readFileSync(resolve(ROOT, 'public/crm', file.split('?')[0]), 'utf8');
  const virtualConsole = new jsdom.VirtualConsole(); // page-side errors are the page's business, not this proof's
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(html, {
    url: `http://localhost/crm/${file}`,
    runScripts: 'dangerously',
    resources: new LocalOnly(),
    pretendToBeVisual: true,
    virtualConsole,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeParse(window: any) {
      window.fetch = async (input: unknown) => {
        const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
        const hit = Object.keys(api).find((k) => url.includes(k));
        const body = hit ? api[hit] : {};
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Map([['content-type', 'application/json']]) };
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
    const fallback = setTimeout(done, 4000);
    dom.window.addEventListener('load', () => { clearTimeout(fallback); done(); });
  });
  return dom;
}

/** Let the page's pending async work (address lookups, cascades) finish while its window is alive. */
const settle = () => new Promise<void>((r) => setTimeout(r, 60));

const SKIP_TYPES = new Set(['button', 'submit', 'reset', 'file', 'hidden', 'image']);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const editable = (el: any) => {
  const key = el.id || el.name; if (!key) return false;
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
  return !SKIP_TYPES.has(type) && !el.readOnly;
};
/** The address atoms the page parser writes into hidden inputs — persisted facts, compared explicitly. */
const ADDRESS_ATOM = /(StreetNumber|StreetName|StreetSuffix|StreetDirPrefix|UnparsedAddress|City|StateOrProvince)$/;
/** A realistic number for a control, by what its id says it is. */
function numberFor(key: string, min: string | null, variant: 1 | 2): string {
  const k = key.toLowerCase();
  let v = 3;
  if (/year/.test(k)) v = 1928;
  else if (/percent|pct/.test(k)) v = 80;
  else if (/rent|price|fee|amount|deposit|reserve|financ|tax(?!lot|block)/.test(k)) v = 4500;
  else if (/sqft|area|size|dimension/.test(k)) v = 850;
  else if (/month|lease|term/.test(k)) v = 12;
  else if (/floor|stories|units|elevator|spaces|rooms|bed|bath|count|total|num|line/.test(k)) v = 2;
  if (variant === 2) v = v + 1;
  if (min !== null && Number(min) > v) v = Number(min);
  return String(v);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fire(win: any, el: any, ...types: string[]) { for (const t of types) el.dispatchEvent(new win.Event(t, { bubbles: true })); }
/** Fill every editable control deterministically, as an agent would (events fire). `variant` changes the values (the edit pass). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fillEverything(win: any, variant: 1 | 2): number {
  const doc = win.document;
  const seenRadio = new Map<string, Element[]>();
  let filled = 0;
  for (const el of doc.querySelectorAll('input, select, textarea')) {
    if (!editable(el)) continue;
    const key = el.id || el.name;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
    filled++;
    if (type === 'radio') { const g = seenRadio.get(el.name) || []; g.push(el); seenRadio.set(el.name, g); continue; }
    if (type === 'checkbox') { el.checked = variant === 1; fire(win, el, 'change'); continue; } // pass 1 checks every box, pass 2 unchecks every box
    if (tag === 'select') {
      const opts = [...el.options].filter((o: HTMLOptionElement) => !o.disabled && o.value !== '');
      if (!opts.length) continue;
      el.value = (variant === 1 ? opts[opts.length - 1] : opts[0]).value;
      fire(win, el, 'change');
      continue;
    }
    const min = el.getAttribute('min');
    // a text control that holds a figure (foundation area, tax block, shares ...) gets a figure
    const numericText = type === 'text' && /area|sqft|size|price|amount|year|pct|percent|shares|block|financ|taxlot/i.test(key) && !/dimension|remarks|name|address|units/i.test(key);
    if (numericText) { el.value = numberFor(key, null, variant); fire(win, el, 'input', 'change'); continue; }
    const byType: Record<string, string> = variant === 1
      ? { number: numberFor(key, min, 1), date: '2026-09-15', month: '2026-09', time: '10:30', 'datetime-local': '2026-09-15T10:30', url: `https://example.test/${key}`, email: `${key.toLowerCase()}@example.test`, tel: '2125550100', color: '#123456', range: min ?? '0' }
      : { number: numberFor(key, min, 2), date: '2026-10-01', month: '2026-10', time: '11:45', 'datetime-local': '2026-10-01T11:45', url: `https://example.test/${key}/2`, email: `${key.toLowerCase()}2@example.test`, tel: '2125550199', color: '#654321', range: min ?? '0' };
    const v = byType[type] ?? (variant === 1 ? `RT ${key}` : `RT2 ${key}`);
    el.value = v;
    fire(win, el, 'input', 'change');
  }
  for (const [, members] of seenRadio) {
    const pick = members[variant === 1 ? members.length - 1 : 0] as HTMLInputElement;
    pick.checked = true;
    fire(win, pick, 'change');
  }
  return filled;
}
/** The facts a real listing carries that the generic fill cannot know (address parsed by the page, agent identity from the session). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function realistic(win: any, p: 'sale' | 'rental') {
  const doc = win.document;
  const set = (id: string, value: string) => {
    const el = doc.getElementById(id); if (!el) return;
    if (el.tagName === 'SELECT' && ![...el.options].some((o: HTMLOptionElement) => o.value === value)) { const o = doc.createElement('option'); o.value = value; o.textContent = value; el.appendChild(o); }
    el.value = value; fire(win, el, 'input', 'change');
  };
  // a residential condo — RLS-eligible, so the REBNY validator and the enforcement gate run on create
  const condo = doc.querySelector(`input[name="${p}PropertyType"][value="Condo"]`);
  if (condo) { condo.checked = true; fire(win, condo, 'change'); }
  set(`${p}StreetAddress`, '400 East 90th Street');
  fire(win, doc.getElementById(`${p}StreetAddress`), 'blur');
  set(`${p}Borough`, 'Manhattan');
  set(`${p}UnitNumber`, '17C'); set(`${p}ZipCode`, '10128'); set(`${p}City`, 'New York'); set(`${p}StateOrProvince`, 'NY');
  set(`${p}Neighborhood`, 'Yorkville'); set(`${p}BldgNeighborhood`, 'Yorkville');
  for (const [id, v] of [[`${p}StreetNumber`, '400'], [`${p}StreetName`, 'East 90th Street'], [`${p}UnparsedAddress`, '400 East 90th Street 17C'], [`${p}CountyOrParish`, 'New York']]) {
    const el = doc.getElementById(id); if (el && !el.value) el.value = v;
  }
  for (const [id, v] of [
    [`${p}UpdatingAgent`, 'MALLAN-MAYA'], [`${p}UpdatingAgentMlsId`, 'MALLAN-MAYA'], [`${p}UpdatingAgentName`, 'Maya Allan'], [`${p}UpdatingAgentEmail`, 'maya@example.test'],
    [`${p}UpdatingAgentPhone`, '6462584460'], [`${p}UpdatingAgentCompanyName`, 'Mallan Real Estate Inc.'], [`${p}UpdatingAgentCompanyKey`, 'MALLAN'],
    [`${p}ListingAgent`, 'MALLAN-MAYA'], [`${p}ListingCompany`, 'Mallan Real Estate Inc.'],
  ]) { const el = doc.getElementById(id); if (el) el.value = v; }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false; // "not stated" is never a zero
  // a number control reads back the same figure ("4500" <-> "4500.00")
  if (typeof a !== 'boolean' && typeof b !== 'boolean' && a !== '' && b !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) === Number(b)) return true;
  // the collector reads strings back from the DOM; a stored number / numeric string is the same fact
  if ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string') && String(a) === String(b)) return true;
  return false;
}
/**
 * Controls that are not listing facts, so their reload is not part of the proof:
 *  - search boxes (`...Search`): typed to find a building / agent / company; never saved as a fact
 *  - `...CreateDate`: stamped by the server on every load
 *  - `...SendToAll`: the "select every destination" convenience toggle over the destination boxes (which ARE compared)
 *  - `saleNewOH...`: the open-house ENTRY row — an open house persists through the open-house API once added
 *    (tests/runtime/sale-form-openhouse-persist.test.ts); the entry row is cleared by design
 *  - `salePhotoSortOrder`: the media-ordering input (media persist through the media API)
 *  - `saleBldgStreetAddress`: derived from the unit address on reload; `rentalCityDisplay`: a display mirror of City
 */
const NOT_A_FACT = /(Search|CreateDate|SendToAll|PhotoSortOrder|CityDisplay|ShowRequiredOnly)$|^saleNewOH|^saleBldgStreetAddress$/;
/** Keys the collector emits for the editable controls (id / name) — the facts the agent typed. */
const RADIO_KEYS = new Set<string>(); // a radio the page left unchecked is legitimately absent from the payload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function controlKeys(win: any): Set<string> {
  const keys = new Set<string>();
  for (const el of win.document.querySelectorAll('input, select, textarea')) {
    const key = el.id || el.name; if (!key || NOT_A_FACT.test(key)) continue;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (editable(el) || (type === 'hidden' && ADDRESS_ATOM.test(key))) { keys.add(key); if (type === 'radio') RADIO_KEYS.add(key); }
  }
  return keys;
}
/** The verified mapping the server applies to a typed street direction ("East" → the live member "E"). */
const DIR_ALIAS = (MALLAN_FORM_CONTRACT.valueAliases as Record<string, Record<string, string>>).StreetDirPrefix ?? {};
/**
 * A checkbox GROUP (name only) is saved by the entry form as an array — under the live field it feeds
 * (Heating, PetsAllowed …) or under its own name (bldgHeating, saleCommSubtype …); the generic collector's
 * per-box boolean under the group name is not the fact. The viewer restores the group from that array.
 */
const GROUP_FACT: Record<string, string> = {
  saleHeating: 'Heating', saleCooling: 'Cooling', salePetsAllowed: 'PetsAllowed', saleBuildingPetsAllowed: 'BuildingPetsAllowed',
  saleAttendanceType: 'AttendanceType', saleBuildingLaundryFeatures: 'BuildingLaundryFeatures', // the sale form keeps saleBusinessType under its own key
  rentalHeating: 'Heating', rentalCooling: 'Cooling', rentalPetsAllowed: 'PetsAllowed', rentalBuildingPetsAllowed: 'BuildingPetsAllowed',
  rentalAttendanceType: 'AttendanceType', rentalBuildingLaundryFeatures: 'BuildingLaundryFeatures', rentalBusinessType: 'BusinessType',
};
/** What a viewer control shows for an entry-form key (undefined when the viewer has no such control). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function viewerValue(win: any, key: string): unknown {
  const doc = win.document;
  const el = doc.getElementById(key);
  if (el) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox') return el.checked;
    if (type === 'radio') { const on = doc.querySelector(`input[name="${el.name}"]:checked`); return on ? on.value : ''; }
    return el.value;
  }
  const group = [...doc.querySelectorAll(`input[name="${key}"]`)] as HTMLInputElement[];
  if (!group.length) return undefined;
  if (group[0].type === 'checkbox') return group.filter((cb) => cb.checked).map((cb) => cb.value).sort();
  const on = group.find((r) => r.checked);
  return on ? on.value : '';
}
/** The saved fact a control must show (the group's array for a checkbox group). */
function savedFact(facts: Rec, key: string): unknown {
  const arrayKey = GROUP_FACT[key] ?? key;
  const v = facts[arrayKey];
  return Array.isArray(v) ? [...v].map(String).sort() : facts[key];
}

function lost(before: Rec, after: Rec, keys: Set<string>): string[] {
  const out: string[] = [];
  for (const k of [...keys].sort()) {
    if (!(k in before)) { if (RADIO_KEYS.has(k) && !(k in after)) continue; out.push(`${k}: never collected`); continue; }
    let want = savedFact(before, k);
    const got = savedFact(after, k);
    if (/StreetDirPrefix$/.test(k) && typeof want === 'string' && DIR_ALIAS[want]) want = DIR_ALIAS[want]; // the verified mapping
    if (!sameValue(want, got)) out.push(`${k}: ${JSON.stringify(want)} → ${JSON.stringify(got)}`);
  }
  return out;
}

interface FormSpec { file: string; tools: string; viewerLoad: string; prefix: 'sale' | 'rental'; collect: string; populate: string; listingType: 'rent' | 'sale'; before?: (win: unknown) => void; after?: (win: unknown) => void }
const FORMS: FormSpec[] = [
  { file: 'RENTAL-FORM-REDESIGN.html', tools: 'RENTAL-FORM-WITH-TOOLS.html', viewerLoad: 'loadRentalListingData', prefix: 'rental', collect: 'collectRentalFormData', populate: '_populateRentalFormFromApi', listingType: 'rent' },
  {
    file: 'SALE-FORM-REDESIGN.html', tools: 'SALE-FORM-WITH-TOOLS.html', viewerLoad: 'loadSaleListingData', prefix: 'sale', collect: 'collectSaleFormData', populate: '_populateSaleFormFromApi', listingType: 'sale',
    // the page suppresses change-event cascades while it hydrates (root cause C9, 2026-05-28)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    before: (win: any) => { win._salePopulateInProgress = true; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    after: (win: any) => { win._salePopulateInProgress = false; },
  },
];

describe.each(FORMS)('$file — create → save → reload → edit → save → reload in a real DOM', (spec) => {
  jest.setTimeout(120_000);
  let id = '';
  let keys = new Set<string>();
  let latest: Rec = {};

  it('fills every editable control, saves through POST, reloads through GET and the page loader — nothing typed is lost', async () => {
    const page1 = await loadPage(spec.file);
    const win1 = page1.window;
    expect(typeof win1[spec.collect]).toBe('function');
    expect(typeof win1[spec.populate]).toBe('function');
    keys = controlKeys(win1);
    const filled = fillEverything(win1, 1);
    realistic(win1, spec.prefix);
    // an apartment: no lot and no building area (the townhouse figures are typed in the edit pass)
    for (const id of [`${spec.prefix}THLotSize`, `${spec.prefix}THBuildingArea`]) { const el = win1.document.getElementById(id); if (el) { el.value = ''; fire(win1, el, 'input', 'change'); } }
    await settle();
    expect(filled).toBeGreaterThan(100);
    const created = win1[spec.collect]() as Rec;
    expect(created.listing_type).toBe(spec.listingType);
    page1.window.close();

    const res = await post(created);
    const body = await res.json();
    expect({ status: res.status, detail: res.status === 201 ? undefined : body }).toEqual({ status: 201, detail: undefined });
    id = String(body.id);

    const reload = await (await get(id)).json();
    if (process.env.DOM_DEBUG) console.log('GET body facts', JSON.stringify({ raw: Object.fromEntries(['ActivationDate', 'saleFirstShowingDate', 'rentalFirstShowingDate', 'MaximumFinancingRemarks', 'saleMaximumFinancingRemarks', 'BuildingPetsAllowedComments', 'saleBuildingPetsAllowedComments', 'rentalBuildingPetsAllowedComments'].map((k) => [k, (reload.raw_data as Rec)?.[k]])), features: Object.fromEntries(['ActivationDate', 'MaximumFinancingRemarks', 'BuildingPetsAllowedComments'].map((k) => [k, (reload.features as Rec)?.[k]])) }));
    const page2 = await loadPage(spec.file);
    spec.before?.(page2.window);
    page2.window[spec.populate](reload);
    spec.after?.(page2.window);
    const reloaded = page2.window[spec.collect]() as Rec;
    await settle();
    page2.window.close();

    expect(lost(created, reloaded, keys)).toEqual([]);
  });

  it('edits every control on the reloaded page, saves through PATCH, reloads again — the edit persists whole', async () => {
    const reload = await (await get(id)).json();
    const page2 = await loadPage(spec.file);
    spec.before?.(page2.window);
    page2.window[spec.populate](reload);
    spec.after?.(page2.window);
    fillEverything(page2.window, 2);
    realistic(page2.window, spec.prefix);
    await settle();
    const edited = page2.window[spec.collect]() as Rec;
    latest = edited;
    page2.window.close();

    const res = await patch(id, edited);
    const body = await res.json();
    expect({ status: res.status, detail: res.status === 200 ? undefined : body }).toEqual({ status: 200, detail: undefined });

    const reload2 = await (await get(id)).json();
    const page3 = await loadPage(spec.file);
    spec.before?.(page3.window);
    page3.window[spec.populate](reload2);
    spec.after?.(page3.window);
    const reloaded = page3.window[spec.collect]() as Rec;
    await settle();
    page3.window.close();

    expect(lost(edited, reloaded, keys)).toEqual([]);
  });

  it('the tools viewer shows every saved fact on the controls it shares with the entry form', async () => {
    const body = await (await get(id)).json();
    // opened the way the CRM opens it: with the listing id in the URL (without one the viewer fails closed and blanks the page)
    const page = await loadPage(`${spec.tools}?id=${encodeURIComponent(id)}`, {
      '/api/auth/me': { authenticated: true, principalType: 'agent', role: 'broker', portalRole: 'broker', user: { id: '7', name: 'Maya Allan' } },
      [`/api/crm/listings/${id}`]: body,
    });
    const win = page.window;
    await settle(); await settle();
    expect(typeof win.viewerListingFromApi).toBe('function');
    // the page's own boot (api-client → viewerListingFromApi → the loader) has run; load once more explicitly so the
    // proof does not depend on the auth handshake timing
    win.VIEWER_LISTINGS[id] = win.viewerListingFromApi(body, id);
    win[spec.viewerLoad](id);
    await settle();
    // a fail-closed boot replaces the whole body with the 'Listing Not Available' card (no controls survive)
    expect(win.document.querySelectorAll('input, select, textarea').length).toBeGreaterThan(100);
    const wrong: string[] = [];
    let present = 0;
    for (const k of [...keys].sort()) {
      const v = viewerValue(win, k);
      if (v === undefined) continue; // the viewer has no such control (a private surface, not a copy of the entry form)
      present++;
      if (!(k in latest)) { if (!RADIO_KEYS.has(k)) wrong.push(`${k}: never collected`); continue; }
      const want = savedFact(latest, k);
      if (!sameValue(want, v)) wrong.push(`${k}: ${JSON.stringify(want)} → ${JSON.stringify(v)}`);
    }
    page.window.close();
    // the viewers carry 293 (sale) / 372 (rental) of the entry forms' controls — every one of them is compared
    expect(present).toBeGreaterThan(250);
    expect(wrong).toEqual([]);
  });
});

