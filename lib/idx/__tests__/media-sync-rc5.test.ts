/**
 * RC5 — ghost-listing cursor freeze (behavioral RED→GREEN).
 *
 * A "ghost" is a Trestle Property with a valid ListingId/ListingKey that has
 * NO local `listings` row (never imported). Before RC5, a ghost at the head of
 * the keyset batch threw in updateListingMediaSummary (P2025) → ok:false →
 * pickKeysetWatermark returned null → the cursor never advanced → the SAME
 * batch re-fetched every run forever (the 2026-06-09 production freeze).
 *
 * RC5 semantics under test:
 *   1. ghost → RESOLVED skip (ok:true): the watermark advances past it to the
 *      last fully-processed listing.
 *   2. valid listings BEHIND the ghost still process media (fetch + summary).
 *   3. ghost is counted + ids recorded in the run result.
 *   4. ghost receives ZERO writes (no upsert, no tombstone, no summary write).
 *   5. fail-closed preserved: if the existence probe itself REJECTS, ok:false
 *      → watermark halts (never advance past unknown).
 *
 * No live R2, no live Trestle, no live DB.
 */

import type {
  MediaSyncFetchDeps,
  MirrorMediaToR2Deps,
  RunMediaSyncOptions,
  TrestleProperty,
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
const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();

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

import { runMediaSync } from "../media-sync";

const GHOST_ID = "RLS20014678";
const GHOST_KEY = "1107463938";
const VALID_ID = "RLS20099999";
const VALID_KEY = "1107463999";
const PRIOR_TS = new Date("2026-05-14T20:37:58.703Z");
const GHOST_TS = "2026-05-14T21:00:00Z";
const VALID_TS = "2026-05-14T22:00:00Z";

function ghostProperty(): TrestleProperty {
  return {
    ListingId: GHOST_ID,
    ListingKey: GHOST_KEY,
    ListingKeyNumeric: GHOST_KEY,
    PhotosChangeTimestamp: GHOST_TS,
    ModificationTimestamp: GHOST_TS,
    StandardStatus: "Active",
    Permission: null,
    Permissions: null,
    MlsStatus: "Active",
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
  };
}

function validProperty(): TrestleProperty {
  return {
    ...ghostProperty(),
    ListingId: VALID_ID,
    ListingKey: VALID_KEY,
    ListingKeyNumeric: VALID_KEY,
    PhotosChangeTimestamp: VALID_TS,
    ModificationTimestamp: VALID_TS,
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

function makeOptions(
  properties: TrestleProperty[],
  overrides: Partial<RunMediaSyncOptions> = {},
): RunMediaSyncOptions & { fetchDeps: { fetchProperties: jest.Mock; fetchMedia: jest.Mock } } {
  const fetchDeps: MediaSyncFetchDeps & { fetchProperties: jest.Mock; fetchMedia: jest.Mock } = {
    fetchProperties: jest.fn().mockResolvedValue(properties),
    fetchMedia: jest.fn().mockResolvedValue([]),
  };
  return { listingsPerRun: 10, mirrorDeps: makeMirrorDeps(), ...overrides, fetchDeps };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMediaSyncFindUnique.mockResolvedValue({
    last_photos_change: PRIOR_TS,
    last_media_modified: PRIOR_TS,
    last_listing_key: "1100000000",
  });
  mockMediaSyncUpsert.mockResolvedValue(undefined);
  mockListingMediaUpdateMany.mockResolvedValue({ count: 0 });
  mockListingMediaFindMany.mockResolvedValue([]);
  mockListingMediaCount.mockResolvedValue(0);
  // Local-existence truth: ghost has no listings row; the valid listing does.
  mockListingFindUnique.mockImplementation(async (args: unknown) => {
    const id = (args as { where?: { listing_id?: string } })?.where?.listing_id;
    return id === GHOST_ID ? null : { listing_id: id };
  });
  // Production failure shape: the summary write on a missing listings row
  // throws P2025. (Before RC5 the ghost reached this point and froze the run.)
  mockListingUpdate.mockImplementation(async (args: unknown) => {
    const id = (args as { where?: { listing_id?: string } })?.where?.listing_id;
    if (id === GHOST_ID) {
      const e = new Error("Record to update not found.") as Error & { code: string };
      e.code = "P2025";
      throw e;
    }
    return undefined;
  });
});

describe("RC5 — ghost listing at batch head must not freeze the keyset cursor", () => {
  it("advances the watermark past the ghost to the last fully-processed listing", async () => {
    const result = await runMediaSync(makeOptions([ghostProperty(), validProperty()]));

    // The cursor write must carry the VALID listing's watermark — not the
    // preserved prior cursor (the freeze) and not a halt at the ghost.
    expect(mockMediaSyncUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockMediaSyncUpsert.mock.calls[0][0] as {
      update: { last_photos_change: Date | null; last_listing_key: string | null };
    };
    expect(upsertArg.update.last_listing_key).toBe(VALID_KEY);
    expect(upsertArg.update.last_photos_change).toEqual(new Date(VALID_TS));

    expect(result.status).not.toBe("error");
  });

  it("still processes the valid listing behind the ghost (media fetched + summary written)", async () => {
    const opts = makeOptions([ghostProperty(), validProperty()]);
    await runMediaSync(opts);

    const fetchedKeys = opts.fetchDeps.fetchMedia.mock.calls.map((c: unknown[]) => c[0]);
    expect(fetchedKeys).toContain(VALID_KEY);

    const summarizedIds = mockListingUpdate.mock.calls.map(
      (c) => (c[0] as { where: { listing_id: string } }).where.listing_id,
    );
    expect(summarizedIds).toContain(VALID_ID);
  });

  it("records the ghost in the result counters and ids", async () => {
    const result = await runMediaSync(makeOptions([ghostProperty(), validProperty()]));

    expect(result.ghost_listings_skipped).toBe(1);
    expect(result.ghost_listing_ids).toContain(GHOST_ID);
    expect(result.listings_skipped).toBeGreaterThanOrEqual(1);
  });

  it("performs ZERO writes for the ghost (no media fetch, no upsert, no tombstone, no summary)", async () => {
    const opts = makeOptions([ghostProperty(), validProperty()]);
    await runMediaSync(opts);

    const fetchedKeys = opts.fetchDeps.fetchMedia.mock.calls.map((c: unknown[]) => c[0]);
    expect(fetchedKeys).not.toContain(GHOST_KEY);

    const summarizedIds = mockListingUpdate.mock.calls.map(
      (c) => (c[0] as { where: { listing_id: string } }).where.listing_id,
    );
    expect(summarizedIds).not.toContain(GHOST_ID);

    for (const call of mockListingMediaUpdateMany.mock.calls) {
      const where = (call[0] as { where?: { listing_id?: string } })?.where;
      expect(where?.listing_id).not.toBe(GHOST_ID);
    }
  });

  it("fail-closed: if the existence probe itself rejects, the watermark halts (no advance past unknown)", async () => {
    mockListingFindUnique.mockRejectedValue(new Error("connection reset"));

    await runMediaSync(makeOptions([ghostProperty(), validProperty()]));

    const upsertArg = mockMediaSyncUpsert.mock.calls[0][0] as {
      update: { last_photos_change: Date | null; last_listing_key: string | null };
    };
    // Prior cursor preserved — neither the ghost's nor the valid listing's
    // watermark may be written when existence is UNKNOWN at the batch head.
    expect(upsertArg.update.last_listing_key).toBe("1100000000");
    expect(upsertArg.update.last_photos_change).toEqual(PRIOR_TS);
  });
});
