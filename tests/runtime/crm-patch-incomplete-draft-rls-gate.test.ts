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
 * The gate is a COMPLIANCE gate (fail-closed): it must enforce the 48 RLS
 * fields for EVERY non-draft status — Active, ComingSoon, ActiveUnderContract,
 * Pending, and terminal — and skip ONLY draft-like states (Draft / Incomplete /
 * empty). Draft-like ≡ `Draft`, `Incomplete`, or empty/null/undefined.
 *
 * NOTE: the gate must NOT reuse the FARE-specific `isDisplayReadyStatus`
 * (Active/ComingSoon only) — that under-enforces `ActiveUnderContract`, which is
 * publicly displayable (`DISPLAYABLE_STATUSES`), a fail-OPEN regression (Codex
 * P1 on #358). This suite pins the broader fail-closed set.
 *
 * Test plan:
 *   - GUARD (fixture validity): MlsStatus:"Active" MUST 422 (proves the fixture
 *     is RLS-eligible and the gate fires — bug test not vacuous).
 *   - GUARD (Codex P1): MlsStatus:"ActiveUnderContract" MUST 422 — publicly
 *     displayable, must remain gated. Fails on the isDisplayReadyStatus gate.
 *   - BUG: MlsStatus:"Incomplete" MUST NOT 422 (draft-like).
 *   - DRAFT-LIKE: empty MlsStatus with an existing non-display-ready listing
 *     status MUST NOT 422.
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

  // GUARD (Codex P1 on #358): ActiveUnderContract is publicly displayable
  // (DISPLAYABLE_STATUSES) and MUST remain RLS-gated. The narrow FARE helper
  // isDisplayReadyStatus() returns false for it → would skip enforcement
  // (fail-open). This case fails on the isDisplayReadyStatus gate and passes
  // once the gate treats only Draft/Incomplete/empty as draft-like.
  it('GUARD (Codex P1): ActiveUnderContract save IS enforced (422)', async () => {
    const res = await callPatch({ MlsStatus: 'ActiveUnderContract', PropertyType: 'Residential' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/RLS enforcement/i);
  });

  // BUG: an Incomplete (CRM draft) save on the SAME eligible fixture must NOT
  // be blocked by the RLS enforcement gate.
  it('BUG: Incomplete draft save is NOT blocked by RLS enforcement', async () => {
    const res = await callPatch({ MlsStatus: 'Incomplete', PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  // DRAFT-LIKE: a listing with no persisted status and a PATCH that does not set
  // MlsStatus resolves to the "Draft" default → draft-like → not gated.
  it('DRAFT-LIKE: empty/absent status is NOT blocked by RLS enforcement', async () => {
    const listing = prismaMock as { listing: { findUnique: jest.Mock } };
    listing.listing.findUnique = jest.fn(async () => ({ ...eligibleListing(), status: null }));
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  // NORMALIZE (Codex P2 on #358): a draft marker with different casing or
  // surrounding whitespace must still be treated as draft-like — otherwise a
  // legitimate draft save 422s on a casing quirk. The gate must normalize the
  // status (repo convention: normalizeStandardStatus folds case + trims) before
  // the draft-like comparison. These fail on the raw `=== "Incomplete"`/"Draft"
  // compare and pass once the gate normalizes first.
  it.each([
    ['lowercase incomplete', 'incomplete'],
    ['Incomplete with trailing space', 'Incomplete '],
    ['padded uppercase DRAFT', ' DRAFT '],
  ])('NORMALIZE: %s is NOT blocked by RLS enforcement', async (_label, status) => {
    const res = await callPatch({ MlsStatus: status, PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  // FAIL-CLOSED still holds after normalization: a casing variant of a
  // displayable status must remain enforced (normalize folds it to canonical
  // ActiveUnderContract, which is NOT draft-like).
  it('NORMALIZE does not relax enforcement: "activeundercontract" IS enforced (422)', async () => {
    const res = await callPatch({ MlsStatus: 'activeundercontract', PropertyType: 'Residential' });
    expect(res.status).toBe(422);
  });

  // STALE-RAW (Codex P1 on #358 dd01538b): the authoritative status is the
  // `status` COLUMN. The status route flips that column on activation but does
  // NOT keep raw_data.MlsStatus in sync, so an activated listing can carry a
  // stale `raw_data.MlsStatus = "Incomplete"`. A PATCH that OMITS MlsStatus must
  // decide the gate from the persisted column (Active → enforce), NOT from the
  // stale raw value. Reading `merged.MlsStatus` (which falls back to raw_data)
  // skips enforcement on a publicly displayable Active listing — fail-OPEN. The
  // gate must use `body.MlsStatus || listing.status`.
  it('STALE-RAW: Active column + stale raw_data Incomplete + PATCH without MlsStatus IS enforced (422)', async () => {
    const listing = prismaMock as { listing: { findUnique: jest.Mock } };
    listing.listing.findUnique = jest.fn(async () => ({
      ...eligibleListing(),
      status: 'Active',
      raw_data: { MlsStatus: 'Incomplete' },
    }));
    const res = await callPatch({ PropertyType: 'Residential' }); // no MlsStatus override
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/RLS enforcement/i);
  });

  // Counterpart: an explicit body MlsStatus override still wins — a genuine
  // draft save (body says Incomplete) is allowed even if the column is Active.
  it('STALE-RAW counterpart: explicit body MlsStatus="Incomplete" override is NOT gated', async () => {
    const listing = prismaMock as { listing: { findUnique: jest.Mock } };
    listing.listing.findUnique = jest.fn(async () => ({
      ...eligibleListing(),
      status: 'Active',
      raw_data: { MlsStatus: 'Active' },
    }));
    const res = await callPatch({ MlsStatus: 'Incomplete', PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });
});
