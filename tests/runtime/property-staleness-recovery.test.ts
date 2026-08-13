/// <reference types="jest" />
/**
 * PROPERTY STALENESS RECOVERY — behavioral contract.
 *
 * These are REAL calls into `recoverStalePropertyListings` with a store-backed
 * Prisma mock and a mocked Trestle fetch. The mapper, distribution gates, the
 * archived-rehydration guard, the new-terminal guard, the write-suppression
 * comparators, the change classifier and the cache-tag plumbing are all the
 * genuine production modules — only the two I/O boundaries are mocked.
 *
 * The contract under test (see scripts/recover-stale-property-listings.ts):
 *   1. dry run is the default and performs ZERO writes
 *   2. batch size is CLAMPED to 500, never merely rejected
 *   3. the explicit total cap holds across multiple batches
 *   4. `sync_state` is NEVER touched — not upsert, not update, not create
 *   5. a provenance-only revision produces ZERO listing writes
 *   6. a material change (price) DOES write, and invalidates cache
 *   7. a status change writes
 *   8. an archived listing is not rehydrated
 *   9. a new+terminal listing is still skipped
 *  10. one failing row does not abort the batch or corrupt the accounting
 *  11. re-running the recovery produces zero material writes the second time
 *  12. a missing/wrong confirm token, a missing production declaration, or a
 *      non-canonical database endpoint refuses to execute
 *
 * Item 4 is the reason this file exists at all. `sync_state.Property` is a
 * forward-only provider keyset (lib/idx/sync.ts:580); a recovery run traverses
 * LOCAL state, so any position it wrote would be a claim about provider records
 * it never fetched. That must be proven by assertion, not asserted by comment.
 */

// ── Prisma (store-backed) ───────────────────────────────────────────────────

const mockListingCount = jest.fn();
const mockListingFindMany = jest.fn();
const mockListingFindUnique = jest.fn();
const mockListingUpdate = jest.fn();
const mockListingUpsert = jest.fn();
const mockListingCreate = jest.fn();
const mockProjFindUnique = jest.fn();
const mockProjUpsert = jest.fn();
const mockSyncStateUpsert = jest.fn();
const mockSyncStateUpdate = jest.fn();
const mockSyncStateCreate = jest.fn();
const mockSyncStateFindUnique = jest.fn();
const mockDisconnect = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: {
      count: (a: unknown) => mockListingCount(a),
      findMany: (a: unknown) => mockListingFindMany(a),
      findUnique: (a: unknown) => mockListingFindUnique(a),
      update: (a: unknown) => mockListingUpdate(a),
      upsert: (a: unknown) => mockListingUpsert(a),
      create: (a: unknown) => mockListingCreate(a),
    },
    listingSearchProjection: {
      findUnique: (a: unknown) => mockProjFindUnique(a),
      upsert: (a: unknown) => mockProjUpsert(a),
    },
    syncState: {
      upsert: (a: unknown) => mockSyncStateUpsert(a),
      update: (a: unknown) => mockSyncStateUpdate(a),
      create: (a: unknown) => mockSyncStateCreate(a),
      findUnique: (a: unknown) => mockSyncStateFindUnique(a),
    },
    $disconnect: () => mockDisconnect(),
  },
}));

// ── Trestle ─────────────────────────────────────────────────────────────────

const mockFetchSingleListing = jest.fn();
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchSingleListing: (id: string) => mockFetchSingleListing(id),
  fetchFromTrestle: jest.fn(),
  buildIncrementalFilter: () => "mock-incremental-filter",
  buildActiveFilter: () => "mock-active-filter",
  buildAgentHistoricalFilter: () => "mock-agent-filter",
  PROPERTY_KEYSET_ORDERBY: "ModificationTimestamp asc,ListingKey asc",
}));

const mockRevalidateTag = jest.fn();
jest.mock("next/cache", () => ({
  __esModule: true,
  revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
}));

jest.mock("@/lib/buildings/public-building-data", () => ({
  __esModule: true,
  warmBuildingManifestShards: jest.fn(async () => null),
  probeManifestPersistence: jest.fn(async () => null),
}));

