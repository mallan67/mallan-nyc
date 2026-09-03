/// <reference types="jest" />
/**
 * BROKERAGE PROFESSIONAL ROLE vs SOFTWARE AUTHORISATION — the boundary.
 *
 * `Agent.role` now names what a person IS in the firm:
 *
 *     BROKER | ASSOCIATE_BROKER | SALESPERSON        (+ legacy "AGENT")
 *
 * ── The silent-403 hazard this file exists to prove against ───────────────
 * Generic Mallan-licensee access was spelled `requireRole(req,"AGENT","BROKER")`
 * inside ONE helper, `requireAgentOrBroker()`, which ~146 route files call.
 * A grep for `role ===` finds none of those callers, because the comparison
 * lives in the helper. Naming the professional roles honestly without fixing
 * that helper would have silently 403'd Claudia, Leda and Julia out of the CRM
 * surface — CMA, deals, tasks, leads, notes, events, alerts, clients, pipeline,
 * documents — with every string-level test still green.
 *
 * ── And the hazard in the FIX ─────────────────────────────────────────────
 * The obvious repair, "accept any `userType === 'agent'` session", was NOT
 * taken alone. Nothing proves every `Agent` row is a licensed professional
 * (`license_type` is nullable, and no column marks a non-licensee), so that
 * would widen ~146 routes to any internal agent-session account. Both the
 * session identity AND an explicit professional-role predicate are required.
 *
 * Cases 4 and 5 below prove nothing was widened. Case 6 proves the security
 * question was answered rather than assumed.
 */

const validateSessionMock = jest.fn();
jest.mock('@/lib/auth/session', () => ({
  __esModule: true,
  SESSION_COOKIE: 'session_token',
  validateSession: validateSessionMock,
}));

import { NextResponse } from 'next/server';
import {
  requireAgentOrBroker,
  requireBroker,
  requireRole,
  isAuthError,
} from '@/lib/auth/middleware';
import {
  listingCapabilities,
  type CapabilityListing,
} from '@/lib/auth/listing-capabilities';
import {
  BROKERAGE_ROLES,
  isLicenseeAccessRole,
  isPrincipalBroker,
  isCanonicalBrokerageRole,
  rejectNonCanonicalBrokerageRole,
} from '@/lib/agents/brokerage-role';

/** The route helpers read `req.cookies.get("session_token")?.value`. */
function reqWithSession(token: string | null = 'tok') {
  return {
    cookies: {
      get: (name: string) =>
        token && name === 'session_token' ? { name, value: token } : undefined,
    },
    headers: { get: () => null },
  } as never;
}

/** The four canonical Mallan identities, as they are actually stored. */
const MAYA = { userId: 1n, userType: 'agent', role: 'BROKER', sessionId: 's1' };
const CLAUDIA = { userId: 42n, userType: 'agent', role: 'ASSOCIATE_BROKER', sessionId: 's2' };
const LEDA = { userId: 43n, userType: 'agent', role: 'SALESPERSON', sessionId: 's3' };
const JULIA = { userId: 44n, userType: 'agent', role: 'SALESPERSON', sessionId: 's4' };
/** An un-migrated row / a session issued before the change. */
const LEGACY_AGENT = { userId: 45n, userType: 'agent', role: 'AGENT', sessionId: 's5' };
/** A client-portal principal. */
const LEAD = { userId: 900n, userType: 'lead', role: 'buyer', sessionId: 's6' };
/**
 * A hypothetical NON-LICENSEE internal account on the agent session path.
 * The schema does not currently model one, which is exactly why access must not
 * rest on `userType === "agent"` alone.
 */
const OFFICE_STAFF = { userId: 500n, userType: 'agent', role: 'OFFICE_STAFF', sessionId: 's7' };

async function licenseeAccess(session: unknown) {
  validateSessionMock.mockResolvedValueOnce(session);
  return requireAgentOrBroker(reqWithSession());
}

async function brokerOnlyAccess(session: unknown) {
  validateSessionMock.mockResolvedValueOnce(session);
  return requireBroker(reqWithSession());
}

