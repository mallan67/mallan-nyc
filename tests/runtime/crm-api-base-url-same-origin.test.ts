/// <reference types="jest" />
/**
 * CRM API BASE URL — SAME-ORIGIN AUTHORITY (2026-09-04)
 *
 * DEFECT (pre-existing, reproduced live in a browser):
 *   `public/crm/js/core/agent-context.js` sniffed the host:
 *
 *       var origin = window.location.origin;
 *       if (origin.indexOf('mallan.nyc') === -1) {
 *           MallanAPI.configure({ baseUrl: 'https://mallan.nyc' });
 *       }
 *
 *   On ANY origin not containing the literal "mallan.nyc" — every
 *   *.vercel.app Preview, every branch alias, localhost — the CRM shell
 *   repointed its API authority at PRODUCTION. Consequences:
 *
 *     1. Cross-environment data authority: a Preview CRM read and wrote
 *        Production APIs / Production Neon.
 *     2. The page's own CRM CSP is `connect-src 'self'`, so the browser
 *        refused the cross-origin /api/auth/me probe; api-client.js caught
 *        the failure and coerced it to { authenticated: false }; app.js
 *        redirected to /crm/login.html, which does NOT load
 *        agent-context.js, so it stayed same-origin, saw a valid session
 *        and redirected back to /crm/dashboard. 33 navigations in 14s.
 *
 * CANONICAL RULE THIS TEST PINS:
 *   When the CRM and the API are served by the same Mallan deployment,
 *   use SAME-ORIGIN.
 *
 *     Preview CRM     -> Preview API     -> QA Neon
 *     Production CRM  -> Production API  -> Production Neon
 *
 *   Local development is the ONE explicitly governed exception, and it is
 *   OPT-IN ONLY (window.MALLAN_API_BASE_URL), honoured on localhost alone.
 *
 * STRATEGY: behavioural, not source-grep. Each case boots the real
 * api-client.js (+ agent-context.js) inside a `vm` sandbox with a synthetic
 * window/location and a recording fetch, then asserts on the RESOLVED BASE
 * URL and on the ABSOLUTE URL actually requested. A test that only asserted
 * "the request succeeded" would pass against the broken code too.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const CRM_ROOT = path.resolve(__dirname, '../../public/crm');
const API_CLIENT_PATH = path.join(CRM_ROOT, 'js/core/api-client.js');
const AGENT_CONTEXT_PATH = path.join(CRM_ROOT, 'js/core/agent-context.js');
const LOGIN_HTML_PATH = path.join(CRM_ROOT, 'login.html');
const RENTAL_FORM_PATH = path.join(CRM_ROOT, 'RENTAL-FORM-WITH-TOOLS.html');
const SALE_FORM_PATH = path.join(CRM_ROOT, 'SALE-FORM-WITH-TOOLS.html');
const INDEX_BUILT_PATH = path.join(CRM_ROOT, 'index-built.html');
const SECURITY_HEADERS_PATH = path.resolve(
  __dirname,
  '../../lib/middleware/security-headers.ts',
);

const API_CLIENT_SRC = readFileSync(API_CLIENT_PATH, 'utf8');
const AGENT_CONTEXT_SRC = readFileSync(AGENT_CONTEXT_PATH, 'utf8');

const PREVIEW_ORIGIN = 'https://mallan-nyc-git-feat-agent-permanent-delete.vercel.app';
const PREVIEW_HOST = 'mallan-nyc-git-feat-agent-permanent-delete.vercel.app';
const PROD_ORIGIN = 'https://mallan.nyc';
const ME_PATH = '/api/auth/me';

type FetchCall = { url: string; init: any };

interface Harness {
  sandbox: any;
  calls: FetchCall[];
  MallanAPI: any;
  navigations: string[];
  errors: string[];
}

interface BootOptions {
  origin: string;
  hostname: string;
  withAgentContext?: boolean;
  /** value assigned to window.MALLAN_API_BASE_URL BEFORE api-client.js loads */
  overrideBaseUrl?: string;
  /** body returned by the recording fetch */
  meResponse?: any;
}

