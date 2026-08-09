/// <reference types="jest" />
/**
 * `POST /api/idx/ensure-listing` MUST NOT poison the Trestle incremental cursor.
 *
 * PROVEN DEFECT (found by the post-correction audit, 2026-08-09).
 *
 * `getLastSyncTimestamp()` (lib/idx/sync.ts) is
 *     MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
 * and its result feeds the OData filter `ModificationTimestamp gt SINCE`.
 *
 * PR-S.7 restricted that query to rows with a non-null `last_synced_from_trestle`
 * precisely so it "selects ONLY Trestle-sync writers" — CRM-only writers like
 * /api/crm/convert leave the column NULL and are excluded.
 *
 * This route is NOT a Trestle-sync writer: it creates a local STUB from IDX
 * search-result data in the request body so showings and listing-sends have a
 * Prisma row to reference. But it stamped BOTH
 *     last_synced_from_trestle: new Date()   (a false claim — never synced)
 *     modification_timestamp:  new Date()    (LOCAL clock, not the Trestle clock)
 * so the stub passed the cursor filter carrying a local-NOW watermark. One call
 * pushed the cursor far past every genuine Trestle ModificationTimestamp, and
 * the next incremental sync skipped real upstream changes until wall-clock time
 * caught up — the exact hazard PR-S.7 documented, through a door it left open.
 */

const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockFindFirst = jest.fn<Promise<unknown>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (a: unknown) => mockFindUnique(a),
      findFirst: (a: unknown) => mockFindFirst(a),
      create: (a: unknown) => mockCreate(a),
    },
    auditEvent: { create: async () => ({}) },
  },
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ userId: 1n, role: 'BROKER', userType: 'agent' }),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: async () => undefined,
}));

function req(body: unknown) {
  return new Request('http://localhost/api/idx/ensure-listing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const BODY = {
  listing_id: 'RLS20105333',
  list_price: 1000000,
  status: 'Active',
  listing_type: 'sale',
  images: ['https://api.cotality.com/trestle/Media/a.jpg'],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockResolvedValue(null);
  mockFindFirst.mockResolvedValue(null);
  mockCreate.mockImplementation(async (a: unknown) => ({
    ...(a as { data: Record<string, unknown> }).data,
    id: 1n,
    listing_id: 'RLS20105333',
  }));
});

describe('the created stub is not a Trestle-sync writer', () => {
  it('does NOT claim last_synced_from_trestle', async () => {
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    await POST(req(BODY));

    expect(mockCreate).toHaveBeenCalled();
    const data = (mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;

    // Null keeps the row OUT of the cursor query, which is the whole point of
    // the PR-S.7 filter. A Date here re-opens the hazard.
    expect(data.last_synced_from_trestle ?? null).toBeNull();
  });

  it('does NOT claim sync_status "synced"', async () => {
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    await POST(req(BODY));
    const data = (mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.sync_status).not.toBe('synced');
  });

  it('still sets modification_timestamp (non-nullable column)', async () => {
    // Local NOW is fine here ONLY because the row is excluded from the cursor.
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    await POST(req(BODY));
    const data = (mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.modification_timestamp).toBeInstanceOf(Date);
  });
});

describe('cursor invariant, stated directly', () => {
  it('a row is cursor-bearing ONLY when last_synced_from_trestle is set', async () => {
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    await POST(req(BODY));
    const data = (mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;

    const cursorBearing = (data.last_synced_from_trestle ?? null) !== null;
    expect(cursorBearing).toBe(false);
  });
});

// Module scope: without a top-level import/export TypeScript treats this file
// as a global script, so its local helpers collide with identically-named
// helpers in sibling test files.
export {};
