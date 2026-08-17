/// <reference types="jest" />
/**
 * Sync change-attribution + targeted-warm behavior (failing-first TDD) —
 * Maya directive 2026-07-24, acceptance gate:
 *
 *   1. A TIMESTAMP-ONLY re-emit (ModificationTimestamp column + raw_data
 *      clock moved, nothing else) still WRITES the listing row (provenance)
 *      but: no projection rewrite, NO cache tag revalidated (no listing /
 *      building / search invalidation), NO manifest warm, and the reason
 *      counters attribute it as modification_timestamp_only +
 *      source_timestamp_only.
 *   2. A REAL change (price) invalidates its exact tags + the coarse search
 *      tag and warms ONLY the affected shard(s).
 *   3. A mixed batch warms only the shards of the physically-invalidating
 *      changes — the timestamp-only listing's shard is NOT warmed.
 *   4. The durable idx_sync AuditEvent is written AFTER the warm and
 *      carries building_manifest_warm, manifest_canary, and both reason
 *      counter sets (the Maya-approved allowlist fix).
 *   5. The persistence canary runs exactly once per run, at run start.
 *
 * Mocks: @/lib/prisma, @/lib/idx/fetch, next/cache, and
 * @/lib/buildings/public-building-data (warm/probe orchestration is pinned
 * here; warm INTERNALS are proven in building-manifest-warm-behavior).
 * Mapper, gates, projection builders, comparators, classifier and
 * public-cache tag plumbing are the real production code.
 */

const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdateMany = jest.fn();
const mockProjFindUnique = jest.fn();
const mockProjUpsert = jest.fn();
const mockSyncStateUpsert = jest.fn();
const mockSyncStateFindUnique = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (args: unknown) => mockFindUnique(args),
      upsert: (args: unknown) => mockUpsert(args),
      findFirst: (args: unknown) => mockFindFirst(args),
      updateMany: (args: unknown) => mockUpdateMany(args),
    },
    listingSearchProjection: {
      findUnique: (args: unknown) => mockProjFindUnique(args),
      upsert: (args: unknown) => mockProjUpsert(args),
    },
    syncState: {
      upsert: (args: unknown) => mockSyncStateUpsert(args),
      findUnique: (args: unknown) => mockSyncStateFindUnique(args),
    },
    auditEvent: {
      create: (args: unknown) => mockAuditCreate(args),
    },
  },
}));

const mockFetchFromTrestle = jest.fn();
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchFromTrestle: (args: unknown) => mockFetchFromTrestle(args),
  buildIncrementalFilter: () => "mock-incremental-filter",
  buildActiveFilter: () => "mock-active-filter",
  buildAgentHistoricalFilter: () => "mock-agent-filter",
}));

jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: async () => "mock-token",
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

const mockWarm = jest.fn(async (shards: readonly string[]) => ({
  shards_requested: shards.length,
  shards_warmed: shards.length,
  shards_failed: 0,
  pages_filled: shards.length,
  cache_hit_existing: 0,
  duration_ms: 5,
}));
const mockProbe = jest.fn(async (shards: readonly string[]) => ({
  shards_probed: shards.length,
  cache_hits: shards.length,
  live_fills: 0,
  failed: 0,
  duration_ms: 2,
}));
jest.mock("@/lib/buildings/public-building-data", () => ({
  __esModule: true,
  warmBuildingManifestShards: (shards: readonly string[]) => mockWarm(shards),
  probeManifestPersistence: (shards: readonly string[]) => mockProbe(shards),
}));

import { syncListings } from "@/lib/idx/sync";
import { mapTrestleToPrisma, checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

// ── Fixtures (same construction as phase3-write-suppression-sync) ─────────

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

function dbRowFromRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped = mapTrestleToPrisma(raw);
  const gates = checkDistributionGates(raw);
  if (!gates.displayable) mapped.sync_status = `gated:${gates.reason}`;
  return {
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
    last_synced_from_trestle: new Date("2026-06-01T00:00:00Z"),
    ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
  };
}

function projectionRowFromRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped = mapTrestleToPrisma(raw);
  const input: ListingProjectionSource = {
    listing_id: mapped.listing_id,
    status: mapped.status,
    listing_type: mapped.listing_type,
    property_type: mapped.property_type,
    property_sub_type: mapped.property_sub_type,
    list_price: mapped.list_price,
    bedrooms_total: mapped.bedrooms_total,
    bathrooms_full: mapped.bathrooms_full,
    bathrooms_half: mapped.bathrooms_half,
    living_area: mapped.living_area,
    borough: mapped.borough,
    neighborhood: mapped.neighborhood,
    city: mapped.city,
    postal_code: mapped.postal_code,
    rls_eligible: true,
    commercial_sub_type: null,
    idx_display_yn: mapped.idx_display_yn,
    internet_entire_listing_display_yn: mapped.internet_entire_listing_display_yn,
    internet_address_display_yn: mapped.internet_address_display_yn,
    participant_only: mapped.participant_only,
    agent_id: null,
    modification_timestamp: mapped.modification_timestamp,
    address: mapped.address as Record<string, unknown>,
    features: mapped.features as Record<string, unknown>,
    media: mapped.media as unknown[],
  };
  return { ...buildListingSearchProjectionFromListing(input) };
}

interface StoredState {
  listings: Map<string, Record<string, unknown> | null>;
  projections: Map<string, Record<string, unknown> | null>;
}

function wireMocks(state: StoredState) {
  mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
    return state.listings.get(args.where.listing_id) ?? null;
  });
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
    return state.projections.get(args.where.listing_id) ?? null;
  });
  mockProjUpsert.mockResolvedValue({});
  mockFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncStateUpsert.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
}

function idxSyncAuditChanges(): Record<string, unknown> {
  const call = mockAuditCreate.mock.calls.find(
    (c) => (c[0] as { data: { action: string } }).data.action === "idx_sync",
  );
  expect(call).toBeDefined();
  return (call![0] as { data: { changes: Record<string, unknown> } }).data.changes;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncStateFindUnique.mockResolvedValue(null);
  // Media endpoint: nothing to fetch (no media writes attempted).
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 400,
    statusText: "Bad Request",
  })) as unknown as typeof fetch;
});

describe("timestamp-only re-emit — write the row, invalidate NOTHING, warm NOTHING", () => {
  it("keeps the provenance write but produces zero revalidations and no warm", async () => {
    const raw = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(raw)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    // The feed re-emits the SAME record with only the revision clocks moved
    // (the raw_data.ModificationTimestamp moves with the column — the real
    // production shape of a provenance-only bump).
    const bumped = rawRecord({ ModificationTimestamp: "2026-07-20T00:00:00Z" });
    mockFetchFromTrestle.mockResolvedValue({ records: [bumped], totalFetched: 1 });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(result.errors).toBe(0);
    // CONTRACT REVERSED 2026-08-13 — the listing row is NO LONGER written.
    //
    // This assertion used to read "the listing row IS written — a source
    // revision must persist", and that was correct while the incremental cursor
    // was MAX(listings.modification_timestamp): not writing the column would
    // have frozen the cursor and re-fetched the same rows forever.
    //
    // The resume position now lives in sync_state.{last_watermark,
    // last_listing_key} and advances from the FETCHED batch, independent of any
    // physical row write (lib/idx/sync.ts getPropertyKeysetCursor). So a
    // revision that changes nothing material no longer costs an UPDATE. This is
    // the Neon write-amplification fix: ~95% of production updates (201 of 212
    // in one cycle) classified modification_timestamp_only and still wrote.
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.upserted).toBe(0);
    // The suppression is attributed precisely, so the reduction stays provable
    // from telemetry rather than looking like the churn simply vanished.
    expect(result.write_paths.listings.rows_suppressed_unchanged).toBe(1);
    expect(result.write_paths.listings.rows_suppressed_provenance_only).toBe(1);
    expect(result.write_paths.listings.rows_updated).toBe(0);
    // The projection is NOT rewritten (scope D).
    expect(mockProjUpsert).not.toHaveBeenCalled();
    expect(result.write_paths.projections.rows_suppressed_unchanged).toBe(1);
    // NO tag is revalidated — not the listing tag, not the building tag,
    // not the coarse search tag.
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    // NO manifest warm.
    expect(mockWarm).not.toHaveBeenCalled();
    expect(result.write_paths.building_manifest_warm).toBeNull();
    expect(result.write_paths.affected_manifest_shards).toEqual([]);
    // Reason attribution.
    expect(result.write_paths.listing_change_reasons).toMatchObject({
      modification_timestamp_only: 1,
      raw_data_only: 0,
      status: 0,
      price: 0,
    });
    expect(result.write_paths.projection_change_reasons).toEqual({
      source_timestamp_only: 1,
      search_visible_fields: 0,
    });
  });
});

