import {
  buildMediaR2Key,
  canMirrorListingMedia,
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
    },
  ],
};

describe("media sync service", () => {
  it("builds deterministic R2 keys", () => {
    expect(buildMediaR2Key("R-12/34", "FloorPlan", 7)).toBe("floorplans/R-12_34/7.jpg");
    expect(buildMediaR2Key("R-12/34", "Photo", 0)).toBe("photos/R-12_34/0.jpg");
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
    expect(existsInR2).toHaveBeenCalledWith("photos/R123456/1.jpg");
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
