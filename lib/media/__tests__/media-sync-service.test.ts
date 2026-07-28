import {
  buildMediaR2Key,
  canMirrorListingMedia,
  classifyTrestleMediaCategory,
  encodeR2Segment,
  getMediaKey,
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
      // #575: MediaKey is the object identity. Items without one are skipped
      // fail-closed rather than keyed by `order`.
      media_key: "MEDIAKEY-R123456-A",
    },
  ],
};

describe("media sync service", () => {
  it("builds deterministic R2 keys addressed by MediaKey", () => {
    expect(buildMediaR2Key("R-1234", "FloorPlan", "MK-700")).toBe("floorplans/R-1234/MK-700.jpg");
    expect(buildMediaR2Key("R-1234", "Photo", "MK-001")).toBe("photos/R-1234/MK-001.jpg");
  });

  // ══ #575 — Order is presentation, MediaKey is identity ══════════════════
  // Trestle reassigns `Order` whenever a gallery is reordered. Keying on it
  // meant an UNCHANGED asset got a new key after a reorder, so identical bytes
  // were re-uploaded under a new name and the old object was orphaned — one
  // duplicate per reorder, forever.
  describe("#575 — MediaKey is the stable R2 object identity", () => {
    it("(1) same MediaKey yields the same key after gallery reordering", () => {
      // The asset moved from position 1 to position 9; identity is unchanged.
      const atPosition1 = buildMediaR2Key("RLS123", "Photo", "MK-ABC");
      const atPosition9 = buildMediaR2Key("RLS123", "Photo", "MK-ABC");
      expect(atPosition9).toBe(atPosition1);
      expect(atPosition1).toBe("photos/RLS123/MK-ABC.jpg");
    });

    it("(2) different MediaKeys at the same Order yield different keys", () => {
      // The old scheme collapsed both of these to `photos/RLS123/1.jpg`.
      expect(buildMediaR2Key("RLS123", "Photo", "MK-AAA")).not.toBe(
        buildMediaR2Key("RLS123", "Photo", "MK-BBB"),
      );
    });

    it("(3) a derived key contains no presentation ordinal as identity", () => {
      expect(buildMediaR2Key("RLS123", "Photo", "MK-ABC")).not.toMatch(/\/-?\d+\.jpg$/);
    });

    it("(4) missing MediaKey fails closed instead of falling back to Order", () => {
      expect(() => buildMediaR2Key("RLS123", "Photo", "")).toThrow(/mediaKey is required/i);
      expect(() => buildMediaR2Key("RLS123", "Photo", "   ")).toThrow(/mediaKey is required/i);
      expect(() =>
        buildMediaR2Key("RLS123", "Photo", undefined as unknown as string),
      ).toThrow(/mediaKey is required/i);
    });

    it("(9) sanitised identifiers cannot escape their R2 prefix", () => {
      const key = buildMediaR2Key("RLS123", "Photo", "../../etc/passwd");
      expect(key.startsWith("photos/RLS123/")).toBe(true);
      // Exactly two separators: the prefix and the id/key boundary.
      expect(key.split("/").length).toBe(3);
      expect(key).not.toContain("..");
    });

    // The encoding used for identity must be INJECTIVE. A lossy sanitiser such
    // as `replace(/[^a-zA-Z0-9_-]/g, "_")` maps "MK/1" and "MK_1" onto the same
    // string, so two distinct assets would silently share one object — exactly
    // the class of bug #575 exists to remove.
    it("(2b) distinct MediaKeys never collide after encoding", () => {
      const raw = ["MK/1", "MK_1", "MK 1", "MK-1", "MK.1", "MK~1", "MK%1", "mk1", "MK1"];
      const encoded = raw.map((k) => buildMediaR2Key("RLS123", "Photo", k));
      expect(new Set(encoded).size).toBe(raw.length);
    });

    it("(2c) distinct listing ids never collide after encoding", () => {
      const raw = ["R-12/34", "R-12_34", "R-12 34"];
      const encoded = raw.map((id) => buildMediaR2Key(id, "Photo", "MK-1"));
      expect(new Set(encoded).size).toBe(raw.length);
    });

    it("encodeR2Segment is injective and leaves safe characters untouched", () => {
      expect(encodeR2Segment("Abc-123_XY")).toBe("Abc-123_XY");
      expect(encodeR2Segment("a/b")).toBe("a~2Fb");
      expect(encodeR2Segment("~")).toBe("~7E");
      // The escape character itself is escaped, so encoding stays unambiguous.
      expect(encodeR2Segment("~2F")).not.toBe(encodeR2Segment("/"));
    });

    // REGRESSION PIN (Codex review of #583): the fail-closed filter must never
    // present as a silent no-op.
    //
    // The legacy `listings.media` JSON column CANNOT carry a MediaKey — every
    // producer (lib/idx/trestle-mapper.ts, the batch writers in lib/idx/sync.ts)
    // serialises only {url, mediaType, order}. Verified against canonical
    // production 2026-07-28 (read-only): across 86,460 media JSON elements the
    // keys are url/order/mediaType/Order/MediaCategory/MediaURL — MediaKey
    // appears ZERO times.
    //
    // Feeding that shape in must therefore report the skip EXPLICITLY, so an
    // operator can never read `scanned_media: 0` as "nothing to do". The real
    // fix is upstream: scripts/sync-listing-media-r2.ts now sources media from
    // `listing_media`, where media_key is unique and 100% populated.
    it("production-shaped JSON media (no MediaKey) is COUNTED and WARNED, never silently dropped", async () => {
      const warn = jest.fn();
      const legacyShapeListing: MediaSyncListing = {
        ...eligibleListing,
        media: [
          // Exactly the production JSON shape — no MediaKey in any spelling.
          { url: "https://api.cotality.com/media/a.jpg", mediaType: "Photo", order: 0 },
          { url: "https://api.cotality.com/media/b.jpg", mediaType: "Photo", order: 1 },
        ],
      };
      const result = await mirrorListingMediaBatch(
        [legacyShapeListing],
        { execute: false, logger: { warn, log: jest.fn(), error: jest.fn() } },
        {
          hasR2Config: () => true,
          getAccessToken: jest.fn() as never,
          existsInR2: jest.fn() as never,
          uploadToR2: jest.fn() as never,
          fetchFn: jest.fn() as never,
        },
      );

      expect(result.skipped_no_media_key).toBe(2);
      expect(result.scanned_media).toBe(0);
      expect(result.would_copy).toBe(0);
      expect(result.copied).toBe(0);
      // The operator must be told why, and where to source media from.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no MediaKey"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("listing_media"));
    });

    it("relational-shaped media (media_key present) mirrors normally", async () => {
      const result = await mirrorListingMediaBatch(
        [eligibleListing],
        { execute: false, logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() } },
        {
          hasR2Config: () => true,
          getAccessToken: jest.fn() as never,
          existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false) as never,
          uploadToR2: jest.fn() as never,
          fetchFn: jest.fn() as never,
        },
      );
      expect(result.skipped_no_media_key).toBe(0);
      expect(result.scanned_media).toBe(1);
    });

    it("getMediaKey reads both Trestle and DB spellings, else null", () => {
      expect(getMediaKey({ MediaKey: "MK-1" })).toBe("MK-1");
      expect(getMediaKey({ media_key: "MK-2" })).toBe("MK-2");
      expect(getMediaKey({ MediaKey: "  MK-3  " })).toBe("MK-3");
      expect(getMediaKey({})).toBeNull();
      expect(getMediaKey({ MediaKey: "" })).toBeNull();
      expect(getMediaKey({ MediaKey: "   " })).toBeNull();
      // `order` must never be mistaken for identity.
      expect(getMediaKey({ order: 1 } as never)).toBeNull();
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
    // (8) Retained from the 2026-05-01 floor-plan-as-photo incident. Under
    // MediaKey a cross-type collision is already impossible, so these now
    // assert the folder ROUTING itself — using the SAME key across both types,
    // which is strictly stronger than the original Order=1/Order=1 case.
    // These prefixes must stay in sync with LISTING_MEDIA_PREFIXES in
    // lib/ops/r2-orphan-plan.ts, which keys its safety filters off them.
    it("the same MediaKey under different media types produces DISTINCT keys", () => {
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

    it("routes Video and VirtualTour to their own prefixes", () => {
      expect(buildMediaR2Key("RLS123", "Video", "MK-1")).toBe("videos/RLS123/MK-1.jpg");
      expect(buildMediaR2Key("RLS123", "VirtualTour", "MK-1")).toBe("virtualtours/RLS123/MK-1.jpg");
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
    expect(existsInR2).toHaveBeenCalledWith("photos/R123456/MEDIAKEY-R123456-A.jpg");
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
