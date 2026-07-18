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
// N2: the summary path now point-reads the 4 existing summary columns to
// suppress identical writes. Default (set in beforeEach): no row found →
// the write always runs (pre-N2 behavior preserved for these tests).
const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findMany: (args: unknown) => mockFindMany(args),
    },
    listing: {
      update: (args: unknown) => mockListingUpdate(args),
      findUnique: (args: unknown) => mockListingFindUnique(args),
    },
  },
}));

import { updateListingMediaSummary, mediaSummaryUnchanged } from "../media-sync";

beforeEach(() => {
  mockFindMany.mockReset();
  mockListingUpdate.mockReset();
  mockListingFindUnique.mockReset();
  mockListingFindUnique.mockResolvedValue(null);
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

    const { summary, changed } = await updateListingMediaSummary("RLS20012345");

    expect(changed).toBe(true);
    expect(summary).toEqual({
      primary_photo_url: "https://example.com/p.jpg",
      primary_photo_r2_key: "photos/RLS-1/1.jpg",
      photo_count: 1,
      photos_change_timestamp: null,
    });

    // findMany call shape
    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(findArgs.where).toEqual({ listing_id: "RLS20012345" });
    // Selects only the 8 columns the summary needs (efficient projection).
    expect(Object.keys(findArgs.select).sort()).toEqual(
      ["media_modification_ts", "media_type", "media_url_original", "modification_ts", "order", "preferred_photo_yn", "r2_key", "status"].sort(),
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

    const { summary } = await updateListingMediaSummary("RLS20012345");

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

  it("makes exactly one findMany, one comparison findUnique, and one listing.update per call", async () => {
    mockFindMany.mockResolvedValueOnce([row()]);
    mockListingUpdate.mockResolvedValueOnce(undefined);

    await updateListingMediaSummary("RLS20012345");

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockListingFindUnique).toHaveBeenCalledTimes(1);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─── N2 — summary write suppression ──────────────────────────────────────

describe("updateListingMediaSummary — N2 write suppression", () => {
  const TS = new Date("2026-06-15T00:00:00Z");

  it("skips the write entirely when all 4 summary columns are identical", async () => {
    mockFindMany.mockResolvedValueOnce([
      row({
        media_url_original: "https://example.com/p.jpg",
        order: 1,
        r2_key: "photos/RLS-1/1.jpg",
        media_modification_ts: TS,
      }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce({
      primary_photo_url: "https://example.com/p.jpg",
      primary_photo_r2_key: "photos/RLS-1/1.jpg",
      photo_count: 1,
      // Distinct Date instance at the same epoch — MUST compare equal (never
      // Date identity).
      photos_change_timestamp: new Date(TS.getTime()),
    });

    const { summary, changed } = await updateListingMediaSummary("RLS20012345");

    expect(changed).toBe(false);
    expect(mockListingUpdate).not.toHaveBeenCalled();
    // The confirmed summary is still returned to the caller.
    expect(summary.primary_photo_url).toBe("https://example.com/p.jpg");
  });

  it("identical second run issues ZERO listing.update calls", async () => {
    const fixture = [
      row({ media_url_original: "https://example.com/p.jpg", order: 1, media_modification_ts: TS }),
    ];

    // Run 1: no summary columns yet (nulls) → write happens.
    mockFindMany.mockResolvedValueOnce(fixture);
    mockListingFindUnique.mockResolvedValueOnce({
      primary_photo_url: null,
      primary_photo_r2_key: null,
      photo_count: null,
      photos_change_timestamp: null,
    });
    mockListingUpdate.mockResolvedValueOnce(undefined);
    const first = await updateListingMediaSummary("RLS20012345");
    expect(first.changed).toBe(true);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    const written = (mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;

    // Run 2: DB now holds exactly what run 1 wrote → zero writes.
    mockFindMany.mockResolvedValueOnce(fixture);
    mockListingFindUnique.mockResolvedValueOnce({ ...written });
    const second = await updateListingMediaSummary("RLS20012345");
    expect(second.changed).toBe(false);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1); // still 1 — no new write
  });

  it("a summary value change (photo_count) issues exactly one update", async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ media_url_original: "https://example.com/p.jpg", order: 1, media_modification_ts: TS }),
      row({ media_url_original: "https://example.com/p2.jpg", order: 2, media_modification_ts: TS }),
    ]);
    mockListingFindUnique.mockResolvedValueOnce({
      primary_photo_url: "https://example.com/p.jpg",
      primary_photo_r2_key: null,
      photo_count: 1, // now 2 photos
      photos_change_timestamp: new Date(TS.getTime()),
    });
    mockListingUpdate.mockResolvedValueOnce(undefined);

    const { changed } = await updateListingMediaSummary("RLS20012345");

    expect(changed).toBe(true);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockListingUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data.photo_count).toBe(2);
  });

  it("DB photo_count=null (never backfilled) vs computed 0 still writes (null !== 0)", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockListingFindUnique.mockResolvedValueOnce({
      primary_photo_url: null,
      primary_photo_r2_key: null,
      photo_count: null,
      photos_change_timestamp: null,
    });
    mockListingUpdate.mockResolvedValueOnce(undefined);

    const { changed } = await updateListingMediaSummary("RLS20012345");

    expect(changed).toBe(true);
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });

  it("missing listing row (findUnique null) preserves fail-loud: update still runs and its throw propagates", async () => {
    mockFindMany.mockResolvedValueOnce([row()]);
    mockListingFindUnique.mockResolvedValueOnce(null);
    const p2025 = Object.assign(new Error("Record not found"), { code: "P2025" });
    mockListingUpdate.mockRejectedValueOnce(p2025);

    await expect(updateListingMediaSummary("GHOST-1")).rejects.toThrow("Record not found");
    expect(mockListingUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("mediaSummaryUnchanged (pure comparator)", () => {
  const base = {
    primary_photo_url: "https://example.com/p.jpg",
    primary_photo_r2_key: "photos/RLS-1/1.jpg",
    photo_count: 3,
    photos_change_timestamp: new Date("2026-06-15T00:00:00Z"),
  };

  it("equal snapshot (distinct Date instances, same epoch) → unchanged", () => {
    expect(
      mediaSummaryUnchanged(
        { ...base, photos_change_timestamp: new Date("2026-06-15T00:00:00Z") },
        { ...base, photos_change_timestamp: new Date("2026-06-15T00:00:00.000Z") },
      ),
    ).toBe(true);
  });

  it.each([
    ["primary_photo_url", { primary_photo_url: "https://example.com/other.jpg" }],
    ["primary_photo_r2_key", { primary_photo_r2_key: null }],
    ["photo_count", { photo_count: 4 }],
    ["photos_change_timestamp", { photos_change_timestamp: new Date("2026-06-16T00:00:00Z") }],
  ])("%s difference → changed", (_field, override) => {
    expect(mediaSummaryUnchanged({ ...base, ...override }, base)).toBe(false);
  });

  it("null timestamp equals only null", () => {
    expect(
      mediaSummaryUnchanged({ ...base, photos_change_timestamp: null }, base),
    ).toBe(false);
    expect(
      mediaSummaryUnchanged(
        { ...base, photos_change_timestamp: null },
        { ...base, photos_change_timestamp: null },
      ),
    ).toBe(true);
  });
});
