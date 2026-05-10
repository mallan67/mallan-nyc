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
const mockListingMediaCount = jest.fn<Promise<number>, [unknown]>();

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
      count: (args: unknown) => mockListingMediaCount(args),
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
  mockListingMediaCount.mockReset();
  mockListingUpdate.mockReset();

  // Sensible defaults for happy paths.
  mockListingMediaUpdateMany.mockResolvedValue({ count: 0 });
  mockListingMediaFindMany.mockResolvedValue([]);
  mockListingMediaCount.mockResolvedValue(0);
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
    expect(result.exit_reason).toBe("source_error");
    expect(result.error).toBe("Property fetch failed: HTTP 503");
    expect(result.rows_checked).toBe(0);
    expect(result.rows_updated).toBe(0);
    expect(result.rows_failed).toBe(0);
    expect(result.listings_processed).toBe(0);
    expect(result.r2_mirrored).toBe(0);
    expect(result.r2_failed).toBe(0);
    expect(result.backlog_remaining).toBeNull();

    // CRITICAL: cursor.upsert must NOT be called — no Phase 2 on source error.
    expect(mockMediaSyncUpsert).not.toHaveBeenCalled();
    // No fetchMedia attempts either.
    expect(fetchDeps.fetchMedia).not.toHaveBeenCalled();
    // No DB writes anywhere.
    expect(mockListingMediaCreate).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
    expect(mockListingUpdate).not.toHaveBeenCalled();
    // No Phase 3 backlog query either.
    expect(mockListingMediaFindMany).not.toHaveBeenCalled();
    expect(mockListingMediaCount).not.toHaveBeenCalled();
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

  it("R2 mirror failure increments r2_failed (NOT rows_failed) and does not block source cursor", async () => {
    // New phased semantics:
    //   - Phase 1 source ingest succeeds for the listing → rows_failed stays 0
    //   - Phase 2 cursor advances for the listing
    //   - Phase 3 R2 mirror fails (Trestle returns 500) → r2_failed=1
    //   - status='partial' because r2_failed > 0
    //   - The listing's cursor advance is NOT undone — it stays in cursorRecords.
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    // findMany is called twice: (1) inside Phase 1's updateListingMediaSummary
    // for the listing's rows, and (2) by Phase 3's backlog query. Both need
    // the row; subsequent Phase 3 iterations get empty so the while-loop ends.
    const row = {
      listing_id: "RLS-A",
      media_key: "MK-A",
      media_type: "Photo",
      order: 1,
      media_url_original: "https://api.cotality.com/photo.jpg",
      r2_key: null,
      media_url_cached: null,
    };
    mockListingMediaFindMany
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([row])
      .mockResolvedValue([]);

    const fetchProperties = jest.fn().mockResolvedValueOnce([
      makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
    ]);
    const fetchMedia = jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]);

    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    mirrorDeps.fetchFn = jest.fn(async () => new Response(new Uint8Array(0), { status: 500 })) as typeof fetch;

    const result = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({ fetchProperties, fetchMedia }),
        mirrorDeps,
      }),
    );

    // Phase 1 ingest succeeded — listing was fully processed.
    expect(result.listings_processed).toBe(1);
    // R2 failure is bucketed separately from source rows_failed.
    expect(result.rows_failed).toBe(0);
    expect(result.r2_failed).toBe(1);
    // Final status is partial because of Phase 3 R2 failure.
    expect(result.status).toBe("partial");
    // Phase 2 advanced cursor (with the listing in records).
    expect(mockMediaSyncUpsert).toHaveBeenCalled();
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
    // First findMany call: this listing's read inside updateListingMediaSummary
    // (Phase 1). Subsequent calls (Phase 3 backlog while-loop): empty.
    mockListingMediaFindMany
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValue([]);

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
    // Phase 1 calls findMany inside updateListingMediaSummary; Phase 3 calls
    // findMany for the backlog. First call returns the row (so summary + Phase
    // 3 mirror operate on it); subsequent calls return empty so Phase 3
    // terminates after one mirror batch.
    mockListingMediaFindMany
      .mockResolvedValueOnce([
        {
          listing_id: "RLS-A",
          media_key: "MK-A",
          media_type: "Photo",
          order: 1,
          media_url_original: "https://example.com/p.jpg",
          r2_key: null,
          media_url_cached: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          listing_id: "RLS-A",
          media_key: "MK-A",
          media_type: "Photo",
          order: 1,
          media_url_original: "https://example.com/p.jpg",
          r2_key: null,
          media_url_cached: null,
        },
      ])
      .mockResolvedValue([]);

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
    // Post 2026-05-10 cooldown change: success-path update writes
    // r2_key + media_url_cached + r2_last_attempt_at (null) + r2_attempts (0).
    const mirrorUpdateCalls = mockListingMediaUpdate.mock.calls.filter((call) => {
      const args = call[0] as { data: Record<string, unknown> };
      return Object.keys(args.data).every((k) =>
        ["r2_key", "media_url_cached", "r2_last_attempt_at", "r2_attempts"].includes(k),
      );
    });
    expect(mirrorUpdateCalls.length).toBeGreaterThan(0);
    const args = mirrorUpdateCalls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(args.data).sort()).toEqual(
      ["media_url_cached", "r2_attempts", "r2_key", "r2_last_attempt_at"],
    );
    // Boundary preservation — never overwrite the immutable source URL.
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
    // Existing DB state — 5 active rows for the listing. First call serves
    // Phase 1's summary read; subsequent calls (Phase 3 backlog while-loop)
    // return empty so Phase 3 doesn't iterate (this test focuses on Phase 1
    // tombstone semantics, not Phase 3 mirror behavior).
    mockListingMediaFindMany
      .mockResolvedValueOnce([
        { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
        { listing_id: "RLS-A", media_key: "MK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null },
        { listing_id: "RLS-A", media_key: "MK-C", media_type: "Photo", order: 3, media_url_original: "u3", r2_key: null, media_url_cached: null },
        { listing_id: "RLS-A", media_key: "MK-D", media_type: "Photo", order: 4, media_url_original: "u4", r2_key: null, media_url_cached: null },
        { listing_id: "RLS-A", media_key: "MK-E", media_type: "Photo", order: 5, media_url_original: "u5", r2_key: null, media_url_cached: null },
      ])
      .mockResolvedValue([]);

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

// ─── Phased architecture — durability + R2 throughput (root fix) ─────────

/**
 * Inject a deterministic clock so tests can exercise time-budget paths
 * without real timers. `nowAt(...)` returns a `now` function that walks
 * through the supplied timestamps in order.
 */
function nowAt(...timestamps: number[]): () => number {
  let i = 0;
  return () => {
    const t = timestamps[Math.min(i, timestamps.length - 1)];
    i++;
    return t;
  };
}

describe("runMediaSync — Phase 2 cursor advances independently of Phase 3 R2", () => {
  it("ingests N listings in Phase 1 and advances cursor before any R2 work in Phase 3", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]); // no Phase 1 summary rows; no Phase 3 backlog

    const fetchProperties = jest.fn().mockResolvedValueOnce([
      makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      makeProperty({ ListingId: "RLS-B", ListingKey: "K-B" }),
      makeProperty({ ListingId: "RLS-C", ListingKey: "K-C" }),
    ]);
    const fetchMedia = jest.fn()
      .mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })])
      .mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-B" })])
      .mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-C" })]);

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties, fetchMedia }) }),
    );

    expect(result.status).toBe("ok");
    expect(result.exit_reason).toBe("completed");
    expect(result.listings_processed).toBe(3);
    // Phase 2: cursor advance happened with all 3 records.
    expect(mockMediaSyncUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockMediaSyncUpsert.mock.calls[0][0] as {
      where: { resource: string };
      update: { rows_checked: number; last_run_status: string };
    };
    expect(upsertArg.where).toEqual({ resource: RESOURCE_MEDIA });
    expect(upsertArg.update.last_run_status).toBe("ok");
  });

  it("source-fetch failure does NOT call Phase 2 cursor advance", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchProperties = jest.fn().mockRejectedValue(new Error("Property fetch failed: HTTP 400"));

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }) }),
    );

    expect(result.status).toBe("error");
    expect(result.exit_reason).toBe("source_error");
    expect(mockMediaSyncUpsert).not.toHaveBeenCalled();
    expect(mockListingMediaCount).not.toHaveBeenCalled();
  });

  it("summary-update failure (NEW: fail-loud) increments rows_failed and does NOT add cursor record", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    // First findMany call (inside updateListingMediaSummary) rejects → throws
    // up to the per-listing try/catch → rows_failed++ and NO cursorRecord.
    mockListingMediaFindMany.mockRejectedValueOnce(new Error("DB stalled"));
    mockListingMediaFindMany.mockResolvedValue([]);

    const fetchProperties = jest.fn().mockResolvedValueOnce([
      makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
    ]);
    const fetchMedia = jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]);

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties, fetchMedia }) }),
    );

    expect(result.rows_failed).toBe(1);
    expect(result.listings_processed).toBe(0);
    expect(result.status).toBe("partial");
    // Phase 2 still ran with empty cursorRecords (just the heartbeat update).
    expect(mockMediaSyncUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("runMediaSync — Phase 3 R2 enrichment (parallel, concurrency=5)", () => {
  it("queries the backlog with status='active' AND r2_key/media_url_cached null filter, ordered by created_at asc", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]); // Phase 1 has nothing; Phase 3 also empty
    const fetchProperties = jest.fn().mockResolvedValueOnce([]);

    await runMediaSync(makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }) }));

    // At least one findMany call should have been Phase 3's backlog query.
    expect(mockListingMediaFindMany).toHaveBeenCalled();
    const backlogCall = mockListingMediaFindMany.mock.calls.find((call) => {
      const args = call[0] as {
        where?: { status?: string; OR?: Array<{ r2_key?: null; media_url_cached?: null }> };
      };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    expect(backlogCall).toBeDefined();
    const args = backlogCall![0] as {
      where: { status: string; media_url_original?: { not: null }; OR: Array<{ r2_key?: null; media_url_cached?: null }> };
      orderBy: { created_at: string };
      take: number;
    };
    expect(args.where.status).toBe("active");
    expect(args.where.media_url_original).toEqual({ not: null });
    // OR clause includes both r2_key=null and media_url_cached=null.
    const orFields = args.where.OR.map((c) => Object.keys(c)[0]).sort();
    expect(orFields).toEqual(["media_url_cached", "r2_key"]);
    expect(args.orderBy).toEqual({ created_at: "asc" });
    expect(args.take).toBe(5); // R2_MIRROR_CONCURRENCY
  });

  it("processes a backlog batch of up to 5 rows in parallel (Promise.allSettled with MAX_CONCURRENT=5)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const backlog = [
      { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-C", media_type: "Photo", order: 3, media_url_original: "u3", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-D", media_type: "Photo", order: 4, media_url_original: "u4", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-A", media_key: "MK-E", media_type: "Photo", order: 5, media_url_original: "u5", r2_key: null, media_url_cached: null },
    ];
    mockListingMediaFindMany
      .mockResolvedValueOnce(backlog)
      .mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]); // no Phase 1 work
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(true); // reuse fast-path

    const result = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({ fetchProperties }),
        mirrorDeps,
      }),
    );

    expect(result.r2_mirrored).toBe(5);
    expect(result.r2_failed).toBe(0);
    // existsInR2 was called for ALL 5 rows (proves the parallel batch processed them).
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(5);
  });

  it("R2 mirror per-row failure increments r2_failed but does NOT throw or stop other rows in the batch", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const backlog = [
      { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-B", media_key: "MK-B", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null },
      { listing_id: "RLS-C", media_key: "MK-C", media_type: "Photo", order: 1, media_url_original: "u3", r2_key: null, media_url_cached: null },
    ];
    mockListingMediaFindMany.mockResolvedValueOnce(backlog).mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps = makeMirrorDeps();
    let n = 0;
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(() => {
      n++;
      // Make the 2nd row's existsInR2 reject — Promise.allSettled isolates it.
      if (n === 2) return Promise.reject(new Error("R2 head error"));
      return Promise.resolve(true);
    });

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    // 1 failure, 2 successful reuses — siblings did not abort.
    expect(result.r2_failed).toBe(1);
    expect(result.r2_mirrored).toBe(2);
    // Source rows_failed is 0 — the R2 failure does not bleed into source counters.
    expect(result.rows_failed).toBe(0);
    expect(result.status).toBe("partial");
  });

  it("Phase 3 picks up backlog rows from prior partial runs (resume semantics)", async () => {
    // Simulates a prior run that left the listing_media table with 3 rows
    // having r2_key=null. This run's Phase 1 has no work (empty source page),
    // but Phase 3 should still drain the leftover backlog.
    mockMediaSyncFindUnique.mockResolvedValue({
      last_photos_change: new Date("2026-05-09T07:30:00Z"),
      last_media_modified: new Date("2026-05-09T07:30:00Z"),
    });
    const backlog = [
      { listing_id: "PRIOR-A", media_key: "PK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
      { listing_id: "PRIOR-A", media_key: "PK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null },
      { listing_id: "PRIOR-A", media_key: "PK-C", media_type: "Photo", order: 3, media_url_original: "u3", r2_key: null, media_url_cached: null },
    ];
    mockListingMediaFindMany.mockResolvedValueOnce(backlog).mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(true); // all reuse

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    expect(result.listings_processed).toBe(0); // no Phase 1 work
    expect(result.r2_mirrored).toBe(3); // Phase 3 drained the prior-run backlog
  });
});

