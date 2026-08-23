/**
 * PR 3 Checkpoint 1 — MediaSyncState cursor helpers.
 *
 * Tests are split between:
 *   1. Pure-function `computeAdvancedCursor()` — no DB, deterministic.
 *   2. DB-backed `getMediaSyncCursor()` and `advanceMediaSyncCursor()` — use
 *      a Prisma client mock so the suite stays free of a live Neon
 *      connection (matches the existing `lib/idx/__tests__/*` pattern of
 *      pure-JS predicates rather than e2e DB tests).
 *
 * The DB-backed assertions verify call-shape (where/create/update payloads)
 * rather than database state — which is what we actually need to prove the
 * single-row upsert pattern is correct.
 */

import {
  RESOURCE_MEDIA,
  computeAdvancedCursor,
  emptyMediaSyncCursor,
  type MediaSyncBatchRecord,
  type MediaSyncCursor,
} from "../media-sync";

// ─── Mock the prisma client used by the module under test ─────────────────
// This mock pattern matches what `lib/scanner/__tests__` and the rest of
// the repo uses — Jest replaces `@/lib/prisma`'s default export with the
// mock object below before the module under test is imported.

type FindUniqueArgs = { where: { resource: string }; select?: unknown };
type UpsertArgs = {
  where: { resource: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

const mockFindUnique = jest.fn<Promise<unknown>, [FindUniqueArgs]>();
const mockUpsert = jest.fn<Promise<unknown>, [UpsertArgs]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (args: FindUniqueArgs) => mockFindUnique(args),
      upsert: (args: UpsertArgs) => mockUpsert(args),
    },
  },
}));

// Imported after the mock is wired up.
import {
  getMediaSyncCursor,
  advanceMediaSyncCursor,
} from "../media-sync";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpsert.mockReset();
});

// ─── Pure-function tests (computeAdvancedCursor) ──────────────────────────

describe("computeAdvancedCursor (pure function)", () => {
  const empty = emptyMediaSyncCursor();

  it("returns the empty cursor when prior is empty and batch is empty", () => {
    const next = computeAdvancedCursor(empty, []);
    expect(next).toEqual({ last_photos_change: null, last_media_modified: null, last_listing_key: null });
  });

  it("advances last_photos_change to the max PhotosChangeTimestamp in the batch", () => {
    const records: MediaSyncBatchRecord[] = [
      { PhotosChangeTimestamp: "2026-05-01T00:00:00Z" },
      { PhotosChangeTimestamp: "2026-06-01T00:00:00Z" },
      { PhotosChangeTimestamp: "2026-04-01T00:00:00Z" },
    ];
    const next = computeAdvancedCursor(empty, records);
    expect(next.last_photos_change?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(next.last_media_modified).toBeNull();
  });

  it("advances last_media_modified to the max across ModificationTimestamp ∪ MediaModificationTimestamp", () => {
    const records: MediaSyncBatchRecord[] = [
      { ModificationTimestamp: "2026-05-01T00:00:00Z" },
      { MediaModificationTimestamp: "2026-06-15T00:00:00Z" },
      { ModificationTimestamp: "2026-05-10T00:00:00Z", MediaModificationTimestamp: "2026-05-12T00:00:00Z" },
    ];
    const next = computeAdvancedCursor(empty, records);
    expect(next.last_media_modified?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(next.last_photos_change).toBeNull();
  });

  it("never moves a watermark backward", () => {
    const prior: MediaSyncCursor = {
      last_photos_change: new Date("2026-08-01T00:00:00Z"),
      last_media_modified: new Date("2026-08-01T00:00:00Z"),
      last_listing_key: null,
    };
    const records: MediaSyncBatchRecord[] = [
      { PhotosChangeTimestamp: "2026-04-01T00:00:00Z", ModificationTimestamp: "2026-04-01T00:00:00Z" },
    ];
    const next = computeAdvancedCursor(prior, records);
    expect(next.last_photos_change?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(next.last_media_modified?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("ignores invalid date strings without poisoning the watermark", () => {
    const records: MediaSyncBatchRecord[] = [
      { PhotosChangeTimestamp: "not-a-date", ModificationTimestamp: "also-not-a-date" },
      { PhotosChangeTimestamp: "" },
      { PhotosChangeTimestamp: "2026-05-20T00:00:00Z", ModificationTimestamp: "2026-05-21T00:00:00Z" },
    ];
    const next = computeAdvancedCursor(empty, records);
    expect(next.last_photos_change?.toISOString()).toBe("2026-05-20T00:00:00.000Z");
    expect(next.last_media_modified?.toISOString()).toBe("2026-05-21T00:00:00.000Z");
  });

  it("treats null and undefined timestamp fields as missing", () => {
    const records: MediaSyncBatchRecord[] = [
      { PhotosChangeTimestamp: null, ModificationTimestamp: undefined },
      { PhotosChangeTimestamp: undefined },
      { PhotosChangeTimestamp: "2026-05-20T00:00:00Z" },
    ];
    const next = computeAdvancedCursor(empty, records);
    expect(next.last_photos_change?.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });

  it("accepts Date instances directly (not just ISO strings)", () => {
    const records: MediaSyncBatchRecord[] = [
      { PhotosChangeTimestamp: new Date("2026-05-15T00:00:00Z") },
      { ModificationTimestamp: new Date("2026-05-16T00:00:00Z") },
    ];
    const next = computeAdvancedCursor(empty, records);
    expect(next.last_photos_change?.toISOString()).toBe("2026-05-15T00:00:00.000Z");
    expect(next.last_media_modified?.toISOString()).toBe("2026-05-16T00:00:00.000Z");
  });

  it("rejects Date instances whose getTime() is NaN", () => {
    const records: MediaSyncBatchRecord[] = [
      { PhotosChangeTimestamp: new Date("not a date") },
      { PhotosChangeTimestamp: "2026-05-20T00:00:00Z" },
    ];
    const next = computeAdvancedCursor(empty, records);
    expect(next.last_photos_change?.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });
});

// ─── DB-backed tests (getMediaSyncCursor / advanceMediaSyncCursor) ────────

describe("getMediaSyncCursor", () => {
  it("returns the empty cursor when no row exists for resource = 'Media'", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const cursor = await getMediaSyncCursor();
    expect(cursor).toEqual({ last_photos_change: null, last_media_modified: null, last_listing_key: null });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { resource: RESOURCE_MEDIA },
      select: { last_photos_change: true, last_media_modified: true, last_listing_key: true },
    });
  });

  it("returns the persisted timestamps when the row exists", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-05-08T11:00:00Z"),
      last_media_modified: new Date("2026-05-08T11:30:00Z"),
    });
    const cursor = await getMediaSyncCursor();
    expect(cursor.last_photos_change?.toISOString()).toBe("2026-05-08T11:00:00.000Z");
    expect(cursor.last_media_modified?.toISOString()).toBe("2026-05-08T11:30:00.000Z");
  });

  it("treats nullable persisted columns as null", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: null,
      last_media_modified: null,
    });
    const cursor = await getMediaSyncCursor();
    expect(cursor.last_photos_change).toBeNull();
    expect(cursor.last_media_modified).toBeNull();
  });
});

