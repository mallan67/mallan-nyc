/// <reference types="jest" />
/**
 * CANONICAL MEDIA RECOVERY executor — behavioural proof
 * (scripts/recover-residual-listing-media.ts).
 *
 * These are REAL calls into the canonical media authority: `upsertListingMedia`
 * and `updateListingMediaSummary` run unmodified against an in-memory Prisma
 * fake, and only the provider fetch is injected. Nothing here re-implements a
 * write decision, so the suite cannot stay green while production drifts
 * underneath it (the failure mode called out in media-sync.ts:745).
 *
 * The fake THROWS on any where-shape it does not model and on ANY access to
 * `mediaSyncState` / `syncState`. A silent mis-model would be a false green;
 * a cursor write would be a silent violation of the drain's core promise.
 */

// ─── next/cache: observe invalidation instead of letting it no-op ────────────
const mockRevalidateTag = jest.fn();
jest.mock('next/cache', () => ({
  __esModule: true,
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  unstable_cache: (fn: unknown) => fn,
}));

// ─── In-memory Prisma fake ──────────────────────────────────────────────────

interface FakeMediaRow {
  listing_id: string;
  media_key: string;
  resource_record_key: string | null;
  resource_record_id: string | null;
  media_url_original: string | null;
  media_url_cached: string | null;
  media_type: string;
  media_category: string | null;
  media_classification: string | null;
  order: number;
  preferred_photo_yn: boolean;
  media_modification_ts: Date | null;
  modification_ts: Date | null;
  photos_change_ts_snapshot: Date | null;
  r2_key: string | null;
  r2_attempts: number | null;
  r2_policy_excluded_at: Date | null;
  status: string;
}

interface FakeListingRow {
  listing_id: string;
  status: string;
  idx_display_yn: boolean;
  rls_eligible: boolean;
  sync_status: string | null;
  mls_id: string | null;
  raw_data: unknown;
  media: unknown;
  address: unknown;
  primary_photo_url: string | null;
  primary_photo_r2_key: string | null;
  photo_count: number | null;
  photos_change_timestamp: Date | null;
}

interface FakeWrite {
  model: 'listing' | 'listingMedia';
  op: 'create' | 'update' | 'updateMany';
  args: unknown;
}

const mockStore: {
  listings: FakeListingRow[];
  media: FakeMediaRow[];
  writes: FakeWrite[];
  /**
   * Simulates a where-clause regression: `listing.findMany` ignores the where
   * and returns everything. Exists ONLY to exercise the in-code Mallan/archive
   * guards independently of the DB-side exclusion (defense in depth is not
   * proven by testing one layer twice).
   */
  bypassSelectionWhere: boolean;
} = { listings: [], media: [], writes: [], bypassSelectionWhere: false };

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function scalarMatches(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
    const c = cond as Record<string, unknown>;
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
    if ('not' in c) return !scalarMatches(value, c.not);
    if ('equals' in c) return deepEqual(value, c.equals);
    if ('startsWith' in c) return typeof value === 'string' && value.startsWith(String(c.startsWith));
    throw new Error(`fake prisma: unmodelled scalar operator ${JSON.stringify(cond)}`);
  }
  return deepEqual(value, cond);
}

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