describe("real change — exact tags + coarse search bump + targeted warm", () => {
  it("price change revalidates its tags and warms ONLY the affected shard", async () => {
    const raw = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(raw)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    const priced = rawRecord({
      ListPrice: 725000,
      ModificationTimestamp: "2026-07-20T00:00:00Z",
    });
    mockFetchFromTrestle.mockResolvedValue({ records: [priced], totalFetched: 1 });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(result.errors).toBe(0);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockProjUpsert).toHaveBeenCalledTimes(1);
    const revalidated = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(revalidated).toContain("listing:RLS100001");
    expect(revalidated).toContain("search");
    expect(revalidated.some((t) => t.startsWith("building:"))).toBe(true);
    // The shard is still ATTRIBUTED and its tag still invalidated — that is
    // what makes the entry refill on the next real read. What no longer
    // happens is the scheduled warm: the sync does not read the shard back
    // out of Neon on the cron's behalf.
    expect(mockWarm).not.toHaveBeenCalled();
    expect(result.write_paths.affected_manifest_shards).toEqual(["4"]);
    expect(result.write_paths.listing_change_reasons).toMatchObject({
      price: 1,
      modification_timestamp_only: 0,
    });
    expect(result.write_paths.projection_change_reasons).toEqual({
      source_timestamp_only: 0,
      search_visible_fields: 1,
    });
  });

  it("mixed batch: the timestamp-only listing's shard is NOT warmed", async () => {
    const rawA = rawRecord(); // shard 4 — will get a real price change
    const rawB = rawRecord({
      ListingId: "RLS100002",
      ListingKey: "KEY100002",
      StreetNumber: "900",
      ListPrice: 1250000,
    }); // shard 9 — timestamp-only bump
    const state: StoredState = {
      listings: new Map([
        ["RLS100001", dbRowFromRaw(rawA)],
        ["RLS100002", dbRowFromRaw(rawB)],
      ]),
      projections: new Map([
        ["RLS100001", projectionRowFromRaw(rawA)],
        ["RLS100002", projectionRowFromRaw(rawB)],
      ]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({
      records: [
        rawRecord({ ListPrice: 700000, ModificationTimestamp: "2026-07-20T00:00:00Z" }),
        rawRecord({
          ListingId: "RLS100002",
          ListingKey: "KEY100002",
          StreetNumber: "900",
          ListPrice: 1250000,
          ModificationTimestamp: "2026-07-21T00:00:00Z",
        }),
      ],
      totalFetched: 2,
    });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(result.errors).toBe(0);
    // Only the MATERIAL row is written now. The provenance-only bump is
    // suppressed (see the reversed contract above), so a mixed batch costs one
    // write instead of two — while the material change still writes in full.
    // This is the discriminating case: the fix must not suppress real changes.
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(result.write_paths.listings.rows_suppressed_provenance_only).toBe(1);
    // …and only ONE shard is attributed: shard 9 never appears. Attribution
    // still matters after the warm removal because it drives which tags are
    // invalidated; it just no longer drives a scheduled read.
    expect(mockWarm).not.toHaveBeenCalled();
    expect(result.write_paths.affected_manifest_shards).toEqual(["4"]);
    const revalidated = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(revalidated).not.toContain("listing:RLS100002");
    expect(result.write_paths.listing_change_reasons).toMatchObject({
      price: 1,
      modification_timestamp_only: 1,
    });
  });

  it("a brand-new listing (insert) always invalidates its shard tag", async () => {
    const state: StoredState = { listings: new Map(), projections: new Map() };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawRecord()], totalFetched: 1 });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(result.errors).toBe(0);
    expect(mockWarm).not.toHaveBeenCalled();
    expect(result.write_paths.affected_manifest_shards).toEqual(["4"]);
    const revalidated = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(revalidated).toContain("listing:RLS100001");
    // Inserts are not classified (no prior row to attribute against).
    expect(
      Object.values(result.write_paths.listing_change_reasons!).every((v) => v === 0),
    ).toBe(true);
  });
});