describe("runMediaSync — time-budget exits", () => {
  it("Phase 1 stops when remaining time < phase1ReserveMs and reports exit_reason='budget_phase1'", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]); // no rows; Phase 3 stops immediately

    const fetchProperties = jest.fn().mockResolvedValueOnce([
      makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      makeProperty({ ListingId: "RLS-B", ListingKey: "K-B" }),
      makeProperty({ ListingId: "RLS-C", ListingKey: "K-C" }),
    ]);
    const fetchMedia = jest.fn().mockResolvedValue([makeMediaInput({ MediaKey: "MK-1" })]);

    // Walk: startTime=0, then evaluate budget at each loop entry.
    // budgetMs=1000, phase1ReserveMs=500. After 600ms elapsed (now=600),
    // remainingMs() = 400 < 500 → Phase 1 stops.
    const now = nowAt(0, 0, 100, 200, 600, 700, 800, 900, 1000, 1100);

    const result = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({ fetchProperties, fetchMedia }),
        budgetMs: 1000,
        phase1ReserveMs: 500,
        phase2ReserveMs: 100,
        now,
      }),
    );

    expect(result.exit_reason).toBe("budget_phase1");
    // At least 1 listing processed, but not all 3.
    expect(result.listings_processed).toBeGreaterThanOrEqual(1);
    expect(result.listings_processed).toBeLessThan(3);
    // Phase 2 still advanced cursor for whatever ingested.
    expect(mockMediaSyncUpsert).toHaveBeenCalled();
  });

  it("Phase 3 stops between batches when remaining time < phase2ReserveMs and reports exit_reason='budget_phase2'", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchProperties = jest.fn().mockResolvedValueOnce([]); // no Phase 1 work
    const backlog = [
      { listing_id: "X", media_key: "K1", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
    ];
    mockListingMediaFindMany.mockResolvedValue(backlog); // always returns 1 row
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(true);

    // Walk: budgetMs=1000, phase2ReserveMs=200. By second iteration of the
    // while loop, remainingMs() drops below 200 → Phase 3 stops.
    const now = nowAt(0, 0, 100, 200, 300, 850, 900, 950, 1000, 1100);

    const result = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({ fetchProperties }),
        mirrorDeps,
        budgetMs: 1000,
        phase1ReserveMs: 700, // Phase 1 won't have time anyway, but no Phase 1 work
        phase2ReserveMs: 200,
        now,
      }),
    );

    expect(result.exit_reason).toBe("budget_phase2");
    // At least one batch was processed in Phase 3.
    expect(result.r2_mirrored).toBeGreaterThanOrEqual(1);
  });
});