function rowMatches(row: Record<string, unknown>, where: unknown): boolean {
  if (where === undefined || where === null) return true;
  for (const [key, cond] of Object.entries(where as Record<string, unknown>)) {
    if (key === 'AND') {
      if (!toArray(cond).every((w) => rowMatches(row, w))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!toArray(cond).some((w) => rowMatches(row, w))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (toArray(cond).some((w) => rowMatches(row, w))) return false;
      continue;
    }
    if (key === 'listing_media') {
      const c = cond as Record<string, unknown>;
      const owned = mockStore.media.filter((m) => m.listing_id === row.listing_id);
      if ('none' in c) {
        if (owned.some((m) => rowMatches(m as unknown as Record<string, unknown>, c.none))) return false;
        continue;
      }
      throw new Error(`fake prisma: unmodelled relation filter ${JSON.stringify(cond)}`);
    }
    if (!(key in row)) throw new Error(`fake prisma: where references unknown column '${key}'`);
    if (!scalarMatches(row[key], cond)) return false;
  }
  return true;
}

/** ANY property access throws — proves the drain never touches a cursor table. */
function cursorTableTrap(name: string): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(`CURSOR VIOLATION: prisma.${name}.${String(prop)} was accessed by the recovery drain`);
      },
    },
  );
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      count: async (args: { where: unknown }) =>
        mockStore.listings.filter((l) => rowMatches(l as unknown as Record<string, unknown>, args.where)).length,
      findMany: async (args: { where: unknown; take?: number }) => {
        const rows = mockStore.bypassSelectionWhere
          ? [...mockStore.listings]
          : mockStore.listings.filter((l) => rowMatches(l as unknown as Record<string, unknown>, args.where));
        rows.sort((a, b) => (a.listing_id < b.listing_id ? -1 : a.listing_id > b.listing_id ? 1 : 0));
        return args.take === undefined ? rows : rows.slice(0, args.take);
      },
      findUnique: async (args: { where: { listing_id: string } }) =>
        mockStore.listings.find((l) => l.listing_id === args.where.listing_id) ?? null,
      update: async (args: { where: { listing_id: string }; data: Record<string, unknown> }) => {
        const row = mockStore.listings.find((l) => l.listing_id === args.where.listing_id);
        if (!row) throw new Error('fake prisma: listing.update on a missing row');
        Object.assign(row, args.data);
        mockStore.writes.push({ model: 'listing', op: 'update', args });
        return row;
      },
    },
    listingMedia: {
      findUnique: async (args: { where: { media_key: string } }) =>
        mockStore.media.find((m) => m.media_key === args.where.media_key) ?? null,
      findMany: async (args: { where: { listing_id: string } }) =>
        mockStore.media.filter((m) => m.listing_id === args.where.listing_id),
      count: async (args: { where: unknown }) =>
        mockStore.media.filter((m) => rowMatches(m as unknown as Record<string, unknown>, args.where)).length,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { ...mediaRowDefaults(), ...(args.data as Partial<FakeMediaRow>) } as FakeMediaRow;
        mockStore.media.push(row);
        mockStore.writes.push({ model: 'listingMedia', op: 'create', args });
        return row;
      },
      update: async (args: { where: { media_key: string }; data: Record<string, unknown> }) => {
        const row = mockStore.media.find((m) => m.media_key === args.where.media_key);
        if (!row) throw new Error('fake prisma: listingMedia.update on a missing row');
        Object.assign(row, args.data);
        mockStore.writes.push({ model: 'listingMedia', op: 'update', args });
        return row;
      },
      updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
        const rows = mockStore.media.filter((m) => rowMatches(m as unknown as Record<string, unknown>, args.where));
        for (const r of rows) Object.assign(r, args.data);
        mockStore.writes.push({ model: 'listingMedia', op: 'updateMany', args });
        return { count: rows.length };
      },
    },
    mediaSyncState: cursorTableTrap('mediaSyncState'),
    syncState: cursorTableTrap('syncState'),
    $disconnect: async () => undefined,
  },
}));

import fs from 'node:fs';
import path from 'node:path';
import {
  recoverResidualListingMedia,
  planListingRecovery,
  parseRecoveryArgs,
  assertExecuteAllowed,
  assertProductionEnvironment,
  assertAllConfiguredTargetsCanonical,
  buildResidualCandidateWhere,
  resolveMediaResourceKey,
  normalizeResourceKey,
  chunkListingIds,
  RECOVERY_RUN_CAP,
  RECOVERY_TOTAL_CAP,
  RECOVERY_CONFIRM_TOKEN,
  PROPERTY_KEY_LOOKUP_CHUNK,
  type RecoveryEnv,
  type ResidualRecoveryOptions,
} from '@/scripts/recover-residual-listing-media';
import type { UpsertListingMediaInput } from '@/lib/idx/media-sync';

/**
 * Default Property-lookup stub: resolves NOTHING. Fixtures that already carry a
 * local ListingKey must therefore never depend on it, and a test that expects a
 * lookup opts in explicitly. Tests assert on its call count/arg shape to prove
 * the batching.
 */
const mockFetchListingKeys = jest.fn<Promise<Map<string, string | null>>, [string[]]>();

