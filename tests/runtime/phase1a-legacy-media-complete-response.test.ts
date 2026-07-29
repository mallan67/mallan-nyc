/// <reference types="jest" />
/**
 * Phase 1A — legacy `listings.media` complete-response reconciliation (failing-first TDD).
 *
 * DEFECT (baseline e113a1ef): the batch-media path in `lib/idx/sync.ts` builds
 * `mediaByListing` ONLY from ResourceRecordKeys that returned rows, then iterates
 * only those entries. A listing whose Cotality gallery is authoritatively empty
 * therefore never enters the map and its stale `listings.media` array is never
 * cleared. The public reader can later resurrect that stale array whenever the
 * normalized `listing_media` rows are empty.
 *
 * This is the LEGACY writer only. The normalized `runMediaSync` path in
 * `lib/idx/media-sync.ts` already implements complete/empty/incomplete
 * semantics (nextLink exhaustion, tombstoneVanished, cursor hold on !ok) and
 * is deliberately NOT touched here.
 *
 * Contract proven by this first test:
 *   stored populated `listings.media` + COMPLETE empty Cotality batch response
 *   → exactly one `media: []` write for that listing.
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

import { syncListings } from "@/lib/idx/sync";
import { mapTrestleToPrisma, checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

// ── Fixtures (mirror tests/runtime/phase3-write-suppression-sync.test.ts) ──

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

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncStateFindUnique.mockResolvedValue(null);
});

// ── RED 1: complete-empty gallery must clear stale legacy media ───────────

describe("syncListings — COMPLETE empty batch-media response clears stale listings.media", () => {
  it("writes media: [] exactly once for a listing whose Cotality gallery is authoritatively empty", async () => {
    const raw = rawRecord(); // Media: [] → routed to the batch-media path
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(raw)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(raw)]]),
      // Stale gallery still stored on the legacy JSON column.
      mediaByListingId: new Map([
        [
          "RLS100001",
          [
            { url: "https://api.cotality.com/trestle/Media/a0.jpg?sig=OLD", mediaType: "Photo", order: -1 },
            { url: "https://api.cotality.com/trestle/Media/a1.jpg?sig=OLD", mediaType: "Photo", order: 1 },
          ],
        ],
      ]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [raw], totalFetched: 1 });

    // COMPLETE response: HTTP 200, well-formed body, empty collection, NO nextLink.
    // This is authoritative proof the listing has zero media — not a failure.
    const body = JSON.stringify({ "@odata.count": 0, value: [] });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
    })) as unknown as typeof fetch;

    await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    // The stale two-photo array must be reconciled to [].
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const call = mockUpdateMany.mock.calls[0][0] as {
      where: { listing_id: string };
      data: { media: unknown[] };
    };
    expect(call.where.listing_id).toBe("RLS100001");
    expect(call.data.media).toEqual([]);
  });
});
