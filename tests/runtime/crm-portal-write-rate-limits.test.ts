/// <reference types="jest" />
/**
 * PR-CRM.5 (2026-05-24) — Portal-write rate limit on 17 authenticated POST routes.
 *
 * Closes the 2026-05-24 CRM Backbone Audit §6 finding: 17 portal POST
 * routes had no rate limit, allowing authenticated buyer/seller/tenant/
 * landlord users to spam broker inboxes, comments, showing requests,
 * reactions, offers, signals, and email-triggering flows. NY SHIELD Act
 * + UCBA 2026 abuse-control concern.
 *
 * Fix:
 *   - Added `portal_write: { count: 30, window: "3600 s" }` to the
 *     existing limiterSpecs in lib/middleware/rate-limiter.ts.
 *   - Added `checkPortalWriteRateLimit(userId)` convenience helper
 *     that keys by AUTHENTICATED USER (`user:<userId>`), NOT IP.
 *     Returns null when allowed, a 429 NextResponse when limited.
 *   - Wired all 17 portal POST routes (after auth gate, before any
 *     DB write / email send).
 *
 * Strategy: source-pin for coverage across all 17 routes + the
 * limiter contract, PLUS a runtime mock test on one representative
 * route to prove the under-limit / over-limit / 429-no-side-effects
 * behavior end-to-end.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import type { NextRequest } from 'next/server';

// ── All 17 portal POST routes that must enforce portal_write ────────────
const PORTAL_POST_ROUTES = [
  'app/api/portal/complete-profile/route.ts',
  'app/api/portal/external-listings/route.ts',
  'app/api/portal/external-listings/[id]/comments/route.ts',
  'app/api/portal/family/invite/route.ts',
  'app/api/portal/landlord/signals/route.ts',
  'app/api/portal/listings/request/route.ts',
  'app/api/portal/listings/[id]/comments/route.ts',
  'app/api/portal/listings/[id]/react/route.ts',
  'app/api/portal/messages/route.ts',
  'app/api/portal/offers/route.ts',
  'app/api/portal/open-houses/route.ts',
  'app/api/portal/open-houses/rsvp/route.ts',
  'app/api/portal/seller/signals/route.ts',
  'app/api/portal/showings/feedback/route.ts',
  'app/api/portal/showings/route.ts',
  'app/api/portal/tenant/renewal/route.ts',
  'app/api/portal/tenant/signals/route.ts',
];

const RATE_LIMITER_PATH = path.resolve(__dirname, '../../lib/middleware/rate-limiter.ts');

// ═══════════════════════════════════════════════════════════════════════
// Source-pin coverage — limiter spec + helper + all 17 routes
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.5 — limiter spec + helper (lib/middleware/rate-limiter.ts)', () => {
  let src: string;
  beforeAll(() => { src = readFileSync(RATE_LIMITER_PATH, 'utf8'); });

  it('limiterSpecs declares portal_write at 30/hour', () => {
    expect(src).toMatch(/portal_write:\s*\{\s*count:\s*30,\s*window:\s*['"]3600\s*s['"]\s*\}/);
  });

  it('checkPortalWriteRateLimit helper is exported', () => {
    expect(src).toMatch(/export\s+async\s+function\s+checkPortalWriteRateLimit\(/);
  });

  it('helper keys by user (NOT IP) — `user:<userId>` prefix', () => {
    // Function body must build the limiter key from userId, not from
    // the request IP. This is the core correctness invariant — per-IP
    // would let one abusive user starve a household's quota / let
    // multiple users collectively bypass the cap.
    const fnMatch = src.match(/export\s+async\s+function\s+checkPortalWriteRateLimit\([^)]*\):\s*Promise<NextResponse\s*\|\s*null>\s*\{([\s\S]*?)\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toMatch(/`user:\$\{String\(userId\)\}`/);
    // Must call checkRouteRateLimit with route name 'portal_write'.
    expect(fnMatch![1]).toMatch(/checkRouteRateLimit\([\s\S]*?['"]portal_write['"]/);
  });

  it('helper returns 429 with safe error shape on rate-limit hit', () => {
    const fnMatch = src.match(/export\s+async\s+function\s+checkPortalWriteRateLimit\([^)]*\):\s*Promise<NextResponse\s*\|\s*null>\s*\{([\s\S]*?)\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toMatch(/status:\s*429/);
    expect(fnMatch![1]).toMatch(/['"]Retry-After['"]:\s*['"]60['"]/);
    expect(fnMatch![1]).toMatch(/rate_limited:\s*true/);
    // No PII echo / no user id reflected in error body.
    expect(fnMatch![1]).not.toMatch(/userId\s*:|user_id\s*:/);
  });
});

describe('PR-CRM.5 — all 17 portal POST routes wire checkPortalWriteRateLimit', () => {
  for (const routePath of PORTAL_POST_ROUTES) {
    const absPath = path.resolve(__dirname, '../..', routePath);

    it(`${routePath} imports checkPortalWriteRateLimit`, () => {
      const src = readFileSync(absPath, 'utf8');
      expect(src).toMatch(
        /import\s*\{[^}]*checkPortalWriteRateLimit[^}]*\}\s*from\s*['"]@\/lib\/middleware\/rate-limiter['"]/,
      );
    });

    it(`${routePath} calls checkPortalWriteRateLimit inside POST + early-returns 429`, () => {
      const src = readFileSync(absPath, 'utf8');
      // Find the POST handler and assert the helper is called inside it,
      // with an early return on rate-limit hit.
      const postMatch = src.match(/export\s+async\s+function\s+POST\([^)]*\)[^{]*\{([\s\S]*)$/);
      expect(postMatch).not.toBeNull();
      // The call site: `const limited = await checkPortalWriteRateLimit(<x>.userId);`
      expect(postMatch![1]).toMatch(/await\s+checkPortalWriteRateLimit\(\s*\w+\.userId\s*\)/);
      // The early-return: `if (limited) return limited;`
      expect(postMatch![1]).toMatch(/if\s*\(\s*limited\s*\)\s*return\s+limited\s*;/);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Runtime probe (representative route: portal listings/[id]/react POST)
// Mock the rate-limiter so we can control allowed/limited per call and
// assert: under-limit succeeds; over-limit returns 429 with NO DB writes
// and NO email send; the call is keyed by userId, not IP.
// ═══════════════════════════════════════════════════════════════════════

// Capture rate-limiter calls so we can assert userId-keyed semantics.
const checkPortalWriteRateLimitMock: jest.Mock = jest.fn(async () => null);
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkPortalWriteRateLimit: checkPortalWriteRateLimitMock,
  checkRouteRateLimit: jest.fn(async () => true),
  extractClientIp: () => '203.0.113.42',
  checkRateLimits: jest.fn(async () => null),
}));

// Prisma + auth mocks (representative shape).
const clientListingActionFindUnique: jest.Mock = jest.fn(async () => null);
const clientListingActionCreate: jest.Mock = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 200n,
  ...args.data,
}));
const listingFindUnique: jest.Mock = jest.fn(async () => ({
  id: 7n,
  listing_id: 'LIST-001',
  status: 'Active',
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
}));
const leadUpdate: jest.Mock = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 99n,
  ...args.data,
}));

const { prisma: prismaMock } = buildPrismaMock({
  listing: { findUnique: listingFindUnique },
  clientListingAction: {
    findUnique: clientListingActionFindUnique,
    create: clientListingActionCreate,
  },
  lead: { update: leadUpdate, findUnique: jest.fn(async () => ({ portal_role: 'buyer' })) },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAuth: jest.fn(async () => ({ userId: 99n, userType: 'lead', role: 'BUYER' })),
  requirePortalRole: jest.fn(async () => ({ userId: 99n, userType: 'lead', role: 'BUYER' })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/inquiries/create', () => ({
  __esModule: true,
  createInquiry: jest.fn(async () => 999n),
}));
jest.mock('@/lib/search/listing-access-decision', () => ({
  __esModule: true,
  isListingDisplayable: () => true,
  buildSearchDisplayWhere: () => ({}),
}));
jest.mock('@/lib/portal/events', () => ({
  __esModule: true,
  recordPortalEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/utils/safe-bigint', () => ({
  __esModule: true,
  safeBigInt: (s: string) => { try { return BigInt(s); } catch { return null; } },
}));

import { NextResponse } from 'next/server';
import { POST as reactPOST } from '@/app/api/portal/listings/[id]/react/route';

function makePostReq(body: unknown): NextRequest {
  return makeRequest({ method: 'POST', body }) as NextRequest;
}

function clearAll() {
  checkPortalWriteRateLimitMock.mockClear();
  checkPortalWriteRateLimitMock.mockResolvedValue(null); // allow by default
  clientListingActionFindUnique.mockClear();
  clientListingActionCreate.mockClear();
  listingFindUnique.mockClear();
  leadUpdate.mockClear();
}

describe('PR-CRM.5 — runtime: react POST honors portal_write rate limit', () => {
  beforeEach(() => clearAll());

  it('under-limit call: rate-limiter returns null → POST proceeds normally', async () => {
    checkPortalWriteRateLimitMock.mockResolvedValueOnce(null);
    const req = makePostReq({ action: 'liked', consent: true });
    const res = await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    expect(checkPortalWriteRateLimitMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(clientListingActionCreate).toHaveBeenCalledTimes(1);
    expect(leadUpdate).toHaveBeenCalledTimes(1);
  });

  it('over-limit call: rate-limiter returns 429 → POST short-circuits with 429 + zero side effects', async () => {
    // Simulate Upstash saying "rate-limited" — helper returns the 429 NextResponse.
    const limitedResp = NextResponse.json(
      { error: 'Too many requests…', rate_limited: true },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
    checkPortalWriteRateLimitMock.mockResolvedValueOnce(limitedResp);
    const req = makePostReq({ action: 'liked', consent: true });
    const res = await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(429);
    const json = await readJson<{ rate_limited: boolean; error: string }>(res);
    expect(json.rate_limited).toBe(true);
    expect(json.error).toMatch(/too many requests/i);
    // No PII / user id in error body.
    expect((json as Record<string, unknown>).userId).toBeUndefined();
    expect((json as Record<string, unknown>).user_id).toBeUndefined();
    // ZERO side effects — no listing fetch, no ClientListingAction create,
    // no Lead update.
    expect(listingFindUnique).not.toHaveBeenCalled();
    expect(clientListingActionFindUnique).not.toHaveBeenCalled();
    expect(clientListingActionCreate).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('rate-limiter is keyed by the authenticated session userId (not IP)', async () => {
    checkPortalWriteRateLimitMock.mockResolvedValueOnce(null);
    const req = makePostReq({ action: 'liked', consent: true });
    await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    // The helper is invoked with auth.userId — pinned by both the
    // mock call args and by the source-pin tests above.
    expect(checkPortalWriteRateLimitMock).toHaveBeenCalledWith(99n);
  });
});
