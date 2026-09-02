/**
 * D2 + D3 INTEGRATION — the Phase 3.5 wiring inside `runMediaSync`, not the library helpers.
 *
 * `runBoundedVerificationPass` is NOT the production path: production selects IN THE
 * DATABASE and calls `verifyRow` directly. A green unit test on the helper therefore proves
 * nothing about the cron, which is exactly the gap that let a 30-day promise, a
 * state-blind ordering and a `crm:` leak all ship together. These tests drive
 * `runMediaSync` itself and assert on the queries it actually issues.
 */

import type { MediaSyncFetchDeps, MirrorMediaToR2Deps, RunMediaSyncOptions } from "../media-sync";

const mockMediaSyncFindUnique = jest.fn<Promise<unknown>, [{ where: { resource: string } }]>();
const mockMediaSyncUpsert = jest.fn<Promise<unknown>, [{ where: { resource: string }; create: Record<string, unknown>; update: Record<string, unknown> }]>();
const mockListingMediaFindMany = jest.fn<Promise<unknown[]>, [Record<string, unknown>]>();
const mockListingMediaUpdate = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
const mockListingMediaUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (a: { where: { resource: string } }) => mockMediaSyncFindUnique(a),
      upsert: (a: never) => mockMediaSyncUpsert(a),
    },
    listingMedia: {
      findUnique: async () => null,
      create: async () => undefined,
      update: (a: Record<string, unknown>) => mockListingMediaUpdate(a),
      updateMany: (a: unknown) => mockListingMediaUpdateMany(a),
      findMany: (a: Record<string, unknown>) => mockListingMediaFindMany(a),
      count: async () => 0,
    },
    auditEvent: { findMany: async () => [] },
    listing: { update: async () => undefined, findUnique: async () => null },
    $queryRaw: async () => [],
    $transaction: async (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        $queryRaw: async () => [{ locked: true }],
        listingMedia: { findMany: async () => [] },
      }),
  },
}));

jest.mock("../auth", () => ({
  __esModule: true,
  getAccessToken: async () => "test-token",
  hasCredentials: () => true,
}));

jest.mock("@/lib/images/r2", () => ({
  __esModule: true,
  existsInR2: async () => true,
  uploadToR2: async (k: string) => `https://r2.example.com/${k}`,
  getR2PublicUrl: (k: string) => `https://r2.example.com/${k}`,
}));

import {
  runMediaSync,
  RESOURCE_MEDIA_CONTENT_VERIFICATION,
  CONTENT_VERIFICATION_SWEEP_GAP_MS,
} from "../media-sync";
import {
  MAX_VERIFICATION_ROWS_PER_CYCLE,
  parseSweepState,
  verificationSweepStallAfterMs,
} from "@/lib/media/content-verification";

const DAY = 86_400_000;
const IMAGE = Buffer.from("PROVIDER-AND-R2-AGREE");