describe("runMediaSync — backlog_remaining + R2-independent summary", () => {
  it("reports backlog_remaining from a final count after Phase 3", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]); // empty backlog
    mockListingMediaCount.mockResolvedValue(42); // 42 rows still need r2 mirroring

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }) }),
    );

    expect(result.backlog_remaining).toBe(42);
  });

  it("backlog_remaining is null if the count query throws (defensive)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]);
    mockListingMediaCount.mockRejectedValue(new Error("Count failed"));

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }) }),
    );

    expect(result.backlog_remaining).toBeNull();
    // Function still returns cleanly.
    expect(result.status).toBe("ok");
  });

  it("DEFAULT_LISTINGS_PER_RUN is NOT used as the primary fix (kept at 50)", async () => {
    // Regression guard: this fix must address durability + throughput WITHOUT
    // lowering the per-run cap as the load-bearing change.
    const { DEFAULT_LISTINGS_PER_RUN } = await import("../media-sync");
    expect(DEFAULT_LISTINGS_PER_RUN).toBe(50);
  });
});

// ─── Phase 3 attempt tracking — Codex review fix on PR #97 ───────────────
//
// Without per-invocation tracking, a failed row's DB state is unchanged
// (r2_key stays null), so the next while-iteration's findMany would re-select
// it. A persistent bad row at the head of the queue could starve the entire
// Phase 3 budget. The fix: track every selected row id in a local Set and
// exclude those ids from subsequent backlog queries via id: { notIn: [...] }.
// The Set is local to one runMediaSync invocation — failed rows remain
// eligible on the NEXT cron firing.

