/**
 * Release-safety P2 — control 3 tests: listing smoke module.
 * Fully mocked fetch — zero network, zero Neon/Cotality/R2 effect.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { runListingSmoke, FAILURE_STRINGS } = require('../../scripts/release-safety/listing-smoke.js');

const BASE = 'https://smoke.example';

type MockResponse = { status: number; body: string };
type Route = (url: string) => MockResponse | undefined;

function makeFetch(route: Route) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = jest.fn(async (url: string, opts: { method?: string }) => {
    calls.push({ url, method: (opts && opts.method) || 'GET' });
    const r = route(url) || { status: 404, body: 'not found' };
    return {
      status: r.status,
      text: async () => r.body,
    };
  });
  return { fetchImpl, calls };
}

const GOOD_LISTINGS = JSON.stringify({
  total: 2,
  listings: [
    { id: 'rls111', url: '/listing/foo-bar-slug/rls111', status: 'Active' },
    { id: 'rls222', url: '/listing/baz-slug/rls222', status: 'Active' },
  ],
});

function healthyRoutes(overrides: Record<string, MockResponse> = {}): Route {
  return (url: string) => {
    for (const [k, v] of Object.entries(overrides)) {
      if (url.includes(k)) return v;
    }
    if (url.includes('/api/listings/similar')) return { status: 200, body: '{"listings":[]}' };
    if (url.includes('/api/listings?limit=5')) return { status: 200, body: GOOD_LISTINGS };
    if (url.includes('/api/open-houses')) return { status: 200, body: '{"openHouses":[]}' };
    if (url.includes('/listing/foo-bar-slug/rls111')) return { status: 200, body: '<html>217 W 57th listing page</html>' };
    if (url.includes('/listing/rls111')) return { status: 200, body: '<html>alias page</html>' };
    return undefined;
  };
}

describe('release-safety P2 — listing smoke', () => {
  test('all five probes pass on a healthy site', async () => {
    const { fetchImpl } = makeFetch(healthyRoutes());
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(true);
    expect(result.probes.map((p: { name: string }) => p.name)).toEqual([
      'discovery',
      'canonical-detail',
      'id-alias',
      'similar-api',
      'open-houses-api',
    ]);
  });

  test('canonical probe consumes the API-returned url VERBATIM (never synthesized)', async () => {
    const { fetchImpl, calls } = makeFetch(healthyRoutes());
    await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const canonicalCall = calls.find((c) => c.url.includes('/listing/foo-bar-slug/'));
    expect(canonicalCall).toBeDefined();
    expect(canonicalCall!.url).toBe(`${BASE}/listing/foo-bar-slug/rls111`);
  });

  test('every request is GET-only', async () => {
    const { fetchImpl, calls } = makeFetch(healthyRoutes());
    await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  test('empty discovery is an explicit DISCOVERY_EMPTY failure — never a silent skip', async () => {
    const { fetchImpl } = makeFetch(
      healthyRoutes({ '/api/listings?limit=5': { status: 200, body: '{"total":0,"listings":[]}' } })
    );
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(false);
    const discovery = result.probes.find((p: { name: string }) => p.name === 'discovery');
    expect(discovery.failureClass).toBe('DISCOVERY_EMPTY');
  });

  test('E132 signature in a 200 body fails as FAILURE_TEXT (the PR #523 class)', async () => {
    const { fetchImpl } = makeFetch(
      healthyRoutes({
        'foo-bar-slug': { status: 200, body: '<html>app-static-to-dynamic-error in /listing/[...slug]</html>' },
      })
    );
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(false);
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.failureClass).toBe('FAILURE_TEXT');
    expect(FAILURE_STRINGS).toContain('app-static-to-dynamic-error');
  });

  test('5xx retries exactly once then fails with HTTP_STATUS', async () => {
    let openHouseCalls = 0;
    const { fetchImpl } = makeFetch((url) => {
      if (url.includes('/api/open-houses')) {
        openHouseCalls += 1;
        return { status: 500, body: 'boom' };
      }
      return healthyRoutes()(url);
    });
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(false);
    const oh = result.probes.find((p: { name: string }) => p.name === 'open-houses-api');
    expect(oh.failureClass).toBe('HTTP_STATUS');
    expect(oh.attempts).toBe(2);
    expect(openHouseCalls).toBe(2);
  });

  test('non-retryable failures (404 on alias) do not retry', async () => {
    const { fetchImpl } = makeFetch((url) => {
      if (url === `${BASE}/listing/rls111`) return { status: 404, body: 'gone' };
      return healthyRoutes()(url);
    });
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const alias = result.probes.find((p: { name: string }) => p.name === 'id-alias');
    expect(alias.ok).toBe(false);
    expect(alias.attempts).toBe(1);
  });

  test('discovered-listing 404 on canonical triggers ONE fresh discovery before verdict', async () => {
    let discoveryCalls = 0;
    const { fetchImpl } = makeFetch((url) => {
      if (url.includes('/api/listings?limit=5')) {
        discoveryCalls += 1;
        return { status: 200, body: GOOD_LISTINGS };
      }
      if (url.includes('foo-bar-slug')) return { status: 404, body: 'off market' };
      return healthyRoutes()(url);
    });
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(discoveryCalls).toBe(2); // initial + one re-discovery, bounded
    expect(result.passed).toBe(false); // same listing returned → still 404 → honest FAIL
  });

  test('rejects a missing/invalid baseUrl (usage contract)', async () => {
    await expect(runListingSmoke({ baseUrl: '' })).rejects.toThrow(/baseUrl/);
    await expect(runListingSmoke({ baseUrl: 'ftp://x' })).rejects.toThrow(/baseUrl/);
  });
});
