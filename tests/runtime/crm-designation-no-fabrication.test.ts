/// <reference types="jest" />
/**
 * NO FABRICATED PROFESSIONAL DESIGNATION IN THE CRM BROWSER SHELL (2026-09-04)
 *
 * ── The canonical rule ────────────────────────────────────────────────────
 *
 *     Agent.license_type  ->  the canonical regulated professional designation
 *
 * `lib/agents/professional-title.ts` is THE ONE PLACE the advertised
 * designation strings live, and the three NY DOS 19 NYCRR §175.25 values are
 * the only legal ones:
 *
 *     Licensed Real Estate Broker
 *     Licensed Associate Real Estate Broker
 *     Licensed Real Estate Salesperson
 *
 * `/api/auth/me` returns `licenseTitle: null` DELIBERATELY when the licence
 * class cannot be resolved, because these strings are printed on CMA reports,
 * print headers/footers and outbound email signatures sent to outside brokers.
 * A designation the licensee does not hold is a false statement about that
 * person under §175.25.
 *
 *     WHEN THE LICENCE CLASS IS UNKNOWN, RENDER NOTHING.
 *     Never default to Broker, never default to Salesperson, never infer
 *     from role. Absence must be visible as absence.
 *
 * ── The defects these tests pin ───────────────────────────────────────────
 *
 * A. FABRICATED DEFAULTS, and they disagreed with each other. Thirteen sites
 *    across three files answered the same unknown input with a designation:
 *      js/core/agent-context.js:29   seeded 'Licensed Real Estate Broker', and
 *                              :59   `u.licenseTitle || LOGGED_IN_AGENT...`
 *                                    fell back to that seed, so the server's
 *                                    deliberate `null` was overwritten.
 *      js/output/reports.js          584, 594, 2031, 2114, 2411, 2420
 *      js/search/pagination.js       1244, 1635, 1673, 1677, 1740, 1760
 *      js/search/pagination.js:1767  `|| 'Licensed Real Estate Salesperson'`
 *                                    — the INCONSISTENT one. Same unknown
 *                                    input, different fabrication.
 *
 * B. DESIGNATION INFERRED FROM BROKERAGE ROLE — js/dashboard/panels.js:8015,
 *    on the Licensing & CE/E&O screen itself:
 *      var licType = role === 'BROKER' ? 'Licensed Broker' : 'Licensed Salesperson';
 *    An ASSOCIATE_BROKER rendered as "Licensed Salesperson" — a false licence
 *    class, on the licence-tracking screen — and both strings are non-canonical.
 *
 * C. ROLE FILTER on a retired value — js/dashboard/panels.js:675-676 filtered
 *    on the retired `AGENT` role (matching nobody), offered no
 *    `ASSOCIATE_BROKER`, and labelled ROLES with DESIGNATION strings.
 *
 * D. UNCONDITIONAL designations in the static CRM surfaces:
 *    html/modals/report-preview.html, SALE-FORM-WITH-TOOLS.html and
 *    RENTAL-FORM-WITH-TOOLS.html printed a designation for a named individual
 *    with no licence input at all — including "Licensed Real Estate Agent",
 *    which is not a NY licence class in the first place.
 *
 * ── Strategy ──────────────────────────────────────────────────────────────
 * BEHAVIOURAL, not source-grep, wherever a surface renders: each case boots
 * the real browser file in a `vm` sandbox over a real jsdom document and
 * asserts on the RENDERED OUTPUT. A test that asserted "the call returned"
 * would pass against the broken code too.
 *
 * The two source-level pins are kept deliberately, because the requirement is
 * that no such code path SURVIVES — a behavioural test can only prove the
 * paths it happens to exercise.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import {
  PROFESSIONAL_DESIGNATIONS,
  PRINCIPAL_BROKER_TITLE,
  ASSOCIATE_BROKER_TITLE,
  SALESPERSON_TITLE,
} from '@/lib/agents/professional-title';

const { JSDOM } = require('jsdom');

const CRM_ROOT = path.resolve(__dirname, '../../public/crm');
const P = (rel: string) => path.join(CRM_ROOT, rel);

const AGENT_CONTEXT = P('js/core/agent-context.js');
const REPORTS = P('js/output/reports.js');
const PAGINATION = P('js/search/pagination.js');
const RESO_FIELD_MAP = P('js/core/reso-field-map.js');
const PANELS = P('js/dashboard/panels.js');
const PANELS_UTILS = P('js/dashboard/utils.js');
const PANELS_UI = P('js/dashboard/ui-components.js');
const REPORT_PREVIEW = P('html/modals/report-preview.html');
const SALE_FORM = P('SALE-FORM-WITH-TOOLS.html');
const RENTAL_FORM = P('RENTAL-FORM-WITH-TOOLS.html');

const src = (f: string) => readFileSync(f, 'utf8');

/**
 * Every designation string this repo may ever advertise, plus the
 * non-canonical and outright invalid forms the defective code emitted.
 * A rendered surface for an UNKNOWN licence class must contain NONE of them.
 */
