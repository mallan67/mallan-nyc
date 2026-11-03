/// <reference types="jest" />
/**
 * GET /api/nearby-poi — shared cache, bounded failure, bounded input.
 *
 * Production, 2026-08-13 → 2026-11-02 (Vercel runtime errors): 3,847 `[POI] Overpass fetch error … ConnectTimeoutError … 10000ms`,
 * and "Task timed out after 30 seconds" on this route. Three causes in app/api/nearby-poi/route.ts:
 *  - the 7-day cache was a module-level Map: serverless instances do not share memory, so nearly every listing view went to the
 *    public Overpass server again;
 *  - the Overpass fetch had no timeout of its own (the platform's 10s connect timeout, then the 30s function limit);
 *  - any lat/lng on earth was accepted and became a new cache key and a new Overpass query: free load for anyone who asks.
 *
 * The real route handler runs with `fetch` stubbed, and the shared cache stubbed the way Next's `unstable_cache` behaves:
 * a success is stored as JSON, a throw is NEVER stored.
 */
export {};

const mockCalls: Array<{ keyParts: string[]; opts: { tags: string[]; revalidate?: number } }> = [];
const mockStore = new Map<string, string>();
jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  cachedPublicRead:
    (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], opts: { tags: string[]; revalidate?: number }) =>
    async (...args: unknown[]) => {
      mockCalls.push({ keyParts, opts });
      const key = JSON.stringify([keyParts, args]);
      const hit = mockStore.get(key);
      if (hit !== undefined) return JSON.parse(hit);
      const value = await fn(...args); // a throw propagates and nothing is stored
      mockStore.set(key, JSON.stringify(value));
      return value;
    },
}));

const overpassBody = (elements: unknown[]) => ({ ok: true, status: 200, json: async () => ({ elements }) });
const ELEMENTS = [
  { id: 1, lat: 40.7712, lon: -73.9612, tags: { name: 'Cafe Uno', amenity: 'cafe' } },
  { id: 2, lat: 40.7714, lon: -73.9611, tags: { name: 'Gristedes', shop: 'supermarket' } },
  { id: 3, lat: 40.7716, lon: -73.9609, tags: { name: 'P.S. 6', amenity: 'school' } },
];

let fetchMock: jest.Mock;
beforeEach(() => {
  mockStore.clear();
  mockCalls.length = 0;
  fetchMock = jest.fn(async () => overpassBody(ELEMENTS));
  (global as any).fetch = fetchMock;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const get = async (query: string) => {
  const route = await import('@/app/api/nearby-poi/route');
  const res = await route.GET(new Request(`http://localhost/api/nearby-poi?${query}`) as any);
  return { res, body: (await res.json()) as any };
};

describe('shared cache', () => {
  it('a second view of the same building does not go to Overpass again (coordinates rounded to ~110m)', async () => {
    const a = await get('lat=40.77123&lng=-73.96121&radius=800');
    const b = await get('lat=40.77149&lng=-73.96144&radius=800'); // same 3-decimal point
    expect(a.res.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(a.body.categories.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is asked about the ROUNDED point, so one cache entry always means one query', async () => {
    await get('lat=40.77123&lng=-73.96121&radius=800');
    const sent = decodeURIComponent(String(fetchMock.mock.calls[0][1].body));
    expect(sent).toContain('around:800,40.771,-73.961');
    expect(sent).not.toContain('40.77123');
  });

  it('uses the repo\'s shared data cache with its OWN tag and a 7-day window, never the listing-sync tag', async () => {
    await get('lat=40.771&lng=-73.961');
    const { opts } = mockCalls[0];
    expect(opts.tags).toEqual(['nearby-poi']);
    expect(opts.revalidate).toBe(7 * 24 * 60 * 60);
  });

  it('different radii and different points are different entries', async () => {
    await get('lat=40.771&lng=-73.961&radius=800');
    await get('lat=40.771&lng=-73.961&radius=400');
    await get('lat=40.801&lng=-73.961&radius=800');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('serves the CDN-cacheable header on success', async () => {
    const { res } = await get('lat=40.771&lng=-73.961');
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=604800, stale-while-revalidate=86400');
  });
});

describe('a failure is bounded, is not cached, and keeps the answer the page expects', () => {
  it('a network failure answers 200 with no categories, says no-store, and is NOT cached', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }));
    const failed = await get('lat=40.771&lng=-73.961');
    expect(failed.res.status).toBe(200);
    expect(failed.body).toEqual({ categories: [] });
    expect(failed.res.headers.get('Cache-Control')).toBe('no-store');

    const retried = await get('lat=40.771&lng=-73.961'); // the next visitor gets a real answer
    expect(retried.body.categories.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([429, 502, 504])('an Overpass HTTP %i is the same: empty answer, no-store, not cached', async (status) => {
    fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
    const failed = await get('lat=40.781&lng=-73.971');
    expect(failed.body).toEqual({ categories: [] });
    expect(failed.res.headers.get('Cache-Control')).toBe('no-store');
    const retried = await get('lat=40.781&lng=-73.971');
    expect(retried.body.categories.length).toBeGreaterThan(0);
  });

  it('the Overpass request carries its own timeout, well under the 30s function limit', async () => {
    const timeouts: number[] = [];
    jest.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      timeouts.push(ms);
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('timed out', 'TimeoutError')), 5);
      return c.signal;
    });
    fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
    const started = Date.now();
    const { res, body } = await get('lat=40.791&lng=-73.951');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(timeouts.length).toBe(1);
    expect(timeouts[0]).toBeGreaterThan(0);
    expect(timeouts[0]).toBeLessThanOrEqual(15_000);
    expect(res.status).toBe(200);
    expect(body).toEqual({ categories: [] });
  });
});

describe('input is bounded', () => {
  it.each([
    ['missing coordinates', ''],
    ['not numbers', 'lat=abc&lng=def'],
    ['a point in Dhaka', 'lat=23.8103&lng=90.4125'],
    ['a point in the Atlantic', 'lat=10&lng=-40'],
    ['latitude only', 'lat=40.77'],
  ])('%s is a 400 and never reaches Overpass', async (_n, q) => {
    const { res } = await get(q);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Manhattan', 'lat=40.7712&lng=-73.9612'],
    ['Staten Island', 'lat=40.5795&lng=-74.1502'],
    ['the Bronx', 'lat=40.8448&lng=-73.8648'],
    ['Queens', 'lat=40.7282&lng=-73.7949'],
    ['Brooklyn', 'lat=40.6782&lng=-73.9442'],
  ])('%s is served', async (_n, q) => {
    expect((await get(q)).res.status).toBe(200);
  });

  it('the radius is clamped to 1500m', async () => {
    await get('lat=40.771&lng=-73.961&radius=99999');
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][1].body))).toContain('around:1500,');
  });
});
