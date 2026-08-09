/**
 * PR 3 Checkpoint 3 — Listing summary column population.
 *
 * Two layers of coverage:
 *   1. `computeListingMediaSummary()` (pure function) — exercised
 *      directly with explicit row fixtures.
 *   2. `updateListingMediaSummary()` (DB-backed) — uses a Prisma mock
 *      so we verify the read+write call shape without touching Neon.
 *
 * Hero-photo selection rules under test:
 *   - Only Photo + active rows are eligible.
 *   - Preferred → order ASC → first-encountered.
 *   - photo_count excludes FloorPlan/Video/VirtualTour and inactive rows.
 *   - photos_change_timestamp = max across ALL active rows, photo or not.
 *   - Empty input → all-null summary (with photo_count=0).
 */

import {
  computeListingMediaSummary,
  type SummarySourceRow,
} from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockFindMany = jest.fn<Promise<SummarySourceRow[]>, [unknown]>();
const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findMany: (args: unknown) => mockFindMany(args),
    },
    listing: {
      update: (args: unknown) => mockListingUpdate(args),
    },
  },
}));

import { updateListingMediaSummary } from "../media-sync";

beforeEach(() => {
  mockFindMany.mockReset();
  mockListingUpdate.mockReset();
});

// Helper to build a SummarySourceRow with sensible defaults.
function row(overrides: Partial<SummarySourceRow> = {}): SummarySourceRow {
  return {
    media_type: "Photo",
    status: "active",
    preferred_photo_yn: false,
    order: 1,
    media_url_original: "https://example.com/p1.jpg",
    r2_key: null,
    media_modification_ts: null,
    modification_ts: null,
    ...overrides,
  };
}

// ─── Pure-function tests ─────────────────────────────────────────────────

