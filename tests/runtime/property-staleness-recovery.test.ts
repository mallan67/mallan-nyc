/// <reference types="jest" />
/**
 * PROPERTY RECOVERY EXECUTOR — behavioral contract (MANIFEST-DRIVEN).
 *
 * These are REAL calls into `recoverStalePropertyListings` with a store-backed
 * Prisma mock and a mocked Trestle fetch. The mapper, distribution gates, the
 * archived-rehydration guard, the new-terminal guard, the write-suppression
 * comparators, the change classifier and the cache-tag plumbing are all the
 * genuine production modules — only the two I/O boundaries are mocked.
 *
 * WHAT CHANGED AND WHY. Selection used to be `last_synced_from_trestle < 7 days`.
 * A live measurement of the 500 oldest-synced of the 4,465 rows that predicate
 * selects found 62 (12.6%) with a provider ModificationTimestamp newer than
 * local and 432 (87.4%) already EQUAL. An old telemetry clock is not evidence of
 * stale data — and because `last_synced_from_trestle` is non-material, a
 * converged row's write is suppressed and its clock never advances, so the
 * predicate re-selects the same 87% forever. Selection now comes from a
 * reconciliation manifest of VERIFIED differences and from nowhere else.
 *
 * The contract under test (see scripts/recover-stale-property-listings.ts):
 *   1. ONLY manifest ids are touched; an id outside the manifest is REFUSED
 *   2. duplicate manifest ids are deduped AND reported explicitly
 *   3. the manifest size is the hard cap; per-batch size is clamped to 500
 *   4. dry run is the default and performs ZERO writes
 *   5. `sync_state` is NEVER touched — not upsert, not update, not create
 *   6. every row is RE-FETCHED; the manifest supplies WHICH, never WHAT
 *   7. a provenance-only revision produces ZERO listing writes
 *   8. a material change (price) DOES write, and invalidates cache
 *   9. a status change writes; a provider-terminal correction writes
 *  10. an archived listing is not rehydrated
 *  11. a new+terminal listing is still skipped; nothing is ever created
 *  12. one failing row does not abort the batch or corrupt the accounting
 *  13. re-running produces zero material writes the second time
 *  14. a missing/wrong confirm token, a missing production declaration, a
 *      missing manifest, or a non-canonical database endpoint refuses to execute
 *
 * Item 5 is the reason this file exists at all. `sync_state.Property` is a
 * forward-only provider keyset (lib/idx/sync.ts:580); a recovery run traverses a
 * manifest, so any position it wrote would be a claim about provider records it
 * never fetched. That must be proven by assertion, not asserted by comment.
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

/** The store currently wired by `wireStore`, for transaction snapshot/restore. */
let activeStore: Map<string, Row> | null = null;

const mockTxBegin = jest.fn();
const mockTxCommit = jest.fn();
const mockTxRollback = jest.fn();
/** The client handed to the $transaction callback — same seams as the root. */
const txClient = {
  listing: {
    update: (a: unknown) => mockListingUpdate(a),
    findUnique: (a: unknown) => mockListingFindUnique(a),
  },
  listingSearchProjection: {
    findUnique: (a: unknown) => mockProjFindUnique(a),
    upsert: (a: unknown) => mockProjUpsert(a),
  },
};

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
    // Mirrors Prisma's interactive-transaction contract closely enough to prove
    // the executor's semantics: the callback receives a client, and if it
    // THROWS the rejection propagates (a real engine additionally rolls back).
    // `mockTxBegin/Commit/Rollback` record the lifecycle so a test can assert
    // that nothing was committed on failure.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      mockTxBegin();
      // Snapshot so a failed callback restores prior state, the way a real
      // engine rolls back. Deep-enough copy: rows are flat column bags.
      const snapshot = activeStore
        ? new Map([...activeStore].map(([k, v]) => [k, { ...v }] as const))
        : null;
      try {
        const out = await fn(txClient);
        mockTxCommit();
        return out;
      } catch (err) {
        if (snapshot && activeStore) {
          activeStore.clear();
          for (const [k, v] of snapshot) activeStore.set(k, v);
        }
        mockTxRollback();
        throw err;
      }
    },
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
  recoverOneListing,
  parseRecoveryArgs,
  parseRecoveryManifest,
  selectManifestIds,
  assertListingIdInManifest,
  clampBatchSize,
  assertCanonicalTarget,
  RECOVERY_CONFIRM_TOKEN,
  MAX_BATCH_SIZE,
  PRODUCTION_ENV_VAR,
  PRODUCTION_ENV_VALUE,
  type RecoveryOptions,
  type RecoveryEnv,
  newWriteReasonForecast,
  accumulateWriteReasons,
} from "../../scripts/recover-stale-property-listings";
import type {
  ManifestEntry,
  RecoveryManifest,
  RecoveryReason,
} from "../../scripts/build-recovery-manifest";
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

const LAST_SYNCED = new Date("2026-07-14T12:00:00.000Z");

// ── Manifest fixtures ───────────────────────────────────────────────────────