import {
  recoverStalePropertyListings,
  parseRecoveryArgs,
  clampBatchSize,
  assertCanonicalTarget,
  RECOVERY_CONFIRM_TOKEN,
  MAX_BATCH_SIZE,
  PRODUCTION_ENV_VAR,
  PRODUCTION_ENV_VALUE,
  type RecoveryOptions,
  type RecoveryEnv,
} from "../../scripts/recover-stale-property-listings";
import { mapTrestleToPrisma, checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { ARCHIVED_SYNC_STATUS } from "@/lib/idx/sync";

// ── Environment fixtures ────────────────────────────────────────────────────

const CANONICAL_URL =
  "postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const STALE_URL =
  "postgresql://u:p@ep-royal-dawn-ad6eh8t2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";

function prodEnv(): RecoveryEnv {
  return {
    DATABASE_URL_UNPOOLED: CANONICAL_URL,
    [PRODUCTION_ENV_VAR]: PRODUCTION_ENV_VALUE,
  };
}

const NOW = new Date("2026-08-13T12:00:00.000Z");
/** 30 days behind NOW — comfortably inside the 7-day stale window. */
const STALE_AT = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);

// ── Row fixtures ────────────────────────────────────────────────────────────

function decimalLike(v: string | number) {
  return { toNumber: () => Number(v), toString: () => String(v) };
}

function rawRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingId: "RLS100001",
    ListingKey: "KEY100001",
    PropertyType: "Residential",
    PropertySubType: "Condominium",
    ListPrice: 750000,
    StandardStatus: "Active",
    StreetNumber: "400",
    StreetName: "East 90th Street",
    UnitNumber: "17C",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10128",
    BedroomsTotal: 2,
    BathroomsFull: 2,
    ListAgentMlsId: "AG001",
    ListAgentFullName: "Test Agent",
    ListOfficeName: "Test Office LLC",
    ModificationTimestamp: "2026-07-01T00:00:00Z",
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Media: [],
    ...overrides,
  };
}

/**
 * The DB row EXACTLY as the canonical ingest would have left it for `raw` —
 * built through the real mapper so "unchanged" means genuinely unchanged rather
 * than "unchanged according to a hand-written fixture".
 */
function dbRowFromRaw(
  raw: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const mapped = mapTrestleToPrisma(raw);
  const gates = checkDistributionGates(raw);
  if (!gates.displayable) mapped.sync_status = `gated:${gates.reason}`;
  return {
    listing_id: mapped.listing_id,
    status: mapped.status,
    status_changed_at: new Date("2026-06-01T00:00:00Z"),
    first_active_date: new Date("2026-06-01T00:00:00Z"),
    days_on_market: 10,
    sync_status: mapped.sync_status,
    mls_id: mapped.mls_id,
    listing_type: mapped.listing_type,
    property_type: mapped.property_type,
    property_sub_type: mapped.property_sub_type,
    list_price: decimalLike(mapped.list_price),
    bedrooms_total: mapped.bedrooms_total,
    bathrooms_full: mapped.bathrooms_full,
    bathrooms_half: mapped.bathrooms_half,
    living_area: mapped.living_area === null ? null : decimalLike(mapped.living_area),
    borough: mapped.borough,
    neighborhood: mapped.neighborhood,
    city: mapped.city,
    postal_code: mapped.postal_code,
    idx_display_yn: mapped.idx_display_yn,
    internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
    internet_address_display_yn: mapped.internet_address_display_yn,
    participant_only: mapped.participant_only,
    owner_opt_out: mapped.owner_opt_out,
    address: JSON.parse(JSON.stringify(mapped.address)),
    features: JSON.parse(JSON.stringify(mapped.features)),
    raw_data: JSON.parse(JSON.stringify(mapped.raw_data)),
    modification_timestamp: new Date(mapped.modification_timestamp.getTime()),
    listing_contract_date: mapped.listing_contract_date,
    terminal_since: null,
    cumulative_days_on_market: null,
    agent_id: null,
    last_synced_from_trestle: STALE_AT,
    ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
    ...overrides,
  };
}

