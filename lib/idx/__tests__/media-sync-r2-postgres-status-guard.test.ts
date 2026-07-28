/**
 * PR #584 — LAYER 2b: real-PostgreSQL proof of the ACTIVE-STATUS eligibility guard.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `media-sync-r2-postgres-concurrency.test.ts`
 * ---------------------------------------------------------------------------------
 * That file is the frozen evidence baseline for the four original defects and is
 * NOT modified. This is a NEW, additional defect found during the pre-push audit.
 *
 * THE DEFECT
 * ----------
 * The single parameterized failure statement guards on:
 *
 *     WHERE media_key = $1
 *       AND (r2_key IS NULL OR media_url_cached IS NULL)
 *
 * The unmirrored-pointer half correctly rejects a stale failure that lost a race
 * to a SUCCESSFUL mirror, because success populates `r2_key` and
 * `media_url_cached`. But it does NOT reject a stale failure against a row that
 * left the active set by some OTHER route — most importantly a row that was
 * TOMBSTONED (`status='deleted'`) while its mirror pointers are still null,
 * which is exactly the state a permanent-404 tombstone leaves behind.
 *
 * Such a row still satisfies `(r2_key IS NULL OR media_url_cached IS NULL)`, so
 * an in-flight stale worker keeps advancing its counter and refreshing its
 * cooldown on a row that is no longer eligible for mirroring at all. The
 * canonical selection predicate (`buildR2BacklogWhere`) opens with
 * `status: "active"`; the failure statement must carry the same condition, or
 * the write is not bounded by the same eligibility the selection was.
 *
 * The existing successful-mirror concurrency proof CANNOT catch this: it makes
 * the row ineligible by populating the pointers, so the pointer predicate does
 * the rejecting and the missing status condition is never exercised.
 *
 * HOW TO RUN
 * ----------
 *   PR584_EPHEMERAL_ENDPOINT=ep-<the-ephemeral-endpoint> \
 *   PR584_EPHEMERAL_DATABASE_URL="postgresql://..." \
 *   npx jest --config lib/idx/jest.config.js media-sync-r2-postgres-status-guard
 *
 * Same ephemeral-Neon discipline as Layer 2, enforced in code, not by
 * convention: fork of canonical production; fail-closed host guard that refuses
 * `ep-cold-waterfall-adno3ao2` and `ep-royal-dawn-ad6eh8t2`; the connection
 * string is read from the environment and NEVER logged; every row carries the
 * `PR584_STATUS_GUARD_PREFIX` media_key prefix and is removed in `afterAll`. It
 * never reads, writes, normalises or deletes real production media rows.
 *
 * EXPECTED RESULT ON HEAD 13c4278c: BOTH tests FAIL — the stale failure updates
 * the tombstoned row instead of matching zero rows.
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
import { mirrorMediaToR2, R2_RETRY_EXHAUSTED_THRESHOLD } from "../media-sync";

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

/** LIVE-OBSERVED non-permanent failure — HTTP 200 with a non-image payload. */
const nonImageDeps = () => makeDeps(makeResponse(200, "application/pdf", "%PDF-1.6"));
/** LIVE-OBSERVED permanent failure — HTTP 404 + Trestle JSON error body. */
const permanentDeps = () => makeDeps(makeResponse(404, "application/json; charset=utf-8", LIVE_404_MEDIA_GONE));

// ─── Fixtures ─────────────────────────────────────────────────────────────

const PR584_STATUS_GUARD_PREFIX = "PR584-STATUSGUARD-";

let clientA: PrismaClient;
let clientB: PrismaClient;
let testListingId: string;

const runSuite = EPHEMERAL_URL ? describe : describe.skip;

if (!EPHEMERAL_URL) {
  // Visible, not silent: a skipped run means this proof did not happen.
  // eslint-disable-next-line no-console
  console.warn(
    "\n[PR584 Layer 2b] SKIPPED — PR584_EPHEMERAL_DATABASE_URL is unset.\n" +
      "             The active-status eligibility guard was NOT proven.\n",
  );
}

jest.setTimeout(180_000);