/** Injects the Property-lookup stub so every call site stays one line. */
function run(
  opts: Omit<ResidualRecoveryOptions, 'fetchListingKeys'> &
    Partial<Pick<ResidualRecoveryOptions, 'fetchListingKeys'>>,
) {
  return recoverResidualListingMedia({ fetchListingKeys: mockFetchListingKeys, ...opts });
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CANONICAL_URL =
  'postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
const STALE_URL = 'postgresql://u:p@ep-royal-dawn-ad6eh8t2.us-east-1.aws.neon.tech/neondb?sslmode=require';

function mediaRowDefaults(): FakeMediaRow {
  return {
    listing_id: '',
    media_key: '',
    resource_record_key: null,
    resource_record_id: null,
    media_url_original: null,
    media_url_cached: null,
    media_type: 'Photo',
    media_category: null,
    media_classification: null,
    order: 0,
    preferred_photo_yn: false,
    media_modification_ts: null,
    modification_ts: null,
    photos_change_ts_snapshot: null,
    r2_key: null,
    r2_attempts: null,
    r2_policy_excluded_at: null,
    status: 'active',
  };
}

/** A residual candidate: displayable, non-empty legacy media JSON, real ListingKey. */
function listing(over: Partial<FakeListingRow> = {}): FakeListingRow {
  const id = over.listing_id ?? 'RLS100';
  return {
    listing_id: id,
    status: 'Active',
    idx_display_yn: true,
    rls_eligible: true,
    sync_status: 'synced',
    mls_id: `KEY-${id}`,
    raw_data: { ListingKey: `KEY-${id}` },
    media: [{ url: 'https://legacy/1.jpg' }],
    address: {},
    primary_photo_url: null,
    primary_photo_r2_key: null,
    photo_count: 0,
    photos_change_timestamp: null,
    ...over,
  };
}

function feedPhoto(over: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: 'MK-1',
    ResourceRecordKey: 'KEY-RLS100',
    MediaURL: 'https://api.cotality.com/trestle/Media/MK-1.jpg?sig=A',
    MediaCategory: 'Photo',
    Permission: 'Public',
    Order: 0,
    PreferredPhotoYN: true,
    MediaModificationTimestamp: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function seedMedia(over: Partial<FakeMediaRow>): void {
  mockStore.media.push({ ...mediaRowDefaults(), ...over } as FakeMediaRow);
}

function resetStore(): void {
  mockStore.listings = [];
  mockStore.media = [];
  mockStore.writes = [];
  mockStore.bypassSelectionWhere = false;
}

beforeEach(() => {
  resetStore();
  mockRevalidateTag.mockReset();
  mockFetchListingKeys.mockReset();
  mockFetchListingKeys.mockResolvedValue(new Map());
});

/**
 * A residual candidate in its REAL production shape: no `raw_data.ListingKey`
 * (shed by the ordinary sync path) and `mls_id === listing_id` (the
 * lib/idx/mapping.ts:302 fallback fired). Measured 2026-08-13: all 97 rows look
 * like this, so the Property lookup is the ONLY way any of them resolves.
 */
function keylessListing(over: Partial<FakeListingRow> = {}): FakeListingRow {
  const id = over.listing_id ?? 'RLS100';
  return listing({ ...over, listing_id: id, mls_id: id, raw_data: {} });
}

// ─── 1. DRY RUN = ZERO WRITES, EXACT FORECAST ───────────────────────────────

describe('dry run', () => {
  it('performs ZERO writes and forecasts exact per-listing insert/update/delete counts', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100' }), listing({ listing_id: 'RLS200' }));
    // RLS200 carries an only-tombstoned row: the resurrect must forecast as an UPDATE, not an insert.
    seedMedia({ listing_id: 'RLS200', media_key: 'MK-200-A', status: 'deleted' });

    const fetchMedia = jest.fn(async (key: string) =>
      key === 'KEY-RLS100'
        ? [feedPhoto({ MediaKey: 'MK-100-A' }), feedPhoto({ MediaKey: 'MK-100-B', Order: 1 })]
        : [feedPhoto({ MediaKey: 'MK-200-A' })],
    );

    const t = await run({ fetchMedia });

    expect(t.mode).toBe('dry-run');
    expect(mockStore.writes).toHaveLength(0);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(t.plan).toEqual([
      expect.objectContaining({
        listing_id: 'RLS100',
        expected_inserts: 2,
        expected_updates: 0,
        expected_deletes: 0,
      }),
      expect.objectContaining({
        listing_id: 'RLS200',
        expected_inserts: 0,
        expected_updates: 1, // resurrect of the tombstoned row
        expected_deletes: 0,
      }),
    ]);
    expect(t.rows_inserted).toBe(2);
    expect(t.rows_updated).toBe(1);
  });

  it('the dry-run forecast equals what --execute actually writes', async () => {
    const seed = () => {
      resetStore();
      mockStore.listings.push(listing({ listing_id: 'RLS100' }), listing({ listing_id: 'RLS200' }));
      seedMedia({ listing_id: 'RLS200', media_key: 'MK-200-A', status: 'deleted' });
    };
    const fetchMedia = async (key: string) =>
      key === 'KEY-RLS100'
        ? [feedPhoto({ MediaKey: 'MK-100-A' }), feedPhoto({ MediaKey: 'MK-100-B', Order: 1 })]
        : [feedPhoto({ MediaKey: 'MK-200-A' })];

    seed();
    const dry = await run({ fetchMedia });
    seed();
    const wet = await run({ execute: true, fetchMedia });

    expect(wet.rows_inserted).toBe(dry.rows_inserted);
    expect(wet.rows_updated).toBe(dry.rows_updated);
    expect(wet.rows_tombstoned).toBe(dry.rows_tombstoned);
  });
});

// ─── 2. CAP ─────────────────────────────────────────────────────────────────

describe('bounds', () => {
  it('respects the per-run cap and never fetches beyond it', async () => {
    for (let i = 0; i < 5; i++) mockStore.listings.push(listing({ listing_id: `RLS30${i}` }));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ fetchMedia, limit: 2 });

    expect(t.selected).toBe(2);
    expect(t.plan).toHaveLength(2);
    expect(fetchMedia).toHaveBeenCalledTimes(2);
  });

  it('rejects a limit above the hard per-run cap (no unbounded mode)', async () => {
    expect(() => parseRecoveryArgs([`--limit=${RECOVERY_RUN_CAP + 1}`])).toThrow(/exceeds the hard per-run cap/);
    expect(() => parseRecoveryArgs(['--limit=0'])).toThrow(/positive integer/);
    expect(parseRecoveryArgs([]).limit).toBe(RECOVERY_RUN_CAP);
    await expect(
      run({ fetchMedia: async () => [], limit: RECOVERY_RUN_CAP + 1 }),
    ).rejects.toThrow(/limit must be an integer/);
  });

  it('REFUSES when the candidate universe exceeds the campaign total cap', async () => {
    for (let i = 0; i <= RECOVERY_TOTAL_CAP; i++) {
      mockStore.listings.push(listing({ listing_id: `RLS${String(i).padStart(5, '0')}` }));
    }
    const fetchMedia = jest.fn(async () => [feedPhoto()]);
    await expect(run({ fetchMedia })).rejects.toThrow(/RECOVERY_TOTAL_CAP/);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
  });

  it('rejects unknown flags rather than silently ignoring them', () => {
    expect(() => parseRecoveryArgs(['--limmit=5'])).toThrow(/Unknown flag/);
  });
});

