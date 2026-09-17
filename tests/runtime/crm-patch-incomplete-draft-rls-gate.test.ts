/// <reference types="jest" />
/**
 * PATCH /api/crm/listings/[id] — the RLS 48-field enforcement gate keys on the
 * PERSISTED `listing.status` column only.
 *
 * Why persisted-only: the PATCH route does NOT write the `status` column
 * (transitions go through /status). So neither `body.MlsStatus` (request
 * payload) nor `raw_data.MlsStatus` (which the status route leaves stale) is
 * authoritative for this gate. Using either lets a request — or a stale raw
 * value — make an actually Active/ActiveUnderContract listing look draft-like
 * and bypass the 48-field check while the row stays publicly displayable
 * (fail-OPEN). Codex P1 ×2 on #358 (stale-raw, then request-downgrade).
 *
 * Gate contract (fail-closed):
 *   - Skip enforcement ONLY when the persisted `listing.status` normalizes to a
 *     draft-like value: "Draft", "Incomplete", or empty/null/undefined (→ the
 *     "Draft" default). Casing/whitespace variants normalize first (Codex P2).
 *   - Enforce for every other persisted status: Active, ComingSoon,
 *     ActiveUnderContract, Pending, terminal.
 *   - `body.MlsStatus` is payload data, not a status transition — it does NOT
 *     affect the gate decision.
 *
 * BEHAVIORAL tests: invoke the real PATCH handler with mocked prisma/auth; the
 * real classifyRlsEligibility + assertRlsCompliantPayload run, so the gate's
 * 422 (or skip) is observed, not asserted structurally. Status is driven by the
 * fixture's `listing.status` column (`withStatus(...)`), never by the body.
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
  buildListingUrls: () => ({ publicUrl: '/listing/x', rebnyListingUrl: 'https://www.mallan.nyc/listing/x' }),
}));

// An RLS-eligible (pure residential) listing that already exists on RLS
// (mls_id present → NOT CRM-created → the gate's `!isCrmCreated` is true).
//
// FIXTURE CORRECTED 2026-08-09. This was `listing_id: 'RLS-INCDRAFT-1'` with
// `agent_id: null` — a THIRD-PARTY synced Cotality row. PATCH now refuses
// source-owned rows outright (CHARTER Section 1A, lib/auth/listing-capabilities),
// so that fixture could no longer reach the RLS gate at all: these cases would
// have been asserting a 403 rather than the gate contract.
//
// The gate contract is unchanged and is exactly what these tests exist to pin —
// enforcement keys on the PERSISTED `status` column only. The fixture is now a
// Mallan-authored LOCAL row (`SL-` prefix) that still satisfies every gate
// precondition: `rls_eligible: true` and `mls_id` present, so
// `effectiveRlsEligible && !isCrmCreated` both hold as before. Only the row's
// admissibility changed; the gate's inputs did not.
function eligibleListing() {
  return {
    id: 101n,
    listing_id: 'SL-INCDRAFT-1',
    mls_id: 'RLS12345',
    status: 'Incomplete',
    rls_eligible: true,
    listing_type: 'rent',
    agent_id: null,
    list_office_mls_id: null,
    last_synced_from_trestle: null,
    raw_data: {} as Record<string, unknown>,
    address: {},
    features: {},
    agent_info: {},
    internet_address_display_yn: false,
  };
}

// Override the fixture for a single test — primarily the persisted `status`
// column (the gate's authoritative input), plus optional raw_data.
function withFixture(overrides: Record<string, unknown>) {
  const listing = prismaMock as { listing: { findUnique: jest.Mock } };
  listing.listing.findUnique = jest.fn(async () => ({ ...eligibleListing(), ...overrides }));
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

describe('PATCH RLS enforcement gate · keyed on persisted listing.status', () => {
  // ── ENFORCED: persisted non-draft-like statuses ──────────────────────────

  // GUARD / fixture validity: a persisted Active listing with a minimal payload
  // MUST be blocked by the 48-field enforcement — proves the fixture is
  // RLS-eligible and the gate fires (so the skip tests are not vacuous).
  it('persisted Active IS enforced (422)', async () => {
    withFixture({ status: 'Active' });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/RLS enforcement/i);
  });

  // ActiveUnderContract is publicly displayable (DISPLAYABLE_STATUSES) and MUST
  // remain gated (must NOT use the FARE Active/ComingSoon-only helper).
  it('persisted ActiveUnderContract IS enforced (422)', async () => {
    withFixture({ status: 'ActiveUnderContract' });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).toBe(422);
  });

  it('persisted Pending IS enforced (422)', async () => {
    withFixture({ status: 'Pending' });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).toBe(422);
  });

  // ── SKIPPED: persisted draft-like statuses ───────────────────────────────

  it('persisted Draft is NOT gated', async () => {
    withFixture({ status: 'Draft' });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  it('persisted Incomplete is NOT gated', async () => {
    withFixture({ status: 'Incomplete' });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  it('persisted empty/null status is NOT gated (folds to Draft default)', async () => {
    withFixture({ status: null });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  // Casing / whitespace variants of a persisted draft status normalize to
  // canonical Draft/Incomplete and are not gated (Codex P2).
  it.each([
    ['lowercase incomplete', 'incomplete'],
    ['Incomplete with trailing space', 'Incomplete '],
    ['padded uppercase DRAFT', ' DRAFT '],
  ])('persisted %s normalizes to draft-like and is NOT gated', async (_label, status) => {
    withFixture({ status });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });

  // Normalization does NOT relax enforcement: a casing variant of a displayable
  // status folds to canonical ActiveUnderContract (non-draft-like) → enforced.
  it('persisted "activeundercontract" normalizes and IS enforced (422)', async () => {
    withFixture({ status: 'activeundercontract' });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).toBe(422);
  });

  // ── FAIL-OPEN guards: request/raw cannot override the persisted status ────

  // Codex P1 (stale-raw): the status route leaves raw_data.MlsStatus stale on
  // activation. A persisted-Active listing with raw_data.MlsStatus="Incomplete"
  // and a PATCH that omits MlsStatus MUST still enforce — the gate reads the
  // persisted column, not raw_data. (Failed when the gate read merged.MlsStatus.)
  it('FAIL-OPEN(stale-raw): persisted Active + stale raw_data Incomplete + no body MlsStatus IS enforced (422)', async () => {
    withFixture({ status: 'Active', raw_data: { MlsStatus: 'Incomplete' } });
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/RLS enforcement/i);
  });

  // Codex P1 (request-downgrade): the PATCH route does not write the status
  // column, so a body MlsStatus="Incomplete" on a persisted-Active listing must
  // NOT downgrade the gate. MUST still enforce. (Failed when the gate read
  // body.MlsStatus.)
  it('FAIL-OPEN(downgrade): persisted Active + body MlsStatus="Incomplete" IS enforced (422)', async () => {
    withFixture({ status: 'Active' });
    const res = await callPatch({ MlsStatus: 'Incomplete', PropertyType: 'Residential' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/RLS enforcement/i);
  });

  // Symmetric: body.MlsStatus is irrelevant to the gate — a persisted draft is
  // skipped regardless of a body MlsStatus="Active" claim.
  it('body MlsStatus does not affect the gate: persisted Incomplete + body Active is NOT gated', async () => {
    withFixture({ status: 'Incomplete' });
    const res = await callPatch({ MlsStatus: 'Active', PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
  });
});