describe("runMediaSync — Phase 3 per-invocation attempt tracking", () => {
  it("does NOT re-select the same failed rows within a single invocation (excludes via id: { notIn })", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);

    // Batch 1: 3 rows whose mirror will fail.
    const failedBatch = [
      { id: 100n, listing_id: "F-A", media_key: "FK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
      { id: 101n, listing_id: "F-B", media_key: "FK-B", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null },
      { id: 102n, listing_id: "F-C", media_key: "FK-C", media_type: "Photo", order: 1, media_url_original: "u3", r2_key: null, media_url_cached: null },
    ];
    // Batch 2: different 2 rows that mirror successfully.
    const nextBatch = [
      { id: 200n, listing_id: "N-A", media_key: "NK-A", media_type: "Photo", order: 1, media_url_original: "u4", r2_key: null, media_url_cached: null },
      { id: 201n, listing_id: "N-B", media_key: "NK-B", media_type: "Photo", order: 1, media_url_original: "u5", r2_key: null, media_url_cached: null },
    ];
    mockListingMediaFindMany
      .mockResolvedValueOnce(failedBatch)
      .mockResolvedValueOnce(nextBatch)
      .mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]); // no Phase 1 work
    const mirrorDeps = makeMirrorDeps();
    // Mirror outcome differs by R2 key prefix:
    //   - failed batch (listing_id "F-*") → mock existsInR2 throws → status='failed'
    //   - next batch  (listing_id "N-*") → existsInR2 returns true → status='reused'
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async (key: string) => {
      if (key.includes("/F-")) throw new Error("R2 head failed");
      return true;
    });

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    expect(result.r2_failed).toBe(3);
    expect(result.r2_mirrored).toBe(2);

    // CRITICAL: verify the SECOND backlog findMany call carries id: { notIn: [100n, 101n, 102n] }.
    // Filter to only Phase 3 backlog calls (those with status='active' + OR clause).
    const backlogCalls = mockListingMediaFindMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] } };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    expect(backlogCalls.length).toBeGreaterThanOrEqual(2);

    // First backlog call has NO `id` filter (Set was empty).
    const firstWhere = (backlogCalls[0][0] as { where: Record<string, unknown> }).where;
    expect(firstWhere).not.toHaveProperty("id");

    // Second backlog call HAS `id: { notIn }` containing exactly the 3 failed batch ids.
    const secondWhere = (backlogCalls[1][0] as { where: { id?: { notIn: bigint[] } } }).where;
    expect(secondWhere.id).toBeDefined();
    expect(secondWhere.id!.notIn).toBeDefined();
    const notInIds = secondWhere.id!.notIn.map(String).sort();
    expect(notInIds).toEqual(["100", "101", "102"]);
  });

  it("marks rows as attempted BEFORE mirror runs (a thrown mirror still excludes the row from re-selection)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const row = {
      id: 500n,
      listing_id: "X",
      media_key: "MK-X",
      media_type: "Photo",
      order: 1,
      media_url_original: "u",
      r2_key: null,
      media_url_cached: null,
    };
    mockListingMediaFindMany
      .mockResolvedValueOnce([row])
      .mockResolvedValue([]);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps = makeMirrorDeps();
    // Throw inside mirror. Promise.allSettled still resolves; r2_failed++.
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("explode"));

    await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    // Row 500 must appear in the next backlog query's notIn set.
    const backlogCalls = mockListingMediaFindMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] } };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    expect(backlogCalls.length).toBeGreaterThanOrEqual(2);
    const secondWhere = (backlogCalls[1][0] as { where: { id?: { notIn: bigint[] } } }).where;
    expect(secondWhere.id?.notIn?.map(String)).toContain("500");
  });

  it("attempt tracking is per-invocation — failed rows are eligible on the NEXT runMediaSync call (Set is fresh)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const row = {
      id: 999n,
      listing_id: "P",
      media_key: "MK-P",
      media_type: "Photo",
      order: 1,
      media_url_original: "u",
      r2_key: null,
      media_url_cached: null,
    };

    // First invocation: row is selected, mirror fails, row is added to attemptedBacklogIds.
    mockListingMediaFindMany
      .mockResolvedValueOnce([row]) // first run, batch 1
      .mockResolvedValueOnce([]); // first run, exits

    const fetchProperties1 = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps1 = makeMirrorDeps();
    (mirrorDeps1.existsInR2 as jest.Mock).mockRejectedValue(new Error("fail"));

    await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties: fetchProperties1 }), mirrorDeps: mirrorDeps1 }),
    );

    // Snapshot: how many findMany calls happened in the first invocation?
    const callsAfterRun1 = mockListingMediaFindMany.mock.calls.length;

    // Second invocation: same row should be selected again (fresh Set).
    mockListingMediaFindMany
      .mockResolvedValueOnce([row]) // second run, batch 1
      .mockResolvedValueOnce([]); // second run, exits

    const fetchProperties2 = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps2 = makeMirrorDeps();
    (mirrorDeps2.existsInR2 as jest.Mock).mockResolvedValue(true); // success this time

    const result2 = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties: fetchProperties2 }), mirrorDeps: mirrorDeps2 }),
    );

    // Second invocation processed the row successfully.
    expect(result2.r2_mirrored).toBe(1);

    // CRITICAL: the second invocation's FIRST backlog query has NO `id` filter
    // — proving the attempt tracking Set is per-invocation and was reset.
    const allBacklogCalls = mockListingMediaFindMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] } };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    // Pick the first backlog call from invocation 2 (after the run-1 calls).
    const invocation2FirstCall = allBacklogCalls.find((_, idx) => idx >= callsAfterRun1);
    expect(invocation2FirstCall).toBeDefined();
    const where2 = (invocation2FirstCall![0] as { where: Record<string, unknown> }).where;
    expect(where2).not.toHaveProperty("id");
  });

  it("preserves Promise.allSettled with concurrency=5 after attempt-tracking change", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    // 5 rows, all succeed via existsInR2=true.
    const fiveRows = [
      { id: 1n, listing_id: "A", media_key: "K1", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null },
      { id: 2n, listing_id: "B", media_key: "K2", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null },
      { id: 3n, listing_id: "C", media_key: "K3", media_type: "Photo", order: 1, media_url_original: "u3", r2_key: null, media_url_cached: null },
      { id: 4n, listing_id: "D", media_key: "K4", media_type: "Photo", order: 1, media_url_original: "u4", r2_key: null, media_url_cached: null },
      { id: 5n, listing_id: "E", media_key: "K5", media_type: "Photo", order: 1, media_url_original: "u5", r2_key: null, media_url_cached: null },
    ];
    mockListingMediaFindMany.mockResolvedValueOnce(fiveRows).mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(true);

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    expect(result.r2_mirrored).toBe(5);
    // 5 existsInR2 calls means concurrency-5 batch ran (verified in earlier test
    // too); this test pins it for the post-attempt-tracking flow.
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(5);
    // Take=5 in the backlog query.
    const backlogCalls = mockListingMediaFindMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] }; take?: number };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    expect((backlogCalls[0][0] as { take: number }).take).toBe(5);
  });
});

