/// <reference types="jest" />
/**
 * Boots the real Add / Edit listing forms (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html) in jsdom with a stubbed MallanAPI and the page
 * modules the forms load (public/crm/js/forms/*.js), so a test drives the page the way an agent's browser does: the session user arrives from
 * /api/auth/me, the live Cotality Member directory answers lookups, and in edit mode listings.get returns the stored listing.
 *
 * It also fills every control of a form with a distinctive value (fillForm), stores a payload the way the real create route does (storedListing:
 * the real normalizer and persistence code) and reads a control back (controlState), so a test can prove create -> save -> reload -> edit -> save.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizePayload, buildPersistenceRecord } from '@/lib/compliance/normalizer';
import { typedAgentColumnsFromJson } from '@/lib/listings/agent-info-typed-columns';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AddForm = 'SALE-FORM-REDESIGN' | 'RENTAL-FORM-REDESIGN';
export type DirectoryMember = { key: string; mlsId: string; fullName: string; status?: string; officeKey?: string; officeMlsId?: string; officeName?: string };
export type AddFormOpts = {
  search?: string;                                   // '?id=1' opens the form in edit mode
  listing?: Record<string, unknown>;                 // what MallanAPI.listings.get returns
  user?: Record<string, unknown> | null;             // the session user (/api/auth/me `user`); null = no session
  readyDelay?: number;                               // ms before MallanAPI.onReady fires with the user
  readySync?: boolean;                               // fire MallanAPI.onReady's callback at once, inside the call (the auth gate had already resolved)
  getDelay?: number;                                 // ms before MallanAPI.listings.get resolves
  getError?: string;                                 // make MallanAPI.listings.get fail with this message (the listing could not be loaded)
  noListingsApi?: boolean;                           // a MallanAPI without listings (no way to load or save a listing)
  buildings?: Record<string, unknown>[] | ((query: string) => Record<string, unknown>[]);   // what GET /api/buildings/search answers (the building index)
  buildingsStatus?: number | ((query: string, call: number) => number);   // the HTTP status it answers with (default 200); a function is asked per request (1, 2, ...)
  buildingsHint?: string;                            // the _errorHint it carries
  buildingsDelay?: number | ((query: string, call: number) => number);    // ms before it answers; a function is asked per request
  buildingsReply?: (query: string, call: number) => unknown;               // answers the request itself: a response-like object, or throws (the network is down)
  neighborhoods?: Record<string, string[]>;          // what GET /api/crm/neighborhoods/cotality answers (borough -> neighborhoods)
  members?: Record<string, DirectoryMember | null>;  // live Member directory answers, by MLS ID
  directoryError?: string;                           // make every directory lookup fail with this message
  memberDelays?: Record<string, number>;             // ms before the directory answers for an MLS ID (a slow answer arriving late)
  modules?: string[];                                // page modules to load, in order (default: every module the forms load)
  moduleSources?: Record<string, (source: string) => string>;   // rewrite a module's source before it runs (a copy cached from an older deploy)
  storage?: Record<string, string>;                  // localStorage entries present when the page starts (a saved browser draft)
  showings?: unknown;                                // what GET /api/crm/showings answers as its list of showings (anything: the rows are the server's); a POST is answered with { showing: { id: 'S-1' } }
  mediaRows?: unknown;                               // what GET /api/crm/listings/:id/media answers as its list of media rows (anything: the rows are the server's)
  created?: Record<string, unknown>;                 // what MallanAPI.listings.create answers, over the default { id, listing_id, status: 'Draft' } (the server's ids and addresses are the server's)
  updated?: Record<string, unknown>;                 // what MallanAPI.listings.update answers (default {}: the real route answers with the record's status, which is the server's)
  statusAnswer?: Record<string, unknown>;            // what MallanAPI.listings.updateStatus answers (default {})
  statusError?: string;                              // make MallanAPI.listings.updateStatus fail with this message (the status route refuses the change)
  settle?: number;                                   // ms to let page init finish
};
export type Request = { url: string; method: string; body: string };
export type BootedForm = { w: any; d: Document; errors: string[]; fetched: string[]; searched: string[]; requests: Request[]; saved: Record<string, unknown>[]; statusCalls: [unknown, unknown][]; close: () => void };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await sleep(25);
  }
}

export const SESSION_USER = {
  id: 'AG-9', mlsId: '39361', name: 'Sender Agent', phone: '212-555-0199', email: 'sender@example.test', license: 'L-123',
  companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.',
};
export const SESSION_MEMBER: DirectoryMember = {
  key: '4455667', mlsId: '39361', fullName: 'Sender Agent', status: 'Active', officeKey: '5671398', officeMlsId: '7041', officeName: 'Cotality Office Name',
};
export const PAGE_MODULES = ['directory-picker', 'colist-section', 'agent-defaults', 'listing-hydration', 'fair-housing', 'building-lookup', 'listing-media', 'listing-open-houses'];

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

export async function bootAddForm(form: AddForm, o: AddFormOpts = {}): Promise<BootedForm> {
  const html = read(`public/crm/${form}.html`);
  const errors: string[] = [];
  const fetched: string[] = [];
  const saved: Record<string, unknown>[] = [];
  const statusCalls: [unknown, unknown][] = [];          // every listings.updateStatus(id, status) the page made
  const searched: string[] = [];                       // the queries sent to /api/buildings/search
  const requests: Request[] = [];                      // every fetch() the page made, with its method and body
  let buildingCalls = 0;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: any) => errors.push(String(e?.detail?.message ?? e?.message)));
  const user = o.user === undefined ? SESSION_USER : o.user;
  const members = o.members ?? { '39361': SESSION_MEMBER };
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${form}.html${o.search ?? ''}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w: any) {
      w.tailwind = { config: {} };
      w.alert = () => undefined; w.confirm = () => true; w.scrollTo = () => undefined; w.print = () => undefined;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.fetch = async (url: string, init?: { method?: string; body?: unknown }) => {
        const u = String(url);
        requests.push({ url: u, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : '' });
        if (o.mediaRows !== undefined && (init?.method ?? 'GET') === 'GET' && /^\/api\/crm\/listings\/[^/?]+\/media(\?.*)?$/.test(u)) {
          return { ok: true, status: 200, json: async () => ({ listing_id: 'L-1', media: o.mediaRows }), text: async () => '' };
        }
        if (u.startsWith('/api/crm/showings')) {
          const method = init?.method ?? 'GET';
          const body = method === 'GET' ? { showings: o.showings ?? [] } : method === 'POST' ? { showing: { id: 'S-1' } } : {};
          return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => body, text: async () => '' };
        }
        if (u.startsWith('/api/buildings/search')) {
          const q = decodeURIComponent((u.split('q=')[1] ?? '').split('&')[0]);
          const call = ++buildingCalls;
          searched.push(q);                              // the query as it was asked, before the index answers
          const wait = typeof o.buildingsDelay === 'function' ? o.buildingsDelay(q, call) : o.buildingsDelay;
          if (wait) await sleep(wait);
          const reply = o.buildingsReply ? o.buildingsReply(q, call) : undefined;     // undefined: the stub answers as usual
          if (reply !== undefined) return reply;
          const status = typeof o.buildingsStatus === 'function' ? o.buildingsStatus(q, call) : (o.buildingsStatus ?? 200);
          const rows = typeof o.buildings === 'function' ? o.buildings(q) : (o.buildings ?? []);
          return { ok: status < 400, status, json: async () => ({ buildings: rows, ...(o.buildingsHint ? { _errorHint: o.buildingsHint } : {}) }), text: async () => '' };
        }
        if (u.startsWith('/api/crm/neighborhoods/cotality')) return { ok: true, status: 200, json: async () => ({ boroughs: o.neighborhoods ?? {} }), text: async () => '' };
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
      };
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      for (const [k, v] of Object.entries(o.storage ?? {})) w.localStorage.setItem(k, v);
      const context = { authenticated: !!user, role: 'agent', portalRole: 'agent', user };
      w.MallanAPI = {
        isReady: true,
        // the real client fires onReady with the session user once init() has resolved (at once when it already has), and with null when the session is anonymous
        onReady: (cb: (u: unknown) => void) => { if (o.readySync && user) cb(user); else setTimeout(() => cb(user), o.readyDelay ?? 5); },
        getContext: () => context,
        init: () => Promise.resolve({ authenticated: !!user, user }),
        listings: {
          get: async () => { await sleep(o.getDelay ?? 10); if (o.getError) throw new Error(o.getError); return o.listing ?? {}; },
          create: async (payload: Record<string, unknown>) => { saved.push(payload); return { id: '1', listing_id: 'L-1', status: 'Draft', ...(o.created ?? {}) }; },
          update: async (_id: string, payload: Record<string, unknown>) => { saved.push(payload); return { ...(o.updated ?? {}) }; },
          updateStatus: async (id: unknown, status: unknown) => { statusCalls.push([id, status]); if (o.statusError) throw new Error(o.statusError); return { ...(o.statusAnswer ?? {}) }; },
        },
        idx: { search: async () => ({ results: [] }) },
        _fetch: async (path: string) => {
          fetched.push(path);
          const m = /\/api\/crm\/directory\/members\?.*mlsId=(\d+)/.exec(path);
          if (m) {
            if (o.memberDelays?.[m[1]]) await sleep(o.memberDelays[m[1]]);
            if (o.directoryError) throw new Error(o.directoryError);
            const member = members[m[1]];
            return { members: member ? [member] : [] };
          }
          return {};
        },
      };
      if (o.noListingsApi) delete w.MallanAPI.listings;
      for (const name of o.modules ?? PAGE_MODULES) w.eval((o.moduleSources?.[name] ?? ((s: string) => s))(read(`public/crm/js/forms/${name}.js`)));
    },
  });
  await sleep(o.settle ?? 1200);
  return { w: dom.window, d: dom.window.document, errors, fetched, searched, requests, saved, statusCalls, close: () => dom.window.close() };
}

export const val = (d: Document, id: string): string => ((d.getElementById(id) as HTMLInputElement | null)?.value) ?? '';
export const txt = (d: Document, id: string): string => d.getElementById(id)?.textContent ?? '';
export const cotalityStatus = (d: Document, prefix: string): string => txt(d, `${prefix}AgentCotalityStatus`);
/** Wait until the Cotality check has said what it found (it starts with "Checking ..."). */
export const checked = (d: Document, prefix: string) => until(() => { const s = cotalityStatus(d, prefix); return s !== '' && !/^Checking/.test(s); });

