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
import { createRawUpdateStore, type RawRowState } from "./raw-failure-write-store";

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
// RC5: the Phase-1 ghost probe — default "exists" so the orchestration paths
// under test are unchanged; RC5-specific ghost behavior lives in media-sync-rc5.test.ts.
const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();

/**
 * PR #584. Failure bookkeeping is ONE parameterized `UPDATE ... RETURNING`, so
 * the failure assertions below read the STORED ROW rather than a Prisma
 * payload. Rows materialise at the counter their fixture declares.
 */
const fixtureRows = new Map<string, Partial<RawRowState>>();
const store = createRawUpdateStore((key) => fixtureRows.get(key));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (args: unknown) => mockMediaSyncFindUnique(args),
      upsert: (args: unknown) => mockMediaSyncUpsert(args),
    },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      store.exec(strings, values),
    listingMedia: {
      findUnique: (args: unknown) => mockListingMediaFindUnique(args),
      create: (args: unknown) => mockListingMediaCreate(args),
      update: (args: unknown) => mockListingMediaUpdate(args),
      updateMany: (args: unknown) => mockListingMediaUpdateMany(args),
      // R2-1 harness shim: this file's Phase-3 backlog fixtures predate the
      // mirror-admission policy and carry no `listing` relation. The policy is
      // FAIL-CLOSED (no listing ⇒ scope "none"), so without this shim every
      // pre-R2-1 orchestration proof would silently stop exercising the mirror
      // path. Attach a Mallan-owned listing stub (scope "all_active" — the
      // unchanged "as today" branch) to backlog-query rows that don't specify
      // their own `listing`. The admission policy itself is proven separately
      // in media-sync-r21-mirror-policy.test.ts — this file keeps proving the
      // ORCHESTRATION (batching, attempt tracking, budget, counters).
      findMany: async (args: unknown) => {
        const rows = await mockListingMediaFindMany(args);
        const a = args as { where?: { status?: string; OR?: unknown[] } };
        const isBacklogQuery =
          a?.where?.status === "active" && Array.isArray(a.where.OR);
        if (!isBacklogQuery || !Array.isArray(rows)) return rows;
        return (rows as Record<string, unknown>[]).map((r) =>
          r && typeof r === "object" && !("listing" in r)
            ? {
                ...r,
                listing: {
                  listing_id: "SL-LEGACY-FIXTURE",
                  rls_eligible: false,
                  status: "Active",
                  idx_display_yn: true,
                  owner_opt_out: false,
                  participant_only: false,
                  internet_entire_listing_display_yn: true,
                },
              }
            : r,
        );
      },
      count: (args: unknown) => mockListingMediaCount(args),
    },
    auditEvent: {
      findMany: async () => [],
    },
    $transaction: (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        $queryRaw: async () => [{ locked: true }],
        listingMedia: { findMany: (a: unknown) => mockListingMediaFindMany(a) },
      }),
    listing: {
      update: (args: unknown) => mockListingUpdate(args),
      findUnique: (args: unknown) => mockListingFindUnique(args),
    },
  },
}));

import {
  buildPropertyQuery,
  isPropertyComplianceBlocked,
  runMediaSync,
  RESOURCE_MEDIA,
  R2_BACKLOG_BATCH_LIMIT,
  R2_RETRY_EXHAUSTED_THRESHOLD,
} from "../media-sync";

