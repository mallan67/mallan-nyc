/// <reference types="jest" />
/**
 * PR-CRM.2 (2026-05-24) — Fair Housing scan at listing-send time.
 *
 * Closes the gap from the 2026-05-24 CRM Backbone Audit §8 finding #1:
 * the listing-sends route was sending agent-composed `note` (and any
 * future cover_note/caption field) to clients WITHOUT scanning for
 * protected-class language. Listing fields are already scanned at
 * listing-write time via assertRlsCompliantPayload; this closes the
 * send-time gap.
 *
 * Behavioral assertions (NOT just source-pins):
 *   1. Prohibited protected-class language in `cover_note` → 422
 *   2. Prohibited language in `caption`                   → 422
 *   3. Prohibited language in `note`                      → 422
 *   4. On 422, sendEmail is NEVER called
 *   5. On 422, no auditEvent.create / clientListingAction.upsert /
 *      followUpTask.create is invoked (zero DB side effects)
 *   6. Clean `note` still sends (201 + sendEmail called)
 *   7. Empty/null `note` still sends
 *   8. Pre-existing REBNY distribution gate still applies (and fires
 *      BEFORE the Fair Housing gate when both would fire — REBNY 400
 *      wins because the listing-source check is upstream)
 *
 * Strategy: mock prisma + auth + sendgrid + templates + tracking-token,
 * invoke the route handler directly with a mock NextRequest, and assert
 * the response code + mock call counts. Same pattern as
 * tests/runtime/inquiry-effect.test.ts but with explicit jest.fn seeds
 * (the helpers' default seed shape doesn't cover findUnique returns).
 */

import { buildPrismaMock, makeRequest, readJson } from './helpers';

// ── Seeded jest.fn mocks for prisma methods the route reads ────────────
const cleanListing = {
  id: 7n,
  listing_id: 'LIST-001',
  address: { full: '123 Main St, Apt 4B, New York, NY' },
  list_price: 1500000,
  bedrooms_total: 2,
  bathrooms_full: 2,
  living_area: 1100,
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Condo',
  media: [{ url: 'https://example.com/photo.jpg' }],
  // REBNY distribution gates — clean by default
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
};

const listingFindUnique = jest.fn(async () => cleanListing);
const agentFindUnique = jest.fn(async () => ({
  first_name: 'Maya',
  last_name: 'Allan',
  email: 'maya@mallan.nyc',
}));
const leadFindMany = jest.fn(async () => [
  { id: 99n, first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com' },
]);
const leadFindUnique = jest.fn(async () => ({
  first_name: 'Jane',
  last_name: 'Buyer',
}));
const auditEventCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 100n,
  created_at: new Date(),
  ...args.data,
}));
const clientListingActionUpsert = jest.fn(async (args: { create: Record<string, unknown> }) => ({
  id: 200n,
  ...args.create,
}));
const followUpTaskCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 300n,
  ...args.data,
}));
const auditEventFindFirst = jest.fn(async () => null); // no idempotency dup

const { prisma: prismaMock } = buildPrismaMock({
  listing: { findUnique: listingFindUnique },
  agent: { findUnique: agentFindUnique },
  lead: { findMany: leadFindMany, findUnique: leadFindUnique },
  auditEvent: { create: auditEventCreate, findFirst: auditEventFindFirst },
  clientListingAction: { upsert: clientListingActionUpsert },
  followUpTask: { create: followUpTaskCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// ── Auth + readonly-guard mocks ────────────────────────────────────────
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({
    userId: 'agent-1',
    userType: 'agent',
    role: 'AGENT',
  })),
  isAuthError: () => false,
}));

// ── Email + template + tracking mocks ──────────────────────────────────
const sendEmailMock = jest.fn(async () => ({ success: true }));
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: sendEmailMock,
}));
jest.mock('@/lib/email/templates', () => ({
  __esModule: true,
  listingSendEmail: () => '<html>fake email body</html>',
}));
jest.mock('@/lib/sanitize', () => ({
  __esModule: true,
  escapeHtml: (s: string) => s,
}));
jest.mock('@/lib/tracking/listing-token', () => ({
  __esModule: true,
  generateTrackingToken: () => 'tok_test',
}));
jest.mock('@/lib/crm/access', () => ({
  __esModule: true,
  assertLeadIdsAccess: jest.fn(async () => ({ response: null })),
}));

// Import AFTER mocks so the route picks them up.
import { POST } from '@/app/api/crm/listing-sends/route';

function clearAllMocks() {
  sendEmailMock.mockClear();
  listingFindUnique.mockClear();
  listingFindUnique.mockImplementation(async () => cleanListing);
  agentFindUnique.mockClear();
  leadFindMany.mockClear();
  leadFindUnique.mockClear();
  auditEventCreate.mockClear();
  clientListingActionUpsert.mockClear();
  followUpTaskCreate.mockClear();
  auditEventFindFirst.mockClear();
}

