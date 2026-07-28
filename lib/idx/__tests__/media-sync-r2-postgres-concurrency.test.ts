/**
 * PR #584 — LAYER 2: decisive real-PostgreSQL concurrency proof.
 *
 * WHY THIS LAYER IS THE ONE THAT COUNTS
 * -------------------------------------
 * Layer 1 (`media-sync-r2-concurrency.test.ts`) is a JavaScript simulation
 * written by the same author as the implementation, so it can faithfully
 * reproduce a wrong assumption about what PostgreSQL does. Only a real database
 * can refute that assumption. The assertions below read the STORED ROW back out
 * of PostgreSQL after controlled concurrent transactions.
 *
 * HOW TO RUN
 * ----------
 *   PR584_EPHEMERAL_ENDPOINT=ep-<the-ephemeral-endpoint> \
 *   PR584_EPHEMERAL_DATABASE_URL="postgresql://..." \
 *   npx jest --config lib/idx/jest.config.js media-sync-r2-postgres-concurrency
 *
 * Without `PR584_EPHEMERAL_DATABASE_URL` the suite SKIPS (so ordinary CI, which
 * has no database, stays green). It never silently skips when the variable IS
 * set: a wrong or unsafe target is a hard failure, not a skip.
 *
 * EPHEMERAL NEON DISCIPLINE — enforced in code below, not by convention:
 *   - fork of canonical production, so the schema and data are real;
 *   - fail-closed host guard: the target MUST contain the endpoint id given in
 *     `PR584_EPHEMERAL_ENDPOINT`, and is REFUSED outright if it names canonical
 *     production (`ep-cold-waterfall-adno3ao2`) or the stale morning-bread
 *     project (`ep-royal-dawn-ad6eh8t2`);
 *   - the connection string is read from the environment and never logged;
 *   - every row this suite touches carries the `PR584_TEST_PREFIX` media_key
 *     prefix and is removed in `afterAll`. It NEVER reads, writes, normalises
 *     or deletes real production media rows — in particular not the 80 frozen
 *     `r2_attempts > 9` rows, which are read only in aggregate by the separate
 *     live probe, never mutated.
 *
 * EXPECTED RESULT ON HEAD 2a8eef8d81: the four DEFECT tests FAIL; the CONTROL
 * tests pass. A DEFECT test that passes against that head is not exposing its
 * defect and must be strengthened before any implementation work begins.
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
import { mirrorMediaToR2 } from "../media-sync";

// ─── Live-observed Cotality fixtures (see Layer 1 header for provenance) ──

const LIVE_404_MEDIA_GONE =
  '{"code":"404","message":"ERROR - External media was not downloaded.","target":null,"details":null,"innerError":null,"instanceAnnotations":[],"typeAnnotation":null}';

function makeResponse(status: number, contentType?: string, body?: string): Response {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new Response(body ? new TextEncoder().encode(body) : new Uint8Array(0), { status, headers });
}

function makeDeps(response: Response, uploadOk = false): MirrorMediaToR2Deps {
  return {
    existsInR2: async () => false,
    uploadToR2: async (key: string) => {
      if (!uploadOk) throw new Error("upload should not be reached in this test");
      return `https://r2.example.com/${key}`;
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
/** Healthy media — HTTP 200 image/jpeg, upload permitted. */
const successDeps = () => makeDeps(makeResponse(200, "image/jpeg", "jpegbytes"), true);

// ─── Fixtures ─────────────────────────────────────────────────────────────

const PR584_TEST_PREFIX = "PR584-TEST-";
const TRIGGER_NAME = "pr584_block_attempts_change";

let clientA: PrismaClient;
let clientB: PrismaClient;
let testListingId: string;

const runSuite = EPHEMERAL_URL ? describe : describe.skip;

if (!EPHEMERAL_URL) {
  // Visible, not silent: a skipped Layer 2 means the decisive proof did not run.
  // eslint-disable-next-line no-console
  console.warn(
    "\n[PR584 Layer 2] SKIPPED — PR584_EPHEMERAL_DATABASE_URL is unset.\n" +
      "             This is the DECISIVE proof; a green run without it proves nothing\n" +
      "             about real PostgreSQL behaviour.\n",
  );
}

jest.setTimeout(180_000);

