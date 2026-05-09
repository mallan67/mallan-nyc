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

import {
  buildPropertyQuery,
  isPropertyComplianceBlocked,
  runMediaSync,
  RESOURCE_MEDIA,
} from "../media-sync";

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
    Permission: null,
    Permissions: null,
    MlsStatus: "Active",
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
  it("skips owner_opt_out listings (Permission='OwnerOptOut') without fetching their Media", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ Permission: "OwnerOptOut" }),
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

  it("skips participant_only listings (Permission='Private') without fetching their Media", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn().mockResolvedValue([]);
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ Permission: "Private" }),
      ]),
      fetchMedia,
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    expect(result.listings_processed).toBe(0);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("skips owner_opt_out via legacy plural Permissions enum without fetching Media", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ Permissions: "OwnerOptOut" }),
      ]),
      fetchMedia,
    });
    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("skips owner_opt_out via 'Owner Opt-Out' alternate spelling", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ Permission: "Owner Opt-Out" }),
      ]),
      fetchMedia,
    });
    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("skips owner_opt_out via MlsStatus='OwnerOptOut'", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ MlsStatus: "OwnerOptOut" }),
      ]),
      fetchMedia,
    });
    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("skips when InternetEntireListingDisplayYN === false (master gate)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchMedia = jest.fn();
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ InternetEntireListingDisplayYN: false }),
      ]),
      fetchMedia,
    });
    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(1);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("does NOT skip when InternetEntireListingDisplayYN is null (provider-gated, treat as displayable)", async () => {
    // Mirrors `lib/idx/trestle-mapper.ts:706` which uses `!== false` so null
    // and undefined remain displayable on the IDX Plus feed.
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]);
    const fetchMedia = jest.fn().mockResolvedValue([]);
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ InternetEntireListingDisplayYN: null }),
      ]),
      fetchMedia,
    });
    const result = await runMediaSync(makeOptions({ fetchDeps }));
    expect(result.listings_skipped).toBe(0);
    expect(fetchMedia).toHaveBeenCalledTimes(1);
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

// ─── Review comment 1 — tombstoneVanished safety with capped fetch ───────

describe("runMediaSync — tombstoneVanished is forced false (capped fetch safety)", () => {
  it("does NOT tombstone DB rows that are absent from a capped Media response", async () => {
    // Listing has 5 active rows in DB; capped fetch returns only 2. The 3
    // "missing" rows must NOT be soft-deleted because the input is not proven
    // complete (review comment 1).
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaUpdate.mockResolvedValue(undefined);
    // Existing DB state — 5 active rows for the listing.
    mockListingMediaFindMany.mockResolvedValue([
      { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-C", media_type: "Photo", order: 3, media_url_original: "u3", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-D", media_type: "Photo", order: 4, media_url_original: "u4", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-E", media_type: "Photo", order: 5, media_url_original: "u5", r2_key: null, media_url_cached: null },
    ]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      ]),
      // Capped fetch returns ONLY MK-A and MK-B — MK-C/D/E are not present
      // in the response (they are simply beyond the page, not deleted).
      fetchMedia: jest
        .fn()
        .mockResolvedValueOnce([
          makeMediaInput({ MediaKey: "MK-A" }),
          makeMediaInput({ MediaKey: "MK-B" }),
        ]),
    });

    await runMediaSync(makeOptions({ fetchDeps, mediaPerListing: 2 }));

    // No tombstoning updateMany call with the vanished-rows pattern
    // (`media_key: { notIn: [...] }` — used ONLY when tombstoneVanished is true).
    const tombstoneCalls = mockListingMediaUpdateMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { media_key?: { notIn?: unknown[] } } };
      return args?.where?.media_key && "notIn" in args.where.media_key;
    });
    expect(tombstoneCalls).toHaveLength(0);
  });

  it("explicit MediaStatus='Deleted' rows are still tombstoned by Cp2 regardless of tombstoneVanished", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaUpdate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      ]),
      // Mixed batch: MK-A active + MK-X is an explicit Trestle delete.
      fetchMedia: jest.fn().mockResolvedValueOnce([
        makeMediaInput({ MediaKey: "MK-A" }),
        makeMediaInput({ MediaKey: "MK-X", MediaStatus: "Deleted" }),
      ]),
    });

    await runMediaSync(makeOptions({ fetchDeps }));

    // Cp2's explicit-delete path uses `media_key: { in: [...] }` — separate
    // from the vanished-rows path. MK-X must be in that list.
    const explicitDeleteCalls = mockListingMediaUpdateMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { media_key?: { in?: string[] } }; data?: { status?: string } };
      return args?.where?.media_key && "in" in (args.where.media_key as object) && args.data?.status === "deleted";
    });
    expect(explicitDeleteCalls).toHaveLength(1);
    const where = explicitDeleteCalls[0][0] as { where: { media_key: { in: string[] } } };
    expect(where.where.media_key.in).toContain("MK-X");
    expect(where.where.media_key.in).not.toContain("MK-A");
  });
});