beforeEach(() => {
  store.reset();
  fixtureRows.clear();
  mockMediaSyncFindUnique.mockReset();
  mockMediaSyncUpsert.mockReset();
  mockListingMediaFindUnique.mockReset();
  mockListingMediaCreate.mockReset();
  mockListingMediaUpdate.mockReset();
  mockListingMediaUpdateMany.mockReset();
  mockListingMediaFindMany.mockReset();
  mockListingMediaCount.mockReset();
  mockListingUpdate.mockReset();
  mockListingFindUnique.mockReset();

  // Sensible defaults for happy paths.
  mockListingFindUnique.mockImplementation(async (args: unknown) => ({
    listing_id: (args as { where?: { listing_id?: string } })?.where?.listing_id,
  }));
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

// R2-1 admission interplay: backlog fixture rows must carry the Phase-3
// listing sub-select; rls_eligible:false makes them Mallan-owned (all_active
// scope) so orchestration tests exercise the mirror machinery, not the
// admission policy (which has its own dedicated suite).
const MIRROR_TEST_LISTING = {
  listing_id: "RLS-A", rls_eligible: false, status: "Active",
  idx_display_yn: true, owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true,
};

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
    // RC1: fetchProperties receives a PropertyQueryCursor. First run ⇒
    // lastPhotosChange null and fallbackSince = now - fallbackWindowDays.
    const cursorArg = (fetchDeps.fetchProperties as jest.Mock).mock.calls[0][0] as {
      lastPhotosChange: Date | null;
      lastListingKey: string | null;
      fallbackSince: Date;
    };
    expect(cursorArg.lastPhotosChange).toBeNull();
    expect(cursorArg.lastListingKey).toBeNull();
    const expectedSince = before - 14 * 86_400_000;
    const tolerance = (after - before) + 100;
    expect(cursorArg.fallbackSince.getTime()).toBeGreaterThanOrEqual(expectedSince - tolerance);
    expect(cursorArg.fallbackSince.getTime()).toBeLessThanOrEqual(expectedSince + tolerance);
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

  it("Codex #377: a malformed row (ListingKey, no ListingId) BEFORE a good listing HALTS the cursor — never advances past unprocessed media", async () => {
    // The malformed row cannot be media-synced. If the cursor advanced to the
    // later good listing, the malformed one's media would be silently skipped
    // forever. The keyset must halt at the malformed row (ok:false).
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        // ordered by (PhotosChangeTimestamp, ListingKey): malformed first…
        makeProperty({ ListingId: null, ListingKey: "K-BAD", PhotosChangeTimestamp: "2026-06-01T00:00:00Z" }),
        // …then a fully-processable listing at a later ts
        makeProperty({ ListingId: "RLS-GOOD", ListingKey: "K-GOOD", PhotosChangeTimestamp: "2026-06-02T00:00:00Z" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValue([]),
    });

    await runMediaSync(makeOptions({ fetchDeps }));

    // Cursor must NOT have advanced to K-GOOD — it halts at the malformed row,
    // so last_listing_key stays null (prior). (Pre-fix it advanced to "K-GOOD".)
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as { update: { last_listing_key: string | null } };
    expect(upsertArgs.update.last_listing_key).toBeNull();
    expect(upsertArgs.update.last_listing_key).not.toBe("K-GOOD");
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
    listing: MIRROR_TEST_LISTING,
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

  it("RC1: fetchMedia is called with ONLY the ResourceRecordKey (no per-listing cap — full pagination)", async () => {
    // The per-listing $top cap is retired in RC1: defaultFetchMedia follows
    // @odata.nextLink to assemble the complete set, so runMediaSync passes only
    // the key. `mediaPerListing` is accepted-but-ignored for back-compat.
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
    expect((fetchMedia as jest.Mock).mock.calls[0][0]).toBe("K-A");
    expect((fetchMedia as jest.Mock).mock.calls[0][1]).toBeUndefined();
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
        listing: MIRROR_TEST_LISTING,
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
        listing: MIRROR_TEST_LISTING,
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

describe("runMediaSync — tombstoneVanished is TRUE on a complete paginated fetch (RC1)", () => {
  it("DOES tombstone DB rows absent from the COMPLETE (paginated) Media response", async () => {
    // RC1 inverts the old capped-fetch behavior: fetchMedia now follows
    // @odata.nextLink and a RESOLVE = the COMPLETE current set. A DB row absent
    // from a complete set is proven deleted at source → it MUST be tombstoned
    // (vanished-rows `media_key: { notIn: [...] }` pattern).
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindUnique.mockResolvedValue(null);
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaUpdate.mockResolvedValue(undefined);
    mockListingMediaFindMany
      .mockResolvedValueOnce([
        { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
        { listing_id: "RLS-A", media_key: "MK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      ])
      .mockResolvedValue([]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A" }),
      ]),
      // COMPLETE response (pagination resolved) returns ONLY MK-A — MK-B is gone
      // at source and must be tombstoned.
      fetchMedia: jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-A" })]),
    });

    await runMediaSync(makeOptions({ fetchDeps }));

    const tombstoneCalls = mockListingMediaUpdateMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { media_key?: { notIn?: unknown[] } }; data?: { status?: string } };
      return args?.where?.media_key && "notIn" in (args.where.media_key as object) && args.data?.status === "deleted";
    });
    expect(tombstoneCalls).toHaveLength(1);
    const where = tombstoneCalls[0][0] as { where: { media_key: { notIn: string[] }; status: string } };
    expect(where.where.media_key.notIn).toContain("MK-A"); // survivors excluded from the tombstone set
    expect(where.where.status).toBe("active");
  });

  it("INCOMPLETE media (fetchMedia throws) → NO upsert, NO tombstone, cursor not advanced past it", async () => {
    // A failed/incomplete pagination MUST be non-destructive: existing media is
    // preserved (no upsert/tombstone), the listing counts as failed, and the
    // keyset watermark must NOT advance past it (last_listing_key not persisted
    // for this listing).
    mockMediaSyncFindUnique.mockResolvedValue(null);
    mockListingMediaFindMany.mockResolvedValue([]);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS-A", ListingKey: "K-A", PhotosChangeTimestamp: "2026-06-01T00:00:00Z" }),
      ]),
      fetchMedia: jest.fn().mockRejectedValueOnce(new Error("Media pagination incomplete")),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));

    expect(result.rows_failed).toBe(1);
    expect(result.listings_processed).toBe(0);
    // No destructive writes on the failed listing.
    expect(mockListingMediaCreate).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
    expect(mockListingMediaUpdateMany).not.toHaveBeenCalled();
    // Cursor checkpoint ran but did NOT advance the tie-breaker past the failure
    // (null watermark ⇒ last_listing_key preserved as prior null).
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as { update: { last_listing_key: string | null } };
    expect(upsertArgs.update.last_listing_key).toBeNull();
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

    // RC1: runMediaSync passes the persisted cursor (ts + keyset tie-breaker)
    // through to fetchProperties; the gt/keyset continuation lives in
    // buildPropertyQuery. Here last_listing_key was null (legacy row) ⇒ the
    // transition (inclusive) form is used downstream.
    const cursorArg = (fetchProperties as jest.Mock).mock.calls[0][0] as {
      lastPhotosChange: Date | null;
      lastListingKey: string | null;
    };
    expect(cursorArg.lastPhotosChange?.toISOString()).toBe(cursorTs.toISOString());
    expect(cursorArg.lastListingKey).toBeNull();
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
  const TS = new Date("2026-05-01T00:00:00Z");
  // RC1: buildPropertyQuery takes a PropertyQueryCursor. Transition cursor
  // (ts set, key null) for the $select/$orderby/$top shape tests.
  const transition = { lastPhotosChange: TS, lastListingKey: null, fallbackSince: TS };

  it("$select includes the canonical Trestle compliance fields Permission (singular) and MlsStatus", () => {
    const params = buildPropertyQuery(transition, 50);
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
    const params = buildPropertyQuery(transition, 50);
    const select = params.get("$select") || "";
    const fields = select.split(",");
    expect(fields).not.toContain("Permissions");
  });

  it("RC1 keyset: with a ListingKey tie-breaker the filter uses gt + (eq ts AND ListingKey gt key)", () => {
    // The deadlock fix — a cursor WITH a tie-breaker must resume AFTER the last
    // processed ListingKey, NOT re-include the whole boundary timestamp.
    const params = buildPropertyQuery({ lastPhotosChange: TS, lastListingKey: "RLS0050", fallbackSince: TS }, 50);
    const filter = params.get("$filter") || "";
    expect(filter).toContain(`PhotosChangeTimestamp gt ${TS.toISOString()}`);
    expect(filter).toContain(`PhotosChangeTimestamp eq ${TS.toISOString()} and ListingKey gt 'RLS0050'`);
  });

  it("transition run (no tie-breaker yet) uses inclusive 'ge' so boundary rows are not skipped", () => {
    const filter = buildPropertyQuery(transition, 50).get("$filter") || "";
    expect(filter).toMatch(/PhotosChangeTimestamp ge /);
  });

  it("$orderby includes ListingKey as a stable tie-breaker", () => {
    expect(buildPropertyQuery(transition, 50).get("$orderby")).toBe("PhotosChangeTimestamp asc,ListingKey asc");
  });

  it("$top reflects the requested page size", () => {
    expect(buildPropertyQuery(transition, 25).get("$top")).toBe("25");
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
    // W3: ONE bounded ADAPTIVE query per run — PK ordering (id is a
    // monotone insertion key, so FIFO fairness holds without a created_at
    // sort node); with no audit history the size falls back to the MIN.
    expect(args.orderBy).toEqual([{ id: "asc" }]);
    expect(args.take).toBe(R2_BACKLOG_BATCH_LIMIT);
  });

  it("processes a backlog batch of up to 5 rows in parallel (Promise.allSettled with MAX_CONCURRENT=5)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const backlog = [
      { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "RLS-A", media_key: "MK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "RLS-A", media_key: "MK-C", media_type: "Photo", order: 3, media_url_original: "u3", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "RLS-A", media_key: "MK-D", media_type: "Photo", order: 4, media_url_original: "u4", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "RLS-A", media_key: "MK-E", media_type: "Photo", order: 5, media_url_original: "u5", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
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
      { listing_id: "RLS-A", media_key: "MK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "RLS-B", media_key: "MK-B", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "RLS-C", media_key: "MK-C", media_type: "Photo", order: 1, media_url_original: "u3", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
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
      { listing_id: "PRIOR-A", media_key: "PK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "PRIOR-A", media_key: "PK-B", media_type: "Photo", order: 2, media_url_original: "u2", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { listing_id: "PRIOR-A", media_key: "PK-C", media_type: "Photo", order: 3, media_url_original: "u3", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
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

  it("Phase 3 stops between CHUNKS when remaining time < phase2ReserveMs and reports exit_reason='budget_phase2'", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    const fetchProperties = jest.fn().mockResolvedValueOnce([]); // no Phase 1 work
    // Phase 4: ONE bounded query returns 10 rows → 2 in-memory chunks of 5.
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: BigInt(9000 + i),
      listing_id: `X${i}`,
      media_key: `K${i}`,
      media_type: "Photo",
      order: 1,
      media_url_original: `u${i}`,
      r2_key: null,
      media_url_cached: null,
    listing: MIRROR_TEST_LISTING,
    }));
    mockListingMediaFindMany.mockResolvedValueOnce(rows).mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    // Controllable clock: the first chunk's mirror work advances the clock to
    // 900, so the SECOND chunk's budget check (1000 - 900 = 100 <= 200) stops
    // the drain between chunks.
    let t = 0;
    const now = () => t;
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async () => {
      t = 900;
      return true;
    });

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
    // First chunk processed; second chunk never attempted.
    expect(result.r2_mirrored).toBe(5);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(5);
  });
});

describe("runMediaSync — backlog_remaining + R2-independent summary", () => {
  it("reports backlog_remaining from the BOUNDED ids-only probe after Phase 3 (W3: no unbounded COUNT)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    // W3: backlog_remaining = length of an ids-only probe (take = cap+1),
    // replacing the unbounded COUNT. Serve 42 probe rows; drain selections
    // stay empty.
    mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
      const a = args as { select?: Record<string, unknown>; take?: number };
      if (a?.select && Object.keys(a.select).join(",") === "id") {
        return Array.from({ length: 42 }, (_, i) => ({ id: BigInt(i + 1) }));
      }
      return [];
    });

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }) }),
    );

    expect(result.backlog_remaining).toBe(42);
    expect(mockListingMediaCount).not.toHaveBeenCalled(); // COUNT retired
  });

  it("backlog_remaining is null if the probe query throws (defensive)", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);
    // W3: the ids-only probe throws; drain selections stay empty.
    mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
      const a = args as { select?: Record<string, unknown> };
      if (a?.select && Object.keys(a.select).join(",") === "id") {
        throw new Error("Probe failed");
      }
      return [];
    });

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