describe("advanceMediaSyncCursor", () => {
  it("upserts (resource = 'Media') with the watermark advanced and counters set", async () => {
    mockFindUnique.mockResolvedValueOnce(null); // no prior row
    mockUpsert.mockResolvedValueOnce(undefined);
    const NOW = new Date("2026-05-09T03:00:00Z");

    const result = await advanceMediaSyncCursor({
      records: [
        { PhotosChangeTimestamp: "2026-05-08T12:00:00Z", ModificationTimestamp: "2026-05-08T12:30:00Z" },
        { PhotosChangeTimestamp: "2026-05-08T15:00:00Z" },
      ],
      status: "ok",
      rowsChecked: 5,
      rowsUpdated: 4,
      rowsFailed: 0,
      now: NOW,
    });

    expect(result.last_photos_change?.toISOString()).toBe("2026-05-08T15:00:00.000Z");
    expect(result.last_media_modified?.toISOString()).toBe("2026-05-08T12:30:00.000Z");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ resource: RESOURCE_MEDIA });
    expect(args.create.resource).toBe(RESOURCE_MEDIA);
    expect((args.create.last_photos_change as Date).toISOString()).toBe("2026-05-08T15:00:00.000Z");
    expect((args.create.last_media_modified as Date).toISOString()).toBe("2026-05-08T12:30:00.000Z");
    expect(args.create.last_run_at).toEqual(NOW);
    expect(args.create.last_run_status).toBe("ok");
    expect(args.create.rows_checked).toBe(5);
    expect(args.create.rows_updated).toBe(4);
    expect(args.create.rows_failed).toBe(0);
    // create + update payloads carry the same watermark fields.
    expect(args.update.last_photos_change).toEqual(args.create.last_photos_change);
    expect(args.update.last_media_modified).toEqual(args.create.last_media_modified);
  });

  it("does not move watermarks backward when the batch is older than the prior cursor", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-09-01T00:00:00Z"),
      last_media_modified: new Date("2026-09-01T00:00:00Z"),
    });
    mockUpsert.mockResolvedValueOnce(undefined);

    const result = await advanceMediaSyncCursor({
      records: [
        { PhotosChangeTimestamp: "2026-04-01T00:00:00Z", ModificationTimestamp: "2026-04-01T00:00:00Z" },
      ],
    });

    expect(result.last_photos_change?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(result.last_media_modified?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("on empty batch — leaves watermarks unchanged but updates last_run_at and counters", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-08-01T00:00:00Z"),
      last_media_modified: new Date("2026-08-01T00:00:00Z"),
    });
    mockUpsert.mockResolvedValueOnce(undefined);
    const NOW = new Date("2026-09-09T00:00:00Z");

    const result = await advanceMediaSyncCursor({
      records: [],
      status: "ok",
      rowsChecked: 0,
      rowsUpdated: 0,
      rowsFailed: 0,
      now: NOW,
    });

    expect(result.last_photos_change?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(result.last_media_modified?.toISOString()).toBe("2026-08-01T00:00:00.000Z");

    const args = mockUpsert.mock.calls[0][0];
    // Watermarks unchanged.
    expect((args.update.last_photos_change as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect((args.update.last_media_modified as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    // Heartbeat fields touched.
    expect(args.update.last_run_at).toEqual(NOW);
    expect(args.update.rows_checked).toBe(0);
    expect(args.update.rows_updated).toBe(0);
    expect(args.update.rows_failed).toBe(0);
  });

  it("default status is 'ok' when not specified", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce(undefined);
    await advanceMediaSyncCursor({ records: [], now: new Date("2026-05-09T03:00:00Z") });
    const args = mockUpsert.mock.calls[0][0];
    expect(args.create.last_run_status).toBe("ok");
    expect(args.update.last_run_status).toBe("ok");
  });

  it("respects an error status on a failed run without rolling back the watermark", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-08-01T00:00:00Z"),
      last_media_modified: new Date("2026-08-01T00:00:00Z"),
    });
    mockUpsert.mockResolvedValueOnce(undefined);

    await advanceMediaSyncCursor({
      records: [],
      status: "error",
      rowsFailed: 3,
      now: new Date("2026-09-09T00:00:00Z"),
    });

    const args = mockUpsert.mock.calls[0][0];
    expect(args.update.last_run_status).toBe("error");
    expect(args.update.rows_failed).toBe(3);
    // Watermark intact.
    expect((args.update.last_photos_change as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("default counters are 0 when omitted", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce(undefined);
    await advanceMediaSyncCursor({ records: [], now: new Date("2026-05-09T03:00:00Z") });
    const args = mockUpsert.mock.calls[0][0];
    expect(args.create.rows_checked).toBe(0);
    expect(args.create.rows_updated).toBe(0);
    expect(args.create.rows_failed).toBe(0);
  });

  // ─── RC1 keyset watermark persistence ──────────────────────────────────
  it("RC1: persists the keyset watermark (last_photos_change + last_listing_key)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce(undefined);
    const result = await advanceMediaSyncCursor({
      records: [],
      watermark: { last_photos_change: new Date("2026-06-01T00:00:00Z"), last_listing_key: "RLS0073" },
      now: new Date("2026-06-01T03:00:00Z"),
    });
    expect(result.last_photos_change?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(result.last_listing_key).toBe("RLS0073");
    const args = mockUpsert.mock.calls[0][0];
    expect(args.create.last_listing_key).toBe("RLS0073");
    expect(args.update.last_listing_key).toBe("RLS0073");
  });

  it("RC1: equal-timestamp watermark advances the ListingKey tie-breaker forward only", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-06-01T00:00:00Z"),
      last_media_modified: null,
      last_listing_key: "RLS0050",
    });
    mockUpsert.mockResolvedValueOnce(undefined);
    const result = await advanceMediaSyncCursor({
      records: [],
      // same ts, higher key → resume point moves from RLS0050 to RLS0099
      watermark: { last_photos_change: new Date("2026-06-01T00:00:00Z"), last_listing_key: "RLS0099" },
    });
    expect(result.last_photos_change?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(result.last_listing_key).toBe("RLS0099");
  });

  it("RC1: a null watermark (empty/halted run) PRESERVES the prior tie-breaker — does not erase it", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date("2026-06-01T00:00:00Z"),
      last_media_modified: null,
      last_listing_key: "RLS0050",
    });
    mockUpsert.mockResolvedValueOnce(undefined);
    const result = await advanceMediaSyncCursor({
      records: [],
      watermark: null,
      now: new Date("2026-06-02T00:00:00Z"),
    });
    // Watermark + tie-breaker intact; only the heartbeat moved.
    expect(result.last_photos_change?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(result.last_listing_key).toBe("RLS0050");
    const args = mockUpsert.mock.calls[0][0];
    expect(args.update.last_listing_key).toBe("RLS0050");
    expect(args.update.last_run_at).toEqual(new Date("2026-06-02T00:00:00Z"));
  });
});