// ─── Review comment 2 — boundary timestamp safety (cursor uses ge) ───────

describe("runMediaSync — boundary timestamp safety", () => {
  it("passes the cursor's last_photos_change directly to fetchProperties (ge semantics live in buildPropertyQuery)", async () => {
    const cursorTs = new Date("2026-05-01T12:00:00.000Z");
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: cursorTs,
      last_media_modified: null,
    });
    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const fetchDeps = makeFetchDeps({ fetchProperties });

    await runMediaSync(makeOptions({ fetchDeps }));

    const sinceArg = (fetchProperties as jest.Mock).mock.calls[0][0] as Date;
    // Orchestrator does NOT subtract overlap; the ge filter in buildPropertyQuery
    // re-includes the boundary. Cursor advances only with successfully-processed
    // records, so re-fetching the boundary on the next run is safe and idempotent.
    expect(sinceArg.toISOString()).toBe(cursorTs.toISOString());
  });

  it("re-processing the same boundary listing across two runs is idempotent at the upsert layer", async () => {
    // Run 1: process listing-A at PCT=T1 → cursor advances to T1.
    // Run 2: ge T1 returns listing-A again → upsert is keyed on media_key,
    // produces no inserts, only updates with identical content.
    const T1 = "2026-05-08T12:00:00.000Z";

    // First run — listing inserted as new.
    mockMediaSyncFindUnique.mockResolvedValueOnce(null);
    mockListingMediaFindUnique.mockResolvedValueOnce(null); // create path
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]);

    const propertyA = makeProperty({
      ListingId: "RLS-A",
      ListingKey: "K-A",
      PhotosChangeTimestamp: T1,
    });
    const mediaA = [makeMediaInput({ MediaKey: "MK-A", ModificationTimestamp: T1 })];

    const result1 = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({
          fetchProperties: jest.fn().mockResolvedValueOnce([propertyA]),
          fetchMedia: jest.fn().mockResolvedValueOnce(mediaA),
        }),
      }),
    );
    expect(result1.status).toBe("ok");
    expect(result1.listings_processed).toBe(1);
    const insertCount1 = mockListingMediaCreate.mock.calls.length;

    // Reset call counts (cursor and DB state simulated for run 2).
    mockListingMediaCreate.mockClear();
    mockListingMediaUpdate.mockClear();
    mockMediaSyncFindUnique.mockReset();
    mockListingMediaFindUnique.mockReset();

    // Second run — cursor at T1, ge T1 returns same listing-A. Now the row exists.
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date(T1),
      last_media_modified: new Date(T1),
    });
    mockListingMediaFindUnique.mockResolvedValueOnce({ id: "row-1", listing_id: "RLS-A" });
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const result2 = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({
          fetchProperties: jest.fn().mockResolvedValueOnce([propertyA]),
          fetchMedia: jest.fn().mockResolvedValueOnce(mediaA),
        }),
      }),
    );
    expect(result2.status).toBe("ok");
    expect(result2.listings_processed).toBe(1);

    // Run 1 created a new row; run 2 updates the existing row — no duplicate insert.
    expect(insertCount1).toBe(1);
    expect(mockListingMediaCreate).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─── Review comment 3 — buildPropertyQuery ($select + $filter + $orderby) ─

