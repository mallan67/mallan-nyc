/**
 * Release-safety P2 — control 3 tests: listing smoke module.
 * Fully mocked fetch — zero network, zero Neon/Cotality/R2 effect.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  runListingSmoke,
  FAILURE_STRINGS,
  LISTING_UNAVAILABLE_TEXT,
  buildSimilarQueryFromListing,
  validateSimilarResponse,
  assessListingPageBody,
} = require('../../scripts/release-safety/listing-smoke.js');

const BASE = 'https://smoke.example';
const CANONICAL = '/listing/foo-bar-slug/rls111';

type MockResponse = { status: number; body: string; url?: string };
type Route = (url: string) => MockResponse | undefined;

function makeFetch(route: Route) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = jest.fn(async (url: string, opts: { method?: string }) => {
    calls.push({ url, method: (opts && opts.method) || 'GET' });
    const r = route(url) || { status: 404, body: 'not found' };
    return {
      status: r.status,
      url: r.url,
      text: async () => r.body,
    };
  });
  return { fetchImpl, calls };
}

const LISTING_A = {
  id: 'rls111',
  url: CANONICAL,
  status: 'Active',
  listingType: 'sale',
  listPrice: 1250000,
  bedroomsTotal: 2,
  propertyType: 'Condo',
  propertySubType: 'Apartment',
  address: { postalCode: '10019' },
};

const GOOD_LISTINGS = JSON.stringify({
  success: true,
  total: 2,
  listings: [
    LISTING_A,
    { ...LISTING_A, id: 'rls222', url: '/listing/baz-slug/rls222' },
  ],
});

const GOOD_SIMILAR = JSON.stringify({
  listings: [],
  _compliance: { source: 'idx', attribution: 'REBNY RLS' },
});

/** Mirrors the REAL production canonical-page HTML shape (characterized
 *  2026-07-19): canonical link + listing identity + the DORMANT serialized
 *  notFound template inside escaped RSC flight data. */
const HEALTHY_CANONICAL_BODY =
  `<html><head><link rel="canonical" href="https://smoke.example${CANONICAL}">` +
  `<title>217 W 57th Street, #127/128 | Mallan Real Estate</title></head>` +
  `<body><h1>217 W 57th Street</h1><div>rls111</div>` +
  `<script>self.__next_f.push([1,"{\\"className\\":\\"text-3xl\\",\\"children\\":\\"Listing Not Available\\"}"])</script>` +
  `</body></html>`;

function healthyRoutes(overrides: Record<string, MockResponse> = {}): Route {
  return (url: string) => {
    for (const [k, v] of Object.entries(overrides)) {
      if (url.includes(k)) return v;
    }
    if (url.includes('/api/listings/similar')) return { status: 200, body: GOOD_SIMILAR };
    if (url.includes('/api/listings?limit=5')) return { status: 200, body: GOOD_LISTINGS };
    if (url.includes('/api/open-houses')) return { status: 200, body: '{"openHouses":[]}' };
    if (url.includes('/listing/foo-bar-slug/rls111')) return { status: 200, body: HEALTHY_CANONICAL_BODY };
    // Alias page renders with the canonical link in the body (no redirect):
    if (url.includes('/listing/rls111')) return { status: 200, body: `<html><link rel="canonical" href="${CANONICAL}">alias page</html>` };
    return undefined;
  };
}

