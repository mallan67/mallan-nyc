/**
 * N1 — unchanged-write suppression for the listing_media upsert path.
 *
 * Root cause under test: pre-N1, `upsertListingMedia` rewrote EVERY existing
 * row on every Cotality re-delivery (rows_updated == rows_checked in
 * production, 17,545/17,545 in the 2026-07-16→17 baseline window). N1 adds
 * `mediaRowUnchanged` and skips the UPDATE when nothing the update would
 * write actually differs.
 *
 * Mocks `@/lib/prisma` (same convention as media-sync-upsert.test.ts) —
 * assertions are on CALL COUNTS and payloads, which is exactly the contract:
 * "identical complete input causes zero listingMedia.update calls."
 */

import type { UpsertListingMediaInput } from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

interface ExistingRow {
  id: bigint;
  listing_id: string | null;
  resource_record_key: string | null;
  resource_record_id: string | null;
  media_url_original: string | null;
  media_type: string | null;
  media_category: string | null;
  media_classification: string | null;
  order: number | null;
  preferred_photo_yn: boolean | null;
  media_modification_ts: Date | null;
  modification_ts: Date | null;
  status: string | null;
}

const mockFindUnique = jest.fn<Promise<ExistingRow | null>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>();
const mockUpdate = jest.fn<Promise<unknown>, [{ where: { media_key: string }; data: Record<string, unknown> }]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [{ where: Record<string, unknown>; data: Record<string, unknown> }]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findUnique: (args: unknown) => mockFindUnique(args),
      create: (args: { data: Record<string, unknown> }) => mockCreate(args),
      update: (args: { where: { media_key: string }; data: Record<string, unknown> }) => mockUpdate(args),
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => mockUpdateMany(args),
    },
  },
}));

import { upsertListingMedia, mediaRowUnchanged } from "../media-sync";

const LISTING_ID = "RLS20012345";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset();
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

/** Trestle-shape input row (what the Cotality Media fetch delivers). */
function makeRow(overrides: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: "MK-1",
    ResourceRecordKey: "RRK-100",
    ResourceRecordID: "RLS20012345",
    MediaURL: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    MediaCategory: "Photo",
    MediaStatus: "Active",
    Order: 1,
    PreferredPhotoYN: false,
    MediaModificationTimestamp: "2026-05-08T11:00:00Z",
    ModificationTimestamp: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

/**
 * The DB row exactly as `upsertListingMedia` would have written it from
 * `makeRow()` — i.e. an "unchanged re-delivery" fixture.
 */
function makeExisting(overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id: 1n,
    listing_id: LISTING_ID,
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    media_type: "Photo",
    media_category: "Photo",
    media_classification: null,
    order: 1,
    preferred_photo_yn: false,
    media_modification_ts: new Date("2026-05-08T11:00:00Z"),
    modification_ts: new Date("2026-05-08T12:00:00Z"),
    status: "active",
    ...overrides,
  };
}

// ─── 1. Zero writes on identical re-delivery ─────────────────────────────

