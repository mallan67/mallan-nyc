/// <reference types="jest" />
/**
 * TWO-POPULATION PAGINATION — behavioural proof.
 *
 * "My Listings" is defined as an ORDERED CONCATENATION of two populations:
 *
 *     [ Mallan-authored, updated_at desc ] ++ [ provider participation, updated_at desc ]
 *
 * Mallan-authored rows are fetched as their own query so provider churn can
 * never paginate them out. That guarantee introduces a PAGINATION HAZARD, and
 * this file exists to prove the hazard is closed.
 *
 * ── THE BUG THIS PINS ──────────────────────────────────────────────────────
 * A naive "Mallan on page 1 only" merge silently corrupts page 2:
 *
 *   page 1 = M Mallan + (L - M) provider
 *   page 2 = skip L into a DIFFERENTLY-ORDERED set
 *
 * With 7 Mallan + 100 provider and limit 50, page 1 correctly shows 7 Mallan +
 * provider 1..43 — but a naive page 2 skips 50 of the union and therefore starts
 * at provider 51, DROPPING provider 44..50 and duplicating others.
 *
 * The correct math pages over the concatenation:
 *   mallanSkip   = min(offset, M)
 *   mallanTake   = clamp(M - offset, 0, limit)
 *   providerSkip = max(0, offset - M)
 *   providerTake = limit - mallanTake
 *
 * These tests drive the REAL route handler against a Prisma mock that implements
 * genuine skip/take semantics, so the assertions are behavioural — they compare
 * the actual rows returned, not the arguments passed.
 */

const MALLAN_COUNT = 7;
const PROVIDER_COUNT = 100;

/** Deterministic fixtures: SL-001.. and RLS-001.., newest first. */
const mallanRows = Array.from({ length: MALLAN_COUNT }, (_, i) => ({
  id: BigInt(1000 + i),
  listing_id: `SL-${String(i + 1).padStart(4, '0')}`,
  mls_id: null,
  agent_id: BigInt(42),
  status: 'Active',
  listing_type: 'sale',
  list_price: 1_250_000,
  living_area: 1100,
  address: { StreetNumber: '400', StreetName: 'East 90th Street' },
  features: {},
  updated_at: new Date(Date.UTC(2026, 7, 17, 12, 0, MALLAN_COUNT - i)),
  listing_media: [],
  _count: { listing_media: 0 },
  media: [],
}));

const providerRows = Array.from({ length: PROVIDER_COUNT }, (_, i) => ({
  id: BigInt(2000 + i),
  listing_id: `RLS${String(i + 1).padStart(5, '0')}`,
  mls_id: `11${String(i).padStart(6, '0')}`,
  agent_id: null,
  status: 'Closed',
  listing_type: 'sale',
  list_price: 900_000,
  living_area: 800,
  address: { StreetNumber: '1', StreetName: 'Provider Street' },
  features: {},
  updated_at: new Date(Date.UTC(2026, 7, 16, 12, 0, PROVIDER_COUNT - i)),
  listing_media: [],
  _count: { listing_media: 0 },
  media: [],
}));

/** BigInt-safe stringify — the where-tree carries `agent_id` as a BigInt. */
function j(v: unknown): string {
  return JSON.stringify(v ?? {}, (_k, val) => (typeof val === 'bigint' ? `${val}n` : val));
}

/**
 * Which of the THREE where-shapes is this?
 *
 *   full union            `{ OR: [...], status, listing_type }`   -> no AND
 *   Mallan-authored scope `{ AND: [union, mallanScope] }`         -> AND, no NOT
 *   provider scope        `{ AND: [union, { NOT: mallanScope }] }` -> AND + NOT
 *
 * The composed queries are the only ones wrapped in `AND`, which is what makes
 * them distinguishable from the union used for `total`.
 */
type WhereShape = 'union' | 'mallan' | 'provider';

function whereShape(where: unknown): WhereShape {
  // Inspect the TOP-LEVEL shape, not the serialized string: the union's first
  // OR-arm is itself `{ AND: [mallanScope, { agent_id }] }`, so a substring test
  // for `"AND"` misclassifies the union as a composed query.
  const keys = Object.keys((where ?? {}) as Record<string, unknown>);
  if (!keys.includes('AND')) return 'union';
  return j(where).includes('"NOT"') ? 'provider' : 'mallan';
}

const findManyCalls: Array<{ where: unknown; take?: number; skip?: number }> = [];

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      // Real skip/take semantics — this is what makes the test behavioural.
      findMany: jest.fn(async (args: { where: unknown; take?: number; skip?: number }) => {
        findManyCalls.push(args);
        const source = whereShape(args.where) === 'mallan' ? mallanRows : providerRows;
        const skip = args.skip ?? 0;
        const take = args.take ?? source.length;
        return source.slice(skip, skip + take);
      }),
      count: jest.fn(async (args: { where: unknown }) => {
        const shape = whereShape(args.where);
        if (shape === 'mallan') return MALLAN_COUNT;
        if (shape === 'provider') return PROVIDER_COUNT;
        return MALLAN_COUNT + PROVIDER_COUNT; // the union total
      }),
    },
    agent: {
      findUnique: jest.fn(async () => ({ id: BigInt(42), trestle_mls_id: '39361' })),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({
    userId: BigInt(42),
    userType: 'agent',
    role: 'BROKER', // the role that previously bypassed ownership entirely
  })),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/crm/listings/route';

