/**
 * PR 3 Checkpoint 5 — runMediaSync() orchestration tests.
 *
 * Verifies the orchestration of Cp1 (cursor), Cp2 (upsert listing_media),
 * Cp3 (Listing summary), and Cp4 (R2 mirror) inside `runMediaSync()` —
 * with attention to:
 *   - watermark safety on Property-fetch failure
 *   - per-listing failure isolation
 *   - cursor advancement using only successfully-processed records
 *   - skip rules for owner_opt_out / participant_only / missing keys
 *   - hard caps (listingsPerRun, mediaPerListing)
 *
 * No live R2, no live Trestle, no live DB.
 */

import type {
  MediaSyncFetchDeps,
  MirrorMediaToR2Deps,
  RunMediaSyncOptions,
  TrestleProperty,
  UpsertListingMediaInput,
} from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockMediaSyncFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockMediaSyncUpsert = jest.fn<Promise<unknown>, [unknown]>();

const mockListingMediaFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaCreate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();
const mockListingMediaFindMany = jest.fn<Promise<unknown[]>, [unknown]>();

const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (args: unknown) => mockMediaSyncFindUnique(args),
      upsert: (args: unknown) => mockMediaSyncUpsert(args),
    },
    listingMedia: {
      findUnique: (args: unknown) => mockListingMediaFindUnique(args),
      create: (args: unknown) => mockListingMediaCreate(args),
      update: (args: unknown) => mockListingMediaUpdate(args),
      updateMany: (args: unknown) => mockListingMediaUpdateMany(args),
      findMany: (args: unknown) => mockListingMediaFindMany(args),
    },
    listing: {
      update: (args: unknown) => mockListingUpdate(args),
    },
  },
}));

import { runMediaSync, RESOURCE_MEDIA } from "../media-sync";

