/**
 * PR 3 Checkpoint 2 — listing_media upsert path.
 *
 * Like the watermark suite, this test mocks `@/lib/prisma` so we never
 * touch a real DB. Assertions verify call shape (where/data payloads,
 * order of operations, count-tracking) rather than DB state.
 */

import type { UpsertListingMediaInput } from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

interface ListingMediaRow {
  id: bigint;
  listing_id: string;
  media_key: string | null;
}

const mockFindUnique = jest.fn<Promise<ListingMediaRow | null>, [{ where: { media_key: string }; select?: unknown }]>();
const mockCreate = jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>();
const mockUpdate = jest.fn<Promise<unknown>, [{ where: { media_key: string }; data: Record<string, unknown> }]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [{ where: Record<string, unknown>; data: Record<string, unknown> }]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findUnique: (args: { where: { media_key: string }; select?: unknown }) => mockFindUnique(args),
      create: (args: { data: Record<string, unknown> }) => mockCreate(args),
      update: (args: { where: { media_key: string }; data: Record<string, unknown> }) => mockUpdate(args),
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => mockUpdateMany(args),
    },
  },
}));

import { upsertListingMedia } from "../media-sync";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset();
});

// Helper — build a Trestle-shape Media row.
function makeRow(overrides: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: overrides.MediaKey ?? "MK-1",
    ResourceRecordKey: "RRK-100",
    ResourceRecordID: "RLS20012345",
    MediaURL: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    MediaCategory: "Photo",
    MediaStatus: "Active",
    Order: 1,
    PreferredPhotoYN: false,
    ModificationTimestamp: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

describe("upsertListingMedia — Checkpoint 2", () => {
  // ─── Skip rows ────────────────────────────────────────────────────────

  it("skips rows without MediaKey (cannot dedupe)", async () => {
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: null }),
      makeRow({ MediaKey: undefined }),
      makeRow({ MediaKey: "" }),
    ]);
    expect(result).toEqual({ inserted: 0, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 3, tombstoned: 0 });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips rows with non-Public Permission (defensive)", async () => {
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A", Permission: "Office Only" }),
      makeRow({ MediaKey: "MK-B", Permission: "VOW" }),
      makeRow({ MediaKey: "MK-C", Permission: "Private" }),
    ]);
    expect(result).toEqual({ inserted: 0, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 3, tombstoned: 0 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts Permission='Public'", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A", Permission: "Public" }),
    ]);
    expect(result.inserted).toBe(1);
    expect(result.skippedInvalid).toBe(0);
  });

  it("accepts Permission=null (Trestle's IDX Plus license-edge default — already filtered upstream)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A", Permission: null }),
    ]);
    expect(result.inserted).toBe(1);
    expect(result.skippedInvalid).toBe(0);
  });

  it("skips rows without MediaURL", async () => {
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A", MediaURL: null }),
      makeRow({ MediaKey: "MK-B", MediaURL: "" }),
    ]);
    expect(result).toEqual({ inserted: 0, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 2, tombstoned: 0 });
  });

  // ─── Insert path ──────────────────────────────────────────────────────

  it("inserts new rows when no matching media_key exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-1", Order: 1 }),
      makeRow({ MediaKey: "MK-2", Order: 2 }),
    ]);

    expect(result).toEqual({ inserted: 2, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const firstCall = mockCreate.mock.calls[0][0];
    expect(firstCall.data.listing_id).toBe("RLS20012345");
    expect(firstCall.data.media_key).toBe("MK-1");
    expect(firstCall.data.media_type).toBe("Photo");
    expect(firstCall.data.status).toBe("active");
    expect(firstCall.data.order).toBe(1);
  });

  it("classifies MediaCategory='FloorPlan' as FloorPlan media_type", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-FP", MediaCategory: "FloorPlan" }),
    ]);
    expect(mockCreate.mock.calls[0][0].data.media_type).toBe("FloorPlan");
    expect(mockCreate.mock.calls[0][0].data.media_category).toBe("FloorPlan");
  });

  it("preserves the photosChangeTsSnapshot option on every inserted row", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    const snap = "2026-05-08T12:30:00Z";
    await upsertListingMedia(
      "RLS20012345",
      [makeRow({ MediaKey: "MK-Snap" })],
      { photosChangeTsSnapshot: snap },
    );
    const args = mockCreate.mock.calls[0][0];
    expect((args.data.photos_change_ts_snapshot as Date).toISOString()).toBe("2026-05-08T12:30:00.000Z");
  });

  // ─── Update path ──────────────────────────────────────────────────────

  it("updates existing rows when media_key matches", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 1n, listing_id: "RLS20012345", media_key: "MK-1" });
    mockUpdate.mockResolvedValueOnce(undefined);

    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-1", Order: 5 }),
    ]);

    expect(result).toEqual({ inserted: 0, updatedChanged: 1, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });
    expect(mockCreate).not.toHaveBeenCalled();
    const args = mockUpdate.mock.calls[0][0];
    expect(args.where).toEqual({ media_key: "MK-1" });
    expect(args.data.order).toBe(5);
    expect(args.data.status).toBe("active");
  });

  it("update never resets r2_key or media_url_cached", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 1n, listing_id: "RLS20012345", media_key: "MK-1" });
    mockUpdate.mockResolvedValueOnce(undefined);
    await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    const args = mockUpdate.mock.calls[0][0];
    // Checkpoint 2 must NOT touch r2_key or media_url_cached — those fields
    // are owned by Checkpoint 4 (R2 upload path).
    expect(args.data).not.toHaveProperty("r2_key");
    expect(args.data).not.toHaveProperty("media_url_cached");
  });

  // ─── Idempotency ──────────────────────────────────────────────────────

  it("running twice with identical input produces 1 insert then 1 update (no duplicates)", async () => {
    // First run — row not in DB.
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    const r1 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r1).toEqual({ inserted: 1, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });

    // Second run — same row, now exists.
    mockFindUnique.mockResolvedValueOnce({ id: 1n, listing_id: "RLS20012345", media_key: "MK-1" });
    mockUpdate.mockResolvedValueOnce(undefined);
    const r2 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r2).toEqual({ inserted: 0, updatedChanged: 1, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });

    // Third run — still exists.
    mockFindUnique.mockResolvedValueOnce({ id: 1n, listing_id: "RLS20012345", media_key: "MK-1" });
    mockUpdate.mockResolvedValueOnce(undefined);
    const r3 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r3).toEqual({ inserted: 0, updatedChanged: 1, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });

    // No duplicate creates.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // ─── Tombstoning ─────────────────────────────────────────────────────

  it("tombstones explicit MediaStatus='Deleted' rows by media_key", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-DEAD-1", MediaStatus: "Deleted" }),
      makeRow({ MediaKey: "MK-DEAD-2", MediaStatus: "Deleted" }),
    ]);

    expect(result.tombstoned).toBe(2);
    expect(result.inserted).toBe(0);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        listing_id: "RLS20012345",
        status: "active",
        media_key: { in: ["MK-DEAD-1", "MK-DEAD-2"] },
      },
      data: { status: "deleted" },
    });
  });

  it("does NOT tombstone vanished rows by default (tombstoneVanished defaults to false)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-1" }),
    ]);
    expect(result.tombstoned).toBe(0);
    // updateMany only fires when there are explicit deletes OR tombstoneVanished=true.
    // Neither happened here.
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("tombstones vanished rows when tombstoneVanished=true (caller signals complete batch)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    mockUpdateMany.mockResolvedValueOnce({ count: 4 });

    const result = await upsertListingMedia(
      "RLS20012345",
      [makeRow({ MediaKey: "MK-1" })],
      { tombstoneVanished: true },
    );

    expect(result.tombstoned).toBe(4);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        listing_id: "RLS20012345",
        status: "active",
        media_key: { notIn: ["MK-1"] },
        // P1C2: crm:-namespace rows are CRM-owned and absent from every
        // Trestle set by design — never "vanished at source".
        NOT: { media_key: { startsWith: "crm:" } },
      },
      data: { status: "deleted" },
    });
  });

  it("with tombstoneVanished=true and empty input — tombstones every active row for the listing", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 7 });

    const result = await upsertListingMedia(
      "RLS20012345",
      [],
      { tombstoneVanished: true },
    );

    expect(result.tombstoned).toBe(7);
    // Special path: no `media_key.notIn` filter when seenKeys is empty —
    // but the P1C2 crm: exclusion still applies (CRM rows never feed-tombstone).
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        listing_id: "RLS20012345",
        status: "active",
        NOT: { media_key: { startsWith: "crm:" } },
      },
      data: { status: "deleted" },
    });
  });

  it("explicit-delete tombstone PLUS vanished tombstone are both counted", async () => {
    // 1 active row inserted; 1 explicit-deleted row in same call.
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }); // explicit delete
    mockUpdateMany.mockResolvedValueOnce({ count: 3 }); // vanished

    const result = await upsertListingMedia(
      "RLS20012345",
      [
        makeRow({ MediaKey: "MK-LIVE" }),
        makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" }),
      ],
      { tombstoneVanished: true },
    );

    expect(result).toEqual({ inserted: 1, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 4 });
    // Vanished `notIn` clause should include BOTH live and explicitly-deleted keys.
    expect(mockUpdateMany.mock.calls[1][0].where).toEqual({
      listing_id: "RLS20012345",
      status: "active",
      media_key: { notIn: ["MK-LIVE", "MK-DEAD"] },
      NOT: { media_key: { startsWith: "crm:" } },
    });
  });

  // ─── Field coercion ──────────────────────────────────────────────────

  it("coerces Order from string to int, default 0", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A", Order: "5" }),
      makeRow({ MediaKey: "MK-B", Order: null }),
      makeRow({ MediaKey: "MK-C", Order: "not a number" }),
    ]);

    expect(mockCreate.mock.calls[0][0].data.order).toBe(5);
    expect(mockCreate.mock.calls[1][0].data.order).toBe(0);
    expect(mockCreate.mock.calls[2][0].data.order).toBe(0);
  });

  it("coerces PreferredPhotoYN from 'true' string to boolean true", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A", PreferredPhotoYN: "true" }),
      makeRow({ MediaKey: "MK-B", PreferredPhotoYN: true }),
      makeRow({ MediaKey: "MK-C", PreferredPhotoYN: "false" }),
      makeRow({ MediaKey: "MK-D", PreferredPhotoYN: null }),
    ]);

    expect(mockCreate.mock.calls[0][0].data.preferred_photo_yn).toBe(true);
    expect(mockCreate.mock.calls[1][0].data.preferred_photo_yn).toBe(true);
    expect(mockCreate.mock.calls[2][0].data.preferred_photo_yn).toBe(false);
    expect(mockCreate.mock.calls[3][0].data.preferred_photo_yn).toBe(false);
  });

  it("ignores invalid date strings on ModificationTimestamp / MediaModificationTimestamp", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [
      makeRow({
        MediaKey: "MK-A",
        ModificationTimestamp: "garbage",
        MediaModificationTimestamp: "",
      }),
    ]);

    const data = mockCreate.mock.calls[0][0].data;
    expect(data.modification_ts).toBeNull();
    expect(data.media_modification_ts).toBeNull();
  });

  // ─── No-write paths ──────────────────────────────────────────────────

  it("on empty input with no options — performs zero DB calls", async () => {
    const result = await upsertListingMedia("RLS20012345", []);
    expect(result).toEqual({ inserted: 0, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