describe('release-safety P2 — listing smoke', () => {
  test('all five probes pass on a healthy site; evidence fields are factual, no tier label', async () => {
    const { fetchImpl } = makeFetch(healthyRoutes());
    const result = await runListingSmoke({
      baseUrl: BASE,
      fetchImpl,
      timeoutMs: 500,
      expectedSha: 'abc123',
      deploymentId: 'dpl_x',
      now: () => '2026-07-19T12:00:00.000Z',
    });
    expect(result.passed).toBe(true);
    expect(result.probes.map((p: { name: string }) => p.name)).toEqual([
      'discovery',
      'canonical-detail',
      'id-alias',
      'similar-api',
      'open-houses-api',
    ]);
    expect(result.observed_at).toBe('2026-07-19T12:00:00.000Z');
    expect(result.base_url).toBe(BASE);
    expect(result.expected_sha).toBe('abc123');
    expect(result.deployment_id).toBe('dpl_x');
    expect(result.listing).toEqual({ id: 'rls111', canonical_url: CANONICAL });
    expect(JSON.stringify(result)).not.toContain('PRODUCTION-PROVEN');
    expect((result as Record<string, unknown>).tier).toBeUndefined();
  });

  test('canonical probe consumes the API-returned url VERBATIM (never synthesized)', async () => {
    const { fetchImpl, calls } = makeFetch(healthyRoutes());
    await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const canonicalCall = calls.find((c) => c.url.includes('/listing/foo-bar-slug/'));
    expect(canonicalCall).toBeDefined();
    expect(canonicalCall!.url).toBe(`${BASE}${CANONICAL}`);
  });

  test('every request is GET-only', async () => {
    const { fetchImpl, calls } = makeFetch(healthyRoutes());
    await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  test('discovery requires success === true (missing => BAD_CONTRACT)', async () => {
    const noSuccess = JSON.stringify({ total: 1, listings: [LISTING_A] });
    const { fetchImpl } = makeFetch(healthyRoutes({ '/api/listings?limit=5': { status: 200, body: noSuccess } }));
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(false);
    const discovery = result.probes.find((p: { name: string }) => p.name === 'discovery');
    expect(discovery.failureClass).toBe('BAD_CONTRACT');
    expect(discovery.detail).toContain('success');
  });

  test('empty discovery is an explicit DISCOVERY_EMPTY failure — never a silent skip', async () => {
    const { fetchImpl } = makeFetch(
      healthyRoutes({ '/api/listings?limit=5': { status: 200, body: '{"success":true,"total":0,"listings":[]}' } })
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
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.failureClass).toBe('FAILURE_TEXT');
    expect(FAILURE_STRINGS).toContain('app-static-to-dynamic-error');
  });

  test('failure-text matching is CASE-INSENSITIVE', async () => {
    const { fetchImpl } = makeFetch(
      healthyRoutes({ 'foo-bar-slug': { status: 200, body: '<html>LISTING NOT AVAILABLE</html>' } })
    );
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.ok).toBe(false);
    expect(canonical.failureClass).toBe('FAILURE_TEXT');
  });

  test('an ACTUAL "Listing Not Available" page (rendered text node) fails as FAILURE_TEXT', async () => {
    const { fetchImpl } = makeFetch(
      healthyRoutes({ 'foo-bar-slug': { status: 200, body: '<html><h1>Listing Not Available</h1></html>' } })
    );
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.ok).toBe(false);
    expect(canonical.failureClass).toBe('FAILURE_TEXT');
    expect(canonical.detail).toContain('ACTIVE page result');
  });

  test('a DORMANT serialized notFound template in otherwise-valid listing HTML PASSES (production shape)', async () => {
    // The default healthy fixture carries the dormant escaped-flight
    // template exactly as production does — this pins the tolerance and
    // checks the honest note.
    const { fetchImpl } = makeFetch(healthyRoutes());
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(true);
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.ok).toBe(true);
    expect(canonical.note).toContain('dormant serialized notFound template');
  });

  test('the unavailable phrase WITHOUT listing identity fails even in non-rendered form', async () => {
    const sneaky =
      `<html><script>self.__next_f.push([1,"\\"children\\":\\"Listing Not Available\\""])</script>no listing here</html>`;
    const { fetchImpl } = makeFetch(healthyRoutes({ 'foo-bar-slug': { status: 200, body: sneaky } }));
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.ok).toBe(false);
    expect(canonical.failureClass).toBe('FAILURE_TEXT');
    expect(canonical.detail).toContain('lacks the expected listing identity');
  });

  test('canonical identity mismatch fails as BAD_CONTRACT (page does not represent the listing)', async () => {
    const wrongPage = '<html><link rel="canonical" href="/listing/other-slug/rls999"><h1>Another listing</h1>rls999</html>';
    const { fetchImpl } = makeFetch(healthyRoutes({ 'foo-bar-slug': { status: 200, body: wrongPage } }));
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
    expect(canonical.ok).toBe(false);
    expect(canonical.failureClass).toBe('BAD_CONTRACT');
    expect(canonical.detail).toContain('does not represent the discovered listing');
  });

  test('unit: assessListingPageBody distinguishes active vs dormant vs missing identity', () => {
    const dormant = `<link rel="canonical" href="https://x${CANONICAL}"> rls111 <script>"\\"children\\":\\"Listing Not Available\\""</script>`;
    expect(assessListingPageBody(dormant, CANONICAL, 'rls111').ok).toBe(true);
    expect(assessListingPageBody('<h1>Listing Not Available</h1>', CANONICAL, 'rls111').ok).toBe(false);
    expect(assessListingPageBody('<h2>  listing not available  </h2>', CANONICAL, 'rls111').ok).toBe(false);
    const noIdentity = assessListingPageBody('<html>healthy-looking but wrong page</html>', CANONICAL, 'rls111');
    expect(noIdentity.ok).toBe(false);
    expect(noIdentity.failureClass).toBe('BAD_CONTRACT');
    expect(LISTING_UNAVAILABLE_TEXT).toBe('Listing Not Available');
    expect(FAILURE_STRINGS).not.toContain('Listing Not Available'); // no longer a blanket signature
  });

  test('E550 and "no-store fetch" texts fail as FAILURE_TEXT', async () => {
    for (const bad of ['Error: E550 static generation failed', 'caused by a no-store fetch in render']) {
      const { fetchImpl } = makeFetch(healthyRoutes({ 'foo-bar-slug': { status: 200, body: `<html>${bad}</html>` } }));
      const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
      const canonical = result.probes.find((p: { name: string }) => p.name === 'canonical-detail');
      expect(canonical.ok).toBe(false);
      expect(canonical.failureClass).toBe('FAILURE_TEXT');
    }
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
    const oh = result.probes.find((p: { name: string }) => p.name === 'open-houses-api');
    expect(oh.failureClass).toBe('HTTP_STATUS');
    expect(oh.attempts).toBe(2);
    expect(openHouseCalls).toBe(2);
  });

  test('id-alias must provably end at the expected canonical URL (redirect target counts)', async () => {
    const { fetchImpl } = makeFetch((url) => {
      if (url === `${BASE}/listing/rls111`) {
        return { status: 200, body: '<html>followed</html>', url: `${BASE}${CANONICAL}` };
      }
      return healthyRoutes()(url);
    });
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const alias = result.probes.find((p: { name: string }) => p.name === 'id-alias');
    expect(alias.ok).toBe(true);
  });

  test('id-alias that does NOT end at the canonical URL fails as BAD_CONTRACT', async () => {
    const { fetchImpl } = makeFetch((url) => {
      if (url === `${BASE}/listing/rls111`) {
        return { status: 200, body: '<html>some other page, no canonical link</html>' };
      }
      return healthyRoutes()(url);
    });
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const alias = result.probes.find((p: { name: string }) => p.name === 'id-alias');
    expect(alias.ok).toBe(false);
    expect(alias.failureClass).toBe('BAD_CONTRACT');
    expect(alias.detail).toContain('canonical');
  });

  test('similar response WITHOUT _compliance.source fails BAD_CONTRACT (the empty short-circuit shape)', async () => {
    const { fetchImpl } = makeFetch(
      healthyRoutes({ '/api/listings/similar': { status: 200, body: '{"listings":[]}' } })
    );
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const similar = result.probes.find((p: { name: string }) => p.name === 'similar-api');
    expect(similar.ok).toBe(false);
    expect(similar.failureClass).toBe('BAD_CONTRACT');
    expect(similar.detail).toContain('_compliance.source');
  });

  test('the similar URL carries the DISCOVERED postal code, price, beds, type and excludeId', async () => {
    const { fetchImpl, calls } = makeFetch(healthyRoutes());
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(true);
    const similarCall = calls.find((c) => c.url.includes('/api/listings/similar'));
    const qs = new URL(similarCall!.url).searchParams;
    expect(qs.get('postalCode')).toBe('10019');
    expect(qs.get('price')).toBe('1250000');
    expect(qs.get('beds')).toBe('2');
    expect(qs.get('type')).toBe('sale');
    expect(qs.get('excludeId')).toBe('rls111');
    expect(qs.get('propertyType')).toBe('Condo');
    expect(qs.get('propertySubType')).toBe('Apartment');
  });

  test('missing postal code or price => BAD_CONTRACT, and NO similar request is issued', async () => {
    const degraded = JSON.stringify({
      success: true,
      total: 1,
      listings: [{ ...LISTING_A, listPrice: 0, address: { postalCode: '' } }],
    });
    const { fetchImpl, calls } = makeFetch(healthyRoutes({ '/api/listings?limit=5': { status: 200, body: degraded } }));
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    expect(result.passed).toBe(false);
    const similar = result.probes.find((p: { name: string }) => p.name === 'similar-api');
    expect(similar.failureClass).toBe('BAD_CONTRACT');
    expect(similar.detail).toContain('listPrice');
    expect(similar.detail).toContain('address.postalCode');
    expect(calls.some((c) => c.url.includes('/api/listings/similar'))).toBe(false);
  });

  test('open-houses is labeled HTTP/JSON-CONTRACT-PROVEN with backend health explicitly UNVERIFIED', async () => {
    const { fetchImpl } = makeFetch(healthyRoutes());
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
    const oh = result.probes.find((p: { name: string }) => p.name === 'open-houses-api');
    expect(oh.ok).toBe(true);
    expect(oh.proof).toBe('HTTP/JSON-CONTRACT-PROVEN');
    expect(oh.note).toContain('UNVERIFIED');
  });

  test('a pin absent from discovery WITHOUT --listing-url fails pin-resolution — never substitutes another listing', async () => {
    const { fetchImpl, calls } = makeFetch(healthyRoutes());
    const result = await runListingSmoke({ baseUrl: BASE, fetchImpl, timeoutMs: 500, listingId: 'rls999' });
    expect(result.passed).toBe(false);
    const pin = result.probes.find((p: { name: string }) => p.name === 'pin-resolution');
    expect(pin.failureClass).toBe('BAD_CONTRACT');
    expect(calls.some((c) => c.url.includes('foo-bar-slug'))).toBe(false); // no unrelated canonical probe
  });

  test('a pin WITH --listing-url probes exactly that listing for canonical + alias', async () => {
    const pinCanonical = '/listing/pinned-slug/rls777';
    const { fetchImpl, calls } = makeFetch((url) => {
      if (url.includes(pinCanonical)) return { status: 200, body: `<html><link rel="canonical" href="https://smoke.example${pinCanonical}"><h1>Pinned</h1>rls777</html>` };
      if (url === `${BASE}/listing/rls777`) return { status: 200, body: `<html><link rel="canonical" href="${pinCanonical}"></html>` };
      return healthyRoutes()(url);
    });
    const result = await runListingSmoke({
      baseUrl: BASE,
      fetchImpl,
      timeoutMs: 500,
      listingId: 'rls777',
      listingUrl: pinCanonical,
    });
    expect(result.listing).toEqual({ id: 'rls777', canonical_url: pinCanonical });
    expect(calls.some((c) => c.url === `${BASE}${pinCanonical}`)).toBe(true);
    expect(calls.some((c) => c.url === `${BASE}/listing/rls777`)).toBe(true);
    // Out-of-band pin has no similar-query fields — that is an explicit
    // BAD_CONTRACT on the similar probe, not a silent pass:
    const similar = result.probes.find((p: { name: string }) => p.name === 'similar-api');
    expect(similar.ok).toBe(false);
    expect(similar.failureClass).toBe('BAD_CONTRACT');
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

  test('unit: buildSimilarQueryFromListing + validateSimilarResponse enforce the meaningful contract', () => {
    const ok = buildSimilarQueryFromListing(LISTING_A);
    expect(ok.ok).toBe(true);
    expect(ok.qs.get('postalCode')).toBe('10019');
    expect(buildSimilarQueryFromListing(null).ok).toBe(false);
    expect(buildSimilarQueryFromListing({ ...LISTING_A, listingType: 'weird' }).ok).toBe(false);
    expect(buildSimilarQueryFromListing({ ...LISTING_A, bedroomsTotal: undefined }).ok).toBe(false);
    expect(validateSimilarResponse({ listings: [], _compliance: { source: 'idx' } })).toBeNull();
    expect(validateSimilarResponse({ listings: [] })).toContain('_compliance.source');
    expect(validateSimilarResponse({ listings: [], _compliance: { source: 'mystery' } })).toContain('_compliance.source');
    expect(validateSimilarResponse({ error: 'boom' })).toContain('error');
  });
});
