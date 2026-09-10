/// <reference types="jest" />
/**
 * EVERY PAGE UNDER public/crm/ DECLARES WHAT IT IS, AND A NEW APPLICATION CANNOT APPEAR QUIETLY.
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────────────
 *
 * On 2026-09-09 the owner reported "i have no search right now" and "seriously how it can be that
 * there are two crms?". A browser at /crm reached one thing and the installed PWA reached another.
 *
 * The first diagnosis was WRONG, and this file's header used to carry it: that commit 9716752d had
 * added a "second CRM" (dashboard.html) duplicating a "canonical CRM" (index-built.html), and that
 * the duplicate should be emptied and deleted.
 *
 * A forensic census on 2026-09-10 disproved it. The two files are not two copies of one product —
 * they are two different products:
 *
 *   public/crm/dashboard.html      71 Router.register routes, broker/agent panels, NO search engine
 *                                  -> the BROKERAGE CRM, at /crm
 *   public/crm/index.html
 *     -> index-built.html          search form, executor, renderer, NO CRM panels
 *                                  -> BACKEND AGENT SEARCH / LISTINGS, at /crm/search
 *
 * The real defect was application-ownership and routing confusion: /crm had been repointed at
 * Backend Search, so the professional Search application answered at the CRM's address. Corrected
 * in 928f31c4. Neither application is retired and neither is going away.
 *
 * What WAS a genuine duplicate — a second My Listings implementation inside panels.js — was deleted
 * in da8e3046 and stays deleted. The CRM's Property Search control is a LAUNCHER into Backend
 * Search; a launcher is not a duplicate Search, and it remains.
 *
 * The owner's instruction, verbatim, which is about DUPLICATES and still stands: "do not just point
 * the crm, remove duplicates, agents go in there and create changes in that one and then they create
 * another one... this cannot happen ever again."
 *
 * ── WHAT THIS FILE ENFORCES ─────────────────────────────────────────────────────────────────────
 *
 * A guard, not a description. It fails closed on the moves that let a third application appear, or
 * let the two that exist bleed into each other:
 *
 *   1. adding a page under public/crm/ without declaring what it is;
 *   2. a second hashchange owner, which is what silently steals another application's routes;
 *   3. a runtime module addressing the CRM by build artifact instead of by route, which couples one
 *      application to a filename inside the other's build output.
 *
 * An agent that adds "dashboard-v3.html" turns this red. There is no way to satisfy it except by
 * declaring the file's role in PAGES below — a decision a person makes, in review, on purpose.
 */
export {};
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const CRM = resolve(ROOT, 'public/crm');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * Every page under public/crm/, and what it IS. Adding a file without adding it here fails the suite.
 *
 * ── CORRECTED 2026-09-10 ───────────────────────────────────────────────────────────────────────
 *
 * This map used to declare index.html the sole 'application-shell' and dashboard.html 'retired'.
 * That was my error. A forensic census proved they are two DIFFERENT products, not two copies of
 * one: dashboard.html carries 71 routes of broker/agent panels and no search engine; index.html
 * carries the search form, executor and renderer and no CRM panels. Master Plan §5.1 makes the
 * separation a compliance boundary, so the guard now protects TWO named applications and fails if a
 * THIRD appears — rather than trying to collapse them.
 *
 *   crm-application      the brokerage CRM: clients, agents, deals, finance, compliance.
 *   search-application   Backend Agent Search / Listings: professional, member-audience.
 *   generated            build output of an application. Never hand-edited.
 *   standalone-form      a single-purpose editor, launched by an application. Owns no routes.
 *   auth                 the sign-in page.
 *   retired              superseded and being removed. NOTE: no page carries this role today, and
 *                        dashboard.html must never be given it — it is the CRM. The role is kept
 *                        only so a genuinely dead page can be labelled honestly in future.
 *   dev-only             never served in production.
 */
