/// <reference types="jest" />
/**
 * MY LISTINGS = WHAT THIS AGENT LISTED, IN EVERY LIVE COTALITY STATUS.
 *
 * ── THE RULE THIS FILE USED TO PIN, AND WHY IT IS GONE ─────────────────────────────────────────
 *
 * Until 2026-09-09 this suite asserted "CRM-created + closed Trestle only": a `trestleClosed` clause
 * that required `mls_id != null` AND a terminal status, on the theory that live listings are managed
 * in REBNY RLS rather than the CRM. The owner overruled it directly:
 *
 *   "every agent should have their own listings, active, contract signed, off mkt... whatever
 *    standard status there is in cotality."
 *
 * and, on seeing 2,395 rows from 146 brokerages under her name, "i do not know where this comes
 * from". `trestleClosed` was replaced by `trestleOwn` in 625f26c5. The suite kept asserting the
 * overruled rule and went red - correctly. It is rewritten here to pin the rule that replaced it.
 *
 * ── THE RULE NOW ───────────────────────────────────────────────────────────────────────────────
 *
 * Three disjuncts, and ownership is LIST-SIDE identity, never `agent_id`:
 *
 *   crmCreated / crmCreatedRental  Mallan-authored rows (mls_id null, SL-/RL- prefix), minus the
 *                                  statuses the CRM hides.
 *   trestleOwn                     provider rows whose list_agent_mls_id or co_list_agent_mls_id is
 *                                  THIS viewer's Cotality member id - in ANY status.
 *
 * `agent_id` is deliberately NOT an ownership test: syncAgentHistory stamps it from buyer-side
 * matches too, so keying on it puts other agents' listings under yours. And with no viewer member id
 * there is no third disjunct at all - the query must fail CLOSED to Mallan-authored rows rather than
 * fall back to something broader.
 */
export {};
import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/crm/listings/route.ts');
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

/** The `where` the route builds, read as source because Prisma clauses are data, not behaviour. */
const clause = (name: string) => {
  const line = routeSource.split('\n').find((l) => l.includes(`const ${name} =`));
  expect({ clause: name, found: Boolean(line) }).toEqual({ clause: name, found: true });
  return line as string;
};

describe('My Listings is scoped to this agent, in every status', () => {
  test('the query is CRM-authored sale OR CRM-authored rental OR this viewer\'s provider listings', () => {
    expect(routeSource).toMatch(/OR:\s*trestleOwn\s*\?\s*\[crmCreated,\s*crmCreatedRental,\s*trestleOwn\]/);
  });

  test('with no viewer member id it falls back to Mallan-authored rows only — never something broader', () => {
    expect(routeSource).toMatch(/\[crmCreated,\s*crmCreatedRental\]\s*,?\s*$/m);
  });

  test('the CRM-authored clauses key on mls_id null + the SL-/RL- prefix, and hide withdrawn/cancelled', () => {
    expect(clause('crmCreated')).toMatch(/mls_id:\s*null.*startsWith:\s*"SL-".*notIn:\s*CRM_HIDDEN/);
    expect(clause('crmCreatedRental')).toMatch(/mls_id:\s*null.*startsWith:\s*"RL-".*notIn:\s*CRM_HIDDEN/);
  });
});

describe('provider-sourced ownership is list-side identity, not agent_id and not a status', () => {
  const trestleOwnBlock = (() => {
    const i = routeSource.indexOf('const trestleOwn');
    expect(i).toBeGreaterThan(-1);
    return routeSource.slice(i, i + 400);
  })();

  test('it matches on the viewer\'s Cotality member id, as list agent or co-list agent', () => {
    expect(trestleOwnBlock).toMatch(/list_agent_mls_id:\s*viewerMlsId/);
    expect(trestleOwnBlock).toMatch(/co_list_agent_mls_id:\s*viewerMlsId/);
  });

  test('it requires a provider row', () => {
    expect(trestleOwnBlock).toMatch(/mls_id:\s*\{\s*not:\s*null\s*\}/);
  });

  test('it does NOT filter by status — an agent sees their own listings in every live Cotality status', () => {
    // This is the whole point of the owner ruling. A status filter here is the old rule returning.
    expect(trestleOwnBlock).not.toMatch(/status:/);
    expect(routeSource).not.toContain('trestleClosed');
    expect(routeSource).not.toContain('TRESTLE_CLOSED');
  });

  test('it does NOT use agent_id, which is not an ownership fact', () => {
    // syncAgentHistory stamps agent_id from buyer-side matches too; keying on it puts other agents'
    // listings under this viewer's name.
    expect(trestleOwnBlock).not.toMatch(/agent_id/);
  });

  test('the viewer member id comes from the signed-in agent, trimmed, and empty means no clause', () => {
    expect(routeSource).toMatch(/viewer\?\.trestle_mls_id\?\.trim\(\)\s*\|\|\s*null/);
    expect(routeSource).toMatch(/const trestleOwn = viewerMlsId/);
  });
});

describe('the hidden-status set is the canonical storage spelling', () => {
  test('CRM_HIDDEN is Withdrawn + Canceled through the canonical mapper', () => {
    const hidden = routeSource.split('\n').find((l) => l.includes('CRM_HIDDEN') && l.includes('storageStatusesFor'));
    expect(hidden).toMatch(/storageStatusesFor\(\["Withdrawn", "Canceled"\]\)/);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { storageStatusesFor } = require('@/lib/listings/mallan-status');
    // "Canceled" carries ONE L — the live Cotality token.
    expect(storageStatusesFor(['Withdrawn', 'Canceled'])).toEqual(expect.arrayContaining(['Withdrawn', 'Canceled']));
  });
});
