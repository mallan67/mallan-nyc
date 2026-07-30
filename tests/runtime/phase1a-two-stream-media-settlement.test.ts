/// <reference types="jest" />
/**
 * Phase 1A — three-stage settlement proven END TO END through the cursor.
 *
 * The multi-cycle suite wires `listing.findFirst -> null`, so every media write
 * is suppressed as archived/missing and the cursor never actually depends on a
 * media outcome. This suite models a REAL existing media row and drives each
 * media result (confirmed write, suppression, authoritative empty, feed
 * incompleteness, database reconciliation failure) through to the persisted
 * cursor, the run status and the revalidation tags.
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

const mockRevalidate = jest.fn();
jest.mock("@/lib/cache/public-cache", () => ({
  ...jest.requireActual("@/lib/cache/public-cache"),
  safeRevalidateTags: (tags: Iterable<string>, c?: unknown) => mockRevalidate([...tags], c),
}));

const mockFetchFromTrestle = jest.fn();
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchFromTrestle: (a: unknown) => mockFetchFromTrestle(a),
  buildIncrementalFilter: () => "legacy",
  buildActiveFilter: () => "active",
  buildAgentHistoricalFilter: () => "agent",
}));

const mockGetAccessToken = jest.fn();
jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: () => mockGetAccessToken(),
  hasCredentials: () => true,
}));

import { syncListings } from "@/lib/idx/sync";
import { bootstrapCursorState, parsePropertyCursorNotes, type PropertyCursorState } from "@/lib/idx/property-cursor";
import { listingCacheTag, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import {
  buildListingSearchProjectionFromListing,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

const BASE = "https://api.cotality.com/trestle";
const KEY = "K1";
const LID = "RLSK1";
const MT_TS = "2026-07-01T00:00:00Z";
const PCT_TS = "2026-07-02T00:00:00Z";

function record(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingKey: KEY, ListingId: LID,
    PropertyType: "Residential", PropertySubType: "Condominium",
    ListPrice: 750000, StandardStatus: "Active",
    StreetNumber: "400", StreetName: "East 90th Street",
    City: "New York", StateOrProvince: "NY", PostalCode: "10128",
    ListAgentMlsId: "AG001", ListAgentFullName: "Test Agent", ListOfficeName: "Test Office LLC",
    ModificationTimestamp: MT_TS, PhotosChangeTimestamp: PCT_TS,
    InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true,
    Media: [], ...over,
  };
}

/**
 * The listing + projection rows a previous sync of `raw` would have produced, so
 * BOTH write paths suppress and the MEDIA outcome is the only thing that can
 * move a cursor or emit a cache tag.
 */
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

const STORED_OLD = [{ url: `${BASE}/Media/old.jpg?sig=OLD`, mediaType: "Photo", order: 1 }];

/** A complete media response describing ONE photo. */
function mediaBody(mediaKey: string) {
  return JSON.stringify({
    "@odata.count": 1,
    value: [{
      ResourceRecordKey: KEY, MediaKey: mediaKey,
      MediaURL: `${BASE}/Media/${mediaKey}.jpg`, MediaCategory: "Photo",
      Order: 1, PreferredPhotoYN: false, MediaStatus: "Active",
    }],
  });
}

type MediaMode =
  | { kind: "complete"; mediaKey: string }
  | { kind: "empty" }
  | { kind: "incomplete_http" }
  | { kind: "later_page_fail" }
  | { kind: "throw" };

