/**
 * PR 3 Checkpoint 4 — R2 upload + reuse behavior.
 *
 * The function under test (`mirrorMediaToR2`) has these dependencies:
 *   - R2: `existsInR2`, `uploadToR2`, `getR2PublicUrl`
 *   - Trestle: `getAccessToken`, `fetchFn`
 *   - Neon: `prisma.listingMedia.update`
 *
 * R2 / Trestle / fetch are injected via the `MirrorMediaToR2Deps` shape so
 * tests can stub them without touching the live R2 bucket or live Trestle.
 * Prisma is mocked via `jest.mock('@/lib/prisma')` matching the pattern
 * used by Checkpoints 1-3.
 *
 * NO live R2 writes. NO live Trestle calls. NO live DB writes.
 */

import type { MirrorMediaToR2Deps, MirrorMediaToR2Row } from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockListingMediaUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      update: (args: unknown) => mockListingMediaUpdate(args),
    },
  },
}));

// Imported AFTER the prisma mock is wired up.
import { mirrorMediaToR2 } from "../media-sync";

beforeEach(() => {
  mockListingMediaUpdate.mockReset();
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<MirrorMediaToR2Row> = {}): MirrorMediaToR2Row {
  return {
    listing_id: "RLS20012345",
    media_key: "MK-1",
    media_type: "Photo",
    order: 1,
    media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    r2_key: null,
    media_url_cached: null,
    ...overrides,
  };
}

type FetchArgs = Parameters<typeof fetch>;

interface DepMocks {
  existsInR2: jest.Mock<Promise<boolean>, [string]>;
  uploadToR2: jest.Mock<Promise<string>, [string, Buffer, string]>;
  getR2PublicUrl: jest.Mock<string, [string]>;
  getAccessToken: jest.Mock<Promise<string>, []>;
  fetchFn: jest.Mock<Promise<Response>, FetchArgs>;
}

function makeDeps(overrides: Partial<DepMocks> = {}): MirrorMediaToR2Deps & DepMocks {
  const mocks: DepMocks = {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
    uploadToR2: jest
      .fn<Promise<string>, [string, Buffer, string]>()
      .mockImplementation(async (key) => `https://r2.example.com/${key}`),
    getR2PublicUrl: jest
      .fn<string, [string]>()
      .mockImplementation((key) => `https://r2.example.com/${key}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("test-token"),
    fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
      makeFetchResponse({ status: 200, contentType: "image/jpeg", body: Buffer.from("img") }),
    ),
    ...overrides,
  };
  return mocks;
}

function makeFetchResponse({
  status,
  contentType,
  body,
}: {
  status: number;
  contentType?: string;
  body?: Buffer;
}): Response {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  // Cast Buffer through Uint8Array for the lib.dom Response BodyInit type.
  const bodyInit = body ? new Uint8Array(body) : new Uint8Array(0);
  return new Response(bodyInit, { status, headers });
}

// ─── Skip path ────────────────────────────────────────────────────────────

describe("mirrorMediaToR2 — skip path", () => {
  it("skips when media_url_original is null", async () => {
    const deps = makeDeps();
    const result = await mirrorMediaToR2(makeRow({ media_url_original: null }), deps);
    expect(result).toEqual({ status: "skipped", reason: "no_media_url_original" });
    expect(deps.existsInR2).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });

  it("skips when media_url_original is empty string", async () => {
    const deps = makeDeps();
    const result = await mirrorMediaToR2(makeRow({ media_url_original: "" }), deps);
    expect(result.status).toBe("skipped");
    expect(deps.existsInR2).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });

  it("skips when media_url_original is whitespace-only", async () => {
    const deps = makeDeps();
    const result = await mirrorMediaToR2(makeRow({ media_url_original: "   " }), deps);
    expect(result.status).toBe("skipped");
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });
});

// ─── Reuse path ───────────────────────────────────────────────────────────

describe("mirrorMediaToR2 — reuse path (object already in R2)", () => {
  it("reuses existing object and writes to DB when r2_key was previously null", async () => {
    const deps = makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    });
    const result = await mirrorMediaToR2(
      makeRow({ r2_key: null, media_url_cached: null }),
      deps,
    );
    expect(result.status).toBe("reused");
    expect(result.r2_key).toBe("photos/RLS20012345/1.jpg");
    expect(result.media_url_cached).toBe("https://r2.example.com/photos/RLS20012345/1.jpg");
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(deps.getAccessToken).not.toHaveBeenCalled();
    // DB updated — drift on r2_key=null → key. Success also clears any
    // pending cooldown state from prior failures (PR `fix/listing-media-r2-cooldown-tombstone`).
    expect(mockListingMediaUpdate).toHaveBeenCalledWith({
      where: { media_key: "MK-1" },
      data: {
        r2_key: "photos/RLS20012345/1.jpg",
        media_url_cached: "https://r2.example.com/photos/RLS20012345/1.jpg",
        r2_last_attempt_at: null,
        r2_attempts: 0,
      },
    });
  });

  it("reuses without DB write when r2_key + media_url_cached already match", async () => {
    const key = "photos/RLS20012345/1.jpg";
    const url = `https://r2.example.com/${key}`;
    const deps = makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    });
    const result = await mirrorMediaToR2(
      makeRow({ r2_key: key, media_url_cached: url }),
      deps,
    );
    expect(result.status).toBe("reused");
    expect(result.r2_key).toBe(key);
    expect(result.media_url_cached).toBe(url);
    // No drift — no DB write.
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });

  it("idempotent: second call after a successful upload reuses the R2 object", async () => {
    // First run — upload path.
    const deps1 = makeDeps();
    const r1 = await mirrorMediaToR2(makeRow(), deps1);
    expect(r1.status).toBe("uploaded");
    expect(deps1.uploadToR2).toHaveBeenCalledTimes(1);
    expect(mockListingMediaUpdate).toHaveBeenCalledTimes(1);

    mockListingMediaUpdate.mockReset();

    // Second run — same row, now persisted with r2_key + media_url_cached.
    // existsInR2 returns true; no fetch, no upload, no DB write.
    const persistedRow = makeRow({
      r2_key: r1.r2_key ?? null,
      media_url_cached: r1.media_url_cached ?? null,
    });
    const deps2 = makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    });
    const r2 = await mirrorMediaToR2(persistedRow, deps2);
    expect(r2.status).toBe("reused");
    expect(deps2.uploadToR2).not.toHaveBeenCalled();
    expect(deps2.fetchFn).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });
});

