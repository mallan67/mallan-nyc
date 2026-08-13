/// <reference types="jest" />
/**
 * Phase 3 write-suppression — syncListings behavioral proof (failing-first TDD).
 *
 * Production shape being fixed: every incremental IDX sync unconditionally
 * upserts BOTH the `listings` row AND the `listing_search_projection` row for
 * every fetched record — even when nothing material changed — and the batch
 * media path rewrites the legacy `listings.media` JSON with freshly-signed
 * (rotating) Trestle URLs on every pass. On Neon this is pure write churn.
 *
 * Contract proven here:
 *   1. Unchanged IDX batch → ZERO listing upserts and ZERO projection upserts
 *      (near-zero writes; SyncState watermark + audit rows are still allowed).
 *   2. One true listing change → exactly THAT listing and its projection are
 *      written, nothing else.
 *   3. Brand-new listing → insert still flows (create is never suppressed).
 *   4. Batch media: materially-identical media (rotated signed URLs only) is
 *      NOT rewritten; a real hero/ordering change IS written.
 *   5. Per-record failures stay isolated: they count as failures, do not
 *      abort the batch, and are never reported as suppressed/updated.
 *
 * The suite mocks @/lib/prisma and lib/idx/fetch only — the mapper, gates,
 * DOM tracker, projection builders, and suppression comparators are the real
 * production code.
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

import { syncListings, getLastSyncTimestamp } from "@/lib/idx/sync";
import { mapTrestleToPrisma, checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

// ── Fixtures ─────────────────────────────────────────────────────────────

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
 * Build the DB listing row that a PREVIOUS successful sync of `raw` would
 * have produced — i.e. the state where a re-emit of the same record must be
 * suppressed. Simulates Prisma shapes (Decimal for price/area, Date columns,
 * JSON round-tripped jsonb).
 */
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

/** The projection row that a previous sync of `raw` would have written. */
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
  mediaByListingId: Map<string, unknown>;
}

function wireMocks(state: StoredState) {
  mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
    const row = state.listings.get(args.where.listing_id);
    return row ?? null;
  });
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
    const row = state.projections.get(args.where.listing_id);
    return row ?? null;
  });
  mockProjUpsert.mockResolvedValue({});
  mockFindFirst.mockImplementation(async (args: { where: { listing_id: string } }) => {
    if (!state.mediaByListingId.has(args.where.listing_id)) return null;
    return { media: state.mediaByListingId.get(args.where.listing_id) };
  });
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncStateUpsert.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
}

function mockMediaEndpoint(valueByRun: Array<Record<string, unknown>[]>) {
  let call = 0;
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ value: valueByRun[Math.min(call++, valueByRun.length - 1)] }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncStateFindUnique.mockResolvedValue(null);
  // Default: media endpoint returns nothing (no media writes attempted).
  global.fetch = jest.fn(async () => ({ ok: false, status: 400, statusText: "Bad Request" })) as unknown as typeof fetch;
});

// ── 1. Unchanged batch → near-zero writes ────────────────────────────────

describe("syncListings — unchanged IDX batch produces ZERO listing/projection writes", () => {
  it("suppresses both write paths and reports the required counters", async () => {
    const rawA = rawRecord();
    const rawB = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002", ListPrice: 1250000 });
    const state: StoredState = {
      listings: new Map([
        ["RLS100001", dbRowFromRaw(rawA)],
        ["RLS100002", dbRowFromRaw(rawB)],
      ]),
      projections: new Map([
        ["RLS100001", projectionRowFromRaw(rawA)],
        ["RLS100002", projectionRowFromRaw(rawB)],
      ]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA, rawB], totalFetched: 2 });

    const result = await syncListings({ fullSync: true, maxRecords: 10 });

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockProjUpsert).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(result.errors).toBe(0);

    expect(result.write_paths.listings).toEqual({
      rows_checked: 2,
      rows_materially_changed: 0,
      rows_suppressed_unchanged: 2,
      rows_suppressed_provenance_only: 0,
      rows_inserted: 0,
      rows_updated: 0,
      rows_failed: 0,
    });
    expect(result.write_paths.projections).toEqual({
      rows_checked: 2,
      rows_materially_changed: 0,
      rows_suppressed_unchanged: 2,
      rows_suppressed_provenance_only: 0,
      rows_inserted: 0,
      rows_updated: 0,
      rows_failed: 0,
    });
    // `upserted` now reports PHYSICAL listing writes only.
    expect(result.upserted).toBe(0);
    // Watermark bookkeeping still runs (freshness display must not stall).
    expect(mockSyncStateUpsert).toHaveBeenCalledTimes(1);
  });
});

