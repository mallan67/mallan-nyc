/// <reference types="jest" />
/**
 * Shared machine claim — REAL PostgreSQL concurrency test.
 *
 * The unit/route tests mock Prisma, so they cannot prove the advisory-lock
 * transaction is genuinely atomic under CONCURRENCY — and the claim fails
 * closed, so a wrong query would silently stop the machine. This runs the real
 * claimMachine / completeMachine against a real, migrated Postgres and proves:
 *   - two simultaneous machine claims resolve to EXACTLY ONE winner;
 *   - simultaneous one-cycle + manual-idx claims → exactly one winner;
 *   - simultaneous one-cycle + manual-media claims → exactly one winner;
 *   - a manual claim cannot escape the shared claim while the machine is active
 *     (models the ?full=true path, which takes the same claim);
 *   - a completion marker permits the next execution;
 *   - a stale unmatched start marker eventually permits recovery;
 *   - the Prisma JSON-path run_id query works on real PostgreSQL.
 *
 * Gating: runs ONLY when ONE_CYCLE_DB_INTEGRATION_URL is set (CI points it at
 * the ephemeral PostgreSQL service). It never connects to production Neon.
 */
import { MACHINE_STALE_MS } from "@/lib/idx/machine-claim";

const integrationUrl = process.env.ONE_CYCLE_DB_INTEGRATION_URL;

if (!integrationUrl) {
  describe.skip("machine claim — real Postgres concurrency", () => {
    it("requires ONE_CYCLE_DB_INTEGRATION_URL (set in CI / local harness)", () => {
      /* skipped without the URL */
    });
  });
} else {
  describe("machine claim — real Postgres concurrency", () => {
    const { PrismaClient } = require("@prisma/client");
    const { claimMachine, completeMachine } = require("@/lib/idx/machine-claim");
    const prisma = new PrismaClient({ datasources: { db: { url: integrationUrl } } });

    const uniq = () => `mci-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const clear = () =>
      prisma.auditEvent.deleteMany({
        where: { action: { in: ["one_cycle_started", "one_cycle_run"] } },
      });

    beforeEach(clear);
    afterAll(async () => {
      await clear();
      await prisma.$disconnect();
    });

    const both = async (aType: string, bType: string) => {
      const [a, b] = await Promise.all([
        claimMachine(prisma, { runId: uniq(), executionType: aType, member: aType, now: new Date() }),
        claimMachine(prisma, { runId: uniq(), executionType: bType, member: bType, now: new Date() }),
      ]);
      return [a, b];
    };

    it("two simultaneous machine claims ⇒ exactly one winner", async () => {
      const [a, b] = await both("one-cycle", "one-cycle");
      expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    });

    it("simultaneous one-cycle + manual-idx claims ⇒ exactly one winner", async () => {
      const [a, b] = await both("one-cycle", "standalone-idx-sync");
      expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    });

    it("simultaneous one-cycle + manual-media claims ⇒ exactly one winner", async () => {
      const [a, b] = await both("one-cycle", "standalone-media-sync");
      expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    });

    it("a manual claim (as ?full=true would take) cannot run while the machine is active", async () => {
      // One Cycle claims and is mid-execution (no completion yet).
      expect((await claimMachine(prisma, { runId: uniq(), executionType: "one-cycle", now: new Date() })).ok).toBe(true);
      // A standalone idx claim (the ?full=true path uses the SAME claim) is refused.
      const manual = await claimMachine(prisma, { runId: uniq(), executionType: "standalone-idx-sync", member: "idx-sync", now: new Date() });
      expect(manual.ok).toBe(false);
      expect(manual.reason).toBe("overlap_in_progress");
    });

    it("a completion marker permits the next execution", async () => {
      const runA = uniq();
      expect((await claimMachine(prisma, { runId: runA, executionType: "one-cycle", now: new Date() })).ok).toBe(true);
      await completeMachine(prisma, {
        runId: runA, executionType: "one-cycle", outcome: "success", startedAt: new Date(),
      });
      // Now a fresh execution may claim.
      const next = await claimMachine(prisma, { runId: uniq(), executionType: "standalone-media-sync", now: new Date() });
      expect(next.ok).toBe(true);
    });

    it("a stale unmatched start marker older than the window permits recovery", async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO audit_events (action, entity_type, entity_id, user_type, changes, created_at)
         VALUES ('one_cycle_started','cron','one-cycle','system', $1::jsonb, NOW() - INTERVAL '${Math.ceil(MACHINE_STALE_MS / 1000) + 100} seconds')`,
        JSON.stringify({ run_id: uniq(), execution_type: "one-cycle" }),
      );
      const res = await claimMachine(prisma, { runId: uniq(), executionType: "one-cycle", now: new Date() });
      expect(res.ok).toBe(true);
    });

    it("the JSON-path run_id query returns rows on real PostgreSQL", async () => {
      const runA = uniq();
      await claimMachine(prisma, { runId: runA, executionType: "one-cycle", now: new Date() });
      const rows = await prisma.auditEvent.findMany({
        where: { action: "one_cycle_started", changes: { path: ["run_id"], equals: runA } },
        select: { id: true },
      });
      expect(rows.length).toBe(1);
    });
  });
}
