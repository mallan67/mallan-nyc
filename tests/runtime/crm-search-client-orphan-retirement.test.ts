/// <reference types="jest" />
/**
 * ORPHAN CLIENT RETIREMENT PACKET A — the Search-side Client subsystem is physically gone.
 *
 * WHY PHYSICAL DELETION, not deprecation. Backend Search carried a second Client authority: its own client
 * directory, CRUD, grid/filter/sort, a browser-only portfolio store and a browser-only feedback store. None
 * of it was reachable — every entry point pointed at DOM that the active build does not contain — but
 * "unused" is not a boundary. An unreachable duplicate is a thing a future agent rediscovers and wires up,
 * and it was already close to happening: the migration target for Search's like/dislike behaviour was
 * proposed as exactly these functions. The subsystem therefore ceases to exist rather than becoming dead
 * weight.
 *
 * THE CANONICAL DIRECTION, unchanged by this packet:
 *   CRM Client authority -> server access scope -> pagination -> ClientNormalizer -> Search picker
 * Search consumes the canonical population. It does not maintain a Client system.
 *
 * WHAT THIS PACKET DELIBERATELY DID NOT DO
 *   - It did not invent a Search -> CRM Client Workspace bridge. openClientWorkspace()'s only caller was
 *     inside the dead grid, so the capability had no live control to hang from. The REQUIREMENT is recorded
 *     in group F below rather than implemented: if a live Search control ever needs it, the bridge is small
 *     and belongs to that control — it was never a reason to keep a 270-line dead module alive.
 *   - It did not replace localStorage with another persistence mechanism. The browser-only
 *     clientPortfolio_* store is removed, not migrated; durable Client x Listing history is a registered
 *     capability packet (REG-1) blocked on actor provenance.
 *   - It did not touch REG-8 (the output/compliance-test toString() defect), emailListingSheet or
 *     printListingSheet. Group C proves emailListingSheet survived intact.
 *
 * FALSE-POSITIVE DISCIPLINE. Several retired identifiers appear in the codebase as *strings* — CSS
 * selectors, getElementById arguments, historical prose. A census that greps raw text reports a subsystem
 * as alive when only its epitaph remains, and reports it dead when a stale CSS rule still ships. The
 * assertions below therefore scope explicitly: executable JS, active HTML fragments, shipped CSS and the
 * built artifact are checked separately, and documentation is excluded by path, not by hope.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const CRM = resolve(ROOT, 'public/crm');

/** Every .js under public/crm/js EXCEPT js/dashboard/** — that is the separate CRM application. */
function searchJsFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'dashboard') continue;
        walk(p);
      } else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(join(CRM, 'js'));
  return out;
}

/** Active HTML fragments: only those index.html actually @includes. */
function activeHtmlFragments(): string[] {
  const idx = read('public/crm/index.html');
  return Array.from(idx.matchAll(/@include\s+(html\/[^\s-]+\.html)/g)).map((m) => m[1]);
}

