/**
 * N2 — unchanged-row write suppression for the idx-sync pipeline.
 *
 * Root cause (T1 forensic, 2026-07-18): syncListings rewrote EVERY listing
 * row (all columns incl. raw_data) and EVERY projection row unconditionally
 * on each incremental pass — 97% of ALL database UPDATEs were no-op rewrites
 * of unchanged rows (~3,856 listing + ~3,856 projection rewrites/day).
 *
 * Contract under test (mirrors N1's mediaRowUnchanged doctrine):
 *   - a second identical run issues ZERO listing/projection UPDATE calls
 *     (the headline proof);
 *   - ANY genuine business-field difference (price, status incl. terminal
 *     transition, each display-gate column, address JSON, features, a single
 *     raw_data byte) still produces exactly one listing write;
 *   - a projection column difference produces exactly one projection write;
 *   - bookkeeping fields (last_synced_from_trestle, sync_status) are NOT
 *     compared and NOT written on skipped rows — the sync watermark lives in
 *     sync_state;
 *   - counters reconcile: checked ≡ changed + skipped_unchanged per path.
 *
 * The suite drives the REAL syncListings loop (real mapper, real DOM/terminal
 * transition logic, real comparators) against a mocked Prisma client and a
 * mocked Trestle fetch — per the established lib/idx/__tests__ conventions.
 */

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingFindMany = jest.fn<Promise<unknown>, [unknown]>();
const mockListingUpsert = jest.fn<Promise<unknown>, [unknown]>();
const mockListingUpdateMany = jest.fn<Promise<unknown>, [unknown]>();
const mockProjectionFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockProjectionUpsert = jest.fn<Promise<unknown>, [unknown]>();
const mockSyncStateUpsert = jest.fn<Promise<unknown>, [unknown]>();
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (args: unknown) => mockListingFindUnique(args),
      findMany: (args: unknown) => mockListingFindMany(args),
      upsert: (args: unknown) => mockListingUpsert(args),
      updateMany: (args: unknown) => mockListingUpdateMany(args),
    },
    listingSearchProjection: {
      findUnique: (args: unknown) => mockProjectionFindUnique(args),
      upsert: (args: unknown) => mockProjectionUpsert(args),
    },
    syncState: {
      upsert: (args: unknown) => mockSyncStateUpsert(args),
    },
    auditEvent: {
      create: (args: unknown) => mockAuditCreate(args),
    },
  },
}));

// ─── Mock the Trestle fetch (records injected per test) ──────────────────

const mockFetchFromTrestle = jest.fn<
  Promise<{ records: Record<string, unknown>[]; totalFetched: number }>,
  [unknown]
>();

jest.mock("../fetch", () => ({
  __esModule: true,
  fetchFromTrestle: (args: unknown) => mockFetchFromTrestle(args),
  buildIncrementalFilter: () => "incremental-filter",
  buildActiveFilter: () => "active-filter",
  buildAgentHistoricalFilter: () => "agent-filter",
}));

// Keep the audit-side quiet/simple — logger + diagnostics are not under test.
jest.mock("../logger", () => ({
  __esModule: true,
  createAuditEntry: () => ({}),
  logIDXAccess: () => undefined,
}));
jest.mock("../diagnostic-recorder", () => ({
  __esModule: true,
  SYNC_DIAGNOSTIC_DEDUPE_ACTIONS: new Set<string>(),
  beginSyncDiagnosticRun: () => undefined,
  bufferSyncDiagnostic: () => undefined,
  flushSyncDiagnostics: async () => undefined,
}));

// The batch-media refill dynamically imports ./auth for the Trestle token —
// jest.mock intercepts dynamic import too. Trestle Media HTTP calls go
// through global.fetch, mocked per test (mockMediaFetch below).
jest.mock("../auth", () => ({
  __esModule: true,
  getAccessToken: async () => "test-token",
  hasCredentials: () => true,
}));

import {
  syncListings,
  listingUpdateUnchanged,
  mediaRefillRowUnchanged,
  LISTING_SYNC_COMPARE_SELECT,
} from "../sync";
import { mapTrestleToPrisma } from "../trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

// ─── Fixture: a gate-passing Active sale record ──────────────────────────

