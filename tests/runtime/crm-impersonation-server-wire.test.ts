/// <reference types="jest" />
/**
 * PR-CRM.6 (2026-05-24) — Server-side impersonation wire-up.
 *
 * Closes the gap surfaced by the 2026-05-16 CRM Workflow Audit
 * BA1–BA10 + the 2026-05-24 CRM Backbone Audit §8 finding A8:
 * `doImpersonate()` in public/crm/js/dashboard/app.js was client-
 * only — it set local Store impersonation state but never POSTed to
 * the existing backend route. Consequence:
 *   - No AuditEvent for impersonation start (NY SHIELD trail missing)
 *   - No server-side delegated session created (broker session stays
 *     broker server-side; ownership checks still see BROKER)
 *   - Broker-as-agent could still approve own deals because the
 *     server-side role check still saw BROKER (leaky per BA9)
 *
 * Fix is wired in two places:
 *   1. `doImpersonate()` — POST /api/crm/agents/{id}/impersonate FIRST,
 *      then Store.startImpersonation ONLY on backend success.
 *   2. `showImpersonationPicker()` stop path — POST /api/auth/
 *      impersonation/stop FIRST, then Store.stopImpersonation +
 *      redirect to login (backend destroys the session cookie).
 *
 * Strategy: source-pin test. The functions live inside a 2000+ line
 * JS-in-IIFE module (public/crm/js/dashboard/app.js) with deep
 * dependencies on Store, MallanAPI, Router, UI helpers — not
 * feasibly Jest-mockable end-to-end. Source pins guarantee:
 *   - the fetch call exists with the right URL + method + credentials
 *   - it runs BEFORE the local Store mutation (gated, not parallel)
 *   - the bundle was regenerated (drift guard would also catch this)
 *   - the backend routes exist with the right auth + audit + cookie shape
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const APP_JS_PATH = path.resolve(__dirname, '../../public/crm/js/dashboard/app.js');
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
// doImpersonate — start path wired to backend
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — doImpersonate POSTs to backend BEFORE local mutation', () => {
  let body: string;

  beforeAll(() => {
    const src = readFileSync(APP_JS_PATH, 'utf8');
    body = extractFunctionBody(src, 'doImpersonate');
  });

  it('POSTs to /api/crm/agents/{agentId}/impersonate with credentials', () => {
    // The URL is built with encodeURIComponent(agentId) for safety; pin
    // both the path prefix and the POST method + credentials.
    expect(body).toMatch(
      /fetch\(\s*['"]\/api\/crm\/agents\/['"]\s*\+\s*encodeURIComponent\(agentId\)\s*\+\s*['"]\/impersonate['"]/,
    );
    expect(body).toMatch(/method:\s*['"]POST['"]/);
    expect(body).toMatch(/credentials:\s*['"]include['"]/);
  });

  it('calls Store.startImpersonation ONLY after backend success', () => {
    // Order check: the fetch().then(...) chain wraps Store.startImpersonation;
    // it is NOT called outside the .then.
    const fetchIdx = body.indexOf("fetch('/api/crm/agents/'");
    const startImpIdx = body.indexOf('Store.startImpersonation(');
    expect(fetchIdx).toBeGreaterThan(0);
    expect(startImpIdx).toBeGreaterThan(fetchIdx);
    // Verify Store.startImpersonation is only invoked once after success.
    expect((body.match(/Store\.startImpersonation\(/g) || []).length).toBe(1);
  });

  it('checks data.success and data.impersonating before mutating local state', () => {
    // Backend response shape is { success: true, impersonating: {...} }.
    // Frontend must verify both before calling Store.startImpersonation,
    // so a 200 OK with an unexpected body shape does not falsely succeed.
    expect(body).toMatch(/data\.success/);
    expect(body).toMatch(/data\.impersonating/);
  });

  it('builds the agent object from backend response (not from cached client list)', () => {
    // Pre-fix bug: agent was taken from MallanAPI.agents.list() which
    // could be stale/filtered. Now we use the authoritative backend
    // response from /api/crm/agents/{id}/impersonate.
    expect(body).toMatch(/data\.impersonating\.id/);
    expect(body).toMatch(/data\.impersonating\.name/);
    expect(body).toMatch(/data\.impersonating\.email/);
    expect(body).toMatch(/data\.impersonating\.role/);
  });

  it('surfaces backend rejection with an honest error toast (no fake success)', () => {
    // The !res.ok branch must call toast with an error message and NOT
    // fall through to Store.startImpersonation.
    expect(body).toMatch(/!res\.ok/);
    expect(body).toMatch(/toast\([^)]*['"]error['"]\)/);
    // Negative pin: no toast saying success/started inside the failure branch.
    const failureBranch = body.match(/if\s*\(\s*!res\.ok\s*\)\s*\{([\s\S]*?)\}\s*return/);
    expect(failureBranch).not.toBeNull();
    expect(failureBranch![1]).not.toMatch(/toast\([^)]*['"]success['"]\)/i);
    expect(failureBranch![1]).not.toMatch(/Store\.startImpersonation/);
  });

  it('handles network failure (.catch) with an honest error toast', () => {
    expect(body).toMatch(/\.catch\(function\s*\(\s*\)\s*\{[\s\S]*?toast\([^)]*['"]error['"]\)/);
  });

  it('does NOT call Store.startImpersonation synchronously (must wait for backend)', () => {
    // Pre-fix had a synchronous Store.startImpersonation call inside
    // MallanAPI.agents.list().then. The fix wraps it in the fetch().then
    // for the impersonate POST. There should be NO Store.startImpersonation
    // call inside the OLD MallanAPI.agents.list().then context.
    expect(body).not.toMatch(/MallanAPI\.agents\.list\(\)\.then[\s\S]{0,500}Store\.startImpersonation/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// showImpersonationPicker stop path — POSTs to backend BEFORE local mutation
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — stop impersonation POSTs to backend BEFORE local mutation', () => {
  let body: string;

  beforeAll(() => {
    const src = readFileSync(APP_JS_PATH, 'utf8');
    body = extractFunctionBody(src, 'showImpersonationPicker');
  });

  it('POSTs to /api/auth/impersonation/stop with credentials when isImpersonating()', () => {
    expect(body).toMatch(/Store\.isImpersonating\(\)/);
    expect(body).toMatch(/fetch\(\s*['"]\/api\/auth\/impersonation\/stop['"]/);
    expect(body).toMatch(/method:\s*['"]POST['"]/);
    expect(body).toMatch(/credentials:\s*['"]include['"]/);
  });

  it('calls Store.stopImpersonation ONLY after backend success', () => {
    // Pin the order: fetch().then(...) wraps Store.stopImpersonation.
    const fetchIdx = body.indexOf("fetch('/api/auth/impersonation/stop'");
    const stopImpIdx = body.indexOf('Store.stopImpersonation(');
    expect(fetchIdx).toBeGreaterThan(0);
    expect(stopImpIdx).toBeGreaterThan(fetchIdx);
  });

  it('redirects to login after stop (cookie destroyed by backend)', () => {
    // Backend destroys the session cookie; per its own doc, "Broker must
    // re-login with their own credentials." Frontend must redirect.
    expect(body).toMatch(/window\.location\.href\s*=\s*['"]\/crm\/login\.html\?redirect=\/crm['"]/);
  });

  it('surfaces backend rejection with an honest error toast (does NOT clear local state)', () => {
    // If the backend stop fails, local impersonation state should stay
    // intact — the user is still actually impersonating server-side.
    const failureGuard = body.match(/if\s*\(\s*!res\.ok\s*\)\s*\{([\s\S]*?)return\s*;/);
    expect(failureGuard).not.toBeNull();
    expect(failureGuard![1]).toMatch(/toast\([^)]*['"]error['"]\)/);
    expect(failureGuard![1]).not.toMatch(/Store\.stopImpersonation/);
    expect(failureGuard![1]).not.toMatch(/window\.location\.href/);
  });

  it('handles network failure (.catch) with an honest error toast', () => {
    expect(body).toMatch(/\.catch\(function\s*\(\s*\)\s*\{[\s\S]*?toast\([^)]*['"]error['"]\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Backend route contract pins — what we're wiring to actually exists
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — backend route contract (read-only verification)', () => {
  it('start route requires broker auth + writes AuditEvent + sets session cookie', () => {
    const src = readFileSync(START_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
    expect(src).toMatch(/requireBroker\(req\)/);
    expect(src).toMatch(/logAuditEvent\(\s*['"]impersonate_start['"]/);
    expect(src).toMatch(/createSession\(\s*['"]agent['"]/);
    expect(src).toMatch(/res\.cookies\.set\(SESSION_COOKIE/);
    // Response shape we depend on.
    expect(src).toMatch(/success:\s*true/);
    expect(src).toMatch(/impersonating:\s*\{/);
  });

  it('start route refuses self-impersonation and inactive agents', () => {
    const src = readFileSync(START_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/Cannot impersonate yourself/);
    expect(src).toMatch(/Agent not found or inactive/);
  });

  it('stop route requires auth + writes AuditEvent + destroys session + clears cookie', () => {
    const src = readFileSync(STOP_ROUTE_PATH, 'utf8');
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
    expect(src).toMatch(/requireAuth\(req\)/);
    expect(src).toMatch(/logAuditEvent\(\s*['"]impersonate_stop['"]/);
    expect(src).toMatch(/destroySession\(/);
    expect(src).toMatch(/res\.cookies\.delete\(SESSION_COOKIE\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Bundle scope verification — dashboard/app.js is loaded directly by
// dashboard.html, NOT bundled into public/crm/index-built.html (which
// is only the search shell, built from index.html). So no rebuild is
// required for this PR — the dashboard picks up the app.js change
// the moment it's served by Vercel. This describe pins that assumption
// so a future build-system change that DID bundle dashboard JS would
// surface and remind a future PR author to also regenerate the shell.
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.6 — bundle scope (dashboard/app.js is not bundled into index-built.html)', () => {
  it('index.html does NOT reference js/dashboard/app.js (so build.js does not inline it)', () => {
    const indexSrc = readFileSync(
      path.resolve(__dirname, '../../public/crm/index.html'),
      'utf8',
    );
    expect(indexSrc).not.toMatch(/<script\s+src=['"]js\/dashboard\/app\.js['"]/);
  });

  it('index-built.html does NOT contain doImpersonate (confirms scope)', () => {
    const src = readFileSync(INDEX_BUILT_PATH, 'utf8');
    expect(src).not.toMatch(/function\s+doImpersonate\(/);
  });

  it('dashboard.html DOES reference js/dashboard/app.js (the live load path)', () => {
    const dashSrc = readFileSync(
      path.resolve(__dirname, '../../public/crm/dashboard.html'),
      'utf8',
    );
    expect(dashSrc).toMatch(/<script\s+[^>]*src=['"][^'"]*js\/dashboard\/app\.js['"]/);
  });
});
