/**
 * Phase 3 — media write suppression (rotating-signed-URL churn fix).
 *
 * PROVEN LIVE (2026-07-21): media-sync rewrote 752/752 rows checked per run
 * (100% write rate). Sampled rows were rewritten ~45 min ago though their
 * source `MediaModificationTimestamp`/`ModificationTimestamp` were ~112h old
 * and every stable identity field was unchanged — the ONLY difference was the
 * per-request-rotating signed `MediaURL`. The comparator compared that URL
 * exactly, so no row was ever "unchanged".
 *
 * Requirement: a rotating signed URL or query string ALONE must not cause a
 * `listing_media` update. BUT a genuinely-needed delivery URL (a row not yet
 * mirrored to R2, whose stored URL the R2 backlog path reuses) must still
 * refresh. So the write is suppressed ONLY when the row is already delivered
 * (`r2_key` AND `media_url_cached` both present).
 *
 * These are failing-first: the pre-Phase-3 comparator writes on any URL diff.
 */

import type { UpsertListingMediaInput } from "../media-sync";

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
  r2_key?: string | null;
  media_url_cached?: string | null;
}

const mockFindUnique = jest.fn<Promise<ListingMediaRow | null>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findUnique: (a: unknown) => mockFindUnique(a),
      create: (a: unknown) => mockCreate(a),
      update: (a: unknown) => mockUpdate(a),
      updateMany: (a: unknown) => mockUpdateMany(a),
    },
  },
}));

import {
  upsertListingMedia,
  listingMediaRowUnchanged,
  type ExistingMediaRowForCompare,
  type MappedMediaRow,
} from "../media-sync";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset();
});

// A Trestle Media row whose mapped form matches `deliveredRow()` on every
// MATERIAL field. Its MediaURL is the freshly-rotated (different) signed URL.
const ROTATED_URL =
  "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/NEW-signature-Z";
function makeRow(overrides: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: "MK-1",
    ResourceRecordKey: "RRK-100",
    ResourceRecordID: "RLS20012345",
    MediaURL: ROTATED_URL,
    MediaCategory: "Photo",
    MediaStatus: "Active",
    Order: 1,
    PreferredPhotoYN: false,
    ModificationTimestamp: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

// The stored row: identical material identity, ALREADY mirrored to R2
// (r2_key + media_url_cached present), and holding a STALE (old-signature) URL.
function deliveredRow(over: Partial<ListingMediaRow> = {}): ListingMediaRow {
  return {
    id: 1n,
    listing_id: "RLS20012345",
    media_key: "MK-1",
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original:
      "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/OLD-signature-A",
    media_type: "Photo",
    media_category: "Photo",
    media_classification: null,
    order: 1,
    preferred_photo_yn: false,
    media_modification_ts: null,
    modification_ts: new Date("2026-05-08T12:00:00Z"),
    status: "active",
    r2_key: "photos/RLS20012345/MK-1/0.jpg",
    media_url_cached: "https://cdn.mallan.nyc/photos/RLS20012345/MK-1/0.jpg",
    ...over,
  };
}

describe("Phase 3: rotating signed URL alone must not write (delivered row)", () => {
  it("PROOF: path-signature rotation on a delivered row is SUPPRESSED (zero update)", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow());
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    expect(r.updatedChanged).toBe(0);
    // Observability: the row differed ONLY by URL, and we suppressed it.
    expect(r.suppressedUrlRotationOnly).toBe(1);
    expect(r.mismatchMediaUrlExact).toBe(1); // URL still counted (observability), not a material change
  });

  it("PROOF: query-token-only rotation on a delivered row is SUPPRESSED", async () => {
    const base = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/sig";
    mockFindUnique.mockResolvedValueOnce(
      deliveredRow({ media_url_original: base + "?token=OLD&expires=1" }),
    );
    const r = await upsertListingMedia("RLS20012345", [makeRow({ MediaURL: base + "?token=NEW&expires=2" })]);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    expect(r.suppressedUrlRotationOnly).toBe(1);
  });

  it("a fully byte-identical delivered row is still suppressed (no URL diff either)", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_url_original: ROTATED_URL }));
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    expect(r.suppressedUrlRotationOnly).toBe(0); // no URL diff → not attributed to rotation
  });
});

describe("Phase 3 req 4: preserve URL refresh where genuinely required for delivery", () => {
  it("un-mirrored row (media_url_cached null) REFRESHES the URL — write, not suppress", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_url_cached: null }));
    mockUpdate.mockResolvedValueOnce(undefined);
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      data: { media_url_original: ROTATED_URL, status: "active" },
    });
    expect(r.deliveryUrlRefreshed).toBe(1);
    expect(r.updatedChanged).toBe(0); // nothing MATERIAL changed — this is a delivery refresh
    expect(r.skippedUnchanged).toBe(0);
  });

  it("un-mirrored row (r2_key null) REFRESHES the URL — write, not suppress", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ r2_key: null }));
    mockUpdate.mockResolvedValueOnce(undefined);
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(r.deliveryUrlRefreshed).toBe(1);
  });
});