// ── Store-backed Prisma behavior ────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Minimal evaluator for the exact `where` shapes this executor builds. */
function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND)) {
    return (where.AND as Record<string, unknown>[]).every((w) => matchesWhere(row, w));
  }
  if (Array.isArray(where.OR)) {
    return (where.OR as Record<string, unknown>[]).some((w) => matchesWhere(row, w));
  }
  const status = where.status as { in?: string[] } | undefined;
  if (status?.in && !status.in.includes(String(row.status))) return false;

  const lsft = where.last_synced_from_trestle;
  if (lsft !== undefined) {
    const value = row.last_synced_from_trestle as Date | null;
    if (lsft instanceof Date) {
      if (!value || value.getTime() !== lsft.getTime()) return false;
    } else {
      const cond = lsft as { lt?: Date; gt?: Date };
      if (cond.lt && !(value && value.getTime() < cond.lt.getTime())) return false;
      if (cond.gt && !(value && value.getTime() > cond.gt.getTime())) return false;
    }
  }

  const lid = where.listing_id as { gt?: string } | undefined;
  if (lid?.gt && !(String(row.listing_id) > lid.gt)) return false;
  return true;
}

function wireStore(store: Map<string, Row>) {
  mockListingCount.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    return [...store.values()].filter((r) => matchesWhere(r, args.where)).length;
  });

  mockListingFindMany.mockImplementation(
    async (args: { where: Record<string, unknown>; take: number }) => {
      const rows = [...store.values()]
        .filter((r) => matchesWhere(r, args.where))
        .sort((a, b) => {
          const at = (a.last_synced_from_trestle as Date | null)?.getTime() ?? 0;
          const bt = (b.last_synced_from_trestle as Date | null)?.getTime() ?? 0;
          if (at !== bt) return at - bt;
          return String(a.listing_id).localeCompare(String(b.listing_id));
        })
        .slice(0, args.take);
      return rows.map((r) => ({
        listing_id: r.listing_id,
        last_synced_from_trestle: r.last_synced_from_trestle,
      }));
    },
  );

  mockListingFindUnique.mockImplementation(
    async (args: { where: { listing_id: string }; select?: Record<string, unknown> }) => {
      const row = store.get(args.where.listing_id);
      if (!row) return null;
      if (!args.select) return { ...row };
      // Project exactly the requested columns so a field missing from the
      // select fails closed in the comparators, as it would in production.
      const out: Row = {};
      for (const key of Object.keys(args.select)) {
        if (key in row) out[key] = row[key];
      }
      return out;
    },
  );

  // Writes land back in the store so idempotence is measured against real
  // post-write state rather than a fixture.
  mockListingUpdate.mockImplementation(
    async (args: { where: { listing_id: string }; data: Record<string, unknown> }) => {
      const row = store.get(args.where.listing_id);
      if (row) store.set(args.where.listing_id, { ...row, ...args.data });
      return {};
    },
  );
  mockListingUpsert.mockResolvedValue({});
  mockListingCreate.mockResolvedValue({});
  mockProjFindUnique.mockResolvedValue(null);
  mockProjUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateUpdate.mockResolvedValue({});
  mockSyncStateCreate.mockResolvedValue({});
}

/** Feed the mocked Trestle endpoint from a listing_id -> raw record map. */
function wireFeed(records: Map<string, Record<string, unknown> | null>) {
  mockFetchSingleListing.mockImplementation(async (id: string) => records.get(id) ?? null);
}

function options(overrides: Partial<RecoveryOptions> = {}): RecoveryOptions {
  return {
    execute: false,
    confirm: null,
    total: 1,
    batchSize: 250,
    staleDays: 7,
    env: prodEnv(),
    now: NOW,
    ...overrides,
  };
}

/** Every write surface this executor is allowed to touch, plus the ones it is not. */
function assertNoWritesAtAll() {
  expect(mockListingUpdate).not.toHaveBeenCalled();
  expect(mockListingUpsert).not.toHaveBeenCalled();
  expect(mockListingCreate).not.toHaveBeenCalled();
  expect(mockProjUpsert).not.toHaveBeenCalled();
}

