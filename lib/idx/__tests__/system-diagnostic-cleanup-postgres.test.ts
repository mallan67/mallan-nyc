/**
 * Real-PostgreSQL proof of the 30-day system-diagnostic retention predicate.
 *
 * The bounds suite (`tests/runtime/system-diagnostic-cleanup-bounds.test.ts`)
 * proves the statement's SHAPE and the batching arithmetic against a mocked
 * client. It cannot prove what the predicate actually MATCHES — only a database
 * can. This suite deletes real rows in a real table and reads back what
 * survived.
 *
 * HOW TO RUN
 *   PR584_EPHEMERAL_ENDPOINT=ep-<the-ephemeral-endpoint> \
 *   PR584_EPHEMERAL_DATABASE_URL="postgresql://..." \
 *   npx jest --config lib/idx/jest.config.js system-diagnostic-cleanup-postgres
 *
 * Without the URL the suite SKIPS, so ordinary CI (no database) stays green.
 * It never silently skips when the variable IS set: a wrong or unsafe target is
 * a hard failure.
 *
 * EPHEMERAL DISCIPLINE — enforced in code:
 *   - fork of canonical production, so the schema and the real 46k-row backlog
 *     are present;
 *   - fail-closed host guard: the target MUST name the endpoint given in
 *     PR584_EPHEMERAL_ENDPOINT, and is REFUSED outright if it names canonical
 *     production (`ep-cold-waterfall-adno3ao2`) or the stale morning-bread
 *     project (`ep-royal-dawn-ad6eh8t2`);
 *   - the connection string is read from the environment and never logged;
 *   - every seeded row carries the `TEST_ENTITY_PREFIX` entity_id and is removed
 *     in `afterAll`.
 *
 * DETERMINISM. Seeded rows are dated in the year 2020, far older than any real
 * row (production data begins 2026-03-15). Because the cleanup orders by
 * `created_at, id`, the seeds are always claimed FIRST, so a tiny `maxRows` is
 * enough to exercise the predicate without touching the real backlog.
 */

import { PrismaClient } from "@prisma/client";
import {
  purgeExpiredDiagnostics,
  countExpiredDiagnostics,
  DIAGNOSTIC_BATCH_SIZE,
  DIAGNOSTIC_MAX_PER_INVOCATION,
} from "../../retention/system-diagnostic-cleanup";
import { SYNC_DIAGNOSTIC_DEDUPE_ACTIONS } from "../diagnostic-recorder";

const EPHEMERAL_URL = process.env.PR584_EPHEMERAL_DATABASE_URL ?? "";
const EXPECTED_ENDPOINT = process.env.PR584_EPHEMERAL_ENDPOINT ?? "";
const REFUSED_HOSTS = ["ep-cold-waterfall-adno3ao2", "ep-royal-dawn-ad6eh8t2"] as const;

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

const TEST_ENTITY_PREFIX = "DIAGRET-TEST-";
const APPROVED = [...SYNC_DIAGNOSTIC_DEDUPE_ACTIONS];
/** Actions that must survive regardless of age — none is on the allowlist. */
const MUST_SURVIVE = [
  "idx_sync_cron",
  "media_sync_cron",
  "idx_display_yn_disabled",
  "email_unsubscribed",
  "data_retention_run",
];

let db: PrismaClient;
let dbB: PrismaClient;

const runSuite = EPHEMERAL_URL ? describe : describe.skip;

if (!EPHEMERAL_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    "\n[diagnostic-retention] SKIPPED — PR584_EPHEMERAL_DATABASE_URL is unset.\n" +
      "             The predicate was NOT proven against a real database.\n",
  );
}

jest.setTimeout(180_000);