function entry(
  listingId: string,
  reasons: RecoveryReason[] = ["provider_mt_newer"],
  listingKey: string | null = `KEY-${listingId}`,
): ManifestEntry {
  return { listingId, listingKey, reasons };
}

function manifest(entries: ManifestEntry[]): RecoveryManifest {
  return {
    generatedAt: "2026-08-13T12:00:00.000Z",
    includeMlsBackfill: false,
    providerPopulation: entries.length,
    localComparablePopulation: entries.length,
    absentLocally: 0,
    totalsByReason: {
      provider_mt_newer: entries.length,
      status_mismatch: 0,
      local_active_provider_terminal: 0,
      display_gate_mismatch: 0,
      mls_id_missing_or_wrong: 0,
    },
    diagnostics: {
      mlsIdMissingOrWrongTotal: 0,
      mlsBackfillOnlyRows: 0,
      duplicateProviderListingIds: 0,
      duplicateProviderListingIdSamples: [],
      displayGateOverDisplay: 0,
      displayGateUnderDisplay: 0,
      displayGateExplainedByLocalGate: 0,
      staleLocalPermissionGates: 0,
      mallanOwnedExcluded: 0,
      providerGhostsDeferredToFeedReconcile: 0,
      providerExistenceProbeUnknown: 0,
      absentLocallyExpectedNew: 0,
      absentLocallyUnexplained: 0,
      absentLocallyUnknownTimestamp: 0,
    },
    manifestSize: entries.length,
    entries,
  };
}

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
    last_synced_from_trestle: LAST_SYNCED,
    ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
    ...overrides,
  };
}

// ── Store-backed Prisma behavior ────────────────────────────────────────────

type Row = Record<string, unknown>;

