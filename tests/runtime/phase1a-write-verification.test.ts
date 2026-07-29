/// <reference types="jest" />
/**
 * Phase 1A — verified `listings.media` write results + revalidation proof.
 *
 * Covers the two gaps the caller matrices left open:
 *   • `updateMany.count > 1` on the main path (invariant violation, not success)
 *   • `migrateMediaToR2` — the FOURTH legacy writer, which previously discarded
 *     its updateMany result and incremented `migrated` unconditionally
 *   • that cache revalidation follows a CONFIRMED write and nothing else,
 *     asserted on the actual tag call rather than on a counter
 *
 * No R2 action is performed: `hasR2Config`/`uploadToR2` are mocked, so the
 * migration path is exercised purely as a database-write correctness check.
 */

const mockQueryRaw = jest.fn();
const mockUpdateMany = jest.fn();
const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();
const mockProjFindUnique = jest.fn();
const mockProjUpsert = jest.fn();
const mockSyncStateUpsert = jest.fn();
const mockSyncStateFindUnique = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
    listing: {
      findUnique: (a: unknown) => mockFindUnique(a),
      upsert: (a: unknown) => mockUpsert(a),
      findFirst: (a: unknown) => mockFindFirst(a),
      updateMany: (a: unknown) => mockUpdateMany(a),
    },
    listingSearchProjection: {
      findUnique: (a: unknown) => mockProjFindUnique(a),
      upsert: (a: unknown) => mockProjUpsert(a),
    },
    syncState: {
      upsert: (a: unknown) => mockSyncStateUpsert(a),
      findUnique: (a: unknown) => mockSyncStateFindUnique(a),
    },
    auditEvent: { create: (a: unknown) => mockAuditCreate(a) },
  },
}));

// Capture the EXACT tag set handed to revalidation, keeping every other export real.
const mockRevalidate = jest.fn();
jest.mock("@/lib/cache/public-cache", () => ({
  ...jest.requireActual("@/lib/cache/public-cache"),
  safeRevalidateTags: (tags: Iterable<string>, c?: unknown) => mockRevalidate([...tags], c),
}));

const mockFetchFromTrestle = jest.fn();
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchFromTrestle: (a: unknown) => mockFetchFromTrestle(a),
  buildIncrementalFilter: () => "f",
  buildActiveFilter: () => "f",
  buildAgentHistoricalFilter: () => "f",
}));

const mockGetAccessToken = jest.fn();
jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: () => mockGetAccessToken(),
}));

const mockUploadToR2 = jest.fn();
const mockExistsInR2 = jest.fn();
jest.mock("@/lib/images/r2", () => ({
  __esModule: true,
  hasR2Config: () => true,
  uploadToR2: (...a: unknown[]) => mockUploadToR2(...a),
  existsInR2: (...a: unknown[]) => mockExistsInR2(...a),
  getR2PublicUrl: (k: string) => `https://cdn.example.com/${k}`,
}));

import { syncListings, migrateMediaToR2 } from "@/lib/idx/sync";
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { listingCacheTag, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

const BASE = "https://api.cotality.com/trestle";

function rawRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingId: "RLS100001", ListingKey: "KEY100001",
    PropertyType: "Residential", PropertySubType: "Condominium",
    ListPrice: 750000, StandardStatus: "Active",
    StreetNumber: "400", StreetName: "East 90th Street", UnitNumber: "17C",
    City: "New York", StateOrProvince: "NY", PostalCode: "10128",
    BedroomsTotal: 2, BathroomsFull: 2,
    ListAgentMlsId: "AG001", ListAgentFullName: "Test Agent", ListOfficeName: "Test Office LLC",
    ModificationTimestamp: "2026-07-01T00:00:00Z",
    InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true,
    Media: [], ...over,
  };
}

function dbRowFromRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const m = mapTrestleToPrisma(raw);
  const dec = (v: string | number) => ({ toNumber: () => Number(v), toString: () => String(v) });
  return {
    status: m.status, sync_status: m.sync_status, mls_id: m.mls_id,
    listing_type: m.listing_type, property_type: m.property_type,
    property_sub_type: m.property_sub_type, list_price: dec(m.list_price),
    bedrooms_total: m.bedrooms_total, bathrooms_full: m.bathrooms_full,
    bathrooms_half: m.bathrooms_half,
    living_area: m.living_area === null ? null : dec(m.living_area),
    borough: m.borough, neighborhood: m.neighborhood, city: m.city,
    postal_code: m.postal_code, idx_display_yn: m.idx_display_yn,
    internet_entire_listing_display_yn: m.internet_entire_listing_display_yn,
    internet_address_display_yn: m.internet_address_display_yn,
    participant_only: m.participant_only, owner_opt_out: m.owner_opt_out,
    address: JSON.parse(JSON.stringify(m.address)),
    features: JSON.parse(JSON.stringify(m.features)),
    raw_data: JSON.parse(JSON.stringify(m.raw_data)),
    modification_timestamp: new Date(m.modification_timestamp.getTime()),
    listing_contract_date: m.listing_contract_date,
    status_changed_at: new Date("2026-06-01T00:00:00Z"),
    first_active_date: new Date("2026-06-01T00:00:00Z"),
    days_on_market: 10, terminal_since: null, cumulative_days_on_market: null,
    last_synced_from_trestle: new Date("2026-06-01T00:00:00Z"),
    ...typedAgentColumnsFromJson(m.agent_info as Record<string, unknown>),
  };
}

function completeMediaResponse() {
  const body = JSON.stringify({
    "@odata.count": 1,
    value: [{
      ResourceRecordKey: "KEY100001", MediaKey: "m1",
      MediaURL: `${BASE}/Media/m1.jpg`, MediaCategory: "Photo",
      Order: 1, PreferredPhotoYN: false, MediaStatus: "Active",
    }],
  });
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, text: async () => body,
  })) as unknown as typeof fetch;
}

function projectionRowFromRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const m = mapTrestleToPrisma(raw);
  const input: ListingProjectionSource = {
    listing_id: m.listing_id, status: m.status, listing_type: m.listing_type,
    property_type: m.property_type, property_sub_type: m.property_sub_type,
    list_price: m.list_price, bedrooms_total: m.bedrooms_total,
    bathrooms_full: m.bathrooms_full, bathrooms_half: m.bathrooms_half,
    living_area: m.living_area, borough: m.borough, neighborhood: m.neighborhood,
    city: m.city, postal_code: m.postal_code, rls_eligible: true,
    commercial_sub_type: null, idx_display_yn: m.idx_display_yn,
    internet_entire_listing_display_yn: m.internet_entire_listing_display_yn,
    internet_address_display_yn: m.internet_address_display_yn,
    participant_only: m.participant_only, agent_id: null,
    modification_timestamp: m.modification_timestamp,
    address: m.address as Record<string, unknown>,
    features: m.features as Record<string, unknown>,
    media: m.media as unknown[],
  };
  return { ...buildListingSearchProjectionFromListing(input) };
}

/**
 * One listing whose LISTING and PROJECTION rows are both materially unchanged
 * (so neither write path can contribute a cache tag), but whose stored legacy
 * media is stale — making the media write the ONLY possible tag source.
 */
function wireOneStaleListing() {
  const raw = rawRecord();
  mockFindUnique.mockResolvedValue(dbRowFromRaw(raw));
  mockProjFindUnique.mockResolvedValue(projectionRowFromRaw(raw));
  mockFindFirst.mockResolvedValue({
    media: [{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }],
  });
  mockFetchFromTrestle.mockResolvedValue({ records: [raw], totalFetched: 1 });
  return raw;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockUpsert.mockResolvedValue({});
  mockProjUpsert.mockResolvedValue({});
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 1 });
});

// ── Main path: count > 1 ──────────────────────────────────────────────────