runSuite("PR #584 — real PostgreSQL concurrency", () => {
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
      // Drop the test-only trigger even if a test threw mid-way.
      await clientA
        .$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON listing_media`)
        .catch(() => undefined);
      await clientA.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER_NAME}()`).catch(() => undefined);
      await clientA.listingMedia
        .deleteMany({ where: { media_key: { startsWith: PR584_TEST_PREFIX } } })
        .catch(() => undefined);
      await clientA.$disconnect();
    }
    if (clientB) await clientB.$disconnect();
  });

  /** Insert one fixture row and return its media_key. */
  async function seed(
    name: string,
    fields: {
      r2_attempts?: number | null;
      status?: string;
      r2_key?: string | null;
      media_url_cached?: string | null;
      r2_last_attempt_at?: Date | null;
    } = {},
  ): Promise<string> {
    const mediaKey = `${PR584_TEST_PREFIX}${name}`;
    await clientA.listingMedia.deleteMany({ where: { media_key: mediaKey } });
    await clientA.listingMedia.create({
      data: {
        listing_id: testListingId,
        media_key: mediaKey,
        media_type: "Photo",
        order: 1,
        media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/pr584",
        status: fields.status ?? "active",
        r2_key: fields.r2_key ?? null,
        media_url_cached: fields.media_url_cached ?? null,
        r2_attempts: fields.r2_attempts ?? null,
        r2_last_attempt_at: fields.r2_last_attempt_at ?? null,
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
      media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/pr584",
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

  // ── DEFECT 4 — NULL undercount ─────────────────────────────────────────
  it("DEFECT — two failures from NULL store 2, not 1", async () => {
    const key = await seed("null-undercount", { r2_attempts: null });

    // BARRIER: both workers selected the row at r2_attempts = NULL before
    // either wrote. Their writes are then issued in a fixed order.
    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: null }), nonImageDeps()));
    await asWorker(clientB, () => mirrorMediaToR2(snapshot(key, { r2_attempts: null }), nonImageDeps()));

    expect((await stored(key)).r2_attempts).toBe(2);
  });

  // ── DEFECT 2 — tombstone decided from a stale count ────────────────────
  it("DEFECT — two overlapping permanent 404s from 1 reach 3 and tombstone", async () => {
    const key = await seed("stale-tombstone", { r2_attempts: 1 });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 1 }), permanentDeps()));
    await asWorker(clientB, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 1 }), permanentDeps()));

    const row = await stored(key);
    expect(row.r2_attempts).toBe(3);
    // The statement that PRODUCED 3 is the third permanent failure and must
    // apply the tombstone. Deciding from each worker's snapshot makes both
    // compute 2, and the row survives its third permanent failure.
    expect(row.status).toBe("deleted");
  });

  // ── DEFECT 3 — stale failure overwrites a committed success ────────────
  it("DEFECT — a stale failure must not overwrite a committed success", async () => {
    const key = await seed("stale-vs-success", { r2_attempts: 2 });

    // Worker A snapshots the row while it is still unmirrored.
    const staleSnapshot = snapshot(key, { r2_attempts: 2, r2_key: null, media_url_cached: null });

    // BARRIER: worker B's success commits FIRST, in full.
    const mirroredKey = `listings/${testListingId}/Photo/${key}.jpg`;
    const mirroredUrl = `https://r2.example.com/${mirroredKey}`;
    await clientB.listingMedia.update({
      where: { media_key: key },
      data: { r2_key: mirroredKey, media_url_cached: mirroredUrl, r2_attempts: 0, r2_last_attempt_at: null },
    });

    // Only now is worker A's stale failure released.
    await asWorker(clientA, () => mirrorMediaToR2(staleSnapshot, permanentDeps()));

    const row = await stored(key);
    expect(row.status).toBe("active");
    expect(row.r2_key).toBe(mirroredKey);
    expect(row.media_url_cached).toBe(mirroredUrl);
    expect(row.r2_attempts).toBe(0);
    expect(row.r2_last_attempt_at).toBeNull();
  });

  // ── DEFECT 1 — split write, proven by a trigger ────────────────────────
  it("DEFECT — cooldown/status cannot commit without the counter", async () => {
    const key = await seed("split-write", { r2_attempts: 2 });

    // A test-only trigger that REFUSES any change to r2_attempts, scoped to
    // this one fixture row. Under a split implementation the cooldown/status
    // statement commits and the counter statement then raises, leaving the row
    // partially written. Under one guarded statement PostgreSQL aborts and
    // rolls back every field together.
    await clientA.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION ${TRIGGER_NAME}() RETURNS trigger AS $$
      BEGIN
        IF NEW.r2_attempts IS DISTINCT FROM OLD.r2_attempts THEN
          RAISE EXCEPTION 'PR584_TEST_TRIGGER: r2_attempts change blocked';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
    `);
    await clientA.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON listing_media`);
    await clientA.$executeRawUnsafe(`
      CREATE TRIGGER ${TRIGGER_NAME}
      BEFORE UPDATE ON listing_media
      FOR EACH ROW
      WHEN (NEW.media_key = '${key}')
      EXECUTE FUNCTION ${TRIGGER_NAME}();
    `);

    await expect(
      asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 2 }), nonImageDeps())),
    ).rejects.toThrow(/PR584_TEST_TRIGGER/);

    // The cooldown, the status and the counter describe ONE failed attempt.
    // The counter was refused, so nothing may have been persisted.
    const row = await stored(key);
    expect(row.r2_last_attempt_at).toBeNull();
    expect(row.r2_attempts).toBe(2);
    expect(row.status).toBe("active");

    await clientA.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON listing_media`);
    await clientA.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER_NAME}()`);
  });

  // ── CONTROLS — must pass on the unsafe head too ────────────────────────

  it("CONTROL — two failures from 7 reach exactly 8 and never 9", async () => {
    const key = await seed("terminal-bound", { r2_attempts: 7 });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 7 }), nonImageDeps()));
    await asWorker(clientB, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 7 }), nonImageDeps()));

    const row = await stored(key);
    expect(row.r2_attempts).toBe(8);
    expect(row.r2_attempts).not.toBe(9);
  });

  it("CONTROL — one non-permanent failure from 2 advances to 3 and stays active", async () => {
    const key = await seed("ordinary-advance", { r2_attempts: 2 });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 2 }), nonImageDeps()));

    const row = await stored(key);
    expect(row.r2_attempts).toBe(3);
    expect(row.status).toBe("active");
  });

  it("CONTROL — recovery at 8: non-permanent failure preserves 8 and refreshes cooldown", async () => {
    const key = await seed("recovery-transient", { r2_attempts: 8 });

    await asWorker(clientA, () =>
      mirrorMediaToR2(snapshot(key, { r2_attempts: 8 }), nonImageDeps(), { recoveryAttempt: true }),
    );

    const row = await stored(key);
    expect(row.r2_attempts).toBe(8);
    expect(row.status).toBe("active");
    expect(row.r2_last_attempt_at).not.toBeNull();
  });

  it("CONTROL — recovery at 8: permanent 404 tombstones while preserving 8", async () => {
    const key = await seed("recovery-permanent", { r2_attempts: 8 });

    await asWorker(clientA, () =>
      mirrorMediaToR2(snapshot(key, { r2_attempts: 8 }), permanentDeps(), { recoveryAttempt: true }),
    );

    const row = await stored(key);
    expect(row.r2_attempts).toBe(8);
    expect(row.status).toBe("deleted");
  });

  it.each([9, 10, 112])(
    "CONTROL — a row stored at %i is left exactly as found by an ordinary failure",
    async (start) => {
      const key = await seed(`terminal-${start}`, { r2_attempts: start });

      await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: start }), nonImageDeps()));

      const row = await stored(key);
      // No arithmetic may touch a policy-parked or legacy-overflow row. This
      // is what keeps the 80 frozen production rows un-normalised.
      expect(row.r2_attempts).toBe(start);
    },
  );

  it("CONTROL — a successful mirror resets the counter and clears the cooldown", async () => {
    const key = await seed("success-reset", { r2_attempts: 5, r2_last_attempt_at: new Date() });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(key, { r2_attempts: 5 }), successDeps()));

    const row = await stored(key);
    expect(row.r2_attempts).toBe(0);
    expect(row.r2_last_attempt_at).toBeNull();
    expect(row.r2_key).not.toBeNull();
    expect(row.media_url_cached).not.toBeNull();
  });

  // ── CONTROL — parameterization, not interpolation ──────────────────────
  it("CONTROL — a SQL-shaped media_key is treated as data and cannot reach a control row", async () => {
    const controlKey = await seed("param-control", { r2_attempts: 4 });
    // A media_key carrying quotes and a statement terminator. If any code path
    // interpolated it into SQL, this would execute against other rows.
    const hostileKey = await seed("param-hostile'; UPDATE listing_media SET status='deleted'; --", {
      r2_attempts: 4,
    });

    await asWorker(clientA, () => mirrorMediaToR2(snapshot(hostileKey, { r2_attempts: 4 }), nonImageDeps()));

    // The hostile row was updated normally — the key was DATA, matching itself.
    const hostile = await stored(hostileKey);
    expect(hostile.r2_attempts).toBe(5);

    // The control row is untouched: no injected statement executed.
    const control = await stored(controlKey);
    expect(control.r2_attempts).toBe(4);
    expect(control.status).toBe("active");
  });
});
