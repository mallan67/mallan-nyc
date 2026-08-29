/// <reference types="jest" />
/**
 * SOURCE AUTHORITY — a COTALITY_API path may never mint a MALLAN_LOCAL identifier.
 *
 * ── THE DEFECT THIS PINS (#618, 2026-08-17) ────────────────────────────────
 * `POST /api/idx/ensure-listing` read `listing_id` from the request body and
 * wrote it into BOTH `listing_id` and `mls_id` with no namespace check:
 *
 *     const trimmedId = listingId.trim();
 *     await prisma.listing.create({ data: { listing_id: trimmedId, mls_id: trimmedId, … } });
 *
 * A caller posting `SL-9999` therefore created a row that the CANONICAL
 * classifier `isMallanLocalListing()` reports as MALLAN_LOCAL — while it was
 * written by the provider-facing path and carries an `mls_id`. Charter §1A:
 * **source is established by WHICH WRITER CREATED THE ROW**, never inferred
 * afterwards. This is that rule, enforced.
 *
 * ── WHY "REJECTED" IS NOT ENOUGH ───────────────────────────────────────────
 * A 4xx alone would still permit the route to be used to READ or TOUCH the
 * reserved namespace. These tests assert the stronger property: a rejected
 * request performs NO read, NO create, NO projection dual-write, and emits NO
 * cache-invalidation tags. The guard therefore has to sit BEFORE the lookups.
 *
 * The legitimate-provider case is asserted too: live Cotality identifiers are
 * `RLS…` (third character `S`, not `-`), so `'RLS20109830'` must pass. A guard
 * written without the hyphen would reject the entire provider feed.
 */

const findUnique = jest.fn();
const findFirst = jest.fn();
const create = jest.fn();
const update = jest.fn();
const dualWrite = jest.fn();
const revalidate = jest.fn();
const audit = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({
    userId: BigInt(42),
    userType: 'agent',
    role: 'BROKER', // the most privileged caller — privilege must not bypass source authority
  })),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: (...a: unknown[]) => audit(...a),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: (...a: unknown[]) => dualWrite(...a),
}));

jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  safeRevalidateTags: (...a: unknown[]) => revalidate(...a),
  buildingAndManifestInvalidationTags: () => ['building:test'],
  listingCacheTag: (id: string) => `listing:${id}`,
  SEARCH_CACHE_TAG: 'search',
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/idx/ensure-listing/route';
import {
  isReservedMallanLocalIdentifier,
  MALLAN_LOCAL_ID_PREFIXES,
  isMallanLocalListing,
} from '@/lib/listings/mallan-source-identity';

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://test/api/idx/ensure-listing', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }) as never,
  ) as unknown as Promise<Response>;
}

/** Every side effect the route can produce. All must stay untouched on reject. */
function assertNoSideEffects() {
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(dualWrite).not.toHaveBeenCalled();
  expect(revalidate).not.toHaveBeenCalled();
  // The guard sits BEFORE the lookups, so the reserved namespace cannot even be
  // probed for existence through this route.
  expect(findUnique).not.toHaveBeenCalled();
  expect(findFirst).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(null);
  findFirst.mockResolvedValue(null);
});

describe('the reserved MALLAN_LOCAL namespace is not addressable by a COTALITY_API path', () => {
  test.each(['SL-9999', 'RL-9999', 'SL-0004', 'RL-1779000000000'])(
    'REJECTS %s with zero writes and zero reads',
    async (id) => {
      const res = await post({ listing_id: id, status: 'Active' });
      expect(res.status).toBe(422);
      assertNoSideEffects();
    },
  );

  test('the rejection explains SOURCE AUTHORITY, not "not found"', async () => {
    const res = await post({ listing_id: 'SL-9999' });
    const body = await res.json();
    // 404 would wrongly imply "no such Cotality listing". The identifier is
    // well-formed; it is simply not addressable here.
    expect(res.status).not.toBe(404);
    expect(String(body.error)).toContain('reserved Mallan-local namespace');
    expect(body.source_authority).toBeDefined();
  });

  test('surrounding whitespace cannot smuggle a reserved identifier through', async () => {
    const res = await post({ listing_id: '   SL-9999   ' });
    expect(res.status).toBe(422);
    assertNoSideEffects();
  });

  test('BROKER privilege does not bypass source authority', async () => {
    // The mocked caller is a BROKER — the most privileged role. Source is a
    // property of the WRITER PATH, not of who is calling it.
    const res = await post({ listing_id: 'SL-0001' });
    expect(res.status).toBe(422);
    assertNoSideEffects();
  });

  test('an EXISTING legitimate local row cannot be reclassified through this route', async () => {
    // If the guard ran after the lookup, this row could be found and updated —
    // letting a COTALITY_API path take authority over a MALLAN_LOCAL listing.
    findUnique.mockResolvedValue({
      id: BigInt(1),
      listing_id: 'SL-0004',
      mls_id: null,
      status: 'Active',
    });
    const res = await post({ listing_id: 'SL-0004', status: 'Closed' });
    expect(res.status).toBe(422);
    assertNoSideEffects();
  });
});

