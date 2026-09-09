/// <reference types="jest" />
/**
 * THERE IS ONE CRM, AND /crm IS ITS FRONT DOOR.
 *
 * Two CRM applications have been shipping side by side:
 *
 *   CANONICAL   public/crm/index.html -> built to public/crm/index-built.html
 *               Property Search (sale + rental, basic + advanced), Building search, Comparables,
 *               Manage Listings, Open Houses, saved searches, the sale/rental form entry points.
 *
 *   DUPLICATE   public/crm/dashboard.html + public/crm/js/dashboard/**
 *               Introduced by 9716752d "CRM v2 - modular dashboard replacing monolith". It took over
 *               /crm as the entry point, but the monolith it claimed to replace was never retired.
 *
 * The consequence, reported by the owner 2026-09-09: "i have no search right now". The canonical app
 * was deployed and healthy the whole time - its JS answered 200 on production - but nothing in the
 * served shell could reach it. /crm went to the duplicate, and the duplicate's single door to Search
 * (the Property Search tab) was being painted over by the Ops Dashboard's late render.
 *
 * This file pins the entry point so a second shell can never quietly become the front door again.
 * It reads the SHIPPED vercel.json and the SHIPPED login page.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

type Rewrite = { source: string; destination: string };
const vercel = JSON.parse(read('vercel.json')) as { rewrites: Rewrite[] };
const rewriteFor = (source: string) => vercel.rewrites.find((r) => r.source === source);

/** The one shell that survives convergence. */
const CANONICAL_SHELL = '/crm/index-built.html';
/** The shell being retired. Nothing may route to it once the migration completes. */
const DUPLICATE_SHELL = '/crm/dashboard.html';

describe('/crm serves the canonical CRM', () => {
  it('the front door goes to the canonical shell, not the duplicate', () => {
    const r = rewriteFor('/crm');
    expect(r).toBeDefined();
    expect(r!.destination).toBe(CANONICAL_SHELL);
  });

  it('the search path and the front door land on the same single application', () => {
    expect(rewriteFor('/crm/search')!.destination).toBe(CANONICAL_SHELL);
    expect(rewriteFor('/crm')!.destination).toBe(CANONICAL_SHELL);
  });

  it('login sends an operator with no explicit target to the canonical CRM', () => {
    const login = read('public/crm/login.html');
    // getRedirectTarget()'s fallback is what every ordinary sign-in follows.
    const fallback = /function getRedirectTarget\(\)[\s\S]*?return\s+'([^']+)';\s*\}/.exec(login);
    expect(fallback).not.toBeNull();
    expect(fallback![1]).toBe('/crm');
  });

  it('no production sign-in path hardcodes the duplicate shell', () => {
    const login = read('public/crm/login.html');
    // The localhost-only dev bypass is exempt: it cannot run in production.
    const withoutDevBypass = login.replace(/function devLogin\(\)[\s\S]*?\n\s*\}/, '');
    expect(withoutDevBypass).not.toContain(DUPLICATE_SHELL);
  });
});

describe('the duplicate shell is on an explicit, temporary path only', () => {
  it('only the named migration route may still reach it', () => {
    const toDuplicate = vercel.rewrites.filter((r) => r.destination === DUPLICATE_SHELL);
    // During convergence exactly one escape hatch exists so the broker console is not lost mid-move.
    // When the duplicate is retired this must become zero and this expectation flips to toEqual([]).
    expect(toDuplicate.map((r) => r.source)).toEqual(['/crm/dashboard']);
  });

  it('the duplicate is never the destination of the bare /crm entry', () => {
    expect(rewriteFor('/crm')!.destination).not.toBe(DUPLICATE_SHELL);
  });
});