// ─── Phase 3 cross-invocation cooldown (added 2026-05-10) ────────────────
//
// Stale Trestle URLs (HTTP 404 forever) used to be retried 96×/day. Cooldown
// throttles them to 4×/day by adding a `r2_last_attempt_at >= NOW() - 6h`
// filter to the Phase 3 backlog query.

describe("runMediaSync — Phase 3 cross-invocation cooldown filter", () => {
  it("backlog query includes a 6-hour cooldown filter (r2_last_attempt_at IS NULL OR < NOW() - 6h)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]);
    const fetchProperties = jest.fn().mockResolvedValueOnce([]);

    // Fixed clock so we can verify the cooldown threshold computation.
    const now = jest.fn(() => new Date("2026-05-10T12:00:00.000Z").getTime());

    await runMediaSync(makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), now }));

    const backlogCall = mockListingMediaFindMany.mock.calls.find((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] } };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    expect(backlogCall).toBeDefined();
    const args = backlogCall![0] as {
      where: {
        AND?: Array<{
          OR?: Array<
            { r2_last_attempt_at?: null } | { r2_last_attempt_at?: { lt?: Date } }
          >;
        }>;
      };
    };
    // The cooldown filter is in the AND[0].OR clause.
    const andClauses = args.where.AND || [];
    expect(andClauses.length).toBeGreaterThanOrEqual(1);
    const cooldownClause = andClauses.find((c) => Array.isArray(c.OR));
    expect(cooldownClause).toBeDefined();
    const orClauses = cooldownClause!.OR!;
    expect(orClauses).toHaveLength(2);
    // First branch: r2_last_attempt_at IS NULL
    expect(
      orClauses.some((c) => "r2_last_attempt_at" in c && (c as { r2_last_attempt_at: null }).r2_last_attempt_at === null),
    ).toBe(true);
    // Second branch: r2_last_attempt_at < NOW() - 6h
    const ltClause = orClauses.find((c) => {
      const v = (c as { r2_last_attempt_at?: { lt?: Date } }).r2_last_attempt_at;
      return v && typeof v === "object" && v.lt instanceof Date;
    });
    expect(ltClause).toBeDefined();
    const ltDate = (ltClause as { r2_last_attempt_at: { lt: Date } }).r2_last_attempt_at.lt;
    // 12:00:00Z minus 6h = 06:00:00Z
    expect(ltDate.toISOString()).toBe("2026-05-10T06:00:00.000Z");
  });

  it("backlog query select includes r2_attempts (passed through to mirrorMediaToR2 for tombstone decisioning)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]);
    const fetchProperties = jest.fn().mockResolvedValueOnce([]);

    await runMediaSync(makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }) }));

    const backlogCall = mockListingMediaFindMany.mock.calls.find((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] } };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    const args = backlogCall![0] as { select: Record<string, boolean> };
    expect(args.select.r2_attempts).toBe(true);
    expect(args.select.id).toBe(true);
    expect(args.select.media_key).toBe(true);
    expect(args.select.media_url_original).toBe(true);
  });

  it("Phase 3 forwards r2_attempts from the row to mirrorMediaToR2", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const backlogRow = {
      id: 7n,
      listing_id: "RLS-X",
      media_key: "MK-X",
      media_type: "Photo",
      order: 1,
      media_url_original: "https://api.cotality.com/photo.jpg",
      r2_key: null,
      media_url_cached: null,
      r2_attempts: 2, // 2 prior failures; this attempt is the 3rd
    };
    mockListingMediaFindMany.mockResolvedValueOnce([backlogRow]).mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps = makeMirrorDeps();
    // Force a 404 so we can verify the tombstone-on-3rd-4xx behavior.
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    mirrorDeps.fetchFn = jest
      .fn(async () => new Response(new Uint8Array(0), { status: 404 })) as typeof fetch;

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    expect(result.r2_failed).toBe(1);
    // mirrorMediaToR2's failure-emit helper should have written status='deleted'
    // because r2_attempts was 2 going in, +1 = 3, and the failure is HTTP 404.
    const tombstoneCall = mockListingMediaUpdate.mock.calls.find((call) => {
      const args = call[0] as { data: Record<string, unknown> };
      return args.data.status === "deleted";
    });
    expect(tombstoneCall).toBeDefined();
    const tombstoneArgs = tombstoneCall![0] as {
      where: { media_key: string };
      data: { status: string; r2_attempts: number; r2_last_attempt_at: Date };
    };
    expect(tombstoneArgs.where.media_key).toBe("MK-X");
    expect(tombstoneArgs.data.status).toBe("deleted");
    expect(tombstoneArgs.data.r2_attempts).toBe(3);
    expect(tombstoneArgs.data.r2_last_attempt_at).toBeInstanceOf(Date);
  });
});
