/**
 * PR #584 — LAYER 2c: real-PostgreSQL proof that the failure write cannot
 * reinterpret the #534 POLICY-PARKED sentinel.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 * ------------------------------
 * `media-sync-r2-postgres-concurrency.test.ts` (the four original defects) and
 * `media-sync-r2-postgres-status-guard.test.ts` (the active-status guard) are
 * both frozen evidence baselines and are NOT modified. This is a third,
 * distinct defect, raised by Codex against head 57b2bdf9.
 *
 * THE DEFECT
 * ----------
 * `r2_attempts` has three meanings, not one:
 *
 *   NULL / 1..7  an ordinary consecutive-FAILURE COUNT
 *   8            retry-exhausted terminal (RC3) — still a failure count
 *   9            POLICY-PARKED sentinel (#534) — an ASSIGNED value, never
 *                reached by arithmetic, and NOT a failure count
 *   >9           legacy overflow; 80 frozen production rows, max 112
 *
 * The mutation-time guard was `status = 'active' AND (r2_key IS NULL OR
 * media_url_cached IS NULL)`. Policy-parked rows deliberately stay ACTIVE and
 * UNMIRRORED — that is the whole point of parking rather than deleting: the
 * photo still serves through the media_url_original proxy. So a parked row
 * satisfies both halves of that guard.
 *
 * An ordinary worker selected while the row was still eligible
 * (`r2_attempts < 8`) can therefore race an invocation that parks the row at 9.
 * When its stale failure lands, the counter CASE correctly preserves 9 — but
 * the STATUS expression re-evaluates that same CASE, reads 9, and finds
 * `9 >= R2_TOMBSTONE_4XX_THRESHOLD` true, so a single permanent 404 tombstones
 * a policy-parked row on that worker's FIRST failure. Nine is not three
 * failures; treating an assigned sentinel as a failure count is a category
 * error. The same applies to the >9 legacy population, which this path must
 * never tombstone or normalise.
 *
 * The exact-8 recovery statement has the same shape (`r2_attempts >= 3`), so a
 * row parked at 9 after recovery selection is tombstoned there too.
 *
 * THE FIX UNDER TEST — the write is bounded by the same attempts eligibility
 * the selection used:
 *   ordinary   ... AND (r2_attempts IS NULL OR r2_attempts < 8)
 *   recovery   ... AND r2_attempts = 8
 *
 * HOW TO RUN
 * ----------
 *   PR584_EPHEMERAL_ENDPOINT=ep-<the-ephemeral-endpoint> \
 *   PR584_EPHEMERAL_DATABASE_URL="postgresql://..." \
 *   npx jest --config lib/idx/jest.config.js media-sync-r2-postgres-policy-sentinel
 *
 * Same ephemeral-Neon discipline as the other PostgreSQL suites, enforced in
 * code: fork of canonical production; fail-closed host guard refusing
 * `ep-cold-waterfall-adno3ao2` and `ep-royal-dawn-ad6eh8t2`; the connection
 * string is read from the environment and NEVER logged; every row carries the
 * `PR584_SENTINEL_PREFIX` media_key prefix and is removed in `afterAll`. It
 * never reads, writes, normalises or deletes real production media rows — in
 * particular not the 80 frozen `r2_attempts > 9` rows.
 *
 * EXPECTED RESULT ON HEAD 57b2bdf9: the three DEFECT cases FAIL; the positive
 * controls pass.
 */

import { PrismaClient } from "@prisma/client";
import type { MirrorMediaToR2Deps, MirrorMediaToR2Row } from "../media-sync";

// ─── Fail-closed target guard ─────────────────────────────────────────────

const EPHEMERAL_URL = process.env.PR584_EPHEMERAL_DATABASE_URL ?? "";
const EXPECTED_ENDPOINT = process.env.PR584_EPHEMERAL_ENDPOINT ?? "";

/** Canonical production and known-stale hosts. Never a valid target here. */
const REFUSED_HOSTS = ["ep-cold-waterfall-adno3ao2", "ep-royal-dawn-ad6eh8t2"] as const;

/**
 * Throws unless the target is demonstrably the intended ephemeral branch.
 * The URL itself is NEVER included in any message — it carries credentials.
 */