function makeOptions(overrides: Partial<RunMediaSyncOptions> = {}): RunMediaSyncOptions {
  const fetchDeps: MediaSyncFetchDeps = {
    fetchProperties: jest.fn().mockResolvedValue([]), // no Phase 1 / Phase 2 work
    fetchMedia: jest.fn().mockResolvedValue([]),
  };
  const mirrorDeps: MirrorMediaToR2Deps = {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    uploadToR2: jest.fn<Promise<string>, [string, Buffer, string]>().mockResolvedValue("x"),
    getR2PublicUrl: jest.fn<string, [string]>().mockImplementation((k) => `https://r2.example.com/${k}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("test-token"),
    fetchFn: jest.fn(),
  };
  return { listingsPerRun: 10, mediaPerListing: 5, fallbackWindowDays: 7, fetchDeps, mirrorDeps, ...overrides };
}

/**
 * The verification query is the only findMany that PROJECTS content_check_*.
 *
 * It used to be identified by a `content_check` predicate in the WHERE. That is no longer a
 * usable signature, and the change is the point of the fix: a due predicate in SQL made a
 * short page mean both "the range is exhausted" and "nothing is due yet". The window is now a
 * pure key range, so the projection — not the filter — is what names it.
 */
const isVerificationCall = (call: [Record<string, unknown>]) =>
  JSON.stringify(call[0] ?? {}).includes("content_check");

function verificationCalls() {
  return mockListingMediaFindMany.mock.calls.filter((c) => isVerificationCall(c as [Record<string, unknown>]));
}

function sweepUpsert() {
  return mockMediaSyncUpsert.mock.calls.find(
    (c) => c[0].where.resource === RESOURCE_MEDIA_CONTENT_VERIFICATION,
  );
}

function dueRow(mediaKey: string) {
  return {
    media_key: mediaKey,
    listing_id: "RLS20012345",
    r2_key: `photos/RLS20012345/${mediaKey}.jpg`,
    media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/a/b/c",
    content_check_at: null,
    content_check_state: null,
  };
}

/** Sweep state as it is actually persisted: one JSON document in one TEXT column. */
function storedSweep(
  cursor: string | null,
  startedAt: Date | null,
  nextEligibleAt: Date | null,
  progressAt: Date | null = startedAt,
) {
  return {
    last_listing_key: JSON.stringify({
      c: cursor,
      s: startedAt ? startedAt.toISOString() : null,
      n: nextEligibleAt ? nextEligibleAt.toISOString() : null,
      p: progressAt ? progressAt.toISOString() : null,
    }),
  };
}

/** The one telemetry line Phase 3.5 emits, parsed back out of console.log. */
async function runAndReadTelemetry(): Promise<Record<string, unknown> | undefined> {
  const logs: string[] = [];
  const spy = jest.spyOn(console, "log").mockImplementation((m?: unknown) => { logs.push(String(m)); });
  try {
    await runMediaSync(makeOptions());
  } finally {
    spy.mockRestore();
  }
  return logs
    .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } })
    .find((o) => o && o.tag === "media_sync_cursor" && o.event === "content_verification") ?? undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListingMediaFindMany.mockResolvedValue([]);
  mockListingMediaUpdate.mockResolvedValue(undefined);
  mockListingMediaUpdateMany.mockResolvedValue({ count: 0 });
  mockMediaSyncUpsert.mockResolvedValue(undefined);
  mockMediaSyncFindUnique.mockResolvedValue(null);
  global.fetch = jest.fn(async (url: unknown) => {
    if (String(url).includes("odata/Media")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ value: [{ MediaURL: "https://api.cotality.com/fresh" }] }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => IMAGE.buffer.slice(IMAGE.byteOffset, IMAGE.byteOffset + IMAGE.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

describe("Phase 3.5 integration — the selector the cron actually issues", () => {
  it("excludes the crm: namespace and starts at the head of the key space on a cold sweep", async () => {
    await runMediaSync(makeOptions());

    const calls = verificationCalls();
    expect(calls).toHaveLength(1);
    const where = calls[0][0].where as Record<string, unknown>;
    expect(where).toMatchObject({ NOT: { media_key: { startsWith: "crm:" } } });
    expect(where.media_key).toEqual({ not: null });
    expect(calls[0][0].orderBy).toEqual({ media_key: "asc" });
    expect(calls[0][0].take).toBe(MAX_VERIFICATION_ROWS_PER_CYCLE);
  });

  it("resumes from the persisted cursor — the range scan, not a re-scan of the verified prefix", async () => {
    mockMediaSyncFindUnique.mockImplementation(async ({ where }) =>
      where.resource === RESOURCE_MEDIA_CONTENT_VERIFICATION
        ? storedSweep("MK-500", new Date(Date.now() - 10 * DAY), null)
        : null,
    );

    await runMediaSync(makeOptions());

    const where = verificationCalls()[0][0].where as { media_key: unknown };
    expect(where.media_key).toEqual({ not: null, gt: "MK-500" });
  });

  it("issues NO verification query at all while the sweep is idle between passes", async () => {
    mockMediaSyncFindUnique.mockImplementation(async ({ where }) =>
      where.resource === RESOURCE_MEDIA_CONTENT_VERIFICATION
        ? storedSweep(null, new Date(Date.now() - 10 * DAY), new Date(Date.now() + 30 * DAY))
        : null,
    );

    await runMediaSync(makeOptions());

    expect(verificationCalls()).toHaveLength(0);
    // and it does not pretend to have swept: no cursor write either
    expect(sweepUpsert()).toBeUndefined();
  });

  it("advances the cursor to the LAST ROW IT CONCLUDED and persists it", async () => {
    mockListingMediaFindMany.mockImplementation(async (args) =>
      isVerificationCall([args]) ? [dueRow("MK-1"), dueRow("MK-2"), dueRow("MK-3")] : [],
    );

    await runMediaSync(makeOptions());

    const upsert = sweepUpsert();
    expect(upsert).toBeDefined();
    const persisted = parseSweepState(upsert![0].update.last_listing_key as string);
    // A SHORT window (3 < cap) means the KEY RANGE is exhausted. The window carries no time
    // predicate, so it cannot also mean "nothing is due yet".
    expect(persisted.cursor).toBeNull();
    expect(persisted.nextSweepEligibleAt).not.toBeNull();
    expect(persisted.progressAt).not.toBeNull();
    // END-anchored: the gate opens `gap` after the sweep FINISHED, not `interval` after it began.
    expect(persisted.nextSweepEligibleAt!.getTime() - persisted.progressAt!.getTime()).toBe(
      CONTENT_VERIFICATION_SWEEP_GAP_MS,
    );
  });

  it("an EMPTY window ENDS the sweep instead of pinning the cursor forever", async () => {
    // The terminal stall: a universe that is an exact multiple of the cap left `processedKeys`
    // empty on the wrap cycle, `advanceSweepState` returned early, the cursor never reset, and
    // `shouldRunVerificationCycle` kept saying yes because `cursor !== null`. The window query
    // was then issued 24-144x/day forever, returning nothing, and no row was ever re-verified.
    mockMediaSyncFindUnique.mockImplementation(async ({ where }) =>
      where.resource === RESOURCE_MEDIA_CONTENT_VERIFICATION
        ? storedSweep("MK-999", new Date(Date.now() - 40 * DAY), null, new Date(Date.now() - 60_000))
        : null,
    );
    mockListingMediaFindMany.mockResolvedValue([]); // nothing beyond the cursor

    await runMediaSync(makeOptions());

    expect(verificationCalls()).toHaveLength(1); // it DID look
    const persisted = parseSweepState(sweepUpsert()![0].update.last_listing_key as string);
    expect(persisted.cursor).toBeNull();
    expect(persisted.nextSweepEligibleAt).not.toBeNull();
  });

  it("the window is a PURE KEY RANGE — no time predicate can be misread as exhaustion", async () => {
    await runMediaSync(makeOptions());
    const where = JSON.stringify(verificationCalls()[0][0].where);
    expect(where).not.toContain("content_check_at");
    expect(where).not.toContain("content_check_state");
    expect(where).toContain("r2_key");
  });

  it("a FULL batch keeps the sweep in flight and carries the cursor forward", async () => {
    const rows = Array.from({ length: MAX_VERIFICATION_ROWS_PER_CYCLE }, (_, i) =>
      dueRow(`MK-${String(i).padStart(3, "0")}`),
    );
    mockListingMediaFindMany.mockImplementation(async (args) => (isVerificationCall([args]) ? rows : []));

    await runMediaSync(makeOptions());

    const persisted = parseSweepState(sweepUpsert()![0].update.last_listing_key as string);
    expect(persisted.cursor).toBe(`MK-${String(MAX_VERIFICATION_ROWS_PER_CYCLE - 1).padStart(3, "0")}`);
    expect(persisted.nextSweepEligibleAt).toBeNull();
  });

  it("NEGATIVE: a crm: row that reaches the loop is never sent to Cotality and never recorded", async () => {
    // Defence in depth: the selector already excludes it, so this proves the row-level guard
    // independently of the query.
    mockListingMediaFindMany.mockImplementation(async (args) =>
      isVerificationCall([args]) ? [dueRow("crm:SL-0004/1779898434281")] : [],
    );

    await runMediaSync(makeOptions());

    const fetches = (global.fetch as unknown as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(fetches.filter((u) => u.includes("odata/Media"))).toHaveLength(0);
    expect(fetches.filter((u) => u.includes("api.cotality.com"))).toHaveLength(0);
    // no content_check write for it
    const checkWrites = mockListingMediaUpdate.mock.calls.filter((c) =>
      JSON.stringify((c[0] as { data?: unknown }).data ?? {}).includes("content_check"),
    );
    expect(checkWrites).toHaveLength(0);
  });

  it("the verifier is OBSERVABLE — the outcome counters reach a log line instead of being dropped", async () => {
    // Before this change they were computed and discarded, so a convergence claim could not
    // be checked against production at all.
    mockListingMediaFindMany.mockImplementation(async (args) =>
      isVerificationCall([args]) ? [dueRow("2005470401678"), dueRow("crm:SL-0004/17798984")] : [],
    );

    const event = await runAndReadTelemetry();
    expect(event).toBeDefined();
    expect(event).toMatchObject({
      selected: 2,
      checked: 1,
      verified: 1,
      mismatch: 0,
      indeterminate: 0,
      skipped_mallan_local: 1,
      examined: 2,           // BOTH rows examined — the declined one still moves the cursor
      sweep_range_exhausted: true,
      sweep_complete: true,
      sweep_no_progress: false,
    });
  });

  it("a STALLED sweep and a healthy IDLE one are DIFFERENT telemetry, not the same telemetry", async () => {
    // The pre-fix emission could not tell them apart: a terminally stalled sweep produced
    // selected 0 / cursor_advanced false / complete false / idle false, and so did a healthy
    // idle one. No alarm, and no recovery short of a manual reset.
    mockMediaSyncFindUnique.mockImplementation(async ({ where }) =>
      where.resource === RESOURCE_MEDIA_CONTENT_VERIFICATION
        ? storedSweep(null, new Date(Date.now() - 40 * DAY), new Date(Date.now() + 10 * DAY))
        : null,
    );
    const idle = await runAndReadTelemetry();
    expect(idle).toMatchObject({ sweep_phase: "idle", sweep_idle: true, sweep_stalled: false, selected: 0 });
    expect(verificationCalls()).toHaveLength(0); // and it costs no query

    jest.clearAllMocks();
    mockListingMediaFindMany.mockResolvedValue([]);
    mockMediaSyncUpsert.mockResolvedValue(undefined);
    mockMediaSyncFindUnique.mockImplementation(async ({ where }) =>
      where.resource === RESOURCE_MEDIA_CONTENT_VERIFICATION
        ? storedSweep(
            "MK-500",
            new Date(Date.now() - 40 * DAY),
            null,
            new Date(Date.now() - verificationSweepStallAfterMs() - 60_000),
          )
        : null,
    );
    const stalled = await runAndReadTelemetry();
    expect(stalled).toMatchObject({ sweep_phase: "stalled", sweep_stalled: true, sweep_idle: false });
    expect(stalled!.sweep_since_progress_ms as number).toBeGreaterThan(verificationSweepStallAfterMs());
  });

  it("a feed row IS checked and IS recorded — the guard is not a kill switch", async () => {
    mockListingMediaFindMany.mockImplementation(async (args) =>
      isVerificationCall([args]) ? [dueRow("2005470401678")] : [],
    );

    await runMediaSync(makeOptions());

    const checkWrites = mockListingMediaUpdate.mock.calls.filter((c) =>
      JSON.stringify((c[0] as { data?: unknown }).data ?? {}).includes("content_check"),
    );
    expect(checkWrites).toHaveLength(1);
    expect((checkWrites[0][0] as { data: { content_check_state: string } }).data.content_check_state).toBe(
      "VERIFIED",
    );
  });
});
