import {
  FALLBACK_ORIGIN_CACHE_PREFIX,
  FALLBACK_ORIGIN_REVALIDATE_SECONDS,
  readCachedFallbackOrigin,
  type FallbackOriginCache,
} from '@/lib/listings/cached-fallback-origin';

const sharedEntries = new Map<string, unknown>();

const sharedMapCache: FallbackOriginCache = (origin, keyParts, options) => async () => {
  expect(keyParts).toHaveLength(2);
  expect(keyParts[0]).toBe(FALLBACK_ORIGIN_CACHE_PREFIX);
  expect(keyParts[1]).toEqual(expect.any(String));
  expect(options).toEqual({
    tags: ['search'],
    revalidate: FALLBACK_ORIGIN_REVALIDATE_SECONDS,
  });

  const key = JSON.stringify(keyParts);
  if (sharedEntries.has(key)) return sharedEntries.get(key) as Awaited<ReturnType<typeof origin>>;

  const value = await origin();
  sharedEntries.set(key, value);
  return value;
};

describe('shared fallback-origin application boundary', () => {
  beforeEach(() => sharedEntries.clear());

  it('executes all origin collaborators once across two independent reads', async () => {
    const calls = {
      origin: 0,
      property: 0,
      media: 0,
      openHouse: 0,
      geocoder: 0,
      neon: 0,
      originAudit: 0,
      servedAudit: 0,
    };

    const origin = async () => {
      calls.origin += 1;
      calls.property += 1;
      calls.media += 1;
      calls.openHouse += 1;
      calls.geocoder += 1;
      calls.neon += 1;
      calls.originAudit += 1;
      return { responseBody: { success: true, listings: [{ id: 'RLS1' }] } };
    };

    const first = await readCachedFallbackOrigin({
      cacheKey: 'canonical-search',
      origin,
      cache: sharedMapCache,
    });
    calls.servedAudit += 1;

    const second = await readCachedFallbackOrigin({
      cacheKey: 'canonical-search',
      origin,
      cache: sharedMapCache,
    });
    calls.servedAudit += 1;

    expect(first.value).toEqual(second.value);
    expect(first.originExecuted).toBe(true);
    expect(second.originExecuted).toBe(false);
    expect(calls).toEqual({
      origin: 1,
      property: 1,
      media: 1,
      openHouse: 1,
      geocoder: 1,
      neon: 1,
      originAudit: 1,
      servedAudit: 2,
    });
  });

  it('does not share entries across different canonical search keys', async () => {
    let originExecutions = 0;
    const read = (cacheKey: string) =>
      readCachedFallbackOrigin({
        cacheKey,
        cache: sharedMapCache,
        origin: async () => ({ execution: ++originExecutions }),
      });

    await read('canonical-search');
    await read('different-search');

    expect(originExecutions).toBe(2);
  });
});