function wireStore(store: Map<string, Row>) {
  // Handed to the $transaction mock so a rolled-back transaction actually
  // RESTORES prior state — without that, a "rollback" test would silently
  // measure committed state and pass for the wrong reason.
  activeStore = store;
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
  mockListingCount.mockResolvedValue(0);
  mockListingFindMany.mockResolvedValue([]);
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
    manifest: manifest([entry("RLS100001")]),
    env: prodEnv(),
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
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── 1. Selection comes from the manifest and NOWHERE else ───────────────────

describe("manifest-only selection", () => {
  it("touches EXACTLY the manifest ids and never queries for its own worklist", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown>>();
    for (const id of ["A1", "A2", "A3"]) {
      const raw = rawRecord({ ListingId: id, ListingKey: `K-${id}` });
      store.set(id, dbRowFromRaw(raw));
      feed.set(id, raw);
    }
    // A4 exists locally and is far staler than the rest — the OLD predicate
    // would have selected it. It is not in the manifest, so it must not be
    // touched: an old sync clock is not evidence of a difference.
    store.set("A4", dbRowFromRaw(rawRecord({ ListingId: "A4", ListingKey: "K-A4" }), {
      last_synced_from_trestle: new Date("2026-03-28T00:00:00.000Z"),
    }));
    feed.set("A4", rawRecord({ ListingId: "A4", ListingKey: "K-A4", ListPrice: 111000 }));
    wireStore(store);
    wireFeed(feed);

    const report = await recoverStalePropertyListings(
      options({ manifest: manifest([entry("A1"), entry("A2"), entry("A3")]), total: 3 }),
    );

    expect(report.totals.selected).toBe(3);
    expect(mockFetchSingleListing.mock.calls.map((c) => c[0]).sort()).toEqual(["A1", "A2", "A3"]);
    // No local staleness query of ANY kind was issued.
    expect(mockListingCount).not.toHaveBeenCalled();
    expect(mockListingFindMany).not.toHaveBeenCalled();
    assertSyncStateUntouched();
  });

  it("REFUSES a listing id that is not present in the manifest", () => {
    const allowed = new Set(["A1", "A2"]);
    expect(() => assertListingIdInManifest("A1", allowed)).not.toThrow();
    expect(() => assertListingIdInManifest("INTRUDER", allowed)).toThrow(
      /Refusing to touch INTRUDER: it is not present in the recovery manifest/,
    );
  });

  it("wires that refusal into the row path BEFORE any I/O", () => {
    // The guard existing is not the same as the guard running. This drives the
    // real per-row function with an id outside the allowed set and proves it
    // refuses without touching Cotality or the database — so a future refactor
    // that widens the loop still cannot widen the blast radius.
    const raw = rawRecord({ ListingId: "INTRUDER", ListingKey: "K-INTRUDER" });
    wireStore(new Map<string, Row>([["INTRUDER", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["INTRUDER", rawRecord({ ListingId: "INTRUDER", ListPrice: 999000 })]]));

    return recoverOneListing("INTRUDER", true, new Set(["RLS100001"])).then(
      () => {
        throw new Error("recoverOneListing resolved for an id outside the manifest");
      },
      (err: Error) => {
        expect(err.message).toMatch(/not present in the recovery manifest/);
        expect(mockFetchSingleListing).not.toHaveBeenCalled();
        expect(mockListingFindUnique).not.toHaveBeenCalled();
        assertNoWritesAtAll();
      },
    );
  });

  it("refuses to run at all when no manifest is supplied", async () => {
    wireStore(new Map<string, Row>());
    await expect(
      recoverStalePropertyListings(
        options({ manifest: undefined, manifestPath: null }),
      ),
    ).rejects.toThrow(/no manifest supplied/);
    expect(mockFetchSingleListing).not.toHaveBeenCalled();
  });

  it("refuses at parse time when --manifest is omitted", () => {
    expect(() => parseRecoveryArgs(["--total=10"])).toThrow(/--manifest=<path> is REQUIRED/);
    expect(() => parseRecoveryArgs(["--total=10", "--manifest="])).toThrow(
      /--manifest=<path> is REQUIRED/,
    );
    expect(() => parseRecoveryArgs(["--manifest=artifacts/m.json"])).toThrow(
      /--total=<n> is REQUIRED/,
    );
    const args = parseRecoveryArgs(["--manifest=artifacts/m.json", "--total=10"]);
    expect(args.manifestPath).toBe("artifacts/m.json");
    expect(args.execute).toBe(false);
  });
});

// ── 2. Duplicate manifest ids ───────────────────────────────────────────────

describe("duplicate manifest ids", () => {
  it("dedupes and REPORTS them explicitly — never a silent collapse", async () => {
    const raw = rawRecord({ ListingId: "DUP", ListingKey: "K-DUP" });
    wireStore(new Map<string, Row>([["DUP", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["DUP", raw]]));

    const selection = selectManifestIds(manifest([entry("DUP"), entry("DUP"), entry("OTHER")]));
    expect(selection.ids).toEqual(["DUP", "OTHER"]);
    expect(selection.duplicateIds).toEqual(["DUP"]);

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const report = await recoverStalePropertyListings(
      options({ manifest: manifest([entry("DUP"), entry("DUP")]), total: 1 }),
    );

    expect(report.manifest_size).toBe(2);
    expect(report.manifest_unique_ids).toBe(1);
    expect(report.manifest_duplicate_ids).toEqual(["DUP"]);
    // The duplicate is surfaced on the console, not swallowed.
    expect(warn.mock.calls.flat().join(" ")).toMatch(/duplicated listing id/);
    // And the row is processed exactly once.
    expect(mockFetchSingleListing).toHaveBeenCalledTimes(1);
  });

  it("counts the manifest cap in UNIQUE ids, so a duplicate cannot inflate --total", async () => {
    wireStore(new Map<string, Row>());
    wireFeed(new Map());
    await expect(
      recoverStalePropertyListings(
        options({ manifest: manifest([entry("DUP"), entry("DUP")]), total: 2 }),
      ),
    ).rejects.toThrow(/exceeds the manifest's 1 unique listing id/);
  });
});

// ── 3. Caps ─────────────────────────────────────────────────────────────────

describe("caps", () => {
  it("refuses a total larger than the manifest's unique-id count", async () => {
    wireStore(new Map<string, Row>());
    wireFeed(new Map());
    await expect(
      recoverStalePropertyListings(options({ manifest: manifest([entry("A1")]), total: 5000 })),
    ).rejects.toThrow(/exceeds the manifest's 1 unique listing id\(s\)/);
    expect(mockFetchSingleListing).not.toHaveBeenCalled();
  });

  it("clamps the batch size to 500 even when a larger value is passed", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown>>();
    const entries: ManifestEntry[] = [];
    for (let i = 0; i < 600; i++) {
      const id = `RLS${String(200000 + i)}`;
      const raw = rawRecord({ ListingId: id, ListingKey: `KEY${i}` });
      store.set(id, dbRowFromRaw(raw));
      feed.set(id, raw);
      entries.push(entry(id));
    }
    wireStore(store);
    wireFeed(feed);

    const report = await recoverStalePropertyListings(
      options({ manifest: manifest(entries), total: 600, batchSize: 5000 }),
    );

    expect(report.batch_size).toBe(MAX_BATCH_SIZE);
    expect(report.batches[0].selected).toBe(MAX_BATCH_SIZE);
    expect(report.batches.map((b) => b.selected)).toEqual([500, 100]);
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

  it("stops at the explicit total across multiple batches", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown>>();
    const entries: ManifestEntry[] = [];
    for (let i = 0; i < 12; i++) {
      const id = `RLS${String(300000 + i)}`;
      const raw = rawRecord({ ListingId: id, ListingKey: `KEY${i}` });
      store.set(id, dbRowFromRaw(raw));
      feed.set(id, raw);
      entries.push(entry(id));
    }
    wireStore(store);
    wireFeed(feed);

    const report = await recoverStalePropertyListings(
      options({ manifest: manifest(entries), total: 7, batchSize: 3 }),
    );

    expect(report.manifest_unique_ids).toBe(12);
    expect(report.batches.map((b) => b.selected)).toEqual([3, 3, 1]);
    expect(report.totals.selected).toBe(7);
    expect(mockFetchSingleListing).toHaveBeenCalledTimes(7);
    assertSyncStateUntouched();
  });

  it("refuses an unbounded total at parse time", () => {
    const m = "--manifest=artifacts/m.json";
    expect(() => parseRecoveryArgs([m, "--total=all"])).toThrow(/plain positive integer/);
    expect(() => parseRecoveryArgs([m, "--total=Infinity"])).toThrow(/plain positive integer/);
    expect(() => parseRecoveryArgs([m, "--total=0"])).toThrow(/positive integer/);
    expect(() => parseRecoveryArgs([m, "--total=-5"])).toThrow(/plain positive integer/);
  });

  it("refuses a non-finite total passed straight to the executor", async () => {
    wireStore(new Map<string, Row>());
    await expect(
      recoverStalePropertyListings(options({ total: Number.POSITIVE_INFINITY })),
    ).rejects.toThrow(/explicit finite positive integer/);
  });
});

// ── 4. Dry run ──────────────────────────────────────────────────────────────

describe("dry run", () => {
  it("performs ZERO writes even when every manifest row has a material change", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
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
    expect(parseRecoveryArgs(["--manifest=m.json", "--total=10"]).execute).toBe(false);
  });
});

// ── 5. sync_state is never touched ──────────────────────────────────────────

describe("sync_state", () => {
  it("is NEVER written on an executing run that materially changes rows", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
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
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map([["RLS100001", null]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.failed).toBe(1);
    assertSyncStateUntouched();
  });
});

// ── 6. The manifest supplies WHICH, never WHAT ──────────────────────────────

describe("re-fetch at execution time", () => {
  it("re-reads every selected id from Cotality — the manifest carries no payload", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord({ ListPrice: 999000 })]]));

    await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(mockFetchSingleListing).toHaveBeenCalledTimes(1);
    expect(mockFetchSingleListing).toHaveBeenCalledWith("RLS100001");
    // What was written came from the LIVE record, not from the manifest.
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(String(data.list_price)).toBe("999000");
  });

  it("SUPPRESSES the write when the source converged between manifest and execution", async () => {
    // The manifest asserted `provider_mt_newer` when it was built. By execution
    // time the provider record matches local exactly. A reason code is a
    // hypothesis to re-verify, never an instruction to write — so this writes
    // nothing at all.
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord()]]));

    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([
          entry("RLS100001", ["provider_mt_newer", "status_mismatch", "display_gate_mismatch"]),
        ]),
      }),
    );

    expect(report.totals.suppressed_unchanged).toBe(1);
    expect(report.totals.written).toBe(0);
    assertNoWritesAtAll();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("fails the row (never writes) when the source vanished after the manifest was built", async () => {
    // fetchSingleListing returns null for "no such record" AND for a transport
    // error, and the caller cannot tell them apart — so an indistinguishable
    // outcome is never a resolved one. Fail closed.
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map([["RLS100001", null]]));

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
    );

    expect(report.totals.failed).toBe(1);
    expect(report.totals.written).toBe(0);
    assertNoWritesAtAll();
  });
});

