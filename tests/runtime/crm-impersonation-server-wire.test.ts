/// <reference types="jest" />
/**
 * PR-CRM.6 (2026-05-24, post-Codex-P1) — Server-side impersonation
 * wire-up via the MallanAPI wrapper (not raw fetch).
 *
 * Closes the gap surfaced by:
 *   - 2026-05-16 CRM Workflow Audit BA1–BA10 (impersonation was
 *     client-only — no AuditEvent, no delegated session, leaky
 *     broker-as-agent writes)
 *   - 2026-05-24 CRM Backbone Audit §8 finding A8 (same)
 *   - Codex P1 on the original PR-CRM.6 commit (raw fetch bypassed
 *     MallanAPI._baseUrl + shared 401-unauthorized handler — broken
 *     on any deployment where the CRM is served from a non-mallan.nyc
 *     origin while agent-context.js points the API at https://mallan.nyc)
 *
 * Fix is wired in two places via MallanAPI wrappers:
 *   1. `doImpersonate()` → MallanAPI.agents.impersonate(agentId)
 *      → _fetch('/api/crm/agents/{id}/impersonate', { method: 'POST' })
 *   2. `showImpersonationPicker()` stop → MallanAPI.auth.stopImpersonation()
 *      → _fetch('/api/auth/impersonation/stop', { method: 'POST' })
 *
 * Both wrappers go through MallanAPI's internal `_fetch`, which:
 *   - Prepends MallanAPI._baseUrl (cross-origin deploy correctness)
 *   - Sends credentials: 'include' (session cookie)
 *   - Dispatches `mallan:auth:unauthorized` on 401
 *   - Rejects with a parsed error message on non-2xx
 *
 * Strategy: source-pin test. The functions live inside a 2000+ line
 * JS-in-IIFE module with deep dependencies on Store, Router, UI
 * helpers — not feasibly Jest-mockable end-to-end. Source pins
 * guarantee the wrapper path is taken, raw fetch is NOT present
 * for these endpoints, the local Store mutation is gated on backend
 * success, the bundle is regenerated, and the backend routes still
 * meet the contract.
 *
 * ── UPDATED 2026-09-05 (broker delegated access) ─────────────────────
 * Four pins in this file asserted the OLD, BROKEN contract and had to
 * change. They were not wrong when written; the behaviour they pinned
 * was the defect:
 *
 *   1. `requireBroker(req)`            -> `requireNonDelegatedBroker(req)`
 *      requireBroker alone let a delegated BROKER-role session start a
 *      further delegation.
 *   2. `createSession('agent', ...)`   -> `createSessionRecord(...)` with a
 *      parentSessionId + a fixed lifetime. The old call produced an
 *      UNPARENTED 8h session under a 2h cookie.
 *   3. `destroySession(` in the stop route -> `endDelegationAndRotateParent(`.
 *      The old route destroyed the broker's only session, which is why it
 *      then had to tell her to log in again.
 *   4. "redirects to login after stop" -> reloads in place. Requiring a
 *      re-login (and therefore a SECOND MFA) is exactly the defect this
 *      packet exists to remove.
 *
 * The negative pins that still hold — no raw fetch, backend-gated Store
 * mutation, bundle regenerated — are untouched.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const APP_JS_PATH = path.resolve(__dirname, '../../public/crm/js/dashboard/app.js');
const API_CLIENT_PATH = path.resolve(__dirname, '../../public/crm/js/core/api-client.js');
const INDEX_BUILT_PATH = path.resolve(__dirname, '../../public/crm/index-built.html');
const START_ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/crm/agents/[id]/impersonate/route.ts',
);
const STOP_ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/auth/impersonation/stop/route.ts',
);

/**
 * Extract a single named function body from a JS file. Tracks brace
 * depth so the body is precisely bounded (handles nested closures).
 */
