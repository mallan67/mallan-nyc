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
import { createRawUpdateStore, type FailureWrite } from "./raw-failure-write-store";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockListingMediaUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdateMany = jest.fn<Promise<unknown>, [unknown]>();

/**
 * PR #584. Failure bookkeeping is ONE parameterized `UPDATE ... RETURNING`, so
 * there is no longer a Prisma object to inspect. This store EXECUTES the
 * statement, and the failure assertions below read the STORED ROW — the
 * committed outcome, which is strictly stronger than the previous
 * requested-payload assertions.
 *
 * `startingAttempts` lets a row materialise at the counter value its fixture
 * declares. It is consulted only the FIRST time a media_key is touched, so a
 * test that fails the same row repeatedly keeps accumulating against the value
 * the database actually stored.
 */
let startingAttempts: number | null = null;
const store = createRawUpdateStore(() => ({ r2_attempts: startingAttempts }));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      update: (args: unknown) => mockListingMediaUpdate(args),
      updateMany: (args: unknown) => mockListingMediaUpdateMany(args),
    },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      store.exec(strings, values),
  },
}));

// Imported AFTER the prisma mock is wired up.
import {
  mirrorMediaToR2,
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from "../media-sync";

beforeEach(() => {
  mockListingMediaUpdate.mockReset();
  mockListingMediaUpdateMany.mockReset();
  store.reset();
  startingAttempts = null;
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<MirrorMediaToR2Row> = {}): MirrorMediaToR2Row {
  // The fixture's counter is also the value the row materialises at in the
  // store, so the database-side arithmetic starts from the same number the
  // caller's snapshot declares. Fixtures themselves are unchanged.
  if ("r2_attempts" in overrides) startingAttempts = overrides.r2_attempts ?? null;
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
    expect(result.r2_key).toBe("photos/RLS20012345/MK-1.jpg");
    expect(result.media_url_cached).toBe("https://r2.example.com/photos/RLS20012345/MK-1.jpg");
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(deps.getAccessToken).not.toHaveBeenCalled();
    // DB updated — drift on r2_key=null → key. Success also clears any
    // pending cooldown state from prior failures (PR `fix/listing-media-r2-cooldown-tombstone`).
    expect(mockListingMediaUpdate).toHaveBeenCalledWith({
      where: { media_key: "MK-1" },
      data: {
        r2_key: "photos/RLS20012345/MK-1.jpg",
        media_url_cached: "https://r2.example.com/photos/RLS20012345/MK-1.jpg",
        r2_last_attempt_at: null,
        r2_attempts: 0,
      },
    });
  });

  // #575 (5)(6) MIGRATION SAFETY: this key is deliberately in the LEGACY
  // Order-based format. It proves that switching object identity to MediaKey
  // does NOT recompute — and therefore does NOT rename, copy or re-upload —
  // media that is already mirrored, and does NOT rewrite the stored r2_key.
  // All 309,430 already-mirrored production rows take this path, so the new
  // scheme deploys with no re-upload wave and no duplication.
  // Do NOT "modernise" this literal to the MediaKey format — that deletes the
  // guard.
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

  it("(5)(6) a LEGACY Order-based r2_key is never re-derived, re-uploaded, or rewritten", async () => {
    const legacyKey = "photos/RLS20012345/1.jpg";
    const url = `https://r2.example.com/${legacyKey}`;
    const deps = makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    });
    const result = await mirrorMediaToR2(
      makeRow({ media_key: "MK-1", r2_key: legacyKey, media_url_cached: url }),
      deps,
    );
    // The row HAS a MediaKey, so a naive implementation would recompute the key
    // as photos/RLS20012345/MK-1.jpg and upload a duplicate. It must not.
    expect(result.r2_key).toBe(legacyKey);
    expect(result.r2_key).not.toContain("MK-1");
    expect(deps.existsInR2).toHaveBeenCalledWith(legacyKey);
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });

  it("(7) signed-query rotation on media_url_original does not upload again", async () => {
    // Trestle re-signs media URLs; the query string changes every cycle. The
    // object key is derived from IDENTITY, never from the URL, so a rotated
    // signature must not produce a new object or a new upload.
    const legacyKey = "photos/RLS20012345/1.jpg";
    const url = `https://r2.example.com/${legacyKey}`;
    const deps = makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    });
    const rotated = makeRow({
      media_key: "MK-1",
      r2_key: legacyKey,
      media_url_cached: url,
      media_url_original:
        "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc?sig=ROTATED&expires=9999",
    });
    const result = await mirrorMediaToR2(rotated, deps);
    expect(result.status).toBe("reused");
    expect(result.r2_key).toBe(legacyKey);
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    expect(mockListingMediaUpdate).not.toHaveBeenCalled();
  });

  it("(10) the derived key comes from the row's real MediaKey, not a renamed Order", async () => {
    const deps = makeDeps();
    // order and media_key deliberately disagree: order=1, MediaKey='MK-REAL'.
    const result = await mirrorMediaToR2(
      makeRow({ media_key: "MK-REAL", order: 1, r2_key: null, media_url_cached: null }),
      deps,
    );
    expect(result.r2_key).toBe("photos/RLS20012345/MK-REAL.jpg");
    expect(deps.uploadToR2).toHaveBeenCalledWith(
      "photos/RLS20012345/MK-REAL.jpg",
      expect.anything(),
      expect.any(String),
    );
  });

  it("(4) fails closed with no_media_key when there is neither r2_key nor media_key", async () => {
    const deps = makeDeps();
    const result = await mirrorMediaToR2(
      makeRow({ media_key: "", r2_key: null, media_url_cached: null }),
      deps,
    );
    expect(result).toEqual({ status: "skipped", reason: "no_media_key" });
    expect(deps.existsInR2).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
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
    expect(result.r2_key).toBe("photos/RLS20012345/MK-1.jpg");
    expect(result.media_url_cached).toBe("https://r2.example.com/photos/RLS20012345/MK-1.jpg");

    // Trestle fetch with bearer token + image accept header.
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = deps.fetchFn.mock.calls[0];
    expect(fetchUrl).toBe("https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc");
    expect((fetchInit?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((fetchInit?.headers as Record<string, string>).Accept).toBe("image/*");

    // R2 upload happened with the buffer + content-type.
    expect(deps.uploadToR2).toHaveBeenCalledTimes(1);
    const [uploadKey, uploadBuf, uploadCT] = deps.uploadToR2.mock.calls[0];
    expect(uploadKey).toBe("photos/RLS20012345/MK-1.jpg");
    expect(Buffer.isBuffer(uploadBuf)).toBe(true);
    expect(uploadCT).toBe("image/jpeg");

    // DB updated with r2_key + media_url_cached, plus cooldown clear.
    expect(mockListingMediaUpdate).toHaveBeenCalledWith({
      where: { media_key: "MK-1" },
      data: {
        r2_key: "photos/RLS20012345/MK-1.jpg",
        media_url_cached: "https://r2.example.com/photos/RLS20012345/MK-1.jpg",
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
// increment the counter but NEVER tombstone. Only **permanent** HTTP 4xx
// (404 or 410) with reason `fetch_failed` AND attempts >= 3 sets
// `status='deleted'`. Transient/ambiguous 4xx (403/408/425/429 etc.) are
// cooldown-only — see Codex review on PR #100.
//
/**
 * Assert the counter reached `expectedAttempts` IN THE STORED ROW.
 *
 * Previously this asserted the SHAPE of the Prisma statement (`increment: 1`
 * guarded by `lt: R2_RETRY_EXHAUSTED_THRESHOLD`, or a still-NULL-guarded
 * literal 1). Both shapes are gone: the bound and the arithmetic now live in
 * one parameterized statement, and the still-NULL guard was itself the proven
 * NULL-undercount defect. Asserting the stored number instead proves the
 * outcome the shape was only evidence for.
 */
function expectBoundedAttemptAdvance(expectedAttempts: number) {
  const write = store.writesFor("MK-1")[0];
  expect(write).toBeDefined();
  expect(write!.matched).toBe(true);
  expect(write!.after.r2_attempts).toBe(expectedAttempts);
  // The counter is never a JS-computed literal: it is derived by the statement
  // from the value stored before it ran.
  expect(write!.after.r2_attempts).not.toBe(write!.before.r2_attempts);
}

// Helper: assert the failure path committed the cooldown, counter and status
// as ONE write, and assert the RESULTING STORED ROW.
function expectFailureDbUpdate(
  write: FailureWrite | undefined,
  opts: { expectTombstone?: boolean; expectedAttempts: number },
) {
  expect(write).toBeDefined();
  expect(write!.media_key).toBe("MK-1");
  expect(write!.matched).toBe(true);
  expect(write!.after.r2_last_attempt_at).toBeInstanceOf(Date);
  expectBoundedAttemptAdvance(opts.expectedAttempts);
  if (opts.expectTombstone) {
    expect(write!.after.status).toBe("deleted");
  } else {
    // Stronger than the old "no status key in the payload": the row is proven
    // to still be active after the write.
    expect(write!.after.status).toBe("active");
  }
  // Boundary: the failure path NEVER touches r2_key or media_url_cached.
  // (`media_url_original` is not a column this statement may write at all —
  // the store throws "Unmodelled column in SET" if any statement tries.)
  expect(write!.after.r2_key).toBeNull();
  expect(write!.after.media_url_cached).toBeNull();
  // Parameterization: the media key travels as a BOUND VALUE, never SQL text.
  expect(write!.params).toContain("MK-1");
}

describe("mirrorMediaToR2 — failure paths set cooldown; permanent 4xx (404/410) after 3 attempts tombstones", () => {
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
    // Exactly ONE failure write — cooldown, counter and status commit together.
    expect(store.writesFor("MK-1")).toHaveLength(1);
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
      expectedAttempts: 3,
      expectTombstone: true,
    });
  });

  it("Trestle 403 (3rd attempt) → cooldown only, does NOT tombstone (403 is ambiguous, not permanent)", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 403 }),
      ),
    });
    await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
      expectedAttempts: 3,
      expectTombstone: false,
    });
  });

  it("Trestle 410 (3rd attempt) → tombstones (Gone is RFC-correct permanent)", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 410 }),
      ),
    });
    await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
      expectedAttempts: 3,
      expectTombstone: true,
    });
  });

  it("Trestle 429 (3rd attempt) → cooldown only, does NOT tombstone (rate-limit is transient — Trestle 480/min ceiling regression guard)", async () => {
    const deps = makeDeps({
      fetchFn: jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(
        makeFetchResponse({ status: 429 }),
      ),
    });
    await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), deps);
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
      expectedAttempts: 3,
      expectTombstone: false,
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
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
    delete row.r2_attempts;
    await mirrorMediaToR2(row, deps);
    expectFailureDbUpdate(store.writesFor("MK-1")[0], {
      expectedAttempts: 1,
      expectTombstone: false,
    });
  });
});