runSuite("PR #584 — active-status eligibility guard (real PostgreSQL)", () => {
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
        .deleteMany({ where: { media_key: { startsWith: PR584_STATUS_GUARD_PREFIX } } })
        .catch(() => undefined);
      await clientA.$disconnect();
    }
    if (clientB) await clientB.$disconnect();
  });

  /** Insert one fixture row and return its media_key. */
  async function seed(
    name: string,
    fields: { r2_attempts?: number | null; status?: string } = {},
  ): Promise<string> {
    const mediaKey = `${PR584_STATUS_GUARD_PREFIX}${name}`;
    await clientA.listingMedia.deleteMany({ where: { media_key: mediaKey } });
    await clientA.listingMedia.create({
      data: {
        listing_id: testListingId,
        media_key: mediaKey,
        media_type: "Photo",
        order: 1,
        media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/pr584sg",
        status: fields.status ?? "active",
        // The mirror pointers stay NULL for the whole test. That is the point:
        // the pointer half of the guard can never be what rejects the write.
        r2_key: null,
        media_url_cached: null,
        r2_attempts: fields.r2_attempts ?? null,
        r2_last_attempt_at: null,
      },
    });
    return mediaKey;
  }

  /** Read the stored row back — this is what every assertion is made against. */
  async function stored(mediaKey: string) {
    const row = await clientA.listingMedia.findUnique({
      where: { media_key: mediaKey },
      select: {
        status: true,
        r2_attempts: true,
        r2_last_attempt_at: true,
        r2_key: true,
        media_url_cached: true,
      },
    });
    if (!row) throw new Error(`fixture row ${mediaKey} disappeared`);
    return row;
  }

  /** The batch-selection snapshot a worker carries into `mirrorMediaToR2`. */
  function snapshot(mediaKey: string, overrides: Partial<MirrorMediaToR2Row> = {}): MirrorMediaToR2Row {
    return {
      listing_id: testListingId,
      media_key: mediaKey,
      media_type: "Photo",
      order: 1,
      media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/pr584sg",
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

  // ── DEFECT — ordinary failure against a row tombstoned mid-flight ───────
  it("DEFECT — a stale ordinary failure must not touch a row tombstoned while unmirrored", async () => {
    const key = await seed("ordinary", { r2_attempts: 2, status: "active" });

    // Worker A selected the row while it was ACTIVE and unmirrored.
    const staleSnapshot = snapshot(key, { r2_attempts: 2 });

    // DETERMINISTIC BARRIER: worker B tombstones the row FIRST — the exact
    // state a proven-permanent 404 leaves behind. The mirror pointers stay
    // NULL, so the unmirrored half of the guard still matches and cannot be
    // what rejects the stale write.
    await clientB.listingMedia.update({
      where: { media_key: key },
      data: { status: "deleted" },
    });
    const committed = await stored(key);
    expect(committed.status).toBe("deleted");
    expect(committed.r2_key).toBeNull();
    expect(committed.media_url_cached).toBeNull();

    // Only now is worker A's stale failure released. A non-permanent failure,
    // so nothing about the payload could legitimately change the status —
    // any drift here is the counter/cooldown advancing on an ineligible row.
    await asWorker(clientA, () => mirrorMediaToR2(staleSnapshot, nonImageDeps()));

    const row = await stored(key);
    // Zero rows matched ⇒ the row is EXACTLY as the tombstone left it.
    expect(row.status).toBe("deleted");
    expect(row.r2_attempts).toBe(2);
    expect(row.r2_last_attempt_at).toBeNull();
    expect(row.r2_key).toBeNull();
    expect(row.media_url_cached).toBeNull();
    // And as a whole row, so no unlisted column drifts either.
    expect(row).toEqual(committed);
  });

  // ── DEFECT — exact-8 recovery failure against a tombstoned row ──────────
  it("DEFECT — a stale exact-8 recovery failure must not touch a row tombstoned while unmirrored", async () => {
    const key = await seed("recovery", {
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
      status: "active",
    });

    const staleSnapshot = snapshot(key, { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD });

    // Same barrier: tombstoned first, pointers left NULL.
    await clientB.listingMedia.update({
      where: { media_key: key },
      data: { status: "deleted" },
    });
    const committed = await stored(key);
    expect(committed.status).toBe("deleted");

    // The recovery statement is the separate exact-8 path. A permanent 404
    // here would legitimately tombstone an ELIGIBLE row — but this row is no
    // longer eligible, so the statement must match zero rows and the cooldown
    // must not be refreshed.
    await asWorker(clientA, () =>
      mirrorMediaToR2(staleSnapshot, permanentDeps(), { recoveryAttempt: true }),
    );

    const row = await stored(key);
    expect(row.status).toBe("deleted");
    expect(row.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(row.r2_last_attempt_at).toBeNull();
    expect(row).toEqual(committed);
  });

  // ── CONTROL — the guard must not over-reject an eligible row ───────────
  it("CONTROL — an ACTIVE unmirrored row is still updated normally", async () => {
    const key = await seed("control-active", { r2_attempts: 2, status: "active" });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 2 }), nonImageDeps()));

    const row = await stored(key);
    // Non-vacuity: the status condition must reject the tombstoned row above
    // WITHOUT rejecting this one.
    expect(row.r2_attempts).toBe(3);
    expect(row.status).toBe("active");
    expect(row.r2_last_attempt_at).not.toBeNull();
  });
});
