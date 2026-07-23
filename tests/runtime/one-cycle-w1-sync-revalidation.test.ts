/// <reference types="jest" />
/**
 * One Cycle W1 — sync-driven cache revalidation (failing-first TDD).
 *
 * Authority hierarchy (Maya 2026-07-22): Cotality API → One Cycle sync →
 * Neon operational copy → projections → Vercel cache → anonymous pages.
 * The SAME pipeline that changes data must refresh the cache: a listing that
 * MATERIALLY changed (the Phase-3 suppression comparators already decide
 * this) revalidates `listing:{id}`; a run with ANY change bumps the coarse
 * `search` tag ONCE; an unchanged run performs ZERO revalidations; and a
 * revalidation failure is counted but NEVER fails the sync run.
 *
 * Mocks @/lib/prisma + lib/idx/fetch + next/cache only — mapper, gates,
 * comparators, projection builders are production code (same harness family
 * as phase3-write-suppression-sync.test.ts).
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

// next/cache — the revalidation seam under test.
const mockRevalidateTag = jest.fn();
jest.mock("next/cache", () => ({
  __esModule: true,
  revalidateTag: (tag: string) => mockRevalidateTag(tag),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

import { syncListings } from "@/lib/idx/sync";
import { mapTrestleToPrisma, checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

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
  mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) =>
    state.listings.get(args.where.listing_id) ?? null,
  );
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) =>
    state.projections.get(args.where.listing_id) ?? null,
  );
  mockProjUpsert.mockResolvedValue({});
  mockFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ ok: false, status: 400, statusText: "Bad Request" })) as unknown as typeof fetch;
});

describe("One Cycle W1 — syncListings drives cache revalidation", () => {
  it("a MATERIALLY changed listing revalidates its listing tag AND bumps the coarse search tag once", async () => {
    const rawA = rawRecord(); // unchanged
    const rawBOld = rawRecord({ ListingId: "RLS100002", ListingKey: "KEY100002", ListPrice: 1250000 });
    const rawBNew = rawRecord({
      ListingId: "RLS100002",
      ListingKey: "KEY100002",
      ListPrice: 1195000,
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
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA, rawBNew], totalFetched: 2 });

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    const tags = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(tags).toContain("listing:RLS100002");
    expect(tags).not.toContain("listing:RLS100001"); // suppressed → untouched cache
    expect(tags.filter((t) => t === "search").length).toBe(1); // bumped ONCE per run
    // Neon-quiet 2026-07-23: every SUCCESSFUL run also revalidates the
    // idx-watermark tag AFTER its SyncState upsert commits (the public
    // "data last updated" time advances on every successful sync).
    expect(tags.filter((t) => t === "idx-watermark").length).toBe(1);
    expect(result.write_paths.revalidation.pages_revalidated).toBe(3); // listing tag + search + idx-watermark
    expect(result.write_paths.revalidation.revalidation_failures).toBe(0);
  });

  it("a fully UNCHANGED successful run revalidates ONLY the watermark tag (zero listing/search revalidations)", async () => {
    const rawA = rawRecord();
    const state: StoredState = {
      listings: new Map([["RLS100001", dbRowFromRaw(rawA)]]),
      projections: new Map([["RLS100001", projectionRowFromRaw(rawA)]]),
    };
    wireMocks(state);
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA], totalFetched: 1 });

    const result = await syncListings({ fullSync: true });

    // Neon-quiet 2026-07-23: listing/search caches stay untouched on an
    // unchanged run; the idx-watermark tag alone refreshes (last_run_at
    // advanced — the SyncState upsert committed a successful run).
    const tags = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(tags).toEqual(["idx-watermark"]);
    expect(result.write_paths.revalidation.pages_revalidated).toBe(1);
  });

  it("a brand-new listing (insert) revalidates its tag + search", async () => {
    const rawA = rawRecord();
    wireMocks({ listings: new Map(), projections: new Map() });
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA], totalFetched: 1 });

    await syncListings({ fullSync: true });

    const tags = mockRevalidateTag.mock.calls.map((c) => c[0] as string);
    expect(tags).toContain("listing:RLS100001");
    expect(tags).toContain("search");
  });

  it("revalidation failures are COUNTED but never fail the sync run", async () => {
    const rawA = rawRecord();
    wireMocks({ listings: new Map(), projections: new Map() });
    mockFetchFromTrestle.mockResolvedValue({ records: [rawA], totalFetched: 1 });
    mockRevalidateTag.mockImplementation(() => {
      throw new Error("revalidation store unavailable");
    });

    const result = await syncListings({ fullSync: true });

    expect(result.errors).toBe(0); // the sync itself is unaffected
    expect(result.upserted).toBe(1);
    expect(result.write_paths.revalidation.revalidation_failures).toBeGreaterThan(0);
    expect(result.write_paths.revalidation.pages_revalidated).toBe(0);
  });
});