// ─── Upload path ──────────────────────────────────────────────────────────

describe("mirrorMediaToR2 — upload path", () => {
  it("downloads from Trestle and uploads to R2 when no existing object", async () => {
    const deps = makeDeps();
    const result = await mirrorMediaToR2(makeRow(), deps);

    expect(result.status).toBe("uploaded");
    expect(result.r2_key).toBe("photos/RLS20012345/1.jpg");
    expect(result.media_url_cached).toBe("https://r2.example.com/photos/RLS20012345/1.jpg");

    // Trestle fetch with bearer token + image accept header.
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = deps.fetchFn.mock.calls[0];
    expect(fetchUrl).toBe("https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc");
    expect((fetchInit?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((fetchInit?.headers as Record<string, string>).Accept).toBe("image/*");

    // R2 upload happened with the buffer + content-type.
    expect(deps.uploadToR2).toHaveBeenCalledTimes(1);
    const [uploadKey, uploadBuf, uploadCT] = deps.uploadToR2.mock.calls[0];
    expect(uploadKey).toBe("photos/RLS20012345/1.jpg");
    expect(Buffer.isBuffer(uploadBuf)).toBe(true);
    expect(uploadCT).toBe("image/jpeg");

    // DB updated with r2_key + media_url_cached, plus cooldown clear.
    expect(mockListingMediaUpdate).toHaveBeenCalledWith({
      where: { media_key: "MK-1" },
      data: {
        r2_key: "photos/RLS20012345/1.jpg",
        media_url_cached: "https://r2.example.com/photos/RLS20012345/1.jpg",
        r2_last_attempt_at: null,
        r2_attempts: 0,
      },
    });
  });

  it("uses the existing r2_key when one is already set on the row (overrides derived key)", async () => {
    const deps = makeDeps();
    await mirrorMediaToR2(
      makeRow({ r2_key: "photos/RLS20012345/legacy-key.jpg" }),
      deps,
    );
    expect(deps.uploadToR2.mock.calls[0][0]).toBe("photos/RLS20012345/legacy-key.jpg");
  });

  it("update payload writes only r2_key, media_url_cached, and cooldown-clear fields (never media_url_original or other source fields)", async () => {
    const deps = makeDeps();
    await mirrorMediaToR2(makeRow(), deps);
    const updateArgs = mockListingMediaUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(updateArgs.data).sort()).toEqual(
      ["media_url_cached", "r2_attempts", "r2_key", "r2_last_attempt_at"],
    );
    // Critical boundary preservation: success path NEVER overwrites the
    // immutable source URL or any other source-of-truth field.
    expect(updateArgs.data).not.toHaveProperty("media_url_original");
    expect(updateArgs.data).not.toHaveProperty("media_type");
    expect(updateArgs.data).not.toHaveProperty("order");
    // status must NOT be set to 'deleted' on success.
    expect(updateArgs.data).not.toHaveProperty("status");
  });

  it("passes the response's content-type through to uploadToR2", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 200, contentType: "image/png", body: Buffer.from("png") }),
      ),
    });
    await mirrorMediaToR2(makeRow(), deps);
    expect(deps.uploadToR2.mock.calls[0][2]).toBe("image/png");
  });

  it("defaults content-type to image/jpeg when missing from response", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 200, body: Buffer.from("data") }),
      ),
    });
    await mirrorMediaToR2(makeRow(), deps);
    expect(deps.uploadToR2.mock.calls[0][2]).toBe("image/jpeg");
  });
});

