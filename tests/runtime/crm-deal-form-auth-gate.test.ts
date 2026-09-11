/// <reference types="jest" />
/**
 * BUYER-DEAL-FORM and TENANT-DEAL-FORM — the client auth gate must actually RUN.
 *
 * ── THE DEFECT (found 2026-09-10) ─────────────────────────────────────────────────────────────
 *
 * Both forms carried four unterminated string literals:
 *
 *     window.location.href = '/crm/login.html;          <-- no closing quote
 *
 * An unterminated string is a SyntaxError, and a SyntaxError takes down the whole <script> block.
 * So the gate never executed — not the redirect, not the catch, not the
 * `mallan:auth:unauthorized` listener. The forms shipped with their second auth layer silently
 * absent, and nothing failed loudly enough to notice.
 *
 * ── WHY THE SECOND LAYER MATTERS ──────────────────────────────────────────────────────────────
 *
 * The PRIMARY boundary is middleware (lib/middleware/route-guards.ts): any /crm* path without a
 * `session_token` cookie is redirected to the login page. That boundary tests COOKIE PRESENCE, not
 * session validity. An agent whose session has EXPIRED still carries the cookie, so middleware
 * passes the request through and the form renders in full. The in-page gate is the layer that
 * calls /api/auth/me and bounces that agent to login. With the gate dead, an expired agent fills
 * in a deal form and only discovers the session is gone when the server refuses the save.
 *
 * No data leaked: /api/crm/* remains cookie-gated server-side, and an invalid session is rejected
 * there. What was lost is the honest early bounce.
 *
 * ── WHAT THIS SUITE PROVES ────────────────────────────────────────────────────────────────────
 *
 * 1. Every inline <script> in both forms PARSES. Asserted by handing each block to V8, not by
 *    grepping for a quote — a regex that looks for the known-bad spelling only ever catches the
 *    bug you already fixed.
 * 2. The gate redirects when the session is not authenticated.
 * 3. The gate does NOT redirect when it is.
 * 4. It fails closed when the API client is missing entirely.
 * 5. It still listens for `mallan:auth:unauthorized`.
 * 6. The primary middleware boundary is untouched, and the login destination it and the gate use
 *    cannot loop.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as vm from 'vm';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const FORMS = ['public/crm/BUYER-DEAL-FORM.html', 'public/crm/TENANT-DEAL-FORM.html'] as const;

/** Inline script bodies only — a `src=` tag has no body to parse, and non-JS types are not JS. */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
    if (type && !/javascript|module/i.test(type)) continue;
    if (m[2].trim()) out.push(m[2]);
  }
  return out;
}

/** The gate is the IIFE in the block that announces itself as the auth gate. */
function authGateSource(html: string): string {
  const block = inlineScripts(html).find((s) => /Auth gate/i.test(s));
  if (!block) throw new Error('no auth-gate script block found');
  return block;
}

/**
 * `redirectedTo` is a GETTER, not a snapshot. The unauthenticated redirect happens inside a
 * promise callback, so a value captured when runGate() returns would always read null and every
 * async assertion would pass or fail for the wrong reason.
 */
type Run = { readonly redirectedTo: string | null; listeners: Record<string, () => void> };

/**
 * Execute the gate against a stubbed browser and report where it sent the operator.
 * `authenticated: null` means "no MallanAPI at all" — the fail-closed case.
 */
function runGate(source: string, authenticated: boolean | null): Run {
  const listeners: Record<string, () => void> = {};
  const location = { _href: '' as string };
  const win: Record<string, unknown> = {
    location: {
      set href(v: string) { location._href = v; },
      get href() { return location._href; },
    },
    addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; },
    console: { warn() {}, error() {} },
  };
  if (authenticated !== null) {
    win.MallanAPI = { init: () => Promise.resolve({ authenticated }) };
  }
  const ctx = vm.createContext(win);
  (ctx as { window?: unknown }).window = ctx;
  vm.runInContext(source, ctx);
  return {
    get redirectedTo() { return location._href || null; },
    listeners,
  };
}

describe('the deal forms parse — the gate is code, not decoration', () => {
  for (const form of FORMS) {
    it(`${form}: every inline <script> is valid JavaScript`, () => {
      const blocks = inlineScripts(read(form));
      expect(blocks.length).toBeGreaterThan(0);
      const broken = blocks
        .map((src, i) => {
          try {
            new vm.Script(src);
            return null;
          } catch (e) {
            return `block #${i}: ${(e as Error).message}`;
          }
        })
        .filter(Boolean);
      expect({
        broken,
        why: 'A SyntaxError anywhere in a <script> block prevents the ENTIRE block from executing, including the auth gate.',
      }).toEqual({ broken: [], why: expect.any(String) });
    });
  }
});

describe('the gate sends an unauthenticated agent to login', () => {
  for (const form of FORMS) {
    const gate = () => authGateSource(read(form));

    it(`${form}: an unauthenticated session is redirected`, async () => {
      const run = runGate(gate(), false);
      await new Promise((r) => setImmediate(r));
      expect(run.redirectedTo).toBe('/crm/login');
    });

    it(`${form}: an authenticated session is NOT redirected`, async () => {
      const run = runGate(gate(), true);
      await new Promise((r) => setImmediate(r));
      expect(run.redirectedTo).toBeNull();
    });

    it(`${form}: fails CLOSED when the API client never loaded`, () => {
      expect(runGate(gate(), null).redirectedTo).toBe('/crm/login');
    });

    it(`${form}: still bounces on a mid-session mallan:auth:unauthorized`, async () => {
      const run = runGate(gate(), true);
      await new Promise((r) => setImmediate(r));
      expect(typeof run.listeners['mallan:auth:unauthorized']).toBe('function');
      run.listeners['mallan:auth:unauthorized']();
      expect(run.redirectedTo).toBe('/crm/login');
    });
  }
});

describe('the primary boundary is unchanged, and the two layers cannot loop', () => {
  const guards = read('lib/middleware/route-guards.ts');

  it('middleware still protects /crm* on missing session cookie', () => {
    expect(guards).toMatch(/pathname\.startsWith\("\/crm"\)/);
    expect(guards).toMatch(/req\.cookies\.has\(SESSION_COOKIE\)/);
    expect(guards).toMatch(/NextResponse\.redirect\(loginUrl\)/);
  });

  it('middleware still whitelists the login page, so neither layer can redirect into itself', () => {
    // The whitelist is a PREFIX test on /crm/login, which covers both the governed route
    // (/crm/login) and the artifact (/crm/login.html). The gate's destination must fall inside it.
    expect(guards).toMatch(/!pathname\.startsWith\("\/crm\/login"\)/);
    for (const form of FORMS) {
      const dest = /window\.location\.href\s*=\s*'([^']+)'/.exec(authGateSource(read(form)))?.[1];
      expect(dest).toBeDefined();
      expect(dest!.startsWith('/crm/login')).toBe(true);
    }
  });

  it('the gate addresses login by its governed route, not by build artifact', () => {
    const rewrites = (JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] }).rewrites;
    expect(rewrites.find((r) => r.source === '/crm/login')!.destination).toBe('/crm/login.html');
    for (const form of FORMS) {
      expect(authGateSource(read(form))).not.toMatch(/login\.html/);
    }
  });
});