describe("buildPropertyQuery", () => {
  it("$select includes the canonical Trestle compliance fields Permission (singular) and MlsStatus", () => {
    const params = buildPropertyQuery(new Date("2026-05-01T00:00:00Z"), 50);
    const select = params.get("$select") || "";
    const fields = select.split(",");
    expect(fields).toContain("Permission");
    expect(fields).toContain("MlsStatus");
    expect(fields).toContain("InternetEntireListingDisplayYN");
    // Sanity — ListingKey + PhotosChangeTimestamp still selected.
    expect(fields).toContain("ListingKey");
    expect(fields).toContain("PhotosChangeTimestamp");
  });

  it("$select does NOT include Permissions (plural) — Trestle returns HTTP 400 for that field", () => {
    // Regression guard for the 2026-05-09T07:00:25Z first-firing failure.
    // `Permissions` (plural) does not exist on the Trestle IDX Plus Property
    // resource — including it in $select causes HTTP 400. The runtime fallback
    // in `isPropertyComplianceBlocked()` to read `property.Permissions` is
    // harmless on this feed (always reads undefined) and stays for legacy-feed
    // defense, but $select MUST request only `Permission` (singular).
    const params = buildPropertyQuery(new Date("2026-05-01T00:00:00Z"), 50);
    const select = params.get("$select") || "";
    const fields = select.split(",");
    expect(fields).not.toContain("Permissions");
  });

  it("$filter uses 'ge' (not 'gt') on PhotosChangeTimestamp to preserve boundary rows", () => {
    const params = buildPropertyQuery(new Date("2026-05-01T00:00:00Z"), 50);
    const filter = params.get("$filter") || "";
    expect(filter).toMatch(/PhotosChangeTimestamp ge /);
    expect(filter).not.toMatch(/PhotosChangeTimestamp gt /);
  });

  it("$orderby includes ListingKey as a stable tie-breaker", () => {
    const params = buildPropertyQuery(new Date("2026-05-01T00:00:00Z"), 50);
    expect(params.get("$orderby")).toBe("PhotosChangeTimestamp asc,ListingKey asc");
  });

  it("$top reflects the requested page size", () => {
    const params = buildPropertyQuery(new Date("2026-05-01T00:00:00Z"), 25);
    expect(params.get("$top")).toBe("25");
  });
});

// ─── Review comment 3 — isPropertyComplianceBlocked unit tests ───────────

describe("isPropertyComplianceBlocked", () => {
  it("returns false for a clean active listing", () => {
    expect(isPropertyComplianceBlocked(makeProperty())).toBe(false);
  });

  it("returns true for Permission='OwnerOptOut'", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ Permission: "OwnerOptOut" }))).toBe(true);
  });

  it("returns true for Permission='Owner Opt-Out' (alternate spelling)", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ Permission: "Owner Opt-Out" }))).toBe(true);
  });

  it("returns true for Permissions='OwnerOptOut' (legacy plural)", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ Permissions: "OwnerOptOut" }))).toBe(true);
  });

  it("returns true for Permission='Private' (participant-only)", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ Permission: "Private" }))).toBe(true);
  });

  it("returns true for MlsStatus='OwnerOptOut'", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ MlsStatus: "OwnerOptOut" }))).toBe(true);
  });

  it("returns true for InternetEntireListingDisplayYN === false", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ InternetEntireListingDisplayYN: false }))).toBe(true);
  });

  it("returns false for InternetEntireListingDisplayYN === null (provider-gated)", () => {
    expect(isPropertyComplianceBlocked(makeProperty({ InternetEntireListingDisplayYN: null }))).toBe(false);
  });
});