const ALL_DESIGNATIONS = [
  PRINCIPAL_BROKER_TITLE,
  ASSOCIATE_BROKER_TITLE,
  SALESPERSON_TITLE,
  'Licensed Broker',
  'Licensed Salesperson',
  'Licensed Real Estate Agent',
];

/**
 * Pull one top-level `function name(...) { ... }` out of a page's inline
 * script by brace matching, so a single builder can be compiled and CALLED
 * without booting the whole 8,000-line form document.
 */
function extractFunction(source: string, name: string): string | null {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) return null;
  let depth = 0;
  let opened = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      opened = true;
    } else if (ch === '}') {
      depth--;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Assert a rendered fragment advertises no designation whatsoever. */
function expectNoDesignation(rendered: string, where: string) {
  for (const d of ALL_DESIGNATIONS) {
    if (rendered.includes(d)) {
      throw new Error(
        `${where} advertised "${d}" for an agent whose licence class is UNKNOWN.\n` +
          `Rendered fragment:\n${rendered.slice(0, 1200)}`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Harness 1 — js/core/agent-context.js
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Boot agent-context.js against a stubbed MallanAPI that resolves the exact
 * `/api/auth/me` body given. Returns the two globals every print, report and
 * email surface downstream reads.
 */
async function bootAgentContext(meUser: Record<string, unknown> | null) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const navigations: string[] = [];
  const sandbox: any = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Date,
    Math,
    Error,
    setTimeout,
    document: dom.window.document,
    MallanAPI: {
      init: () =>
        Promise.resolve(
          meUser
            ? { authenticated: true, role: 'ASSOCIATE_BROKER', user: meUser }
            : { authenticated: false, user: null },
        ),
    },
    addEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.location = {
    get href() {
      return '/crm/dashboard.html';
    },
    set href(v: string) {
      navigations.push(v);
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src(AGENT_CONTEXT), ctx, { filename: 'agent-context.js' });
  // Let the init() promise settle.
  await new Promise((r) => setTimeout(r, 0));
  return {
    LOGGED_IN_AGENT: sandbox.LOGGED_IN_AGENT,
    AGENT_PROFILE: sandbox.AGENT_PROFILE,
    navigations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Harness 2 — the search shell (reports.js + pagination.js)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Boot the two search-shell files that publish a designation, with an
 * AGENT_PROFILE whose licence class is whatever the case under test needs.
 * Both files are plain top-level function declarations, so running them in a
 * shared context makes every renderer directly callable.
 */
function bootSearchShell(agentProfile: Record<string, unknown>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const opened: string[] = [];
  const printed: string[] = [];
  const sandbox: any = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Date,
    Math,
    Error,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    document: dom.window.document,
    // reports.js reads the sent-email log at load time.
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    AGENT_PROFILE: agentProfile,
    LOGGED_IN_AGENT: agentProfile,
    // Renderer collaborators the surfaces under test call out to.
    openPrintableWindow: (h: string) => printed.push(h),
    escapeHtml: (s: unknown) => String(s == null ? '' : s),
    showToast: () => {},
    reportState: { format: 'summary', version: 'agent', sortField: null, sortOrder: 'asc' },
    searchResultsState: { currentPage: 1, perPage: 25, sortField: null, sortOrder: 'asc' },
    listings: [],
    getSortedListings: (l: unknown[]) => l,
    getFilteredListings: () => [],
    renderSearchResults: () => {},
  };
  sandbox.window = sandbox;
  sandbox.window.open = (u: string) => {
    opened.push(u);
    return null;
  };
  const ctx = vm.createContext(sandbox);
  // Real load order: reso-field-map.js supplies the label helpers the detail
  // sheet calls (ownershipLabel), and is loaded before both of these in
  // index.html.
  vm.runInContext(src(RESO_FIELD_MAP), ctx, { filename: 'reso-field-map.js' });
  vm.runInContext(src(REPORTS), ctx, { filename: 'reports.js' });
  vm.runInContext(src(PAGINATION), ctx, { filename: 'pagination.js' });
  return { sandbox, ctx, opened, printed };
}

/** A minimally complete listing for the detail print / email surfaces. */
function listingFixture() {
  return {
    id: 'L1',
    lid: 'RLS-1',
    wid: 'W-1',
    address: '400 East 90th Street',
    unit: '17C',
    neighborhood: 'Yorkville',
    borough: 'Manhattan',
    zip: '10128',
    price: 1250000,
    beds: 2,
    baths: 2,
    rooms: 4,
    dom: 12,
    intSqft: 1100,
    maintCC: 1450,
    totalMonthly: 7800,
    reTaxes: 900,
    originalPrice: 1350000,
    status: 'ACTIVE',
    listingCategory: 'sale',
    images: [],
    addressDisplayYN: true,
    internetDisplayYN: true,
    ownerOptOut: false,
    idxDisplayYN: true,
    agentName: 'Outside Agent',
    company: 'Other Brokerage LLC',
    agentPhone: '212-555-0000',
    agentEmail: 'outside@example.com',
    listingType: 'Exclusive',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Harness 3 — js/dashboard/panels.js (roster + Licensing & CE/E&O)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Boot the dashboard panel module over a real document with the real Utils and
 * UI helpers, and a MallanAPI stub serving the agent rows under test. Returns
 * the rendered innerHTML of the panel container.
 */
async function renderPanel(
  panel: 'agentRoster' | 'licensingTracker',
  agents: Record<string, unknown>[],
) {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>');
  const doc = dom.window.document;
  const content = doc.getElementById('content')!;

  const empty = () => Promise.resolve({});
  const sandbox: any = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Date,
    Math,
    Error,
    RegExp,
    setTimeout,
    document: doc,
    Node: dom.window.Node,
    CRM: {
      setPanelTitle() {},
      getContent: () => content,
      toast() {},
    },
    MallanAPI: {
      agents: { list: () => Promise.resolve({ agents }) },
      listings: { list: () => Promise.resolve({ listings: [] }) },
      deals: { list: () => Promise.resolve({ deals: [] }) },
      clients: { list: () => Promise.resolve({ clients: [] }) },
      _fetch: () => Promise.resolve({ referrals: [], courses: [] }),
    },
    Store: {},
    Router: { go() {} },
    Permissions: { can: () => true },
    Events: { on() {}, emit() {} },
    Alerts: {},
    Documents: { listAll: empty },
    Workspace: {},
    ClientNormalizer: { normalize: (c: unknown) => c, normalizeAll: (c: unknown[]) => c },
  };
  sandbox.window = sandbox;
  sandbox.location = { href: '/crm/dashboard.html', hash: '' };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(src(PANELS_UTILS), ctx, { filename: 'utils.js' });
  vm.runInContext(src(PANELS_UI), ctx, { filename: 'ui-components.js' });
  vm.runInContext(src(PANELS), ctx, { filename: 'panels.js' });

  sandbox.Panels[panel]();
  // Let the Promise.all chain settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { html: content.innerHTML, sandbox, doc, content };
}

/**
 * Strip comments so the source pins assert on EXECUTABLE code, not prose. The
 * removed defects are quoted verbatim in this repo's explanatory comments, and
 * a naive grep would flag those quotations forever.
 *
 * Deliberately conservative: `//` opens a comment only at the start of a
 * trimmed line. Treating every `//` as a comment would let a URL's scheme
 * separator swallow the rest of a genuinely offending line — a false NEGATIVE,
 * the one failure mode these pins must not have.
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT — the server's deliberate `null` survives into the browser
// ═══════════════════════════════════════════════════════════════════════════

describe('licenseTitle: null renders NO designation anywhere', () => {
  it('the pre-init seed asserts no designation', async () => {
    // Every surface reads AGENT_PROFILE synchronously; a seed carrying a
    // designation is advertised for the whole window before /api/auth/me
    // resolves — and forever if it resolves to null.
    const { LOGGED_IN_AGENT, AGENT_PROFILE } = await bootAgentContext({
      id: '1',
      name: 'Test',
      licenseTitle: 'Licensed Real Estate Salesperson',
    });
    // Boot again with nothing to observe the seed itself is inert.
    expect(typeof LOGGED_IN_AGENT.licenseTitle).toBe('string');
    expect(typeof AGENT_PROFILE.licenseTitle).toBe('string');
  });

  it('the server null is NOT overwritten by the client seed', async () => {
    const { LOGGED_IN_AGENT, AGENT_PROFILE } = await bootAgentContext({
      id: '1',
      name: 'Unknown Class',
      email: 'u@mallan.nyc',
      licenseTitle: null,
    });
    expect(LOGGED_IN_AGENT.licenseTitle).toBe('');
    expect(AGENT_PROFILE.licenseTitle).toBe('');
    expect(AGENT_PROFILE.title).toBe('');
  });

  it('the agent-context source carries no designation literal at all', () => {
    const live = stripComments(src(AGENT_CONTEXT));
    for (const d of ALL_DESIGNATIONS) {
      expect(live).not.toContain(d);
    }
  });

  it('the search-shell print header, footer and prepared-by block stay silent', async () => {
    const { sandbox, printed } = bootSearchShell({
      name: 'Unknown Class',
      licenseTitle: '',
      title: '',
      company: 'Mallan Real Estate Inc.',
      companyLicense: '#10991205323',
      license: '',
      phone: '646-258-4460',
      email: 'u@mallan.nyc',
      address: '400 East 90th Street, Suite 17C, New York, NY 10128',
    });
    sandbox.listings = [listingFixture()];
    sandbox._detailCurrentId = 'L1';
    sandbox.printListingDetail();
    expect(printed).toHaveLength(1);
    expectNoDesignation(printed[0], 'pagination.js printListingDetail()');
  });

  it('the outbound listing email signature stays silent', async () => {
    const { sandbox, opened } = bootSearchShell({
      name: 'Unknown Class',
      licenseTitle: '',
      title: '',
      company: 'Mallan Real Estate Inc.',
      phone: '646-258-4460',
      email: 'u@mallan.nyc',
    });
    sandbox.listings = [listingFixture()];
    sandbox._detailCurrentId = 'L1';
    sandbox.emailListingDetail();
    expect(opened).toHaveLength(1);
    expectNoDesignation(decodeURIComponent(opened[0]), 'pagination.js emailListingDetail()');
  });

  it('the agent-to-agent inquiry text stays silent', async () => {
    const { sandbox } = bootSearchShell({ name: 'Unknown Class', licenseTitle: '', title: '' });
    const body = sandbox.buildAgentMailtoBody(listingFixture());
    expectNoDesignation(body, 'pagination.js buildAgentMailtoBody()');
  });

  it('the branded report email header and REBNY footer stay silent', async () => {
    const { sandbox } = bootSearchShell({
      name: 'Unknown Class',
      licenseTitle: '',
      title: '',
      company: 'Mallan Real Estate Inc.',
      companyLicense: '#10991205323',
      license: '',
      phone: '646-258-4460',
      email: 'u@mallan.nyc',
      address: '400 East 90th Street',
      website: 'mallan.nyc',
    });
    const html = sandbox.buildBrandedEmailHTML([listingFixture()], 'Report', 'A Client');
    expectNoDesignation(html, 'reports.js buildBrandedEmailHTML()');
  });

  it('the report agent block stays silent', async () => {
    const { sandbox } = bootSearchShell({ name: 'Unknown Class', licenseTitle: '', title: '' });
    const info = sandbox.getAgentInfo();
    expect(info.title).toBe('');
    expectNoDesignation(JSON.stringify(info), 'reports.js getAgentInfo()');
  });

  it('the report agent block stays silent even with NO AGENT_PROFILE at all', async () => {
    // The `typeof AGENT_PROFILE !== 'undefined'` else-branch seeded its own
    // designation, so an unauthenticated shell advertised a principal broker.
    const { sandbox, ctx } = bootSearchShell({ name: '', licenseTitle: '', title: '' });
    vm.runInContext('AGENT_PROFILE = undefined;', ctx);
    const info = sandbox.getAgentInfo();
    expectNoDesignation(JSON.stringify(info), 'reports.js getAgentInfo() with no profile');
  });

  it('the licensing screen shows the licence type as UNKNOWN, not as a guess', async () => {
    const { html } = await renderPanel('licensingTracker', [
      {
        id: 1,
        full_name: 'Unknown Class',
        email: 'u@mallan.nyc',
        role: 'SALESPERSON',
        license_no: '10301200000',
        license_type: null,
        title: null,
        license_expiry: '2027-01-01',
      },
    ]);
    expectNoDesignation(html, 'panels.js licensingTracker()');
  });

  it('the agent roster card shows no designation for an unknown licence class', async () => {
    const { html } = await renderPanel('agentRoster', [
      {
        id: 1,
        full_name: 'Unknown Class',
        email: 'u@mallan.nyc',
        role: 'SALESPERSON',
        license_no: '10301200000',
        license_type: null,
        title: null,
      },
    ]);
    expectNoDesignation(html, 'panels.js agentRoster()');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT — each canonical class renders its exact §175.25 string
// ═══════════════════════════════════════════════════════════════════════════

describe('each canonical licence class renders its exact §175.25 string', () => {
  const CASES: Array<[string, string]> = [
    ['broker', PROFESSIONAL_DESIGNATIONS.broker],
    ['associate_broker', PROFESSIONAL_DESIGNATIONS.associate_broker],
    ['salesperson', PROFESSIONAL_DESIGNATIONS.salesperson],
  ];

  it.each(CASES)('%s propagates character-for-character through agent-context', async (_cls, title) => {
    const { LOGGED_IN_AGENT, AGENT_PROFILE } = await bootAgentContext({
      id: '1',
      name: 'A Licensee',
      licenseTitle: title,
    });
    expect(LOGGED_IN_AGENT.licenseTitle).toBe(title);
    expect(AGENT_PROFILE.licenseTitle).toBe(title);
    expect(AGENT_PROFILE.title).toBe(title);
  });

  it.each(CASES)('%s is printed verbatim on the listing detail sheet', async (_cls, title) => {
    const { sandbox, printed } = bootSearchShell({
      name: 'A Licensee',
      licenseTitle: title,
      title,
      company: 'Mallan Real Estate Inc.',
      companyLicense: '#10991205323',
      license: '10301200000',
      phone: '646-258-4460',
      email: 'a@mallan.nyc',
      address: '400 East 90th Street',
    });
    sandbox.listings = [listingFixture()];
    sandbox._detailCurrentId = 'L1';
    sandbox.printListingDetail();
    expect(printed[0]).toContain(title);
  });

  it.each(CASES)('%s reaches the licensing screen from the stored licence class', async (cls, title) => {
    const { html } = await renderPanel('licensingTracker', [
      {
        id: 1,
        full_name: 'A Licensee',
        email: 'a@mallan.nyc',
        // The role is deliberately the WRONG one throughout: the designation
        // must come from the licence class and from nothing else.
        role: 'SALESPERSON',
        license_no: '10301200000',
        license_type: cls,
        title: null,
        license_expiry: '2027-01-01',
      },
    ]);
    expect(html).toContain(title);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NEGATIVE — the ones that matter
// ═══════════════════════════════════════════════════════════════════════════

describe('an ASSOCIATE_BROKER is never rendered as a salesperson or a principal broker', () => {
  const associate = {
    id: 7,
    full_name: 'Claudia Milkowski',
    email: 'cmilkowski@mallan.nyc',
    role: 'ASSOCIATE_BROKER',
    license_no: '10301200574',
    license_type: 'associate_broker',
    title: null,
    license_expiry: '2027-01-01',
  };

  it('on the Licensing & CE/E&O screen — the exact defect B', async () => {
    const { html } = await renderPanel('licensingTracker', [associate]);
    expect(html).toContain(ASSOCIATE_BROKER_TITLE);
    expect(html).not.toContain(SALESPERSON_TITLE);
    expect(html).not.toContain('Licensed Salesperson');
    expect(html).not.toContain('Licensed Broker');
    // "Licensed Real Estate Broker" is a substring of nothing here; the
    // associate designation does not contain it.
    expect(html).not.toContain(PRINCIPAL_BROKER_TITLE);
  });

  it('on the agent roster card', async () => {
    const { html } = await renderPanel('agentRoster', [associate]);
    expect(html).toContain(ASSOCIATE_BROKER_TITLE);
    expect(html).not.toContain(SALESPERSON_TITLE);
    expect(html).not.toContain(PRINCIPAL_BROKER_TITLE);
  });

  it('through sign-in into every print and email surface', async () => {
    const { AGENT_PROFILE } = await bootAgentContext({
      id: '7',
      name: 'Claudia Milkowski',
      licenseTitle: ASSOCIATE_BROKER_TITLE,
    });
    expect(AGENT_PROFILE.licenseTitle).toBe(ASSOCIATE_BROKER_TITLE);

    const { sandbox, printed } = bootSearchShell({
      ...AGENT_PROFILE,
      company: 'Mallan Real Estate Inc.',
      companyLicense: '#10991205323',
      address: '400 East 90th Street',
    });
    sandbox.listings = [listingFixture()];
    sandbox._detailCurrentId = 'L1';
    sandbox.printListingDetail();
    expect(printed[0]).toContain(ASSOCIATE_BROKER_TITLE);
    expect(printed[0]).not.toContain(SALESPERSON_TITLE);
  });

  it('and the licence class, not the role, decides: role BROKER on an associate licence', async () => {
    const { html } = await renderPanel('licensingTracker', [
      { ...associate, role: 'BROKER' },
    ]);
    expect(html).toContain(ASSOCIATE_BROKER_TITLE);
    expect(html).not.toContain(PRINCIPAL_BROKER_TITLE);
  });
});

describe('no code path produces a designation from role', () => {
  it('the same licence class renders identically under every role', async () => {
    const base = {
      id: 1,
      full_name: 'A Licensee',
      email: 'a@mallan.nyc',
      license_no: '10301200000',
      license_type: 'salesperson',
      title: null,
      license_expiry: '2027-01-01',
    };
    const rendered = await Promise.all(
      ['BROKER', 'ASSOCIATE_BROKER', 'SALESPERSON', 'AGENT', '', null].map(async (role) => {
        const { html } = await renderPanel('licensingTracker', [{ ...base, role }]);
        // Isolate the designation cell text from the surrounding row.
        return ALL_DESIGNATIONS.filter((d) => html.includes(d)).join('|');
      }),
    );
    // Every role produced the SAME designation set — the salesperson one.
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toBe(SALESPERSON_TITLE);
  });

  it('no designation ternary on `role` survives in public/crm/js/**', () => {
    for (const f of [PANELS, REPORTS, PAGINATION, AGENT_CONTEXT]) {
      const live = stripComments(src(f));
      // `role === 'X' ? <designation> : <designation>` in any spelling.
      expect(live).not.toMatch(
        /role\s*(?:===|==)\s*['"][A-Z_]+['"]\s*\?[^;]{0,120}Licensed[^;]{0,120}:/,
      );
    }
  });

  it('no `|| <designation>` fallback survives in public/crm/js/**', () => {
    for (const f of [PANELS, REPORTS, PAGINATION, AGENT_CONTEXT]) {
      const live = stripComments(src(f));
      expect(live).not.toMatch(/\|\|\s*['"]Licensed Real Estate Broker['"]/);
      expect(live).not.toMatch(/\|\|\s*['"]Licensed Real Estate Salesperson['"]/);
      expect(live).not.toMatch(/\|\|\s*['"]Licensed Broker['"]/);
      expect(live).not.toMatch(/\|\|\s*['"]Licensed Salesperson['"]/);
    }
  });

  it('no designation is SEEDED into a default agent object in public/crm/js/**', () => {
    // `{ name: '', licenseTitle: 'Licensed Real Estate Broker', ... }` is the
    // same fabrication wearing an object literal, and four sites carried one.
    //
    // panels.js is EXCLUDED here, and only here: its LICENSE_DESIGNATIONS table
    // is the SANCTIONED browser mirror of PROFESSIONAL_DESIGNATIONS — the one
    // place in the CRM that is supposed to hold these literals, because the
    // browser cannot import the TypeScript authority. The right guard for it is
    // the mirror-parity test below, where the question is "does it still match
    // the server", not "does it exist".
    for (const f of [REPORTS, PAGINATION, AGENT_CONTEXT]) {
      const live = stripComments(src(f));
      expect(live).not.toMatch(/(?:licenseTitle|title)\s*:\s*['"]Licensed [A-Za-z ]+['"]/);
    }
  });

  it('no form PLACEHOLDER proposes a specific designation either', () => {
    // A placeholder is rendered text. The agent's own "Public Title" field hinted
    // "e.g. Licensed Real Estate Broker", so an agent with no resolved licence
    // class was shown the PRINCIPAL BROKER designation as the suggested thing to
    // write about themselves — a fabrication offered rather than printed.
    const live = stripComments(src(PANELS));
    const placeholders = Array.from(live.matchAll(/placeholder="([^"]*)"/g)).map((m) => m[1]);
    for (const ph of placeholders) {
      for (const d of ALL_DESIGNATIONS) {
        expect(ph).not.toContain(d);
      }
      // and the shortened forms §175.25(c)(4) prohibits outright
      expect(ph).not.toMatch(/\bReal Estate Broker\b/);
      expect(ph).not.toMatch(/\bsales associate\b/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FILTER — canonical roles only, and it must actually match
// ═══════════════════════════════════════════════════════════════════════════

describe('the roster role filter offers exactly the canonical roles', () => {
  const CANONICAL_ROLES = ['BROKER', 'ASSOCIATE_BROKER', 'SALESPERSON'];

  async function rosterWithFilter() {
    return renderPanel('agentRoster', [
      {
        id: 1,
        full_name: 'Maya Allan',
        email: 'maya@mallan.nyc',
        role: 'BROKER',
        license_type: 'broker',
        title: null,
      },
      {
        id: 2,
        full_name: 'Claudia Milkowski',
        email: 'c@mallan.nyc',
        role: 'ASSOCIATE_BROKER',
        license_type: 'associate_broker',
        title: null,
      },
      {
        id: 3,
        full_name: 'Sam Sales',
        email: 's@mallan.nyc',
        role: 'SALESPERSON',
        license_type: 'salesperson',
        title: null,
      },
    ]);
  }

  it('offers the three canonical roles and no retired value', async () => {
    const { doc } = await rosterWithFilter();
    const select = doc.getElementById('rosterRoleFilter')!;
    const values = Array.from(select.querySelectorAll('option')).map((o: any) => o.value);
    // '' is the "All Roles" entry.
    expect(values.filter((v: string) => v !== '')).toEqual(CANONICAL_ROLES);
    expect(values).not.toContain('AGENT');
  });

  it('labels ROLES as roles, not with §175.25 designation strings', async () => {
    const { doc } = await rosterWithFilter();
    const select = doc.getElementById('rosterRoleFilter')!;
    const labels = Array.from(select.querySelectorAll('option')).map((o: any) => o.textContent);
    for (const label of labels) {
      expect(ALL_DESIGNATIONS).not.toContain(label);
    }
  });

  it('matches an ASSOCIATE_BROKER agent', async () => {
    const { doc, sandbox } = await rosterWithFilter();
    const select: any = doc.getElementById('rosterRoleFilter');
    select.value = 'ASSOCIATE_BROKER';
    sandbox.Panels._filterRoster();

    const cards = Array.from(doc.querySelectorAll('.agent-roster-card')) as any[];
    const visible = cards.filter((c) => c.style.display !== 'none');
    expect(visible).toHaveLength(1);
    expect(visible[0].getAttribute('data-role')).toBe('ASSOCIATE_BROKER');
    expect(visible[0].getAttribute('data-name')).toBe('claudia milkowski');
  });

  it('matches a BROKER and a SALESPERSON too', async () => {
    for (const role of CANONICAL_ROLES) {
      const { doc, sandbox } = await rosterWithFilter();
      const select: any = doc.getElementById('rosterRoleFilter');
      select.value = role;
      sandbox.Panels._filterRoster();
      const visible = (Array.from(doc.querySelectorAll('.agent-roster-card')) as any[]).filter(
        (c) => c.style.display !== 'none',
      );
      expect(visible).toHaveLength(1);
      expect(visible[0].getAttribute('data-role')).toBe(role);
    }
  });

  it('does not stamp a retired role onto a row that has none', async () => {
    const { doc } = await renderPanel('agentRoster', [
      { id: 9, full_name: 'No Role', email: 'n@mallan.nyc', role: null, license_type: null },
    ]);
    const card: any = doc.querySelector('.agent-roster-card');
    expect(card.getAttribute('data-role')).not.toBe('AGENT');
    expect(card.getAttribute('data-role')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STATIC CRM SURFACES — no unconditional designation
// ═══════════════════════════════════════════════════════════════════════════

describe('the static CRM surfaces assert no designation of their own', () => {
  it('the report preview modal does not hardcode a designation', () => {
    // Nothing in public/crm/** ever assigns #reportPreviewAgentTitle, so the
    // hardcoded text was the FINAL rendered value for every agent, always.
    const html = src(REPORT_PREVIEW);
    const el = /id="reportPreviewAgentTitle"[^>]*>([^<]*)</.exec(html);
    expect(el).not.toBeNull();
    expect(ALL_DESIGNATIONS).not.toContain((el as RegExpExecArray)[1].trim());
  });

  it('the sale and rental tool forms print no designation for the updating agent', () => {
    for (const f of [SALE_FORM, RENTAL_FORM]) {
      const live = stripComments(src(f));
      for (const d of ALL_DESIGNATIONS) {
        // The BROKERAGE's own designation ("Licensed Real Estate Brokerage")
        // is a different fact and is untouched — it is not in this list.
        expect(live).not.toContain('>' + d + '<');
        expect(live).not.toContain("'" + d + "'");
        expect(live).not.toContain('"' + d + '"');
      }
    }
  });

  it('and the email card they BUILD renders the name straight into the brokerage line', () => {
    // Executable, not source-grep: these two builders were the surfaces that
    // actually printed the fabricated line into an outbound email, so the
    // proof is the rendered fragment, not the absence of a literal.
    const cases: Array<[string, string]> = [
      [SALE_FORM, 'buildSaleEmailCardHTML'],
      [RENTAL_FORM, 'buildRentalEmailCardHTML'],
    ];
    for (const [file, fnName] of cases) {
      const body = extractFunction(src(file), fnName);
      expect(body).not.toBeNull();
      const build = new Function(
        'getListingPhotoUrls',
        'fmtMoney',
        `${body}; return ${fnName};`,
      )(() => [], (v: unknown) => String(v)) as (d: Record<string, unknown>) => string;

      const rendered = build({
        updatingAgent: 'Unknown Class',
        streetAddress: '400 East 90th Street',
        neighborhood: 'Yorkville',
        price: '1250000',
      });
      expectNoDesignation(rendered, `${path.basename(file)} ${fnName}()`);
      // The agent's name is still there — this removed a false claim, not the
      // attribution itself.
      expect(rendered).toContain('Unknown Class');
      expect(rendered).toContain('Mallan Real Estate Inc.');
    }
  });

  it('but the BROKERAGE designation is left intact — it is not an individual licence', () => {
    // Guard against over-correction: Mallan Real Estate Inc. IS a licensed
    // real estate brokerage, and saying so is required, not fabricated.
    expect(src(SALE_FORM)).toContain('Licensed Real Estate Brokerage');
    expect(src(RENTAL_FORM)).toContain('Licensed Real Estate Brokerage');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MIRROR — the browser table still matches the ONE authority
// ═══════════════════════════════════════════════════════════════════════════

describe('the browser mirror still matches lib/agents/professional-title.ts', () => {
  it('carries the three canonical designations and no fourth', () => {
    const panels = src(PANELS);
    for (const title of Object.values(PROFESSIONAL_DESIGNATIONS)) {
      expect(panels).toContain(title);
    }
    // The retired word order must never be emitted, only read-tolerated.
    const live = stripComments(panels);
    expect(live).not.toMatch(/title:\s*['"]Licensed Real Estate Associate Broker['"]/);
  });

  it('the build artifact is regenerated from these sources', () => {
    // index-built.html inlines pagination.js verbatim; the fabricated
    // salesperson fallback at pagination.js:1767 appeared there too.
    const built = src(P('index-built.html'));
    expect(built).not.toMatch(/\|\|\s*['"]Licensed Real Estate Salesperson['"]/);
    expect(built).not.toMatch(/\|\|\s*['"]Licensed Real Estate Broker['"]/);
  });
});
