/// <reference types="jest" />
/**
 * Shared harness for the Tools viewer tests: boots SALE-FORM-WITH-TOOLS / RENTAL-FORM-WITH-TOOLS in jsdom with the REAL api-client, the
 * REAL listing-hydration module and the REAL listing-open-houses module (the page's <script src> files, which jsdom does not fetch) and a routed fetch for /api/auth/me,
 * /api/crm/listings/:id and /api/crm/showings, so the real onReady / init / listings.get semantics decide the order of events.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
export const API_CLIENT = read('public/crm/js/core/api-client.js');
export const LISTING_HYDRATION = read('public/crm/js/forms/listing-hydration.js');
export const OPEN_HOUSES = read('public/crm/js/forms/listing-open-houses.js');

export type Mode = 'ok' | 'missing' | 'anon' | 'never';
export type ViewerFile = 'SALE-FORM-WITH-TOOLS' | 'RENTAL-FORM-WITH-TOOLS';
export type ViewerOpts = { search?: string; mode?: Mode; listing?: Record<string, unknown>; role?: string; delay?: number; shrinkLongTimers?: boolean; user?: Record<string, unknown>; showings?: unknown; showingsFail?: number | 'network'; showingsOpen?: boolean; noOpenHouses?: boolean; media?: unknown; mediaBody?: unknown; mediaStatus?: number; mediaGate?: Promise<void>; mediaFail?: boolean };   // user: the signed-in agent (/api/auth/me `user`); showings: the showings the server has (GET /api/crm/showings answers from them as the server does: see showingsAnswer); showingsFail: it answers with this HTTP status instead, or the request fails ('network'); showingsOpen: it answers a reader who is not an agent or a broker (the real route refuses them); noOpenHouses: the page loads without listing-open-houses.js; media: the listing's media rows (GET /api/crm/listings/:id/media answers them; left out, it answers as the real route does for a listing with no rows: a read-only preview of the record's own `media` list); mediaBody: it answers this body instead of the rows (or of the refusal); mediaStatus: the HTTP status it answers with (default 200); mediaGate: it answers once this promise is settled (a test opens the gate when it wants the photos to arrive); mediaFail: the request fails (the network is down)
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
export const renderedBody = (d: Document) => d.body.classList.contains('viewer-mode') && !d.body.classList.contains('skeleton-loading') && !isFailScreen(d);
// the photos have been answered (or failed): a page that has no photo state yet counts as answered
export const mediaSettled = (d: Document) => { const w = d.defaultView as any; return typeof w?.viewerMediaState !== 'function' || w.viewerMediaState() !== 'loading'; };       // eslint-disable-line @typescript-eslint/no-explicit-any
export const rendered = (d: Document) => renderedBody(d) && mediaSettled(d);
export const field = (d: Document, id: string) => d.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
export const NAVIGATION = 'Not implemented: navigation (except hash changes)'; // jsdom cannot navigate: a redirect attempt is its only trace

// GET /api/crm/showings as the server answers it (app/api/crm/showings/route.ts): the showings that match type and date_from, the oldest first, a page of at most 200 (50 when no limit is asked)
// from offset, and the number of all of them. It has no filter for a listing: the page asks for what it wants and picks its listing's out.
export function showingsAnswer(rows: unknown, query: URLSearchParams) {
  const day = (s: any) => String(s?.date ?? '').slice(0, 10);       // eslint-disable-line @typescript-eslint/no-explicit-any
  const type = query.get('type'), from = query.get('date_from');
  const matching = (Array.isArray(rows) ? rows : [])
    .filter((s) => (!type || s.type === type) && (!from || day(s) >= from))
    .map((s, index) => ({ s, index }))
    .sort((a, b) => (day(a.s) < day(b.s) ? -1 : day(a.s) > day(b.s) ? 1 : a.index - b.index))
    .map((entry) => entry.s);
  const limit = Math.min(parseInt(query.get('limit') || '50', 10), 200);
  const offset = parseInt(query.get('offset') || '0', 10);
  return { showings: matching.slice(offset, offset + limit), total: matching.length, limit, offset };
}

// What GET /api/crm/listings/:id/media answers for a listing that has no media rows (app/api/crm/listings/[id]/media/route.ts): a read-only preview of the record's own legacy `media` list, each item
// with the type crmMediaType gives it (a floor plan by its type or its caption, a video by its type, else a photo)
export function legacyMediaPreview(listing: Record<string, unknown>) {
  const items: any[] = Array.isArray(listing.media) ? (listing.media as any[]) : [];       // eslint-disable-line @typescript-eslint/no-explicit-any
  const media = items.flatMap((item, index) => {
    const url = item && typeof item.url === 'string' ? item.url : '';
    if (!url) return [];
    const kind = String(item.type ?? '').toLowerCase();
    const type = ['floorplan', 'floor_plan', 'floor-plan'].includes(kind) || /floor\s*plan/.test(String(item.caption ?? '').toLowerCase()) ? 'FloorPlan' : kind === 'video' ? 'Video' : 'Photo';
    return [{ media_key: `source:${index}`, url, heroUrl: url, media_type: type, media_category: type, order: index, preferred_photo_yn: false, source: 'unknown', editable: false, _preview: true }];
  });
  return { listing_id: listing.listing_id, media, _legacyPreview: true };
}

export function bootViewer(file: ViewerFile, o: ViewerOpts = {}): Booted {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${file}.html`), 'utf8');
  const errors: string[] = [];
  const requests: string[] = [];
  const mode = o.mode ?? 'ok';
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => errors.push(String(e.detail?.message ?? e.message)));
  const me = { authenticated: true, principalType: 'agent', role: o.role ?? 'agent', portalRole: o.role ?? 'agent', user: o.user ?? { id: 'AG-9', name: 'Sender Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } };
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
      // An answer to a window that was closed while the request was out is never delivered (a closed window has no document): the page's code would throw on it, in whichever test is running by then
      const reply = (status: number, body: unknown, wait = 0) =>
        new Promise((r) => setTimeout(() => { if (w.document) r({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }); }, wait));
      w.fetch = (u: string, init?: { method?: string; credentials?: string }) => {
        const path = String(u).replace(/^https?:\/\/[^/]+/, '');
        requests.push(`${init?.method ?? 'GET'} ${path}`);
        if (path === '/api/auth/me') return reply(200, mode === 'anon' ? { authenticated: false, principalType: null, role: null, portalRole: null, user: null } : me);
        if (/^\/api\/crm\/listings\/[^/?]+$/.test(path)) {
          if (mode === 'never') return new Promise(() => undefined);
          if (mode === 'missing') return reply(404, { error: 'Listing not found' }, o.delay ?? 40);
          return reply(200, listing, o.delay ?? 40);
        }
        if (/^\/api\/crm\/showings(\?|$)/.test(path)) {
          if (o.showingsFail === 'network') return Promise.reject(new Error('network down'));
          const mayRead = ['agent', 'broker'].includes(o.role ?? 'agent') || !!o.showingsOpen;              // requireAgentOrBroker
          const status = typeof o.showingsFail === 'number' ? o.showingsFail : (mayRead ? 200 : 403);
          return reply(status, status === 200 ? showingsAnswer(o.showings, new URL(path, 'https://mallan.nyc').searchParams) : { error: 'refused' });
        }
        if (/^\/api\/crm\/listings\/[^/?]+\/media(\?.*)?$/.test(path)) {
          if (o.mediaFail) return Promise.reject(new Error('network down'));                                // the media route cannot be reached
          if (init?.credentials !== 'include') return reply(401, { error: 'no session' });                // the route is the agent's: it needs the session cookie
          const status = o.mediaStatus ?? 200;
          const body = o.mediaBody !== undefined ? o.mediaBody : status >= 400 ? { error: 'refused' } : o.media !== undefined ? { listing_id: listing.listing_id, media: o.media } : legacyMediaPreview(listing);
          return (o.mediaGate ?? Promise.resolve()).then(() => reply(status, body));
        }
        return reply(200, {});
      };
      // The page's own <script src> files are not fetched by jsdom: run the real files first, in the order the page lists them.
      w.eval(API_CLIENT);
      w.eval(LISTING_HYDRATION);
      if (!o.noOpenHouses) w.eval(OPEN_HOUSES);
    },
  });
  return { w: dom.window, d: dom.window.document, errors, requests, close: () => dom.window.close() };
}