const PAGES: Record<string, 'crm-application' | 'search-application' | 'generated' | 'standalone-form' | 'auth' | 'retired' | 'dev-only'> = {
  'index.html': 'search-application',
  'index-built.html': 'generated',

  'SALE-FORM-REDESIGN.html': 'standalone-form',
  'RENTAL-FORM-REDESIGN.html': 'standalone-form',
  'BUYER-DEAL-FORM.html': 'standalone-form',
  'TENANT-DEAL-FORM.html': 'standalone-form',

  // SALE-FORM-WITH-TOOLS.html and RENTAL-FORM-WITH-TOOLS.html were DELETED 2026-09-09.
  // They were stale FORKS of the two forms above, not separate products - 545/594 (92%) and
  // 605/629 (96%) identical field ids - which had diverged into carrying wrong NY mansion-tax
  // bands (understating a $3.5M buyer's liability by $8,750), an undisclosed 6% commission
  // assumption rendered as "Sell Now Net", an unreviewed shorter IDX disclaimer competing with
  // the reviewed one, and attribution fields the canonical forms had deliberately removed.
  // Git history is the archive. They must never come back: see the suite below.

  'login.html': 'auth',
  'dev.html': 'dev-only',

  // THE BROKERAGE CRM. Not retired, not a duplicate — it is the CRM, and it answers at /crm.
  'dashboard.html': 'crm-application',
};

const htmlPages = readdirSync(CRM).filter((f) => f.endsWith('.html'));

describe('exactly two applications exist, and a third cannot appear', () => {
  it('every page under public/crm/ has a declared role', () => {
    const undeclared = htmlPages.filter((f) => !(f in PAGES));
    expect({
      undeclared,
      why: 'A new page under public/crm/ must declare its role in PAGES in this file. There are exactly two applications — the CRM (dashboard.html) and Backend Agent Search (index.html). A third is not allowed; extend one of them.',
    }).toEqual({ undeclared: [], why: expect.any(String) });
  });

  it('there is exactly one CRM application, and it is dashboard.html', () => {
    const crm = Object.entries(PAGES).filter(([, role]) => role === 'crm-application').map(([f]) => f);
    expect(crm).toEqual(['dashboard.html']);
  });

  it('there is exactly one Backend Search application, and it is index.html', () => {
    const search = Object.entries(PAGES).filter(([, role]) => role === 'search-application').map(([f]) => f);
    expect(search).toEqual(['index.html']);
  });

  it('index-built.html is the GENERATED artifact of Backend Search, not a third product', () => {
    expect(PAGES['index-built.html']).toBe('generated');
  });
});