/** REQUIREMENT 5 — the whole reason a separate executor exists. */
function assertSyncStateUntouched() {
  expect(mockSyncStateUpsert).not.toHaveBeenCalled();
  expect(mockSyncStateUpdate).not.toHaveBeenCalled();
  expect(mockSyncStateCreate).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── 1. Dry run performs zero writes ─────────────────────────────────────────

describe("dry run", () => {
  it("performs ZERO writes even when every selected row has a material change", async () => {
    const raw = rawRecord();
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    // Price moved — unambiguously material.
    wireFeed(new Map([["RLS100001", rawRecord({ ListPrice: 999000 })]]));

    const report = await recoverStalePropertyListings(options({ total: 1 }));

    expect(report.mode).toBe("dry-run");
    expect(report.totals.selected).toBe(1);
    expect(report.totals.fetched).toBe(1);
    // `written` in dry run is the WOULD-write count.
    expect(report.totals.written).toBe(1);
    assertNoWritesAtAll();
    assertSyncStateUntouched();
    // No cache invalidation either — a dry run has no side effects at all.
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(report.revalidated_tags).toEqual([]);
  });

  it("is the DEFAULT: parsed args without --execute yield a dry run", () => {
    expect(parseRecoveryArgs(["--total=10"]).execute).toBe(false);
  });
});

// ── 2. Batch size clamp ─────────────────────────────────────────────────────

describe("batch size", () => {
  it("clamps to 500 even when a larger value is passed", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < 600; i++) {
      const id = `RLS${String(200000 + i)}`;
      const raw = rawRecord({ ListingId: id, ListingKey: `KEY${i}` });
      store.set(id, dbRowFromRaw(raw, {
        last_synced_from_trestle: new Date(STALE_AT.getTime() + i * 1000),
      }));
      feed.set(id, raw);
    }
    wireStore(store);
    wireFeed(feed);

    const report = await recoverStalePropertyListings(
      options({ total: 600, batchSize: 5000 }),
    );

    expect(report.batch_size).toBe(MAX_BATCH_SIZE);
    for (const call of mockListingFindMany.mock.calls) {
      expect((call[0] as { take: number }).take).toBeLessThanOrEqual(MAX_BATCH_SIZE);
    }
    expect(report.batches[0].selected).toBe(MAX_BATCH_SIZE);
    expect(report.totals.selected).toBe(600);
    assertSyncStateUntouched();
  });

  it("clamps rather than rejecting, and never returns less than 1", () => {
    expect(clampBatchSize(5000)).toBe(MAX_BATCH_SIZE);
    expect(clampBatchSize(500)).toBe(MAX_BATCH_SIZE);
    expect(clampBatchSize(1)).toBe(1);
    expect(clampBatchSize(0)).toBe(1);
    expect(clampBatchSize(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

// ── 3. Total cap across batches ─────────────────────────────────────────────

describe("total cap", () => {
  it("stops at the explicit total across multiple batches", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < 12; i++) {
      const id = `RLS${String(300000 + i)}`;
      const raw = rawRecord({ ListingId: id, ListingKey: `KEY${i}` });
      store.set(id, dbRowFromRaw(raw, {
        last_synced_from_trestle: new Date(STALE_AT.getTime() + i * 1000),
      }));
      feed.set(id, raw);
    }
    wireStore(store);
    wireFeed(feed);

    const report = await recoverStalePropertyListings(options({ total: 7, batchSize: 3 }));

    expect(report.backlog).toBe(12);
    expect(report.batches.map((b) => b.selected)).toEqual([3, 3, 1]);
    expect(report.totals.selected).toBe(7);
    expect(mockFetchSingleListing).toHaveBeenCalledTimes(7);
    assertSyncStateUntouched();
  });

  it("refuses a total larger than the measured backlog", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map());

    await expect(recoverStalePropertyListings(options({ total: 5000 }))).rejects.toThrow(
      /exceeds the measured backlog of 1/,
    );
    expect(mockFetchSingleListing).not.toHaveBeenCalled();
  });

  it("refuses an unbounded total at parse time", () => {
    expect(() => parseRecoveryArgs([])).toThrow(/--total=<n> is REQUIRED/);
    expect(() => parseRecoveryArgs(["--total=all"])).toThrow(/plain positive integer/);
    expect(() => parseRecoveryArgs(["--total=Infinity"])).toThrow(/plain positive integer/);
    expect(() => parseRecoveryArgs(["--total=0"])).toThrow(/positive integer/);
    expect(() => parseRecoveryArgs(["--total=-5"])).toThrow(/plain positive integer/);
  });

  it("refuses a non-finite total passed straight to the executor", async () => {
    wireStore(new Map<string, Row>());
    await expect(
      recoverStalePropertyListings(options({ total: Number.POSITIVE_INFINITY })),
    ).rejects.toThrow(/explicit finite positive integer/);
  });
});

// ── 4. sync_state is never touched ──────────────────────────────────────────

describe("sync_state", () => {
  it("is NEVER written on an executing run that materially changes rows", async () => {
    const raw = rawRecord();
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    wireFeed(new Map([["RLS100001", rawRecord({ ListPrice: 999000 })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.written).toBe(1);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    assertSyncStateUntouched();
    // Not even a READ of the cursor — nothing here may depend on it.
    expect(mockSyncStateFindUnique).not.toHaveBeenCalled();
  });

  it("is NEVER written on a failing run either", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", null]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.failed).toBe(1);
    assertSyncStateUntouched();
  });
});

// ── 5/6/7. Suppression vs material writes ───────────────────────────────────

describe("write suppression", () => {
  it("writes NOTHING for a provenance-only revision", async () => {
    const raw = rawRecord();
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    // ONLY the revision clock moved — the production shape of a provenance bump.
    wireFeed(new Map([["RLS100001", rawRecord({ ModificationTimestamp: "2026-08-01T00:00:00Z" })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.suppressed_provenance_only).toBe(1);
    expect(report.totals.written).toBe(0);
    assertNoWritesAtAll();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    assertSyncStateUntouched();
  });

  it("writes NOTHING for a byte-identical re-emit", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord()]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.suppressed_unchanged).toBe(1);
    expect(report.totals.suppressed_provenance_only).toBe(0);
    expect(report.totals.written).toBe(0);
    assertNoWritesAtAll();
  });

  it("DOES write a price change, and invalidates the listing + search tags", async () => {
    const raw = rawRecord();
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    wireFeed(new Map([["RLS100001", rawRecord({ ListPrice: 999000 })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.written).toBe(1);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(String(data.list_price)).toBe("999000");
    // The search projection is dual-written from the canonical helper.
    expect(mockProjUpsert).toHaveBeenCalled();
    // Cache still expires for a real change.
    expect(report.revalidated_tags).toEqual(expect.arrayContaining(["listing:RLS100001", "search"]));
    expect(mockRevalidateTag).toHaveBeenCalled();
    assertSyncStateUntouched();
  });

  it("DOES write a status change", async () => {
    const raw = rawRecord();
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "ActiveUnderContract" })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.written).toBe(1);
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("ActiveUnderContract");
    // A real transition also stamps the DOM/retention clock.
    expect(data.status_changed_at).toBeInstanceOf(Date);
    assertSyncStateUntouched();
  });
});

// ── 8. Archived rows are not rehydrated ─────────────────────────────────────

describe("archived protection", () => {
  it("does NOT rehydrate an archived row, even when the feed re-emits content", async () => {
    // The T+180 archiver strips raw_data/media and stamps sync_status='archived'
    // (lib/retention/archive-terminals.ts). The fixture keeps the LOCAL status
    // Active so the row is selectable by the staleness predicate at all — the
    // anomalous archived-but-still-display-eligible row, which is exactly the
    // case where re-hydrating stripped blobs is most damaging (it is publicly
    // reachable) and where a bulk backfill would re-open the
    // strip -> rehydrate -> re-strip churn of #415.
    const raw = rawRecord();
    const archived = dbRowFromRaw(raw, {
      sync_status: ARCHIVED_SYNC_STATUS,
      raw_data: null,
      status: "Active",
    });
    wireStore(new Map<string, Row>([["RLS100001", archived]]));
    // A NON-canonical incoming status keeps the row archived (#465 rounds 2/3).
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "Pending", ListPrice: 999000 })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.skipped_archived).toBe(1);
    expect(report.totals.written).toBe(0);
    assertNoWritesAtAll();
    assertSyncStateUntouched();
  });

  it("still lets a genuine canonical-active unarchive through", async () => {
    const raw = rawRecord();
    const archived = dbRowFromRaw(raw, {
      sync_status: ARCHIVED_SYNC_STATUS,
      raw_data: null,
      status: "Active",
    });
    wireStore(new Map<string, Row>([["RLS100001", archived]]));
    // Back on market with the exact canonical Active value (#465 round 2).
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "Active" })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.skipped_archived).toBe(0);
    expect(report.totals.written).toBe(1);
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("Active");
    expect(data.sync_status).toBe("synced");
  });
});