// ── filling a form in, saving it the way the real route does, and reading a control back ──────────────────────────────────────────────────────────────────
export type Entered = { key: string; kind: 'value' | 'radio' | 'check' | 'group'; expected: string | boolean | string[] };

// Not filled in. The agent module owns the two agent pickers (the session agent is the listing agent); the street line is read by the form (parseRentalAddress /
// parseSaleAddress) from a real address a test types; the status is the record's (a create always starts as Draft, transitions go through the status route); and the
// Office / Retail and Commercial sub-selectors only mean something for those classifications, so a form with another classification clears them (a test sets them
// together with their classification).
const NOT_ENTERED = /^(sale|rental)(ListingAgentSearch|ListingCompanySearch|StreetAddress|Status|OfficeRetailOwnership|CommercialOwnership)$/;
// "None of these" values switch the rest of their group off when the agent picks them; they are left unchecked so the group is coherent.
const EXCLUSIVE = /^(None|BuildingNo|UnitNo)$/;
// Choices that switch other controls off (opt-out listing types, tenant-pays, a commercial classification): the first option is neutral.
const FIRST_OF = /ListingType$|FareAct|PropertyType$/;

/**
 * Fills every writable control in the form's saved area (the main container its save sweeps, the building modal, the media modal) with a distinctive value and
 * returns what was entered. A text control that feeds a numeric provider field gets a number (the forms parse those with parseInt / parseFloat, so a word would
 * be zeroed): `numeric` names them.
 */
