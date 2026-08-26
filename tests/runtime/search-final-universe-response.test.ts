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
    // NUMERIC, like real provider keys. Live: a non-numeric ListingKey literal
    // makes Cotality return HTTP 500, so the continuation refuses to mint a
    // boundary from one — a fixture with fake keys would fail for that reason
    // rather than for the reason under test.
    ListingKey: String(1146011469 + n),
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
  // Continuation is FAIL-CLOSED: without a sealing key no token is minted at
  // all. Set here so the resume path is exercised; the env var itself is a
  // protected boundary and this suite must not depend on one existing.
  process.env.SEARCH_CONTINUATION_SECRET =
    process.env.SEARCH_CONTINUATION_SECRET || 'test-only-continuation-secret-value';
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
    expect(body.count.excluded.providerDuplicates).toBe(1);
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

describe('the route pages the FINAL universe', () => {
  /** 60 provider rows with three gated inside the first page. */
  const gappy = () =>
    Array.from({ length: 60 }, (_, i) =>
      i === 3 || i === 8 || i === 9 ? row(i + 1, { Permission: 'Private' }) : row(i + 1),
    );

  function serve(records: any[]) {
    mockFetchFromTrestle.mockImplementation(async (args: any) => {
      const start = args.skip ?? 0;
      const slice = records.slice(start, start + (args.top ?? 50));
      return {
        records: slice,
        odataCount: records.length,
        hasMore: start + slice.length < records.length,
        nextLink: start + slice.length < records.length ? 'https://next' : undefined,
        totalFetched: slice.length,
      };
    });
  }

  it('page 2 starts at the 21st SURVIVOR, not provider row 21', async () => {
    serve(gappy());
    const survivors = gappy().filter((r) => r.Permission !== 'Private');
    const p2 = await callSearch('type=sale&limit=20&page=2');
    expect(p2.listings.map((l: any) => l.lid ?? l.id)).toHaveLength(20);
    expect(p2.page).toBe(2);
    // The 21st survivor's ListingId, whatever provider row it came from.
    expect(JSON.stringify(p2.listings)).toContain(survivors[20].ListingId);
  });

  it('no listing appears on two pages and none is skipped', async () => {
    serve(gappy());
    const seen: string[] = [];
    for (let p = 1; p <= 3; p += 1) {
      const body = await callSearch(`type=sale&limit=20&page=${p}`);
      seen.push(...body.listings.map((l: any) => l.rlsId ?? l.lid ?? l.id));
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(57); // 60 provider rows, 3 gated
  });

  it('every page is full except the last', async () => {
    serve(gappy());
    const sizes: number[] = [];
    for (let p = 1; p <= 3; p += 1) {
      sizes.push((await callSearch(`type=sale&limit=20&page=${p}`)).listings.length);
    }
    expect(sizes).toEqual([20, 20, 17]);
  });

  it('a legacy skip still lands on the right page', async () => {
    // skip is a PROVIDER offset and cannot express a broker page, so it is
    // folded into `page` rather than also offsetting the walk — applying both
    // would page twice and step over rows.
    serve(gappy());
    const viaSkip = await callSearch('type=sale&limit=20&skip=20');
    const viaPage = await callSearch('type=sale&limit=20&page=2');
    expect(viaSkip.page).toBe(2);
    expect(JSON.stringify(viaSkip.listings)).toBe(JSON.stringify(viaPage.listings));
  });

  it('an unknown sort is refused by name rather than silently defaulted', async () => {
    serve(gappy());
    const { GET } = await import('@/app/api/idx/search/route');
    const res = await GET(
      new NextRequest('https://x.test/api/idx/search?type=sale&sort=DaysOnMarket%20desc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('UNSUPPORTED_SORT');
    expect(body.requested).toBe('DaysOnMarket desc');
  });
});

/**
 * MALLAN CANONICAL LISTING IDENTITY IS NOT PROVIDER-ROW DEDUPE.
 *
 * The engine's dedupe step removes a repeated PROVIDER row — two Cotality rows
 * carrying the same ListingKey. That is provider-row hygiene and it is all it
 * proves.
 *
 * Mallan canonical identity is a different domain. A Mallan-authored listing and
 * the Cotality return-copy of that same listing are ONE canonical Mallan
 * listing: the Mallan-authored row is the canonical editable identity and the
 * provider copy is a COMPETING listing, suppressed by office whether or not a
 * matching twin is found. Deduping on ListingKey could never express that,
 * because the two rows do not share a provider key.
 *
 * So the suppression happens at the PROVIDER BOUNDARY, using the clause that
 * already existed for exactly this and had no live-Trestle caller.
 */
describe('Mallan-office return copies are suppressed at the provider boundary', () => {
  it('the emitted filter carries the office exclusion', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1)],
      odataCount: 1,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 1,
    });
    await callSearch();
    const sent = mockFetchFromTrestle.mock.calls[0][0];
    expect(sent.filter).toContain("ListOfficeMlsId ne '7041'");
  });

  it('the exclusion preserves rows with NO office', async () => {
    // `ne` against null is not reliably inclusive in OData, so the clause is
    // written as an explicit (null OR not-Mallan). A bare `ne` would silently
    // drop every null-office listing.
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1)],
      odataCount: 1,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 1,
    });
    await callSearch();
    const sent = mockFetchFromTrestle.mock.calls[0][0];
    expect(sent.filter).toContain('ListOfficeMlsId eq null or');
  });

  it('the criteria filter is still applied alongside it', async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1)],
      odataCount: 1,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 1,
    });
    await callSearch('type=sale&minPrice=500000');
    const sent = mockFetchFromTrestle.mock.calls[0][0];
    expect(sent.filter).toContain('ListPrice');
    expect(sent.filter).toContain("ListOfficeMlsId ne '7041'");
  });

  it('provider-row dedupe is reported under its own name', async () => {
    // Not "canonical", because it is not.
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1), row(2), row(1)],
      odataCount: 3,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 3,
    });
    const body = await callSearch();
    expect(body.count.excluded.providerDuplicates).toBe(1);
    expect(body.count.excluded).not.toHaveProperty('duplicates');
  });
});