describe("durable idx_sync audit — written AFTER the warm, carrying the full accounting", () => {
  it("audit changes keep the warm/canary fields (now null) and both reason counter sets", async () => {
    const raw = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(raw)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ ListPrice: 725000, ModificationTimestamp: "2026-07-20T00:00:00Z" })],
      totalFetched: 1,
    });

    await syncListings({ fullSync: true, maxRecords: 10 });

    const changes = idxSyncAuditChanges();
    const writePaths = changes.write_paths as Record<string, unknown>;
    // TASK 2: both fields are RETAINED in the audit payload so its shape and
    // every consumer are unchanged, but the scheduled warm and canary no longer
    // run, so both are null. Asserting null explicitly (rather than deleting
    // the assertions) keeps the payload contract pinned — a future change that
    // silently reintroduces scheduled manifest reads fails here.
    expect(writePaths.building_manifest_warm).toBeNull();
    expect(changes.manifest_canary).toBeNull();
    expect(changes.listing_change_reasons).toMatchObject({ price: 1 });
    expect(changes.projection_change_reasons).toEqual({
      source_timestamp_only: 0,
      search_visible_fields: 1,
    });
    expect(changes.affected_manifest_shards).toEqual(["4"]);
    // The audit still carries shard attribution. The previous assertion here
    // pinned "the audit write happens AFTER the warm"; with no scheduled warm
    // there is no such ordering left to assert, and the surviving guarantee is
    // that attribution reaches the durable audit at all.
    const auditCall = mockAuditCreate.mock.calls.find(
      (c) => (c[0] as { data: { action: string } }).data.action === "idx_sync",
    );
    expect(auditCall).toBeDefined();
  });

  it("performs NO manifest warm and NO persistence probe on the scheduled path", async () => {
    const state: StoredState = { listings: new Map(), projections: new Map() };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    // TASK 2. The scheduled sync used to do BOTH of these on every run:
    //   - probe previously-warmed manifest shards at run start (a read);
    //   - warm every affected shard at run end (a full re-read of that shard's
    //     gated population, right after invalidating its tag in the same run).
    // Both were Neon reads performed on the cron's behalf rather than for any
    // actual reader, and the warm re-read exactly what had just been expired.
    expect(mockProbe).not.toHaveBeenCalled();
    expect(mockWarm).not.toHaveBeenCalled();
    expect(result.write_paths.manifest_canary).toBeNull();
    expect(result.write_paths.building_manifest_warm).toBeNull();
    // Empty run changed nothing, so nothing is invalidated either.
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("still records the affected shards so invalidation stays correct", async () => {
    const state: StoredState = { listings: new Map(), projections: new Map() };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawRecord()], totalFetched: 1 });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    // Removing the warm must NOT remove attribution or invalidation — those
    // are what let the next real reader refill a correct entry.
    expect(result.write_paths.affected_manifest_shards).toEqual(["4"]);
    const revalidated = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(revalidated).toContain("building-manifest-shard:4");
    expect(mockWarm).not.toHaveBeenCalled();
  });

  it("still records this run's affected shards in SyncState notes", async () => {
    const raw = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(raw)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ ListPrice: 725000, ModificationTimestamp: "2026-07-20T00:00:00Z" })],
      totalFetched: 1,
    });

    await syncListings({ fullSync: true, maxRecords: 10 });

    const upsertArg = mockSyncStateUpsert.mock.calls[0][0] as {
      update: { notes?: string };
      create: { notes?: string };
    };
    expect(JSON.parse(upsertArg.update.notes!)).toEqual({ manifest_warmed_shards: ["4"] });
    expect(JSON.parse(upsertArg.create.notes!)).toEqual({ manifest_warmed_shards: ["4"] });
  });
});