export function fillForm(d: Document, prefix: 'sale' | 'rental', numeric: Set<string>): Entered[] {
  const out: Entered[] = [];
  const radios = new Set<string>();
  const groups = new Map<string, string[]>();
  const zones = [d.querySelector('.flex-1'), d.getElementById(`${prefix}BuildingModal`), d.getElementById(`${prefix}MediaModal`)].filter(Boolean) as Element[];
  let n = 0;
  for (const zone of zones) {
    zone.querySelectorAll('input, select, textarea').forEach((el: any) => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'button', 'submit', 'reset', 'file', 'image'].includes(type) || el.disabled || el.readOnly) return;
      const key = el.id || el.name;
      if (!key || NOT_ENTERED.test(key)) return;
      n += 1;
      if (el.tagName === 'SELECT') {
        const options = [...el.options].filter((o: any) => o.value !== '' && !o.disabled);
        if (!options.length) return;
        const choice = options[options.length - 1].value;
        el.value = choice;
        out.push({ key, kind: 'value', expected: choice });
      } else if (type === 'radio') {
        if (radios.has(el.name)) return;
        radios.add(el.name);
        const group = [...d.querySelectorAll(`input[type="radio"][name="${el.name}"]`)] as HTMLInputElement[];
        const pick = FIRST_OF.test(el.name) ? group[0] : group[group.length - 1];
        group.forEach((r) => { r.checked = r === pick; });
        // the collector keys a radio by its id when it has one, by its name otherwise
        out.push({ key: pick.id || pick.name, kind: 'radio', expected: pick.value });
      } else if (type === 'checkbox') {
        if (EXCLUSIVE.test(el.value)) return;
        el.checked = true;
        if (el.id) out.push({ key, kind: 'check', expected: true });
        else groups.set(el.name, [...(groups.get(el.name) ?? []), el.value]);
      } else {
        const v = type === 'number' || numeric.has(key) ? String(100 + n) : type === 'date' ? '2026-03-15' : type === 'datetime-local' ? '2026-03-15T10:30' : type === 'time' ? '10:30'
          : type === 'email' ? `a${n}@example.test` : type === 'url' ? `https://example.test/${n}` : type === 'tel' ? '212-555-0100' : `T${n}`;
        el.value = v;
        if (el.value === v) out.push({ key, kind: 'value', expected: v });
      }
    });
  }
  groups.forEach((values, key) => out.push({ key, kind: 'group', expected: [...values].sort() }));
  return out;
}