/**
 * THE ROUTE HANDS ON A CONTINUATION, AND REFUSES A FOREIGN ONE.
 *
 * The read budget bounds the work of one request. Without a way to resume it
 * would also bound how much inventory is reachable at all, and the authorized
 * provider population is already around 591,000 rows.
 */
describe('continuation over the route', () => {
  function serveMany(total: number) {
    mockFetchFromTrestle.mockImplementation(async (args: any) => {
      const start = args.skip ?? 0;
      const slice = Array.from(
        { length: Math.max(0, Math.min(args.top ?? 50, total - start)) },
        (_, i) => row(start + i + 1),
      );
      return {
        records: slice,
        odataCount: total,
        hasMore: start + slice.length < total,
        nextLink: start + slice.length < total ? 'https://next' : undefined,
        totalFetched: slice.length,
      };
    });
  }

  it('a page that is not the end hands on a continuation', async () => {
    serveMany(100_000);
    const body = await callSearch('type=sale&limit=20');
    expect(typeof body.continuation).toBe('string');
    expect(body.continuation.length).toBeGreaterThan(10);
  });

  it('the continuation resumes and returns DIFFERENT rows', async () => {
    serveMany(100_000);
    const first = await callSearch('type=sale&limit=20');
    // page=2 because the token says so: the page is derived from the sealed
    // survivor position, not asserted by the caller.
    const second = await callSearch(
      'type=sale&limit=20&page=2&continuation=' + encodeURIComponent(first.continuation),
    );
    const idsOf = (b: any) => b.listings.map((l: any) => JSON.stringify(l)).join('|');
    expect(second.listings).toHaveLength(20);
    expect(idsOf(second)).not.toBe(idsOf(first));
  });

  it('an exhausted provider hands on nothing to resume', async () => {
    serveMany(10);
    const body = await callSearch('type=sale&limit=20');
    expect(body.continuation).toBeNull();
  });

  it('a continuation from a DIFFERENT search is refused by name', async () => {
    serveMany(100_000);
    const first = await callSearch('type=sale&limit=20');
    const { GET } = await import('@/app/api/idx/search/route');
    // Same token, different criteria — the position now describes another
    // universe, and silently restarting would hand back page 1.
    const res = await GET(
      new NextRequest(
        'https://x.test/api/idx/search?type=sale&limit=20&page=2&minPrice=900000&continuation=' +
          encodeURIComponent(first.continuation),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_CONTINUATION');
    expect(body.reason).toMatch(/different search or sort order/);
  });

  it('a tampered continuation is refused rather than restarted', async () => {
    serveMany(100_000);
    const { GET } = await import('@/app/api/idx/search/route');
    const res = await GET(
      new NextRequest('https://x.test/api/idx/search?type=sale&limit=20&continuation=garbage'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_CONTINUATION');
  });
});

describe('continuation is fail-closed when it cannot be sealed', () => {
  it('no token is offered without a sealing key', async () => {
    // An unsigned position a caller can edit and re-encode is not a validated
    // continuation. Rather than ship one and call it validated, the feature is
    // simply not offered and paging falls back to the bounded rescan.
    const saved = process.env.SEARCH_CONTINUATION_SECRET;
    delete process.env.SEARCH_CONTINUATION_SECRET;
    try {
      jest.resetModules();
      mockFetchFromTrestle.mockResolvedValue({
        records: Array.from({ length: 50 }, (_, i) => row(i + 1)),
        odataCount: 100_000,
        hasMore: true,
        nextLink: 'https://next',
        totalFetched: 50,
      });
      const body = await callSearch('type=sale&limit=20');
      expect(body.continuation).toBeNull();
      // The rows themselves are unaffected — only the resume shortcut is gone.
      expect(body.listings).toHaveLength(20);
    } finally {
      if (saved) process.env.SEARCH_CONTINUATION_SECRET = saved;
    }
  });
});

/**
 * THE PAGE NUMBER IS NOT A CALLER'S ASSERTION.
 *
 * The token is sealed, but `page` travelled beside it unchecked — the seal
 * protects the payload and the page number was never in the payload. A valid
 * page-1 continuation sent with `page=99` returned the next rows and labelled
 * them page 99.
 */
describe('a sealed continuation with the wrong page is refused', () => {
  function serveMany(total: number) {
    mockFetchFromTrestle.mockImplementation(async (args: any) => {
      const start = args.skip ?? 0;
      const slice = Array.from(
        { length: Math.max(0, Math.min(args.top ?? 50, total - start)) },
        (_, i) => row(start + i + 1),
      );
      return {
        records: slice,
        odataCount: total,
        hasMore: start + slice.length < total,
        nextLink: start + slice.length < total ? 'https://next' : undefined,
        totalFetched: slice.length,
      };
    });
  }

  it.each([1, 3, 99])('page=%p against a page-2 token is rejected', async (wrongPage) => {
    serveMany(100_000);
    const first = await callSearch('type=sale&limit=20');
    const { GET } = await import('@/app/api/idx/search/route');
    const res = await GET(
      new NextRequest(
        `https://x.test/api/idx/search?type=sale&limit=20&page=${wrongPage}&continuation=` +
          encodeURIComponent(first.continuation),
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_CONTINUATION');
    expect(body.reason).toMatch(/describes page 2/);
  });
});

describe('the response discloses what continuation it can actually do', () => {
  it('states availability and mode rather than leaving the client to guess', async () => {
    // A client must never assume deep continuation exists merely because the
    // code supports it — the sealing secret is a protected env requirement.
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1)],
      odataCount: 1,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 1,
    });
    const body = await callSearch();
    expect(typeof body.continuationAvailable).toBe('boolean');
    expect(['keyset', 'bounded_rescan']).toContain(body.continuationMode);
  });
});

describe('resumed-segment telemetry balances on the SEGMENT', () => {
  it('segment rows read = identityless + gated + duplicates + segment survivors', async () => {
    // universe.count is CUMULATIVE. Feeding it into an identity built from
    // this segment's row count made the identity fail on every resumed request
    // even when Search was correct — which trains a reader to ignore it.
    mockFetchFromTrestle.mockResolvedValue({
      records: [row(1), row(2, { Permission: 'Private' }), row(3, { ListingKey: null }), row(1)],
      odataCount: 4,
      hasMore: false,
      nextLink: undefined,
      totalFetched: 4,
    });
    const body = await callSearch();
    const m = body._meta;
    expect(m.exclusionsBalance).toBe(true);
    expect(
      m.identityless + m.gatedOut + m.providerDuplicates + m.segmentSurvivorsTraversed,
    ).toBe(m.segmentProviderRowsRead);
    // And the cumulative figure is reported SEPARATELY, answering a different
    // question from the segment one.
    expect(typeof m.cumulativeSurvivorsObserved).toBe('number');
  });
});