// ── 9. New + terminal is still skipped ──────────────────────────────────────

describe("new-terminal policy", () => {
  it("skips a listing that is absent locally and arrives terminal — never creates it", async () => {
    const raw = rawRecord();
    // Selectable row present at selection time...
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    // ...but gone by the per-row read (the shape shouldSkipNewTerminalListing guards).
    mockListingFindUnique.mockResolvedValue(null);
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "Closed" })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.skipped_new_terminal).toBe(1);
    expect(mockListingCreate).not.toHaveBeenCalled();
    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(mockListingUpdate).not.toHaveBeenCalled();
    assertSyncStateUntouched();
  });

  it("never creates a row that vanished mid-run even in a creatable status", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    mockListingFindUnique.mockResolvedValue(null);
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "Active" })]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.failed).toBe(1);
    expect(mockListingCreate).not.toHaveBeenCalled();
    expect(mockListingUpsert).not.toHaveBeenCalled();
  });
});

// ── 10. Failure isolation ───────────────────────────────────────────────────

describe("failure isolation", () => {
  it("one failing row does not abort the batch and does not corrupt the accounting", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown> | null>();
    for (let i = 0; i < 4; i++) {
      const id = `RLS${String(400000 + i)}`;
      const raw = rawRecord({ ListingId: id, ListingKey: `KEY${i}` });
      store.set(id, dbRowFromRaw(raw, {
        last_synced_from_trestle: new Date(STALE_AT.getTime() + i * 1000),
      }));
      feed.set(id, rawRecord({ ListingId: id, ListingKey: `KEY${i}`, ListPrice: 999000 }));
    }
    wireStore(store);
    wireFeed(feed);
    // Row #2 throws hard inside the Trestle call.
    mockFetchSingleListing.mockImplementation(async (id: string) => {
      if (id === "RLS400001") throw new Error("simulated Trestle 500");
      return feed.get(id) ?? null;
    });

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 4, batchSize: 4 }),
    );

    expect(report.totals.selected).toBe(4);
    expect(report.totals.failed).toBe(1);
    expect(report.totals.written).toBe(3);
    // The failed row is counted ONLY as failed — never also fetched or written.
    expect(report.totals.fetched).toBe(3);
    // Counters stay a clean partition of the selected set.
    const t = report.totals;
    expect(
      t.written +
        t.suppressed_provenance_only +
        t.suppressed_unchanged +
        t.skipped_archived +
        t.skipped_new_terminal +
        t.failed,
    ).toBe(t.selected);
    // The failed row itself is untouched in the store.
    expect(mockListingUpdate).toHaveBeenCalledTimes(3);
    for (const call of mockListingUpdate.mock.calls) {
      expect((call[0] as { where: { listing_id: string } }).where.listing_id).not.toBe("RLS400001");
    }
    assertSyncStateUntouched();
  });
});

