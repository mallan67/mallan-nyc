/// <reference types="jest" />
/**
 * A LISTING THAT HAS AN OWNER MUST STILL BE READABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A REGRESSION I INTRODUCED
 *
 * `GET /api/crm/listings/[id]` loads the row with a no-select `findUnique`, so
 * EVERY column is present on the object, then hand-stringifies exactly four of
 * them before `NextResponse.json`:
 *
 *     const sanitized = sanitizeForCRM({
 *       ...listing,
 *       id: listing.id.toString(),
 *       agent_id: listing.agent_id?.toString() ?? null,
 *       list_price: listing.list_price.toString(),
 *       living_area: listing.living_area?.toString() ?? null,
 *     });
 *
 * `Listing` has THREE BigInt columns: `id`, `agent_id`, and `owner_client_id`.
 * Two are stringified. The third is not.
 *
 * The call-site comment says "CRM sanitization: strips removed compensation
 * fields, serializes BigInt". `sanitizeForCRM` (lib/compliance/dto.ts:498) does
 * NOT serialize BigInt — it only deletes keys. The comment is false, and it is
 * why the omission looked safe.
 *
 * `JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt`.
 * So the route returns 500 for any listing whose owner is set.
 *
 * It never fired before because `owner_client_id` was null on every row. The
 * Family 2 commit (a2620927) made the create path populate it. That turned a
 * dormant landmine into a live one: from that commit forward, the moment a
 * listing acquires an owner, the CRM can no longer open it.
 *
 * The closure package claimed an owner "roundtrip proof". It proved the WRITE.
 * It never fetched the row back through this endpoint, which is exactly the
 * step that fails — a reminder that "create persists it" and "the app can read
 * it" are two different claims.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIX IS NOT "STRINGIFY ONE MORE FIELD"
 *
 * Adding `owner_client_id` to the hand-written list would leave the same trap
 * armed for the next BigInt column. The route serializes every BigInt it
 * receives, so a schema addition cannot silently reintroduce this.
 */
process.env.READONLY_MODE = 'false';

const mockValidateSession = jest.fn();
const mockListingFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findUnique: (a: unknown) => mockListingFindUnique(a) },
    agent: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (t: string) => mockValidateSession(t),
  };
});

import { NextRequest } from 'next/server';

const OWNER_ID = 501n;

/** A Mallan-local listing shaped like a real no-select findUnique result. */
function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7n,
    listing_id: 'SL-0004',
    mls_id: null,
    agent_id: 3n,
    owner_client_id: OWNER_ID,
    status: 'Draft',
    listing_type: 'sale',
    list_price: { toString: () => '1250000' },
    living_area: null,
    rls_eligible: false,
    address: {},
    features: {},
    media: [],
    compliance: {},
    raw_data: {},
    list_agent_full_name: 'A Agent',
    list_office_name: 'Mallan Real Estate Inc.',
    ...overrides,
  };
}

async function get(id = 'SL-0004') {
  const { GET } = await import('@/app/api/crm/listings/[id]/route');
  const req = new NextRequest(`https://x.test/api/crm/listings/${id}`);
  req.cookies.set('session_token', 'tok');
  return GET(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  jest.resetModules();
  mockValidateSession.mockReset();
  mockListingFindUnique.mockReset();
  mockValidateSession.mockResolvedValue({
    userId: 3n,
    userType: 'agent',
    role: 'BROKER',
    sessionId: 's',
  });
});

describe('the premise: a raw BigInt cannot be serialized', () => {
  it('JSON.stringify throws on one', () => {
    // Guard the guard. If this ever stops throwing, the test below proves
    // nothing and must be rewritten rather than quietly kept green.
    expect(() => JSON.stringify({ owner_client_id: 1n })).toThrow(TypeError);
  });
});

describe('GET /api/crm/listings/[id] with an owner set', () => {
  it('does not 500', async () => {
    mockListingFindUnique.mockResolvedValue(listingRow());
    const res = await get();
    expect(res.status).toBe(200);
  });

  it('returns the owner as a string the CRM can use', async () => {
    mockListingFindUnique.mockResolvedValue(listingRow());
    const body = await (await get()).json();
    expect(body.owner_client_id).toBe('501');
  });

  it('an ownerless draft still reads null, not "null"', async () => {
    mockListingFindUnique.mockResolvedValue(listingRow({ owner_client_id: null }));
    const body = await (await get()).json();
    expect(body.owner_client_id).toBeNull();
  });

  it('the already-handled BigInt columns are unchanged', async () => {
    mockListingFindUnique.mockResolvedValue(listingRow());
    const body = await (await get()).json();
    expect(body.id).toBe('7');
    expect(body.agent_id).toBe('3');
  });

  it('a BigInt added anywhere on the row is serialized too', async () => {
    // The point of the fix: a future schema column must not re-arm this.
    mockListingFindUnique.mockResolvedValue(
      listingRow({ some_future_bigint_column: 999n }),
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).some_future_bigint_column).toBe('999');
  });
});