// ── 2. One true change → exactly that listing + its projection ───────────

describe("syncListings — one true change updates exactly that listing and projection", () => {
  it("writes only the changed listing", async () => {
    const rawA = rawRecord();
    const rawBOld = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002", ListPrice: 1250000 });
    const rawBNew = rawRecord({
      ListingId: "RLS100002",
      ListingKey: "KEY100002",
      ListPrice: 1195000, // true price change
      ModificationTimestamp: "2026-07-02T00:00:00Z",
    });
    const state: StoredState = {
      listings: new Map([
        ["RLS100001", dbRowFromRaw(rawA)],
        ["RLS100002", dbRowFromRaw(rawBOld)],
      ]),
      projections: new Map([
        ["RLS100001", projectionRowFromRaw(rawA)],
        ["RLS100002", projectionRowFromRaw(rawBOld)],
      ]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA, rawBNew], totalFetched: 2 });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect((mockUpsert.mock.calls[0][0] as { where: { listing_id: string } }).where.listing_id).toBe("RLS100002");
    expect(mockProjUpsert).toHaveBeenCalledTimes(1);
    expect((mockProjUpsert.mock.calls[0][0] as { where: { listing_id: string } }).where.listing_id).toBe("RLS100002");

    expect(result.write_paths.listings.rows_checked).toBe(2);
    expect(result.write_paths.listings.rows_suppressed_unchanged).toBe(1);
    expect(result.write_paths.listings.rows_materially_changed).toBe(1);
    expect(result.write_paths.listings.rows_updated).toBe(1);
    expect(result.write_paths.listings.rows_inserted).toBe(0);
    expect(result.upserted).toBe(1);
  });
});

// ── 3. Inserts are never suppressed ──────────────────────────────────────

describe("syncListings — brand-new listing still inserts", () => {
  it("creates the listing and its projection, counted as rows_inserted", async () => {
    const rawA = rawRecord();
    const state: StoredState = {
      listings: new Map(),
      projections: new Map(),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA], totalFetched: 1 });

    const result = await syncListings({ fullSync: true });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockProjUpsert).toHaveBeenCalledTimes(1);
    expect(result.write_paths.listings.rows_inserted).toBe(1);
    expect(result.write_paths.listings.rows_suppressed_unchanged).toBe(0);
    expect(result.write_paths.projections.rows_inserted).toBe(1);
    expect(result.upserted).toBe(1);
  });
});

// ── 4. Batch media suppression (rotating URLs are not identity) ──────────

describe("syncListings — batch media path suppresses rotation-only rewrites", () => {
  it("skips the materially-identical media array, writes the real change", async () => {
    // A carries a true listing change so the batch-media block runs at all.
    const rawAOld = rawRecord();
    const rawANew = rawRecord({ ListPrice: 700000, ModificationTimestamp: "2026-07-02T00:00:00Z" });
    const rawB = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002" });

    const state: StoredState = {
      listings: new Map([
        ["RLS100001", dbRowFromRaw(rawAOld)],
        ["RLS100002", dbRowFromRaw(rawB)],
      ]),
      projections: new Map([
        ["RLS100001", projectionRowFromRaw(rawAOld)],
        ["RLS100002", projectionRowFromRaw(rawB)],
      ]),
      mediaByListingId: new Map([
        // A: stored two photos (older signed URLs) — same order/type as incoming.
        [
          "RLS100001",
          [
            { url: "https://api.cotality.com/trestle/Media/a0.jpg?sig=OLD", mediaType: "Photo", order: -1 },
            { url: "https://api.cotality.com/trestle/Media/a1.jpg?sig=OLD", mediaType: "Photo", order: 1 },
          ],
        ],
        // B: stored hero at order -1 on photo b0; incoming moves hero → real change.
        [
          "RLS100002",
          [
            { url: "https://api.cotality.com/trestle/Media/b0.jpg?sig=OLD", mediaType: "Photo", order: -1 },
            { url: "https://api.cotality.com/trestle/Media/b1.jpg?sig=OLD", mediaType: "Photo", order: 1 },
          ],
        ],
      ]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawANew, rawB], totalFetched: 2 });

    mockMediaEndpoint([
      [
        // A — same media, freshly rotated signatures (MUST be suppressed).
        { ResourceRecordKey: "KEY100001", MediaURL: "https://api.cotality.com/trestle/Media/a0.jpg?sig=NEW1", MediaCategory: "Photo", Order: 0, PreferredPhotoYN: true },
        { ResourceRecordKey: "KEY100001", MediaURL: "https://api.cotality.com/trestle/Media/a1.jpg?sig=NEW1", MediaCategory: "Photo", Order: 1, PreferredPhotoYN: false },
        // B — hero moved to the second photo (MUST be written).
        { ResourceRecordKey: "KEY100002", MediaURL: "https://api.cotality.com/trestle/Media/b0.jpg?sig=NEW1", MediaCategory: "Photo", Order: 0, PreferredPhotoYN: false },
        { ResourceRecordKey: "KEY100002", MediaURL: "https://api.cotality.com/trestle/Media/b1.jpg?sig=NEW1", MediaCategory: "Photo", Order: 1, PreferredPhotoYN: true },
      ],
    ]);

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const writtenWhere = (mockUpdateMany.mock.calls[0][0] as { where: { listing_id: string } }).where;
    expect(writtenWhere.listing_id).toBe("RLS100002");

    expect(result.write_paths.batch_media.rows_checked).toBe(2);
    expect(result.write_paths.batch_media.rows_suppressed_unchanged).toBe(1);
    expect(result.write_paths.batch_media.rows_updated).toBe(1);
  });
});