// ─── Phase 3 failed-row isolation — Phase 4 bounded-drain contract ───────
//
// History: PR #97's Codex review added per-invocation attempt tracking
// (id: { notIn: [...] } on every re-query) because the old while-loop
// re-queried the backlog after every 5-row batch and a failed row (DB state
// unchanged) would be re-selected forever, starving the budget. Phase 4
// REMOVED the re-query loop entirely: ONE bounded query selects the run's
// queue up front and processing is in-memory, so re-selection within a run
// is structurally impossible and no exclusion list exists. Failed rows keep
// their standard bookkeeping and re-surface on the NEXT run's fresh query
// (cooldown-gated) — same cross-run semantics as before.

describe("runMediaSync — Phase 3 failed-row isolation (Phase 4 bounded drain)", () => {
  // Main bounded query: active + OR-missing-R2, NOT the parked-recovery query.
  /**
   * PHASE 4a's bounded policy RE-ADMISSION select shares `status:'active'` and
   * a top-level `OR` with the main backlog select. Keyed on the one clause only
   * it carries: an AGE test on `r2_policy_excluded_at`.
   */
  const isPolicyReevalCall = (call: unknown[]): boolean => {
    const args = call[0] as { where?: Record<string, unknown> };
    const and = (args?.where?.AND as Array<Record<string, unknown>> | undefined) ?? [];
    return and.some((c) => {
      const or = (c as { OR?: Array<Record<string, unknown>> }).OR;
      return (
        Array.isArray(or) &&
        or.some((o) => (o?.r2_policy_excluded_at as { lt?: unknown } | null)?.lt !== undefined)
      );
    });
  };

  const isMainBacklogCall = (call: unknown[]): boolean => {
    const args = call[0] as { where?: { status?: string; OR?: unknown[]; r2_attempts?: unknown }; select?: Record<string, unknown> };
    // The parked-recovery selection carries a top-level r2_attempts predicate
    // (exact-match number since the #534-sentinel fix); the main backlog
    // selection never does. W3: the ids-only backlog_remaining PROBE is
    // excluded too, and PHASE 4a's re-admission sweep is a separate bounded
    // selection, not a second main-backlog query.
    return (
      args?.where?.status === "active" &&
      Array.isArray(args.where.OR) &&
      args.where.r2_attempts === undefined &&
      !isPolicyReevalCall(call) &&
      !(args.select && Object.keys(args.select).join(",") === "id")
    );
  };

  it("failed rows are counted and never re-selected — a single bounded query, no id exclusion list", async () => {
    mockMediaSyncFindUnique.mockResolvedValue(null);

    // One bounded queue: 3 rows whose mirror fails + 2 that succeed.
    const rows = [
      { id: 100n, listing_id: "F-A", media_key: "FK-A", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 101n, listing_id: "F-B", media_key: "FK-B", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 102n, listing_id: "F-C", media_key: "FK-C", media_type: "Photo", order: 1, media_url_original: "u3", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 200n, listing_id: "N-A", media_key: "NK-A", media_type: "Photo", order: 1, media_url_original: "u4", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 201n, listing_id: "N-B", media_key: "NK-B", media_type: "Photo", order: 1, media_url_original: "u5", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
    ];
    mockListingMediaFindMany.mockResolvedValueOnce(rows).mockResolvedValue([]);
    mockListingMediaUpdate.mockResolvedValue(undefined);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]); // no Phase 1 work
    const mirrorDeps = makeMirrorDeps();
    // Mirror outcome differs by R2 key prefix (key derives from listing_id):
    //   - "F-*" rows → existsInR2 throws → status='failed'
    //   - "N-*" rows → existsInR2 true   → status='reused'
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async (key: string) => {
      if (key.includes("/F-")) throw new Error("R2 head failed");
      return true;
    });

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    // Failures isolated + counted; healthy rows in the SAME queue still mirror.
    expect(result.r2_failed).toBe(3);
    expect(result.r2_mirrored).toBe(2);

    // Phase 4: exactly ONE main bounded query, and no id exclusion filter —
    // there is no re-query for a failed row to be excluded from.
    const mainCalls = mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall);
    expect(mainCalls.length).toBe(1);
    const firstWhere = (mainCalls[0][0] as { where: Record<string, unknown> }).where;
    expect(firstWhere).not.toHaveProperty("id");
  });

  it("a THROWN mirror is isolated to its row and the bounded query is not re-issued", async () => {
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
    listing: MIRROR_TEST_LISTING,
    };
    mockListingMediaFindMany
      .mockResolvedValueOnce([row])
      .mockResolvedValue([]);

    const fetchProperties = jest.fn().mockResolvedValueOnce([]);
    const mirrorDeps = makeMirrorDeps();
    // Throw inside mirror. Promise.allSettled still resolves; r2_failed++.
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("explode"));

    const result = await runMediaSync(
      makeOptions({ fetchDeps: makeFetchDeps({ fetchProperties }), mirrorDeps }),
    );

    expect(result.r2_failed).toBe(1);
    // Single bounded query — the failed row cannot be re-selected this run;
    // it stays in the DB backlog (cooldown-gated) for the NEXT run.
    const mainCalls = mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall);
    expect(mainCalls.length).toBe(1);
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
    listing: MIRROR_TEST_LISTING,
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
      { id: 1n, listing_id: "A", media_key: "K1", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 2n, listing_id: "B", media_key: "K2", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 3n, listing_id: "C", media_key: "K3", media_type: "Photo", order: 1, media_url_original: "u3", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 4n, listing_id: "D", media_key: "K4", media_type: "Photo", order: 1, media_url_original: "u4", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
      { id: 5n, listing_id: "E", media_key: "K5", media_type: "Photo", order: 1, media_url_original: "u5", r2_key: null, media_url_cached: null, listing: MIRROR_TEST_LISTING },
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
    // Phase 4: the ONE bounded query uses R2_BACKLOG_BATCH_LIMIT; the
    // concurrency-5 behavior lives in the in-memory chunking above.
    const backlogCalls = mockListingMediaFindMany.mock.calls.filter((call) => {
      const args = call[0] as { where?: { status?: string; OR?: unknown[] }; take?: number };
      return args?.where?.status === "active" && Array.isArray(args.where.OR);
    });
    expect((backlogCalls[0][0] as { take: number }).take).toBe(R2_BACKLOG_BATCH_LIMIT);
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
      listing: MIRROR_TEST_LISTING,
    };
    // The row starts in the store at the counter its fixture declares, so the
    // database-side advance runs 2 -> 3. The fixture itself is unchanged.
    fixtureRows.set(backlogRow.media_key, { r2_attempts: backlogRow.r2_attempts });
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
    // mirrorMediaToR2's failure write should have stored status='deleted'
    // because r2_attempts was 2 going in, +1 = 3, and the failure is HTTP 404.
    const tombstoneWrite = store.writes.find((w) => w.after.status === "deleted");
    expect(tombstoneWrite).toBeDefined();
    expect(tombstoneWrite!.media_key).toBe("MK-X");
    // TOMBSTONE CONTRACT UNCHANGED: a 3rd EFFECTIVE permanent 404 still sets
    // status='deleted'.
    expect(tombstoneWrite!.after.status).toBe("deleted");
    expect(tombstoneWrite!.after.r2_last_attempt_at).toBeInstanceOf(Date);

    // TERMINAL-STATE BEHAVIOUR (not a mechanical retarget): the counter is
    // never a blind JS literal computed from a possibly stale read — that
    // unbounded write is the mechanism that produced the historical >9 rows.
    // The row was forwarded at 2, and the DATABASE advanced it to 3 from the
    // value it actually held, in the same statement that set the status.
    expect(tombstoneWrite!.before.r2_attempts).toBe(2);
    expect(tombstoneWrite!.after.r2_attempts).toBe(3);
    // Bounded: it advances ONLY while the stored value is below the
    // retry-exhausted terminal, so 7 can reach 8 but nothing can reach 9.
    expect(tombstoneWrite!.after.r2_attempts as number).toBeLessThanOrEqual(
      R2_RETRY_EXHAUSTED_THRESHOLD,
    );
    // Cooldown, counter and status committed as ONE write.
    expect(store.writesFor("MK-X")).toHaveLength(1);
    // The media key is a BOUND PARAMETER, never SQL text.
    expect(tombstoneWrite!.params).toContain("MK-X");
  });
});

