/// <reference types="jest" />
/**
 * WHAT /api/idx/search PROMISES ABOUT ITS OWN COUNT.
 *
 * The engine contract is proven in lib/search/__tests__/final-universe.test.ts.
 * This proves the ROUTE is actually wired to it, and that the number it hands a
 * broker means what the response says it means.
 *
 * The response used to carry:
 *
 *     total: result.odataCount ?? listings.length
 *
 * `@odata.count` is the PROVIDER matching universe — the rows Cotality matched
 * BEFORE identity, distribution gates and canonical dedupe removed any. Those
 * are two different sets, so that number could never be a result count. A live
 * Manhattan Active-residential search matches 4,622 listings while the broker
 * was shown at most 200.
 *
 * Both facts are still reported. They are just no longer the same field.
 */
const mockFetchFromTrestle = jest.fn();

jest.mock('@/lib/idx/fetch', () => ({
  __esModule: true,
  fetchFromTrestle: (args: unknown) => mockFetchFromTrestle(args),
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ userId: 'u1', role: 'AGENT' }),
  isAuthError: () => false,
}));

jest.mock('@/lib/idx/auth', () => ({
  __esModule: true,
  hasCredentials: () => true,
}));

jest.mock('@/lib/idx/logger', () => ({
  __esModule: true,
  logFetchAttempt: () => ({ complete: () => {} }),
}));

import { NextRequest } from 'next/server';

/** A displayable provider row: real key, no opt-out, internet display allowed. */
function row(n: number, extra: Record<string, unknown> = {}) {
  return {
    ListingKey: `K${String(n).padStart(5, '0')}`,
    ListingId: `RLS${n}`,
    StandardStatus: 'Active',
    PropertyType: 'Residential',
    ListPrice: 1_000_000,
    City: 'New York',
    StateOrProvince: 'NY',
    PostalCode: '10016',
    StreetName: 'Broadway',
    ListAgentMlsId: 'A1',
    ListOfficeName: 'Office',
    ModificationTimestamp: '2026-08-01T00:00:00Z',
    Permission: 'IDX',
    ...extra,
  };
}

async function callSearch(query = 'type=sale'): Promise<any> {
  const { GET } = await import('@/app/api/idx/search/route');
  const res = await GET(new NextRequest(`https://x.test/api/idx/search?${query}`));
  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(`route returned ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

beforeEach(() => {
  jest.resetModules();
  mockFetchFromTrestle.mockReset();
  // The route refuses to run unless IDX is switched on. That guard is correct
  // and is not what is under test here.
  process.env.IDX_ENABLED = 'true';
});

describe('the count describes the FINAL universe, not the provider universe', () => {
  it('excluded rows are not counted as results', async () => {
    // 10 provider rows, 3 of them participant-only. The provider matched 10;
    // exactly 7 are results.
    mockFetchFromTrestle.mockResolvedValue({
      records: [
        row(1),
        row(2, { Permission: 'Private' }),
        row(3),
        row(4, { Permission: 'Private' }),
        row(5),
        row(6),
        row(7, { Permission: 'Private' }),
        row(8),
        row(9),
        row(10),
      ],
      odataCount: 10,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 10,
    });

    const body = await callSearch();
    expect(body.listings).toHaveLength(7);
    expect(body.total).toBe(7);
    expect(body.count.value).toBe(7);
  });

  it('keeps the provider count, and keeps it SEPARATE', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1), row(2, { Permission: 'Private' })],
      odataCount: 4_622,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 2,
    });

    const body = await callSearch();
    // Both facts survive. They are simply no longer the same number.
    expect(body.count.providerMatched).toBe(4_622);
    expect(body.count.value).toBe(1);
    expect(body.total).not.toBe(body.count.providerMatched);
  });

  it('attributes every exclusion by reason', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1), row(2, { Permission: 'Private' }), row(3, { ListingKey: null })],
      odataCount: 3,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 3,
    });

    const body = await callSearch();
    // "2 excluded" would not answer a broker asking why a listing is missing.
    expect(body.count.excluded.identityless).toBe(1);
    expect(Object.values(body.count.excluded.gated).reduce((a: any, b: any) => a + b, 0)).toBe(1);
  });

  it('a provider twin is counted once', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1), row(2), row(1)],
      odataCount: 3,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 3,
    });

    const body = await callSearch();
    expect(body.count.value).toBe(2);
    expect(body.count.excluded.duplicates).toBe(1);
  });
});

describe('the count says whether it is exact', () => {
  it('EXACT when the provider offered no nextLink', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1), row(2)],
      odataCount: 2,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 2,
    });

    const body = await callSearch();
    expect(body.count.isExact).toBe(true);
    expect(body.count.meaning).toBe('EXACT_FINAL_UNIVERSE');
  });

  it('a declared LOWER BOUND when the provider had more to give', async () => {
    // The forbidden outcome is an approximation that looks exact.
    mockFetchFromTrestle.mockResolvedValue({
      records: Array.from({ length: 50 }, (_, i) => row(i + 1)),
      odataCount: 4_622,
      hasMore: true,
      nextLink: 'https://api.cotality.com/next',
      totalFetched: 50,
    });

    const body = await callSearch('type=sale&limit=25');
    expect(body.count.isExact).toBe(false);
    expect(body.count.meaning).toBe('LOWER_BOUND_TRUNCATED');
  });

  it('exactness is never inferred from a page that merely filled up', async () => {
    // fetchFromTrestle reports hasMore as `hasMore || fetched >= maxTotal`, so a
    // page that fills exactly looks like "more" even at the end of the universe.
    // Only the absence of a provider nextLink may license EXACT.
    mockFetchFromTrestle.mockResolvedValue({
      records: Array.from({ length: 50 }, (_, i) => row(i + 1)),
      odataCount: 50,
      hasMore: true,
      nextLink: undefined,
      totalFetched: 50,
    });

    const body = await callSearch('type=sale&limit=50');
    expect(body.count.isExact).toBe(true);
  });
});

describe('the page is cut from the final universe', () => {
  it('a page is FULL even when rows inside it were gated', async () => {
    // The defect: gating three rows out of a 50-row provider page produced a
    // 47-row page that read as "the search found fewer listings".
    const records = Array.from({ length: 60 }, (_, i) =>
      i === 3 || i === 8 || i === 9 ? row(i + 1, { Permission: 'Private' }) : row(i + 1),
    );
    mockFetchFromTrestle.mockResolvedValue({
      records,
      odataCount: 60,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 60,
    });

    const body = await callSearch('type=sale&limit=50');
    expect(body.listings).toHaveLength(50);
  });

  it('totalPages describes the same universe the count does', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: Array.from({ length: 30 }, (_, i) => row(i + 1)),
      odataCount: 30,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 30,
    });

    const body = await callSearch('type=sale&limit=10');
    // 30 results at 10 per page. If these disagree, the last page number lies.
    expect(body.count.value).toBe(30);
    expect(body.totalPages).toBe(3);
  });
});
