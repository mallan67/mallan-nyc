/// <reference types="jest" />
/**
 * GET /api/market — the cached rows cross a JSON boundary, and a Date does not survive it.
 *
 * Production, 2026-07-24 → 2026-11-02 (Vercel runtime errors): `e.first_active_date.getTime is not a
 * function` ×2,923 and `e.created_at.getTime is not a function` ×936. The route reads the active
 * sample through `cachedPublicRead` (Next `unstable_cache`). On a cache MISS the caller gets the live
 * row, with real Date objects; on a cache HIT the same value has been through JSON and the Dates are ISO
 * strings. The route called `.getTime()` on them, so a request served from the cache threw, and the listing
 * page's market card did not appear for it.
 *
 * The fix lives AT the boundary: the cached read hands back one JSON-safe shape (dates as ISO strings)
 * on a hit AND on a miss, and the route parses that shape in one place. These tests run the REAL route
 * handler with the cache stubbed as the real cache behaves: JSON on a hit, the live value on a miss.
 */
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// `mock`-prefixed so jest.mock's factory may close over it.
let mockCacheMode: 'hit' | 'miss' = 'hit';
jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  SEARCH_CACHE_TAG: 'search',
  cachedPublicRead:
    (fn: (...a: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const value = await fn(...args);
      // unstable_cache stores JSON: a HIT is the JSON round-trip of the value; a MISS is the value itself.
      return mockCacheMode === 'hit' ? JSON.parse(JSON.stringify(value)) : value;
    },
}));
jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: jest.fn(async () => 'token') }));
jest.mock('@/lib/idx/trestle-mapper', () => ({ __esModule: true, checkDistributionGates: () => ({ displayable: true }) }));

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prismaMock as any;
const TODAY = new Date('2026-10-09T16:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  list_price: 1_000_000,
  living_area: 1000,
  days_on_market: 0,
  first_active_date: null,
  status: 'Active',
  created_at: new Date('2026-07-11T12:00:00Z'),
  modification_timestamp: new Date('2026-10-01T12:00:00Z'),
  ...over,
});

beforeAll(() => {
  jest.useFakeTimers({
    now: TODAY,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
  });
});
afterAll(() => { jest.useRealTimers(); });
beforeEach(() => {
  db.listing.findMany = jest.fn(async () => []);
  db.listing.count = jest.fn(async () => 0);
  db.listing.groupBy = jest.fn(async () => []);
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ value: [] }) }));
});

// The route keeps its answers for five minutes by type, period, borough and neighborhood: one borough per case.
let n = 0;
const get = async (activeRows: unknown[]) => {
  db.listing.findMany = jest.fn(async (args: any) => (args?.where?.status === 'Closed' ? [] : activeRows));
  const route = await import('@/app/api/market/route');
  const res = await route.GET(new Request(`http://localhost/api/market?type=sale&period=90d&borough=Case${++n}`));
  return { res, body: (await res.json()) as any };
};

describe.each([['cache HIT (JSON round-trip: Dates become strings)', 'hit'], ['cache MISS (the live rows: real Dates)', 'miss']] as const)(
  'GET /api/market on a %s',
  (_label, mode) => {
    beforeEach(() => { mockCacheMode = mode; });

    it('answers 200 and computes days on market from first_active_date, then created_at', async () => {
      const { res, body } = await get([
        row({ first_active_date: new Date('2026-09-09T16:00:00Z') }), // 30 days before the fixed clock
        row({ first_active_date: null, created_at: new Date('2026-07-11T16:00:00Z') }), // no first_active_date: 90 days from created_at
        row({ days_on_market: 12 }), // the stored count wins over any date
      ]);
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.active.medianDaysOnMarket).toBe(30); // median of [30, 90, 12]
      expect(body.active.medianPrice).toBe(1_000_000);
    });

    it('a missing date is skipped, never NaN and never a 500', async () => {
      const { res, body } = await get([
        row({ first_active_date: null, created_at: null }),
        row({ first_active_date: new Date('2026-10-04T16:00:00Z') }), // 5 days
      ]);
      expect(res.status).toBe(200);
      expect(body.active.medianDaysOnMarket).toBe(5);
    });

    it('an invalid date is skipped the same way (an Invalid Date serialises to null; a bad string is ignored)', async () => {
      const { res, body } = await get([
        row({ first_active_date: new Date('not-a-date'), created_at: new Date('also-bad') }),
        row({ first_active_date: 'garbage', created_at: 'garbage' }),
        row({ first_active_date: new Date('2026-09-29T16:00:00Z') }), // 10 days
      ]);
      expect(res.status).toBe(200);
      expect(body.active.medianDaysOnMarket).toBe(10);
      expect(JSON.stringify(body)).not.toMatch(/NaN|null,null/);
    });

    it('with no usable date at all the median is null, not an error', async () => {
      const { res, body } = await get([row({ first_active_date: null, created_at: null })]);
      expect(res.status).toBe(200);
      expect(body.active.medianDaysOnMarket).toBeNull();
    });

    it('rental statistics read the same way (type=rent keeps its filter and its dates)', async () => {
      db.listing.findMany = jest.fn(async (args: any) => (args?.where?.status === 'Closed' ? [] : [row({ list_price: 4500, first_active_date: new Date('2026-10-02T16:00:00Z') })]));
      const route = await import('@/app/api/market/route');
      const res = await route.GET(new Request(`http://localhost/api/market?type=rent&period=90d&borough=Rental${++n}`));
      const body = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(body.filters.type).toBe('rent');
      expect(body.active.medianPrice).toBe(4500);
      expect(body.active.medianDaysOnMarket).toBe(7);
    });
  },
);

describe('the two cache paths agree', () => {
  it('a HIT and a MISS of the same rows give the same statistics', async () => {
    const rows = [
      row({ first_active_date: new Date('2026-09-09T16:00:00Z') }),
      row({ first_active_date: null, created_at: new Date('2026-07-11T16:00:00Z'), list_price: 2_000_000 }),
    ];
    mockCacheMode = 'miss';
    const miss = await get(rows);
    mockCacheMode = 'hit';
    const hit = await get(rows);
    expect(hit.res.status).toBe(200);
    expect(miss.res.status).toBe(200);
    expect(hit.body.active).toEqual(miss.body.active);
  });
});