// ─── Observability read-back is non-fatal ────────────────────────────────

describe("runMediaSync — observability read-back is non-fatal", () => {
  it("a rejected cursor read-back does NOT reject runMediaSync, does not skip later phases, and does not alter the cursor write", async () => {
    const T1 = "2026-07-10T18:06:15.803Z";
    const propertyA = makeProperty({ ListingId: "RLS-A", ListingKey: "K-A", PhotosChangeTimestamp: T1 });
    const mediaA = [makeMediaInput({ MediaKey: "MK-A", ModificationTimestamp: T1 })];

    // mediaSyncState.findUnique call order inside runMediaSync:
    //   #1 start cursor read → #2 advance's prior read → #3 the READ-BACK (rejects).
    mockMediaSyncFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("simulated read-back DB failure"));
    mockListingMediaFindUnique.mockResolvedValue(null); // create path
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaFindMany.mockResolvedValue([]); // no Phase-3 backlog
    mockListingMediaCount.mockResolvedValue(0); // Phase-4 backlog count

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    // MUST resolve (not reject) despite the read-back throwing.
    const result = await runMediaSync(
      makeOptions({
        fetchDeps: makeFetchDeps({
          fetchProperties: jest.fn().mockResolvedValueOnce([propertyA]),
          fetchMedia: jest.fn().mockResolvedValueOnce(mediaA),
        }),
      }),
    );

    const persistedLine = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(String(c[0])) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((o) => o !== null && o.event === "persisted") as Record<string, unknown> | undefined;
    logSpy.mockRestore();

    // (a) did NOT reject — the run completed successfully.
    expect(result.status).toBe("ok");
    expect(result.listings_processed).toBe(1);
    // (b) later phases were NOT skipped — the Phase-4 backlog PROBE (W3:
    //     bounded ids-only findMany, replacing the COUNT) ran AFTER the
    //     (failed) read-back, proving execution continued past it.
    const probeRan = mockListingMediaFindMany.mock.calls.some((c) => {
      const a = c[0] as { select?: Record<string, unknown> };
      return !!a?.select && Object.keys(a.select).join(",") === "id";
    });
    expect(probeRan).toBe(true);
    // (c) the cursor write is UNALTERED — the advance upsert wrote the advanced
    //     keyset cursor exactly as it would without the read-back failure.
    expect(mockMediaSyncUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as {
      update: { last_listing_key: string | null; last_photos_change: Date | null };
    };
    expect(upsertArgs.update.last_listing_key).toBe("K-A");
    expect((upsertArgs.update.last_photos_change as Date).toISOString()).toBe(T1);
    // read-back failure recorded structurally + non-fatally (safe class only).
    expect(persistedLine).toBeDefined();
    expect(persistedLine!.readback_ok).toBe(false);
    expect(persistedLine!.readback_error_class).toBe("Error");
    expect(persistedLine!.db_readback_listing_key).toBeNull();
    expect(persistedLine!.matched).toBeNull();
    expect(persistedLine!.changed).toBeNull();
  });
});