function wireMedia(mode: MediaMode) {
  let call = 0;
  global.fetch = jest.fn(async () => {
    call++;
    if (mode.kind === "throw") throw new Error("socket hang up");
    if (mode.kind === "incomplete_http") {
      return { ok: false, status: 503, text: async () => "" } as unknown as Response;
    }
    if (mode.kind === "later_page_fail") {
      if (call === 1) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            "@odata.count": 4,
            value: [{
              ResourceRecordKey: KEY, MediaKey: "p1", MediaURL: `${BASE}/Media/p1.jpg`,
              MediaCategory: "Photo", Order: 1, PreferredPhotoYN: false, MediaStatus: "Active",
            }],
            "@odata.nextLink": `${BASE}/odata/Media?p=2`,
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 503, text: async () => "" } as unknown as Response;
    }
    const body = mode.kind === "empty"
      ? JSON.stringify({ "@odata.count": 0, value: [] })
      : mediaBody(mode.mediaKey);
    return { ok: true, status: 200, text: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** One listing, present in both streams unless `streams` narrows it. */
function wireProperty(streams: "both" | "mt" | "pct" = "both") {
  mockFetchFromTrestle.mockImplementation(async (opts: Record<string, unknown>) => {
    const isMt = String(opts.orderby).startsWith("ModificationTimestamp");
    const include = streams === "both" || (isMt ? streams === "mt" : streams === "pct");
    return include ? { records: [record()], totalFetched: 1 } : { records: [], totalFetched: 0 };
  });
}

function persisted(): PropertyCursorState | null {
  const calls = mockSyncStateUpsert.mock.calls;
  if (!calls.length) return null;
  const a = calls[calls.length - 1][0] as { update: { notes?: string } };
  return a.update.notes ? parsePropertyCursorNotes(JSON.parse(a.update.notes)) : null;
}

const tags = () => mockRevalidate.mock.calls.flatMap((c) => c[0] as string[]);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("mock-token");
  // Listing + projection are materially UNCHANGED, so the only thing that can
  // move the cursor or emit a tag is the MEDIA outcome.
  mockFindUnique.mockResolvedValue(dbRowFromRaw(record()));      // unchanged
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockResolvedValue(projectionRowFromRaw(record())); // unchanged
  mockProjUpsert.mockResolvedValue({});
  mockFindFirst.mockResolvedValue({ media: STORED_OLD }); // a REAL existing media row
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
  wireProperty("both");
});

const run = () => syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

// ── Settling outcomes ─────────────────────────────────────────────────────

it("a CONFIRMED changed-media write settles and advances both cursors", async () => {
  wireMedia({ kind: "complete", mediaKey: "new1" });
  const res = await run();

  expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  expect(res.write_paths.batch_media.rows_updated).toBe(1);
  expect(res.run_status).toBe("ok");
  expect(res.property_cursor_persisted).toBe(true);
  const c = persisted()!;
  expect(c.mt).toEqual({ mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: KEY });
  expect(c.pct).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: KEY });
  expect(tags()).toContain(listingCacheTag(LID));
  expect(tags().filter((t) => t === SEARCH_CACHE_TAG)).toHaveLength(1);
});

it("MATERIALLY UNCHANGED media suppresses, still settles and advances", async () => {
  mockFindFirst.mockResolvedValue({
    media: [{ url: `${BASE}/Media/same.jpg`, mediaType: "Photo", order: 1 }],
  });
  wireMedia({ kind: "complete", mediaKey: "same" });
  const res = await run();

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(res.write_paths.batch_media.rows_suppressed_unchanged).toBe(1);
  expect(res.run_status).toBe("ok");
  expect(persisted()!.mt.mode).toBe("keyset");
});

it("an AUTHORITATIVE empty gallery clears stale media and advances", async () => {
  wireMedia({ kind: "empty" });
  const res = await run();

  expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  expect((mockUpdateMany.mock.calls[0][0] as { data: { media: unknown[] } }).data.media).toEqual([]);
  expect(res.run_status).toBe("ok");
  expect(persisted()!.pct.mode).toBe("keyset");
  expect(tags()).toContain(listingCacheTag(LID));
});

// ── Feed incompleteness blocks the cursor ─────────────────────────────────