// The identifiers that must not survive anywhere in the shipped Search application.
const RETIRED = [
  'client-database',
  'getMyClients',
  'renderClientGrid',
  'populateClientSelect',
  'filterClientList',
  'sortClientColumn',
  'openWorkWithSelected',
  'saveSelectedToClient',
  'clientPortfolio_',
  'section-client',
  'clientDirectorySearch',
  'clientDeliveryModal',
  'workWithCustomerDropdown',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// A — the negative symbol census, across all four shipping surfaces
// ─────────────────────────────────────────────────────────────────────────────
describe('A · no retired Client symbol survives in the shipped Search application', () => {
  const jsFiles = searchJsFiles();

  it.each(RETIRED)('%s appears in no executable Search JS module', (symbol) => {
    const offenders = jsFiles
      .filter((f) => readFileSync(f, 'utf8').includes(symbol))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect({ symbol, offenders }).toEqual({ symbol, offenders: [] });
  });

  it.each(RETIRED)('%s appears in no ACTIVE HTML fragment', (symbol) => {
    const offenders = activeHtmlFragments().filter((rel) =>
      existsSync(resolve(CRM, rel)) && read(`public/crm/${rel}`).includes(symbol)
    );
    expect({ symbol, offenders }).toEqual({ symbol, offenders: [] });
  });

  it.each(RETIRED)('%s appears in no shipped stylesheet', (symbol) => {
    const cssDir = join(CRM, 'css');
    const offenders = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .filter((f) => readFileSync(join(cssDir, f), 'utf8').includes(symbol));
    expect({ symbol, offenders }).toEqual({ symbol, offenders: [] });
  });

  // The one that actually ships. Source can be clean while the generated artifact still carries the
  // subsystem, because index-built.html is only regenerated by crm:build.
  it.each(RETIRED)('%s is absent from the built artifact', (symbol) => {
    expect({ symbol, count: (read('public/crm/index-built.html').match(new RegExp(symbol.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&'), 'g')) || []).length })
      .toEqual({ symbol, count: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the deleted files are gone, and the loader no longer asks for them
// ─────────────────────────────────────────────────────────────────────────────
describe('B · the orphan files no longer exist', () => {
  const DELETED = [
    'public/crm/js/crm/client-database.js',
    'public/crm/html/my-clients.html',
    'public/crm/html/modals/client-delivery.html',
    'public/crm/html/modals/client-feedback.html',
    'public/crm/html/modals/client-report-view.html',
    'public/crm/html/modals/invite-client.html',
    'public/crm/html/modals/schedule-showing.html',
    'public/crm/html/modals/portfolio-comment.html',
  ];

  it.each(DELETED)('%s is deleted', (rel) => {
    expect({ rel, exists: existsSync(resolve(ROOT, rel)) }).toEqual({ rel, exists: false });
  });

  it('index.html loads no script that no longer exists', () => {
    const idx = read('public/crm/index.html');
    const local = Array.from(idx.matchAll(/<script src="((?!https?:)[^"]+)"/g)).map((m) => m[1]);
    const missing = local.filter((src) => !existsSync(resolve(CRM, src)));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('index.html @includes no fragment that no longer exists', () => {
    const missing = activeHtmlFragments().filter((rel) => !existsSync(resolve(CRM, rel)));
    expect({ missing }).toEqual({ missing: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — everything that legitimately consumes the canonical population still does
// ─────────────────────────────────────────────────────────────────────────────
describe('C · the canonical client population still reaches every live Search picker', () => {
  it.each([
    ['report/email recipient + shared state', 'public/crm/js/core/data-loader.js'],
    ['showing client picker', 'public/crm/js/search/pagination.js'],
    ['portal-send client picker', 'public/crm/js/search/pagination.js'],
    ['Saved Search client picker', 'public/crm/js/search/saved-searches.js'],
  ])('%s still calls MallanAPI.clients.listAll()', (_label, file) => {
    expect(read(file)).toContain('MallanAPI.clients.listAll()');
  });

  it('all four canonical picker call sites survive the deletion', () => {
    const total =
      (read('public/crm/js/core/data-loader.js').match(/clients\.listAll\(\)/g) || []).length +
      (read('public/crm/js/search/pagination.js').match(/clients\.listAll\(\)/g) || []).length +
      (read('public/crm/js/search/saved-searches.js').match(/clients\.listAll\(\)/g) || []).length;
    expect(total).toBe(4);
  });

  it('customerDB still exists and is still populated from the canonical loader', () => {
    // It survives because data-loader.js declares AND fills it; client-database.js merely re-declared it.
    const dl = read('public/crm/js/core/data-loader.js');
    expect(dl).toContain('var customerDB = {}');
    expect(dl).toContain('customerDB[id] = cl;');
  });

  it('Search still never loads its client population from the leads route', () => {
    const offenders = searchJsFiles()
      .filter((f) => /['"`]\/api\/crm\/leads/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('ClientNormalizer remains the single presentation normalizer', () => {
    expect(existsSync(resolve(ROOT, 'public/crm/js/core/client-normalizer.js'))).toBe(true);
    expect(read('public/crm/js/core/data-loader.js')).toContain('ClientNormalizer.normalize');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — out-of-scope neighbours are untouched
// ─────────────────────────────────────────────────────────────────────────────
describe('D · emailListingSheet and the canonical reports path are untouched', () => {
  it('emailListingSheet still exists and still delegates to the reports modal', () => {
    const src = read('public/crm/js/compliance/compliance-gates-and-output.js');
    expect(src).toContain('function emailListingSheet()');
    expect(src).toContain("openReportsModal(ids, 'email')");
  });

  it('the schedule-showing modal is still built at runtime by the live module', () => {
    // The deleted schedule-showing.html was a stale duplicate: pagination.js creates this modal itself and
    // removes any pre-existing element with the same id before inserting its own.
    const src = read('public/crm/js/search/pagination.js');
    expect(src).toContain("var modalId = 'scheduleShowingModal'");
    expect(src).toContain('document.createElement');
  });

  it('the CRM application remains separate and reachable', () => {
    expect(existsSync(resolve(CRM, 'dashboard.html'))).toBe(true);
    expect(existsSync(resolve(CRM, 'js/dashboard'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — Step 5: the dead wrapper is gone, the route and the rest of the API are not
// ─────────────────────────────────────────────────────────────────────────────
describe('E · MallanAPI.clients.recordAction is retired; the route and sibling methods are not', () => {
  it('the dead wrapper no longer exists in source or artifact', () => {
    expect(read('public/crm/js/core/api-client.js')).not.toContain('recordAction');
    expect(read('public/crm/index-built.html')).not.toContain('recordAction');
  });

  it('the canonical route it wrapped is untouched', () => {
    const route = read('app/api/crm/clients/[id]/actions/route.ts');
    expect(route).toContain('VALID_ACTIONS');
    expect(route).toContain('evaluateClientDistributionEligibility');
  });

  it.each(['list:', 'listAll:', 'invite:'])('clients.%s survives — this was wrapper retirement only', (method) => {
    expect(read('public/crm/js/core/api-client.js')).toContain(method);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F — no Search-owned Client system may be reintroduced
// ─────────────────────────────────────────────────────────────────────────────
describe('F · Search owns no Client system, and the bridge requirement is recorded not implemented', () => {
  it('no Search module performs Client CRUD against the client routes', () => {
    // Search may READ the canonical population. It may not create, update or delete Clients.
    const offenders = searchJsFiles()
      .filter((f) => {
        const s = readFileSync(f, 'utf8');
        return /clients\.(create|update|delete)\s*\(/.test(s);
      })
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('no Search module persists a browser-only Client store', () => {
    const offenders = searchJsFiles()
      .filter((f) => /localStorage\.setItem\(\s*['"`]?client/i.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('REQUIREMENT, not yet built: a Search -> CRM Client Workspace bridge must belong to a live control', () => {
    // openClientWorkspace() was deleted with its dead grid rather than preserved "because the capability is
    // useful". If Search ever needs it, the bridge is ~3 lines and belongs to whichever live control
    // invokes it — routed by address ('/crm#/workspace/client/:id/overview'), never by build filename,
    // which is the regression crm-one-application.test.ts guards.
    // Executable lines only. Several modules legitimately EXPLAIN in prose that the CRM (dashboard.html)
    // is a separate application; banning the raw string would flag the documentation of the rule as a
    // violation of it — the same "guard on a string, not on a decision" error this lane has hit before.
    const stripComments = (js: string) =>
      js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const offenders = searchJsFiles()
      .filter((f) => /dashboard\.html/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect({ offenders }).toEqual({ offenders: [] });
  });
});
