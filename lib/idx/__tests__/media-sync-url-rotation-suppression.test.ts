/**
 * CPU hotfix — media-row write suppression (rotating-signed-URL churn).
 *
 * PROVEN LIVE (2026-07-21): media-sync rewrote 752/752 rows checked per run
 * (100% write rate). Sampled rows were rewritten ~45 min ago though their
 * source timestamps were ~112h old and every stable identity field was
 * unchanged — the ONLY difference was the per-request-rotating signed MediaURL,
 * which the comparator compared exactly.
 *
 * Contract: a rotating signed URL or query string ALONE must not cause a
 * listing_media update. A genuinely-needed delivery URL (a row not yet mirrored
 * to R2, whose stored URL the R2 backlog reuses) must still refresh. So the
 * write is suppressed ONLY when the row is already delivered (r2_key AND
 * media_url_cached non-empty). Failing-first: pre-hotfix, any URL diff writes.
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
  mediaRowDelivered,
  type ExistingMediaRowForCompare,
  type MappedMediaRow,
} from "../media-sync";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset();
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

const ROTATED_URL = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/NEW-signature-Z";
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

// Delivered: identical material identity, mirrored to R2, holding a STALE URL.
function deliveredRow(over: Partial<ListingMediaRow> = {}): ListingMediaRow {
  return {
    id: 1n,
    listing_id: "RLS20012345",
    media_key: "MK-1",
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/OLD-signature-A",
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

describe("hotfix: rotating signed URL alone must not write (delivered row)", () => {
  it("PROOF: path-embedded signature change on a delivered row is SUPPRESSED (IDENTITY change)", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow());
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    // The signature is in the PATH here (…/1/OLD-signature-A → …/1/NEW-signature-Z),
    // so origin+pathname differs → this is an IDENTITY change, NOT a query
    // rotation. This is exactly the case the old conflated counter mislabeled
    // as "rotation" (Codex P2).
    expect(r.suppressedUrlIdentityChanged).toBe(1);
    expect(r.suppressedUrlSignatureRotation).toBe(0);
    expect(r.mismatchMediaUrlExact).toBe(1); // URL still counted (observability)
    expect(r.physicalWrites).toBe(0);
  });

  it("PROOF: query-token-only rotation on a delivered row is SUPPRESSED (SIGNATURE rotation)", async () => {
    const base = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/sig";
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_url_original: base + "?token=OLD&expires=1" }));
    const r = await upsertListingMedia("RLS20012345", [makeRow({ MediaURL: base + "?token=NEW&expires=2" })]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    // Same origin+pathname, only the query changed → SIGNATURE rotation.
    expect(r.suppressedUrlSignatureRotation).toBe(1);
    expect(r.suppressedUrlIdentityChanged).toBe(0);
  });
});

describe("Codex P2 split: signature rotation vs identity change attributed separately", () => {
  it("different ORIGIN (same path) on a delivered row → IDENTITY change", async () => {
    const path = "/trestle/Media/Property/PHOTO-Jpeg/100/1/sig";
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_url_original: "https://api.cotality.com" + path }));
    const r = await upsertListingMedia("RLS20012345", [makeRow({ MediaURL: "https://media.cotality.com" + path })]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    expect(r.suppressedUrlIdentityChanged).toBe(1);
    expect(r.suppressedUrlSignatureRotation).toBe(0);
  });

  it("EXACT-SAME URL on a delivered row → NEITHER URL counter (pure no-op)", async () => {
    const same = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/sig";
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_url_original: same }));
    const r = await upsertListingMedia("RLS20012345", [makeRow({ MediaURL: same })]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(1);
    expect(r.mismatchMediaUrlExact).toBe(0);
    expect(r.suppressedUrlSignatureRotation).toBe(0);
    expect(r.suppressedUrlIdentityChanged).toBe(0);
  });

  it("mixed batch: both counters accumulate independently across rows", async () => {
    const b = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100";
    mockFindUnique
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-1", order: 0, media_url_original: `${b}/1/sig?token=OLD` }))
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-2", order: 1, media_url_original: `${b}/2/OLD` }));
    const r = await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-1", Order: 0, MediaURL: `${b}/1/sig?token=NEW` }), // query → signature
      makeRow({ MediaKey: "MK-2", Order: 1, MediaURL: `${b}/2/NEW` }), // pathname → identity
    ]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(2);
    expect(r.suppressedUrlSignatureRotation).toBe(1);
    expect(r.suppressedUrlIdentityChanged).toBe(1);
  });
});

describe("hotfix req 4: preserve URL refresh where genuinely required for delivery", () => {
  it("un-mirrored row (media_url_cached null) REFRESHES the URL — write, not suppress", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_url_cached: null }));
    mockUpdate.mockResolvedValueOnce(undefined);
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // NARROW LOCATOR REFRESH. The payload is now media_url_original ONLY.
    // The old assertion also expected status:"active" to be replayed, but that
    // is redundant: listingMediaRowUnchanged returns FALSE when status is not
    // active (see "resurrect must write"), so a material-unchanged row is
    // already active. Replaying it — and the material/provenance columns —
    // was the write amplification this refresh path exists to avoid.
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ data: { media_url_original: ROTATED_URL } });
    expect(Object.keys((mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data)).toEqual(["media_url_original"]);
    expect(r.deliveryUrlRefreshed).toBe(1);
    expect(r.updatedChanged).toBe(0);
  });

  it("un-mirrored row (r2_key null) REFRESHES the URL — write, not suppress", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ r2_key: null }));
    mockUpdate.mockResolvedValueOnce(undefined);
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(r.deliveryUrlRefreshed).toBe(1);
  });

  it("EMPTY-STRING r2_key/media_url_cached is NOT delivered → refreshes (hardened detection)", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ r2_key: "   ", media_url_cached: "" }));
    mockUpdate.mockResolvedValueOnce(undefined);
    const r = await upsertListingMedia("RLS20012345", [makeRow()]);
    expect(mockUpdate).toHaveBeenCalledTimes(1); // blank artifacts ⇒ not delivered ⇒ write
    expect(r.deliveryUrlRefreshed).toBe(1);
    expect(r.skippedUnchanged).toBe(0);
  });
});

describe("hotfix: mediaRowDelivered — non-empty trimmed contract", () => {
  it("null / empty / whitespace are NOT delivered; a real key+url IS", () => {
    expect(mediaRowDelivered({ r2_key: null, media_url_cached: null })).toBe(false);
    expect(mediaRowDelivered({ r2_key: "", media_url_cached: "x" })).toBe(false);
    expect(mediaRowDelivered({ r2_key: "  ", media_url_cached: "x" })).toBe(false);
    expect(mediaRowDelivered({ r2_key: "k", media_url_cached: "" })).toBe(false);
    expect(mediaRowDelivered({ r2_key: "photos/x/1.jpg", media_url_cached: "https://cdn/x" })).toBe(true);
  });
});

describe("hotfix: genuine material changes STILL write (even on a delivered row)", () => {
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
    const r = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" })]);
    expect(r.tombstoned).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("hotfix: physicalWrites counter INCLUDES tombstones", () => {
  it("insert + material update + delivery refresh + explicit tombstone + vanished tombstone all count", async () => {
    // MK-new insert · MK-mat material update · MK-ref delivery refresh · MK-DEAD explicit delete.
    mockFindUnique
      .mockResolvedValueOnce(null) // MK-new → insert
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-mat", order: 9 })) // material update
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-ref", media_url_cached: null })); // refresh
    mockCreate.mockResolvedValueOnce(undefined);
    mockUpdate.mockResolvedValue(undefined);
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // explicit tombstone (MK-DEAD)
      .mockResolvedValueOnce({ count: 2 }); // vanished tombstone

    const r = await upsertListingMedia(
      "RLS20012345",
      [
        makeRow({ MediaKey: "MK-new" }),
        makeRow({ MediaKey: "MK-mat" }),
        makeRow({ MediaKey: "MK-ref" }),
        makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" }),
      ],
      { tombstoneVanished: true },
    );

    expect(r.inserted).toBe(1);
    expect(r.updatedChanged).toBe(1);
    expect(r.deliveryUrlRefreshed).toBe(1);
    expect(r.tombstonedExplicit).toBe(1);
    expect(r.tombstonedVanished).toBe(2);
    // physicalWrites = 1 + 1 + 1 + 1 + 2 = 6 (tombstones INCLUDED).
    expect(r.physicalWrites).toBe(6);
    // nonTombstoneRowsWritten = 1 + 1 + 1 = 3.
    expect(r.nonTombstoneRowsWritten).toBe(3);
  });
});

describe("hotfix: batch proof — unchanged delivered batch → near-zero writes", () => {
  it("15 delivered rows differing only by rotated URL → 0 physical writes, 15 suppressed", async () => {
    const rows: UpsertListingMediaInput[] = [];
    for (let i = 0; i < 15; i++) {
      const key = `MK-${i}`;
      mockFindUnique.mockResolvedValueOnce(
        deliveredRow({ media_key: key, order: i, media_url_original: `https://old/${i}`, r2_key: `photos/x/${key}.jpg`, media_url_cached: `https://cdn/${key}` }),
      );
      rows.push(makeRow({ MediaKey: key, MediaURL: `https://new/${i}`, Order: i }));
    }
    const r = await upsertListingMedia("RLS20012345", rows);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(r.skippedUnchanged).toBe(15);
    // Different origin each row (https://old/i → https://new/i) → IDENTITY changes.
    expect(r.suppressedUrlIdentityChanged).toBe(15);
    expect(r.suppressedUrlSignatureRotation).toBe(0);
    expect(r.physicalWrites).toBe(0);
    expect(r.rowsChecked).toBe(15);
  });
});

describe("hotfix: bounded per-row failure isolation + fail-closed tombstoning", () => {
  it("a single write failure is counted and does not abort the rest of the batch", async () => {
    mockFindUnique
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-A", media_url_cached: null })) // refresh → fails
      .mockResolvedValueOnce(deliveredRow({ media_key: "MK-B", order: 5 })); // order 5 ≠ 1 → material update
    mockUpdate.mockRejectedValueOnce(new Error("db write failed")).mockResolvedValueOnce(undefined);
    const r = await upsertListingMedia("RLS20012345", [makeRow({ MediaKey: "MK-A" }), makeRow({ MediaKey: "MK-B" })]);
    expect(r.writeFailures).toBe(1);
    expect(r.updatedChanged).toBe(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("FAIL-CLOSED: a per-row write failure suppresses ALL tombstoning in the same upsert", async () => {
    mockFindUnique.mockResolvedValueOnce(deliveredRow({ media_key: "MK-A", media_url_cached: null }));
    mockUpdate.mockRejectedValueOnce(new Error("db write failed"));
    const r = await upsertListingMedia(
      "RLS20012345",
      [makeRow({ MediaKey: "MK-A" }), makeRow({ MediaKey: "MK-DEAD", MediaStatus: "Deleted" })],
      { tombstoneVanished: true },
    );
    expect(r.writeFailures).toBe(1);
    expect(r.tombstoned).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("hotfix: listingMediaRowUnchanged is a pure MATERIAL predicate (URL excluded)", () => {
  const mapped: MappedMediaRow = {
    mediaKey: "MK-1", resourceRecordKey: "RRK-100", resourceRecordID: "RLS20012345",
    mediaUrlOriginal: "https://host/NEW", mediaType: "Photo", mediaCategory: "Photo",
    mediaClassification: null, order: 3, preferredPhotoYN: true,
    mediaModificationTs: new Date("2026-05-08T12:00:00Z"), modificationTs: null,
    photosChangeTsSnapshot: null,
  };
  const base: ExistingMediaRowForCompare = {
    listing_id: "RLS20012345", resource_record_key: "RRK-100", resource_record_id: "RLS20012345",
    media_url_original: "https://host/OLD", media_type: "Photo", media_category: "Photo",
    media_classification: null, order: 3, preferred_photo_yn: true,
    media_modification_ts: new Date("2026-05-08T12:00:00Z"), modification_ts: null, status: "active",
    r2_key: "photos/x/MK-1/0.jpg", media_url_cached: "https://cdn/x",
  };
  it("true when only the URL differs (URL excluded from material identity)", () => {
    expect(listingMediaRowUnchanged(base, mapped, "RLS20012345")).toBe(true);
  });
  it("false on a real material change (order)", () => {
    expect(listingMediaRowUnchanged({ ...base, order: 9 }, mapped, "RLS20012345")).toBe(false);
  });
  it("false when status is not active (resurrect must write)", () => {
    expect(listingMediaRowUnchanged({ ...base, status: "deleted" }, mapped, "RLS20012345")).toBe(false);
  });
});
