/**
 * PR 3 Checkpoint 2 — listing_media upsert path.
 *
 * Like the watermark suite, this test mocks `@/lib/prisma` so we never
 * touch a real DB. Assertions verify call shape (where/data payloads,
 * order of operations, count-tracking) rather than DB state.
 */

import type { UpsertListingMediaInput } from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

// The existing-row projection the #530 no-op guard reads. All compare fields
// are optional so the legacy `{ id, listing_id, media_key }` mocks still
// typecheck (their absent fields make the guard treat the row as CHANGED →
// update fires, exactly as before this PR).
interface ListingMediaRow {
  id?: bigint;
  listing_id: string;
  media_key?: string | null;
  resource_record_key?: string | null;
  resource_record_id?: string | null;
  media_url_original?: string | null;
  media_type?: string;
  media_category?: string | null;
  media_classification?: string | null;
  order?: number;
  preferred_photo_yn?: boolean;
  media_modification_ts?: Date | null;
  modification_ts?: Date | null;
  status?: string;
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

import {
  upsertListingMedia,
  listingMediaRowUnchanged,
  type ExistingMediaRowForCompare,
  type MappedMediaRow,
  type UpsertListingMediaResult,
} from "../media-sync";

// Build a full 8-field outcome ledger; unspecified counters default to 0.
function res(over: Partial<UpsertListingMediaResult> = {}): UpsertListingMediaResult {
  return {
    inserted: 0,
    updatedChanged: 0,
    skippedUnchanged: 0,
    skippedInvalid: 0,
    deleteSignalsReceived: 0,
    tombstonedExplicit: 0,
    tombstonedVanished: 0,
    tombstoned: 0,
    ...over,
  };
}

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
    expect(result).toEqual(res({ skippedInvalid: 3 }));
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
    expect(result).toEqual(res({ skippedInvalid: 3 }));
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
    expect(result).toEqual(res({ skippedInvalid: 2 }));
  });

  // ─── Insert path ──────────────────────────────────────────────────────

  it("inserts new rows when no matching media_key exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-1", Order: 1 }),
      makeRow({ MediaKey: "MK-2", Order: 2 }),
    ]);

    expect(result).toEqual(res({ inserted: 2 }));
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

    expect(result).toEqual(res({ updatedChanged: 1 }));
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
    expect(r1).toEqual(res({ inserted: 1 }));

    // Second run — same row, now exists.
    mockFindUnique.mockResolvedValueOnce({ id: 1n, listing_id: "RLS20012345", media_key: "MK-1" });
    mockUpdate.mockResolvedValueOnce(undefined);
    const r2 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r2).toEqual(res({ updatedChanged: 1 }));

    // Third run — still exists.
    mockFindUnique.mockResolvedValueOnce({ id: 1n, listing_id: "RLS20012345", media_key: "MK-1" });
    mockUpdate.mockResolvedValueOnce(undefined);
    const r3 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r3).toEqual(res({ updatedChanged: 1 }));

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

    expect(result).toEqual(res({ inserted: 1, deleteSignalsReceived: 1, tombstonedExplicit: 1, tombstonedVanished: 3, tombstoned: 4 }));
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
    expect(result).toEqual(res({}));
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── #530 — unchanged-write suppression ────────────────────────────────────
//
// The stored row that a byte-identical feed row maps to. Fields mirror the
// `makeRow()` defaults after mapping (Photo, order 1, no MediaModification, a
// ModificationTimestamp of 2026-05-08T12:00:00Z, no MediaClassification).
function existingMatching(over: Partial<ExistingMediaRowForCompare> = {}): ExistingMediaRowForCompare {
  return {
    listing_id: "RLS20012345",
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    media_type: "Photo",
    media_category: "Photo",
    media_classification: null,
    order: 1,
    preferred_photo_yn: false,
    media_modification_ts: null,
    modification_ts: new Date("2026-05-08T12:00:00Z"),
    status: "active",
    ...over,
  };
}