// ─── r2_attempts terminal-state safety ────────────────────────────────────
//
// THE DEFECT: the failure path wrote `(row.r2_attempts ?? 0) + 1` — an
// UNBOUNDED read-modify-write. Nothing stopped the counter passing its
// terminal sentinels, and the value was computed in JS from a possibly stale
// batch read, then written blind.
//
// Production carries 80 rows above 9 (max 112), every one last touched
// between 2026-05-13 and 2026-06-10 — before today's selection predicates
// existed. They are frozen, not growing (neither selector matches >8), but the
// arithmetic that produced them was still in the code.
//
// Counter contract:
//   NULL / 1..7  ordinary consecutive-failure count
//   8            retry-exhausted TERMINAL (R2_RETRY_EXHAUSTED_THRESHOLD)
//   9            policy-parked TERMINAL (R2_POLICY_PARKED_ATTEMPTS) — ASSIGNED
//                by the policy updateMany, never reached by arithmetic
//   >9           legacy overflow; no current path can produce it
//
// The advance is now bounded BY THE DATABASE: the `lt` guard and the increment
// are one atomic statement, so neither a stale read nor a concurrent worker can
// cross the bound.
describe("r2_attempts — terminal-state-safe advance", () => {
  const failingDeps = () =>
    makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
      fetchFn: jest
        .fn<Promise<Response>, FetchArgs>()
        .mockResolvedValue(makeFetchResponse({ status: 500 })),
    });

  /**
   * The STORED row. Every assertion in this block reads it, because the bound
   * now lives inside the failure statement rather than in a Prisma predicate —
   * so the resulting number IS the safety property, not evidence for it.
   */
  const storedRow = () => store.row("MK-1");

  it("(1) the final ordinary retry reaches retry-exhausted EXACTLY", async () => {
    // Stored 7 → the database-side advance lands on exactly 8, and the bound
    // carried in the same statement is what forbids it going further on any
    // subsequent pass.
    await mirrorMediaToR2(makeRow({ r2_attempts: 7 }), failingDeps());
    expect(storedRow().r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    // A transient 500 must never tombstone.
    expect(storedRow().status).toBe("active");
  });

  it("(2) another failure leaves retry-exhausted UNCHANGED", async () => {
    // Stored 8. The statement IS still issued (the cooldown is refreshed), but
    // the bound is re-evaluated against the current stored value, so the
    // counter does not move. Asserting the stored number is what makes the
    // no-op true in the database rather than in JS.
    await mirrorMediaToR2(makeRow({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }), failingDeps());
    expect(storedRow().r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    // Non-vacuous: a write really happened, it simply could not cross 8.
    expect(store.writesFor("MK-1")).toHaveLength(1);
    expect(storedRow().r2_last_attempt_at).toBeInstanceOf(Date);
  });

  it("(3) a policy-parked row remains EXACTLY policy-parked", async () => {
    // Stored 9. It is neither incremented to 10 nor pulled back down to 8.
    await mirrorMediaToR2(makeRow({ r2_attempts: R2_POLICY_PARKED_ATTEMPTS }), failingDeps());
    expect(storedRow().r2_attempts).toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(R2_POLICY_PARKED_ATTEMPTS).toBeGreaterThanOrEqual(R2_RETRY_EXHAUSTED_THRESHOLD);
  });

  it("(6) a value already ABOVE the sentinel cannot be incremented again", async () => {
    // The legacy overflow population (10..112). They are excluded from the
    // advance and left EXACTLY as found — no silent normalisation, which is
    // what keeps the 80 frozen production rows untouched.
    for (const start of [10, 11, 112]) {
      store.reset();
      await mirrorMediaToR2(makeRow({ r2_attempts: start }), failingDeps());
      expect(storedRow().r2_attempts).toBe(start);
      // Neither incremented nor normalised down to a sentinel.
      expect(storedRow().r2_attempts).not.toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
      expect(storedRow().r2_attempts).not.toBe(R2_POLICY_PARKED_ATTEMPTS);
    }
  });

  it("(7) repeated processing cannot produce 10, 11 or higher", async () => {
    // Ten consecutive failures against a row already at the terminal. The bound
    // is re-evaluated by the database inside the same statement as the
    // arithmetic, so no sequence of them can cross it, and a stale JS read
    // cannot widen it.
    for (let i = 0; i < 10; i++) {
      await mirrorMediaToR2(makeRow({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }), failingDeps());
    }
    expect(storedRow().r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    // Non-vacuous: all ten statements were genuinely issued against the row,
    // and not one of them moved the counter.
    expect(store.writesFor("MK-1")).toHaveLength(10);
    for (const write of store.writesFor("MK-1")) {
      expect(write.after.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    }
  });

  it("first failure on a NULL counter stores 1, and two concurrent first failures store 2", async () => {
    await mirrorMediaToR2(makeRow({ r2_attempts: null }), failingDeps());
    expect(storedRow().r2_attempts).toBe(1);

    // The previous implementation guarded this write with
    // `WHERE r2_attempts IS NULL`, on the reasoning that a concurrent worker
    // "cannot be reset back to 1". That guard WAS the NULL-undercount defect:
    // the second worker matched zero rows, so a real second failure was
    // silently discarded and the row stored 1 for two failures. The correct
    // contract is the stored count.
    store.reset();
    const staleSnapshot = () => makeRow({ r2_attempts: null });
    await mirrorMediaToR2(staleSnapshot(), failingDeps());
    await mirrorMediaToR2(staleSnapshot(), failingDeps());
    expect(storedRow().r2_attempts).toBe(2);
  });

  it("(5) success resets the counter per the existing contract", async () => {
    const deps = makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    });
    const result = await mirrorMediaToR2(makeRow({ r2_attempts: 5 }), deps);
    expect(result.status).toBe("reused");
    // Reset stays on the unique-key `update` path and is unchanged by this fix.
    expect(mockListingMediaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { media_key: "MK-1" },
        data: expect.objectContaining({ r2_attempts: 0, r2_last_attempt_at: null }),
      }),
    );
  });

  it("recovery attempts still never advance the counter", async () => {
    await mirrorMediaToR2(
      makeRow({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }),
      failingDeps(),
      { recoveryAttempt: true },
    );
    // The counter stays exactly at the exhaustion threshold; only the cooldown
    // is refreshed, which is what restarts the long recovery window. The #534
    // sentinel (threshold + 1) is never written by any failure path.
    expect(storedRow().r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(storedRow().r2_attempts).not.toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(storedRow().r2_last_attempt_at).toBeInstanceOf(Date);
    // Transient recovery failure — still active.
    expect(storedRow().status).toBe("active");
  });
});