function extractFunctionBody(source: string, functionName: string): string {
  const sig = `function ${functionName}(`;
  const start = source.indexOf(sig);
  if (start < 0) throw new Error(`Could not find "${sig}" in source`);
  const rest = source.slice(start);
  const openBrace = rest.indexOf('{');
  if (openBrace < 0) throw new Error(`No body brace found for ${functionName}`);
  let depth = 0;
  let endIdx = -1;
  for (let i = openBrace; i < rest.length; i++) {
    const c = rest[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) throw new Error(`Unbalanced braces in ${functionName}`);
  return rest.slice(openBrace, endIdx + 1);
}

// ═══════════════════════════════════════════════════════════════════════
// MallanAPI wrapper layer — new impersonate + stopImpersonation methods
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — MallanAPI wrappers route impersonation through _fetch', () => {
  let src: string;
  beforeAll(() => { src = readFileSync(API_CLIENT_PATH, 'utf8'); });

  it('MallanAPI.agents.impersonate(agentId) exists and uses _fetch', () => {
    // Pin the method signature + URL + POST + _fetch call.
    const impersonateMatch = src.match(/impersonate:\s*function\s*\(agentId\)\s*\{([\s\S]*?)\},/);
    expect(impersonateMatch).not.toBeNull();
    expect(impersonateMatch![1]).toMatch(/_fetch\(\s*['"]\/api\/crm\/agents\/['"]\s*\+\s*encodeURIComponent\(agentId\)\s*\+\s*['"]\/impersonate['"]/);
    expect(impersonateMatch![1]).toMatch(/method:\s*['"]POST['"]/);
  });

  it('MallanAPI.auth.stopImpersonation() exists and uses _fetch', () => {
    const stopMatch = src.match(/stopImpersonation:\s*function\s*\(\)\s*\{([\s\S]*?)\},/);
    expect(stopMatch).not.toBeNull();
    expect(stopMatch![1]).toMatch(/_fetch\(\s*['"]\/api\/auth\/impersonation\/stop['"]/);
    expect(stopMatch![1]).toMatch(/method:\s*['"]POST['"]/);
  });

  it('_fetch (used by both wrappers) prepends _baseUrl + sends credentials + handles 401', () => {
    // Pin the contract on _fetch itself so a future regression that
    // bypasses _baseUrl or skips the 401 dispatch surfaces here.
    const fetchMatch = src.match(/function\s+_fetch\(path,\s*options\)\s*\{([\s\S]*?)\n\s{2}\}/);
    expect(fetchMatch).not.toBeNull();
    expect(fetchMatch![1]).toMatch(/var\s+url\s*=\s*_baseUrl\s*\+\s*path/);
    expect(fetchMatch![1]).toMatch(/credentials:\s*['"]include['"]/);
    expect(fetchMatch![1]).toMatch(/res\.status\s*===\s*401/);
    expect(fetchMatch![1]).toMatch(/mallan:auth:unauthorized/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// app.js doImpersonate — uses MallanAPI.agents.impersonate, NOT raw fetch
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — doImpersonate goes through MallanAPI (not raw fetch)', () => {
  let body: string;
  let appSrc: string;

  beforeAll(() => {
    appSrc = readFileSync(APP_JS_PATH, 'utf8');
    body = extractFunctionBody(appSrc, 'doImpersonate');
  });

  it('calls MallanAPI.agents.impersonate(agentId) — the wrapper, not raw fetch', () => {
    expect(body).toMatch(/MallanAPI\.agents\.impersonate\(agentId\)/);
  });

  it('does NOT use raw fetch for the impersonate POST (Codex P1 fix)', () => {
    // Negative pin: prior raw-fetch shape MUST be gone. This blocks the
    // exact regression Codex flagged on the original PR-CRM.6 commit.
    expect(body).not.toMatch(/fetch\(\s*['"]\/api\/crm\/agents\/['"]\s*\+\s*encodeURIComponent\(agentId\)\s*\+\s*['"]\/impersonate['"]/);
    // Also pin: no raw relative fetch for any /api/crm/agents/... path.
    expect(body).not.toMatch(/[^_]fetch\(\s*['"]\/api\/crm\/agents\//);
  });

  it('calls Store.startImpersonation ONLY after backend success (order pin)', () => {
    const wrapperIdx = body.indexOf('MallanAPI.agents.impersonate(agentId)');
    const startImpIdx = body.indexOf('Store.startImpersonation(');
    expect(wrapperIdx).toBeGreaterThan(0);
    expect(startImpIdx).toBeGreaterThan(wrapperIdx);
    expect((body.match(/Store\.startImpersonation\(/g) || []).length).toBe(1);
  });

  it('checks data.success and data.impersonating before mutating local state', () => {
    expect(body).toMatch(/data\.success/);
    expect(body).toMatch(/data\.impersonating/);
  });

  it('builds the agent object from backend response (not from cached client list)', () => {
    expect(body).toMatch(/data\.impersonating\.id/);
    expect(body).toMatch(/data\.impersonating\.name/);
    expect(body).toMatch(/data\.impersonating\.email/);
    expect(body).toMatch(/data\.impersonating\.role/);
  });

  it('surfaces backend rejection with honest error toast (no fake success)', () => {
    // _fetch rejects on non-2xx with a parsed error; the .catch surfaces it.
    expect(body).toMatch(/\.catch\(function\s*\(err\)\s*\{[\s\S]*?toast\([^)]*['"]error['"]\)/);
    // Also: if (!data || !data.success || !data.impersonating) → toast error.
    expect(body).toMatch(/!data\.success/);
    expect(body).toMatch(/toast\([^)]*['"]error['"]\)/);
  });

  it('does NOT call Store.startImpersonation inside the OLD MallanAPI.agents.list().then context', () => {
    expect(body).not.toMatch(/MallanAPI\.agents\.list\(\)\.then[\s\S]{0,500}Store\.startImpersonation/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// app.js stop branch — uses MallanAPI.auth.stopImpersonation, NOT raw fetch
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — stop impersonation goes through MallanAPI (not raw fetch)', () => {
  let body: string;
  let appSrc: string;

  beforeAll(() => {
    appSrc = readFileSync(APP_JS_PATH, 'utf8');
    body = extractFunctionBody(appSrc, 'showImpersonationPicker');
  });

  it('calls MallanAPI.auth.stopImpersonation() — the wrapper, not raw fetch', () => {
    expect(body).toMatch(/MallanAPI\.auth\.stopImpersonation\(\)/);
  });

  it('does NOT use raw fetch for the stop POST (Codex P1 fix)', () => {
    expect(body).not.toMatch(/fetch\(\s*['"]\/api\/auth\/impersonation\/stop['"]/);
    // No raw relative fetch for any /api/auth/... path inside this function.
    expect(body).not.toMatch(/[^_]fetch\(\s*['"]\/api\/auth\//);
  });

  it('calls Store.stopImpersonation ONLY after backend success (order pin)', () => {
    const wrapperIdx = body.indexOf('MallanAPI.auth.stopImpersonation()');
    const stopImpIdx = body.indexOf('Store.stopImpersonation(');
    expect(wrapperIdx).toBeGreaterThan(0);
    expect(stopImpIdx).toBeGreaterThan(wrapperIdx);
  });

  it('does NOT bounce to login after stop — the broker session is restored', () => {
    // The whole point: Return to Broker must not require a re-login, because
    // a re-login means a SECOND MFA. The backend rotates a fresh token onto
    // the preserved parent session, so a reload is enough.
    expect(body).not.toMatch(/window\.location\.href\s*=\s*['"]\/crm\/login\.html/);
    expect(body).toMatch(/window\.location\.reload\(\)/);
  });

  it('surfaces backend rejection with honest error toast (does NOT clear local state)', () => {
    // The (!data || !data.success) guard returns early with an error
    // toast and never touches Store.stopImpersonation / location.href.
    const successGuard = body.match(/!data\.success[\s\S]*?return\s*;/);
    expect(successGuard).not.toBeNull();
    expect(successGuard![0]).toMatch(/toast\([^)]*['"]error['"]\)/);
    expect(successGuard![0]).not.toMatch(/Store\.stopImpersonation/);
    expect(successGuard![0]).not.toMatch(/window\.location\.href/);
  });

  it('handles network failure / non-2xx (.catch) with honest error toast', () => {
    expect(body).toMatch(/\.catch\(function\s*\(err\)\s*\{[\s\S]*?toast\([^)]*['"]error['"]\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Backend route contract pins — what we're wiring to actually exists
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — backend route contract (read-only verification)', () => {
  it('start route requires broker auth + writes AuditEvent + sets session cookie', () => {
    const src = readFileSync(START_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
    // requireNonDelegatedBroker, NOT requireBroker: a delegated session that
    // happens to carry BROKER role would satisfy the latter.
    expect(src).toMatch(/requireNonDelegatedBroker\(req\)/);
    expect(src).not.toMatch(/await requireBroker\(req\)/);
    expect(src).toMatch(/logAuditEvent\(\s*['"]impersonate_start['"]/);
    // The delegated session must be PARENTED and lifetime-capped.
    expect(src).toMatch(/createSessionRecord\(\s*['"]agent['"]/);
    expect(src).toMatch(/parentSessionId:\s*auth\.sessionId/);
    expect(src).toMatch(/maxLifetimeMs:\s*DELEGATED_SESSION_MAX_MS/);
    expect(src).toMatch(/res\.cookies\.set\(SESSION_COOKIE/);
    expect(src).toMatch(/success:\s*true/);
    expect(src).toMatch(/impersonating:\s*\{/);
  });

  it('start route refuses self-impersonation and inactive agents', () => {
    const src = readFileSync(START_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/Cannot impersonate yourself/);
    expect(src).toMatch(/Agent not found or inactive/);
  });

  it('stop route requires auth + writes AuditEvent + restores the broker session', () => {
    const src = readFileSync(STOP_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
    expect(src).toMatch(/requireAuth\(req\)/);
    expect(src).toMatch(/logAuditEvent\(\s*['"]impersonate_stop['"]/);
    // destroySession() would have killed the broker's ONLY session — that is
    // the bug. Only the delegated child is destroyed, and the parent gets a
    // freshly rotated token.
    expect(src).not.toMatch(/destroySession\(/);
    expect(src).toMatch(/endDelegationAndRotateParent\(auth\.sessionId\)/);
    expect(src).toMatch(/res\.cookies\.set\(SESSION_COOKIE, restored\.token/);
    // the cookie is only CLEARED on the fail-closed branch
    expect(src).toMatch(/res\.cookies\.delete\(SESSION_COOKIE\)/);
    expect(src).not.toMatch(/Impersonation ended\. Please log in again/);
  });

  it('stop route refuses a caller that is not in a delegated session', () => {
    const src = readFileSync(STOP_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/!auth\.parentSessionId/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Bundle regeneration — index-built.html picks up api-client.js changes
// (api-client.js IS bundled by build.js; dashboard/app.js is NOT)
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — public/crm/index-built.html was regenerated', () => {
  it('bundle contains the new MallanAPI.agents.impersonate wrapper', () => {
    const src = readFileSync(INDEX_BUILT_PATH, 'utf8');
    expect(src).toMatch(/impersonate:\s*function\s*\(agentId\)[\s\S]{0,1000}\/api\/crm\/agents\/['"]\s*\+\s*encodeURIComponent\(agentId\)\s*\+\s*['"]\/impersonate/);
  });

  it('bundle contains the new MallanAPI.auth.stopImpersonation wrapper', () => {
    const src = readFileSync(INDEX_BUILT_PATH, 'utf8');
    expect(src).toMatch(/stopImpersonation:\s*function\s*\(\)[\s\S]{0,1000}\/api\/auth\/impersonation\/stop/);
  });

  it('bundle confirms dashboard/app.js is NOT inlined (only api-client.js is)', () => {
    // Sanity: doImpersonate (dashboard JS) should NOT appear in the
    // bundle, because dashboard.html loads app.js directly via
    // <script src=...>. This pins the build-system assumption so a
    // future change that DID start bundling dashboard JS would
    // surface here and remind the author to also keep app.js in sync
    // through the bundle drift guard.
    const src = readFileSync(INDEX_BUILT_PATH, 'utf8');
    expect(src).not.toMatch(/function\s+doImpersonate\(/);
  });
});