// ── 7/8/9. Suppression vs material writes ───────────────────────────────────

describe("write suppression", () => {
  it("writes NOTHING for a provenance-only revision", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    // ONLY the revision clock moved — the production shape of a provenance bump,
    // and exactly what `provider_mt_newer` looks like when nothing else changed.
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

  it("DOES write a price change, and invalidates the listing + search tags", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
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

  it("DOES write a status change flagged as status_mismatch", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "ActiveUnderContract" })]]));

    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([entry("RLS100001", ["status_mismatch"])]),
      }),
    );

    expect(report.totals.written).toBe(1);
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("ActiveUnderContract");
    // A real transition also stamps the DOM/retention clock.
    expect(data.status_changed_at).toBeInstanceOf(Date);
    assertSyncStateUntouched();
  });

  it("DOES write a provider-terminal correction and closes the display gate", async () => {
    // `local_active_provider_terminal`: we still show it Active, the provider no
    // longer lists it Active-ish. The live re-fetch returns Closed, so the
    // canonical mapper forces idx_display_yn=false — the correction that keeps a
    // sold listing off the public site.
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord({ StandardStatus: "Closed" })]]));

    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([
          entry("RLS100001", ["local_active_provider_terminal"], null),
        ]),
      }),
    );

    expect(report.totals.written).toBe(1);
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("Closed");
    expect(data.idx_display_yn).toBe(false);
    assertSyncStateUntouched();
  });

  it("DOES write an mls_id backfill row — mls_id is a material column", async () => {
    // POLICY: `mls_id_missing_or_wrong` is a real material difference, so once a
    // row reaches the executor it is written like any other. The decision an
    // operator makes is upstream, at manifest-build time
    // (`--include-mls-backfill`), so an identity backfill can never be hidden
    // inside a staleness repair.
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw, { mls_id: null })]]));
    wireFeed(new Map([["RLS100001", rawRecord()]]));

    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([entry("RLS100001", ["mls_id_missing_or_wrong"])]),
      }),
    );

    expect(report.totals.written).toBe(1);
    const data = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.mls_id).toBe("KEY100001");
  });

  it("writes NOTHING for an already-converged mls row (the identity gap already closed)", async () => {
    const raw = rawRecord();
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(raw)]]));
    wireFeed(new Map([["RLS100001", rawRecord()]]));

    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([entry("RLS100001", ["mls_id_missing_or_wrong"])]),
      }),
    );

    expect(report.totals.suppressed_unchanged).toBe(1);
    expect(report.totals.written).toBe(0);
    assertNoWritesAtAll();
  });
});