describe('each application owns its own navigation — and only its own', () => {
  /** Owning a route table is what makes a page an application rather than a form. */
  const routeTableOwners = (() => {
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(resolve(CRM, dir), { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { walk(`${dir}/${entry.name}`, childRel); continue; }
        if (!/\.(js|html)$/.test(entry.name)) continue;
        if (childRel === 'index-built.html') continue; // generated artifact
        const src = readFileSync(resolve(CRM, dir, entry.name), 'utf8');
        if (/Router\.register\(/.test(src)) out.push(childRel);
      }
    };
    walk('.', '');
    return out.sort();
  })();

  it('the CRM has exactly one route table, in js/dashboard/app.js', () => {
    // Two applications legitimately have two routers. What must never happen is TWO ROUTERS IN ONE
    // APPLICATION — that is the failure that put the Ops Dashboard's late render over Property
    // Search. The per-application ownership is proven by the hashchange guard below.
    expect(routeTableOwners).toEqual(['js/dashboard/app.js']);
  });

  it('Backend Search does not grow a Router.register table of its own', () => {
    const strays = routeTableOwners.filter((f) => !f.startsWith('js/dashboard/'));
    expect({
      strays,
      why: 'Backend Search navigates by hash section + CrmRouting. A Router.register table outside js/dashboard/ means a second CRM is being built inside the Search application.',
    }).toEqual({ strays: [], why: expect.any(String) });
  });
});

describe('one routing authority — a second hashchange owner cannot appear', () => {
  /** Every shipped CRM file that registers a hashchange listener. */
  const hashOwners = (() => {
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(resolve(CRM, dir), { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(`${dir}/${e.name}`, childRel); continue; }
        if (!/\.(js|html)$/.test(e.name)) continue;
        if (childRel === 'index-built.html') continue; // generated from the sources already counted
        const src = readFileSync(resolve(CRM, dir, e.name), 'utf8');
        if (/addEventListener\(\s*['"]hashchange['"]/.test(src) || /onhashchange\s*=/.test(src)) out.push(childRel);
      }
    };
    walk('.', '');
    return out.sort();
  })();

  it('each application has exactly one hashchange owner, and they never share a page', () => {
    // Three registrations exist across TWO applications. That is correct, and it is not two routers
    // over one address bar:
    //
    // js/core/crm-routing.js        THE authority inside Backend Agent Search (index.html).
    // js/init/init-hash-routing.js  Search's standalone fallback; it registers nothing when the
    //                               authority is present (proven behaviourally in
    //                               crm-single-routing-authority.test.ts).
    // js/dashboard/router.js        the BROKERAGE CRM's own router, loaded only by dashboard.html.
    //                               It is a permanent part of a permanent application. It used to
    //                               say 'it goes when the shell does' — the shell is the CRM and it
    //                               is not going anywhere.
    expect(hashOwners).toEqual([
      'js/core/crm-routing.js',
      'js/dashboard/router.js',
      'js/init/init-hash-routing.js',
    ]);
  });

  it('a new file cannot quietly become a second router', () => {
    const ALLOWED = new Set(['js/core/crm-routing.js', 'js/init/init-hash-routing.js', 'js/dashboard/router.js']);
    const strays = hashOwners.filter((f) => !ALLOWED.has(f));
    expect({
      strays,
      why: 'Hash routing has ONE owner: js/core/crm-routing.js. Register brokerage panels with CrmRouting.registerPanel() instead of adding a listener — two routers over one address bar is how Search, listing detail and back/forward break.',
    }).toEqual({ strays: [], why: expect.any(String) });
  });
});

describe('Backend Search launches the CRM without depending on it', () => {
  // Backend Search may LAUNCH the CRM — that is ordinary navigation across a product boundary.
  // What it must not do is address the CRM by its build artifact, which bypasses the governed
  // route and pins the coupling to a filename inside another application's build output.
  //
  // Assert STRUCTURALLY, on the destinations the browser actually navigates to. An earlier version
  // of this test grepped the raw file for /dashboard\.html/ and failed on a source COMMENT that
  // explained this very rule — the fifth time in this convergence that a text-scanning guard fired
  // on prose rather than on behaviour. A guard that cannot tell a link from a comment is worse than
  // no guard: it reads as coverage while proving nothing about what the page does.
  const linkTargets = (html: string) =>
    Array.from(html.matchAll(/(?:href|src|action)\s*=\s*"([^"]*)"/g)).map((m) => m[1]);

  it('no link, script or form in the Search chrome addresses the CRM by filename', () => {
    const offenders = linkTargets(read('public/crm/html/nav.html')).filter((t) => /dashboard\.html/.test(t));
    expect({
      offenders,
      why: '`dashboard.html` in a destination is a dependency on a file; `/crm` is a link to a product.',
    }).toEqual({ offenders: [], why: expect.any(String) });
  });

  it('the Search chrome does link to the CRM, by its governed route', () => {
    expect(linkTargets(read('public/crm/html/nav.html'))).toContain('/crm');
  });

  it('no Backend Search runtime module navigates to the CRM by filename', () => {
    // The launcher that regressed: js/crm/client-database.js used to send the operator to
    // '/crm/dashboard.html#/workspace/client/<id>/overview'. Scan executable lines only, so the
    // explanation of the rule cannot break the enforcement of it.
    const stripComments = (js: string) =>
      js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const modules = ['js/crm/client-database.js', 'js/manage/manage-listings.js', 'js/output/calculators.js'];
    const offenders = modules.filter((m) => /dashboard\.html/.test(stripComments(read(`public/crm/${m}`))));
    expect({ offenders }).toEqual({ offenders: [] });
  });
});

describe('there is exactly one Sale editor and one Rental editor', () => {
  const vercel = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] };
  const FORKS = ['SALE-FORM-WITH-TOOLS.html', 'RENTAL-FORM-WITH-TOOLS.html'];

  it('the forked forms are GONE from the tree, not merely unrouted', () => {
    // Routing around a duplicate leaves it for the next agent to find and revive. Deletion does not.
    const present = FORKS.filter((f) => existsSync(resolve(CRM, f)));
    expect({
      present,
      why: 'These are deleted stale forks. Do not restore them. Rebuild any wanted tool inside the canonical form, from verified requirements - the fork versions carry wrong NY tax math and an undisclosed commission assumption.',
    }).toEqual({ present: [], why: expect.any(String) });
  });

  it('no rewrite mentions a forked form, as a source or a destination', () => {
    const touching = vercel.rewrites
      .filter((r) => FORKS.some((f) => r.source.includes(f) || r.destination.includes(f)))
      .map((r) => `${r.source} -> ${r.destination}`);
    expect(touching).toEqual([]);
  });

  it('the viewer routes are gone too', () => {
    for (const dead of ['/crm/sale-view', '/crm/rental-view']) {
      expect(vercel.rewrites.find((r) => r.source === dead)).toBeUndefined();
    }
  });

  it('one route serves the sale editor, one serves the rental editor', () => {
    expect(vercel.rewrites.find((r) => r.source === '/crm/sale-listing')!.destination).toBe('/crm/SALE-FORM-REDESIGN.html');
    expect(vercel.rewrites.find((r) => r.source === '/crm/rental-listing')!.destination).toBe('/crm/RENTAL-FORM-REDESIGN.html');
  });

  it('sale and rental never collapse into one shared editor', () => {
    const sale = vercel.rewrites.find((r) => r.source === '/crm/sale-listing')!.destination;
    const rental = vercel.rewrites.find((r) => r.source === '/crm/rental-listing')!.destination;
    expect(sale).not.toBe(rental);
  });

  it('no shipped CRM source references a forked form', () => {
    const offenders: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(resolve(CRM, dir), { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(`${dir}/${e.name}`, childRel); continue; }
        if (!/\.(js|html)$/.test(e.name)) continue;
        const src = readFileSync(resolve(CRM, dir, e.name), 'utf8');
        if (FORKS.some((f) => src.includes(f)) || src.includes('/crm/sale-view') || src.includes('/crm/rental-view')) offenders.push(childRel);
      }
    };
    walk('.', '');
    expect(offenders).toEqual([]);
  });
});

describe('each application answers at its own address', () => {
  const vercel = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] };
  const dest = (source: string) => vercel.rewrites.find((r) => r.source === source)?.destination;

  it('/crm is the CRM', () => {
    expect(dest('/crm')).toBe('/crm/dashboard.html');
  });

  it('/crm/dashboard is a compatibility address for the SAME CRM', () => {
    expect(dest('/crm/dashboard')).toBe('/crm/dashboard.html');
    expect(dest('/crm/dashboard')).toBe(dest('/crm'));
  });

  it('/crm/search is Backend Agent Search', () => {
    expect(dest('/crm/search')).toBe('/crm/index-built.html');
  });

  it('the two applications never resolve to each other', () => {
    expect(dest('/crm')).not.toBe(dest('/crm/search'));
  });
});
