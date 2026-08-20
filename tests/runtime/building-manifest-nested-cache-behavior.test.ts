/**
 * BEHAVIORAL — the building payload / manifest-shard cache chain against the
 * REAL `next/cache` (installed Next 16.2.4), not a hand-rolled Map memoizer.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * `neon-quiet-distinct-buildings.test.ts` mocks `next/cache` with a plain Map
 * keyed by (keyParts, args). That mock has NO WORK-UNIT CONCEPT, so a cached
 * read nested inside another cached read is transparent to it. Production is
 * the opposite: dist/server/web/spec-extension/unstable-cache.js
 *   :132-134  `case 'unstable-cache': isNestedUnstableCache = true`
 *   :144-146  the nested invocation SKIPS `incrementalCache.get` entirely
 *   :206      the callback runs anyway
 *   :214      the result is still WRITTEN
 * i.e. a nested entry is write-only: every outer MISS re-executes the inner
 * body against Neon no matter how fresh the inner entry is.
 *
 * Everything here is REAL except the three leaves that must not do I/O in a
 * unit test: prisma (counted), Trestle auth (counted — it is the per-building
 * ASSEMBLY counter, one call per buildBuildingPayload execution) and ACRIS.
 * `next/cache` itself, `lib/cache/public-cache` and the whole
 * `lib/buildings/public-building-data` chain are the production modules.
 *
 * The incremental cache is a real in-memory implementation of the three
 * methods `unstable_cache` calls (generateCacheKey / get / set) plus the tag
 * eviction the data cache performs for `revalidateTag` — modelled here rather
 * than mocked away, because tag semantics are what the design depends on.
 */

// Next's dist/server/app-render/async-local-storage.js reads
// `globalThis.AsyncLocalStorage` ONCE at module load; the jest 'node'
// environment does not expose it, so without this the real workAsyncStorage
// degrades to FakeAsyncLocalStorage and `.run()` throws E504. Must run BEFORE
// the first require of anything under `next/` — hence no top-level next import.
(globalThis as unknown as Record<string, unknown>).AsyncLocalStorage =
  require('node:async_hooks').AsyncLocalStorage;

// ── the ONLY Neon: counted, keyset-accurate ────────────────────────────────
const findManyCalls: Array<Record<string, unknown>> = [];

function mkRow(num: string, idx: number) {
  return {
    id: `dbid-${num}-${idx}`,
    listing_id: `L-${num}-${String(idx).padStart(5, '0')}`,
    status: 'Active',
    list_price: 1000000 + idx,
    bedrooms_total: 2,
    bathrooms_full: 1,
    bathrooms_half: 0,
    living_area: 800,
    property_type: 'Residential',
    property_sub_type: 'Condominium',
    listing_type: 'sale',
    address: {
      StreetNumber: num,
      StreetName: 'TEST STREET',
      PostalCode: '10128',
      UnitNumber: `${idx}A`,
      BuildingName: '',
    },
    features: { CommonInterest: 'Condominium', YearBuilt: 1990, StoriesTotal: 10 },
    primary_photo_url: null,
    primary_photo_r2_key: null,
  };
}

/** Shard '1' = 3,300 gated rows across THREE distinct buildings (100 / 150 /
 *  170). 3,300 / MANIFEST_PAGE_SIZE(1500) => THREE keyset pages per walk. */
const REMOVED = new Set<string>();
/** Transient Neon outage injection for the degrade test. */
const FAIL_SHARD_1 = { on: false };
function rowsForShard(shard: string) {
  if (shard !== '1') return [];
  const rows: ReturnType<typeof mkRow>[] = [];
  const buildings: Array<[string, number]> = [['100', 1600], ['150', 1600], ['170', 100]];
  for (const [num, n] of buildings) {
    if (REMOVED.has(num)) continue;
    for (let i = 0; i < n; i++) rows.push(mkRow(num, i));
  }
  return rows.sort((a, b) => (a.listing_id < b.listing_id ? -1 : 1));
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findMany: jest.fn(async (q: Record<string, any>) => {
        findManyCalls.push(q);
        const cond = (q?.where?.AND ?? []).find((c: any) => c?.address?.string_starts_with);
        const shard: string = cond?.address?.string_starts_with ?? '';
        if (shard === '1' && FAIL_SHARD_1.on) throw new Error('simulated transient Neon outage');
        const take: number = q?.take ?? 1500;
        const all = rowsForShard(shard);
        let start = 0;
        if (q?.cursor?.listing_id) {
          start = all.findIndex((r) => r.listing_id === q.cursor.listing_id) + (q.skip ?? 0);
        }
        return all.slice(start, start + take);
      }),
    },
  },
}));

