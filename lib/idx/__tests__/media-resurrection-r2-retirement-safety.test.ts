/**
 * D1 — RESURRECTION MUST NOT RETAIN A DEAD R2 POINTER.
 *
 * PROVEN DEFECT (at HEAD a0db2dac): the material-write branch of `upsertListingMedia`
 * (lib/idx/media-sync.ts:1436-1453) updates WHERE `media_key` only — no status predicate
 * (:1313 findUnique on media_key, :1326 selects status) — re-asserts `status: "active"`
 * (:1451) and DELIBERATELY omits `r2_key` / `media_url_cached` from the data block
 * (documented at :1365-1366, "resurrect preserved"). A resurrected tombstone therefore keeps
 * the R2 pointer it had in its previous life.
 *
 * WHY THAT BLOCKS R2 RETIREMENT. If the object behind that pointer has been deleted, the
 * resurrected row has BOTH delivery pointers populated, so
 * `buildR2MirrorableBacklogUniverseWhere` (:2617, `OR: [{r2_key:null},{media_url_cached:null}]`)
 * can never re-select it, and content-verification detects but explicitly never repairs
 * (lib/media/content-verification.ts:134, :167-169). `pickFullSizeUrl(cached, original)` is
 * cached-first, so the public gallery renders a dead URL forever.
 *
 * THE CORRECTION: a resurrection CLEARS the delivery pointers (and the now-meaningless
 * content-check verdict, which described bytes that are no longer the delivered bytes).
 * `buildMediaR2Key` is deterministic in (listing_id, mediaType, media_key), so re-mirroring
 * recomputes the SAME key — a surviving object is re-adopted by the existence-reuse path
 * (media-sync.ts:3169-3187) with no re-upload and no orphan; a deleted object is re-fetched.
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
  r2_attempts?: number | null;
  r2_policy_excluded_at?: Date | null;
}

const mockFindUnique = jest.fn<Promise<ListingMediaRow | null>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>();
const mockUpdate = jest.fn<Promise<unknown>, [{ where: { media_key: string }; data: Record<string, unknown> }]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findUnique: (a: unknown) => mockFindUnique(a),
      create: (a: { data: Record<string, unknown> }) => mockCreate(a),
      update: (a: { where: { media_key: string }; data: Record<string, unknown> }) => mockUpdate(a),
      updateMany: (a: unknown) => mockUpdateMany(a),
    },
  },
}));

import { upsertListingMedia, buildR2MirrorableBacklogUniverseWhere } from "../media-sync";
import { resolveListingMediaFromRows } from "@/lib/media/listing-media-resolver";

const DEAD_R2_KEY = "photos/RLS20012345/MK-1.jpg";
const DEAD_R2_URL = "https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/" + DEAD_R2_KEY;
const LIVE_LOCATOR =
  "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/NjA0My8xMTM3MS8yMA/MjAvMjE1MjYvMTc3ODMxMjczOQ/abc";

function makeRow(overrides: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: overrides.MediaKey ?? "MK-1",
    ResourceRecordKey: "RRK-100",
    ResourceRecordID: "RLS20012345",
    MediaURL: LIVE_LOCATOR,
    MediaCategory: "Photo",
    MediaStatus: "Active",
    Order: 1,
    PreferredPhotoYN: false,
    ModificationTimestamp: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

/** A tombstoned row that still carries the delivery pointers of its previous life. */
function tombstoneWithR2(over: Partial<ListingMediaRow> = {}): ListingMediaRow {
  return {
    listing_id: "RLS20012345",
    resource_record_key: "RRK-100",
    resource_record_id: "RLS20012345",
    media_url_original: LIVE_LOCATOR,
    media_type: "Photo",
    media_category: "Photo",
    media_classification: null,
    order: 1,
    preferred_photo_yn: false,
    media_modification_ts: null,
    modification_ts: new Date("2026-05-08T12:00:00Z"),
    status: "deleted",
    r2_key: DEAD_R2_KEY,
    media_url_cached: DEAD_R2_URL,
    r2_attempts: null,
    r2_policy_excluded_at: null,
    ...over,
  };
}

/**
 * Evaluate the REAL production where-object against a candidate row.
 *
 * Deliberately evaluates `buildR2MirrorableBacklogUniverseWhere()` itself rather than a
 * hand-written copy, so this proof cannot drift from the selector. The `listing` relation
 * clause (R2-1 admission policy) is not evaluable from a media row and is SKIPPED — it is
 * a property of the listing and is unchanged by resurrection, so it cannot be what decides
 * this test.
 */