// ─── 3. NEVER MOVES A CURSOR ────────────────────────────────────────────────

describe('cursor immutability', () => {
  it('writes neither media_sync_state nor sync_state during a real recovery', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100' }));
    const t = await run({
      execute: true,
      fetchMedia: async () => [feedPhoto({ MediaKey: 'MK-100-A' })],
    });
    // The fake throws on ANY access to either cursor model, so reaching here at
    // all is the proof; the counter records the intent explicitly.
    expect(t.cursor_writes).toBe(0);
    expect(t.rows_inserted).toBe(1);
  });

  it('the executor source contains no cursor-table or cursor-advance reference', () => {
    const raw = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/recover-residual-listing-media.ts'),
      'utf8',
    );
    // Strip comments first: the file's documentation deliberately NAMES the
    // cursor tables and helpers to explain why it avoids them. Asserting over
    // prose would force the doc to get vaguer to keep a test green.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/mediaSyncState/);
    expect(code).not.toMatch(/syncState/);
    expect(code).not.toMatch(/media_sync_state/);
    expect(code).not.toMatch(/sync_state/);
    expect(code).not.toMatch(/advanceMediaSyncCursor/);
    expect(code).not.toMatch(/getMediaSyncCursor/);
    expect(code).not.toMatch(/computeAdvancedCursor/);
  });
});

// ─── 4. INCOMPLETE FETCH IS NEVER AUTHORITATIVE ─────────────────────────────

describe('incomplete provider fetch', () => {
  it('clears/tombstones NOTHING and marks the listing failed', async () => {
    mockStore.listings.push(
      listing({ listing_id: 'RLS100', primary_photo_url: 'https://old/hero.jpg', photo_count: 3 }),
    );
    seedMedia({ listing_id: 'RLS100', media_key: 'MK-100-A', status: 'deleted' });

    const t = await run({
      execute: true,
      // `defaultFetchMedia` throws exactly like this when paginateMedia reports
      // `complete: false` (lib/idx/media-sync.ts:3364).
      fetchMedia: async () => {
        throw new Error("Media pagination incomplete for ResourceRecordKey='KEY-RLS100'");
      },
    });

    expect(t.failed_incomplete_fetch).toBe(1);
    expect(mockStore.writes).toHaveLength(0);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    // Stale summary preserved — an unknown media set must never clear it.
    expect(mockStore.listings[0].primary_photo_url).toBe('https://old/hero.jpg');
    expect(mockStore.listings[0].photo_count).toBe(3);
    expect(mockStore.media[0].status).toBe('deleted'); // untouched, not re-tombstoned
  });
});

// ─── 5. COMPLETE AUTHORITATIVE EMPTY MAY CLEAR ──────────────────────────────

describe('complete authoritative empty set', () => {
  it('issues the vanished-tombstone statement and clears a stale summary', async () => {
    mockStore.listings.push(
      listing({ listing_id: 'RLS100', primary_photo_url: 'https://old/hero.jpg', photo_count: 3 }),
    );

    const t = await run({ execute: true, fetchMedia: async () => [] });

    // The DESTRUCTIVE statement is issued (contrast with the incomplete case above).
    const tombstone = mockStore.writes.find((w) => w.op === 'updateMany');
    expect(tombstone).toBeDefined();
    expect((tombstone!.args as { data: unknown }).data).toEqual({ status: 'deleted' });
    expect((tombstone!.args as { where: Record<string, unknown> }).where).toMatchObject({
      listing_id: 'RLS100',
      status: 'active',
      NOT: { media_key: { startsWith: 'crm:' } },
    });
    // And the stale summary is genuinely cleared.
    expect(mockStore.listings[0].primary_photo_url).toBeNull();
    expect(mockStore.listings[0].photo_count).toBe(0);
    expect(t.cache_invalidations).toBe(1);
  });
});

// ─── 6/7. OWNERSHIP + ARCHIVE PROTECTION (both layers) ──────────────────────