/**
 * Boot the real CRM core scripts in an isolated sandbox.
 * Nothing is stubbed except the browser surface itself.
 */
function boot(opts: BootOptions): Harness {
  const calls: FetchCall[] = [];
  const navigations: string[] = [];
  const errors: string[] = [];

  const meResponse =
    opts.meResponse !== undefined
      ? opts.meResponse
      : {
          authenticated: true,
          principalType: 'AGENT',
          role: 'SALESPERSON',
          portalRole: null,
          user: { id: 'a1', name: 'Test Salesperson', email: 't@mallan.nyc' },
        };

  const location: any = {
    origin: opts.origin,
    hostname: opts.hostname,
    host: opts.hostname,
    protocol: opts.origin.split(':')[0] + ':',
    pathname: '/crm/dashboard.html',
  };
  // Record any attempt to navigate (the redirect-loop signal).
  let hrefValue = opts.origin + '/crm/dashboard.html';
  Object.defineProperty(location, 'href', {
    get() {
      return hrefValue;
    },
    set(v: string) {
      hrefValue = v;
      navigations.push(v);
    },
  });

  const listeners: Record<string, Function[]> = {};

  const sandbox: any = {
    console: {
      log: () => {},
      warn: () => {},
      error: (...a: any[]) => {
        errors.push(a.map(String).join(' '));
      },
    },
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    Error,
    RegExp,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    localStorage: { removeItem: () => {}, getItem: () => null, setItem: () => {} },
    document: { cookie: 'session_token=abc' },
    CustomEvent: function (this: any, type: string, init: any) {
      this.type = type;
      this.detail = init && init.detail;
    },
    // Models the CRM CSP (`connect-src 'self'`): the browser REFUSES any
    // request to an origin other than the one serving the page, and fetch()
    // rejects with a TypeError. This is the mechanism that turned the host
    // sniff into a login redirect loop, so the harness must reproduce it —
    // a fetch that always resolves would let the broken code pass.
    fetch: (url: string, init: any) => {
      const u = String(url);
      calls.push({ url: u, init });
      const absolute = /^https?:\/\//i.test(u);
      if (absolute && u.indexOf(opts.origin + '/') !== 0) {
        return Promise.reject(
          new TypeError('Refused to connect to ' + u + ": violates CSP connect-src 'self'"),
        );
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(meResponse),
      });
    },
  };

  sandbox.window = sandbox;
  sandbox.location = location;
  sandbox.addEventListener = (type: string, cb: Function) => {
    listeners[type] = listeners[type] || [];
    listeners[type].push(cb);
  };
  sandbox.dispatchEvent = (evt: any) => {
    (listeners[evt.type] || []).forEach((cb) => cb(evt));
    return true;
  };

  const context = vm.createContext(sandbox);

  if (opts.overrideBaseUrl !== undefined) {
    vm.runInContext(
      'window.MALLAN_API_BASE_URL = ' + JSON.stringify(opts.overrideBaseUrl) + ';',
      context,
    );
  }

  vm.runInContext(API_CLIENT_SRC, context, { filename: 'api-client.js' });
  if (opts.withAgentContext) {
    vm.runInContext(AGENT_CONTEXT_SRC, context, { filename: 'agent-context.js' });
  }

  return { sandbox, calls, MallanAPI: sandbox.MallanAPI, navigations, errors };
}

