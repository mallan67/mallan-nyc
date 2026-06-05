/// <reference types="jest" />
/**
 * PATCH /api/crm/listings/[id] — RLS enforcement gate must not block draft
 * saves whose status is the CRM draft marker `MlsStatus:"Incomplete"`.
 *
 * Background (same class as Codex #348/#350, different gate): the CRM form
 * saves drafts as RESO `MlsStatus:"Incomplete"` — non-`"Draft"` but NOT
 * display-ready. The FARE fee gate was fixed in #350 to key on
 * `isDisplayReadyStatus(...)` for exactly this reason. But the RLS 48-field
 * enforcement gate still used `!isDraft` with a literal `=== "Draft"` check,
 * so an Incomplete draft save of an RLS-eligible existing listing (with an
 * `mls_id`) would FIRE the 48-field enforcement and return 422 — blocking a
 * legitimate draft save.
 *
 * These are BEHAVIORAL tests (invoke the real PATCH handler with mocked
 * prisma/auth). The real `classifyRlsEligibility` + `assertRlsCompliantPayload`
 * run, so the gate's 422 (or skip) is observed, not asserted structurally.
 *
 * Test plan:
 *   - GUARD (fixture validity): MlsStatus:"Active" on the same eligible
 *     fixture with a minimal payload MUST 422 (display-ready → enforce). This
 *     proves the fixture is RLS-eligible and the gate fires — so the bug test
 *     below is not vacuous, and it pins that the fix does NOT over-skip.
 *   - BUG: MlsStatus:"Incomplete" on the same fixture MUST NOT 422. Fails on
 *     the pre-fix `!isDraft` gate (returns 422); passes once the gate keys on
 *     display-ready status.
 */

import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

const requireAgentOrBrokerMock: jest.Mock = jest.fn();
const isAuthErrorMock: jest.Mock = jest.fn();
const logAuditEventMock: jest.Mock = jest.fn();

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> =>
    requireAgentOrBrokerMock(req),
  isAuthError: (v: unknown): boolean => Boolean(isAuthErrorMock(v)),
  logAuditEvent: (...args: unknown[]): Promise<void> => logAuditEventMock(...args),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

// Isolate the test to the gate decision: stub the success-path side effects.
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: async () => undefined,
}));
jest.mock('@/lib/crm/listing-urls', () => ({
  __esModule: true,
  buildListingUrls: () => ({ publicUrl: '/listing/x', realPlusUrl: 'https://realplus/x' }),
}));

// An RLS-eligible (pure residential) rental that already exists on RLS
// (mls_id present → NOT CRM-created → the gate's `!isCrmCreated` is true).
function eligibleListing() {
  return {
    id: 101n,
    listing_id: 'RLS-INCDRAFT-1',
    mls_id: 'RLS12345',
    status: 'Incomplete',
    rls_eligible: true,
    listing_type: 'rent',
    agent_id: null,
    raw_data: {},
    address: {},
    features: {},
    agent_info: {},
    internet_address_display_yn: false,
  };
}

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/crm/listings/101', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPatch(body: unknown, id = '101'): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(patchReq(body), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  requireAgentOrBrokerMock.mockReset();
  isAuthErrorMock.mockReset();
  logAuditEventMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue({
    role: 'BROKER',
    userId: 7n,
    userType: 'agent',
    sessionId: 'test',
  });
  isAuthErrorMock.mockReturnValue(false);
  logAuditEventMock.mockResolvedValue(undefined);
  const listing = prismaMock as { listing: { findUnique: jest.Mock; update: jest.Mock } };
  listing.listing.findUnique = jest.fn(async () => eligibleListing());
  listing.listing.update = jest.fn(async () => ({ ...eligibleListing(), status: 'Active' }));
});

describe('PATCH RLS enforcement gate · Incomplete draft saves', () => {
  // GUARD / fixture-validity: a display-ready (Active) save with a minimal
  // payload MUST be blocked by the 48-field enforcement. If this is NOT 422,
  // the fixture is not actually RLS-eligible (or the gate is not firing) and
  // the bug test below would be vacuous.
  it('GUARD: Active save on an RLS-eligible listing IS enforced (422)', async () => {
    const res = await callPatch({ MlsStatus: 'Active', PropertyType: 'Residential' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/RLS enforcement/i);
  });

  // BUG: an Incomplete (CRM draft) save on the SAME eligible fixture must NOT
  // be blocked by the RLS enforcement gate. Pre-fix this returns 422.
  it('BUG: Incomplete draft save is NOT blocked by RLS enforcement', async () => {
    const res = await callPatch({ MlsStatus: 'Incomplete', PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });
});