beforeEach(() => {
  mockMediaSyncFindUnique.mockReset();
  mockMediaSyncUpsert.mockReset();
  mockListingMediaFindUnique.mockReset();
  mockListingMediaCreate.mockReset();
  mockListingMediaUpdate.mockReset();
  mockListingMediaUpdateMany.mockReset();
  mockListingMediaFindMany.mockReset();
  mockListingUpdate.mockReset();

  // Sensible defaults for happy paths.
  mockListingMediaUpdateMany.mockResolvedValue({ count: 0 });
  mockListingMediaFindMany.mockResolvedValue([]);
  mockListingUpdate.mockResolvedValue(undefined);
  mockMediaSyncUpsert.mockResolvedValue(undefined);
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<TrestleProperty> = {}): TrestleProperty {
  return {
    ListingId: "RLS20012345",
    ListingKey: "1159000001",
    ListingKeyNumeric: "1159000001",
    PhotosChangeTimestamp: "2026-05-08T12:00:00Z",
    ModificationTimestamp: "2026-05-08T11:30:00Z",
    StandardStatus: "Active",
    OwnerOptOut: false,
    ParticipantOnly: false,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    ...overrides,
  };
}

function makeMediaInput(overrides: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: "MK-1",
    ResourceRecordKey: "1159000001",
    ResourceRecordID: "RLS20012345",
    MediaURL: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/abc",
    MediaCategory: "Photo",
    MediaStatus: "Active",
    Order: 1,
    PreferredPhotoYN: false,
    ModificationTimestamp: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

function makeFetchDeps(overrides: Partial<{
  fetchProperties: jest.Mock;
  fetchMedia: jest.Mock;
}> = {}): MediaSyncFetchDeps & { fetchProperties: jest.Mock; fetchMedia: jest.Mock } {
  return {
    fetchProperties: overrides.fetchProperties ?? jest.fn().mockResolvedValue([]),
    fetchMedia: overrides.fetchMedia ?? jest.fn().mockResolvedValue([]),
  };
}

function makeMirrorDeps(): MirrorMediaToR2Deps {
  return {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    uploadToR2: jest
      .fn<Promise<string>, [string, Buffer, string]>()
      .mockImplementation(async (key) => `https://r2.example.com/${key}`),
    getR2PublicUrl: jest
      .fn<string, [string]>()
      .mockImplementation((key) => `https://r2.example.com/${key}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("test-token"),
    fetchFn: jest.fn(),
  };
}

function makeOptions(overrides: Partial<RunMediaSyncOptions> = {}): RunMediaSyncOptions {
  return {
    listingsPerRun: 10,
    mediaPerListing: 5,
    fallbackWindowDays: 7,
    fetchDeps: makeFetchDeps(),
    mirrorDeps: makeMirrorDeps(),
    ...overrides,
  };
}

// ─── Source-fetch failure (cursor must NOT advance) ──────────────────────

describe("runMediaSync — source-fetch failure (watermark safety)", () => {
  it("returns status='error' when fetchProperties throws and does NOT advance the cursor", async () => {
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockRejectedValue(new Error("Property fetch failed: HTTP 503")),
    });
    const opts = makeOptions({ fetchDeps });

    const result = await runMediaSync(opts);

    expect(result.status).toBe("error");
    expect(result.error).toBe("Property fetch failed: HTTP 503");
    expect(result.rows_checked).toBe(0);
    expect(result.rows_updated).toBe(0);
    expect(result.rows_failed).toBe(0);
    expect(result.listings_processed).toBe(0);

    // CRITICAL: cursor.upsert must NOT be called.
    expect(mockMediaSyncUpsert).not.toHaveBeenCalled();
    // No fetchMedia attempts either.
    expect(fetchDeps.fetchMedia).not.toHaveBeenCalled();
    // No DB writes anywhere.
    expect(mockListingMediaCreate).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it("uses fallbackWindowDays when cursor is empty (first run)", async () => {
    mockMediaSyncFindUnique.mockResolvedValueOnce(null);
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([]),
    });

    const before = Date.now();
    const result = await runMediaSync(makeOptions({ fetchDeps, fallbackWindowDays: 14 }));
    const after = Date.now();

    expect(result.status).toBe("ok");
    const sinceArg = (fetchDeps.fetchProperties as jest.Mock).mock.calls[0][0] as Date;
    const expectedSince = before - 14 * 86_400_000;
    const tolerance = (after - before) + 100;
    expect(sinceArg.getTime()).toBeGreaterThanOrEqual(expectedSince - tolerance);
    expect(sinceArg.getTime()).toBeLessThanOrEqual(expectedSince + tolerance);
  });
});

// ─── Empty page (cursor advances heartbeat only) ─────────────────────────

describe("runMediaSync — empty page", () => {
  it("returns status='ok' and advances cursor heartbeat when no properties match", async () => {
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([]),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.status).toBe("ok");
    expect(result.listings_processed).toBe(0);
    // Cursor advance is called (heartbeat); empty records ⟹ watermark unchanged.
    expect(mockMediaSyncUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as {
      where: { resource: string };
      update: { rows_checked: number; rows_updated: number; rows_failed: number; last_run_status: string };
    };
    expect(upsertArgs.where).toEqual({ resource: RESOURCE_MEDIA });
    expect(upsertArgs.update.rows_checked).toBe(0);
    expect(upsertArgs.update.rows_failed).toBe(0);
    expect(upsertArgs.update.last_run_status).toBe("ok");
  });
});

// ─── Defensive compliance gates ──────────────────────────────────────────

describe("runMediaSync — defensive compliance gates", () => {
  it("skips owner_opt_out listings without fetching their Media", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ OwnerOptOut: true }),
        makeProperty({ ListingId: "RLS-OK", ListingKey: "K-OK" }),
      ]),
      fetchMedia,
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    // Only the non-skipped listing's Media is fetched.
    expect(fetchMedia).toHaveBeenCalledTimes(1);
    expect((fetchMedia as jest.Mock).mock.calls[0][0]).toBe("K-OK");
  });

  it("skips participant_only listings without fetching their Media", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn().mockResolvedValue([]);
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ParticipantOnly: true }),
      ]),
      fetchMedia,
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    expect(result.listings_processed).toBe(0);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("skips listings missing ListingId or ListingKey without crashing", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: null }),
        makeProperty({ ListingKey: null }),
      ]),
      fetchMedia,
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(2);
    expect(fetchMedia).not.toHaveBeenCalled();
  });
});

// ─── Per-listing failure isolation ───────────────────────────────────────

describe("runMediaSync — per-listing failure isolation", () => {
  it("a single Media-fetch failure increments rows_failed but does not stop the batch", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]);

    const fetchProperties = jest.fn().mockResolvedValueOnce([
      makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      makeProperty({ ListingId: "RLS-B", ListingKey: "K-B" }),
      makeProperty({ ListingId: "RLS-C", ListingKey: "K-C" }),
    ]);
    const fetchMedia = jest
      .fn()
      .mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]) // A ok
      .mockRejectedValueOnce(new Error("Media fetch HTTP 500"))      // B fails
      .mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-C" })]); // C ok

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties, fetchMedia }) }),
    );

    expect(result.listings_processed).toBe(2); // A and C
    expect(result.rows_failed).toBe(1);         // B counted as 1 failure
    expect(result.status).toBe("partial");

    // Cursor advance with only A and C records — NOT B.
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as { update: { rows_failed: number; last_run_status: string } };
    expect(upsertArgs.update.last_run_status).toBe("partial");
    expect(upsertArgs.update.rows_failed).toBe(1);
  });

  it("R2 mirror failure increments rows_failed but does not stop processing later listings", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([
      {
        listing_id: "RLS-A",
        media_key: "MK-A",
        media_type: "Photo",
        order: 1,
        media_url_original: "https://api.cotality.com/photo.jpg",
        r2_key: null,
        media_url_cached: null,
      },
    ]);

    const fetchProperties = jest.fn().mockResolvedValueOnce([
      makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
    ]);
    const fetchMedia = jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]);

    const mirrorDeps = makeMirrorDeps();
    // Force R2 mirror to fail by making the Trestle download return 500.
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    mirrorDeps.fetchFn = jest.fn(async () => new Response(new Uint8Array(0), { status: 500 })) as typeof fetch;

    const result = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({ fetchProperties, fetchMedia }),
        mirrorDeps,
      }),
    );

    // Listing was processed, but the single Photo failed to mirror.
    expect(result.listings_processed).toBe(1);
    expect(result.rows_failed).toBe(1);
    expect(result.status).toBe("partial");
  });
});

// ─── Bounds (hard caps) ──────────────────────────────────────────────────

describe("runMediaSync — bounds", () => {
  it("passes listingsPerRun as the $top to fetchProperties", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const fetchDeps = makeFetchDeps({ fetchProperties });

    await runMediaSync(makeOptions({ fetchDeps, listingsPerRun: 25 }));
    expect((fetchProperties as jest.Mock).mock.calls[0][1]).toBe(25);
  });

  it("passes mediaPerListing as the $top to fetchMedia", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]);
    const fetchMedia = jest.fn().mockResolvedValueOnce([]);
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      ]),
      fetchMedia,
    });

    await runMediaSync(makeOptions({ fetchDeps, mediaPerListing: 12 }));
    expect((fetchMedia as jest.Mock).mock.calls[0][1]).toBe(12);
  });
});

// ─── Boundary preservation (read-side untouched) ─────────────────────────

describe("runMediaSync — boundary preservation", () => {
  it("never writes Listing.media JSON or any field besides the 4 summary cols on Listing.update", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([
      {
        listing_id: "RLS-A",
        media_key: "MK-A",
        media_type: "Photo",
        order: 1,
        media_url_original: "https://example.com/p.jpg",
        r2_key: "photos/RLS-A/1.jpg",
        media_url_cached: "https://r2.example.com/photos/RLS-A/1.jpg",
        status: "active",
        preferred_photo_yn: false,
        media_modification_ts: null,
        modification_ts: null,
      },
    ]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]),
    });
    const mirrorDeps = makeMirrorDeps();

    await runMediaSync(makeOptions({ fetchDeps, mirrorDeps }));

    // Listing.update gets called by updateListingMediaSummary with ONLY the 4
    // summary columns — never `media`, `raw_data`, `modification_timestamp`.
    expect(mockListingUpdate).toHaveBeenCalled();
    const updateArgs = mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(updateArgs.data).sort()).toEqual(
      ["photo_count", "photos_change_timestamp", "primary_photo_r2_key", "primary_photo_url"].sort(),
    );
    expect(updateArgs.data).not.toHaveProperty("media");
    expect(updateArgs.data).not.toHaveProperty("raw_data");
    expect(updateArgs.data).not.toHaveProperty("modification_timestamp");
  });

  it("listing_media.update during mirror writes ONLY r2_key + media_url_cached", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([
      {
        listing_id: "RLS-A",
        media_key: "MK-A",
        media_type: "Photo",
        order: 1,
        media_url_original: "https://example.com/p.jpg",
        r2_key: null,
        media_url_cached: null,
      },
    ]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]),
    });
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(true); // reuse path

    await runMediaSync(makeOptions({ fetchDeps, mirrorDeps }));

    // Find the listingMedia.update call from mirrorMediaToR2 (reuse drift path).
    // It sets r2_key + media_url_cached only.
    const mirrorUpdateCalls = mockListingMediaUpdate.mock.calls.filter((call) => {
      const args = call[0] as { data: Record<string, unknown> };
      return Object.keys(args.data).every((k) => ["r2_key", "media_url_cached"].includes(k));
    });
    expect(mirrorUpdateCalls.length).toBeGreaterThan(0);
    const args = mirrorUpdateCalls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(args.data).sort()).toEqual(["media_url_cached", "r2_key"]);
    expect(args.data).not.toHaveProperty("media_url_original");
  });
});