// ─── #530 — detailed outcome counters propagate through runMediaSync ───────

describe("runMediaSync — #530 detailed outcome accounting", () => {
  it("aggregates the detailed ledger; rows_updated stays inserted + changed; input reconciles when rows_failed=0", async () => {
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    // MK-1 new → insert; MK-2 byte-identical to stored → skippedUnchanged.
    mockListingMediaFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        listing_id: "RLS20012345",
        resource_record_key: "1159000001",
        resource_record_id: "RLS20012345",
        media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/abc",
        media_type: "Photo",
        media_category: "Photo",
        media_classification: null,
        order: 1,
        preferred_photo_yn: false,
        media_modification_ts: null,
        modification_ts: new Date("2026-05-08T12:00:00Z"),
        status: "active",
        // Hotfix: already delivered to R2 → a rotated URL alone is suppressed.
        r2_key: "photos/RLS20012345/MK-2/0.jpg",
        media_url_cached: "https://cdn.mallan.nyc/photos/RLS20012345/MK-2/0.jpg",
      });
    mockListingMediaCreate.mockResolvedValueOnce(undefined);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS20012345", ListingKey: "1159000001" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValueOnce([
        makeMediaInput({ MediaKey: "MK-1" }),
        makeMediaInput({ MediaKey: "MK-2" }),
      ]),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));

    expect(result.rows_failed).toBe(0);
    expect(result.rows_inserted).toBe(1);
    expect(result.rows_skipped_unchanged).toBe(1);
    expect(result.rows_updated_changed).toBe(0);
    // Hotfix: rows_updated = PHYSICAL writes = inserts + material updates +
    // delivery refreshes + tombstones. Here: 1 insert, 0 of everything else.
    expect(result.rows_updated).toBe(1);
    expect(result.rows_updated).toBe(
      result.rows_inserted + result.rows_updated_changed + result.rows_tombstoned,
    );
    // invariant
    expect(result.rows_tombstoned).toBe(result.tombstoned_explicit + result.tombstoned_vanished);
    // only MK-1 physically written; MK-2 suppressed
    expect(mockListingMediaCreate).toHaveBeenCalledTimes(1);
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
    // input ledger reconciles on a clean run (rows_failed=0)
    expect(result.rows_checked).toBe(
      result.rows_inserted +
        result.rows_updated_changed +
        result.rows_skipped_unchanged +
        result.rows_skipped_invalid +
        result.delete_signals_received,
    );
  });

  it("source_error initializes every detailed counter to zero", async () => {
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockRejectedValue(new Error("Property fetch failed: HTTP 503")),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));

    expect(result.exit_reason).toBe("source_error");
    const counters = [
      "rows_inserted",
      "rows_updated_changed",
      "rows_skipped_unchanged",
      "rows_skipped_invalid",
      "delete_signals_received",
      "tombstoned_explicit",
      "tombstoned_vanished",
      "rows_tombstoned",
      // #541 attribution counters must also zero-init on source_error.
      "existing_rows_compared",
      "mismatch_status",
      "mismatch_listing_id",
      "mismatch_resource_record_key",
      "mismatch_resource_record_id",
      "mismatch_media_url_exact",
      "mismatch_media_url_identity",
      "mismatch_media_url_identity_equivalent",
      "mismatch_media_type",
      "mismatch_media_category",
      "mismatch_media_classification",
      "mismatch_order",
      "mismatch_preferred_photo",
      "mismatch_media_modification_ts",
      "mismatch_modification_ts",
      "rows_with_one_mismatch",
      "rows_with_multiple_mismatches",
    ] as const;
    for (const k of counters) {
      expect(result[k]).toBe(0);
    }
    expect(result.rows_updated).toBe(0);
  });

  it("#541 attribution counters aggregate through runMediaSync (changed row) and honour the invariants", async () => {
    mockMediaSyncFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    // One existing row that differs ONLY in `order` → classified "changed".
    mockListingMediaFindUnique.mockResolvedValueOnce({
      listing_id: "RLS20012345",
      resource_record_key: "1159000001",
      resource_record_id: "RLS20012345",
      media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/abc",
      media_type: "Photo",
      media_category: "Photo",
      media_classification: null,
      order: 9, // differs from the mapped order (1)
      preferred_photo_yn: false,
      media_modification_ts: null,
      modification_ts: new Date("2026-05-08T12:00:00Z"),
      status: "active",
    });
    mockListingMediaUpdate.mockResolvedValueOnce(undefined);

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS20012345", ListingKey: "1159000001" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-1" })]),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));

    expect(result.rows_failed).toBe(0);
    expect(result.existing_rows_compared).toBe(1);
    expect(result.mismatch_order).toBe(1);
    expect(result.rows_with_one_mismatch).toBe(1);
    expect(result.rows_with_multiple_mismatches).toBe(0);
    expect(result.rows_updated_changed).toBe(1);
    expect(result.rows_skipped_unchanged).toBe(0);
    // Invariants (rows_failed===0).
    expect(result.existing_rows_compared).toBe(
      result.rows_skipped_unchanged + result.rows_with_one_mismatch + result.rows_with_multiple_mismatches,
    );
    expect(result.rows_updated_changed).toBe(result.rows_with_one_mismatch + result.rows_with_multiple_mismatches);
    expect(result.mismatch_media_url_exact).toBe(
      result.mismatch_media_url_identity + result.mismatch_media_url_identity_equivalent,
    );
  });
});