async function page(offset: number, limit = 50): Promise<string[]> {
  findManyCalls.length = 0;
  const res = await GET(
    new NextRequest(`http://test/api/crm/listings?limit=${limit}&offset=${offset}`),
  );
  const body = await res.json();
  return (body.listings ?? []).map((l: { listing_id: string }) => l.listing_id);
}

beforeEach(() => jest.clearAllMocks());

describe('two-population pagination — no gaps, no duplicates', () => {
  it('PAGE 1: Mallan-authored rows come first, then provider rows fill the budget', async () => {
    const ids = await page(0, 50);

    expect(ids).toHaveLength(50);
    // All 7 Mallan rows, in order, at the front.
    expect(ids.slice(0, MALLAN_COUNT)).toEqual(mallanRows.map((r) => r.listing_id));
    // Then provider rows 1..43 — NOT 1..50.
    expect(ids.slice(MALLAN_COUNT)).toEqual(
      providerRows.slice(0, 50 - MALLAN_COUNT).map((r) => r.listing_id),
    );
  });

  it('PAGE 2: starts at provider row 44, not provider row 51', async () => {
    // THE REGRESSION. A naive merge skips `offset` into the union and begins at
    // provider 51, dropping providers 44..50 entirely.
    const ids = await page(50, 50);

    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe(providerRows[50 - MALLAN_COUNT].listing_id); // provider #44
    expect(ids).toEqual(
      providerRows.slice(50 - MALLAN_COUNT, 100 - MALLAN_COUNT).map((r) => r.listing_id),
    );
    // No Mallan row may reappear on page 2.
    expect(ids.some((id) => id.startsWith('SL-'))).toBe(false);
  });

  it('FINAL PAGE: returns exactly the remainder', async () => {
    const ids = await page(100, 50);
    // Union is 107 rows, so page 3 holds the last 7.
    expect(ids).toHaveLength(MALLAN_COUNT + PROVIDER_COUNT - 100);
    expect(ids).toEqual(providerRows.slice(100 - MALLAN_COUNT).map((r) => r.listing_id));
  });

  it('PAST THE END: returns nothing rather than wrapping', async () => {
    expect(await page(200, 50)).toEqual([]);
  });

  it('UNION IS EXACT: every row appears once and none is missing', async () => {
    const seen = [...(await page(0, 50)), ...(await page(50, 50)), ...(await page(100, 50))];

    // No duplicates.
    expect(new Set(seen).size).toBe(seen.length);
    // No omissions — the concatenation equals the full union.
    expect(seen).toEqual([
      ...mallanRows.map((r) => r.listing_id),
      ...providerRows.map((r) => r.listing_id),
    ]);
    expect(seen).toHaveLength(MALLAN_COUNT + PROVIDER_COUNT);
  });

  it('SMALL PAGES: the boundary inside the Mallan block is exact', async () => {
    // limit 5 < 7 Mallan rows, so page 1 is Mallan-only and page 2 straddles the
    // boundary — the case where off-by-one errors hide.
    const p1 = await page(0, 5);
    const p2 = await page(5, 5);

    expect(p1).toEqual(mallanRows.slice(0, 5).map((r) => r.listing_id));
    expect(p2.slice(0, 2)).toEqual(mallanRows.slice(5, 7).map((r) => r.listing_id));
    expect(p2.slice(2)).toEqual(providerRows.slice(0, 3).map((r) => r.listing_id));
    expect(new Set([...p1, ...p2]).size).toBe(10);
  });

  it('the total reflects the UNION, not one population', async () => {
    findManyCalls.length = 0;
    const res = await GET(new NextRequest('http://test/api/crm/listings?limit=50'));
    const body = await res.json();
    expect(body.total).toBe(MALLAN_COUNT + PROVIDER_COUNT);
  });
});

describe('filters apply identically to BOTH populations', () => {
  it('?type and ?status reach the Mallan query and the provider query alike', async () => {
    findManyCalls.length = 0;
    await GET(
      new NextRequest('http://test/api/crm/listings?type=sale&status=Active&limit=50'),
    );

    // Both populations must be filtered — a filter applied to only one would
    // return a mixed, inconsistent page.
    expect(findManyCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of findManyCalls) {
      const w = j(call.where);
      expect(w).toContain('"listing_type":"sale"');
      expect(w).toContain('"status":"Active"');
    }
  });

  it('BROKER personal scope stays personal — no unscoped provider arm', async () => {
    findManyCalls.length = 0;
    await GET(new NextRequest('http://test/api/crm/listings?limit=50'));

    for (const call of findManyCalls) {
      const w = j(call.where);
      // The original defect: `{ mls_id: { not: null }, status: { in: TERMINAL } }`
      expect(w).not.toContain('"mls_id":{"not":null}');
      // Authorship must never be inferred from a visibility flag.
      expect(w).not.toContain('rls_eligible');
      // Participation must be present on every query.
      expect(w).toMatch(/list_agent_mls_id|agent_id/);
    }
  });
});