describe('Mallan-owned protection', () => {
  it('layer 1 — the selection query never offers a Mallan exclusive', async () => {
    mockStore.listings.push(listing({ listing_id: 'SL-0001', mls_id: 'KEY-SL', raw_data: { ListingKey: 'KEY-SL' } }));
    mockStore.listings.push(listing({ listing_id: 'RLS900', rls_eligible: false }));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.selected).toBe(0);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
  });

  it('layer 2 — an in-code guard skips it even if the where-clause regressed', async () => {
    mockStore.bypassSelectionWhere = true;
    mockStore.listings.push(listing({ listing_id: 'SL-0001', mls_id: 'KEY-SL', raw_data: { ListingKey: 'KEY-SL' } }));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.skipped_mallan).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
  });
});

describe('archived protection', () => {
  it('layer 1 — the selection query never offers an archived listing', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100', sync_status: 'archived' }));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.selected).toBe(0);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
  });

  it('layer 2 — an in-code guard never rehydrates an archived listing', async () => {
    mockStore.bypassSelectionWhere = true;
    mockStore.listings.push(listing({ listing_id: 'RLS100', sync_status: 'archived' }));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.skipped_archived).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
  });
});

// ─── 8/9/10. WRITE ECONOMY + INVALIDATION + IDEMPOTENCE ─────────────────────

describe('write economy', () => {
  it('unchanged media => ZERO writes and ZERO invalidations', async () => {
    // Zero media rows, stored summary already empty, authoritative set empty:
    // nothing to insert, nothing to tombstone, summary identical => suppressed.
    mockStore.listings.push(
      listing({ listing_id: 'RLS100', primary_photo_url: null, primary_photo_r2_key: null, photo_count: 0 }),
    );

    const t = await run({ execute: true, fetchMedia: async () => [] });

    expect(t.listings_unchanged).toBe(1);
    expect(t.rows_physical_writes).toBe(0);
    expect(t.cache_invalidations).toBe(0);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockStore.writes.filter((w) => w.model === 'listing')).toHaveLength(0);
    // No row was created, updated, or actually tombstoned. The only statement
    // issued is the vanished-tombstone `updateMany`, which matched zero rows.
    expect(mockStore.writes.filter((w) => w.op !== 'updateMany')).toHaveLength(0);
    expect(mockStore.media).toHaveLength(0);
  });

  it('a real media change => writes and EXACTLY ONE invalidation', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100' }));

    const t = await run({
      execute: true,
      fetchMedia: async () => [
        feedPhoto({ MediaKey: 'MK-100-A' }),
        feedPhoto({ MediaKey: 'MK-100-B', Order: 1, PreferredPhotoYN: false }),
      ],
    });

    expect(t.rows_inserted).toBe(2);
    expect(t.listings_recovered).toBe(1);
    expect(t.cache_invalidations).toBe(1);
    // ONE summary write => ONE revalidation pass (its tag set is deduped inside
    // safeRevalidateTags; the invalidation EVENT count is what must be 1).
    expect(mockStore.writes.filter((w) => w.model === 'listing' && w.op === 'update')).toHaveLength(1);
    expect(mockRevalidateTag).toHaveBeenCalled();
    expect(mockStore.listings[0].photo_count).toBe(2);
    expect(mockStore.listings[0].primary_photo_url).toBe(
      'https://api.cotality.com/trestle/Media/MK-1.jpg?sig=A',
    );
  });

  it('idempotence — a second run over the same population makes ZERO material writes', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100' }));
    const fetchMedia = async () => [feedPhoto({ MediaKey: 'MK-100-A' })];

    const first = await run({ execute: true, fetchMedia });
    expect(first.rows_inserted).toBe(1);
    expect(mockStore.writes.length).toBeGreaterThan(0);

    const writesAfterFirst = mockStore.writes.length;
    mockRevalidateTag.mockReset();

    const second = await run({ execute: true, fetchMedia });

    // The listing now has ACTIVE media, so the state-based predicate no longer
    // classifies it as residual: the drain converges instead of re-running.
    expect(second.selected).toBe(0);
    expect(second.rows_physical_writes).toBe(0);
    expect(second.cache_invalidations).toBe(0);
    expect(mockStore.writes.length).toBe(writesAfterFirst);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});

// ─── Guards: execute gating + canonical endpoint ────────────────────────────

