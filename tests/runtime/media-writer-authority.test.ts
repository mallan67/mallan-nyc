/**
 * MEDIA WRITER AUTHORITY — the legacy second writer, and source-owned denial.
 *
 * `POST /api/crm/listings/[id]/photos` wrote straight into the `Listing.media`
 * JSON, bypassing `listing_media` entirely, with no namespace, no provenance
 * and no relational row — a second independent media writer. It also stamped
 * `modification_timestamp: new Date()` on whatever row it touched, including
 * Trestle-synced rows, which poisons the incremental cursor
 * (`getLastSyncTimestamp` = MAX(modification_timestamp) WHERE
 * last_synced_from_trestle IS NOT NULL).
 *
 * Its only client binding, `addPhotos()` in public/crm/js/core/api-client.js,
 * has NO caller anywhere in the CRM frontend — it is dead surface. The route is
 * therefore RETIRED rather than migrated: keeping a parallel writer alive to
 * serve nothing is exactly what the charter forbids.
 */

const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
const mockMediaUpdateMany = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({ count: 1 });

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (a: unknown) => mockListingFindUnique(a),
      update: (a: unknown) => mockListingUpdate(a),
    },
    listingMedia: {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      updateMany: (a: unknown) => mockMediaUpdateMany(a),
      create: async () => ({}),
    },
    auditEvent: { create: async () => ({}) },
    $transaction: async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  },
}));

let currentAuth: { userId: bigint; role: string; userType: string } = {
  userId: 42n,
  role: 'AGENT',
  userType: 'agent',
};
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => currentAuth,
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

const LOCAL_ROW = {
  id: 1n,
  listing_id: 'SL-0004',
  agent_id: 42n,
  rls_eligible: false,
  list_office_mls_id: null,
  last_synced_from_trestle: null,
  media: [],
};

const THIRD_PARTY_ROW = {
  id: 2n,
  listing_id: 'RLS20105333',
  agent_id: 42n, // buyer-side history association only
  rls_eligible: true,
  list_office_mls_id: '9999',
  last_synced_from_trestle: new Date('2026-08-01T00:00:00Z'),
  media: [],
};

const RETURN_COPY_ROW = {
  ...THIRD_PARTY_ROW,
  id: 3n,
  listing_id: 'RLS20093870',
  list_office_mls_id: '7041',
};

function req(body: unknown = {}) {
  return {
    json: async () => body,
    headers: { get: () => undefined },
    nextUrl: { searchParams: new URLSearchParams() },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentAuth = { userId: 42n, role: 'AGENT', userType: 'agent' };
  mockListingUpdate.mockResolvedValue({});
  mockMediaUpdateMany.mockResolvedValue({ count: 1 });
});

describe('legacy POST /photos is retired', () => {
  it('returns 410 Gone and writes NOTHING', async () => {
    mockListingFindUnique.mockResolvedValue(LOCAL_ROW);
    const { POST } = await import('@/app/api/crm/listings/[id]/photos/route');

    const res = await POST(req({ photos: [{ url: 'https://cdn.example.test/x.jpg' }] }), {
      params: Promise.resolve({ id: 'SL-0004' }),
    });

    expect(res.status).toBe(410);
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it('does not write even on a synced row (no cursor bump)', async () => {
    mockListingFindUnique.mockResolvedValue(THIRD_PARTY_ROW);
    const { POST } = await import('@/app/api/crm/listings/[id]/photos/route');

    const res = await POST(req({ photos: [{ url: 'https://cdn.example.test/x.jpg' }] }), {
      params: Promise.resolve({ id: 'RLS20105333' }),
    });

    expect(res.status).toBe(410);
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it('points the caller at the canonical relational upload route', async () => {
    mockListingFindUnique.mockResolvedValue(LOCAL_ROW);
    const { POST } = await import('@/app/api/crm/listings/[id]/photos/route');
    const res = await POST(req({ photos: [] }), { params: Promise.resolve({ id: 'SL-0004' }) });
    const json = (await res.json()) as { error?: string };
    expect(String(json.error)).toMatch(/media\/upload/);
  });
});

describe('set-main never clears source-owned feed preference', () => {
  it('the clear is scoped to the crm: namespace', async () => {
    mockListingFindUnique.mockResolvedValue(LOCAL_ROW);
    const prisma = (await import('@/lib/prisma')).default as unknown as {
      listingMedia: { findFirst: unknown };
    };
    prisma.listingMedia.findFirst = async () => ({ media_type: 'Photo' });

    const { PATCH } = await import('@/app/api/crm/listings/[id]/media/[mediaId]/route');
    const res = await PATCH(req({ preferred_photo_yn: true }), {
      params: Promise.resolve({ id: 'SL-0004', mediaId: 'crm:SL-0004:abc' }),
    });
    expect(res.status).toBe(200);

    const clearCall = mockMediaUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { preferred_photo_yn?: boolean } })?.data?.preferred_photo_yn === false,
    );
    expect(clearCall).toBeDefined();
    const where = (clearCall![0] as { where: { media_key?: { startsWith?: string } } }).where;
    // Without this scope the update would also clear PreferredPhotoYN on feed
    // rows — source-owned metadata that media-sync rewrites every cycle.
    expect(where.media_key?.startsWith).toBe('crm:');
  });

  it('refuses a non-crm media key outright', async () => {
    mockListingFindUnique.mockResolvedValue(THIRD_PARTY_ROW);
    const { PATCH } = await import('@/app/api/crm/listings/[id]/media/[mediaId]/route');
    const res = await PATCH(req({ preferred_photo_yn: true }), {
      params: Promise.resolve({ id: 'RLS20105333', mediaId: '1234567' }),
    });
    expect(res.status).toBe(400);
    expect(mockMediaUpdateMany).not.toHaveBeenCalled();
  });
});

describe('new-media upload authority by source class', () => {
  const upload = async (row: unknown, id: string) => {
    mockListingFindUnique.mockResolvedValue(row);
    const { POST } = await import('@/app/api/crm/listings/[id]/media/upload/route');
    return POST(req(), { params: Promise.resolve({ id }) });
  };

  it('DENIES uploading new Mallan media to a third-party listing', async () => {
    const res = await upload(THIRD_PARTY_ROW, 'RLS20105333');
    expect(res.status).toBe(403);
  });

  it('DENIES uploading new Mallan media to the RLS return-copy', async () => {
    const res = await upload(RETURN_COPY_ROW, 'RLS20093870');
    expect(res.status).toBe(403);
  });

  it('a BROKER is denied too — role does not confer source ownership', async () => {
    currentAuth = { userId: 1n, role: 'BROKER', userType: 'agent' };
    const res = await upload(THIRD_PARTY_ROW, 'RLS20105333');
    expect(res.status).toBe(403);
  });
});

// Module scope: without a top-level import/export TypeScript treats this file
// as a global script, so its local helpers collide with identically-named
// helpers in sibling test files.
export {};