// ── 5. Failure isolation ─────────────────────────────────────────────────

describe("syncListings — failures stay isolated and are never counted as success", () => {
  it("one poisoned record fails, the other is still processed (suppressed)", async () => {
    const rawA = rawRecord();
    const rawB = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002" });
    const state: StoredState = {
      listings: new Map([["RLS100002", dbRowFromRaw(rawB)]]),
      projections: new Map([["RLS100002", projectionRowFromRaw(rawB)]]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    // Poison the existing-row read for A only.
    mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
      if (args.where.listing_id === "RLS100001") throw new Error("connection reset");
      return state.listings.get(args.where.listing_id) ?? null;
    });
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA, rawB], totalFetched: 2 });

    const result = await syncListings({ fullSync: true });

    expect(result.errors).toBe(1);
    expect(result.write_paths.listings.rows_failed).toBe(1);
    expect(result.write_paths.listings.rows_suppressed_unchanged).toBe(1);
    // The failed record is not reported as inserted/updated/suppressed-success.
    expect(result.write_paths.listings.rows_inserted).toBe(0);
    expect(result.write_paths.listings.rows_updated).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.upserted).toBe(0);
  });
});

// ── Correction 1: batch media must run even when ALL listing writes suppressed ──

describe("syncListings — batch media gate is decoupled from physical listing writes", () => {
  it("fully-suppressed batch still fetches + reconciles media for records lacking inline media", async () => {
    const rawA = rawRecord();
    const rawB = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002" });
    const state: StoredState = {
      listings: new Map([
        ["RLS100001", dbRowFromRaw(rawA)],
        ["RLS100002", dbRowFromRaw(rawB)],
      ]),
      projections: new Map([
        ["RLS100001", projectionRowFromRaw(rawA)],
        ["RLS100002", projectionRowFromRaw(rawB)],
      ]),
      mediaByListingId: new Map([
        // A: stored media identical up to a rotated signature -> suppress.
        [
          "RLS100001",
          [
            { url: "https://api.cotality.com/trestle/Media/a0.jpg?sig=OLD", mediaType: "Photo", order: -1 },
            { url: "https://api.cotality.com/trestle/Media/a1.jpg?sig=OLD", mediaType: "Photo", order: 1 },
          ],
        ],
        // B: hero moved -> real change -> must WRITE even though the listing row was suppressed.
        [
          "RLS100002",
          [
            { url: "https://api.cotality.com/trestle/Media/b0.jpg?sig=OLD", mediaType: "Photo", order: -1 },
            { url: "https://api.cotality.com/trestle/Media/b1.jpg?sig=OLD", mediaType: "Photo", order: 1 },
          ],
        ],
      ]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA, rawB], totalFetched: 2 });
    mockMediaEndpoint([
      [
        { ResourceRecordKey: "KEY100001", MediaURL: "https://api.cotality.com/trestle/Media/a0.jpg?sig=NEW", MediaCategory: "Photo", Order: 0, PreferredPhotoYN: true },
        { ResourceRecordKey: "KEY100001", MediaURL: "https://api.cotality.com/trestle/Media/a1.jpg?sig=NEW", MediaCategory: "Photo", Order: 1, PreferredPhotoYN: false },
        { ResourceRecordKey: "KEY100002", MediaURL: "https://api.cotality.com/trestle/Media/b0.jpg?sig=NEW", MediaCategory: "Photo", Order: 0, PreferredPhotoYN: false },
        { ResourceRecordKey: "KEY100002", MediaURL: "https://api.cotality.com/trestle/Media/b1.jpg?sig=NEW", MediaCategory: "Photo", Order: 1, PreferredPhotoYN: true },
      ],
    ]);

    const result = await syncListings({ fullSync: true });

    // Zero physical listing/projection writes...
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.upserted).toBe(0);
    // ...but the media pipeline still executed: fetch + reconciliation ran.
    expect(global.fetch).toHaveBeenCalled();
    expect(mockFindFirst).toHaveBeenCalled();
    expect(result.write_paths.batch_media.rows_checked).toBe(2);
    expect(result.write_paths.batch_media.rows_suppressed_unchanged).toBe(1);
    expect(result.write_paths.batch_media.rows_updated).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect((mockUpdateMany.mock.calls[0][0] as { where: { listing_id: string } }).where.listing_id).toBe("RLS100002");
  });
});