// ── 10. Archived rows are not rehydrated ────────────────────────────────────

describe("archived protection", () => {
  it("does NOT rehydrate an archived row, even when the feed re-emits content", async () => {
    // The T+180 archiver strips raw_data/media and stamps sync_status='archived'
    // (lib/retention/archive-terminals.ts). The fixture keeps the LOCAL status
    // Active so the row is a plausible manifest candidate at all — the anomalous
    // archived-but-still-display-eligible row, which is exactly the case where
    // re-hydrating stripped blobs is most damaging (it is publicly reachable)
    // and where a bulk backfill would re-open the strip -> rehydrate -> re-strip
    // churn of #415.
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

// ── 11. Never creates ───────────────────────────────────────────────────────

describe("new-terminal policy / no create", () => {
  it("skips a listing that is absent locally and arrives terminal — never creates it", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
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

  it("never creates a row that has no local counterpart even in a creatable status", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
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

// ── 12. Failure isolation ───────────────────────────────────────────────────

describe("failure isolation", () => {
  it("one failing row does not abort the batch and does not corrupt the accounting", async () => {
    const store = new Map<string, Row>();
    const feed = new Map<string, Record<string, unknown> | null>();
    const entries: ManifestEntry[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `RLS${String(400000 + i)}`;
      const raw = rawRecord({ ListingId: id, ListingKey: `KEY${i}` });
      store.set(id, dbRowFromRaw(raw));
      feed.set(id, rawRecord({ ListingId: id, ListingKey: `KEY${i}`, ListPrice: 999000 }));
      entries.push(entry(id));
    }
    wireStore(store);
    wireFeed(feed);
    // Row #2 throws hard inside the Trestle call.
    mockFetchSingleListing.mockImplementation(async (id: string) => {
      if (id === "RLS400001") throw new Error("simulated Trestle 500");
      return feed.get(id) ?? null;
    });

    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 4,
        batchSize: 4,
        manifest: manifest(entries),
      }),
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

// ── 13. Idempotence ─────────────────────────────────────────────────────────

describe("idempotence", () => {
  it("produces zero material writes on a second identical execution", async () => {
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

    // Second pass over the SAME manifest and the SAME feed state. Nothing about
    // the manifest changed, so if a reason code could force a write this would
    // write again. It must not.
    mockListingUpdate.mockClear();
    mockProjUpsert.mockClear();
    mockRevalidateTag.mockClear();

    const second = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1 }),
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

// ── 14. Execution guards ────────────────────────────────────────────────────

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

  it("refuses to execute without a manifest", async () => {
    wireStore(new Map<string, Row>());
    wireFeed(new Map());
    await expect(
      recoverStalePropertyListings(
        options({
          execute: true,
          confirm: RECOVERY_CONFIRM_TOKEN,
          manifest: undefined,
          manifestPath: null,
        }),
      ),
    ).rejects.toThrow(/a manifest is REQUIRED for --execute/);
    assertNoWritesAtAll();
  });

  it("refuses the STALE morning-bread / royal-dawn endpoint explicitly", async () => {
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map());
    const env: RecoveryEnv = { DATABASE_URL_UNPOOLED: STALE_URL };
    await expect(recoverStalePropertyListings(options({ env }))).rejects.toThrow(
      /not the canonical production endpoint/,
    );
    // Not even a READ was issued against the wrong database.
    expect(mockListingFindUnique).not.toHaveBeenCalled();
    assertNoWritesAtAll();
  });

  it("fails closed when the host cannot be determined", () => {
    expect(() => assertCanonicalTarget({})).toThrow(/cannot be determined/);
    expect(() => assertCanonicalTarget({ DATABASE_URL: "" })).toThrow(/cannot be determined/);
  });

  it("guards the endpoint on DRY RUNS too", async () => {
    wireStore(new Map<string, Row>());
    await expect(
      recoverStalePropertyListings(options({ env: { DATABASE_URL: STALE_URL } })),
    ).rejects.toThrow(/not the canonical production endpoint/);
    expect(mockListingFindUnique).not.toHaveBeenCalled();
  });
});

// ── 15. Manifest validation (fail-closed) ───────────────────────────────────

describe("manifest validation", () => {
  it("REFUSES an entry that carries a listing payload", async () => {
    // The structural guarantee behind "WHICH, never WHAT". If an entry could
    // carry a payload, a future edit could quietly trust it instead of
    // re-fetching from Cotality.
    const poisoned = manifest([entry("RLS100001")]);
    (poisoned.entries[0] as unknown as Record<string, unknown>).list_price = 1;

    expect(() => parseRecoveryManifest(poisoned)).toThrow(
      /carries unexpected key\(s\) \[list_price\]/,
    );
    wireStore(new Map<string, Row>([["RLS100001", dbRowFromRaw(rawRecord())]]));
    wireFeed(new Map([["RLS100001", rawRecord()]]));
    await expect(
      recoverStalePropertyListings(options({ manifest: poisoned })),
    ).rejects.toThrow(/carries unexpected key\(s\)/);
    expect(mockFetchSingleListing).not.toHaveBeenCalled();
  });

  it("REFUSES an entry with no reason codes — a reasonless row is never legitimate", () => {
    const empty = manifest([entry("RLS100001", [])]);
    expect(() => parseRecoveryManifest(empty)).toThrow(/has no reason codes/);
  });

  it("REFUSES an unknown reason code rather than processing an unrecognised contract", () => {
    const unknown = manifest([entry("RLS100001", ["stale_clock" as RecoveryReason])]);
    expect(() => parseRecoveryManifest(unknown)).toThrow(/unknown reason code "stale_clock"/);
  });

  it("REFUSES a manifest whose declared size disagrees with its entries", () => {
    const truncated = manifest([entry("A"), entry("B")]);
    truncated.entries.pop();
    expect(() => parseRecoveryManifest(truncated)).toThrow(/does not match the number of entries/);
  });

  it("REFUSES a manifest that is not an object, or has no entries array", () => {
    expect(() => parseRecoveryManifest(null)).toThrow(/not a JSON object/);
    expect(() => parseRecoveryManifest([])).toThrow(/not a JSON object/);
    expect(() => parseRecoveryManifest({ generatedAt: "x" })).toThrow(/no `entries` array/);
    expect(() => parseRecoveryManifest({ entries: [] })).toThrow(/no `generatedAt` timestamp/);
  });

  it("REFUSES an entry with an unusable listingId", () => {
    expect(() => parseRecoveryManifest(manifest([entry("   ")]))).toThrow(/no usable listingId/);
  });

  it("accepts a well-formed manifest and preserves its reason codes", () => {
    const parsed = parseRecoveryManifest(
      manifest([entry("RLS100001", ["provider_mt_newer", "display_gate_mismatch"])]),
    );
    expect(parsed.entries).toEqual([
      {
        listingId: "RLS100001",
        listingKey: "KEY-RLS100001",
        reasons: ["provider_mt_newer", "display_gate_mismatch"],
      },
    ]);
  });
});

// ── Write-reason forecast: the one-time identity write must stay visible ─────
//
// `written` alone cannot answer what the deploy is judged on. 8,390 of 8,403
// Active-ish rows carry mls_id = NULL, so the first touch of each writes once
// for identity alone. Folded into a single count it is indistinguishable from
// real content churn, and the write-reduction metric becomes unreadable exactly
// when it is being evaluated. Attribution reuses the SAME
// classifyListingChangeReasons result that decided suppression — never a second
// comparator.

describe("write-reason forecast", () => {
  it("starts with every canonical reason at zero", () => {
    const f = newWriteReasonForecast();
    expect(Object.values(f.by_reason).every((v) => v === 0)).toBe(true);
    expect(f.by_reason).toHaveProperty("source_identity", 0);
    expect(f.source_identity_only).toBe(0);
    expect(f.source_identity_plus_material).toBe(0);
    expect(f.material_without_source_identity).toBe(0);
  });

  it("attributes an identity-ONLY write to source_identity_only", () => {
    const f = newWriteReasonForecast();
    accumulateWriteReasons(f, ["source_identity"]);
    expect(f.by_reason.source_identity).toBe(1);
    expect(f.source_identity_only).toBe(1);
    expect(f.source_identity_plus_material).toBe(0);
    expect(f.material_without_source_identity).toBe(0);
  });

  it("attributes identity + real content to source_identity_plus_material", () => {
    const f = newWriteReasonForecast();
    accumulateWriteReasons(f, ["source_identity", "status"]);
    expect(f.by_reason.source_identity).toBe(1);
    expect(f.by_reason.status).toBe(1);
    expect(f.source_identity_plus_material).toBe(1);
    expect(f.source_identity_only).toBe(0);
  });

  it("attributes a content-only write to material_without_source_identity", () => {
    const f = newWriteReasonForecast();
    accumulateWriteReasons(f, ["price", "address"]);
    expect(f.material_without_source_identity).toBe(1);
    expect(f.source_identity_only + f.source_identity_plus_material).toBe(0);
    expect(f.by_reason.price).toBe(1);
    expect(f.by_reason.address).toBe(1);
  });

  it("keeps by_reason NON-exclusive but the three buckets EXCLUSIVE", () => {
    const f = newWriteReasonForecast();
    accumulateWriteReasons(f, ["source_identity"]);
    accumulateWriteReasons(f, ["source_identity", "price"]);
    accumulateWriteReasons(f, ["status"]);
    // by_reason double-counts across reasons, by design.
    expect(f.by_reason.source_identity).toBe(2);
    expect(f.by_reason.price).toBe(1);
    expect(f.by_reason.status).toBe(1);
    // The three exclusive buckets sum to the number of written rows.
    expect(
      f.source_identity_only + f.source_identity_plus_material + f.material_without_source_identity,
    ).toBe(3);
  });

  it("still counts a written row whose reasons are absent", () => {
    // A written row must never be invisible in the exclusive split.
    const f = newWriteReasonForecast();
    accumulateWriteReasons(f, undefined);
    accumulateWriteReasons(f, []);
    expect(f.material_without_source_identity).toBe(2);
    expect(
      f.source_identity_only + f.source_identity_plus_material + f.material_without_source_identity,
    ).toBe(2);
  });
});

// ── Recovery listing+projection atomicity (round 8, Maya decision 2) ────────
//
// Canonical sync runs the projection stage BEFORE recordCursorPosition, so a
// projection failure leaves the source row unrecorded and the composite cursor
// RETRIES it — the cursor is that path's retry anchor. This executor has no such
// anchor: it traverses a manifest, never writes sync_state, and re-derives its
// worklist from a MATERIAL comparison. A committed listing UPDATE followed by a
// failed projection would therefore be UNRECOVERABLE: the next run finds the
// listing materially equal to Cotality, suppresses, and the stale projection is
// never repaired while the executor reports convergence.

describe("recovery write is atomic: listing + projection commit together", () => {
  const ID = "RLS100001";

  function wireMaterialDifference() {
    const raw = rawRecord({ ListingId: ID, ListingKey: "K1" });
    wireStore(new Map<string, Row>([[ID, dbRowFromRaw(raw)]]));
    // A real price delta => a material correction, not a provenance bump.
    wireFeed(new Map([[ID, rawRecord({ ListingId: ID, ListingKey: "K1", ListPrice: 4_250_000 })]]));
  }

  it("A. update + projection both succeed -> ONE transaction, committed, tags returned", async () => {
    wireMaterialDifference();
    const res = await recoverOneListing(ID, true, new Set([ID]));

    expect(res.outcome).toBe("written");
    expect(mockTxBegin).toHaveBeenCalledTimes(1);
    expect(mockTxCommit).toHaveBeenCalledTimes(1);
    expect(mockTxRollback).not.toHaveBeenCalled();
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    expect(mockProjUpsert).toHaveBeenCalled();
    assertSyncStateUntouched();
  });

  it("B. projection THROWS -> rollback, outcome failed, NO cache tags", async () => {
    wireMaterialDifference();
    mockProjUpsert.mockImplementationOnce(() => {
      throw new Error("projection upsert exploded");
    });

    await expect(recoverOneListing(ID, true, new Set([ID]))).rejects.toThrow(
      /projection upsert exploded/,
    );

    expect(mockTxRollback).toHaveBeenCalledTimes(1);
    expect(mockTxCommit).not.toHaveBeenCalled();
    // The listing update was ISSUED inside the transaction; the engine undoes
    // it. What must never happen is the executor swallowing the error and
    // reporting success — the rejection above is that proof.
    assertSyncStateUntouched();
  });

  it("B2. the whole run books it as failed and invalidates NOTHING", async () => {
    wireMaterialDifference();
    mockProjUpsert.mockImplementation(() => {
      throw new Error("projection down");
    });

    const report = await recoverStalePropertyListings(
      options({ execute: true, confirm: RECOVERY_CONFIRM_TOKEN, total: 1, manifest: manifest([entry(ID)]) }),
    );

    expect(report.totals.failed).toBe(1);
    expect(report.totals.written).toBe(0);
    expect(report.revalidated_tags).toEqual([]);
    expect(report.revalidation_failures).toBe(0);
    // A failed row contributes no material correction and blocks convergence.
    expect(report.material_correction_count).toBe(0);
    expect(report.converged).toBe(false);
    assertSyncStateUntouched();
  });

  it("C. a retry after the projection recovers commits BOTH", async () => {
    wireMaterialDifference();
    mockProjUpsert.mockImplementationOnce(() => {
      throw new Error("transient");
    });
    await expect(recoverOneListing(ID, true, new Set([ID]))).rejects.toThrow(/transient/);

    // Rolled back => the row is still materially different on the retry.
    const res = await recoverOneListing(ID, true, new Set([ID]));
    expect(res.outcome).toBe("written");
    expect(mockTxCommit).toHaveBeenCalledTimes(1);
  });

  it("E. the executor can NEVER report a written row without a committed projection", async () => {
    // The invariant behind A-C: `written` is returned only after $transaction
    // resolves, and $transaction resolves only if the projection call resolved.
    wireMaterialDifference();
    mockProjUpsert.mockImplementation(() => {
      throw new Error("always down");
    });
    const outcomes: string[] = [];
    for (let i = 0; i < 3; i++) {
      await recoverOneListing(ID, true, new Set([ID])).then(
        (r) => outcomes.push(r.outcome),
        () => outcomes.push("threw"),
      );
    }
    expect(outcomes).toEqual(["threw", "threw", "threw"]);
    expect(mockTxCommit).not.toHaveBeenCalled();
  });
});

// ── Convergence is a MATERIAL verdict, not an empty candidate list ──────────
//
// Maya decision 1: do NOT reintroduce provenance-only listing writes to make a
// report reach zero. `provider_mt_newer` is a CANDIDATE signal; the canonical
// comparison is the authority.

describe("provider-revision-only candidates converge WITHOUT a write", () => {
  const ID = "RLS100001";

  function wireProvenanceOnlyRevision() {
    const raw = rawRecord({ ListingId: ID, ListingKey: "K1" });
    const row = dbRowFromRaw(raw);
    wireStore(new Map<string, Row>([[ID, row]]));
    // SAME material content, NEWER provider ModificationTimestamp.
    wireFeed(
      new Map([
        [
          ID,
          rawRecord({
            ListingId: ID,
            ListingKey: "K1",
            ModificationTimestamp: "2099-01-01T00:00:00.000Z",
          }),
        ],
      ]),
    );
  }

  it("suppresses as provenance-only with ZERO writes, and reports converged", async () => {
    wireProvenanceOnlyRevision();
    const report = await recoverStalePropertyListings(
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([entry(ID, ["provider_mt_newer"])]),
      }),
    );

    expect(report.totals.suppressed_provenance_only).toBe(1);
    expect(report.totals.written).toBe(0);
    expect(report.totals.failed).toBe(0);
    expect(mockListingUpdate).not.toHaveBeenCalled();
    expect(mockTxBegin).not.toHaveBeenCalled();

    // THE CONTRACT: a candidate remains, yet the system IS converged.
    expect(report.candidate_count).toBe(1);
    expect(report.material_correction_count).toBe(0);
    expect(report.converged).toBe(true);
    assertSyncStateUntouched();
  });

  it("stays converged on a SECOND pass — no self-regenerating write loop", async () => {
    wireProvenanceOnlyRevision();
    const opts = () =>
      options({
        execute: true,
        confirm: RECOVERY_CONFIRM_TOKEN,
        total: 1,
        manifest: manifest([entry(ID, ["provider_mt_newer"])]),
      });

    const first = await recoverStalePropertyListings(opts());
    const second = await recoverStalePropertyListings(opts());

    for (const r of [first, second]) {
      expect(r.totals.written).toBe(0);
      expect(r.material_correction_count).toBe(0);
      expect(r.converged).toBe(true);
    }
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });
});

// ── ListingKey-in-features: ONE write, self-extinguishing (round 8, Task 8) ──
//
// Adding ListingKey to the Property select puts it in the features blob, because
// `features` is built from B2_CLASSIFICATION — which ALREADY carries the sibling
// identity fields `ListingId` and `SourceSystemKey`. Identity-in-features is the
// established canonical shape here, not an anomaly introduced by this PR, and
// ListingKey is a public IDX identifier (it is the Media ResourceRecordKey), not
// a HIDDEN_FIELDS entry. What must be proven is that it costs ONE physical write
// and then stops.

describe("ListingKey/mls_id convergence is one write, then silent", () => {
  const ID = "RLS100001";

  it("first emit: ONE listing write carrying BOTH source_identity and features", async () => {
    const raw = rawRecord({ ListingId: ID, ListingKey: "K-NEW" });
    const stale = dbRowFromRaw(raw);
    // Pre-convergence shape: no mls_id, and features without ListingKey.
    stale.mls_id = null;
    stale.features = { ...(stale.features as Record<string, unknown>) };
    delete (stale.features as Record<string, unknown>).ListingKey;
    const store = new Map<string, Row>([[ID, stale]]);
    wireStore(store);
    wireFeed(new Map([[ID, raw]]));

    const res = await recoverOneListing(ID, true, new Set([ID]));

    expect(res.outcome).toBe("written");
    // ONE physical write, not one per reason.
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    expect(res.reasons).toEqual(expect.arrayContaining(["source_identity", "features"]));
    assertSyncStateUntouched();
  });

  it("second identical emit: ZERO writes", async () => {
    const raw = rawRecord({ ListingId: ID, ListingKey: "K-NEW" });
    const stale = dbRowFromRaw(raw);
    stale.mls_id = null;
    stale.features = { ...(stale.features as Record<string, unknown>) };
    delete (stale.features as Record<string, unknown>).ListingKey;
    const store = new Map<string, Row>([[ID, stale]]);
    wireStore(store);
    wireFeed(new Map([[ID, raw]]));

    await recoverOneListing(ID, true, new Set([ID]));
    mockListingUpdate.mockClear();

    const second = await recoverOneListing(ID, true, new Set([ID]));
    expect(second.outcome).toBe("suppressed_unchanged");
    expect(mockListingUpdate).not.toHaveBeenCalled();
    assertSyncStateUntouched();
  });
});