// ─── Namespace correctness ───────────────────────────────────────────────

describe("mirrorMediaToR2 — R2 key namespace per media_type", () => {
  it("Photo → photos/", async () => {
    const deps = makeDeps();
    const r = await mirrorMediaToR2(makeRow({ media_type: "Photo" }), deps);
    expect(r.r2_key?.startsWith("photos/")).toBe(true);
  });

  it("FloorPlan → floorplans/", async () => {
    const deps = makeDeps();
    const r = await mirrorMediaToR2(makeRow({ media_type: "FloorPlan" }), deps);
    expect(r.r2_key?.startsWith("floorplans/")).toBe(true);
  });

  it("Video → videos/", async () => {
    const deps = makeDeps();
    const r = await mirrorMediaToR2(makeRow({ media_type: "Video" }), deps);
    expect(r.r2_key?.startsWith("videos/")).toBe(true);
  });

  it("VirtualTour → virtualtours/", async () => {
    const deps = makeDeps();
    const r = await mirrorMediaToR2(makeRow({ media_type: "VirtualTour" }), deps);
    expect(r.r2_key?.startsWith("virtualtours/")).toBe(true);
  });

  it("unknown media_type defaults to photos/ (matches resolver convention)", async () => {
    const deps = makeDeps();
    const r = await mirrorMediaToR2(makeRow({ media_type: "Unknown" }), deps);
    expect(r.r2_key?.startsWith("photos/")).toBe(true);
  });
});