// ─── Stored-value proofs of the terminal bound ───────────────────────
//
// The tests above already read the stored row. These two exist for the
// ARITHMETIC and the CONCURRENCY property specifically: that the resulting
// number is derived by the database from the value stored at the moment the
// statement runs, so two workers carrying the same stale snapshot cannot both
// push a row past its terminal.
describe("r2_attempts — simulated-database arithmetic", () => {
  const transientFailureDeps = () =>
    makeDeps({
      existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
      fetchFn: jest
        .fn<Promise<Response>, FetchArgs>()
        // 500 is TRANSIENT — must never tombstone.
        .mockResolvedValue(makeFetchResponse({ status: 500 })),
    });

  const storedRow = () => store.row("MK-1");

  it("ordinary progression: a failure at 6 advances the STORED value to exactly 7", async () => {
    await mirrorMediaToR2(makeRow({ r2_attempts: 6 }), transientFailureDeps());

    expect(storedRow().r2_attempts).toBe(7);
    const writes = store.writesFor("MK-1");
    expect(writes).toHaveLength(1);
    expect(writes[0].matched).toBe(true);
    // The advance is arithmetic ON THE STORED VALUE, never a JS-computed
    // literal: the statement read 6 and wrote 6 + 1.
    expect(writes[0].before.r2_attempts).toBe(6);
    expect(writes[0].after.r2_attempts).toBe(7);
    // The media key is a BOUND PARAMETER, not SQL text.
    expect(writes[0].params).toContain("MK-1");
    // Transient failure — must not tombstone.
    expect(storedRow().status).toBe("active");
  });

  it("TWO CONCURRENT failures from 7 reach exactly 8 and can never reach 9", async () => {
    // One shared row. BOTH callers carry the same STALE read of 7 — which is
    // exactly the situation the old JS-side `(row.r2_attempts ?? 0) + 1` could
    // not survive: both would have computed 8 and written it blind, and a third
    // overlapping pass could have carried it past the terminal.
    await Promise.all([
      mirrorMediaToR2(makeRow({ r2_attempts: 7 }), transientFailureDeps()),
      mirrorMediaToR2(makeRow({ r2_attempts: 7 }), transientFailureDeps()),
    ]);

    expect(storedRow().r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(storedRow().r2_attempts).not.toBe(R2_POLICY_PARKED_ATTEMPTS);

    // Both callers DID issue a statement — the second was a genuine no-op on
    // the counter, not a call that was never made. That is what makes this test
    // non-vacuous. The first read 7 and wrote 8; the second read 8, re-evaluated
    // the bound against THAT value, and left it at 8.
    const writes = store.writesFor("MK-1");
    expect(writes).toHaveLength(2);
    expect(writes[0].before.r2_attempts).toBe(7);
    expect(writes[0].after.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(writes[1].before.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(writes[1].after.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);

    // Transient failure — must not tombstone.
    expect(storedRow().status).toBe("active");
  });
});