/** Inline Media so the post-loop batch-media path has nothing to fetch. */
function rawRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingId: "RLS-N2-0001",
    ListingKey: "1099900001",
    PropertyType: "Residential",
    PropertySubType: "Condominium",
    StandardStatus: "Active",
    ListPrice: 550000,
    BedroomsTotal: 2,
    BathroomsFull: 1,
    StreetNumber: "400",
    StreetName: "East 90th Street",
    UnitNumber: "17C",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10128",
    ListAgentMlsId: "AG123",
    ListAgentFullName: "Maya Allan",
    ListOfficeName: "Mallan Real Estate Inc.",
    ModificationTimestamp: "2026-07-01T12:00:00Z",
    PublicRemarks: "Bright two-bedroom with dishwasher and elevator.",
    Media: [{ MediaURL: "https://cdn.example.com/p1.jpg", MediaCategory: "Photo", Order: 1 }],
    ...overrides,
  };
}

/**
 * The `listings` row as the DB would hold it AFTER a prior successful sync of
 * `raw` — i.e. exactly what the update-arm wrote last time, shaped per
 * LISTING_SYNC_COMPARE_SELECT (JSON round-tripped like jsonb storage,
 * distinct Date instances, Decimal-ish string values).
 */
function dbListingRowFor(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped = mapTrestleToPrisma(raw);
  return {
    status: mapped.status,
    status_changed_at: new Date("2026-06-01T00:00:00Z"),
    first_active_date: new Date("2026-06-01T00:00:00Z"),
    days_on_market: null,
    sync_status: "synced",
    mls_id: mapped.mls_id,
    listing_type: mapped.listing_type,
    property_type: mapped.property_type,
    property_sub_type: mapped.property_sub_type,
    list_price: String(mapped.list_price), // Decimal comes back stringable
    bedrooms_total: mapped.bedrooms_total,
    bathrooms_full: mapped.bathrooms_full,
    bathrooms_half: mapped.bathrooms_half,
    living_area: mapped.living_area,
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
    ...typedAgentColumnsFromJson(mapped.agent_info as Record<string, unknown>),
  };
}