// Trestle auth rejects fast — its CALL COUNT is the per-building ASSEMBLY
// counter (buildBuildingPayload calls it exactly once per execution).
const tokenCalls: number[] = [];
jest.mock('@/lib/idx/auth', () => ({
  getAccessToken: async () => {
    tokenCalls.push(Date.now());
    throw new Error('no trestle in tests');
  },
}));

jest.mock('@/lib/buildings/acris-building-sales', () => ({
  lookupBBL: jest.fn(async () => null),
  fetchAcrisSales: jest.fn(async () => []),
  boroughFromPostalCode: jest.fn(() => null),
}));

// ── a REAL in-memory incremental cache (stands in for Vercel's Data Cache) ──
interface Stored {
  entry: unknown;
  tags: string[];
}
const memCache = new Map<string, Stored>();
const incrementalCache = {
  isOnDemandRevalidate: false,
  async generateCacheKey(invocationKey: string) {
    return 'k:' + Buffer.from(invocationKey).toString('base64');
  },
  async get(cacheKey: string) {
    const hit = memCache.get(cacheKey);
    if (!hit) return null;
    return { value: hit.entry, isStale: false };
  },
  async set(cacheKey: string, entry: unknown, ctx: { tags?: string[] }) {
    memCache.set(cacheKey, { entry, tags: ctx?.tags ?? [] });
  },
};

/** What the data cache does for `revalidateTag`: drop every entry carrying
 *  the tag. Modelled, not mocked away — the design's correctness is exactly
 *  this behaviour. */
function evictTag(tag: string): number {
  let n = 0;
  for (const [k, v] of memCache) {
    if (v.tags.includes(tag)) {
      memCache.delete(k);
      n++;
    }
  }
  return n;
}

function makeWorkStore(route: string) {
  return {
    route,
    incrementalCache,
    nextFetchId: 1,
    fetchCache: undefined as unknown as string | undefined,
    isOnDemandRevalidate: false,
    isDraftMode: false,
    isStaticGeneration: false,
    pendingRevalidates: {} as Record<string, Promise<unknown>>,
    forceDynamic: false,
    forceStatic: false,
    dynamicShouldError: false,
    page: route,
    isRevalidate: false,
    isPrefetchRequest: false,
    tags: [] as string[],
  };
}

/** `cacheNewResult` (dist :214) is fire-and-forget into `pendingRevalidates`.
 *  Draining removes any "the SET had not finished yet" confound. */
async function drain(ws: ReturnType<typeof makeWorkStore>) {
  const pending = Object.values(ws.pendingRevalidates);
  ws.pendingRevalidates = {};
  await Promise.all(pending);
}

const B = (streetNumber: string) => ({
  streetNumber,
  streetName: 'Test Street',
  postalCode: '10128',
  buildingName: null,
});

/** One public building request, in its own work store — the production shape
 *  (`/buildings/[slug]` and `/api/buildings` both await searchParams /
 *  nextUrl, so each render is a DYNAMIC request, never a shared render). */
async function request(streetNumber: string) {
  const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external');
  const { getBuildingDataCached } = require('@/lib/buildings/public-building-data');
  const ws = makeWorkStore('/buildings/[slug]');
  const payload = await workAsyncStorage.run(ws, () => getBuildingDataCached(B(streetNumber)));
  await drain(ws);
  return payload;
}

const prismaCalls = () => findManyCalls.length;
const assemblies = () => tokenCalls.length;