describe('the guard must not reject the legitimate provider feed', () => {
  test('a live-shaped Cotality identifier is NOT reserved', () => {
    // Live Cotality ids are `RLS…`: third character is `S`, not `-`.
    // A guard written as `startsWith('RL')` would reject the entire feed.
    expect(isReservedMallanLocalIdentifier('RLS20109830')).toBe(false);
    expect(isReservedMallanLocalIdentifier('RLS10969187')).toBe(false);
    expect('RLS20109830'.startsWith('RL-')).toBe(false);
  });

  test('the reserved prefixes retain their hyphen', () => {
    expect([...MALLAN_LOCAL_ID_PREFIXES]).toEqual(['SL-', 'RL-']);
    for (const p of MALLAN_LOCAL_ID_PREFIXES) expect(p.endsWith('-')).toBe(true);
  });

  test('a provider identifier still reaches the lookup path', async () => {
    findUnique.mockResolvedValue({
      id: BigInt(7),
      listing_id: 'RLS20109830',
      mls_id: 'RLS20109830',
      status: 'Active',
    });
    const res = await post({ listing_id: 'RLS20109830' });
    expect(res.status).toBe(200);
    expect(findUnique).toHaveBeenCalled();
  });
});

describe('malformed identifiers are rejected before any write', () => {
  test.each([
    ['missing', {}],
    ['empty', { listing_id: '' }],
    ['whitespace only', { listing_id: '   ' }],
    ['non-string', { listing_id: 12345 }],
    ['null', { listing_id: null }],
  ])('%s -> rejected, zero writes', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(dualWrite).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  test('invalid JSON is rejected with zero writes', async () => {
    const res = (await POST(
      new NextRequest('http://test/api/idx/ensure-listing', {
        method: 'POST',
        body: 'not json',
        headers: { 'content-type': 'application/json' },
      }) as never,
    )) as unknown as Response;
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('the classifier and the guard agree on the namespace', () => {
  test('anything the guard reserves would classify as MALLAN_LOCAL', () => {
    // If these ever diverge, a row could be written that the guard allows and
    // the classifier then treats as Mallan-authored — the original defect.
    for (const id of ['SL-0001', 'RL-0001', 'SL-9999', 'RL-1779000000000']) {
      expect(isReservedMallanLocalIdentifier(id)).toBe(true);
      expect(isMallanLocalListing({ listing_id: id })).toBe(true);
    }
  });

  test('anything the guard allows would NOT classify as MALLAN_LOCAL', () => {
    for (const id of ['RLS20109830', 'RBNY-123', 'ABC123', '12345']) {
      expect(isReservedMallanLocalIdentifier(id)).toBe(false);
      expect(isMallanLocalListing({ listing_id: id })).toBe(false);
    }
  });

  test('source is NEVER inferred from rls_eligible (release blocker, #618)', () => {
    // An ELIGIBILITY flag is not source authority, and it failed both ways:
    // commercial third-party rows are rls_eligible:false by design, while a real
    // Mallan exclusive published to REBNY is rls_eligible:true.
    expect(isMallanLocalListing({ listing_id: 'RLS20109830', rls_eligible: false })).toBe(false);
    expect(isMallanLocalListing({ listing_id: 'SL-0004', rls_eligible: true })).toBe(true);
  });
});
