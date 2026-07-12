/**
 * Media-sync cursor observability — instrumentation-only PR.
 *
 * Proves the four properties required of the observability change:
 *   1. Instrumentation does NOT change cursor behavior (upsert payload + return
 *      value are byte-identical with and without `logContext`; telemetry is
 *      emitted ONLY when opted in).
 *   2. A 50-row same-millisecond cluster advances the ListingKey (the exact
 *      production scenario the frozen cursor should have drained).
 *   3. An empty batch cannot regress the cursor.
 *   4. Lost-update PROBE — the CURRENT persistence issues an unconditional
 *      upsert keyed only on `resource` (no compare-and-set), so a stale run CAN
 *      overwrite a higher concurrently-persisted cursor. This documents the gap;
 *      it is deliberately NOT fixed in this observability-only PR.
 *
 * Mirrors the prisma-mock pattern used by media-sync-watermark.test.ts — no live
 * DB, no live Trestle.
 */

import {
  RESOURCE_MEDIA,
  pickKeysetWatermark,
  type ProcessedListing,
} from "../media-sync";

type FindUniqueArgs = { where: { resource: string }; select?: unknown };
type UpsertArgs = {
  where: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

const mockFindUnique = jest.fn<Promise<unknown>, [FindUniqueArgs]>();
const mockUpsert = jest.fn<Promise<unknown>, [UpsertArgs]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (args: FindUniqueArgs) => mockFindUnique(args),
      upsert: (args: UpsertArgs) => mockUpsert(args),
    },
  },
}));

import { advanceMediaSyncCursor } from "../media-sync";

const T_ISO = "2026-07-10T18:06:15.803Z";
const FROZEN_KEY = "1138425625";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpsert.mockReset();
});

// ─── 1. Instrumentation does not change cursor behavior ────────────────────

describe("instrumentation is behavior-preserving", () => {
  it("logContext changes NOTHING in the persisted payload or return; telemetry only fires when opted in", async () => {
    const prior = {
      last_photos_change: new Date(T_ISO),
      last_media_modified: null,
      last_listing_key: FROZEN_KEY,
    };
    const watermark = {
      last_photos_change: new Date(T_ISO),
      last_listing_key: "1165606483",
    };
    const NOW = new Date("2026-07-12T19:00:00Z");
    const base = {
      records: [],
      watermark,
      now: NOW,
      rowsChecked: 5,
      rowsUpdated: 5,
      rowsFailed: 0,
    };

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    // WITHOUT logContext
    mockFindUnique.mockResolvedValueOnce(prior);
    mockUpsert.mockResolvedValueOnce(undefined);
    const r1 = await advanceMediaSyncCursor({ ...base });
    const upsert1 = mockUpsert.mock.calls[0][0];
    const emittedWithout = logSpy.mock.calls.length;

    logSpy.mockClear();
    mockUpsert.mockClear();

    // WITH logContext
    mockFindUnique.mockResolvedValueOnce(prior);
    mockUpsert.mockResolvedValueOnce(undefined);
    const r2 = await advanceMediaSyncCursor({ ...base, logContext: { runId: "test-run" } });
    const upsert2 = mockUpsert.mock.calls[0][0];
    const emittedWith = logSpy.mock.calls.map((c) => String(c[0]));

    logSpy.mockRestore();

    // Cursor computation + persistence payload identical.
    expect(r2).toEqual(r1);
    expect(upsert2.create).toEqual(upsert1.create);
    expect(upsert2.update).toEqual(upsert1.update);

    // Telemetry gated strictly on opt-in.
    expect(emittedWithout).toBe(0);
    expect(emittedWith.length).toBe(1);

    // The emitted line is the structured cursor telemetry with the required fields.
    const evt = JSON.parse(emittedWith[0]);
    expect(evt.tag).toBe("media_sync_cursor");
    expect(evt.event).toBe("advance");
    expect(evt.run_id).toBe("test-run");
    expect(evt.has_watermark).toBe(true);
    expect(evt.prior_last_listing_key).toBe(FROZEN_KEY);
    expect(evt.next_last_listing_key).toBe("1165606483");
  });
});