describe("computeListingMediaSummary (pure function)", () => {
  it("returns all-null / zero summary on empty input", () => {
    expect(computeListingMediaSummary([])).toEqual({
      primary_photo_url: null,
      primary_photo_r2_key: null,
      photo_count: 0,
      photos_change_timestamp: null,
    });
  });

  it("picks the lowest-order Photo when no preferred flag is set", () => {
    const summary = computeListingMediaSummary([
      row({ media_url_original: "https://example.com/p3.jpg", order: 3 }),
      row({ media_url_original: "https://example.com/p1.jpg", order: 1 }),
      row({ media_url_original: "https://example.com/p2.jpg", order: 2 }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p1.jpg");
    expect(summary.photo_count).toBe(3);
  });

  it("picks the preferred Photo over lower-order Photos", () => {
    const summary = computeListingMediaSummary([
      row({ media_url_original: "https://example.com/p1.jpg", order: 1, preferred_photo_yn: false }),
      row({ media_url_original: "https://example.com/p7.jpg", order: 7, preferred_photo_yn: true }),
      row({ media_url_original: "https://example.com/p2.jpg", order: 2, preferred_photo_yn: false }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p7.jpg");
  });

  it("when multiple are preferred, picks the lowest-order preferred", () => {
    const summary = computeListingMediaSummary([
      row({ media_url_original: "https://example.com/p9.jpg", order: 9, preferred_photo_yn: true }),
      row({ media_url_original: "https://example.com/p2.jpg", order: 2, preferred_photo_yn: true }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p2.jpg");
  });

  it("falls back to first-encountered for identical preferred + order", () => {
    const summary = computeListingMediaSummary([
      row({ media_url_original: "https://example.com/p-first.jpg", order: 1 }),
      row({ media_url_original: "https://example.com/p-second.jpg", order: 1 }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p-first.jpg");
  });

  it("excludes FloorPlan from hero selection AND from photo_count", () => {
    const summary = computeListingMediaSummary([
      row({ media_type: "FloorPlan", media_url_original: "https://example.com/fp.jpg", order: 1 }),
      row({ media_type: "Photo", media_url_original: "https://example.com/p.jpg", order: 2 }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p.jpg");
    expect(summary.photo_count).toBe(1);
  });

  it("excludes Video and VirtualTour from hero AND photo_count", () => {
    const summary = computeListingMediaSummary([
      row({ media_type: "Video", media_url_original: "https://example.com/v.mp4", order: 1 }),
      row({ media_type: "VirtualTour", media_url_original: "https://example.com/vt.html", order: 2 }),
      row({ media_type: "Photo", media_url_original: "https://example.com/p.jpg", order: 3 }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p.jpg");
    expect(summary.photo_count).toBe(1);
  });

  it("excludes inactive (deleted) rows from hero selection AND photo_count", () => {
    const summary = computeListingMediaSummary([
      row({ status: "deleted", media_url_original: "https://example.com/dead.jpg", order: 1 }),
      row({ status: "active", media_url_original: "https://example.com/live.jpg", order: 2 }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/live.jpg");
    expect(summary.photo_count).toBe(1);
  });

  it("returns null primary_photo_url when only FloorPlans exist (FloorPlan-only listing)", () => {
    const summary = computeListingMediaSummary([
      row({ media_type: "FloorPlan", media_url_original: "https://example.com/fp.jpg", order: 1 }),
    ]);
    expect(summary).toEqual({
      primary_photo_url: null,
      primary_photo_r2_key: null,
      photo_count: 0,
      photos_change_timestamp: null,
    });
  });

  it("returns null primary_photo_r2_key until R2 is mirrored", () => {
    const summary = computeListingMediaSummary([
      row({ media_url_original: "https://example.com/p.jpg", r2_key: null }),
    ]);
    expect(summary.primary_photo_url).toBe("https://example.com/p.jpg");
    expect(summary.primary_photo_r2_key).toBeNull();
  });

  it("populates primary_photo_r2_key when the hero has been mirrored to R2", () => {
    const summary = computeListingMediaSummary([
      row({ media_url_original: "https://example.com/p.jpg", r2_key: "photos/RLS-1/1.jpg" }),
    ]);
    expect(summary.primary_photo_r2_key).toBe("photos/RLS-1/1.jpg");
  });

  it("photos_change_timestamp = max(media_modification_ts) across all active rows", () => {
    const summary = computeListingMediaSummary([
      row({ media_modification_ts: new Date("2026-05-01T00:00:00Z") }),
      row({ media_modification_ts: new Date("2026-06-15T00:00:00Z") }),
      row({ media_modification_ts: new Date("2026-04-01T00:00:00Z") }),
    ]);
    expect(summary.photos_change_timestamp?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("photos_change_timestamp falls back to modification_ts when media_modification_ts is null", () => {
    const summary = computeListingMediaSummary([
      row({ media_modification_ts: null, modification_ts: new Date("2026-05-15T00:00:00Z") }),
      row({ media_modification_ts: null, modification_ts: new Date("2026-05-10T00:00:00Z") }),
    ]);
    expect(summary.photos_change_timestamp?.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });

  it("photos_change_timestamp considers ALL active rows, not just Photos", () => {
    const summary = computeListingMediaSummary([
      row({ media_type: "Photo", media_modification_ts: new Date("2026-05-01T00:00:00Z") }),
      row({ media_type: "FloorPlan", media_modification_ts: new Date("2026-08-15T00:00:00Z") }),
    ]);
    expect(summary.photos_change_timestamp?.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("photos_change_timestamp ignores inactive (deleted) rows", () => {
    const summary = computeListingMediaSummary([
      row({ status: "deleted", media_modification_ts: new Date("2026-12-31T00:00:00Z") }),
      row({ status: "active", media_modification_ts: new Date("2026-05-01T00:00:00Z") }),
    ]);
    expect(summary.photos_change_timestamp?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("ignores NaN dates in photos_change_timestamp computation", () => {
    const summary = computeListingMediaSummary([
      row({ media_modification_ts: new Date("not a date") }),
      row({ media_modification_ts: new Date("2026-05-15T00:00:00Z") }),
    ]);
    expect(summary.photos_change_timestamp?.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });

  it("treats case variants in media_type and status (Trestle inconsistency tolerance)", () => {
    const summary = computeListingMediaSummary([
      row({ media_type: "PHOTO", status: "ACTIVE", order: 1, media_url_original: "https://example.com/upper.jpg" }),
      row({ media_type: "photo", status: "active", order: 2, media_url_original: "https://example.com/lower.jpg" }),
    ]);
    expect(summary.photo_count).toBe(2);
    expect(summary.primary_photo_url).toBe("https://example.com/upper.jpg");
  });
});

// ─── DB-backed tests (updateListingMediaSummary) ─────────────────────────

describe("updateListingMediaSummary (DB-backed)", () => {
  it("queries listingMedia for the right listing_id and persists the summary", async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ media_url_original: "https://example.com/p.jpg", order: 1, r2_key: "photos/RLS-1/1.jpg" }),
    ]);
    mockListingUpdate.mockResolvedValueOnce(undefined);

    const summary = await updateListingMediaSummary("RLS20012345");

    expect(summary).toEqual({
      primary_photo_url: "https://example.com/p.jpg",
      primary_photo_r2_key: "photos/RLS-1/1.jpg",
      photo_count: 1,
      photos_change_timestamp: null,
    });

    // findMany call shape
    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(findArgs.where).toEqual({ listing_id: "RLS20012345" });
    // Selects only the columns the summary needs (efficient projection).
    // media_category + media_classification added 2026-08-07 (commit 7A):
    // without them `filterActivePhotoRows` could only test media_type, so a
    // floor plan arriving with no MediaCategory (stored as Photo by
    // classifyTrestleMediaCategory) was counted as a photo and
    // Listing.photo_count exceeded the public gallery. Two scalar columns on
    // rows already being read — no extra query, no join.
    //
    // media_key added 2026-08-09 (HERO AUTHORITY): `selectHeroPhoto` now ranks
    // an explicit `crm:` set-main above the feed's PreferredPhotoYN hint, so
    // the summary must be able to SEE the namespace. It is also required for
    // PARITY — the Phase-3 mirror hero population already selects media_key and
    // its comment asserts both populations resolve an IDENTICAL hero; without
    // this column the summary hero and the mirror hero could disagree. One more
    // scalar on rows already being read — no extra query, no join.
    expect(Object.keys(findArgs.select).sort()).toEqual(
      ["media_category", "media_classification", "media_key", "media_modification_ts", "media_type", "media_url_original", "modification_ts", "order", "preferred_photo_yn", "r2_key", "status"].sort(),
    );

    // listing.update call shape
    const updateArgs = mockListingUpdate.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(updateArgs.where).toEqual({ listing_id: "RLS20012345" });
    expect(updateArgs.data).toEqual({
      primary_photo_url: "https://example.com/p.jpg",
      primary_photo_r2_key: "photos/RLS-1/1.jpg",
      photo_count: 1,
      photos_change_timestamp: null,
    });
  });

  it("writes nulls + photo_count=0 when no Photos exist", async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ media_type: "FloorPlan", media_url_original: "https://example.com/fp.jpg" }),
    ]);
    mockListingUpdate.mockResolvedValueOnce(undefined);

    const summary = await updateListingMediaSummary("RLS20012345");

    expect(summary.primary_photo_url).toBeNull();
    expect(summary.primary_photo_r2_key).toBeNull();
    expect(summary.photo_count).toBe(0);

    const updateArgs = mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data.primary_photo_url).toBeNull();
    expect(updateArgs.data.photo_count).toBe(0);
  });

  it("writes only the 4 summary columns (no other fields touched)", async () => {
    mockFindMany.mockResolvedValueOnce([row()]);
    mockListingUpdate.mockResolvedValueOnce(undefined);

    await updateListingMediaSummary("RLS20012345");

    const updateArgs = mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(updateArgs.data).sort()).toEqual(
      ["photo_count", "photos_change_timestamp", "primary_photo_r2_key", "primary_photo_url"].sort(),
    );
    // Critically: NEVER touch the legacy media JSON column or any other field.
    expect(updateArgs.data).not.toHaveProperty("media");
    expect(updateArgs.data).not.toHaveProperty("modification_timestamp");
    expect(updateArgs.data).not.toHaveProperty("raw_data");
  });

  it("idempotent — running twice produces identical write payloads", async () => {
    const fixture = [
      row({ media_url_original: "https://example.com/p.jpg", order: 1, preferred_photo_yn: true, r2_key: "photos/RLS-1/1.jpg" }),
    ];

    mockFindMany.mockResolvedValueOnce(fixture);
    mockListingUpdate.mockResolvedValueOnce(undefined);
    await updateListingMediaSummary("RLS20012345");
    const firstPayload = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;

    mockFindMany.mockResolvedValueOnce(fixture);
    mockListingUpdate.mockResolvedValueOnce(undefined);
    await updateListingMediaSummary("RLS20012345");
    const secondPayload = (mockListingUpdate.mock.calls[1][0] as { data: Record<string, unknown> }).data;

    expect(firstPayload).toEqual(secondPayload);
  });

  it("makes exactly one findMany and one listing.update per call", async () => {
    mockFindMany.mockResolvedValueOnce([row()]);
    mockListingUpdate.mockResolvedValueOnce(undefined);

    await updateListingMediaSummary("RLS20012345");

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });
});