/** The projection row the DB would hold after a prior sync of `raw`. */
function dbProjectionRowFor(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped = mapTrestleToPrisma(raw);
  const source: ListingProjectionSource = {
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
  const { listing_id: _lid, ...row } = buildListingSearchProjectionFromListing(source);
  return {
    ...row,
    // jsonb round-trip for the JSON columns; distinct Date instance for the
    // timestamp (identity must not matter).
    amenity_keys: row.amenity_keys === null ? null : JSON.parse(JSON.stringify(row.amenity_keys)),
    feature_flags: row.feature_flags === null ? null : JSON.parse(JSON.stringify(row.feature_flags)),
    modified_at: row.modified_at === null ? null : new Date(row.modified_at.getTime()),
  };
}

function primeMocks(opts: {
  records: Record<string, unknown>[];
  existingListing?: Record<string, unknown> | null;
  existingProjection?: Record<string, unknown> | null;
  /** Rows the batch-media refill's bounded select returns ({listing_id, media, sync_status}). */
  storedMediaRows?: Record<string, unknown>[];
}) {
  mockFetchFromTrestle.mockResolvedValue({
    records: opts.records,
    totalFetched: opts.records.length,
  });
  mockListingFindUnique.mockResolvedValue(opts.existingListing ?? null);
  mockProjectionFindUnique.mockResolvedValue(opts.existingProjection ?? null);
  mockListingFindMany.mockResolvedValue(opts.storedMediaRows ?? []);
  mockListingUpsert.mockResolvedValue(undefined);
  mockProjectionUpsert.mockResolvedValue(undefined);
  mockListingUpdateMany.mockResolvedValue({ count: 0 });
  mockSyncStateUpsert.mockResolvedValue(undefined);
  mockAuditCreate.mockResolvedValue(undefined);
}

// ─── Global fetch mock (Trestle Media endpoint in the batch refill) ──────

const mockMediaFetch = jest.fn<Promise<unknown>, [unknown, unknown?]>();
const realFetch = global.fetch;

/** One Trestle /odata/Media response for every batch the refill requests. */
function primeMediaEndpoint(rows: Record<string, unknown>[]) {
  mockMediaFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ value: rows }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockMediaFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

// ─── Headline proof ──────────────────────────────────────────────────────

describe("N2 headline — identical second run produces ZERO business-row updates", () => {
  it("skips both the listing upsert and the projection upsert when nothing changed", async () => {
    const raw = rawRecord();
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(raw),
      existingProjection: dbProjectionRowFor(raw),
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    // ZERO listing writes, ZERO projection writes.
    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(mockProjectionUpsert).not.toHaveBeenCalled();
    // Ledger: both paths checked 1, skipped 1, changed 0.
    expect(result.listings_checked).toBe(1);
    expect(result.listings_changed).toBe(0);
    expect(result.listings_skipped_unchanged).toBe(1);
    expect(result.projection_checked).toBe(1);
    expect(result.projection_changed).toBe(0);
    expect(result.projection_skipped_unchanged).toBe(1);
    // Legacy aggregate preserved: the record still completed the write stage.
    expect(result.upserted).toBe(1);
    // Watermark bookkeeping still owned by sync_state — written every run.
    expect(mockSyncStateUpsert).toHaveBeenCalledTimes(1);
  });

  it("bookkeeping-only differences (sync_status) do NOT trigger a write", async () => {
    const raw = rawRecord();
    const existing = dbListingRowFor(raw);
    // Only sync_status differs from what the mapper would stamp ("synced").
    // last_synced_from_trestle differs on EVERY run by construction (mapper
    // stamps new Date()) and is likewise excluded — the headline test above
    // already proves that; this pins the sync_status half of the exclusion.
    existing.sync_status = "pending-resync";
    primeMocks({
      records: [raw],
      existingListing: existing,
      existingProjection: dbProjectionRowFor(raw),
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(result.listings_skipped_unchanged).toBe(1);
  });
});

// ─── Per-field propagation ───────────────────────────────────────────────

describe("N2 propagation — any genuine business-field difference still writes", () => {
  /**
   * Each case mutates the EXISTING DB row (stale value) while the incoming
   * record stays the same → the field the sync would write differs → exactly
   * one listing upsert. The projection row is kept in its up-to-date form so
   * the projection path stays skipped (isolates the listing path) except
   * where noted.
   */
  const listingCases: Array<[string, (row: Record<string, unknown>) => void]> = [
    ["list_price", (row) => { row.list_price = "500000"; }],
    ["idx_display_yn (display gate)", (row) => { row.idx_display_yn = false; }],
    ["internet_entire_listing_display_yn (display gate)", (row) => { row.internet_entire_listing_display_yn = false; }],
    ["internet_address_display_yn (display gate)", (row) => { row.internet_address_display_yn = false; }],
    ["participant_only (display gate)", (row) => { row.participant_only = true; }],
    ["owner_opt_out (display gate)", (row) => { row.owner_opt_out = true; }],
    ["address JSON", (row) => {
      row.address = { ...(row.address as Record<string, unknown>), UnitNumber: "18C" };
    }],
    ["features JSON", (row) => {
      row.features = { ...(row.features as Record<string, unknown>), PublicRemarks: "Stale remarks" };
    }],
    ["raw_data single-field difference", (row) => {
      row.raw_data = { ...(row.raw_data as Record<string, unknown>), PublicRemarks: "One byte older." };
    }],
    ["modification_timestamp", (row) => { row.modification_timestamp = new Date("2026-06-30T00:00:00Z"); }],
  ];

  it.each(listingCases)("stale %s ⇒ exactly one listing update", async (_name, mutate) => {
    const raw = rawRecord();
    const existing = dbListingRowFor(raw);
    mutate(existing);
    primeMocks({
      records: [raw],
      existingListing: existing,
      existingProjection: dbProjectionRowFor(raw),
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(mockListingUpsert).toHaveBeenCalledTimes(1);
    expect(result.listings_changed).toBe(1);
    expect(result.listings_skipped_unchanged).toBe(0);
  });

  it("status change (Active → Closed terminal transition) writes once with transition fields", async () => {
    // Incoming record is now Closed; the existing row is still Active.
    const raw = rawRecord({ StandardStatus: "Closed", CloseDate: "2026-07-10" });
    const existing = dbListingRowFor(rawRecord()); // Active row
    primeMocks({
      records: [raw],
      existingListing: existing,
      existingProjection: dbProjectionRowFor(rawRecord()),
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(mockListingUpsert).toHaveBeenCalledTimes(1);
    const args = mockListingUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    // Status + terminal clock + DOM transition all propagate.
    expect(args.update.status).toBe("Closed");
    expect(args.update.terminal_since).toBeInstanceOf(Date);
    expect(args.update.status_changed_at).toBeInstanceOf(Date);
    expect(result.listings_changed).toBe(1);
  });

  it("media difference participates when the payload carries media (comparator contract)", () => {
    // The incremental sync runs with useExpandMedia=false, so the update
    // payload OMITS media (mediaUpdatePatch) and media differences are owned
    // by the batch-media path — unchanged behavior. When a payload DOES carry
    // media, a difference must compare as changed:
    const existing = { media: [{ url: "a.jpg", mediaType: "Photo", order: 1 }] };
    const updateWithNewMedia = { media: [{ url: "b.jpg", mediaType: "Photo", order: 1 }] };
    const updateWithSameMedia = { media: [{ url: "a.jpg", mediaType: "Photo", order: 1 }] };
    expect(listingUpdateUnchanged(existing, updateWithNewMedia)).toBe(false);
    expect(listingUpdateUnchanged(existing, updateWithSameMedia)).toBe(true);
  });

  it("stale projection column ⇒ exactly one projection update while the listing stays skipped", async () => {
    const raw = rawRecord();
    const staleProjection = dbProjectionRowFor(raw);
    staleProjection.neighborhood = "Stale Neighborhood";
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(raw),
      existingProjection: staleProjection,
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(mockProjectionUpsert).toHaveBeenCalledTimes(1);
    expect(result.projection_changed).toBe(1);
    expect(result.projection_skipped_unchanged).toBe(0);
    expect(result.listings_skipped_unchanged).toBe(1);
  });

  it("missing projection row ⇒ projection created even when the listing is unchanged", async () => {
    const raw = rawRecord();
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(raw),
      existingProjection: null,
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(mockProjectionUpsert).toHaveBeenCalledTimes(1);
    expect(result.projection_changed).toBe(1);
  });

  it("brand-new creatable listing (no existing row) still creates via upsert", async () => {
    const raw = rawRecord();
    primeMocks({ records: [raw], existingListing: null, existingProjection: null });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(mockListingUpsert).toHaveBeenCalledTimes(1);
    expect(mockProjectionUpsert).toHaveBeenCalledTimes(1);
    expect(result.listings_checked).toBe(1);
    expect(result.listings_changed).toBe(1);
    expect(result.listings_skipped_unchanged).toBe(0);
  });
});

// ─── Counter reconciliation ──────────────────────────────────────────────

describe("N2 counters — checked ≡ changed + skipped_unchanged per path", () => {
  it("reconciles on a mixed batch (one unchanged + one changed)", async () => {
    const unchangedRaw = rawRecord();
    const changedRaw = rawRecord({ ListingId: "RLS-N2-0002", ListingKey: "1099900002", ListPrice: 725000 });

    const unchangedListing = dbListingRowFor(unchangedRaw);
    const staleChangedListing = dbListingRowFor(changedRaw);
    staleChangedListing.list_price = "700000"; // price moved 700000 → 725000

    mockFetchFromTrestle.mockResolvedValue({
      records: [unchangedRaw, changedRaw],
      totalFetched: 2,
    });
    mockListingFindUnique.mockImplementation(async (args) => {
      const where = (args as { where: { listing_id: string } }).where;
      return where.listing_id === "RLS-N2-0001" ? unchangedListing : staleChangedListing;
    });
    mockProjectionFindUnique.mockImplementation(async (args) => {
      const where = (args as { where: { listing_id: string } }).where;
      return where.listing_id === "RLS-N2-0001"
        ? dbProjectionRowFor(unchangedRaw)
        : dbProjectionRowFor(changedRaw); // projection already current → skipped
    });
    mockListingUpsert.mockResolvedValue(undefined);
    mockProjectionUpsert.mockResolvedValue(undefined);
    mockListingUpdateMany.mockResolvedValue({ count: 0 });
    mockSyncStateUpsert.mockResolvedValue(undefined);
    mockAuditCreate.mockResolvedValue(undefined);

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(result.listings_checked).toBe(2);
    expect(result.listings_changed).toBe(1);
    expect(result.listings_skipped_unchanged).toBe(1);
    expect(result.listings_checked).toBe(
      result.listings_changed + result.listings_skipped_unchanged,
    );
    expect(result.projection_checked).toBe(2);
    expect(result.projection_checked).toBe(
      result.projection_changed + result.projection_skipped_unchanged,
    );
    expect(mockListingUpsert).toHaveBeenCalledTimes(1);
    expect(result.upserted).toBe(2); // legacy aggregate unchanged in meaning
  });
});

// ─── Comparator unit coverage ────────────────────────────────────────────

describe("listingUpdateUnchanged (pure comparator)", () => {
  it("no existing row ⇒ always changed", () => {
    expect(listingUpdateUnchanged(null, { status: "Active" })).toBe(false);
    expect(listingUpdateUnchanged(undefined, { status: "Active" })).toBe(false);
  });

  it("timestamps compare by epoch, never Date identity", () => {
    const existing = { modification_timestamp: new Date("2026-07-01T12:00:00Z") };
    expect(
      listingUpdateUnchanged(existing, {
        modification_timestamp: new Date("2026-07-01T12:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      listingUpdateUnchanged(existing, {
        modification_timestamp: new Date("2026-07-01T12:00:01Z"),
      }),
    ).toBe(false);
  });

  it("null timestamps equal only null", () => {
    expect(listingUpdateUnchanged({ listing_contract_date: null }, { listing_contract_date: null })).toBe(true);
    expect(
      listingUpdateUnchanged(
        { listing_contract_date: null },
        { listing_contract_date: new Date("2026-01-01T00:00:00Z") },
      ),
    ).toBe(false);
  });

  it("Decimal columns compare numerically across representations (never `0`-swallowing)", () => {
    expect(listingUpdateUnchanged({ list_price: "550000.00" }, { list_price: "550000" })).toBe(true);
    expect(listingUpdateUnchanged({ list_price: "550000" }, { list_price: "550001" })).toBe(false);
    expect(listingUpdateUnchanged({ living_area: null }, { living_area: null })).toBe(true);
    expect(listingUpdateUnchanged({ living_area: "0" }, { living_area: null })).toBe(false);
    expect(listingUpdateUnchanged({ living_area: null }, { living_area: "0" })).toBe(false);
  });

  it("JSON columns compare by normalized deep equality (key order irrelevant)", () => {
    const existing = { raw_data: { B: 2, A: { y: [1, 2], x: "s" } } };
    expect(listingUpdateUnchanged(existing, { raw_data: { A: { x: "s", y: [1, 2] }, B: 2 } })).toBe(true);
    expect(listingUpdateUnchanged(existing, { raw_data: { A: { x: "s", y: [2, 1] }, B: 2 } })).toBe(false);
    expect(listingUpdateUnchanged(existing, { raw_data: { A: { x: "s", y: [1, 2] }, B: 3 } })).toBe(false);
  });

  it("JSON comparison treats undefined members as absent (what Prisma would store)", () => {
    expect(
      listingUpdateUnchanged(
        { address: { StreetName: "Main" } },
        { address: { StreetName: "Main", UnitNumber: undefined } },
      ),
    ).toBe(true);
  });

  it("bookkeeping fields are excluded from comparison", () => {
    expect(
      listingUpdateUnchanged(
        { status: "Active", sync_status: "gated:old", last_synced_from_trestle: new Date("2026-01-01") },
        { status: "Active", sync_status: "synced", last_synced_from_trestle: new Date("2026-07-18") },
      ),
    ).toBe(true);
  });

  it("a field missing from the existing select fails open to writing", () => {
    // Payload writes a field the select never fetched → compares as changed
    // (an extra write, never a swallowed change).
    expect(listingUpdateUnchanged({ status: "Active" }, { status: "Active", mls_id: "K1" })).toBe(false);
  });

  it("LISTING_SYNC_COMPARE_SELECT covers every non-bookkeeping field the update-arm writes", () => {
    // Guard against select/payload drift: the fields the update-arm can write
    // (statically enumerated here) must all be selected for comparison —
    // otherwise every run rewrites (fail-open, but defeats N2).
    const updateArmFields = [
      "mls_id", "status", "terminal_since", "listing_type", "property_type",
      "property_sub_type", "list_price", "bedrooms_total", "bathrooms_full",
      "bathrooms_half", "living_area", "borough", "neighborhood", "city",
      "postal_code", "idx_display_yn", "internet_entire_listing_display_yn",
      "internet_address_display_yn", "participant_only", "owner_opt_out",
      "address", "features", "raw_data", "modification_timestamp",
      "listing_contract_date", "status_changed_at", "first_active_date",
      "days_on_market", "cumulative_days_on_market",
      "list_agent_full_name", "list_office_name", "list_agent_email",
      "list_agent_direct_phone", "list_office_mls_id", "list_agent_mls_id",
      "co_list_office_mls_id", "co_list_agent_mls_id",
    ];
    for (const field of updateArmFields) {
      expect(
        (LISTING_SYNC_COMPARE_SELECT as Record<string, boolean>)[field],
      ).toBe(true);
    }
  });
});

// ─── Batch-media refill (Maya blocker on PR #535) ────────────────────────
//
// The batch-media path (post-upsert refill when useExpandMedia=false) must
// not be unconditional: candidacy is per listing (stored media missing OR
// listing row physically written this run — NOT the legacy `upserted`
// aggregate), and any fetched media is compared against stored media
// before the updateMany is issued.

describe("Maya blocker (PR #535) — batch-media refill compare-before-write", () => {
  /** Record WITHOUT inline media, so the batch-media path is in play. */
  const noMediaRaw = (overrides: Record<string, unknown> = {}) =>
    rawRecord({ Media: [], ...overrides });

  /** Normalized DB shape the refill would write for TRESTLE_MEDIA_ROW. */
  const STORED_MEDIA = [
    { url: "https://cdn.example.com/p1.jpg", mediaType: "Photo", order: 1 },
  ];
  const TRESTLE_MEDIA_ROW = {
    ResourceRecordKey: "1099900001",
    MediaURL: "https://cdn.example.com/p1.jpg",
    MediaCategory: "Photo",
    Order: 1,
  };

  it("HEADLINE: identical second run performs ZERO listing writes across BOTH paths (per-record AND batch-media)", async () => {
    const raw = noMediaRaw();
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(raw),
      existingProjection: dbProjectionRowFor(raw),
      // Stored media intact from the prior run.
      storedMediaRows: [
        { listing_id: "RLS-N2-0001", media: STORED_MEDIA, sync_status: "synced" },
      ],
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    // ZERO listing writes of ANY kind on the second identical run:
    // no upsert (create or update-arm) AND no batch-media updateMany.
    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(mockListingUpdateMany).not.toHaveBeenCalled();
    expect(mockProjectionUpsert).not.toHaveBeenCalled();
    // Stronger still: an unchanged record with intact stored media induces
    // NO batch-media work at all — the Trestle Media endpoint is never hit.
    expect(mockMediaFetch).not.toHaveBeenCalled();
    // The candidate read is the bounded select of just this run's listings.
    expect(mockListingFindMany).toHaveBeenCalledTimes(1);
    const fmArgs = mockListingFindMany.mock.calls[0][0] as {
      where: { listing_id: { in: string[] } };
      select: Record<string, boolean>;
    };
    expect(fmArgs.where.listing_id.in).toEqual(["RLS-N2-0001"]);
    expect(fmArgs.select).toEqual({ listing_id: true, media: true, sync_status: true });
    // Ledgers — per-record AND media-refill.
    expect(result.listings_skipped_unchanged).toBe(1);
    expect(result.media_refill_checked).toBe(1);
    expect(result.media_refill_changed).toBe(0);
    expect(result.media_refill_skipped_unchanged).toBe(1);
  });

  it("media-missing listing still gets refilled — exactly one updateMany, listing row untouched", async () => {
    const raw = noMediaRaw();
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(raw), // row unchanged → per-record path skips
      existingProjection: dbProjectionRowFor(raw),
      storedMediaRows: [
        { listing_id: "RLS-N2-0001", media: [], sync_status: "synced" },
      ],
    });
    primeMediaEndpoint([TRESTLE_MEDIA_ROW]);

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(mockListingUpsert).not.toHaveBeenCalled();
    expect(mockListingUpdateMany).toHaveBeenCalledTimes(1);
    const call = mockListingUpdateMany.mock.calls[0][0] as {
      where: { listing_id: string };
      data: { media: unknown };
    };
    expect(call.where.listing_id).toBe("RLS-N2-0001");
    expect(call.data.media).toEqual(STORED_MEDIA);
    expect(result.media_refill_checked).toBe(1);
    expect(result.media_refill_changed).toBe(1);
    expect(result.media_refill_skipped_unchanged).toBe(0);
  });

  it("media-changed listing gets exactly one media write (fetched genuinely differs from stored)", async () => {
    // PhotosChangeTimestamp advanced → raw_data differs → the listing row is
    // physically written (media candidacy signal) and the fetched media
    // genuinely differs from stored → one updateMany.
    const raw = noMediaRaw({ PhotosChangeTimestamp: "2026-07-02T09:00:00Z" });
    const staleRaw = noMediaRaw({ PhotosChangeTimestamp: "2026-06-01T00:00:00Z" });
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(staleRaw),
      existingProjection: dbProjectionRowFor(raw), // projection unaffected by raw_data
      storedMediaRows: [
        {
          listing_id: "RLS-N2-0001",
          media: [{ url: "https://cdn.example.com/OLD.jpg", mediaType: "Photo", order: 1 }],
          sync_status: "synced",
        },
      ],
    });
    primeMediaEndpoint([TRESTLE_MEDIA_ROW]);

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(mockListingUpsert).toHaveBeenCalledTimes(1); // genuine row change
    expect(mockListingUpdateMany).toHaveBeenCalledTimes(1); // genuine media change
    const call = mockListingUpdateMany.mock.calls[0][0] as { data: { media: unknown } };
    expect(call.data.media).toEqual(STORED_MEDIA);
    expect(result.media_refill_checked).toBe(1);
    expect(result.media_refill_changed).toBe(1);
    expect(result.media_refill_skipped_unchanged).toBe(0);
  });

  it("media-identical listing gets ZERO media writes even when its row changed (compare-before-write)", async () => {
    // Row changes for a non-media reason (price) → the listing IS a fetch
    // candidate — but the fetched media compares equal to stored, so no
    // media write is issued.
    const raw = noMediaRaw();
    const staleExisting = dbListingRowFor(raw);
    staleExisting.list_price = "500000"; // price moved → row write
    primeMocks({
      records: [raw],
      existingListing: staleExisting,
      existingProjection: dbProjectionRowFor(raw),
      storedMediaRows: [
        { listing_id: "RLS-N2-0001", media: STORED_MEDIA, sync_status: "synced" },
      ],
    });
    primeMediaEndpoint([TRESTLE_MEDIA_ROW]);

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    expect(mockListingUpsert).toHaveBeenCalledTimes(1); // the price write
    expect(mockListingUpdateMany).not.toHaveBeenCalled(); // NO media write
    expect(mockMediaFetch).toHaveBeenCalledTimes(1); // fetched, then compared equal
    expect(result.media_refill_checked).toBe(1);
    expect(result.media_refill_changed).toBe(0);
    expect(result.media_refill_skipped_unchanged).toBe(1);
  });

  it("candidate selection: an unchanged listing with intact media is never fetched; ledger invariant holds on a mixed run", async () => {
    const unchangedRaw = noMediaRaw(); // RLS-N2-0001 / key 1099900001
    const missingMediaRaw = noMediaRaw({ ListingId: "RLS-N2-0002", ListingKey: "1099900002" });

    mockFetchFromTrestle.mockResolvedValue({
      records: [unchangedRaw, missingMediaRaw],
      totalFetched: 2,
    });
    mockListingFindUnique.mockImplementation(async (args) => {
      const where = (args as { where: { listing_id: string } }).where;
      return where.listing_id === "RLS-N2-0001"
        ? dbListingRowFor(unchangedRaw)
        : dbListingRowFor(missingMediaRaw);
    });
    mockProjectionFindUnique.mockImplementation(async (args) => {
      const where = (args as { where: { listing_id: string } }).where;
      return where.listing_id === "RLS-N2-0001"
        ? dbProjectionRowFor(unchangedRaw)
        : dbProjectionRowFor(missingMediaRaw);
    });
    mockListingFindMany.mockResolvedValue([
      { listing_id: "RLS-N2-0001", media: STORED_MEDIA, sync_status: "synced" },
      { listing_id: "RLS-N2-0002", media: [], sync_status: "synced" },
    ]);
    mockListingUpsert.mockResolvedValue(undefined);
    mockProjectionUpsert.mockResolvedValue(undefined);
    mockListingUpdateMany.mockResolvedValue({ count: 1 });
    mockSyncStateUpsert.mockResolvedValue(undefined);
    mockAuditCreate.mockResolvedValue(undefined);
    primeMediaEndpoint([
      { ...TRESTLE_MEDIA_ROW, ResourceRecordKey: "1099900002" },
    ]);

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.errors).toBe(0);
    // Only the missing-media listing is in the Trestle Media $filter.
    expect(mockMediaFetch).toHaveBeenCalledTimes(1);
    const mediaUrl = String(mockMediaFetch.mock.calls[0][0]);
    expect(mediaUrl).toContain("1099900002");
    expect(mediaUrl).not.toContain("1099900001");
    // One media write, for the missing-media listing only.
    expect(mockListingUpdateMany).toHaveBeenCalledTimes(1);
    expect(
      (mockListingUpdateMany.mock.calls[0][0] as { where: { listing_id: string } }).where
        .listing_id,
    ).toBe("RLS-N2-0002");
    // Invariant: checked ≡ changed + skipped_unchanged.
    expect(result.media_refill_checked).toBe(2);
    expect(result.media_refill_changed).toBe(1);
    expect(result.media_refill_skipped_unchanged).toBe(1);
    expect(result.media_refill_checked).toBe(
      result.media_refill_changed + result.media_refill_skipped_unchanged,
    );
  });

  it("#415 continuity: an archived row is excluded from refill entirely (no fetch, no write, not counted)", async () => {
    const raw = noMediaRaw();
    primeMocks({
      records: [raw],
      existingListing: dbListingRowFor(raw),
      existingProjection: dbProjectionRowFor(raw),
      storedMediaRows: [
        { listing_id: "RLS-N2-0001", media: [], sync_status: "archived" },
      ],
    });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(mockMediaFetch).not.toHaveBeenCalled();
    expect(mockListingUpdateMany).not.toHaveBeenCalled();
    expect(result.media_refill_checked).toBe(0);
    expect(result.media_refill_changed).toBe(0);
    expect(result.media_refill_skipped_unchanged).toBe(0);
  });
});

// ─── mediaRefillRowUnchanged (pure comparator) ───────────────────────────

describe("mediaRefillRowUnchanged", () => {
  const fetched = [{ url: "a.jpg", mediaType: "Photo", order: 1 }];

  it("missing/empty/malformed stored media always compares as changed (fail-open to writing)", () => {
    expect(mediaRefillRowUnchanged(null, fetched)).toBe(false);
    expect(mediaRefillRowUnchanged(undefined, fetched)).toBe(false);
    expect(mediaRefillRowUnchanged([], fetched)).toBe(false);
    expect(mediaRefillRowUnchanged({ PhotosCount: 3 }, fetched)).toBe(false);
    expect(mediaRefillRowUnchanged("[]", fetched)).toBe(false);
  });

  it("normalized deep equality — object key order irrelevant, array order significant", () => {
    expect(
      mediaRefillRowUnchanged([{ order: 1, mediaType: "Photo", url: "a.jpg" }], fetched),
    ).toBe(true);
    expect(
      mediaRefillRowUnchanged(
        [
          { url: "b.jpg", mediaType: "Photo", order: 2 },
          { url: "a.jpg", mediaType: "Photo", order: 1 },
        ],
        [
          { url: "a.jpg", mediaType: "Photo", order: 1 },
          { url: "b.jpg", mediaType: "Photo", order: 2 },
        ],
      ),
    ).toBe(false);
  });

  it("any genuine difference (url, mediaType, order, count) compares as changed", () => {
    expect(mediaRefillRowUnchanged([{ url: "b.jpg", mediaType: "Photo", order: 1 }], fetched)).toBe(false);
    expect(mediaRefillRowUnchanged([{ url: "a.jpg", mediaType: "FloorPlan", order: 1 }], fetched)).toBe(false);
    expect(mediaRefillRowUnchanged([{ url: "a.jpg", mediaType: "Photo", order: 2 }], fetched)).toBe(false);
    expect(
      mediaRefillRowUnchanged(
        [{ url: "a.jpg", mediaType: "Photo", order: 1 }, { url: "b.jpg", mediaType: "Photo", order: 2 }],
        fetched,
      ),
    ).toBe(false);
  });
});