/** The base URL the client actually prepends, observed behaviourally. */
function observedBase(h: Harness): string {
  h.calls.length = 0;
  // The CSP-modelling fetch may reject; the URL is recorded either way and
  // the URL is what this assertion is about.
  h.MallanAPI.auth.me().catch(() => {});
  expect(h.calls.length).toBe(1);
  const url = h.calls[0].url;
  return url.slice(0, url.length - ME_PATH.length);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Strip comments so the source pins below assert on EXECUTABLE code, not on
 * prose. The removed defect is quoted verbatim in the new explanatory
 * comments, and a naive grep would flag that quotation forever.
 *
 * Deliberately conservative: `//` starts a comment only when it begins a
 * trimmed line. Treating every `//` as a comment would let the scheme
 * separator in `'https://mallan.nyc'` swallow the rest of a real offending
 * line — a false NEGATIVE, the one failure mode this pin must not have.
 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const PIN_TARGETS = [
  AGENT_CONTEXT_PATH,
  LOGIN_HTML_PATH,
  RENTAL_FORM_PATH,
  SALE_FORM_PATH,
  INDEX_BUILT_PATH,
  API_CLIENT_PATH,
];

// ══════════════════════════════════════════════════════════════════════════
// DIRECT — the resolved base URL per origin
// ══════════════════════════════════════════════════════════════════════════

describe('DIRECT — API base URL resolution per origin', () => {
  test('a *.vercel.app Preview origin does NOT point the API at Production', () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      withAgentContext: true,
    });
    expect(observedBase(h)).toBe('');
  });

  test('a *.vercel.app Preview origin requests a same-origin relative URL', () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      withAgentContext: true,
    });
    h.calls.length = 0;
    h.MallanAPI.auth.me().catch(() => {});
    expect(h.calls[0].url).toBe(ME_PATH);
    expect(h.calls[0].url).not.toContain('mallan.nyc');
  });

  test('a branch-alias origin (not *.vercel.app, not mallan.nyc) stays same-origin', () => {
    const h = boot({
      origin: 'https://crm-staging.example.dev',
      hostname: 'crm-staging.example.dev',
      withAgentContext: true,
    });
    expect(observedBase(h)).toBe('');
  });

  test('the mallan.nyc Production origin remains same-origin (never absolutised)', () => {
    const h = boot({
      origin: PROD_ORIGIN,
      hostname: 'mallan.nyc',
      withAgentContext: true,
    });
    expect(observedBase(h)).toBe('');
    expect(h.MallanAPI.getBaseUrl()).toBe('');
  });

  test('www.mallan.nyc remains same-origin', () => {
    const h = boot({
      origin: 'https://www.mallan.nyc',
      hostname: 'www.mallan.nyc',
      withAgentContext: true,
    });
    expect(observedBase(h)).toBe('');
  });

  test('getBaseUrl() reports same-origin for every deployed origin', () => {
    const cases: Array<[string, string]> = [
      [PREVIEW_ORIGIN, PREVIEW_HOST],
      [PROD_ORIGIN, 'mallan.nyc'],
      ['https://crm-staging.example.dev', 'crm-staging.example.dev'],
    ];
    for (const [origin, hostname] of cases) {
      const h = boot({ origin, hostname, withAgentContext: true });
      expect(h.MallanAPI.getBaseUrl()).toBe('');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// DIRECT — localhost is EXPLICITLY governed, never a silent fallthrough
// ══════════════════════════════════════════════════════════════════════════

describe('DIRECT — localhost is explicitly governed', () => {
  test('localhost defaults to SAME-ORIGIN (next dev serves CRM + API together)', () => {
    const h = boot({
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      withAgentContext: true,
    });
    expect(h.MallanAPI.getBaseUrl()).toBe('');
    expect(observedBase(h)).toBe('');
  });

  test('127.0.0.1 defaults to SAME-ORIGIN', () => {
    const h = boot({
      origin: 'http://127.0.0.1:3000',
      hostname: '127.0.0.1',
      withAgentContext: true,
    });
    expect(h.MallanAPI.getBaseUrl()).toBe('');
  });

  test('localhost MAY opt in to a remote API, explicitly, via window.MALLAN_API_BASE_URL', () => {
    const h = boot({
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      overrideBaseUrl: 'https://mallan-nyc-preview.vercel.app',
      withAgentContext: true,
    });
    expect(h.MallanAPI.getBaseUrl()).toBe('https://mallan-nyc-preview.vercel.app');
    expect(observedBase(h)).toBe('https://mallan-nyc-preview.vercel.app');
  });

  test('localhost opt-in normalises a trailing slash', () => {
    const h = boot({
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      overrideBaseUrl: 'https://mallan-nyc-preview.vercel.app/',
    });
    expect(h.MallanAPI.getBaseUrl()).toBe('https://mallan-nyc-preview.vercel.app');
  });

  test('localhost opt-in ignores a non-http(s) value (no javascript:/data: injection)', () => {
    const h = boot({
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      overrideBaseUrl: 'javascript:alert(1)',
    });
    expect(h.MallanAPI.getBaseUrl()).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// NEGATIVE — a Preview CRM can never silently talk to Production
// ══════════════════════════════════════════════════════════════════════════

describe('NEGATIVE — Preview can never reach Production', () => {
  test('window.MALLAN_API_BASE_URL is IGNORED on a deployed Preview origin', () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      overrideBaseUrl: PROD_ORIGIN,
      withAgentContext: true,
    });
    expect(h.MallanAPI.getBaseUrl()).toBe('');
    expect(observedBase(h)).toBe('');
  });

  test('MallanAPI.configure() REFUSES an off-origin base on a deployed origin', () => {
    const h = boot({ origin: PREVIEW_ORIGIN, hostname: PREVIEW_HOST });
    h.MallanAPI.configure({ baseUrl: PROD_ORIGIN });
    expect(h.MallanAPI.getBaseUrl()).toBe('');
    expect(observedBase(h)).toBe('');
    expect(h.errors.join(' ')).toMatch(/refus/i);
  });

  test('MallanAPI.configure() REFUSES an off-origin base on Production too', () => {
    const h = boot({ origin: PROD_ORIGIN, hostname: 'mallan.nyc' });
    h.MallanAPI.configure({ baseUrl: PREVIEW_ORIGIN });
    expect(h.MallanAPI.getBaseUrl()).toBe('');
  });

  test('MallanAPI.configure() accepts a base equal to the current origin (no-op)', () => {
    const h = boot({ origin: PREVIEW_ORIGIN, hostname: PREVIEW_HOST });
    h.MallanAPI.configure({ baseUrl: PREVIEW_ORIGIN });
    expect(h.MallanAPI.getBaseUrl()).toBe(PREVIEW_ORIGIN);
    expect(observedBase(h)).toBe(PREVIEW_ORIGIN);
  });

  test('no CRM file hardcodes the Production API base via MallanAPI.configure()', () => {
    const offenders: string[] = [];
    for (const p of PIN_TARGETS) {
      const code = stripComments(readFileSync(p, 'utf8'));
      if (/MallanAPI\.configure\(\s*\{\s*baseUrl:\s*['"]https:\/\/mallan\.nyc['"]/.test(code)) {
        offenders.push(path.basename(p));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no CRM file selects an API base by sniffing for the literal "mallan.nyc"', () => {
    const offenders: string[] = [];
    for (const p of PIN_TARGETS) {
      const code = stripComments(readFileSync(p, 'utf8'));
      if (/(indexOf|includes)\(\s*['"]mallan\.nyc['"]\s*\)/.test(code)) {
        offenders.push(path.basename(p));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the comment-stripper cannot hide a real offender (guards the pin itself)', () => {
    const real = [
      "if (origin.indexOf('mallan.nyc') === -1) {",
      "    MallanAPI.configure({ baseUrl: 'https://mallan.nyc' });",
      '}',
    ].join('\n');
    const stripped = stripComments(real);
    expect(/(indexOf|includes)\(\s*['"]mallan\.nyc['"]\s*\)/.test(stripped)).toBe(true);
    expect(
      /MallanAPI\.configure\(\s*\{\s*baseUrl:\s*['"]https:\/\/mallan\.nyc['"]/.test(stripped),
    ).toBe(true);
    // ...and it DOES remove the same lines when they are commented out.
    expect(stripComments(real.split('\n').map((l) => '// ' + l).join('\n')).trim()).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// INTEGRATION — the shell initialises on its own origin and does NOT loop
// ══════════════════════════════════════════════════════════════════════════

describe('INTEGRATION — CRM shell boot on a Preview origin', () => {
  test('agent-context.js probes /api/auth/me on the SHELL ORIGIN, not Production', async () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      withAgentContext: true,
    });
    await flush();
    const meCalls = h.calls.filter((c) => c.url.indexOf(ME_PATH) !== -1);
    expect(meCalls.length).toBeGreaterThanOrEqual(1);
    for (const c of meCalls) {
      expect(c.url).toBe(ME_PATH);
      expect(c.url).not.toContain('mallan.nyc');
    }
  });

  test('an authenticated SALESPERSON on Preview is NOT redirected back to login', async () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      withAgentContext: true,
    });
    await flush();
    await flush();
    expect(h.navigations.filter((n) => n.indexOf('login') !== -1)).toEqual([]);
  });

  test('an UNauthenticated user on Preview still redirects to login exactly once', async () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      withAgentContext: true,
      meResponse: { authenticated: false, user: null },
    });
    await flush();
    await flush();
    expect(h.navigations).toEqual(['/crm/login.html']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SECURITY — no cross-origin credential leakage, no CSP weakening
// ══════════════════════════════════════════════════════════════════════════

describe('SECURITY — credentials and CSP', () => {
  test('credentialed requests from a Preview origin never target Production', () => {
    const h = boot({
      origin: PREVIEW_ORIGIN,
      hostname: PREVIEW_HOST,
      withAgentContext: true,
    });
    h.calls.length = 0;
    h.MallanAPI.auth.me().catch(() => {});
    h.MallanAPI.agents.me().catch(() => {});
    h.MallanAPI.portal.me().catch(() => {});
    expect(h.calls.length).toBe(3);
    for (const c of h.calls) {
      expect(c.init.credentials).toBe('include');
      expect(c.url.charAt(0)).toBe('/');
      expect(c.url).not.toContain('mallan.nyc');
    }
  });

  test('the CRM CSP connect-src is UNCHANGED — no mallan.nyc, no wildcard', () => {
    const src = readFileSync(SECURITY_HEADERS_PATH, 'utf8');
    const crmBlock = src.slice(src.indexOf('const CRM_CSP'));
    const connect = crmBlock.match(/"connect-src ([^"]+)"/);
    expect(connect).not.toBeNull();
    const value = (connect as RegExpMatchArray)[1];
    expect(value).toBe(
      "'self' https://nominatim.openstreetmap.org https://api.mapbox.com https://*.basemaps.cartocdn.com https://tiles.openfreemap.org https://api.cotality.com",
    );
    expect(value).not.toContain('mallan.nyc');
    expect(value).not.toContain("'unsafe");
  });

  test('the public CSP connect-src is UNCHANGED — no mallan.nyc added', () => {
    const src = readFileSync(SECURITY_HEADERS_PATH, 'utf8');
    const publicBlock = src.slice(
      src.indexOf('function buildPublicCsp'),
      src.indexOf('const CRM_CSP'),
    );
    const connect = publicBlock.match(/"connect-src ([^"]+)"/);
    expect(connect).not.toBeNull();
    expect((connect as RegExpMatchArray)[1]).not.toContain('mallan.nyc');
  });

  test('the CRM CSP stays fail-closed: frame-ancestors none, base-uri self, form-action self', () => {
    const src = readFileSync(SECURITY_HEADERS_PATH, 'utf8');
    const fromCrm = src.slice(src.indexOf('const CRM_CSP'));
    const crmBlock = fromCrm.slice(0, fromCrm.indexOf('].join'));
    expect(crmBlock).toContain('"frame-ancestors \'none\'"');
    expect(crmBlock).toContain('"base-uri \'self\'"');
    expect(crmBlock).toContain('"form-action \'self\'"');
  });
});