describe("main sync — updateMany.count > 1 is an invariant violation", () => {
  it("is partial, counts no update, and adds no cache tag", async () => {
    const raw = wireOneStaleListing();
    completeMediaResponse();
    mockUpdateMany.mockResolvedValue({ count: 2 }); // listing_id must be unique

    const result = await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    expect(result.write_paths.batch_media.rows_updated).toBe(0);
    expect(result.write_paths.batch_media.rows_failed).toBe(1);
    expect(result.run_status).toBe("partial");
    expect(result.errors).toBe(0);
    expect(result.legacy_media_batches?.listings_write_failed).toBe(1);
    expect(result.legacy_media_batches?.incomplete_reasons.media_write_multi_match).toBe(1);

    // Watermark capped below the failed listing.
    const stateArgs = mockSyncStateUpsert.mock.calls[0][0] as { update: { last_watermark?: Date } };
    expect(stateArgs.update.last_watermark!.getTime())
      .toBe(new Date(String(raw.ModificationTimestamp)).getTime() - 1);

    // No listing tag for a write that did not happen.
    const allTags = mockRevalidate.mock.calls.flatMap((c) => c[0] as string[]);
    expect(allTags).not.toContain(listingCacheTag("RLS100001"));
  });
});

// ── Revalidation proof — the actual tag call, not a counter ───────────────

describe("cache revalidation follows a CONFIRMED write and nothing else", () => {
  it("one confirmed write revalidates exactly that listing tag plus one coarse search bump", async () => {
    wireOneStaleListing();
    completeMediaResponse();
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    const allTags = mockRevalidate.mock.calls.flatMap((c) => c[0] as string[]);
    expect(allTags).toContain(listingCacheTag("RLS100001"));
    expect(allTags.filter((t) => t === SEARCH_CACHE_TAG)).toHaveLength(1); // ONE coarse bump
  });

  it("a zero-match write revalidates nothing at all", async () => {
    wireOneStaleListing();
    completeMediaResponse();
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    const allTags = mockRevalidate.mock.calls.flatMap((c) => c[0] as string[]);
    expect(allTags).not.toContain(listingCacheTag("RLS100001"));
    expect(allTags).not.toContain(SEARCH_CACHE_TAG);
  });

  it("a thrown write revalidates nothing at all", async () => {
    wireOneStaleListing();
    completeMediaResponse();
    mockUpdateMany.mockRejectedValue(new Error("deadlock detected"));

    await syncListings({ since: new Date("2026-07-01T00:00:00Z") });

    const allTags = mockRevalidate.mock.calls.flatMap((c) => c[0] as string[]);
    expect(allTags).not.toContain(listingCacheTag("RLS100001"));
    expect(allTags).not.toContain(SEARCH_CACHE_TAG);
  });
});

// ── The fourth writer: migrateMediaToR2 ───────────────────────────────────

describe("migrateMediaToR2 — the fourth legacy listings.media writer", () => {
  const trestleMedia = [{ url: `${BASE}/Media/x.jpg`, mediaType: "Photo", order: 0 }];

  function wireMigration() {
    mockQueryRaw.mockResolvedValue([
      { id: BigInt(1), listing_id: "RLS100001", media: trestleMedia },
    ]);
    mockExistsInR2.mockResolvedValue(false);
    mockUploadToR2.mockResolvedValue(undefined);
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: { get: () => "image/jpeg" },
    })) as unknown as typeof fetch;
  }

  it("count === 1 is a real migration", async () => {
    wireMigration();
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const r = await migrateMediaToR2();

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(r.migrated).toBe(1);
    expect(r.errors).toBe(0);
  });

  it("count === 0 is NOT reported as migrated", async () => {
    wireMigration();
    mockUpdateMany.mockResolvedValue({ count: 0 }); // concurrent archive/delete

    const r = await migrateMediaToR2();

    expect(r.migrated).toBe(0);
    expect(r.errors).toBe(1);
  });

  it("count > 1 is an invariant violation, not a migration", async () => {
    wireMigration();
    mockUpdateMany.mockResolvedValue({ count: 2 });

    const r = await migrateMediaToR2();

    expect(r.migrated).toBe(0);
    expect(r.errors).toBe(1);
  });
});