runSuite("30-day system-diagnostic retention — real PostgreSQL", () => {
  beforeAll(async () => {
    assertEphemeralTarget(EPHEMERAL_URL, EXPECTED_ENDPOINT);
    db = new PrismaClient({ datasourceUrl: EPHEMERAL_URL });
    dbB = new PrismaClient({ datasourceUrl: EPHEMERAL_URL });
    await db.$connect();
    await dbB.$connect();
  });

  afterAll(async () => {
    if (db) {
      await db.auditEvent
        .deleteMany({ where: { entity_id: { startsWith: TEST_ENTITY_PREFIX } } })
        .catch(() => undefined);
      await db.$disconnect();
    }
    if (dbB) await dbB.$disconnect();
  });

  beforeEach(async () => {
    await db.auditEvent.deleteMany({ where: { entity_id: { startsWith: TEST_ENTITY_PREFIX } } });
  });

  /** Seed one audit row. `ageDays` is relative to now; 2020 dates use `at`. */
  async function seed(name: string, action: string, opts: { ageDays?: number; at?: Date } = {}) {
    const created =
      opts.at ?? new Date(Date.now() - (opts.ageDays ?? 0) * 24 * 60 * 60 * 1000);
    await db.auditEvent.create({
      data: {
        action,
        entity_type: "listing",
        entity_id: `${TEST_ENTITY_PREFIX}${name}`,
        user_type: "system",
        changes: { probe: name },
        created_at: created,
      },
    });
  }

  async function survives(name: string): Promise<boolean> {
    const row = await db.auditEvent.findFirst({
      where: { entity_id: `${TEST_ENTITY_PREFIX}${name}` },
      select: { id: true },
    });
    return row !== null;
  }

  const ANCIENT = new Date("2020-01-01T00:00:00.000Z");

  it("KEEPS an approved diagnostic that is only 29 days old", async () => {
    await seed("d29", APPROVED[0], { ageDays: 29 });
    await seed("d31", APPROVED[0], { at: ANCIENT });
    await purgeExpiredDiagnostics(db, new Date(), { maxRows: 5, batchSize: 5 });
    expect(await survives("d29")).toBe(true);
  });

  it("DELETES an approved diagnostic older than 30 days", async () => {
    await seed("old", APPROVED[0], { at: ANCIENT });
    const result = await purgeExpiredDiagnostics(db, new Date(), { maxRows: 5, batchSize: 5 });
    expect(await survives("old")).toBe(false);
    expect(result.rows).toBeGreaterThanOrEqual(1);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("DELETES every action on the allowlist, not just the high-volume one", async () => {
    for (const [i, action] of APPROVED.entries()) {
      await seed(`approved${i}`, action, { at: ANCIENT });
    }
    await purgeExpiredDiagnostics(db, new Date(), { maxRows: 20, batchSize: 20 });
    for (const i of APPROVED.keys()) {
      expect(await survives(`approved${i}`)).toBe(false);
    }
  });

  it("KEEPS non-allowlisted actions even when far older than 30 days", async () => {
    for (const [i, action] of MUST_SURVIVE.entries()) {
      await seed(`keep${i}`, action, { at: ANCIENT });
    }
    // Also give the purge something it IS allowed to take, so a no-op run
    // cannot make this pass vacuously.
    await seed("bait", APPROVED[0], { at: ANCIENT });

    const result = await purgeExpiredDiagnostics(db, new Date(), { maxRows: 50, batchSize: 50 });

    expect(result.rows).toBeGreaterThanOrEqual(1);
    expect(await survives("bait")).toBe(false);
    for (const i of MUST_SURVIVE.keys()) {
      expect(await survives(`keep${i}`)).toBe(true);
    }
  });

  it("never exceeds the batch size or the per-invocation ceiling against real rows", async () => {
    for (let i = 0; i < 12; i++) await seed(`bulk${i}`, APPROVED[0], { at: ANCIENT });
    const result = await purgeExpiredDiagnostics(db, new Date(), { maxRows: 10, batchSize: 4 });
    expect(result.rows).toBeLessThanOrEqual(10);
    expect(result.batches).toBeLessThanOrEqual(Math.ceil(10 / 4));
    expect(DIAGNOSTIC_BATCH_SIZE).toBeLessThanOrEqual(DIAGNOSTIC_MAX_PER_INVOCATION);
  });

  it("RESUMES an interrupted drain without repeating or skipping", async () => {
    for (let i = 0; i < 10; i++) await seed(`resume${i}`, APPROVED[0], { at: ANCIENT });

    const first = await purgeExpiredDiagnostics(db, new Date(), { maxRows: 4, batchSize: 2 });
    expect(first.rows).toBe(4);
    const afterFirst = await db.auditEvent.count({
      where: { entity_id: { startsWith: `${TEST_ENTITY_PREFIX}resume` } },
    });
    expect(afterFirst).toBe(6);

    const second = await purgeExpiredDiagnostics(db, new Date(), { maxRows: 100, batchSize: 4 });
    // The second run picks up exactly the remainder — no double-delete (which
    // would make the total exceed 10) and no skip (which would leave rows).
    expect(second.rows).toBeGreaterThanOrEqual(6);
    const afterSecond = await db.auditEvent.count({
      where: { entity_id: { startsWith: `${TEST_ENTITY_PREFIX}resume` } },
    });
    expect(afterSecond).toBe(0);
  });

  it("CONCURRENT invocations take disjoint rows and stay inside the allowlist", async () => {
    for (let i = 0; i < 20; i++) await seed(`conc${i}`, APPROVED[0], { at: ANCIENT });
    for (const [i, action] of MUST_SURVIVE.entries()) {
      await seed(`conckeep${i}`, action, { at: ANCIENT });
    }

    const [a, b] = await Promise.all([
      purgeExpiredDiagnostics(db, new Date(), { maxRows: 20, batchSize: 5 }),
      purgeExpiredDiagnostics(dbB, new Date(), { maxRows: 20, batchSize: 5 }),
    ]);

    // NOTE: this branch is a FORK OF PRODUCTION, so the real ~46k eligible
    // backlog is present. Once the seeds (dated 2020, therefore claimed first)
    // are consumed, both workers correctly continue into real eligible rows.
    // So the meaningful bound is each worker's own ceiling, not the seed count.
    expect(a.rows).toBeLessThanOrEqual(20);
    expect(b.rows).toBeLessThanOrEqual(20);
    expect(a.stopped).not.toBe("error");
    expect(b.stopped).not.toBe("error");

    // The substantive concurrency properties: neither worker blocked or errored
    // (SKIP LOCKED), every seeded allowlisted row is gone exactly once, and
    // nothing outside the allowlist was touched by either worker.
    const remainingApproved = await db.auditEvent.count({
      where: {
        entity_id: { startsWith: `${TEST_ENTITY_PREFIX}conc` },
        action: { in: APPROVED },
      },
    });
    expect(remainingApproved).toBe(0);

    const remainingProtected = await db.auditEvent.count({
      where: { entity_id: { startsWith: `${TEST_ENTITY_PREFIX}conckeep` } },
    });
    expect(remainingProtected).toBe(MUST_SURVIVE.length);
    for (const i of MUST_SURVIVE.keys()) {
      expect(await survives(`conckeep${i}`)).toBe(true);
    }
  });

  it("dry-run counts exactly the population the delete then removes", async () => {
    for (let i = 0; i < 6; i++) await seed(`dry${i}`, APPROVED[0], { at: ANCIENT });

    const before = await countExpiredDiagnostics(db, new Date());
    const deleted = await purgeExpiredDiagnostics(db, new Date(), {
      maxRows: 6,
      batchSize: 6,
    });
    const after = await countExpiredDiagnostics(db, new Date());

    expect(deleted.rows).toBe(6);
    // The eligible population shrank by exactly what was deleted — proving the
    // dry-run predicate and the delete predicate select the same rows.
    expect(before.rows - after.rows).toBe(deleted.rows);
  });
});