describe.each([
  ["structured incomplete response", { kind: "incomplete_http" } as MediaMode],
  ["later-page failure", { kind: "later_page_fail" } as MediaMode],
  ["thrown media fetch", { kind: "throw" } as MediaMode],
])("%s", (_label, mode) => {
  it("preserves stored media, blocks both cursors and reports partial", async () => {
    wireMedia(mode);
    const res = await run();

    expect(mockUpdateMany).not.toHaveBeenCalled();      // stored media preserved
    expect(res.write_paths.batch_media.rows_updated).toBe(0);
    expect(res.run_status).toBe("partial");
    expect(res.legacy_media_batches?.batches_incomplete).toBe(1);
    const c = persisted()!;
    expect(c.mt.mode).toBe("bootstrap");                 // cursor stopped before it
    expect(c.pct.mode).toBe("bootstrap");
    expect(c.basis).toBe("mt_pct_keyset_bootstrap_v1");
  });
});

it("a TOKEN/setup failure blocks the affected media listings", async () => {
  mockGetAccessToken.mockRejectedValue(new Error("401 unauthorized"));
  wireMedia({ kind: "complete", mediaKey: "n" });
  const res = await run();

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(res.run_status).toBe("partial");
  expect(persisted()!.mt.mode).toBe("bootstrap");
});

// ── Database reconciliation failures block the cursor ─────────────────────

describe.each([
  ["a thrown media write", "throw" as const],
  ["updateMany.count === 0", 0],
  ["updateMany.count > 1", 2],
])("%s", (_label, outcome) => {
  it("blocks the cursor, counts the failure and emits no media tag", async () => {
    if (outcome === "throw") mockUpdateMany.mockRejectedValue(new Error("deadlock detected"));
    else mockUpdateMany.mockResolvedValue({ count: outcome });
    wireMedia({ kind: "complete", mediaKey: "new1" });

    const res = await run();

    expect(res.write_paths.batch_media.rows_updated).toBe(0);
    expect(res.legacy_media_batches?.listings_write_failed).toBe(1);
    expect(res.run_status).toBe("partial");
    const c = persisted()!;
    expect(c.mt.mode).toBe("bootstrap");
    expect(c.pct.mode).toBe("bootstrap");
    expect(tags()).not.toContain(listingCacheTag(LID));
  });
});

// ── A listing shared by BOTH streams ──────────────────────────────────────

it("a shared listing's media failure blocks BOTH stream cursors", async () => {
  mockUpdateMany.mockResolvedValue({ count: 0 });
  wireMedia({ kind: "complete", mediaKey: "new1" });
  const res = await run();

  const c = persisted()!;
  expect(c.mt.mode).toBe("bootstrap");
  expect(c.pct.mode).toBe("bootstrap");
  expect(res.run_status).toBe("partial");
});

it("a shared listing succeeding advances EACH stream on its own timestamp", async () => {
  // The MT and PCT responses carry different clocks for the same listing; each
  // cursor must use its own stream's value, not the merged representation's.
  mockFetchFromTrestle.mockImplementation(async (opts: Record<string, unknown>) => {
    const isMt = String(opts.orderby).startsWith("ModificationTimestamp");
    return {
      records: [record(isMt
        ? { ModificationTimestamp: "2026-07-09T00:00:00Z", PhotosChangeTimestamp: "2026-07-05T00:00:00Z" }
        : { ModificationTimestamp: "2026-07-10T00:00:00Z", PhotosChangeTimestamp: "2026-07-11T00:00:00Z" })],
      totalFetched: 1,
    };
  });
  wireMedia({ kind: "complete", mediaKey: "new1" });

  const res = await run();

  expect(mockUpdateMany).toHaveBeenCalledTimes(1); // media reconciled ONCE, not per stream
  const c = persisted()!;
  expect(c.mt).toEqual({ mode: "keyset", timestamp: "2026-07-09T00:00:00.000Z", listingKey: KEY });
  expect(c.pct).toEqual({ mode: "keyset", timestamp: "2026-07-11T00:00:00.000Z", listingKey: KEY });
  expect(res.run_status).toBe("ok");
});