// ─── Hotfix — fail-closed on a per-row media write failure ─────────────────
describe("runMediaSync — fail-closed on a per-row media write failure", () => {
  it("a failed media write blocks tombstone, summary, completion AND cursor advance for that listing", async () => {
    mockMediaSyncFindUnique.mockResolvedValue({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    // Existing row differs materially (order 9 vs incoming 1) → forces an UPDATE.
    mockListingMediaFindUnique.mockResolvedValue({
      listing_id: "RLS20012345",
      resource_record_key: "1159000001",
      resource_record_id: "RLS20012345",
      media_url_original: "https://api.cotality.com/OLD",
      media_type: "Photo", media_category: "Photo", media_classification: null,
      order: 9, preferred_photo_yn: false,
      media_modification_ts: null, modification_ts: new Date("2026-05-08T12:00:00Z"),
      status: "active",
      r2_key: "photos/RLS20012345/MK-1/0.jpg",
      media_url_cached: "https://cdn.mallan.nyc/photos/RLS20012345/MK-1/0.jpg",
    });
    mockListingMediaUpdate.mockRejectedValue(new Error("db write failed"));

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS20012345", ListingKey: "1159000001", PhotosChangeTimestamp: "2026-05-08T12:00:00Z" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValueOnce([makeMediaInput({ MediaKey: "MK-1", Order: 1 })]),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps }));

    expect(result.rows_failed).toBeGreaterThanOrEqual(1);
    expect(result.listings_processed).toBe(0);
    expect(result.status).toBe("partial");
    expect(mockListingMediaUpdateMany).not.toHaveBeenCalled(); // NO tombstone on a partial listing
    expect(mockListingUpdate).not.toHaveBeenCalled(); // NO summary write
    // Cursor did NOT advance past the failed listing (null keyset watermark).
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as { update: { last_listing_key: string | null } };
    expect(upsertArgs.update.last_listing_key).toBeNull();
  });
});

// ─── Hotfix — production-shape suppression (50 listings × 15 delivered) ─────
describe("runMediaSync — production-shape suppression (50 listings × 15 delivered rows, URLs rotated)", () => {
  it("only rotated URLs → zero listing_media writes, zero tombstoned rows, all suppressed, cursor advances", async () => {
    mockMediaSyncFindUnique.mockResolvedValue({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    const LISTINGS = 50;
    const PER = 15;
    mockListingMediaFindUnique.mockImplementation(async (args) => {
      const key = (args as { where: { media_key: string } }).where.media_key;
      const m = key.match(/^L(\d+)-M(\d+)$/)!;
      const li = m[1];
      const r2 = `photos/RLS-${li}/${key}/0.jpg`;
      return {
        listing_id: `RLS-${li}`, resource_record_key: `K-${li}`, resource_record_id: `RLS-${li}`,
        media_url_original: `https://api.cotality.com/OLD/${key}`,
        media_type: "Photo", media_category: "Photo", media_classification: null,
        order: Number(m[2]), preferred_photo_yn: false,
        media_modification_ts: null, modification_ts: new Date("2026-05-08T12:00:00Z"),
        status: "active", r2_key: r2, media_url_cached: `https://r2.example.com/${r2}`,
      };
    });
    const properties = Array.from({ length: LISTINGS }, (_, i) =>
      makeProperty({ ListingId: `RLS-${i}`, ListingKey: `K-${i}`, PhotosChangeTimestamp: "2026-05-08T12:00:00Z" }));
    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce(properties),
      fetchMedia: jest.fn().mockImplementation(async (listingKey: string) => {
        const li = listingKey.replace("K-", "");
        return Array.from({ length: PER }, (_, j) => makeMediaInput({
          MediaKey: `L${li}-M${j}`, ResourceRecordKey: `K-${li}`, ResourceRecordID: `RLS-${li}`,
          Order: j, MediaURL: `https://api.cotality.com/NEW/L${li}-M${j}`,
        }));
      }),
    });

    const result = await runMediaSync(makeOptions({
      fetchDeps, listingsPerRun: LISTINGS, mediaPerListing: PER, budgetMs: 300_000,
    }));

    expect(result.rows_failed).toBe(0);
    expect(result.listings_processed).toBe(LISTINGS);
    expect(result.rows_checked).toBe(LISTINGS * PER); // 750 inspected
    expect(result.rows_skipped_unchanged).toBe(LISTINGS * PER); // 750 suppressed
    expect(result.rows_updated).toBe(0); // ZERO physical writes
    expect(result.rows_tombstoned).toBe(0);
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
    expect(mockListingMediaCreate).not.toHaveBeenCalled();
    const upsertArgs = mockMediaSyncUpsert.mock.calls[0][0] as { update: { last_listing_key: string | null } };
    expect(upsertArgs.update.last_listing_key).not.toBeNull();
    // REPORTED: listing-summary writes STILL occur — one Listing.update per listing.
    expect(mockListingUpdate).toHaveBeenCalledTimes(LISTINGS);
  });
});

// ─── Hotfix — rows_updated is PHYSICAL writes incl. tombstones ─────────────
describe("runMediaSync — rows_updated = physical writes including tombstones", () => {
  it("insert + material update + delivery refresh + vanished tombstone all count in rows_updated", async () => {
    mockMediaSyncFindUnique.mockResolvedValue({
      last_photos_change: new Date("2026-05-01T00:00:00Z"),
      last_media_modified: new Date("2026-05-01T00:00:00Z"),
    });
    const delivered = (over: Record<string, unknown>) => ({
      listing_id: "RLS20012345", resource_record_key: "1159000001", resource_record_id: "RLS20012345",
      media_url_original: "https://api.cotality.com/OLD",
      media_type: "Photo", media_category: "Photo", media_classification: null,
      order: 0, preferred_photo_yn: false,
      media_modification_ts: null, modification_ts: new Date("2026-05-08T12:00:00Z"),
      status: "active", r2_key: "photos/x/k/0.jpg", media_url_cached: "https://r2.example.com/photos/x/k/0.jpg",
      ...over,
    });
    mockListingMediaFindUnique.mockImplementation(async (args) => {
      const key = (args as { where: { media_key: string } }).where.media_key;
      if (key === "MK-new") return null;
      if (key === "MK-mat") return delivered({ order: 9 });
      if (key === "MK-refresh") return delivered({ media_url_cached: null, listing: MIRROR_TEST_LISTING });
      return delivered({});
    });
    mockListingMediaCreate.mockResolvedValue(undefined);
    mockListingMediaUpdate.mockResolvedValue(undefined);
    // The vanished-reconcile updateMany tombstones 2 rows.
    mockListingMediaUpdateMany.mockResolvedValue({ count: 2 });

    const fetchDeps = makeFetchDeps({
      fetchProperties: jest.fn().mockResolvedValueOnce([
        makeProperty({ ListingId: "RLS20012345", ListingKey: "K", PhotosChangeTimestamp: "2026-05-08T12:00:00Z" }),
      ]),
      fetchMedia: jest.fn().mockResolvedValueOnce([
        makeMediaInput({ MediaKey: "MK-new", Order: 0 }),
        makeMediaInput({ MediaKey: "MK-mat", Order: 0 }),
        makeMediaInput({ MediaKey: "MK-refresh", Order: 0 }),
        makeMediaInput({ MediaKey: "MK-sup", Order: 0 }),
      ]),
    });

    const result = await runMediaSync(makeOptions({ fetchDeps, mediaPerListing: 5 }));

    expect(result.rows_failed).toBe(0);
    expect(result.rows_inserted).toBe(1);
    expect(result.rows_updated_changed).toBe(1);
    expect(result.rows_skipped_unchanged).toBe(1); // MK-sup
    expect(result.rows_tombstoned).toBe(2);
    // rows_updated = 1 insert + 1 material + 1 delivery refresh + 2 tombstones = 5.
    expect(result.rows_updated).toBe(5);
  });
});