// ─── 2. A 50-row same-millisecond cluster advances the key ─────────────────

describe("50-row same-millisecond cluster", () => {
  it("advances last_listing_key to the cluster's max key (drains the boundary cluster)", async () => {
    // 50 listings, all PCT = T (same millisecond), keys strictly ascending and
    // ALL greater than the frozen key. `-00:00` = the exact Trestle serialization.
    const keys = Array.from({ length: 50 }, (_, i) => String(1146035204 + i * 1000));
    const processed: ProcessedListing[] = keys.map((k) => ({
      listingKey: k,
      photosChangeTs: new Date("2026-07-10T18:06:15.803-00:00"),
      ok: true,
    }));

    const watermark = pickKeysetWatermark(processed);
    expect(watermark).not.toBeNull();
    expect(watermark!.last_listing_key).toBe(keys[keys.length - 1]);

    // Prior cursor frozen BELOW the cluster (the production symptom).
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date(T_ISO),
      last_media_modified: null,
      last_listing_key: FROZEN_KEY,
    });
    mockUpsert.mockResolvedValueOnce(undefined);

    const result = await advanceMediaSyncCursor({
      records: [],
      watermark,
      now: new Date("2026-07-12T19:00:00Z"),
    });

    // Key advanced past the frozen key; timestamp stays at the cluster instant.
    expect(result.last_photos_change?.toISOString()).toBe(T_ISO);
    expect(result.last_listing_key).toBe(keys[keys.length - 1]);
    const args = mockUpsert.mock.calls[0][0];
    expect(args.update.last_listing_key).toBe(keys[keys.length - 1]);
  });
});

// ─── 3. An empty batch cannot regress the cursor ───────────────────────────

describe("empty batch", () => {
  it("null watermark preserves the prior cursor (no regression)", async () => {
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date(T_ISO),
      last_media_modified: null,
      last_listing_key: "1165606483",
    });
    mockUpsert.mockResolvedValueOnce(undefined);

    const result = await advanceMediaSyncCursor({
      records: [],
      watermark: null,
      now: new Date("2026-07-12T19:00:00Z"),
    });

    expect(result.last_photos_change?.toISOString()).toBe(T_ISO);
    expect(result.last_listing_key).toBe("1165606483");
    const args = mockUpsert.mock.calls[0][0];
    expect((args.update.last_photos_change as Date).toISOString()).toBe(T_ISO);
    expect(args.update.last_listing_key).toBe("1165606483");
  });
});

// ─── 4. Lost-update PROBE — documents a gap; NOT fixed in this PR ───────────

describe("lost-update PROBE (persistence has no compare-and-set)", () => {
  it("a stale-low prior read is written back via an UNCONDITIONAL upsert keyed only on resource", async () => {
    // Simulate a run whose prior-read is STALE and LOW — e.g. it read the cursor
    // before a concurrent run advanced the DB to a HIGHER value. With an empty
    // batch it writes the low value; nothing guards against clobbering a higher
    // concurrently-persisted cursor.
    mockFindUnique.mockResolvedValueOnce({
      last_photos_change: new Date(T_ISO),
      last_media_modified: null,
      last_listing_key: "1000000000",
    });
    mockUpsert.mockResolvedValueOnce(undefined);

    await advanceMediaSyncCursor({
      records: [],
      watermark: null,
      now: new Date("2026-07-12T19:00:00Z"),
    });

    const args = mockUpsert.mock.calls[0][0];
    // (a) The upsert is keyed ONLY on `resource` — there is NO optimistic-
    //     concurrency guard (no stored-cursor comparison in the WHERE clause).
    expect(Object.keys(args.where)).toEqual(["resource"]);
    expect(args.where).toEqual({ resource: RESOURCE_MEDIA });
    // (b) It writes the STALE LOW value unconditionally — so if the DB actually
    //     held a HIGHER cursor (written concurrently), this run would REGRESS it.
    expect(args.update.last_listing_key).toBe("1000000000");
    // ^ This is the lost-update / read-modify-write race. A real fix (compare-
    //   and-set, or a conditional updateMany WHERE stored <= computed) is OUT OF
    //   SCOPE for this observability-only PR — reported, not fixed.
  });
});