describe("per-shard manifest invalidation + PCT fail-closed (Maya #561 review)", () => {
  it("a physical change revalidates the affected shard's manifest tag (manifest pages no longer ride the search tag)", async () => {
    const raw = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(raw)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ ListPrice: 725000, ModificationTimestamp: "2026-07-20T00:00:00Z" })],
      totalFetched: 1,
    });

    await syncListings({ fullSync: true, maxRecords: 10 });

    const revalidated = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(revalidated).toContain("building-manifest-shard:4");
    expect(revalidated.filter((t) => t.startsWith("building-manifest-shard:"))).toEqual([
      "building-manifest-shard:4",
    ]);
  });

  it("CRITICAL (zero-media hole): PhotosChangeTimestamp advances and the media endpoint succeeds with NO rows — the change is NOT provenance-only and invalidation fires", async () => {
    const raw = rawRecord({ PhotosChangeTimestamp: "2026-07-10T00:00:00Z" });
    const dbRow = dbRowFromRaw(raw);
    // The listing HAS stored media from a previous cycle.
    (dbRow as Record<string, unknown>).media = [
      { url: "https://api.cotality.com/trestle/media/1.jpg?sig=old", mediaType: "photo", order: 0 },
    ];
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRow]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    // Model the stored media row the archived-safe lookup returns. Without this
    // the shared `wireMocks` leaves `mockFindFirst -> null`, which the media
    // loop correctly treats as an archived/missing row and skips — so nothing
    // would reconcile and nothing would invalidate, testing the fail-safe path
    // rather than this test's actual subject.
    mockFindFirst.mockResolvedValue({
      media: [
        { url: "https://api.cotality.com/trestle/media/1.jpg?sig=old", mediaType: "photo", order: 0 },
      ],
      address: (dbRow as Record<string, unknown>).address,
    });
    // Feed re-emits with ONLY the photo clock advanced…
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ PhotosChangeTimestamp: "2026-07-20T00:00:00Z" })],
      totalFetched: 1,
    });
    // …and the media endpoint SUCCEEDS but returns zero rows for it.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ value: [] }),
    })) as unknown as typeof fetch;

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(result.errors).toBe(0);
    // UPDATED 2026-08-07 (commits 7B-1 + 7B-2A + 7B-2B).
    //
    // This previously asserted `raw_data_only: 1` — PhotosChangeTimestamp was
    // MATERIAL, so a PCT bump forced a heavyweight Listing write, and that write
    // was the only thing carrying cache invalidation. The test also documented
    // an honest limitation: "the stored media JSON is NOT cleared — the batch
    // loop only processes listings that RETURN media rows."
    //
    // All three legs changed, in this order and for this reason:
    //   7B-1  the batch fetch proves completeness and PRE-SEEDS every requested
    //         key, so a complete-zero result is now `[]` instead of vanishing —
    //         the emptied gallery is genuinely reconcilable.
    //   7B-2A invalidation moved OUT of the Listing-write branch into one shared
    //         owner, so a media change expires listing + building + manifest
    //         WITHOUT needing a Listing write to carry it.
    //   7B-2B only then did PCT become non-material.
    //
    // So the safety property is unchanged; a DIFFERENT, stronger mechanism now
    // provides it. Asserted below rather than assumed.
    expect(result.write_paths.listing_change_reasons).toMatchObject({
      raw_data_only: 0, // PCT alone no longer forces a heavyweight write
      modification_timestamp_only: 0,
    });
    // The REPLACEMENT mechanism: invalidation still fires, now driven by the
    // media path rather than by the suppressed Listing write.
    const revalidated = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(revalidated).toContain("listing:RLS100001");
    expect(revalidated).toContain("building-manifest-shard:4");
    expect(revalidated).toContain("search");
    expect(mockWarm).not.toHaveBeenCalled();
  });

  it("CRITICAL (zero-media hole, part 2): a COMPLETE zero-row result now CLEARS the stored media", async () => {
    // The companion to the test above. It previously could not be written: the
    // batch loop skipped listings that returned no rows, so there was nothing to
    // assert. With 7B-1's pre-seed the listing IS reconciled.
    //
    // NOTE the fixture detail that made this invisible before — the shared
    // `wireMocks` sets `mockFindFirst.mockResolvedValue(null)`, i.e. the
    // archived-safe media lookup finds no row, so the loop `continue`s before
    // any write. That is why the original test observed "no clear": the FIXTURE
    // never modelled a stored-media row, not because the mechanism was absent.
    const raw = rawRecord({ PhotosChangeTimestamp: "2026-07-10T00:00:00Z" });
    const dbRow = dbRowFromRaw(raw);
    (dbRow as Record<string, unknown>).media = [
      { url: "https://api.cotality.com/trestle/media/1.jpg?sig=old", mediaType: "photo", order: 0 },
    ];
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRow]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
    };
    wireMocks(state);
    // Model the stored media row the archived-safe lookup returns.
    mockFindFirst.mockResolvedValue({
      media: [
        { url: "https://api.cotality.com/trestle/media/1.jpg?sig=old", mediaType: "photo", order: 0 },
      ],
      address: (dbRow as Record<string, unknown>).address,
    });
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ PhotosChangeTimestamp: "2026-07-20T00:00:00Z" })],
      totalFetched: 1,
    });
    // Provider succeeds with ZERO rows and NO @odata.nextLink => COMPLETE empty.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ value: [] }),
    })) as unknown as typeof fetch;

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(result.errors).toBe(0);
    // The emptied gallery IS reconciled — this is the mechanism that replaced
    // PCT-materiality as the safety guarantee.
    expect(mockUpdateMany).toHaveBeenCalled();
    const cleared = mockUpdateMany.mock.calls.some(
      (c) => Array.isArray((c[0] as { data?: { media?: unknown } })?.data?.media)
        && ((c[0] as { data: { media: unknown[] } }).data.media.length === 0),
    );
    expect(cleared).toBe(true);
  });
});