describe('building payload <- manifest shard: REAL next/cache work-unit behaviour', () => {
  beforeAll(() => {
    const { clearManifestPageMemory } = require('@/lib/buildings/public-building-data');
    clearManifestPageMemory();
    memCache.clear();
    findManyCalls.length = 0;
    tokenCalls.length = 0;
  });

  it('installed Next is 16.2.4 (the dist lines this suite reasons about)', () => {
    expect(require('next/package.json').version).toBe('16.2.4');
  });

  it('COLD building A walks its shard exactly once (3 keyset pages for 3,300 rows)', async () => {
    const before = prismaCalls();
    const payload = await request('100');
    expect(payload.success).toBe(true);
    expect(payload.activeUnits.length).toBeGreaterThan(0);
    expect(prismaCalls() - before).toBe(3);
    expect(assemblies()).toBe(1);
  });

  it('THE DEFECT: a SECOND cold building in the SAME shard must NOT re-walk Neon', async () => {
    const before = prismaCalls();
    const payload = await request('150'); // outer cache MISS (different building)
    expect(payload.success).toBe(true);
    // The manifest pages for shard '1' were written by the previous request and
    // no tag has been revalidated, so this assembly must be served entirely
    // from the manifest cache.
    expect(prismaCalls() - before).toBe(0);
    expect(assemblies()).toBe(2); // it DID assemble — only Neon was spared
  });

  it('a THIRD cold building in the same shard is likewise free', async () => {
    const before = prismaCalls();
    await request('170');
    expect(prismaCalls() - before).toBe(0);
    expect(assemblies()).toBe(3);
  });

  it('a WARM outer costs zero Neon AND zero re-assembly', async () => {
    const p = prismaCalls();
    const a = assemblies();
    const payload = await request('100');
    expect(payload.success).toBe(true);
    expect(prismaCalls() - p).toBe(0);
    expect(assemblies() - a).toBe(0);
  });

  it('NEGATIVE: revalidating ONE building tag re-assembles only that building, still zero Neon (its shard is untouched)', async () => {
    const { buildingCacheTag } = require('@/lib/cache/public-cache');
    expect(evictTag(buildingCacheTag('150', 'Test Street', '10128'))).toBe(1);
    const p = prismaCalls();
    const a = assemblies();
    await request('150');
    expect(assemblies() - a).toBe(1); // re-assembled
    expect(prismaCalls() - p).toBe(0); // manifest still valid -> no Neon
    // …and the neighbours stayed cached
    await request('100');
    await request('170');
    expect(assemblies() - a).toBe(1);
    expect(prismaCalls() - p).toBe(0);
  });

  it('NEGATIVE: the writer pair (building tag + shard tag) refills the shard ONCE and leaves untouched buildings cached', async () => {
    const { buildingCacheTag, manifestShardTag } = require('@/lib/cache/public-cache');
    REMOVED.add('170'); // the listing left the gated set
    try {
      evictTag(buildingCacheTag('170', 'Test Street', '10128'));
      evictTag(manifestShardTag('1'));
      const p = prismaCalls();
      const a = assemblies();

      const gone = await request('170');
      expect(assemblies() - a).toBe(1);
      // exactly ONE bounded shard refill: 3,200 remaining rows -> 3 pages
      const refill = prismaCalls() - p;
      expect(refill).toBeGreaterThan(0);
      expect(refill).toBeLessThanOrEqual(3);
      expect(gone.activeUnits.length).toBe(0); // the removed listing is gone

      // an UNRELATED building in the SAME shard: its payload entry was never
      // invalidated, so zero re-assembly AND zero further Neon.
      await request('100');
      expect(assemblies() - a).toBe(1);
      expect(prismaCalls() - p).toBe(refill);
    } finally {
      REMOVED.delete('170');
    }
  });

  it('NEGATIVE: a cold building in a shard with NO gated rows performs one bounded probe, not a per-building scan', async () => {
    const p = prismaCalls();
    await request('900'); // shard '9' — empty
    expect(prismaCalls() - p).toBe(1);
    const p2 = prismaCalls();
    await request('950'); // second cold building, same empty shard
    expect(prismaCalls() - p2).toBe(0);
  });

  it('NEGATIVE: a transient Neon failure still DEGRADES to an available payload — moving the walk did not move the try/catch', async () => {
    const { buildingCacheTag, manifestShardTag } = require('@/lib/cache/public-cache');
    evictTag(buildingCacheTag('100', 'Test Street', '10128'));
    evictTag(manifestShardTag('1'));
    FAIL_SHARD_1.on = true;
    try {
      const payload = await request('100');
      // Ordinary DB outages keep the PRE-EXISTING degrade: the page stays
      // available on the live Cotality/ACRIS layers with an empty DB slice.
      expect(payload.success).toBe(true);
      expect(payload.activeUnits.length).toBe(0);
    } finally {
      FAIL_SHARD_1.on = false;
    }
  });

  it('SOURCE CONTRACT: both public callers render DYNAMICALLY, so hoisted manifest tags cannot land on a route entry', () => {
    // Reading the manifest cache un-nested means its page reads now see the
    // caller's work unit. For a DYNAMIC request that unit is type 'request',
    // which dist unstable-cache.js:137 handles with a bare `break` — no tag
    // accumulation. Under a PRERENDER unit (:103-131) the manifest shard tags
    // WOULD be collected into the route entry's fetchTags, and a shard
    // revalidation would then expire the HTML of every building in that shard —
    // the amplification lib/buildings/public-building-data.ts:1314-1334 exists
    // to prevent. Both callers are dynamic today; this pins it so a future
    // static conversion has to confront the consequence deliberately.
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve(__dirname, '../..');
    const page = fs.readFileSync(path.join(root, 'app/buildings/[slug]/page.tsx'), 'utf8');
    expect(page).toMatch(/const sp = await searchParams;/); // forces dynamic
    expect((page.match(/const sp = await searchParams;/g) || []).length).toBe(2); // page + generateMetadata
    const route = fs.readFileSync(path.join(root, 'app/api/buildings/route.ts'), 'utf8');
    expect(route).toMatch(/request\.nextUrl/); // forces dynamic
    // and nobody else consumes the accessor
    expect(page).toContain('getBuildingDataCached');
    expect(route).toContain('getBuildingDataCached');
  });
});