// ── 11. Idempotence ─────────────────────────────────────────────────────────

describe("idempotence", () => {
  it("produces zero material writes on a second run over the same feed state", async () => {
    const raw = rawRecord();
    const store = new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]);
    wireStore(store);
    const changed = rawRecord({ ListPrice: 999000 });
    wireFeed(new Map([["RLS100001", changed]]));

    const first = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );
    expect(first.totals.written).toBe(1);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);

    // Second pass. staleDays=0 so the freshly-stamped row is selectable again —
    // otherwise the selection predicate alone would hide the row and the
    // comparator would never be exercised.
    mockListingUpdate.mockClear();
    mockProjUpsert.mockClear();
    mockRevalidateTag.mockClear();

    const second = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        staleDays: 1,
        now: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000),
      }),
    );

    expect(second.totals.selected).toBe(1);
    expect(second.totals.written).toBe(0);
    expect(second.totals.suppressed_unchanged).toBe(1);
    expect(mockListingUpdate).not.toHaveBeenCalled();
    expect(mockProjUpsert).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    assertSyncStateUntouched();
  });
});

// ── 12. Execution guards ────────────────────────────────────────────────────

describe("execution guards", () => {
  it("refuses to execute without a confirm token", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map());
    await expect(
      recoverStalePropertyListings(options({ execute: true, confirm: null })),
    ).rejects.toThrow(/--confirm=<token> is missing or does not match/);
    assertNoWritesAtAll();
  });

  it("refuses to execute with a wrong confirm token", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map());
    await expect(
      recoverStalePropertyListings(options({ execute: true, confirm: "yes" })),
    ).rejects.toThrow(/--confirm=<token> is missing or does not match/);
    assertNoWritesAtAll();
  });

  it("refuses to execute without the production-environment declaration", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map());
    await expect(
      recoverStalePropertyListings(
        options({
          execute: true,
          confirm: RECOVERY_CONFIRM_TOKEN,
          env: { DATABASE_URL_UNPOOLED: CANONICAL_URL },
        }),
      ),
    ).rejects.toThrow(new RegExp(`${PRODUCTION_ENV_VAR}=${PRODUCTION_ENV_VALUE} is not set`));
    assertNoWritesAtAll();
  });

  it("refuses the STALE morning-bread / royal-dawn endpoint explicitly", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map());
    const env: RecoveryEnv = { DATABASE_URL_UNPOOLED: STALE_URL };
    await expect(
      recoverStalePropertyListings(options({ env })),
    ).rejects.toThrow(/not the canonical production endpoint/);
    // Not even a READ was issued against the wrong database.
    expect(mockListingCount).not.toHaveBeenCalled();
    assertNoWritesAtAll();
  });

  it("fails closed when the host cannot be determined", () => {
    expect(() => assertCanonicalTarget({})).toThrow(
      /cannot be determined/,
    );
    expect(() =>
      assertCanonicalTarget({ DATABASE_URL: "" }),
    ).toThrow(/cannot be determined/);
  });

  it("guards the endpoint on DRY RUNS too", async () => {
    wireStore(new Map<string, Row>());
    await expect(
      recoverStalePropertyListings(
        options({ env: { DATABASE_URL: STALE_URL } }),
      ),
    ).rejects.toThrow(/not the canonical production endpoint/);
    expect(mockListingCount).not.toHaveBeenCalled();
  });
});

// ── Selection shape ─────────────────────────────────────────────────────────

describe("selection", () => {
  it("is state-based: eligible statuses + a stale last_synced_from_trestle, ordered ASC", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord()]]));

    await recoverStalePropertyListings(options({ total: 1 }));

    const call = mockListingFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, string>>;
    };
    expect(call.where.status).toEqual({
      in: ["Active", "ActiveUnderContract", "ComingSoon"],
    });
    const lt = (call.where.last_synced_from_trestle as { lt: Date }).lt;
    expect(lt.toISOString()).toBe(new Date(NOW.getTime() - 7 * 86_400_000).toISOString());
    expect(call.orderBy[0]).toEqual({ last_synced_from_trestle: "asc" });
    // The count uses the SAME predicate, so the cap is measured against exactly
    // the population that will be traversed.
    expect((mockListingCount.mock.calls[0][0] as { where: unknown }).where).toEqual(call.where);
  });
});
