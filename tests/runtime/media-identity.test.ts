/**
 * Unified system — Phase 1, Task 2: media identity + versioned R2 key + comparator.
 *
 * Live-proven (probe 2026-07-21T06:22Z): MediaURL rotates at origin+pathname on
 * EVERY request → the change comparator EXCLUDES all URL fields; identity is
 * MediaKey + sourceRevision. Order is nullable and NOT part of the R2 key.
 */
import {
  buildVersionedR2Key,
  deriveSourceRevision,
  mediaRowUnchanged,
  buildMediaIdentity,
  type MediaIdentity,
  type ComparableMediaRow,
} from "@/lib/media/media-identity";

describe("buildVersionedR2Key — collision-proof, order-independent", () => {
  it("two distinct MediaKeys never collide, even at the same order/revision", () => {
    expect(buildVersionedR2Key("RLS1", "Photo", "MK-A", 111, "jpg"))
      .not.toBe(buildVersionedR2Key("RLS1", "Photo", "MK-B", 111, "jpg"));
  });
  it("order is NOT in the key (null/dup order can never collide)", () => {
    expect(buildVersionedR2Key("RLS1", "Photo", "MK-A", 111, "jpg")).toBe("photos/RLS1/MK-A/111.jpg");
  });
  it("a revision bump mints a NEW key (never overwrites a referenced object)", () => {
    expect(buildVersionedR2Key("RLS1", "Photo", "MK-A", 111)).not.toBe(buildVersionedR2Key("RLS1", "Photo", "MK-A", 222));
  });
  it("namespaces by canonical type; Document/Unknown have no photo namespace", () => {
    expect(buildVersionedR2Key("RLS1", "FloorPlan", "MK-A", 1, "png")).toBe("floorplans/RLS1/MK-A/1.png");
    expect(buildVersionedR2Key("RLS1", "Video", "MK-A", 1, "mp4")).toBe("videos/RLS1/MK-A/1.mp4");
    expect(buildVersionedR2Key("RLS1", "VirtualTour", "MK-A", 1)).toMatch(/^virtualtours\/RLS1\/MK-A\/1\./);
    expect(buildVersionedR2Key("RLS1", "Document", "MK-A", 1)).toBeNull();
    expect(buildVersionedR2Key("RLS1", "Unknown", "MK-A", 1)).toBeNull();
  });
  it("unsafe MediaKey is deterministically hashed; safe passes through", () => {
    expect(buildVersionedR2Key("RLS1", "Photo", "MK_ok-1", 5, "jpg")).toBe("photos/RLS1/MK_ok-1/5.jpg");
    const weird = buildVersionedR2Key("RLS1", "Photo", "a/b c?d", 5, "jpg");
    expect(weird).toMatch(/^photos\/RLS1\/[a-f0-9]{20}\/5\.jpg$/);
    // deterministic
    expect(buildVersionedR2Key("RLS1", "Photo", "a/b c?d", 5, "jpg")).toBe(weird);
  });
  it("defaults ext to jpg for photos when omitted", () => {
    expect(buildVersionedR2Key("RLS1", "Photo", "MK-A", 5)).toBe("photos/RLS1/MK-A/5.jpg");
  });
});

describe("deriveSourceRevision — from real source timestamps", () => {
  it("uses max(MediaModificationTimestamp, ModificationTimestamp) as epoch ms", () => {
    expect(deriveSourceRevision({ MediaModificationTimestamp: "2026-07-21T03:21:29.523-00:00", ModificationTimestamp: "2026-07-20T00:00:00Z" }))
      .toBe(Date.parse("2026-07-21T03:21:29.523Z"));
    expect(deriveSourceRevision({ MediaModificationTimestamp: null, ModificationTimestamp: "2026-07-20T00:00:00Z" }))
      .toBe(Date.parse("2026-07-20T00:00:00Z"));
  });
  it("returns 0 when both are null/invalid (identity then rests on MediaKey alone)", () => {
    expect(deriveSourceRevision({ MediaModificationTimestamp: null, ModificationTimestamp: null })).toBe(0);
    expect(deriveSourceRevision({ MediaModificationTimestamp: "garbage", ModificationTimestamp: "" })).toBe(0);
  });
});

describe("buildMediaIdentity", () => {
  it("assembles the canonical identity tuple", () => {
    const id: MediaIdentity = buildMediaIdentity({ ResourceName: "Property", ResourceRecordKey: "LK1", MediaKey: "MK-A", MediaModificationTimestamp: "2026-07-21T03:21:29.523Z", ModificationTimestamp: null });
    expect(id).toEqual({ resourceName: "Property", resourceRecordKey: "LK1", mediaKey: "MK-A", sourceRevision: Date.parse("2026-07-21T03:21:29.523Z") });
  });
});

describe("mediaRowUnchanged — URL fully excluded (live: URL rotates every fetch)", () => {
  const base: ComparableMediaRow = {
    listing_id: "RLS1", resource_record_key: "LK1", resource_record_id: "RLS1",
    media_key: "MK-A", source_revision: 111, media_category: "Photo", media_classification: null,
    media_type: "Photo", order: 1, preferred_photo_yn: false, status: "active",
  };
  it("identical except a rotated URL → UNCHANGED (no write)", () => {
    expect(mediaRowUnchanged(base, { ...base, media_url_original: "https://x/rotated-1" } as ComparableMediaRow)).toBe(true);
    expect(mediaRowUnchanged({ ...base, media_url_original: "https://x/a" } as ComparableMediaRow, { ...base, media_url_original: "https://x/b" } as ComparableMediaRow)).toBe(true);
  });
  it("any genuine change to a compared field forces a write", () => {
    // NOTE: incoming.status is NOT compared — a fresh feed row is always active;
    // explicit MediaStatus='Deleted' is handled by the reconcile state machine
    // before this comparator. Existing.status is enforced separately (below).
    for (const patch of [{ source_revision: 222 }, { order: 2 }, { media_category: "FloorPlan" }, { media_type: "FloorPlan" }, { media_classification: "Interior" }, { listing_id: "RLS2" }, { resource_record_key: "LK2" }, { resource_record_id: "X" }, { media_key: "MK-B" }, { preferred_photo_yn: true }]) {
      expect(mediaRowUnchanged(base, { ...base, ...patch } as ComparableMediaRow)).toBe(false);
    }
  });
  it("a deleted/replaced EXISTING row reappearing identically is NOT unchanged (must restore active)", () => {
    expect(mediaRowUnchanged({ ...base, status: "deleted" } as ComparableMediaRow, base)).toBe(false);
    expect(mediaRowUnchanged({ ...base, status: "replaced" } as ComparableMediaRow, base)).toBe(false);
  });
  it("null source_revision on both sides compares equal (rests on other fields)", () => {
    expect(mediaRowUnchanged({ ...base, source_revision: 0 } as ComparableMediaRow, { ...base, source_revision: 0 } as ComparableMediaRow)).toBe(true);
  });
});
