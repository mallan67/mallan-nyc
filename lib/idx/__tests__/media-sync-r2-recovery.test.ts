/**
 * Phase 3 — missing-R2 recovery contract.
 *
 * The write-suppression stops refreshing `media_url_original` once a row looks
 * delivered (`r2_key` + `media_url_cached` set). But those DB columns do NOT
 * prove the R2 object still exists. If the object is missing/corrupt, recovery
 * must re-mirror WITHOUT depending on the frozen (stale/expired) stored signed
 * URL — it reacquires the CURRENT feed URL by MediaKey and re-fetches from that.
 *
 * Failing-first: pre-Phase-3, mirror fetched from the stored `media_url_original`
 * and there was no `recoverMissingR2Object` / `current_feed_url` seam.
 */

const mockUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      update: (a: unknown) => mockUpdate(a),
    },
  },
}));

import {
  recoverMissingR2Object,
  mirrorMediaToR2,
  type MediaRecoveryCandidate,
  type MirrorMediaToR2Deps,
} from "../media-sync";

const STORED_STALE_URL = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/EXPIRED-OLD";
const FRESH_FEED_URL = "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/FRESH-NEW";
const R2_KEY = "photos/RLS20012345/MK-1/0.jpg";

function makeDeps(over: Partial<MirrorMediaToR2Deps> = {}): MirrorMediaToR2Deps {
  return {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    uploadToR2: jest.fn<Promise<string>, [string, Buffer, string]>().mockImplementation(async (k) => `https://r2.example.com/${k}`),
    getR2PublicUrl: jest.fn<string, [string]>().mockImplementation((k) => `https://r2.example.com/${k}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("tok"),
    fetchFn: jest.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch,
    ...over,
  };
}

function candidate(over: Partial<MediaRecoveryCandidate> = {}): MediaRecoveryCandidate {
  return {
    media_key: "MK-1",
    media_type: "Photo",
    order: 0,
    r2_key: R2_KEY,
    media_url_cached: `https://r2.example.com/${R2_KEY}`,
    current_feed_url: FRESH_FEED_URL,
    ...over,
  };
}

beforeEach(() => mockUpdate.mockReset());

describe("recoverMissingR2Object — object PRESENT (drift-safe no-op)", () => {
  it("does not fetch, upload, or write when the object still exists and cache matches", async () => {
    const deps = makeDeps({ existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true) });
    const r = await recoverMissingR2Object("RLS20012345", candidate(), deps);
    expect(r.status).toBe("reused");
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled(); // no material change, no cache drift
  });
});

describe("recoverMissingR2Object — object MISSING (reacquire + re-mirror by MediaKey)", () => {
  it("re-fetches from the FRESH feed URL (never the stored URL) and re-uploads", async () => {
    const deps = makeDeps({ existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false) });
    const r = await recoverMissingR2Object("RLS20012345", candidate(), deps);

    expect(r.status).toBe("uploaded");
    // The fetch used the CURRENT feed URL, reacquired by MediaKey this run.
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
    expect((deps.fetchFn as jest.Mock).mock.calls[0][0]).toBe(FRESH_FEED_URL);
    // Re-uploaded to the SAME r2 key.
    expect(deps.uploadToR2).toHaveBeenCalledTimes(1);
    expect((deps.uploadToR2 as jest.Mock).mock.calls[0][0]).toBe(R2_KEY);
  });

  it("writes ONLY r2 delivery columns — never a material field, never media_url_original", async () => {
    const deps = makeDeps({ existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false) });
    await recoverMissingR2Object("RLS20012345", candidate(), deps);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const data = (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual(["media_url_cached", "r2_attempts", "r2_key", "r2_last_attempt_at"].sort());
    // Material identity fields are NEVER touched by recovery.
    for (const forbidden of ["media_type", "media_category", "order", "preferred_photo_yn", "status", "media_url_original", "media_modification_ts"]) {
      expect(data).not.toHaveProperty(forbidden);
    }
  });

  it("recovery cannot fall back to the stored stale URL — the candidate carries only the fresh feed URL", async () => {
    // The recovery path passes media_url_original: null internally; if the fresh
    // feed URL were absent the mirror would skip (nothing to fetch), never reach
    // for a stale stored URL. Prove that: an EMPTY fresh URL → skipped, no fetch.
    const deps = makeDeps({ existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false) });
    const r = await recoverMissingR2Object("RLS20012345", candidate({ current_feed_url: "" }), deps);
    expect(r.status).toBe("skipped");
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });
});

describe("mirrorMediaToR2 — prefers the fresh feed URL over the stored URL for the fetch", () => {
  it("fetches current_feed_url even when a (stale) media_url_original is present", async () => {
    const deps = makeDeps({ existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false) });
    await mirrorMediaToR2(
      {
        listing_id: "RLS20012345",
        media_key: "MK-1",
        media_type: "Photo",
        order: 0,
        media_url_original: STORED_STALE_URL, // stale — must be ignored
        current_feed_url: FRESH_FEED_URL, // fresh — must win
        r2_key: R2_KEY,
        media_url_cached: `https://r2.example.com/${R2_KEY}`,
      },
      deps,
    );
    expect((deps.fetchFn as jest.Mock).mock.calls[0][0]).toBe(FRESH_FEED_URL);
    expect((deps.fetchFn as jest.Mock).mock.calls[0][0]).not.toBe(STORED_STALE_URL);
  });

  it("falls back to media_url_original only when no fresh feed URL is supplied", async () => {
    const deps = makeDeps({ existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false) });
    await mirrorMediaToR2(
      {
        listing_id: "RLS20012345",
        media_key: "MK-1",
        media_type: "Photo",
        order: 0,
        media_url_original: STORED_STALE_URL,
        r2_key: R2_KEY,
        media_url_cached: null,
      },
      deps,
    );
    expect((deps.fetchFn as jest.Mock).mock.calls[0][0]).toBe(STORED_STALE_URL);
  });
});