/** What the real create route stores for a form payload (normalizer -> persistence record -> row), as the real GET returns it. */
export function storedListing(payload: Record<string, unknown>, listingType: 'sale' | 'rent'): Record<string, unknown> {
  const { normalized } = normalizePayload(payload);
  const rec = buildPersistenceRecord(normalized);
  const top = { ...(rec.topLevel as Record<string, unknown>) };
  for (const k of ['list_price', 'living_area']) if (top[k] !== undefined && top[k] !== null) top[k] = String(top[k]);
  return {
    // a create always starts as Draft (the route ignores the status in the body); transitions go through the status route
    id: '1', listing_id: listingType === 'sale' ? 'SL-0001' : 'RL-0001', listing_type: listingType,
    // the create route records the signed-in user as the listing's agent (agent_id: auth.userId), and the GET returns it as a string
    agent_id: String(SESSION_USER.id),
    ...top, status: 'Draft', ...typedAgentColumnsFromJson(rec.agentInfo),
    address: rec.address, features: rec.features, raw_data: rec.raw_data, agent_info: {}, media: [],
    created_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-02T00:00:00.000Z',
  };
}

/** What a control of the form shows now (null: the form has no such control). */
export function controlState(d: Document, e: Entered): string | boolean | string[] | null {
  if (e.kind === 'value') {
    const el = d.getElementById(e.key) ?? (d.getElementsByName(e.key)[0] as HTMLElement | undefined);
    return el ? (el as HTMLInputElement).value : null;
  }
  if (e.kind === 'check') {
    const el = d.getElementById(e.key) as HTMLInputElement | null;
    return el ? el.checked : null;
  }
  if (e.kind === 'group') {
    const boxes = [...d.querySelectorAll(`input[type="checkbox"][name="${e.key}"]`)] as HTMLInputElement[];
    return boxes.length ? boxes.filter((c) => c.checked).map((c) => c.value).sort() : null;
  }
  const byId = d.getElementById(e.key) as HTMLInputElement | null;
  const set = byId ? (byId.name ? ([...d.querySelectorAll(`input[type="radio"][name="${byId.name}"]`)] as HTMLInputElement[]) : [byId]) : ([...d.getElementsByName(e.key)] as HTMLInputElement[]);
  if (!set.length) return null;
  const on = set.find((r) => r.checked);
  return on ? on.value : '';
}