// ── Correction 3: rotating URLs inside raw_data.Media must not force writes ──

describe("syncListings — $expand=Media rotation inside raw_data alone -> ZERO listing writes", () => {
  const inlineMedia = (sig: string) => [
    { MediaURL: `https://api.cotality.com/trestle/Media/a/0.jpg?token=${sig}`, MediaCategory: "Photo", Order: 0, PreferredPhotoYN: true },
    { MediaURL: `https://api.cotality.com/trestle/Media/a/1.jpg?token=${sig}`, MediaCategory: "Photo", Order: 1 },
  ];

  it("re-emit identical except rotated signed Media URLs -> suppressed", async () => {
    const rawOld = rawRecord({ Media: inlineMedia("SIG-A") });
    const rawNew = rawRecord({ Media: inlineMedia("SIG-B-ROTATED") });
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(rawOld)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(rawOld)]]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawNew], totalFetched: 1 });

    const result = await syncListings({ fullSync: true });

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockProjUpsert).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(result.write_paths.listings.rows_suppressed_unchanged).toBe(1);
    expect(result.upserted).toBe(0);
  });

  it("a REAL Media change in raw_data (asset replaced) still writes", async () => {
    const rawOld = rawRecord({ Media: inlineMedia("SIG-A") });
    const replaced = rawRecord({
      Media: [
        { MediaURL: "https://api.cotality.com/trestle/Media/REPLACED/9.jpg?token=SIG-B", MediaCategory: "Photo", Order: 0, PreferredPhotoYN: true },
        { MediaURL: "https://api.cotality.com/trestle/Media/a/1.jpg?token=SIG-B", MediaCategory: "Photo", Order: 1 },
      ],
    });
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(rawOld)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(rawOld)]]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [replaced], totalFetched: 1 });

    const result = await syncListings({ fullSync: true });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(result.write_paths.listings.rows_updated).toBe(1);
  });
});

// ── Correction 4: fail-closed watermark (contiguous success) ──

