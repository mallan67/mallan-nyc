/// <reference types="jest" />
/**
 * Shared harness for the Tools viewer tests: boots SALE-FORM-WITH-TOOLS / RENTAL-FORM-WITH-TOOLS in jsdom with the REAL api-client and the
 * REAL viewer-hydration module (the page's two <script src> files, which jsdom does not fetch) and a routed fetch for /api/auth/me and
 * /api/crm/listings/:id, so the real onReady / init / listings.get semantics decide the order of events.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
export const API_CLIENT = read('public/crm/js/core/api-client.js');
export const VIEWER_HYDRATION = read('public/crm/js/forms/viewer-hydration.js');

export type Mode = 'ok' | 'missing' | 'anon' | 'never';
export type ViewerFile = 'SALE-FORM-WITH-TOOLS' | 'RENTAL-FORM-WITH-TOOLS';
export type ViewerOpts = { search?: string; mode?: Mode; listing?: Record<string, unknown>; role?: string; delay?: number; shrinkLongTimers?: boolean };
export type Booted = { w: any; d: Document; errors: string[]; requests: string[]; close: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ROUTES: Record<ViewerFile, string> = { 'SALE-FORM-WITH-TOOLS': 'sale-view', 'RENTAL-FORM-WITH-TOOLS': 'rental-view' };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await sleep(25);
  }
}
export const isFailScreen = (d: Document) => d.body.children.length === 1 && /Listing Not Available/.test(d.body.textContent ?? '');
export const rendered = (d: Document) => d.body.classList.contains('viewer-mode') && !d.body.classList.contains('skeleton-loading') && !isFailScreen(d);
export const field = (d: Document, id: string) => d.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
export const NAVIGATION = 'Not implemented: navigation (except hash changes)'; // jsdom cannot navigate: a redirect attempt is its only trace

export function bootViewer(file: ViewerFile, o: ViewerOpts = {}): Booted {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${file}.html`), 'utf8');
  const errors: string[] = [];
  const requests: string[] = [];
  const mode = o.mode ?? 'ok';
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => errors.push(String(e.detail?.message ?? e.message)));
  const me = { authenticated: true, principalType: 'agent', role: o.role ?? 'agent', portalRole: o.role ?? 'agent', user: { id: 'AG-9', name: 'Sender Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } };
  const listing = o.listing ?? { id: '404', listing_id: 'SL-0404', status: 'Active', raw_data: {} };
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${ROUTES[file]}${o.search ?? '?id=SL-0404'}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeParse(w: any) {
      w.tailwind = { config: {} }; // the CDN script is not loaded in jsdom; the page only assigns tailwind.config
      w.alert = () => undefined;
      w.confirm = () => true;
      w.scrollTo = () => undefined;
      w.print = () => undefined;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      if (o.shrinkLongTimers) {
        // the viewer gives the CRM 30 seconds to answer; run that wait in 300 ms
        const real = w.setTimeout.bind(w);
        w.setTimeout = (fn: () => void, ms?: number, ...rest: unknown[]) => real(fn, ms === 30000 ? 300 : ms, ...rest);
      }
      const reply = (status: number, body: unknown, wait = 0) =>
        new Promise((r) => setTimeout(() => r({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }), wait));
      w.fetch = (u: string, init?: { method?: string }) => {
        const path = String(u).replace(/^https?:\/\/[^/]+/, '');
        requests.push(`${init?.method ?? 'GET'} ${path}`);
        if (path === '/api/auth/me') return reply(200, mode === 'anon' ? { authenticated: false, principalType: null, role: null, portalRole: null, user: null } : me);
        if (/^\/api\/crm\/listings\/[^/?]+$/.test(path)) {
          if (mode === 'never') return new Promise(() => undefined);
          if (mode === 'missing') return reply(404, { error: 'Listing not found' }, o.delay ?? 40);
          return reply(200, listing, o.delay ?? 40);
        }
        return reply(200, {});
      };
      // The page's own <script src> files are not fetched by jsdom: run the real files first, in the order the page lists them.
      w.eval(API_CLIENT);
      w.eval(VIEWER_HYDRATION);
    },
  });
  return { w: dom.window, d: dom.window.document, errors, requests, close: () => dom.window.close() };
}
