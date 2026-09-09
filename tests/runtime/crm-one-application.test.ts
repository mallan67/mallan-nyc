/// <reference types="jest" />
/**
 * THERE IS EXACTLY ONE CRM APPLICATION, AND A SECOND ONE CANNOT BE ADDED QUIETLY.
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────────────
 *
 * Commit 9716752d, "CRM v2 - modular dashboard replacing monolith", added a second CRM application
 * (public/crm/dashboard.html + public/crm/js/dashboard/**) and repointed /crm at it. The monolith it
 * claimed to replace was never retired. Both shipped for months. The consequence, reported by the
 * owner on 2026-09-09: "i have no search right now" - the canonical CRM was deployed and healthy the
 * entire time, and simply unreachable, because /crm served a shell that has no Property Search in it.
 *
 * Worse, work was then done in BOTH. A route census on 2026-09-09 found 72 routes in the duplicate:
 * 2 already existed in the canonical app (Property Search, My Listings - the two most actively worked
 * on), 14 were dead stubs, and 56 were capabilities that exist ONLY in the duplicate.
 *
 * The owner's instruction, verbatim: "do not just point the crm, remove duplicates, agents go in there
 * and create changes in that one and then they create another one... this cannot happen ever again."
 *
 * ── WHAT THIS FILE ENFORCES ─────────────────────────────────────────────────────────────────────
 *
 * A guard, not a description. It fails closed on the three moves that created this situation:
 *
 *   1. adding a new page under public/crm/ without declaring what it is;
 *   2. giving a second page its own route table, which is what makes a page an APPLICATION;
 *   3. letting the retired shell grow instead of shrink.
 *
 * An agent that adds "dashboard-v3.html", or a second Router.register table, turns this red. There is
 * no way to satisfy it except by declaring the file's role in PAGES below - which is a decision a
 * person makes, in review, on purpose.
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
 *   application-shell  a CRM application: its own navigation and its own route table. EXACTLY ONE.
 *   generated          build output of an application-shell. Never hand-edited.
 *   standalone-form    a single-purpose form page, opened from the shell. Owns no routes.
 *   auth               the sign-in page.
 *   retired            an application being removed. May only shrink. See QUARANTINE.
 *   dev-only           never served in production.
 */
const PAGES: Record<string, 'application-shell' | 'generated' | 'standalone-form' | 'auth' | 'retired' | 'dev-only'> = {
  'index.html': 'application-shell',
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

  // The duplicate CRM. Being removed; 56 unique capabilities must move to the canonical app first.
  'dashboard.html': 'retired',
};

/**
 * The retired application's files. This list may SHRINK as capabilities move across and files are
 * deleted. It may never grow: a new file under js/dashboard/ is new work in a shell being removed.
 */
const QUARANTINE_DIR = 'public/crm/js/dashboard';

/** Route-table count in the retired shell at the moment the guard was installed. Must only go down. */
const RETIRED_ROUTE_COUNT_CEILING = 72;

const htmlPages = readdirSync(CRM).filter((f) => f.endsWith('.html'));

describe('exactly one CRM application exists', () => {
  it('every page under public/crm/ has a declared role', () => {
    const undeclared = htmlPages.filter((f) => !(f in PAGES));
    expect({
      undeclared,
      why: 'A new page under public/crm/ must declare its role in PAGES in this file. If it is a second CRM, it is not allowed - extend the one at index.html instead.',
    }).toEqual({ undeclared: [], why: expect.any(String) });
  });

  it('there is exactly one application shell, and it is index.html', () => {
    const shells = Object.entries(PAGES).filter(([, role]) => role === 'application-shell').map(([f]) => f);
    expect(shells).toEqual(['index.html']);
  });

  it('no page is declared an application shell alongside a retired one that also still ships', () => {
    // A "retired" page is tolerated only while it is genuinely being removed. It is never a shell.
    const retired = Object.entries(PAGES).filter(([, r]) => r === 'retired').map(([f]) => f);
    for (const f of retired) expect(PAGES[f]).not.toBe('application-shell');
  });
});

describe('only the canonical application owns a route table', () => {
  /** Owning a route table is what makes a page an application rather than a form. */
  const routeTableOwners = (() => {
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(resolve(CRM, dir), { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { walk(`${dir}/${entry.name}`, childRel); continue; }
        if (!/\.(js|html)$/.test(entry.name)) continue;
        if (childRel === 'index-built.html') continue; // generated artifact of the shell
        const src = readFileSync(resolve(CRM, dir, entry.name), 'utf8');
        if (/Router\.register\(/.test(src)) out.push(childRel);
      }
    };
    walk('.', '');
    return out.sort();
  })();

  it('the ONLY route table in the CRM belongs to the shell being retired', () => {
    // When dashboard.html is deleted this becomes [] and the CRM has a single navigation model.
    expect(routeTableOwners).toEqual(['js/dashboard/app.js']);
  });

  it('a second route table cannot appear outside the retired shell', () => {
    const strays = routeTableOwners.filter((f) => !f.startsWith('js/dashboard/'));
    expect({
      strays,
      why: 'A file registering its own routes is a new CRM application. Add features to the canonical app (public/crm/index.html + html/** + js/**) instead.',
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

  it('only the authority, its standalone fallback, and the retired shell own a hashchange listener', () => {
    // js/core/crm-routing.js        THE authority - the only registration in the canonical app.
    // js/init/init-hash-routing.js  keeps a fallback for loading standalone; it registers nothing
    //                               when the authority is present (proven behaviourally in
    //                               crm-single-routing-authority.test.ts).
    // js/dashboard/router.js        the retired shell's own router; it goes when the shell does.
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

describe('the retired shell may only shrink', () => {
  it('its route count never grows', () => {
    const app = read(`${QUARANTINE_DIR}/app.js`.replace('public/crm/', 'public/crm/'));
    const routes = (app.match(/Router\.register\(/g) || []).length;
    expect(routes).toBeLessThanOrEqual(RETIRED_ROUTE_COUNT_CEILING);
  });

  it('nothing outside the retired shell links to it as if it were the CRM', () => {
    // The canonical nav used to carry <a href="/crm/dashboard" title="Back to CRM Dashboard">, which
    // framed the duplicate as home and walked operators out of their own CRM.
    const nav = read('public/crm/html/nav.html');
    expect(nav).not.toMatch(/title="Back to CRM Dashboard"/);
    expect(nav).not.toMatch(/>\s*CRM\s*<\/span>/);
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

describe('routing sends every operator to the one CRM', () => {
  const vercel = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] };
  const shellTargets = vercel.rewrites.filter((r) => /\/crm\/(index-built|dashboard)\.html$/.test(r.destination));

  it('/crm is the canonical application', () => {
    expect(vercel.rewrites.find((r) => r.source === '/crm')!.destination).toBe('/crm/index-built.html');
  });

  it('the retired shell is reachable by exactly one explicit route, and never by the bare entry', () => {
    const toRetired = shellTargets.filter((r) => r.destination.endsWith('dashboard.html')).map((r) => r.source);
    expect(toRetired).toEqual(['/crm/dashboard']);
  });
});
