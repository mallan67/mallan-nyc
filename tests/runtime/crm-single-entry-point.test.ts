/// <reference types="jest" />
/**
 * THREE APPLICATIONS, THREE ADDRESSES, ONE OWNER EACH.
 *
 * ── THE ERROR THIS FILE USED TO ENCODE ─────────────────────────────────────────────────────────
 *
 * An earlier version of this suite asserted `/crm -> /crm/index-built.html` and described
 * dashboard.html as "the duplicate". That was wrong, and it was my error. A forensic census on
 * 2026-09-10 proved the two files are not two copies of one product:
 *
 *   public/crm/dashboard.html      71 Router.register routes, broker/agent panels, NO search engine
 *                                  -> this IS the brokerage CRM
 *   public/crm/index.html
 *     -> index-built.html          the search form, executor and renderer, NO CRM panels
 *                                  -> this IS the Backend Agent Search / Listings application
 *
 * Pointing /crm at index-built.html made the professional Search application answer at the CRM's
 * address. That is why the operator saw "different CRMs": a browser at /crm reached Search while the
 * installed PWA (start_url /crm/dashboard) reached the CRM.
 *
 * ── THE DECIDED BOUNDARY (Master Plan §5.1) ────────────────────────────────────────────────────
 *
 *   PUBLIC        /search /buy /rent   app/search/page.tsx      consumer rights, public DTO
 *   PROFESSIONAL  /crm/search          index-built.html         member rights, agent DTO
 *   BROKERAGE     /crm                 dashboard.html           clients, agents, deals, finance
 *
 * URL namespace does not determine ownership: the professional Search keeps a historical /crm/*
 * path because the application behind it is independent, which is proven separately by
 * crm-backend-search-independence.test.ts.
 *
 * The compliance rule this file guards: the public consumer application and the professional
 * application must never resolve to each other. They serve different audiences with different
 * provider display rights.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

type Rewrite = { source: string; destination: string };
const vercel = JSON.parse(read('vercel.json')) as { rewrites: Rewrite[] };
const rewriteFor = (source: string) => vercel.rewrites.find((r) => r.source === source);

/** The brokerage CRM. */
const CRM = '/crm/dashboard.html';
/** The professional Backend Agent Search / Listings application. */
const BACKEND_SEARCH = '/crm/index-built.html';

describe('the CRM answers at /crm', () => {
  it('/crm resolves to the CRM application, not to Backend Search', () => {
    expect(rewriteFor('/crm')!.destination).toBe(CRM);
  });

  it('/crm/dashboard resolves to the SAME CRM application — a compatibility address, not a second app', () => {
    expect(rewriteFor('/crm/dashboard')!.destination).toBe(CRM);
    expect(rewriteFor('/crm/dashboard')!.destination).toBe(rewriteFor('/crm')!.destination);
  });

  it('an ordinary sign-in lands on the CRM', () => {
    const login = read('public/crm/login.html');
    const fallback = /function getRedirectTarget\(\)[\s\S]*?return\s+'([^']+)';\s*\}/.exec(login);
    expect(fallback).not.toBeNull();
    // '/crm' now IS the CRM, so this destination is correct.
    expect(['/crm', '/crm/dashboard']).toContain(fallback![1]);
  });

  it('the installed PWA opens the same CRM application as a browser', () => {
    const manifest = JSON.parse(read('public/crm/manifest.json')) as { start_url?: string };
    const start = manifest.start_url || '';
    const resolved = rewriteFor(start)?.destination ?? null;
    expect({ start, resolved }).toEqual({ start, resolved: CRM });
  });
});

describe('Backend Agent Search answers at /crm/search', () => {
  it('/crm/search resolves to the Backend Search application', () => {
    expect(rewriteFor('/crm/search')!.destination).toBe(BACKEND_SEARCH);
  });

  it('the CRM and Backend Search are DIFFERENT applications, not two names for one', () => {
    expect(rewriteFor('/crm')!.destination).not.toBe(rewriteFor('/crm/search')!.destination);
  });

  it('the sale and rental editors keep their own canonical routes', () => {
    expect(rewriteFor('/crm/sale-listing')!.destination).toBe('/crm/SALE-FORM-REDESIGN.html');
    expect(rewriteFor('/crm/rental-listing')!.destination).toBe('/crm/RENTAL-FORM-REDESIGN.html');
  });
});

describe('the public/professional compliance boundary holds at the route layer', () => {
  it('no rewrite serves the professional application on a public route', () => {
    const PUBLIC = ['/search', '/buy', '/rent'];
    const leaked = vercel.rewrites.filter((r) => PUBLIC.includes(r.source) && r.destination.includes('index-built'));
    expect({
      leaked: leaked.map((r) => `${r.source} -> ${r.destination}`),
      why: 'The public Consumer Search and the professional Backend Agent Search serve different audiences with different provider display rights. A public route must never receive the professional application.',
    }).toEqual({ leaked: [], why: expect.any(String) });
  });

  it('the public consumer routes are not claimed by a rewrite at all — they are Next.js app routes', () => {
    for (const p of ['/search', '/buy', '/rent']) {
      expect(rewriteFor(p)).toBeUndefined();
    }
  });

  it('the public Consumer Search application still exists and is untouched by this boundary work', () => {
    expect(() => read('app/search/page.tsx')).not.toThrow();
  });

  it('no professional route falls through to the public consumer application', () => {
    for (const p of ['/crm', '/crm/search', '/crm/sale-listing', '/crm/rental-listing']) {
      const dest = rewriteFor(p)!.destination;
      expect(dest.startsWith('/crm/')).toBe(true);
    }
  });
});
