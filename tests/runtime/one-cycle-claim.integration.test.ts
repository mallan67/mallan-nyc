/// <reference types="jest" />
/**
 * claimCycle — REAL PostgreSQL integration test.
 *
 * The sibling one-cycle-orchestrator/contract tests mock Prisma, so they cannot
 * prove the advisory-lock transaction or the JSON-path run_id query actually
 * work against Postgres — and claimCycle FAILS CLOSED, so a bad query would
 * silently stop the machine after the first cycle. This test executes the real
 * claimCycle against a real, migrated Postgres and proves:
 *   1. a first claim (runA) succeeds and writes one_cycle_started;
 *   2. a second claim (runB) SKIPS with overlap_in_progress while runA has no
 *      matching completion;
 *   3. inserting a one_cycle_run row with the matching JSON run_id lets the
 *      next claim (runC) succeed;
 *   4. a stale incomplete start older than maxDuration does NOT wedge future
 *      claims;
 *   5. the Prisma JSON-path query (changes.path=['run_id']) works on real PG.
 *
 * Gating: runs ONLY when `ONE_CYCLE_DB_INTEGRATION_URL` is set, and never
 * against the default `DATABASE_URL`. CI points it at the ephemeral PostgreSQL
 * service (schema applied via `prisma db push`). It never connects to
 * production Neon.
 */
import { maxDuration } from "@/app/api/cron/one-cycle/route";

const integrationUrl = process.env.ONE_CYCLE_DB_INTEGRATION_URL;

if (!integrationUrl) {
  describe.skip("claimCycle — real Postgres round-trip", () => {
    it("requires ONE_CYCLE_DB_INTEGRATION_URL (set in CI / local harness)", () => {
      // Skipped when the URL is absent — keeps the suite non-empty.
    });
  });
} else {
  describe("claimCycle — real Postgres round-trip", () => {
    const { PrismaClient } = require("@prisma/client");
    const { claimCycle } = require("@/app/api/cron/one-cycle/route");
    const prisma = new PrismaClient({ datasources: { db: { url: integrationUrl } } });

    const STALE_MS = maxDuration * 1000;
    const uniq = () => `itest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const clearCycleMarkers = () =>
      prisma.auditEvent.deleteMany({
        where: { action: { in: ["one_cycle_started", "one_cycle_run"] } },
      });

    beforeEach(clearCycleMarkers);
    afterAll(async () => {
      await clearCycleMarkers();
      await prisma.$disconnect();
    });

    it("1. a first claim succeeds and writes one_cycle_started with the run_id", async () => {
      const runA = uniq();
      const res = await claimCycle(prisma, runA, new Date());
      expect(res.ok).toBe(true);
      const marker = await prisma.auditEvent.findFirst({
        where: { action: "one_cycle_started", changes: { path: ["run_id"], equals: runA } },
      });
      expect(marker).not.toBeNull();
    });

    it("2. a second claim SKIPS (overlap_in_progress) while the first has no completion", async () => {
      const runA = uniq();
      const runB = uniq();
      expect((await claimCycle(prisma, runA, new Date())).ok).toBe(true);
      const second = await claimCycle(prisma, runB, new Date());
      expect(second.ok).toBe(false);
      expect(second.reason).toBe("overlap_in_progress");
      // runB never wrote a start marker.
      const bMarker = await prisma.auditEvent.findFirst({
        where: { action: "one_cycle_started", changes: { path: ["run_id"], equals: runB } },
      });
      expect(bMarker).toBeNull();
    });

    it("3. a one_cycle_run row with the matching JSON run_id lets the next claim succeed", async () => {
      const runA = uniq();
      const runC = uniq();
      expect((await claimCycle(prisma, runA, new Date())).ok).toBe(true);
      // Complete runA.
      await prisma.auditEvent.create({
        data: {
          action: "one_cycle_run",
          entity_type: "cron",
          entity_id: "one-cycle",
          user_type: "system",
          user_id: null,
          changes: { run_id: runA, complete: true },
        },
      });
      // The Prisma JSON-path query must find that completion → claim granted.
      const third = await claimCycle(prisma, runC, new Date());
      expect(third.ok).toBe(true);
    });

    it("4. a stale incomplete start older than maxDuration does NOT wedge future claims", async () => {
      const stale = uniq();
      const runD = uniq();
      // Insert a start marker with created_at older than the stale window, no completion.
      await prisma.$executeRawUnsafe(
        `INSERT INTO audit_events (action, entity_type, entity_id, user_type, changes, created_at)
         VALUES ('one_cycle_started','cron','one-cycle','system', $1::jsonb, NOW() - INTERVAL '${Math.ceil(STALE_MS / 1000) + 100} seconds')`,
        JSON.stringify({ run_id: stale }),
      );
      // The most-recent start within the window is now empty → claim proceeds.
      const res = await claimCycle(prisma, runD, new Date());
      expect(res.ok).toBe(true);
    });

    it("5. the JSON-path run_id query returns rows on real PostgreSQL (no throw / fail-closed)", async () => {
      const runA = uniq();
      await claimCycle(prisma, runA, new Date());
      const rows = await prisma.auditEvent.findMany({
        where: { action: "one_cycle_started", changes: { path: ["run_id"], equals: runA } },
        select: { id: true },
      });
      expect(rows.length).toBe(1);
    });
  });
}