describe('execute gating', () => {
  const prodEnv: RecoveryEnv = { NODE_ENV: 'production', DATABASE_URL: CANONICAL_URL };

  it('a dry run needs no confirmation and no production environment', () => {
    expect(() => assertExecuteAllowed(parseRecoveryArgs([]), { NODE_ENV: 'test' })).not.toThrow();
  });

  it('--execute without the confirm token is refused', () => {
    expect(() => assertExecuteAllowed(parseRecoveryArgs(['--execute']), prodEnv)).toThrow(/--confirm=/);
    expect(() =>
      assertExecuteAllowed(parseRecoveryArgs(['--execute', '--confirm=yes']), prodEnv),
    ).toThrow(/--confirm=/);
    expect(() =>
      assertExecuteAllowed(parseRecoveryArgs(['--execute', `--confirm=${RECOVERY_CONFIRM_TOKEN}`]), prodEnv),
    ).not.toThrow();
  });

  it('refuses the STALE royal-dawn / morning-bread endpoint', () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: 'production', DATABASE_URL: STALE_URL })).toThrow(
      /royal-dawn/,
    );
  });

  it('fails closed when the target is undeterminable', () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: 'production' })).toThrow(/undeterminable/);
    expect(() =>
      assertProductionEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'not-a-url' }),
    ).toThrow(/malformed/);
    expect(() =>
      assertProductionEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@some-other-host.neon.tech/db',
      }),
    ).toThrow(/canonical cold-waterfall/);
  });

  it('refuses to write from a test process or a non-production Vercel environment', () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: 'test', DATABASE_URL: CANONICAL_URL })).toThrow(
      /NODE_ENV=test/,
    );
    expect(() =>
      assertProductionEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'preview', DATABASE_URL: CANONICAL_URL }),
    ).toThrow(/VERCEL_ENV/);
  });
});

// ─── Guard: EVERY configured target must be canonical (mixed pooled/unpooled) ──────────────
//
// REGRESSION. The guard previously validated `DATABASE_URL_UNPOOLED || DATABASE_URL` — ONE
// preferred URL. Prisma's datasource connects through `DATABASE_URL`; `DATABASE_URL_UNPOOLED` is
// only `directUrl`. So a canonical unpooled URL could vouch for a STALE pooled one, and the
// Prisma reads that build the dry-run plan would hit morning-bread / ep-royal-dawn
// (DO-NOT-SERVE per CLAUDE.md) while the run reported itself safe.
//
// The old suite could not catch this: every guard case configured exactly ONE variable, so the
// preferred-URL shortcut and a validate-everything guard behaved identically.
describe('canonical target guard — every configured URL', () => {
  it('REFUSES canonical DATABASE_URL_UNPOOLED alongside a STALE DATABASE_URL (the Prisma read path)', () => {
    const env: RecoveryEnv = { DATABASE_URL_UNPOOLED: CANONICAL_URL, DATABASE_URL: STALE_URL };
    expect(() => assertAllConfiguredTargetsCanonical(env)).toThrow(/DATABASE_URL is not the canonical/);
    expect(() => assertAllConfiguredTargetsCanonical(env)).toThrow(/royal-dawn/);
    // and the write-path guard must refuse for the same reason
    expect(() => assertProductionEnvironment({ NODE_ENV: 'production', ...env })).toThrow(/royal-dawn/);
  });

  it('REFUSES a STALE DATABASE_URL_UNPOOLED alongside a canonical DATABASE_URL', () => {
    const env: RecoveryEnv = { DATABASE_URL_UNPOOLED: STALE_URL, DATABASE_URL: CANONICAL_URL };
    expect(() => assertAllConfiguredTargetsCanonical(env)).toThrow(/DATABASE_URL_UNPOOLED is not the canonical/);
    expect(() => assertAllConfiguredTargetsCanonical(env)).toThrow(/royal-dawn/);
    expect(() => assertProductionEnvironment({ NODE_ENV: 'production', ...env })).toThrow(/royal-dawn/);
  });

  it('PASSES when both configured URLs are canonical', () => {
    const env: RecoveryEnv = { DATABASE_URL_UNPOOLED: CANONICAL_URL, DATABASE_URL: CANONICAL_URL };
    expect(() => assertAllConfiguredTargetsCanonical(env)).not.toThrow();
    expect(() => assertProductionEnvironment({ NODE_ENV: 'production', ...env })).not.toThrow();
  });

  it('REFUSES when neither URL is configured (fail closed, never assume)', () => {
    expect(() => assertAllConfiguredTargetsCanonical({})).toThrow(/undeterminable/);
    expect(() => assertAllConfiguredTargetsCanonical({ DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' })).toThrow(
      /undeterminable/,
    );
  });

  it('never echoes a connection string into the error (they carry credentials)', () => {
    const secret = 'postgresql://leaked_user:leaked_password@ep-royal-dawn-ad6eh8t2.us-east-1.aws.neon.tech/db';
    try {
      assertAllConfiguredTargetsCanonical({ DATABASE_URL: secret });
      throw new Error('expected a refusal');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain('leaked_password');
      expect(msg).not.toContain('leaked_user');
      expect(msg).toMatch(/royal-dawn/);
    }
  });
});

// ─── Selection + key resolution details ─────────────────────────────────────

describe('selection and key resolution', () => {
  it('the where-clause pins the proven residual predicate', () => {
    const where = buildResidualCandidateWhere();
    expect(where.status).toEqual({ in: ['Active', 'ActiveUnderContract', 'ComingSoon'] });
    expect(where.idx_display_yn).toBe(true);
    expect(where.listing_media).toEqual({ none: { status: 'active' } });
    expect(where.sync_status).toEqual({ not: 'archived' });
  });

  it('excludes a listing that already has an ACTIVE media row', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100' }));
    seedMedia({ listing_id: 'RLS100', media_key: 'MK-LIVE', status: 'active' });
    const t = await run({ fetchMedia: async () => [feedPhoto()] });
    expect(t.selected).toBe(0);
  });

  it('excludes a listing whose legacy media JSON is empty, and non-displayable statuses', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100', media: [] }));
    mockStore.listings.push(listing({ listing_id: 'RLS101', status: 'Closed' }));
    mockStore.listings.push(listing({ listing_id: 'RLS102', idx_display_yn: false }));
    const t = await run({ fetchMedia: async () => [feedPhoto()] });
    expect(t.selected).toBe(0);
  });

  it('fails closed when no real ListingKey is provable (never queries by ListingId)', async () => {
    mockStore.listings.push(listing({ listing_id: 'RLS100', mls_id: 'RLS100', raw_data: {} }));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.skipped_no_resource_key).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
    expect(resolveMediaResourceKey({ listing_id: 'RLS100', mls_id: 'RLS100', raw_data: {} })).toBeNull();
    expect(resolveMediaResourceKey({ listing_id: 'RLS100', mls_id: null, raw_data: { ListingKey: 'K1' } })).toBe('K1');
  });
});

