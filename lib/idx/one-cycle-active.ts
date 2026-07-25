/**
 * One Cycle activity guard — shared by the standalone idx-sync / media-sync
 * routes so a manual or `?full=true` invocation cannot run WHILE the machine is
 * mid-cycle (a `one_cycle_started` marker with no matching `one_cycle_run`
 * completion). The orchestrated path itself is exempt — it IS the machine.
 *
 * Pairing is by the unique run_id (JSON path), matching claimCycle. The
 * staleness window matches the orchestrator's maxDuration (300s): a cycle can
 * never be older than that and still running, so a stale-but-incomplete marker
 * does not wedge future manual runs.
 *
 * FAIL CLOSED: if the check itself errors, treat the machine as ACTIVE (block
 * the standalone run) — an ambiguous state must never permit an overlap.
 */
import type { PrismaClient } from '@prisma/client';

export const ONE_CYCLE_STALE_MS = 300_000; // = one-cycle route maxDuration (300s)

/** Minimal shape needed — the shared prisma client satisfies it. */
type ActiveDb = Pick<PrismaClient, 'auditEvent'>;

export async function isOneCycleActive(
  db: ActiveDb,
  now: Date = new Date(),
  staleMs: number = ONE_CYCLE_STALE_MS,
): Promise<boolean> {
  try {
    const started = (await db.auditEvent.findFirst({
      where: {
        action: 'one_cycle_started',
        created_at: { gte: new Date(now.getTime() - staleMs) },
      },
      orderBy: { created_at: 'desc' },
      select: { created_at: true, changes: true },
    })) as { created_at: Date; changes: unknown } | null;
    if (!started) return false; // no recent cycle start ⇒ not active

    const runId =
      started.changes && typeof started.changes === 'object'
        ? (started.changes as Record<string, unknown>).run_id
        : undefined;
    const completed = await db.auditEvent.findFirst({
      where:
        typeof runId === 'string'
          ? { action: 'one_cycle_run', changes: { path: ['run_id'], equals: runId } }
          : { action: 'one_cycle_run', created_at: { gte: started.created_at } },
      select: { id: true },
    });
    return !completed; // started but not completed ⇒ ACTIVE
  } catch (err) {
    console.error(
      '[one-cycle-active] activity check failed — failing closed (treating as active):',
      err instanceof Error ? err.message : err,
    );
    return true; // fail closed: block the standalone run on uncertainty
  }
}