const allowed = (r: unknown) => !(r instanceof NextResponse);
const statusOf = (r: unknown) => (r instanceof NextResponse ? r.status : 200);

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
describe('CASE 1-3 — every Mallan licensee keeps ordinary CRM access', () => {
  it('Claudia as ASSOCIATE_BROKER is admitted to the licensee surface', async () => {
    const res = await licenseeAccess(CLAUDIA);
    expect(allowed(res)).toBe(true);
    expect(statusOf(res)).toBe(200);
  });

  it('Leda and Julia as SALESPERSON are admitted to the same surface', async () => {
    for (const s of [LEDA, JULIA]) {
      const res = await licenseeAccess(s);
      expect(allowed(res)).toBe(true);
    }
  });

  it('Maya as BROKER keeps ordinary access AND broker-only access', async () => {
    expect(allowed(await licenseeAccess(MAYA))).toBe(true);
    expect(allowed(await brokerOnlyAccess(MAYA))).toBe(true);
  });

  it('a legacy "AGENT" row and its live session keep working through the transition', async () => {
    expect(allowed(await licenseeAccess(LEGACY_AGENT))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CASE 4 — broker-only authority stays narrow, and was NOT broadened', () => {
  it('an Associate Broker is refused principal-broker routes', async () => {
    const res = await brokerOnlyAccess(CLAUDIA);
    expect(allowed(res)).toBe(false);
    expect(statusOf(res)).toBe(403);
  });

  it('a Salesperson is refused principal-broker routes', async () => {
    for (const s of [LEDA, JULIA]) {
      expect(statusOf(await brokerOnlyAccess(s))).toBe(403);
    }
  });

  it('only BROKER satisfies the principal-broker predicate', () => {
    expect(isPrincipalBroker('BROKER')).toBe(true);
    expect(isPrincipalBroker('broker')).toBe(true);   // mixed casing exists live
    expect(isPrincipalBroker('ASSOCIATE_BROKER')).toBe(false);
    expect(isPrincipalBroker('SALESPERSON')).toBe(false);
    expect(isPrincipalBroker('AGENT')).toBe(false);
    expect(isPrincipalBroker(null)).toBe(false);
  });

  it('the ~146-route helper still refuses what it refused before', async () => {
    // Everything that was denied stays denied; only the two honest
    // professional-role values were added to the allow-list.
    for (const denied of ['', 'buyer', 'tenant', 'seller', 'landlord', 'OFFICE_STAFF', 'ADMIN']) {
      const res = await licenseeAccess({ ...CLAUDIA, role: denied });
      expect(statusOf(res)).toBe(403);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CASE 5 — client/lead sessions never reach the licensee surface', () => {
  it('a lead session is refused', async () => {
    expect(statusOf(await licenseeAccess(LEAD))).toBe(403);
  });

  it('a lead session is refused even if its role string were a professional one', async () => {
    // Defence in depth: the session IDENTITY must be an agent session too.
    expect(statusOf(await licenseeAccess({ ...LEAD, role: 'ASSOCIATE_BROKER' }))).toBe(403);
    expect(statusOf(await licenseeAccess({ ...LEAD, role: 'BROKER' }))).toBe(403);
  });

  it('no session at all is 401, not 403', async () => {
    const res = await requireAgentOrBroker(reqWithSession(null));
    expect(statusOf(res)).toBe(401);
  });

  it('an invalid or expired session is 401', async () => {
    validateSessionMock.mockResolvedValueOnce(null);
    expect(statusOf(await requireAgentOrBroker(reqWithSession()))).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CASE 6 — the fix did not widen access to every agent-type session', () => {
  it('an agent session with a NON-licensee role gains nothing', async () => {
    // This is the security question. `userType === "agent"` alone would have
    // admitted this account to ~146 CRM routes.
    const res = await licenseeAccess(OFFICE_STAFF);
    expect(allowed(res)).toBe(false);
    expect(statusOf(res)).toBe(403);
  });

  it('an agent session with an empty or missing role gains nothing', async () => {
    for (const role of ['', null, undefined, '   ']) {
      expect(statusOf(await licenseeAccess({ ...OFFICE_STAFF, role }))).toBe(403);
    }
  });

  it('the eligibility predicate answers ACCESS only — it names no licence class', () => {
    expect(isLicenseeAccessRole('ASSOCIATE_BROKER')).toBe(true);
    expect(isLicenseeAccessRole('SALESPERSON')).toBe(true);
    expect(isLicenseeAccessRole('BROKER')).toBe(true);
    expect(isLicenseeAccessRole('AGENT')).toBe(true);      // legacy tolerance
    expect(isLicenseeAccessRole('OFFICE_STAFF')).toBe(false);
    expect(isLicenseeAccessRole(null)).toBe(false);
    // and no CODE in the module converts a role into a licence class. The
    // prose names the other concept deliberately; prose must not be able to
    // satisfy - or break - a code assertion.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/agents/brokerage-role.ts'), 'utf8',
    ) as string;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '')
      .split(String.fromCharCode(10)).filter((l) => !/^\s*\/\//.test(l))
      .join(String.fromCharCode(10));
    expect(code).not.toContain('license_type');
    expect(code).not.toContain('associate_broker');   // the licence-class token
    expect(code).not.toContain('salesperson');        // ditto, lower case
    expect(code).not.toContain('professional-title'); // no import of the other concept
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CASE 7 — listing capabilities follow eligibility, not a literal role', () => {
  const LOCAL: CapabilityListing = {
    listing_id: 'SL-0004',
    rls_eligible: false,
    list_office_mls_id: null,
    agent_id: 42n,
    last_synced_from_trestle: null,
  };
  const THIRD_PARTY: CapabilityListing = {
    listing_id: 'RLS20105333',
    rls_eligible: true,
    list_office_mls_id: '9999',
    agent_id: 42n,
    last_synced_from_trestle: new Date('2026-08-01T00:00:00Z'),
  };

  it('Claudia keeps her assigned local-listing workflow as ASSOCIATE_BROKER', () => {
    const c = listingCapabilities({ userId: 42n, role: 'ASSOCIATE_BROKER' }, LOCAL);
    expect(c.mayManageMallanLocalListing).toBe(true);
  });

  it('Claudia keeps the STAFF capability as ASSOCIATE_BROKER', () => {
    // `isStaff` was `isBroker || role === 'AGENT'` and gates
    // mayScheduleClientShowing, so it collapsed to false the moment the column
    // named professions honestly. Proven on a row she is NOT associated with,
    // so the association path cannot mask the regression.
    for (const role of ['ASSOCIATE_BROKER', 'SALESPERSON', 'BROKER', 'AGENT']) {
      expect(listingCapabilities({ userId: 999n, role }, THIRD_PARTY).mayScheduleClientShowing)
        .toBe(true);
    }
  });

  it('a SALESPERSON assigned to the same local row keeps it too', () => {
    const c = listingCapabilities({ userId: 42n, role: 'SALESPERSON' }, LOCAL);
    expect(c.mayManageMallanLocalListing).toBe(true);
  });

  it('the legacy AGENT value behaves identically — no transition regression', () => {
    const legacy = listingCapabilities({ userId: 42n, role: 'AGENT' }, LOCAL);
    const corrected = listingCapabilities({ userId: 42n, role: 'ASSOCIATE_BROKER' }, LOCAL);
    expect(corrected).toEqual(legacy);
  });

  it('a non-licensee role gets NO staff capability and no unassociated authority', () => {
    // NOTE the pre-existing rule this does NOT change: local-listing management
    // is (principal broker OR the row's own recorded assignment), so an
    // ASSIGNED actor keeps it whatever their role. That association path is
    // untouched here and is called out rather than quietly altered.
    const c = listingCapabilities({ userId: 999n, role: 'OFFICE_STAFF' }, LOCAL);
    expect(c.mayScheduleClientShowing).toBe(false);
    expect(c.mayManageMallanLocalListing).toBe(false);
  });

  it('nobody, of any role, gains mutation authority over source-owned inventory', () => {
    for (const role of ['BROKER', 'ASSOCIATE_BROKER', 'SALESPERSON', 'AGENT']) {
      const c = listingCapabilities({ userId: 42n, role }, THIRD_PARTY);
      expect(c.mayManageMallanLocalListing).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the WRITE boundary for the brokerage role', () => {
  it('accepts only the three canonical professional roles', () => {
    expect([...BROKERAGE_ROLES]).toEqual(['BROKER', 'ASSOCIATE_BROKER', 'SALESPERSON']);
    for (const good of BROKERAGE_ROLES) {
      expect(isCanonicalBrokerageRole(good)).toBe(true);
      expect(rejectNonCanonicalBrokerageRole(good)).toBeNull();
    }
  });

  it('refuses the legacy value on WRITE while tolerating it on READ', () => {
    expect(isLicenseeAccessRole('AGENT')).toBe(true);          // read
    expect(rejectNonCanonicalBrokerageRole('AGENT')).toContain('must be one of'); // write
  });

  it('refuses free text, licence classes and permissions alike', () => {
    for (const bad of ['agent', 'Associate Broker', 'associate_broker', 'salesperson', 'admin', 'ADMIN']) {
      // (`agent`/`associate_broker`/`salesperson` are licence-class or legacy
      // tokens — a licence class is not a brokerage role.)
      if (isCanonicalBrokerageRole(bad)) continue;
      expect(rejectNonCanonicalBrokerageRole(bad)).not.toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the shared boundary is genuinely shared', () => {
  const { readdirSync, readFileSync } = require('fs') as typeof import('fs');
  const { resolve, sep } = require('path') as typeof import('path');
  const ROOT = resolve(__dirname, '../..');

  /** Statically inventory the callers rather than exercising all of them. */
  function routeFiles(): string[] {
    return (readdirSync(resolve(ROOT, 'app/api'), { recursive: true } as never) as unknown as string[])
      .map((f) => String(f).split(sep).join('/'))
      .filter((f) => f.endsWith('route.ts'));
  }

  it('every licensee route goes through the ONE helper — none re-implements the check', () => {
    const files = routeFiles();
    const callers = files.filter((f) =>
      readFileSync(resolve(ROOT, 'app/api', f), 'utf8').includes('requireAgentOrBroker'));
    expect(callers.length).toBeGreaterThan(100);

    // No route may spell generic licensee access out for itself. That is what
    // made the original comparison invisible to a grep in the first place.
    for (const f of files) {
      const src = readFileSync(resolve(ROOT, 'app/api', f), 'utf8');
      expect(src).not.toContain('requireRole(req, "AGENT"');
      expect(src).not.toContain("requireRole(req, 'AGENT'");
    }
  });

  it('the helper itself no longer matches the retired literal role pair', () => {
    const src = readFileSync(resolve(ROOT, 'lib/auth/middleware.ts'), 'utf8');
    const live = src.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(live).not.toContain('requireRole(req, "AGENT", "BROKER")');
    expect(live).toContain('isLicenseeAccessRole');
    expect(live).toContain('result.userType !== "agent"');
  });

  it('requireRole and requireBroker are untouched, so broker-only gates are unchanged', async () => {
    validateSessionMock.mockResolvedValueOnce(MAYA);
    expect(allowed(await requireRole(reqWithSession(), 'BROKER'))).toBe(true);
    validateSessionMock.mockResolvedValueOnce(CLAUDIA);
    expect(statusOf(await requireRole(reqWithSession(), 'BROKER'))).toBe(403);
  });

  it('isAuthError still discriminates the two return shapes', async () => {
    validateSessionMock.mockResolvedValueOnce(LEAD);
    const denied = await requireAgentOrBroker(reqWithSession());
    expect(isAuthError(denied)).toBe(true);
    validateSessionMock.mockResolvedValueOnce(CLAUDIA);
    const ok = await requireAgentOrBroker(reqWithSession());
    expect(isAuthError(ok)).toBe(false);
  });
});