// ─── Property-side ListingKey lookup ────────────────────────────────────────

describe('Property-side ListingKey lookup', () => {
  it('recovers a listing whose key resolves ONLY via the Property lookup', async () => {
    // Production shape: nothing locally resolvable.
    mockStore.listings.push(keylessListing({ listing_id: 'RLS10941846' }));
    expect(resolveMediaResourceKey({ listing_id: 'RLS10941846', mls_id: 'RLS10941846', raw_data: {} })).toBeNull();

    mockFetchListingKeys.mockResolvedValue(new Map([['RLS10941846', '1092342380']]));
    const fetchMedia = jest.fn(async () => [feedPhoto({ MediaKey: 'MK-A' })]);

    const t = await run({ execute: true, fetchMedia });

    expect(mockFetchListingKeys).toHaveBeenCalledWith(['RLS10941846']);
    // Media is queried by the LOOKED-UP ListingKey, never the ListingId.
    expect(fetchMedia).toHaveBeenCalledWith('1092342380');
    expect(t.keys_resolved_via_property_lookup).toBe(1);
    expect(t.skipped_no_resource_key).toBe(0);
    expect(t.rows_inserted).toBe(1);
    expect(t.listings_recovered).toBe(1);
  });

  it('BATCHES the lookup: <=15 ids per request, one request per chunk', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = `RLS4${String(i).padStart(4, '0')}`;
      ids.push(id);
      mockStore.listings.push(keylessListing({ listing_id: id }));
    }
    mockFetchListingKeys.mockImplementation(async (batch: string[]) =>
      new Map(batch.map((id) => [id, `KEY-${id}`] as [string, string | null])),
    );
    const fetchMedia = jest.fn(async () => [feedPhoto({ MediaKey: 'MK-A' })]);

    const t = await run({ fetchMedia });

    // 20 ids / 15 per request = 2 requests, NOT 20.
    expect(mockFetchListingKeys).toHaveBeenCalledTimes(2);
    expect(t.property_key_lookups).toBe(2);
    const batches = mockFetchListingKeys.mock.calls.map((c) => c[0]);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(PROPERTY_KEY_LOOKUP_CHUNK);
    expect(batches.map((b) => b.length)).toEqual([15, 5]);
    // Every id appears exactly once across the batches — no drops, no repeats.
    expect(batches.flat().sort()).toEqual([...ids].sort());
    expect(t.keys_resolved_via_property_lookup).toBe(20);
    expect(chunkListingIds(ids, PROPERTY_KEY_LOOKUP_CHUNK).map((c) => c.length)).toEqual([15, 5]);
  });

  it('a ListingId ABSENT from the Property response is skipped untouched', async () => {
    mockStore.listings.push(
      keylessListing({ listing_id: 'RLS100', primary_photo_url: 'https://old/hero.jpg', photo_count: 3 }),
      keylessListing({ listing_id: 'RLS200' }),
    );
    // Only RLS200 comes back.
    mockFetchListingKeys.mockResolvedValue(new Map([['RLS200', 'KEY-200']]));
    const fetchMedia = jest.fn(async () => [feedPhoto({ MediaKey: 'MK-200' })]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.skipped_no_resource_key).toBe(1);
    expect(t.keys_resolved_via_property_lookup).toBe(1);
    expect(fetchMedia).toHaveBeenCalledTimes(1);
    expect(fetchMedia).toHaveBeenCalledWith('KEY-200');
    // The unresolved listing keeps its stale summary — no clear, no tombstone.
    const untouched = mockStore.listings.find((l) => l.listing_id === 'RLS100')!;
    expect(untouched.primary_photo_url).toBe('https://old/hero.jpg');
    expect(untouched.photo_count).toBe(3);
    // No write targets RLS100 — check the write TARGETS, not the payload text
    // (a payload can legitimately carry another listing's key material).
    const touched = mockStore.writes.map((w) => {
      const a = w.args as { where?: { listing_id?: string }; data?: { listing_id?: string } };
      return a.where?.listing_id ?? a.data?.listing_id;
    });
    expect(touched).not.toContain('RLS100');
  });

  it('a blank / null / ListingId-shaped ListingKey is skipped untouched', async () => {
    mockStore.listings.push(
      keylessListing({ listing_id: 'RLS100' }),
      keylessListing({ listing_id: 'RLS200' }),
      keylessListing({ listing_id: 'RLS300' }),
    );
    mockFetchListingKeys.mockResolvedValue(
      new Map<string, string | null>([
        ['RLS100', null], // null key
        ['RLS200', '   '], // blank key
        ['RLS300', 'RLS300'], // the ListingId echoed back — not a key
      ]),
    );
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.skipped_no_resource_key).toBe(3);
    expect(t.keys_resolved_via_property_lookup).toBe(0);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
    expect(normalizeResourceKey(null, 'RLS100')).toBeNull();
    expect(normalizeResourceKey('   ', 'RLS200')).toBeNull();
    expect(normalizeResourceKey('RLS300', 'RLS300')).toBeNull();
    expect(normalizeResourceKey(' 1092342380 ', 'RLS300')).toBe('1092342380');
  });

  it('a failed lookup batch resolves nothing and never downgrades to a ListingId query', async () => {
    mockStore.listings.push(keylessListing({ listing_id: 'RLS100' }));
    mockFetchListingKeys.mockRejectedValue(new Error('Property key lookup failed: HTTP 400'));
    const fetchMedia = jest.fn(async () => [feedPhoto()]);

    const t = await run({ execute: true, fetchMedia });

    expect(t.failed_property_key_lookup).toBe(1);
    expect(t.skipped_no_resource_key).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(mockStore.writes).toHaveLength(0);
  });

  it('REGRESSION GUARD: Media is never queried with a value equal to any listing_id', async () => {
    // A mixed population: locally-resolvable, lookup-resolvable, unresolvable,
    // plus a provider that echoes the ListingId back as the "key".
    mockStore.listings.push(
      listing({ listing_id: 'RLS100' }), // local raw_data.ListingKey
      keylessListing({ listing_id: 'RLS200' }), // resolves via lookup
      keylessListing({ listing_id: 'RLS300' }), // omitted by the provider
      keylessListing({ listing_id: 'RLS400' }), // provider echoes the ListingId
    );
    mockFetchListingKeys.mockResolvedValue(
      new Map<string, string | null>([
        ['RLS200', 'KEY-200'],
        ['RLS400', 'RLS400'],
      ]),
    );
    const queried: string[] = [];
    const fetchMedia = jest.fn(async (key: string) => {
      queried.push(key);
      return [feedPhoto({ MediaKey: `MK-${key}` })];
    });

    await run({ execute: true, fetchMedia });

    const listingIds = mockStore.listings.map((l) => l.listing_id);
    for (const key of queried) expect(listingIds).not.toContain(key);
    expect(queried.sort()).toEqual(['KEY-200', 'KEY-RLS100']);
  });

  it('never sends an archived or Mallan listing_id to the Property lookup', async () => {
    mockStore.bypassSelectionWhere = true;
    mockStore.listings.push(
      keylessListing({ listing_id: 'SL-0001' }),
      keylessListing({ listing_id: 'RLS100', sync_status: 'archived' }),
      keylessListing({ listing_id: 'RLS200' }),
    );
    mockFetchListingKeys.mockResolvedValue(new Map([['RLS200', 'KEY-200']]));

    const t = await run({ execute: true, fetchMedia: async () => [feedPhoto({ MediaKey: 'MK-A' })] });

    expect(t.skipped_mallan).toBe(1);
    expect(t.skipped_archived).toBe(1);
    expect(mockFetchListingKeys).toHaveBeenCalledWith(['RLS200']);
  });
});

// ─── Planner admission parity ───────────────────────────────────────────────

describe('planner admission mirrors upsertListingMedia', () => {
  it('classifies invalid rows and delete signals without touching the DB', async () => {
    const plan = await planListingRecovery('RLS100', 'KEY-RLS100', [
      feedPhoto({ MediaKey: 'MK-A' }),
      feedPhoto({ MediaKey: null }), // no MediaKey -> invalid
      feedPhoto({ MediaKey: 'MK-B', Permission: 'Private' }), // non-Public -> invalid
      feedPhoto({ MediaKey: 'MK-C', MediaURL: null }), // no URL -> invalid
      feedPhoto({ MediaKey: 'MK-D', MediaStatus: 'Deleted' }), // delete signal
      feedPhoto({ MediaKey: 'MK-A' }), // duplicate key -> one physical row
    ]);

    expect(plan).toMatchObject({
      fetched: 6,
      admitted: 1,
      invalid: 3,
      delete_signals: 1,
      expected_inserts: 1,
      expected_updates: 0,
      expected_deletes: 0,
    });
    expect(mockStore.writes).toHaveLength(0);
  });
});