describe("N1 — identical complete input causes ZERO update calls", () => {
  it("skips every unchanged row: no update, no create, skippedUnchanged counts them", async () => {
    mockFindUnique.mockResolvedValue(makeExisting());

    const result = await upsertListingMedia(LISTING_ID, [
      makeRow(),
      makeRow({ MediaKey: "MK-1" }),
    ]);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({
      inserted: 0,
      updatedChanged: 0,
      skippedUnchanged: 2,
      skippedInvalid: 0,
      tombstoned: 0,
    });
  });

  it("two-pass idempotency: pass 1 creates, pass 2 (same input) writes nothing", async () => {
    // Pass 1 — row does not exist yet.
    mockFindUnique.mockResolvedValue(null);
    const r1 = await upsertListingMedia(LISTING_ID, [makeRow()]);
    expect(r1).toEqual({ inserted: 1, updatedChanged: 0, skippedUnchanged: 0, skippedInvalid: 0, tombstoned: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Pass 2 — the row now exists exactly as written.
    mockFindUnique.mockResolvedValue(makeExisting());
    const r2 = await upsertListingMedia(LISTING_ID, [makeRow()]);
    expect(r2).toEqual({ inserted: 0, updatedChanged: 0, skippedUnchanged: 1, skippedInvalid: 0, tombstoned: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1); // still only pass 1's create
  });
});

// ─── 2. Every display/lifecycle-relevant field change still propagates ───

describe("N1 — each changed field causes exactly one update", () => {
  const changedCases: Array<{
    name: string;
    input?: Partial<UpsertListingMediaInput>;
    existing?: Partial<ExistingRow>;
  }> = [
    { name: "public URL change", input: { MediaURL: "https://api.cotality.com/trestle/Media/NEW" } },
    { name: "display order change", input: { Order: 2 } },
    { name: "media category/type change (Photo → FloorPlan)", input: { MediaCategory: "FloorPlan" } },
    { name: "classification change", input: { MediaClassification: "Aerial" } },
    { name: "preferred-photo flag change", input: { PreferredPhotoYN: true } },
    { name: "resource_record_key change", input: { ResourceRecordKey: "RRK-999" } },
    { name: "resource_record_id change", input: { ResourceRecordID: "RLS20099999" } },
    { name: "row-level MediaModificationTimestamp change", input: { MediaModificationTimestamp: "2026-06-01T00:00:00Z" } },
    { name: "row-level ModificationTimestamp change", input: { ModificationTimestamp: "2026-06-01T00:00:00Z" } },
    { name: "lifecycle: tombstoned row re-delivered active is reactivated", existing: { status: "deleted" } },
    { name: "listing reassignment (existing row belongs to another listing)", existing: { listing_id: "RLS20000001" } },
  ];

  it.each(changedCases)("$name → exactly one update", async ({ input, existing }) => {
    mockFindUnique.mockResolvedValue(makeExisting(existing));

    const result = await upsertListingMedia(LISTING_ID, [makeRow(input)]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.updatedChanged).toBe(1);
    expect(result.skippedUnchanged).toBe(0);
    // The update always restores the full contract, including status: "active".
    expect(mockUpdate.mock.calls[0][0].data.status).toBe("active");
  });
});

// ─── 3. Timestamp normalization contract ─────────────────────────────────

describe("N1 — timestamps compare by epoch, never by Date identity", () => {
  it("equal instants in different representations do NOT cause a write", async () => {
    // Existing row holds a distinct Date object; input uses a +00:00 offset
    // string of the same instants. Object identity would fail; epoch must pass.
    mockFindUnique.mockResolvedValue(
      makeExisting({
        media_modification_ts: new Date(Date.UTC(2026, 4, 8, 11, 0, 0)),
        modification_ts: new Date(Date.UTC(2026, 4, 8, 12, 0, 0)),
      }),
    );

    const result = await upsertListingMedia(LISTING_ID, [
      makeRow({
        MediaModificationTimestamp: "2026-05-08T11:00:00+00:00",
        ModificationTimestamp: "2026-05-08T12:00:00+00:00",
      }),
    ]);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.skippedUnchanged).toBe(1);
  });

  it("null-vs-value timestamp difference IS a change", async () => {
    mockFindUnique.mockResolvedValue(makeExisting({ media_modification_ts: null }));
    const result = await upsertListingMedia(LISTING_ID, [makeRow()]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.updatedChanged).toBe(1);
  });

  it("mediaRowUnchanged unit: distinct Date objects at same epoch are equal", () => {
    const a = makeExisting({
      media_modification_ts: new Date("2026-05-08T11:00:00.000Z"),
      modification_ts: new Date("2026-05-08T12:00:00.000Z"),
    });
    expect(
      mediaRowUnchanged(
        a,
        {
          mediaKey: "MK-1",
          resourceRecordKey: "RRK-100",
          resourceRecordID: "RLS20012345",
          mediaUrlOriginal: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
          mediaType: "Photo",
          mediaCategory: "Photo",
          mediaClassification: null,
          order: 1,
          preferredPhotoYN: false,
          mediaModificationTs: new Date(Date.UTC(2026, 4, 8, 11, 0, 0)),
          modificationTs: new Date(Date.UTC(2026, 4, 8, 12, 0, 0)),
          photosChangeTsSnapshot: null,
        },
        LISTING_ID,
      ),
    ).toBe(true);
  });
});

// ─── 4. photos_change_ts_snapshot ownership contract ─────────────────────

describe("N1 — snapshot-only difference does not rewrite the row", () => {
  it("a fresh Property-level PhotosChange snapshot alone produces no write", async () => {
    mockFindUnique.mockResolvedValue(makeExisting());

    // Same media content; only the Property-level snapshot option is newer.
    const result = await upsertListingMedia(LISTING_ID, [makeRow()], {
      photosChangeTsSnapshot: "2026-07-17T00:00:00Z",
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.skippedUnchanged).toBe(1);
  });

  it("changed content still stamps the CURRENT snapshot on the rewrite", async () => {
    mockFindUnique.mockResolvedValue(makeExisting());

    await upsertListingMedia(LISTING_ID, [makeRow({ Order: 5 })], {
      photosChangeTsSnapshot: "2026-07-17T00:00:00Z",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].data.photos_change_ts_snapshot).toEqual(
      new Date("2026-07-17T00:00:00Z"),
    );
  });
});

// ─── 5. Invalid input, tombstones, CRM protection — unchanged behavior ───

describe("N1 — non-update paths keep their exact pre-N1 behavior", () => {
  it("invalid rows count as skippedInvalid (no MediaKey / no URL)", async () => {
    const result = await upsertListingMedia(LISTING_ID, [
      makeRow({ MediaKey: null }),
      makeRow({ MediaKey: "MK-2", MediaURL: null }),
    ]);
    expect(result.skippedInvalid).toBe(2);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("explicit Deleted rows still tombstone via updateMany even when all other rows are skipped-unchanged", async () => {
    mockFindUnique.mockResolvedValue(makeExisting());
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await upsertListingMedia(LISTING_ID, [
      makeRow(),
      makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" }),
    ]);

    expect(result.skippedUnchanged).toBe(1);
    expect(result.tombstoned).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ media_key: { in: ["MK-DEAD"] }, status: "active" }),
        data: { status: "deleted" },
      }),
    );
  });

  it("vanished-row tombstoning still fires with skipped-unchanged rows counted as seen, and still shields crm: media", async () => {
    mockFindUnique.mockResolvedValue(makeExisting());
    mockUpdateMany.mockResolvedValue({ count: 2 });

    const result = await upsertListingMedia(LISTING_ID, [makeRow()], {
      tombstoneVanished: true,
    });

    expect(result.skippedUnchanged).toBe(1);
    expect(result.tombstoned).toBe(2);
    const where = mockUpdateMany.mock.calls[0][0].where as Record<string, unknown>;
    // The skipped-unchanged key MUST still be in the seen-set (notIn) so an
    // unchanged row is never tombstoned as "vanished".
    expect(where.media_key).toEqual({ notIn: ["MK-1"] });
    // CRM-owned uploads stay excluded from vanish-tombstoning.
    expect(where.NOT).toEqual({ media_key: { startsWith: "crm:" } });
  });

  it("run-total reconciliation: every input row lands in exactly one counter", async () => {
    mockFindUnique
      .mockResolvedValueOnce(makeExisting()) // MK-1 unchanged
      .mockResolvedValueOnce(null); // MK-3 new
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await upsertListingMedia(LISTING_ID, [
      makeRow(), // → skippedUnchanged
      makeRow({ MediaKey: null }), // → skippedInvalid
      makeRow({ MediaKey: "MK-3" }), // → inserted
      makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" }), // → tombstoned
    ]);

    expect(result).toEqual({
      inserted: 1,
      updatedChanged: 0,
      skippedUnchanged: 1,
      skippedInvalid: 1,
      tombstoned: 1,
    });
    // 4 inputs = 1 inserted + 0 updated + 1 skippedUnchanged + 1 skippedInvalid + 1 tombstoned
    const accounted =
      result.inserted +
      result.updatedChanged +
      result.skippedUnchanged +
      result.skippedInvalid +
      result.tombstoned;
    expect(accounted).toBe(4);
  });
});