function assertEphemeralTarget(url: string, expectedEndpoint: string): void {
  if (!url) throw new Error("PR584_EPHEMERAL_DATABASE_URL is empty — refusing to run.");
  for (const host of REFUSED_HOSTS) {
    if (url.includes(host)) {
      throw new Error(`REFUSING: target names ${host}. This suite must never run against it.`);
    }
  }
  if (!expectedEndpoint) {
    throw new Error("PR584_EPHEMERAL_ENDPOINT is unset — cannot verify the target is ephemeral.");
  }
  if (!url.includes(expectedEndpoint)) {
    throw new Error(`REFUSING: target does not contain the expected ephemeral endpoint ${expectedEndpoint}.`);
  }
}

// ─── Prisma routed to the ACTIVE worker's own connection ──────────────────

let activeClient: PrismaClient | null = null;

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (!activeClient) throw new Error("No active PrismaClient — worker context missing.");
        return (activeClient as unknown as Record<string | symbol, unknown>)[prop];
      },
    },
  ),
}));

// Imported AFTER the prisma mock is wired up.
import {
  mirrorMediaToR2,
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from "../media-sync";

// ─── Live-observed Cotality fixtures (provenance: Layer 1 header) ─────────

const LIVE_404_MEDIA_GONE =
  '{"code":"404","message":"ERROR - External media was not downloaded.","target":null,"details":null,"innerError":null,"instanceAnnotations":[],"typeAnnotation":null}';

function makeResponse(status: number, contentType?: string, body?: string): Response {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new Response(body ? new TextEncoder().encode(body) : new Uint8Array(0), { status, headers });
}

function makeDeps(response: Response): MirrorMediaToR2Deps {
  return {
    existsInR2: async () => false,
    uploadToR2: async () => {
      throw new Error("upload should not be reached in this test");
    },
    getR2PublicUrl: (key: string) => `https://r2.example.com/${key}`,
    getAccessToken: async () => "test-token",
    fetchFn: (async () => response.clone()) as unknown as typeof fetch,
  };
}

/** LIVE-OBSERVED permanent failure — HTTP 404 + Trestle JSON error body. */
const permanentDeps = () => makeDeps(makeResponse(404, "application/json; charset=utf-8", LIVE_404_MEDIA_GONE));
/** LIVE-OBSERVED non-permanent failure — HTTP 200 with a non-image payload. */
const nonImageDeps = () => makeDeps(makeResponse(200, "application/pdf", "%PDF-1.6"));

// ─── Fixtures ─────────────────────────────────────────────────────────────

const PR584_SENTINEL_PREFIX = "PR584-SENTINEL-";
/** The cooldown the PARKING transaction commits. Nothing may overwrite it. */
const PARK_TIME = new Date("2026-07-01T00:00:00.000Z");

let clientA: PrismaClient;
let clientB: PrismaClient;
let testListingId: string;

const runSuite = EPHEMERAL_URL ? describe : describe.skip;

if (!EPHEMERAL_URL) {
  // Visible, not silent: a skipped run means this proof did not happen.
  // eslint-disable-next-line no-console
  console.warn(
    "\n[PR584 Layer 2c] SKIPPED — PR584_EPHEMERAL_DATABASE_URL is unset.\n" +
      "             The policy-sentinel race was NOT proven.\n",
  );
}

jest.setTimeout(180_000);

runSuite("PR #584 — the failure write must not reinterpret the policy sentinel", () => {
  beforeAll(async () => {
    assertEphemeralTarget(EPHEMERAL_URL, EXPECTED_ENDPOINT);

    // Two INDEPENDENT connections — these are the two workers.
    clientA = new PrismaClient({ datasourceUrl: EPHEMERAL_URL });
    clientB = new PrismaClient({ datasourceUrl: EPHEMERAL_URL });
    await clientA.$connect();
    await clientB.$connect();

    // listing_media.listing_id is a FK onto listings. Borrow a real listing so
    // the fixture rows are schema-valid; the listing itself is never modified.
    const listing = await clientA.listing.findFirst({ select: { listing_id: true } });
    if (!listing) throw new Error("No listings on the ephemeral branch — cannot build fixtures.");
    testListingId = listing.listing_id;
  });

  afterAll(async () => {
    if (clientA) {
      await clientA.listingMedia
        .deleteMany({ where: { media_key: { startsWith: PR584_SENTINEL_PREFIX } } })
        .catch(() => undefined);
      await clientA.$disconnect();
    }
    if (clientB) await clientB.$disconnect();
  });

  /** Insert one fixture row and return its media_key. */
  async function seed(
    name: string,
    fields: { r2_attempts?: number | null; r2_last_attempt_at?: Date | null } = {},
  ): Promise<string> {
    const mediaKey = `${PR584_SENTINEL_PREFIX}${name}`;
    await clientA.listingMedia.deleteMany({ where: { media_key: mediaKey } });
    await clientA.listingMedia.create({
      data: {
        listing_id: testListingId,
        media_key: mediaKey,
        media_type: "Photo",
        order: 1,
        media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/pr584ps",
        // Parked rows stay ACTIVE and UNMIRRORED — that is exactly why the
        // status and pointer halves of the guard cannot be what rejects here.
        status: "active",
        r2_key: null,
        media_url_cached: null,
        r2_attempts: fields.r2_attempts ?? null,
        r2_last_attempt_at: fields.r2_last_attempt_at ?? null,
      },
    });
    return mediaKey;
  }

  /** Read the COMPLETE stored row back — assertions are made on all of it. */
  async function stored(mediaKey: string) {
    const row = await clientA.listingMedia.findUnique({
      where: { media_key: mediaKey },
      select: {
        status: true,
        r2_attempts: true,
        r2_last_attempt_at: true,
        r2_key: true,
        media_url_cached: true,
        media_url_original: true,
        media_type: true,
      },
    });
    if (!row) throw new Error(`fixture row ${mediaKey} disappeared`);
    return row;
  }

  /**
   * The PARKING transaction, on the OTHER connection: assign the #534 sentinel
   * and its cooldown, leaving the row active and unmirrored.
   */
  async function policyPark(mediaKey: string) {
    await clientB.listingMedia.update({
      where: { media_key: mediaKey },
      data: { r2_attempts: R2_POLICY_PARKED_ATTEMPTS, r2_last_attempt_at: PARK_TIME },
    });
    const committed = await stored(mediaKey);
    // The barrier is only meaningful if the parked row really does satisfy the
    // status and pointer halves of the guard.
    expect(committed.r2_attempts).toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(committed.status).toBe("active");
    expect(committed.r2_key).toBeNull();
    expect(committed.media_url_cached).toBeNull();
    return committed;
  }

  /** The batch-selection snapshot a worker carries into `mirrorMediaToR2`. */
  function snapshot(mediaKey: string, overrides: Partial<MirrorMediaToR2Row> = {}): MirrorMediaToR2Row {
    return {
      listing_id: testListingId,
      media_key: mediaKey,
      media_type: "Photo",
      order: 1,
      media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/pr584ps",
      r2_key: null,
      media_url_cached: null,
      ...overrides,
    };
  }

  /** Run one worker's whole attempt on its OWN connection. */
  async function asWorker<T>(client: PrismaClient, fn: () => Promise<T>): Promise<T> {
    activeClient = client;
    try {
      return await fn();
    } finally {
      activeClient = null;
    }
  }

  // ── DEFECT 1 — ordinary stale failure versus a policy park ─────────────
  it("DEFECT — an ordinary stale failure must not touch a row policy-parked mid-flight", async () => {
    // Worker A selected the row while it was ordinarily eligible (below 8).
    const key = await seed("ordinary-vs-park", { r2_attempts: 3 });
    const staleSnapshot = snapshot(key, { r2_attempts: 3 });

    // DETERMINISTIC BARRIER: worker B parks the row at the sentinel FIRST.
    const committed = await policyPark(key);

    // Only now is worker A's stale PERMANENT 404 released. Nine is an assigned
    // sentinel, not three failures — this attempt is the worker's FIRST.
    await asWorker(clientA, () => mirrorMediaToR2(staleSnapshot, permanentDeps()));

    const row = await stored(key);
    // Zero rows matched ⇒ the row is EXACTLY as the parking transaction left it.
    expect(row.r2_attempts).toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(row.status).toBe("active");
    expect(row.r2_last_attempt_at).toEqual(PARK_TIME);
    expect(row.r2_key).toBeNull();
    expect(row.media_url_cached).toBeNull();
    // The COMPLETE stored row, so no unlisted column drifts either.
    expect(row).toEqual(committed);
  });

  // ── DEFECT 2 — recovery stale failure versus a policy park ─────────────
  it("DEFECT — a stale exact-8 recovery must not touch a row policy-parked mid-flight", async () => {
    // Worker A selected the row through the exact-match recovery path (8).
    const key = await seed("recovery-vs-park", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD });
    const staleSnapshot = snapshot(key, { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD });

    // Same barrier: parked to the sentinel before the stale write lands.
    const committed = await policyPark(key);

    await asWorker(clientA, () =>
      mirrorMediaToR2(staleSnapshot, permanentDeps(), { recoveryAttempt: true }),
    );

    const row = await stored(key);
    expect(row.r2_attempts).toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(row.status).toBe("active");
    expect(row.r2_last_attempt_at).toEqual(PARK_TIME);
    expect(row.r2_key).toBeNull();
    expect(row.media_url_cached).toBeNull();
    expect(row).toEqual(committed);
  });

  // ── DEFECT 3 — the legacy overflow population ──────────────────────────
  it("DEFECT — a permanent 404 must not tombstone or normalise a stored value above 9", async () => {
    // The frozen legacy population (10..112). It is neither a failure count nor
    // a policy sentinel, and this path must leave it EXACTLY as found.
    const key = await seed("legacy-overflow", { r2_attempts: 112, r2_last_attempt_at: PARK_TIME });
    const committed = await stored(key);

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 112 }), permanentDeps()));

    const row = await stored(key);
    expect(row.r2_attempts).toBe(112);
    expect(row.status).toBe("active");
    expect(row.r2_last_attempt_at).toEqual(PARK_TIME);
    expect(row).toEqual(committed);
  });

  // ── POSITIVE CONTROLS — the guard must not over-reject ─────────────────

  it("CONTROL — an ordinary ACTIVE unmirrored row below 8 is still updated correctly", async () => {
    const key = await seed("ordinary-control", { r2_attempts: 3 });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 3 }), nonImageDeps()));

    const row = await stored(key);
    // Non-vacuity: the attempts predicate must reject the parked rows above
    // WITHOUT rejecting an ordinarily eligible one.
    expect(row.r2_attempts).toBe(4);
    expect(row.status).toBe("active");
    expect(row.r2_last_attempt_at).not.toBeNull();
  });

  it("CONTROL — the last ordinary advance still reaches exactly 8 and then stops", async () => {
    const key = await seed("ordinary-boundary", { r2_attempts: 7 });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 7 }), nonImageDeps()));
    expect((await stored(key)).r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);

    // A further ordinary failure is now out of scope for the ordinary path and
    // must leave the terminal untouched — never 9, which is reserved.
    await asWorker(clientB, () =>
      mirrorMediaToR2(snapshot(key, { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }), nonImageDeps()),
    );
    const row = await stored(key);
    expect(row.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(row.r2_attempts).not.toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(row.status).toBe("active");
  });

  it("CONTROL — recovery at exactly 8 still follows the documented behaviour", async () => {
    // Transient: cooldown restarts, counter and active status preserved.
    const transientKey = await seed("recovery-control-transient", {
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
    });
    await asWorker(clientA, () =>
      mirrorMediaToR2(
        snapshot(transientKey, { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }),
        nonImageDeps(),
        { recoveryAttempt: true },
      ),
    );
    const transient = await stored(transientKey);
    expect(transient.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(transient.status).toBe("active");
    expect(transient.r2_last_attempt_at).not.toBeNull();

    // Permanent 404: tombstones while preserving 8, and never writes 9.
    const permanentKey = await seed("recovery-control-permanent", {
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
    });
    await asWorker(clientA, () =>
      mirrorMediaToR2(
        snapshot(permanentKey, { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }),
        permanentDeps(),
        { recoveryAttempt: true },
      ),
    );
    const permanent = await stored(permanentKey);
    expect(permanent.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(permanent.r2_attempts).not.toBe(R2_POLICY_PARKED_ATTEMPTS);
    expect(permanent.status).toBe("deleted");
    expect(permanent.r2_last_attempt_at).not.toBeNull();
  });
});