// ─── Failure paths — cooldown + N-strikes contract ────────────────────────
//
// New contract (added 2026-05-10): EVERY failure path writes a cooldown
// update setting `r2_last_attempt_at = NOW()` and incrementing `r2_attempts`.
// 5xx, network, R2-side, token-side, and non-image-content-type failures
// increment the counter but NEVER tombstone. Only HTTP 4xx with reason
// `fetch_failed` AND attempts >= 3 sets `status='deleted'`.
//
// Helper: assert the failure-path DB update has the cooldown shape.
function expectFailureDbUpdate(
  call: unknown,
  opts: { expectTombstone?: boolean; expectedAttempts: number },
) {
  const args = call as { where: { media_key: string }; data: Record<string, unknown> };
  expect(args.where).toEqual({ media_key: "MK-1" });
  expect(args.data.r2_last_attempt_at).toBeInstanceOf(Date);
  expect(args.data.r2_attempts).toBe(opts.expectedAttempts);
  if (opts.expectTombstone) {
    expect(args.data.status).toBe("deleted");
  } else {
    expect(args.data).not.toHaveProperty("status");
  }
  // Boundary: failure path NEVER touches r2_key, media_url_cached, or media_url_original.
  expect(args.data).not.toHaveProperty("r2_key");
  expect(args.data).not.toHaveProperty("media_url_cached");
  expect(args.data).not.toHaveProperty("media_url_original");
}

describe("mirrorMediaToR2 — failure paths set cooldown; HTTP 4xx after 3 attempts tombstones", () => {
  it("Trestle 404 (1st attempt) → fetch_failed, sets cooldown, increments attempts to 1, NO tombstone", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 404 }),
      ),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: null }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("fetch_failed");
    expect(result.error).toBe("HTTP 404");
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).toHaveBeenCalledTimes(1);
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 1,
      expectTombstone: false,
    });
  });

  it("Trestle 404 (3rd attempt) → tombstones with status='deleted'", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 404 }),
      ),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("fetch_failed");
    expect(result.error).toBe("HTTP 404");
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: true,
    });
  });

  it("Trestle 403 (3rd attempt) → tombstones (any 4xx after 3 attempts)", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 403 }),
      ),
    });
    await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: true,
    });
  });

  it("Trestle 500 (3rd attempt) → increments cooldown but does NOT tombstone (5xx are transient)", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 500 }),
      ),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("fetch_failed");
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("non-image content-type (3rd attempt) → cooldown, NO tombstone (not a 4xx)", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 200, contentType: "text/html", body: Buffer.from("<html>") }),
      ),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("non_image_content_type");
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("network error during fetch (3rd attempt) → cooldown, NO tombstone (network errors are transient)", async () => {
    const deps = makeDeps({
      fetchFn: jest
        .fn<Promise<Response>, FetchArgs>()
        .mockRejectedValue(new Error("ECONNRESET")),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("fetch_threw");
    expect(result.error).toBe("ECONNRESET");
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("R2 upload failure (3rd attempt) → cooldown, NO tombstone (R2-side error)", async () => {
    const deps = makeDeps({
      uploadToR2: jest
        .fn<Promise<string>, [string, Buffer, string]>()
        .mockRejectedValue(new Error("R2 quota exceeded")),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("upload_failed");
    expect(result.error).toBe("R2 quota exceeded");
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("R2 head failure (3rd attempt) → cooldown, NO tombstone (R2-side error, no Trestle call)", async () => {
    const deps = makeDeps({
      existsInR2: jest
        .fn<Promise<boolean>, [string]>()
        .mockRejectedValue(new Error("403 Forbidden")),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("r2_head_failed");
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("Trestle token failure (3rd attempt) → cooldown, NO tombstone (auth-side error)", async () => {
    const deps = makeDeps({
      getAccessToken: jest
        .fn<Promise<string>, []>()
        .mockRejectedValue(new Error("auth server unreachable")),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("token_failed");
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("`skipped` (no media_url_original) writes NO DB update (cooldown not relevant)", async () => {
    const deps = makeDeps();
    const result = await mirrorMediaToR2(
      makeRow({ media_url_original: null }),
      deps,
    );
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_media_url_original");
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });

  it("undefined r2_attempts (legacy row) treated as 0 — first 4xx increments to 1 without tombstone", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 404 }),
      ),
    });
    // r2_attempts undefined (existing schema rows pre-migration)
    const row = makeRow();
    delete (row as Record<string, unknown>).r2_attempts;
    await mirrorMediaToR2(row, deps);
    expectFailureDbUpdate(mockListingMediaUpdate.mock.calls[0][0], {
      expectedAttempts: 1,
      expectTombstone: false,
    });
  });
});