describe("Phase 3: genuine material changes STILL write (even on a delivered row)", () => {
  const material: Array<[string, Partial<UpsertListingMediaInput>]> = [
    ["order change", { Order: 7 }],
    ["hero/preferred change", { PreferredPhotoYN: true }],
    ["classification change", { MediaCategory: "FloorPlan" }],
    ["source modification bump", { ModificationTimestamp: "2026-07-01T00:00:00Z" }],
  ];
  for (const [label, over] of material) {
    it(`writes on ${label}`, async () => {
      mockFindUnique.mockResolvedValueOnce(deliveredRow());
      mockUpdate.mockResolvedValueOnce(undefined);
      const r = await upsertListingMedia("RLS20012345", [makeRow(over)]);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(r.updatedChanged).toBe(1);
      expect(r.skippedUnchanged).toBe(0);
      expect(r.deliveryUrlRefreshed).toBe(0);
    });
  }

  it("deleted media stays fail-closed: an explicit Deleted signal still tombstones", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    const r = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" }),
    ]);
    expect(r.tombstoned).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("Phase 3: batch proof — an unchanged 50-listing-shaped batch produces near-zero writes", () => {
  it("15 delivered rows differing only by rotated URL → 0 writes, 15 suppressed", async () => {
    const rows: UpsertListingMediaInput[] = [];
    for (let i = 0; i < 15; i++) {
      const key = `MK-${i}`;
      mockFindUnique.mockResolvedValueOnce(
        deliveredRow({
          media_key: key,
          media_url_original: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/${i}/OLD`,
          order: i,
          r2_key: `photos/RLS20012345/${key}/0.jpg`,
          media_url_cached: `https://cdn.mallan.nyc/${key}.jpg`,
        }),
      );
      rows.push(
        makeRow({
          MediaKey: key,
          MediaURL: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/${i}/NEW`,
          Order: i,
        }),
      );
    }
    const r = await upsertListingMedia("RLS20012345", rows);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(15);
    expect(r.suppressedUrlRotationOnly).toBe(15);
    expect(r.rowsWritten).toBe(0);
    expect(r.rowsChecked).toBe(15);
  });

  it("one true change in a 15-row batch updates ONLY that row", async () => {
    const rows: UpsertListingMediaInput[] = [];
    for (let i = 0; i < 15; i++) {
      const key = `MK-${i}`;
      mockFindUnique.mockResolvedValueOnce(
        deliveredRow({ media_key: key, order: i, r2_key: `photos/x/${key}/0.jpg`, media_url_cached: `https://cdn/${key}` }),
      );
      // Row 7 has a genuine order change; all others only rotated the URL.
      rows.push(makeRow({ MediaKey: key, Order: i === 7 ? 99 : i }));
    }
    mockUpdate.mockResolvedValue(undefined);
    const r = await upsertListingMedia("RLS20012345", rows);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(r.updatedChanged).toBe(1);
    expect(r.skippedUnchanged).toBe(14);
    expect(r.rowsWritten).toBe(1);
  });
});

describe("Phase 3: bounded per-row failure isolation", () => {
  it("a single write failure is counted and does not abort the rest of the batch", async () => {
    mockFindUnique
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-A", media_url_cached: null })) // needs refresh → write (fails)
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-B", order: 5 })); // order 5 ≠ incoming 1 → material change → write (ok)
    mockUpdate
      .mockRejectedValueOnce(new Error("db write failed"))
      .mockResolvedValueOnce(undefined);

    const r = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-A" }),
      makeRow({ MediaKey: "MK-B" }), // Order defaults to 1 → differs from stored 5
    ]);

    expect(r.writeFailures).toBe(1);
    expect(r.updatedChanged).toBe(1); // MK-B still processed
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("FAIL-CLOSED: a per-row write failure suppresses ALL tombstoning in the same upsert", async () => {
    // MK-A needs a delivery-URL refresh (media_url_cached null) → write, which fails.
    // MK-DEAD is an explicit delete signal that would normally tombstone.
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_key: "MK-A", media_url_cached: null }));
    mockUpdate.mockRejectedValueOnce(new Error("db write failed"));

    const r = await upsertListingMedia(
      "RLS20012345",
      [
        makeRow({ MediaKey: "MK-A" }),
        makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" }),
      ],
      { tombstoneVanished: true },
    );

    expect(r.writeFailures).toBe(1);
    // Neither explicit nor vanished tombstones ran — a partial listing must make
    // no destructive change (a still-present row could look "vanished").
    expect(r.tombstoned).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("Phase 3: listingMediaRowUnchanged is a pure MATERIAL predicate (URL excluded)", () => {
  const mapped: MappedMediaRow = {
    mediaKey: "MK-1",
    resourceRecordKey: "RRK-100",
    resourceRecordID: "RLS20012345",
    mediaUrlOriginal: "https://host/NEW",
    mediaType: "Photo",
    mediaCategory: "Photo",
    mediaClassification: null,
    order: 3,
    preferredPhotoYN: true,
    mediaModificationTs: new Date("2026-05-08T12:00:00Z"),
    modificationTs: null,
    photosChangeTsSnapshot: null,
  };
  const base: ExistingMediaRowForCompare = {
    listing_id: "RLS20012345",
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original: "https://host/OLD", // different — must NOT matter
    media_type: "Photo",
    media_category: "Photo",
    media_classification: null,
    order: 3,
    preferred_photo_yn: true,
    media_modification_ts: new Date("2026-05-08T12:00:00Z"),
    modification_ts: null,
    status: "active",
    r2_key: "photos/x/MK-1/0.jpg",
    media_url_cached: "https://cdn/x",
  };

  it("true when only the URL differs (URL is excluded from material identity)", () => {
    expect(listingMediaRowUnchanged(base, mapped, "RLS20012345")).toBe(true);
  });

  it("false on a real material change (order)", () => {
    expect(listingMediaRowUnchanged({ ...base, order: 9 }, mapped, "RLS20012345")).toBe(false);
  });

  it("false when status is not active (resurrect must write)", () => {
    expect(listingMediaRowUnchanged({ ...base, status: "deleted" }, mapped, "RLS20012345")).toBe(false);
  });
});