describe("syncListings — watermark never advances past a failed record", () => {
  it("A ok, B fails, C ok -> persisted position is A (last contiguous success); run is error", async () => {
    const MT_A = "2026-07-01T00:00:00.000Z";
    const MT_B = "2026-07-02T00:00:00.000Z";
    const MT_C = "2026-07-03T00:00:00.000Z";
    const rawA = rawRecord({ ModificationTimestamp: MT_A });
    const rawB = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002", ModificationTimestamp: MT_B });
    const rawC = rawRecord({ ListingId: "RLS100003", ListingKey: "KEY100003", ModificationTimestamp: MT_C });
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(rawA)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(rawA)]]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
      if (args.where.listing_id === "RLS100002") throw new Error("connection reset");
      return state.listings.get(args.where.listing_id) ?? null;
    });
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA, rawB, rawC], totalFetched: 3 });

    const result = await syncListings({ since: new Date("2026-06-30T00:00:00Z") });

    expect(result.errors).toBe(1);
    expect(mockSyncStateUpsert).toHaveBeenCalledTimes(1);
    const stateArgs = mockSyncStateUpsert.mock.calls[0][0] as {
      create: { last_watermark: Date; last_listing_key: string | null; last_run_status: string };
      update: { last_watermark?: Date; last_listing_key?: string | null; last_run_status: string };
    };
    // CONTRACT SHARPENED 2026-08-13. This used to assert `MT_B - 1ms`: a
    // SYNTHETIC instant chosen to sit just under the failed record. The keyset
    // cursor persists the LAST CONTIGUOUS SUCCESS instead — a REAL provider
    // position (MT_A, KEY100001) with a real ListingKey tie-breaker.
    //
    // Both are safe (both re-fetch B), but only the real position can be used
    // as a keyset resume: `(MT eq T and ListingKey gt K)` is meaningless for a
    // fabricated timestamp that no record actually has. This is requirement
    // "persist the last contiguous successful MT + ListingKey; never a row
    // after failure".
    const expected = new Date(MT_A);
    expect(stateArgs.update.last_watermark?.getTime()).toBe(expected.getTime());
    expect(stateArgs.create.last_watermark.getTime()).toBe(expected.getTime());
    // The tie-breaker belongs to A, and must NOT be C's key — advancing to C
    // would consume the failed record B silently.
    expect(stateArgs.update.last_listing_key).toBe("KEY100001");
    expect(stateArgs.update.last_listing_key).not.toBe("KEY100003");
    // C succeeded but sorts AFTER the failure, so it is deliberately not claimed.
    expect(stateArgs.update.last_watermark?.getTime()).toBeLessThan(new Date(MT_C).getTime());
    expect(stateArgs.update.last_run_status).toBe("error");
  });

  it("no failures -> watermark behavior unchanged (advances; run ok)", async () => {
    const rawA = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(rawA)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(rawA)]]),
      mediaByListingId: new Map(),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA], totalFetched: 1 });

    await syncListings({ fullSync: true });
    const stateArgs = mockSyncStateUpsert.mock.calls[0][0] as {
      update: { last_watermark?: Date; last_run_status: string };
    };
    expect(stateArgs.update.last_watermark).toBeInstanceOf(Date);
    expect(stateArgs.update.last_run_status).toBe("ok");
  });
});

describe("getLastSyncTimestamp — error-run cursor clamp", () => {
  const MT_DB = new Date("2026-07-03T00:00:00.000Z");
  const CLAMP = new Date("2026-07-01T23:59:59.999Z");

  it("last run errored with an older fail-closed watermark -> cursor clamps to it (failed record re-fetched)", async () => {
    mockFindFirst.mockResolvedValue({ modification_timestamp: MT_DB });
    mockSyncStateFindUnique.mockResolvedValue({ last_watermark: CLAMP, last_run_status: "error" });
    expect((await getLastSyncTimestamp())?.getTime()).toBe(CLAMP.getTime());
  });

  it("last run ok -> DB cursor used unchanged", async () => {
    mockFindFirst.mockResolvedValue({ modification_timestamp: MT_DB });
    mockSyncStateFindUnique.mockResolvedValue({ last_watermark: new Date("2026-07-10T00:00:00Z"), last_run_status: "ok" });
    expect((await getLastSyncTimestamp())?.getTime()).toBe(MT_DB.getTime());
  });

  it("error state with a NEWER watermark than the DB cursor (legacy now-based rows) -> DB cursor used (never advance)", async () => {
    mockFindFirst.mockResolvedValue({ modification_timestamp: MT_DB });
    mockSyncStateFindUnique.mockResolvedValue({ last_watermark: new Date("2026-07-10T00:00:00Z"), last_run_status: "error" });
    expect((await getLastSyncTimestamp())?.getTime()).toBe(MT_DB.getTime());
  });

  it("SyncState read failure -> falls back to the DB cursor (clamp is best-effort, never throws)", async () => {
    mockFindFirst.mockResolvedValue({ modification_timestamp: MT_DB });
    mockSyncStateFindUnique.mockRejectedValue(new Error("read failed"));
    expect((await getLastSyncTimestamp())?.getTime()).toBe(MT_DB.getTime());
  });
});
