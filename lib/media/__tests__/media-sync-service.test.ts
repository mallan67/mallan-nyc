import {
  buildMediaR2Key,
  canMirrorListingMedia,
  classifyTrestleMediaCategory,
  mirrorListingMediaBatch,
  type MediaSyncListing,
} from "../media-sync-service";

const eligibleListing: MediaSyncListing = {
  listing_id: "R123456",
  status: "Active",
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  media: [
    {
      url: "https://api.cotality.com/media/photo.jpg",
      mediaType: "Photo",
      order: 1,
      // #575: MediaKey is the stable object identity. Required — items without
      // one are skipped fail-closed rather than keyed by `order`.
      media_key: "MEDIAKEY-R123456-1",
    },
  ],
};

describe("media sync service", () => {
  it("builds deterministic R2 keys addressed by MediaKey", () => {
    expect(buildMediaR2Key("R-12/34", "FloorPlan", "MK-700")).toBe("floorplans/R-12_34/MK-700.jpg");
    expect(buildMediaR2Key("R-12/34", "Photo", "MK-001")).toBe("photos/R-12_34/MK-001.jpg");
  });

  // ── #575 — Order is a presentation ordinal, NOT identity ───────────────
  // Trestle reassigns Order whenever a gallery is reordered. Keying on it
  // meant an UNCHANGED asset got a new key after a reorder, so the same bytes
  // were re-uploaded under a new name and the old object was orphaned — one
  // duplicate per reorder, forever. These pin the fix.
  describe("#575 — object identity is stable across gallery reordering", () => {
    it("returns the same key for the same asset regardless of its Order", () => {
      // Same MediaKey, listing moved the photo from position 1 to position 9.
      const before = buildMediaR2Key("RLS123", "Photo", "MEDIAKEY-ABC");
      const after = buildMediaR2Key("RLS123", "Photo", "MEDIAKEY-ABC");
      expect(after).toBe(before);
      expect(before).toBe("photos/RLS123/MEDIAKEY-ABC.jpg");
    });

    it("gives DIFFERENT assets different keys even at the same Order", () => {
      // The old scheme collapsed these to the same `photos/RLS123/1.jpg`.
      expect(buildMediaR2Key("RLS123", "Photo", "MEDIAKEY-AAA")).not.toBe(
        buildMediaR2Key("RLS123", "Photo", "MEDIAKEY-BBB"),
      );
    });

    it("never embeds an Order ordinal in the key", () => {
      expect(buildMediaR2Key("RLS123", "Photo", "MEDIAKEY-ABC")).not.toMatch(/\/\d+\.jpg$/);
    });

    it("fails closed when MediaKey is missing rather than falling back to Order", () => {
      // Falling back would silently reintroduce the defect on exactly the rows
      // least likely to be noticed.
      expect(() => buildMediaR2Key("RLS123", "Photo", "")).toThrow(/mediaKey is required/i);
      expect(() => buildMediaR2Key("RLS123", "Photo", undefined as unknown as string)).toThrow(
        /mediaKey is required/i,
      );
    });

    it("sanitises MediaKey so it cannot escape its prefix", () => {
      expect(buildMediaR2Key("RLS123", "Photo", "../../etc/passwd")).toBe(
        "photos/RLS123/______etc_passwd.jpg",
      );
    });
  });

  // ── classifyTrestleMediaCategory — fixes the floor-plan-as-photo bug ──
  // Trestle's actual MediaCategory enum value is "FloorPlan" (no space).
  // The previous string check `cat.includes("floor plan")` (with space) on
  // a lowercased "floorplan" returned false, causing every FloorPlan media
  // item to be mis-classified as "Photo". The mis-classified items then
  // landed in `photos/{id}/{order}.jpg` and collided with real photos at
  // the same Order, last-writer-wins. Fix: centralise classification with
  // multi-form pattern matching, mirror the established
  // `lib/media/listing-media-resolver.ts:classifyMediaItem` heuristics on
  // the writer side.
  describe("classifyTrestleMediaCategory", () => {
    it('returns "FloorPlan" for the actual Trestle enum value "FloorPlan" (no space)', () => {
      expect(classifyTrestleMediaCategory("FloorPlan")).toBe("FloorPlan");
    });

    it('returns "FloorPlan" for "Floor Plan" (with space)', () => {
      expect(classifyTrestleMediaCategory("Floor Plan")).toBe("FloorPlan");
    });

    it('returns "FloorPlan" for lowercase variants', () => {
      expect(classifyTrestleMediaCategory("floorplan")).toBe("FloorPlan");
      expect(classifyTrestleMediaCategory("floor_plan")).toBe("FloorPlan");
      expect(classifyTrestleMediaCategory("floor plan")).toBe("FloorPlan");
      expect(classifyTrestleMediaCategory("FLOORPLAN")).toBe("FloorPlan");
    });

    it('returns "Photo" for "Photo"', () => {
      expect(classifyTrestleMediaCategory("Photo")).toBe("Photo");
    });

    it('returns "Video" for "Video" + variants', () => {
      expect(classifyTrestleMediaCategory("Video")).toBe("Video");
      expect(classifyTrestleMediaCategory("video")).toBe("Video");
    });

    it('returns "VirtualTour" for "VirtualTour" (no space) and "Virtual Tour"', () => {
      expect(classifyTrestleMediaCategory("VirtualTour")).toBe("VirtualTour");
      expect(classifyTrestleMediaCategory("Virtual Tour")).toBe("VirtualTour");
      expect(classifyTrestleMediaCategory("virtualtour")).toBe("VirtualTour");
    });

    it('defaults to "Photo" for missing / null / undefined / empty', () => {
      expect(classifyTrestleMediaCategory(undefined)).toBe("Photo");
      expect(classifyTrestleMediaCategory(null)).toBe("Photo");
      expect(classifyTrestleMediaCategory("")).toBe("Photo");
    });

    it('treats any non-recognised string as "Photo" (Trestle default convention)', () => {
      expect(classifyTrestleMediaCategory("Unknown")).toBe("Photo");
      expect(classifyTrestleMediaCategory("Other")).toBe("Photo");
    });
  });

  describe("buildMediaR2Key — namespace separation prevents Photo/FloorPlan key collision", () => {
    // Retained from the 2026-05-01 floor-plan-as-photo incident. Under the
    // MediaKey scheme a cross-type collision is already impossible (MediaKey is
    // globally unique), so these now assert the folder ROUTING itself — using
    // the SAME key for both types, which is a strictly stronger check than the
    // original Order=1/Order=1 case.
    it("the same key under different media types produces DISTINCT R2 keys", () => {
      const photoKey = buildMediaR2Key("RLS123", "Photo", "MK-1");
      const floorplanKey = buildMediaR2Key("RLS123", "FloorPlan", "MK-1");
      expect(photoKey).toBe("photos/RLS123/MK-1.jpg");
      expect(floorplanKey).toBe("floorplans/RLS123/MK-1.jpg");
      expect(photoKey).not.toBe(floorplanKey);
    });

    it("FloorPlan never writes into photos/", () => {
      expect(buildMediaR2Key("RLS123", "FloorPlan", "MK-1")).not.toMatch(/^photos\//);
      expect(buildMediaR2Key("RLS123", "FloorPlan", "MK-99")).not.toMatch(/^photos\//);
    });

    it("Photo never writes into floorplans/", () => {
      expect(buildMediaR2Key("RLS123", "Photo", "MK-1")).not.toMatch(/^floorplans\//);
      expect(buildMediaR2Key("RLS123", "Photo", "MK-99")).not.toMatch(/^floorplans\//);
    });

    it("a mixed-media listing (1 Photo + 1 FloorPlan) produces 2 distinct R2 URLs", () => {
      const keys = new Set([
        buildMediaR2Key("RLS123", "Photo", "MK-1"),
        buildMediaR2Key("RLS123", "FloorPlan", "MK-1"),
      ]);
      expect(keys.size).toBe(2);
    });
  });

  it("respects the public display gates", () => {
    expect(canMirrorListingMedia(eligibleListing)).toBe(true);
    expect(
      canMirrorListingMedia({
        ...eligibleListing,
        owner_opt_out: true,
      }),
    ).toBe(false);
    expect(
      canMirrorListingMedia({
        ...eligibleListing,
        participant_only: true,
      }),
    ).toBe(false);
    expect(
      canMirrorListingMedia({
        ...eligibleListing,
        rls_eligible: false,
      }),
    ).toBe(false);
  });

  it("dry-run plans copies without calling fetch or upload", async () => {
    const existsInR2 = jest.fn().mockResolvedValue(false);
    const uploadToR2 = jest.fn();
    const getAccessToken = jest.fn();
    const fetchFn = jest.fn();

    const result = await mirrorListingMediaBatch(
      [eligibleListing],
      { execute: false, batchSize: 2, logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      {
        hasR2Config: () => true,
        getAccessToken: getAccessToken as never,
        existsInR2: existsInR2 as never,
        uploadToR2: uploadToR2 as never,
        fetchFn: fetchFn as never,
      },
    );

    expect(result).toMatchObject({
      dry_run: true,
      scanned_listings: 1,
      eligible_listings: 1,
      scanned_media: 1,
      would_copy: 1,
      copied: 0,
      skipped_existing: 0,
      skipped_ineligible: 0,
      failed: 0,
    });
    // #575: keyed by the stable MediaKey, not by `order`.
    expect(existsInR2).toHaveBeenCalledWith("photos/R123456/MEDIAKEY-R123456-1.jpg");
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it("skips existing objects before upload", async () => {
    const existsInR2 = jest.fn().mockResolvedValue(true);
    const uploadToR2 = jest.fn();
    const getAccessToken = jest.fn();
    const fetchFn = jest.fn();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const result = await mirrorListingMediaBatch(
      [eligibleListing],
      { execute: true, logger },
      {
        hasR2Config: () => true,
        getAccessToken: getAccessToken as never,
        existsInR2: existsInR2 as never,
        uploadToR2: uploadToR2 as never,
        fetchFn: fetchFn as never,
      },
    );

    expect(result.skipped_existing).toBe(1);
    expect(result.copied).toBe(0);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it("does not log credential values", async () => {
    const secret = "secret-access-key-that-must-not-appear";
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const existsInR2 = jest.fn().mockResolvedValue(false);
    const uploadToR2 = jest.fn();
    const getAccessToken = jest.fn().mockResolvedValue("token");
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === "content-type" ? "image/jpeg" : null),
      },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const previous = process.env.R2_ACCESS_KEY_ID;
    process.env.R2_ACCESS_KEY_ID = secret;
    try {
      await mirrorListingMediaBatch(
        [eligibleListing],
        { execute: true, logger },
        {
          hasR2Config: () => true,
          getAccessToken: getAccessToken as never,
          existsInR2: existsInR2 as never,
          uploadToR2: uploadToR2 as never,
          fetchFn: fetchFn as never,
        },
      );
    } finally {
      process.env.R2_ACCESS_KEY_ID = previous;
    }

    const logged = JSON.stringify(logger.log.mock.calls.concat(logger.warn.mock.calls, logger.error.mock.calls));
    expect(logged).not.toContain(secret);
  });
});
