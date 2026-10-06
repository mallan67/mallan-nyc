/// <reference types="jest" />
/**
 * Boots the real Add / Edit listing forms (SALE-FORM-REDESIGN.html, RENTAL-FORM-REDESIGN.html) in jsdom with a stubbed MallanAPI and the page
 * modules the forms load (public/crm/js/forms/*.js), so a test drives the page the way an agent's browser does: the session user arrives from
 * /api/auth/me, the live Cotality Member directory answers lookups, and in edit mode listings.get returns the stored listing.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  getDelay?: number;                                 // ms before MallanAPI.listings.get resolves
  members?: Record<string, DirectoryMember | null>;  // live Member directory answers, by MLS ID
  directoryError?: string;                           // make every directory lookup fail with this message
  memberDelays?: Record<string, number>;             // ms before the directory answers for an MLS ID (a slow answer arriving late)
  modules?: string[];                                // page modules to load, in order (default: every module the forms load)
  storage?: Record<string, string>;                  // localStorage entries present when the page starts (a saved browser draft)
  settle?: number;                                   // ms to let page init finish
};
export type BootedForm = { w: any; d: Document; errors: string[]; fetched: string[]; saved: Record<string, unknown>[]; close: () => void };

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
export const PAGE_MODULES = ['directory-picker', 'colist-section', 'agent-defaults'];

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

export async function bootAddForm(form: AddForm, o: AddFormOpts = {}): Promise<BootedForm> {
  const html = read(`public/crm/${form}.html`);
  const errors: string[] = [];
  const fetched: string[] = [];
  const saved: Record<string, unknown>[] = [];
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
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      for (const [k, v] of Object.entries(o.storage ?? {})) w.localStorage.setItem(k, v);
      const context = { authenticated: !!user, role: 'agent', portalRole: 'agent', user };
      w.MallanAPI = {
        isReady: true,
        // the real client fires onReady with the session user once init() has succeeded, and never for an anonymous session
        onReady: (cb: (u: unknown) => void) => { if (user) setTimeout(() => cb(user), o.readyDelay ?? 5); },
        getContext: () => context,
        init: () => Promise.resolve({ authenticated: !!user, user }),
        listings: {
          get: async () => { await sleep(o.getDelay ?? 10); return o.listing ?? {}; },
          create: async (payload: Record<string, unknown>) => { saved.push(payload); return { id: '1', listing_id: 'L-1', status: 'Draft' }; },
          update: async (_id: string, payload: Record<string, unknown>) => { saved.push(payload); return {}; },
          updateStatus: async () => ({}),
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
      for (const name of o.modules ?? PAGE_MODULES) w.eval(read(`public/crm/js/forms/${name}.js`));
    },
  });
  await sleep(o.settle ?? 1200);
  return { w: dom.window, d: dom.window.document, errors, fetched, saved, close: () => dom.window.close() };
}

export const val = (d: Document, id: string): string => ((d.getElementById(id) as HTMLInputElement | null)?.value) ?? '';
export const txt = (d: Document, id: string): string => d.getElementById(id)?.textContent ?? '';
export const cotalityStatus = (d: Document, prefix: string): string => txt(d, `${prefix}AgentCotalityStatus`);
/** Wait until the Cotality check has said what it found (it starts with "Checking ..."). */
export const checked = (d: Document, prefix: string) => until(() => { const s = cotalityStatus(d, prefix); return s !== '' && !/^Checking/.test(s); });