describe('POST /api/crm/listing-sends — Fair Housing scan gate (PR-CRM.2)', () => {
  beforeEach(() => clearAllMocks());

  it('blocks with 422 when cover_note contains protected-class language', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        cover_note: 'This unit is perfect for a Christian family.',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{
      error: string;
      fair_housing_violations: Array<{ field: string; severity: string }>;
    }>(res);
    expect(json.error).toMatch(/Fair Housing/i);
    expect(json.fair_housing_violations.length).toBeGreaterThan(0);
    expect(json.fair_housing_violations.some((v) => v.field === 'cover_note')).toBe(true);
    // No leak of the matched term back to the caller — only field + severity.
    expect((json.fair_housing_violations[0] as Record<string, unknown>).message).toBeUndefined();
  });

  it('blocks with 422 when caption contains protected-class language', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        caption: 'Great place for a young couple with no children.',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{
      fair_housing_violations: Array<{ field: string }>;
    }>(res);
    expect(json.fair_housing_violations.some((v) => v.field === 'caption')).toBe(true);
  });

  it('blocks with 422 when note contains protected-class language', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        note: 'No children allowed in this building.',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{
      fair_housing_violations: Array<{ field: string }>;
    }>(res);
    expect(json.fair_housing_violations.some((v) => v.field === 'note')).toBe(true);
  });

  it('does NOT call sendEmail when Fair Housing scan blocks the send', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        cover_note: 'Perfect for a Christian family — quiet religious community.',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does NOT touch DB side-effect tables when Fair Housing scan blocks', async () => {
    // No audit_events / ClientListingAction / FollowUpTask rows on block.
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        note: 'No children, no Section 8.',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(auditEventCreate).not.toHaveBeenCalled();
    expect(clientListingActionUpsert).not.toHaveBeenCalled();
    expect(followUpTaskCreate).not.toHaveBeenCalled();
  });

  it('clean note passes the Fair Housing gate and reaches sendEmail', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        note: 'Thought you might like this one — let me know your thoughts.',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('empty/missing note still sends (gate is a guard, not a requirement)', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-001',
        client_ids: ['99'],
        // No note / cover_note / caption fields at all.
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('REBNY distribution gate still fires (and wins over FH when listing is ineligible)', async () => {
    // Mark listing REBNY-ineligible. The REBNY gate runs BEFORE the new
    // Fair Housing gate by design (listing-source check is upstream of
    // agent-text check). So even with prohibited language in the note,
    // REBNY 400 fires first, not FH 422.
    listingFindUnique.mockResolvedValueOnce({
      ...cleanListing,
      listing_id: 'LIST-002',
      idx_display_yn: false, // ← REBNY-ineligible
    });
    const req = makeRequest({
      method: 'POST',
      body: {
        listing_id: 'LIST-002',
        client_ids: ['99'],
        note: 'No children allowed.', // would also fail FH, but REBNY 400 fires first
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/REBNY RLS/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/listing-sends — Fair Housing scanner integration (source pins)', () => {
  // Belt-and-suspenders source pins: confirm the route imports the canonical
  // scanner from lib/compliance/rls-enforcement (no rolled-its-own), uses the
  // right HTTP code, and runs BEFORE the side-effect transaction.
  const ROUTE_PATH = require('path').resolve(
    __dirname,
    '../../app/api/crm/listing-sends/route.ts',
  );

  it('imports scanRecordForFairHousing from lib/compliance/rls-enforcement', () => {
    const src = require('fs').readFileSync(ROUTE_PATH, 'utf8');
    expect(src).toMatch(
      /import\s*\{\s*scanRecordForFairHousing\s*\}\s*from\s*['"]@\/lib\/compliance\/rls-enforcement['"]/,
    );
  });

  it('returns HTTP 422 on Fair Housing violations (not 400/500)', () => {
    const src = require('fs').readFileSync(ROUTE_PATH, 'utf8');
    expect(src).toMatch(/scanRecordForFairHousing\(fhRecord\)/);
    // The FH violation branch must use status 422.
    const fhBlock = src.match(/fhViolations\.length\s*>\s*0[\s\S]*?status:\s*(\d+)/);
    expect(fhBlock).not.toBeNull();
    expect(fhBlock![1]).toBe('422');
  });

  it('Fair Housing gate runs BEFORE the prisma.$transaction (no side effects on block)', () => {
    const src = require('fs').readFileSync(ROUTE_PATH, 'utf8');
    const fhIdx = src.indexOf('scanRecordForFairHousing(fhRecord)');
    const txIdx = src.indexOf('prisma.$transaction');
    expect(fhIdx).toBeGreaterThan(0);
    expect(txIdx).toBeGreaterThan(0);
    expect(fhIdx).toBeLessThan(txIdx);
  });
});