function matchesWhere(where: Record<string, unknown>, row: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === "listing") continue; // relation — not row-local, see doc above
    if (k === "OR") {
      if (!(v as Array<Record<string, unknown>>).some((c) => matchesWhere(c, row))) return false;
      continue;
    }
    if (k === "AND") {
      if (!(v as Array<Record<string, unknown>>).every((c) => matchesWhere(c, row))) return false;
      continue;
    }
    if (k === "NOT") {
      if (matchesWhere(v as Record<string, unknown>, row)) return false;
      continue;
    }
    const actual = row[k];
    if (v === null) {
      if (actual !== null && actual !== undefined) return false;
      continue;
    }
    if (typeof v === "object") {
      const op = v as Record<string, unknown>;
      if ("not" in op) {
        if (op.not === null) {
          if (actual === null || actual === undefined) return false;
        } else if (actual === op.not) return false;
      }
      if ("lt" in op && !(typeof actual === "number" && actual < (op.lt as number))) return false;
      if ("in" in op && !(op.in as unknown[]).includes(actual)) return false;
      if ("startsWith" in op) {
        if (typeof actual !== "string" || !actual.startsWith(op.startsWith as string)) return false;
      }
      continue;
    }
    if (actual !== v) return false;
  }
  return true;
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset();
});

describe("D1 — resurrecting a tombstone must not retain a stale R2 pointer", () => {
  it("clears BOTH delivery pointers on resurrection (deleted -> active)", async () => {
    mockFindUnique.mockResolvedValueOnce(tombstoneWithR2({ status: "deleted" }));
    mockUpdate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("active"); // resurrect-on-reappear preserved
    expect(data).toHaveProperty("r2_key", null);
    expect(data).toHaveProperty("media_url_cached", null);
    // the locator the public surface now falls back to is written in the SAME statement
    expect(data.media_url_original).toBe(LIVE_LOCATOR);
  });

  it("clears the content-check verdict too — it described bytes that are no longer delivered", async () => {
    mockFindUnique.mockResolvedValueOnce(tombstoneWithR2({ status: "replaced" }));
    mockUpdate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()]);

    const data = mockUpdate.mock.calls[0][0].data;
    expect(data).toHaveProperty("content_check_at", null);
    expect(data).toHaveProperty("content_check_state", null);
  });

  it("the resurrected row RE-ENTERS the R2 mirror universe (so it is re-fetched)", async () => {
    mockFindUnique.mockResolvedValueOnce(tombstoneWithR2());
    mockUpdate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()]);

    const stored = {
      ...tombstoneWithR2(),
      ...mockUpdate.mock.calls[0][0].data,
      media_key: "MK-1",
    } as Record<string, unknown>;
    expect(matchesWhere(buildR2MirrorableBacklogUniverseWhere() as Record<string, unknown>, stored)).toBe(true);
  });

  it("NEGATIVE: a tombstone whose R2 object no longer exists resurrects WITHOUT emitting a dead URL", async () => {
    mockFindUnique.mockResolvedValueOnce(tombstoneWithR2());
    mockUpdate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()]);

    // The R2 object behind DEAD_R2_KEY was deleted by an R2 retirement sweep. Render the row
    // exactly as the public gallery would after this write.
    const stored = { ...tombstoneWithR2(), ...mockUpdate.mock.calls[0][0].data } as Record<string, unknown>;
    const resolved = resolveListingMediaFromRows([
      {
        media_url_original: stored.media_url_original as string | null,
        media_url_cached: stored.media_url_cached as string | null,
        media_type: stored.media_type as string,
        media_category: stored.media_category as string | null,
        media_classification: stored.media_classification as string | null,
        order: stored.order as number,
        preferred_photo_yn: stored.preferred_photo_yn as boolean,
        status: stored.status as string,
        media_key: "MK-1",
      },
    ]);

    expect(resolved).toHaveLength(1);
    const emitted = JSON.stringify(resolved);
    expect(emitted).not.toContain(DEAD_R2_KEY);
    expect(emitted).not.toContain("r2.dev");
    // and it still renders — the live Cotality locator, proxied
    expect(resolved[0].url).toContain("/api/media/proxy");
  });

  it("NON-REGRESSION: an ALREADY-ACTIVE material change never clears the pointers", async () => {
    // If this leaked to active rows it would dump the entire delivered corpus (280,543 rows,
    // frozen census 2026-08-18) back into the R2 backlog.
    mockFindUnique.mockResolvedValueOnce(tombstoneWithR2({ status: "active", order: 99 }));
    mockUpdate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()]);

    const data = mockUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("r2_key");
    expect(data).not.toHaveProperty("media_url_cached");
    expect(data).not.toHaveProperty("content_check_state");
  });

  it("NON-REGRESSION: a brand-new row is unaffected (create path writes no delivery pointers)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const data = mockCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("r2_key");
    expect(data).not.toHaveProperty("media_url_cached");
  });
});
