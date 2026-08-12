/// <reference types="jest" />
/**
 * P1C2 — crm: namespace guard on the media-order route (RED→GREEN).
 *
 * The PATCH /api/crm/listings/[id]/media-order route persisted `order` onto
 * ANY media_key the client sent — including Trestle feed rows, whose order
 * media-sync rewrites from the feed on the next complete set (order
 * ping-pong; agent edits silently reverted). P1C2: only `crm:`-namespace
 * keys accept CRM ordering; Trestle keys are skipped and REPORTED (never a
 * silent no-op).
 */

import { makeRequest, readJson } from './helpers';

const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockMediaUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (args: unknown) => mockListingFindUnique(args),
      update: (args: unknown) => mockListingUpdate(args),
    },
    listingMedia: {
      // importJsonMediaToRows path (media: [] in the seed → never called, but safe)
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => undefined),
      updateMany: (args: unknown) => mockMediaUpdateMany(args),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 1n, userType: 'agent', role: 'BROKER' })),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

import { PATCH } from '@/app/api/crm/listings/[id]/media-order/route';

const CRM_KEY_A = 'crm:SL-0001:aaaaaaaaaaaaaaaaaaaaaaaa';
const CRM_KEY_B = 'crm:SL-0001:bbbbbbbbbbbbbbbbbbbbbbbb';
const TRESTLE_KEY = '1159000001-MK-9';

beforeEach(() => {
  jest.clearAllMocks();
  mockListingFindUnique.mockResolvedValue({
    id: 1n,
    listing_id: 'SL-0001',
    agent_id: 1n,
    media: [],
  });
  mockListingUpdate.mockResolvedValue(undefined);
  mockMediaUpdateMany.mockResolvedValue({ count: 1 });
});

function call(orderedIds: string[]) {
  return PATCH(
    makeRequest({ method: 'PATCH', body: { ordered_media_ids: orderedIds } }),
    { params: Promise.resolve({ id: 'SL-0001' }) },
  );
}

// DB-coupled assertions from this file were MIGRATED to
// tests/runtime/crm-media-summary-convergence.integration.test.ts. They drove a
// handcrafted Prisma object through a fake `$transaction: (ops) => Promise.all(ops)`,
// which cannot roll back and cannot model the transaction the routes now use.
// Persistence, ordering and modification-timestamp effects are proven against
// real PostgreSQL. Only non-DB assertions remain here.

describe('P1C2 — media-order route must not renumber Trestle feed rows', () => {



  it('all-Trestle payload (nothing persisted) is NON-OK — no false "saved" toast (Codex #383)', async () => {
    const res = await call([TRESTLE_KEY, '1159000002-MK-10']);
    expect(res.status).toBe(422);
    const json = await readJson<{ skipped_trestle_keys: string[]; rows_updated: number }>(res);
    expect(json.rows_updated).toBe(0);
    expect(json.skipped_trestle_keys).toEqual([TRESTLE_KEY, '1159000002-MK-10']);
    expect(mockMediaUpdateMany).not.toHaveBeenCalled();
  });
});