describe("upsertListingMedia — #530 unchanged-write suppression", () => {
  it("PROOF: a byte-identical ACTIVE row is skipped — zero update, counted as unchanged", async () => {
    mockFindUnique.mockResolvedValueOnce(existingMatching());

    const result = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);

    // The core #530 guarantee: NO write for a no-op.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual(res({ skippedUnchanged: 1 }));
  });

  it("running twice with identical input produces 1 insert then 0 writes (true no-op resume)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    const r1 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r1).toEqual(res({ inserted: 1 }));

    mockFindUnique.mockResolvedValueOnce(existingMatching());
    const r2 = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);
    expect(r2).toEqual(res({ skippedUnchanged: 1 }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Every real change must still WRITE (preserve inserts/updates/restores/order/media changes).
  const changes: Array<[string, Partial<ExistingMediaRowForCompare>]> = [
    ["order changed", { order: 2 }],
    ["media_url_original changed", { media_url_original: "https://cdn.example/other.jpg" }],
    ["media_type changed", { media_type: "FloorPlan" }],
    ["media_category changed", { media_category: "FloorPlan" }],
    ["media_classification changed", { media_classification: "Interior" }],
    ["preferred_photo_yn changed", { preferred_photo_yn: true }],
    ["resource_record_key changed", { resource_record_key: "RRK-999" }],
    ["modification_ts changed", { modification_ts: new Date("2020-01-01T00:00:00Z") }],
    ["media_modification_ts changed (null → date)", { media_modification_ts: new Date("2026-05-08T12:00:00Z") }],
    ["listing moved (different listing_id)", { listing_id: "RLS-OTHER" }],
    ["resurrect: identical content but status='deleted'", { status: "deleted" }],
    ["resurrect: identical content but status='replaced'", { status: "replaced" }],
  ];
  for (const [label, over] of changes) {
    it(`writes an UPDATE when ${label}`, async () => {
      mockFindUnique.mockResolvedValueOnce(existingMatching(over));
      mockUpdate.mockResolvedValueOnce(undefined);

      const result = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-1" })]);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      // The update always re-asserts status='active' (resurrect-on-reappear).
      expect(mockUpdate.mock.calls[0][0].data.status).toBe("active");
      expect(result).toEqual(res({ updatedChanged: 1 }));
    });
  }

  it("a mixed batch: one unchanged, one changed, one new → 1 insert, 1 update, 1 unchanged", async () => {
    mockFindUnique
      .mockResolvedValueOnce(existingMatching()) // MK-1 identical → skip
      .mockResolvedValueOnce(existingMatching({ order: 9 })) // MK-2 order differs → update
      .mockResolvedValueOnce(null); // MK-3 new → insert
    mockUpdate.mockResolvedValueOnce(undefined);
    mockCreate.mockResolvedValueOnce(undefined);

    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-1" }),
      makeRow({ MediaKey: "MK-2" }),
      makeRow({ MediaKey: "MK-3" }),
    ]);

    expect(result).toEqual(res({ inserted: 1, updatedChanged: 1, skippedUnchanged: 1 }));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("listingMediaRowUnchanged — pure predicate", () => {
  const mapped: MappedMediaRow = {
    mediaKey: "MK-1",
    resourceRecordKey: "RRK-100",
    resourceRecordID: "RLS20012345",
    mediaUrlOriginal: "https://cdn.example/p.jpg",
    mediaType: "Photo",
    mediaCategory: "Photo",
    mediaClassification: null,
    order: 3,
    preferredPhotoYN: true,
    mediaModificationTs: new Date("2026-05-08T12:00:00Z"),
    modificationTs: null,
    photosChangeTsSnapshot: new Date("2026-07-20T00:00:00Z"), // excluded from compare
  };
  const base: ExistingMediaRowForCompare = {
    listing_id: "RLS20012345",
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original: "https://cdn.example/p.jpg",
    media_type: "Photo",
    media_category: "Photo",
    media_classification: null,
    order: 3,
    preferred_photo_yn: true,
    media_modification_ts: new Date("2026-05-08T12:00:00Z"),
    modification_ts: null,
    status: "active",
  };

  it("true when every compared field matches (a fresh Date instance, same instant)", () => {
    const existing = { ...base, media_modification_ts: new Date("2026-05-08T12:00:00Z") };
    expect(listingMediaRowUnchanged(existing, mapped, "RLS20012345")).toBe(true);
  });

  it("photos_change_ts_snapshot is EXCLUDED — a differing snapshot never blocks suppression", () => {
    // The mapped snapshot differs from anything stored, yet the row is still unchanged.
    expect(listingMediaRowUnchanged(base, { ...mapped, photosChangeTsSnapshot: new Date("1999-01-01") }, "RLS20012345")).toBe(true);
  });

  it("false when status is not active (resurrect must write)", () => {
    expect(listingMediaRowUnchanged({ ...base, status: "deleted" }, mapped, "RLS20012345")).toBe(false);
  });

  it("false when the listing_id argument differs from the stored row", () => {
    expect(listingMediaRowUnchanged(base, mapped, "RLS-OTHER")).toBe(false);
  });

  it("date semantics: null==null matches, null vs date differs, same instant matches, different instant differs", () => {
    // modification_ts: both null in base/mapped → matches (covered by the true case).
    expect(listingMediaRowUnchanged({ ...base, modification_ts: new Date("2026-01-01") }, mapped, "RLS20012345")).toBe(false); // date vs null
    expect(listingMediaRowUnchanged({ ...base, media_modification_ts: null }, mapped, "RLS20012345")).toBe(false); // null vs date
    expect(listingMediaRowUnchanged({ ...base, media_modification_ts: new Date("2000-01-01") }, mapped, "RLS20012345")).toBe(false); // different instant
  });

  it("false on any single source-field mismatch", () => {
    const fields: Array<Partial<ExistingMediaRowForCompare>> = [
      { resource_record_key: "X" }, { resource_record_id: "X" }, { media_url_original: "X" },
      { media_type: "Video" }, { media_category: "X" }, { media_classification: "X" },
      { order: 99 }, { preferred_photo_yn: false },
    ];
    for (const over of fields) {
      expect(listingMediaRowUnchanged({ ...base, ...over }, mapped, "RLS20012345")).toBe(false);
    }
  });
});

// ─── #530 — outcome accounting (INPUT ledger vs PHYSICAL writes) ───────────
describe("upsertListingMedia — #530 outcome accounting", () => {
  it("unmatched explicit delete: deleteSignalsReceived=1 but tombstonedExplicit=0 (zero DB rows flipped)", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 }); // no active row matches the deleted key
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-GHOST", MediaStatus: "Deleted" }),
    ]);
    expect(result.deleteSignalsReceived).toBe(1);
    expect(result.tombstonedExplicit).toBe(0);
    expect(result.tombstoned).toBe(0);
    // input ledger accounts for the single delete-signal row.
    const inputLedger = result.inserted + result.updatedChanged + result.skippedUnchanged + result.skippedInvalid + result.deleteSignalsReceived;
    expect(inputLedger).toBe(1);
  });

  it("duplicate explicit deletes: deleteSignalsReceived=2 but at most ONE DB row tombstoned (deduped media_key)", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    const result = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-DUP", MediaStatus: "Deleted" }),
      makeRow({ MediaKey: "MK-DUP", MediaStatus: "Deleted" }),
    ]);
    expect(result.deleteSignalsReceived).toBe(2);
    expect(result.tombstonedExplicit).toBe(1);
    // The physical write set is a DEDUPED media_key list (one write, not two).
    expect(mockUpdateMany.mock.calls[0][0].where.media_key).toEqual({ in: ["MK-DUP"] });
  });

  it("vanished-only batch: zero input rows; tombstonedVanished reflects affected DB rows; invariant holds", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 5 });
    const result = await upsertListingMedia("RLS20012345", [], { tombstoneVanished: true });
    expect(result.deleteSignalsReceived).toBe(0);
    expect(result.tombstonedExplicit).toBe(0);
    expect(result.tombstonedVanished).toBe(5);
    expect(result.tombstoned).toBe(result.tombstonedExplicit + result.tombstonedVanished);
    expect(result.inserted).toBe(0);
  });

  it("tombstoned ALWAYS equals tombstonedExplicit + tombstonedVanished (explicit + vanished together)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);
    mockUpdateMany.mockResolvedValueOnce({ count: 2 }); // explicit
    mockUpdateMany.mockResolvedValueOnce({ count: 4 }); // vanished
    const result = await upsertListingMedia(
      "RLS20012345",
      [makeRow({ MediaKey: "MK-LIVE" }), makeRow({ MediaKey: "MK-D", MediaStatus: "Deleted" })],
      { tombstoneVanished: true },
    );
    expect(result.tombstonedExplicit).toBe(2);
    expect(result.tombstonedVanished).toBe(4);
    expect(result.tombstoned).toBe(6);
    expect(result.tombstoned).toBe(result.tombstonedExplicit + result.tombstonedVanished);
  });

  it("mixed batch reconciles the INPUT ledger exactly and the PHYSICAL-write ledger", async () => {
    // MK-1 identical (skip) · MK-2 changed (update) · MK-3 new (insert) ·
    // MK-4 no MediaURL (invalid) · MK-DEL delete-signal.
    mockFindUnique
      .mockResolvedValueOnce(existingMatching()) // MK-1 unchanged
      .mockResolvedValueOnce(existingMatching({ order: 7 })) // MK-2 changed
      .mockResolvedValueOnce(null); // MK-3 insert
    mockUpdate.mockResolvedValueOnce(undefined);
    mockCreate.mockResolvedValueOnce(undefined);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }); // explicit delete

    const input = [
      makeRow({ MediaKey: "MK-1" }),
      makeRow({ MediaKey: "MK-2" }),
      makeRow({ MediaKey: "MK-3" }),
      makeRow({ MediaKey: "MK-4", MediaURL: null }),
      makeRow({ MediaKey: "MK-DEL", MediaStatus: "Deleted" }),
    ];
    const result = await upsertListingMedia("RLS20012345", input);

    expect(result).toEqual(res({
      inserted: 1,
      updatedChanged: 1,
      skippedUnchanged: 1,
      skippedInvalid: 1,
      deleteSignalsReceived: 1,
      tombstonedExplicit: 1,
      tombstoned: 1,
    }));
    // INPUT ledger === number of incoming rows.
    const inputLedger = result.inserted + result.updatedChanged + result.skippedUnchanged + result.skippedInvalid + result.deleteSignalsReceived;
    expect(inputLedger).toBe(input.length);
    // PHYSICAL writes === inserts + updates + tombstones.
    const physical = result.inserted + result.updatedChanged + result.tombstonedExplicit + result.tombstonedVanished;
    expect(physical).toBe(3);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
