/**
 * Shared machine-execution claim — the SINGLE atomic admission gate for every
 * feed/media sync execution: the One Cycle orchestrator AND every standalone /
 * manual idx-sync / media-sync (including `?full=true`).
 *
 * WHY (the race this closes): a read-then-work pre-check (isOneCycleActive) is
 * NOT atomic — a standalone caller can read "inactive" microseconds before One
 * Cycle commits its start marker, and both run. The claim below is atomic: a
 * single transaction takes a pg advisory xact lock (serialising concurrent
 * claims), checks the latest UNMATCHED machine-start marker, and writes THIS
 * execution's own unique-run_id start marker — all before any sync work begins.
 * Two simultaneous claims therefore resolve to exactly one winner.
 *
 * Markers (append-only AuditEvent rows, entity_id 'one-cycle'):
 *   - start:      action `one_cycle_started`  — {run_id, execution_type, member, started_at, ...}
 *   - completion: action `one_cycle_run`      — {run_id, execution_type, member, outcome, started_at, ended_at, duration_ms, ...}
 * start↔completion are paired by the unique run_id (JSON path), NOT timestamp.
 *
 * Exemption: the One Cycle in-process member calls are ORCHESTRATED (they carry
 * the CRON_SECRET in x-one-cycle-member) and must NOT take a second nested claim
 * — One Cycle already owns the machine execution.
 *
 * Fail closed: any error refuses the claim (start no work). A crashed execution
 * blocks only until the stale window (MACHINE_STALE_MS) elapses.
 */
import type { PrismaClient } from '@prisma/client';

/** = the one-cycle route maxDuration (300s): a machine execution can never be
 *  older than this and still running, so a stale unmatched start marker frees
 *  the machine for the next execution rather than wedging it. */
export const MACHINE_STALE_MS = 300_000;

/** Advisory-lock identity for the machine-claim mutex (distinct from the R2
 *  drain lock class 20260723). Only one holder at a time. */
const CLAIM_LOCK_CLASS = 20260724;
const CLAIM_LOCK_KEY = 1;

export const MACHINE_STARTED = 'one_cycle_started';
export const MACHINE_COMPLETED = 'one_cycle_run';

type ClaimDb = Pick<PrismaClient, '$transaction'>;
type WriteDb = Pick<PrismaClient, 'auditEvent'>;

export interface MachineClaimInput {
  runId: string;
  /** 'one-cycle' | 'standalone-idx-sync' | 'standalone-media-sync' */
  executionType: string;
  member?: string | null;
  /** Extra start-marker fields (e.g. cadence_ms for one-cycle). */
  extra?: Record<string, unknown>;
  now?: Date;
  staleMs?: number;
}

/**
 * Atomically claim the right to execute. Returns `{ ok: true }` on success (a
 * start marker was written) or `{ ok: false, reason }` — the caller MUST start
 * NO work on refusal.
 */
export async function claimMachine(
  db: ClaimDb,
  input: MachineClaimInput,
): Promise<{ ok: boolean; reason?: string }> {
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? MACHINE_STALE_MS;
  try {
    return await db.$transaction(async (tx) => {
      const lockRows = (await tx.$queryRaw`
        SELECT pg_try_advisory_xact_lock(${CLAIM_LOCK_CLASS}::int4, ${CLAIM_LOCK_KEY}::int4) AS locked
      `) as Array<{ locked: boolean }>;
      if (!lockRows?.[0]?.locked) {
        return { ok: false, reason: 'lock_contended' };
      }
      const started = await tx.auditEvent.findFirst({
        where: {
          action: MACHINE_STARTED,
          created_at: { gte: new Date(now.getTime() - staleMs) },
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, changes: true },
      });
      if (started) {
        const prevRunId =
          started.changes && typeof started.changes === 'object'
            ? (started.changes as Record<string, unknown>).run_id
            : undefined;
        const completed = await tx.auditEvent.findFirst({
          where:
            typeof prevRunId === 'string'
              ? { action: MACHINE_COMPLETED, changes: { path: ['run_id'], equals: prevRunId } }
              : { action: MACHINE_COMPLETED, created_at: { gte: started.created_at } },
          select: { id: true },
        });
        if (!completed) {
          return { ok: false, reason: 'overlap_in_progress' };
        }
      }
      await tx.auditEvent.create({
        data: {
          action: MACHINE_STARTED,
          entity_type: 'cron',
          entity_id: 'one-cycle',
          user_type: 'system',
          user_id: null,
          changes: {
            run_id: input.runId,
            execution_type: input.executionType,
            member: input.member ?? null,
            started_at: now.toISOString(),
            ...(input.extra ?? {}),
          },
        },
      });
      return { ok: true };
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? `claim_error:${err.message.slice(0, 120)}` : 'claim_error',
    };
  }
}

/**
 * Write the matching completion marker (pairs with the start marker by run_id).
 * Standalone executions call this in a `finally` so a completion is ALWAYS
 * recorded — otherwise the next execution would be blocked until the stale
 * window. Never throws (observability write only).
 */
export async function completeMachine(
  db: WriteDb,
  input: {
    runId: string;
    executionType: string;
    member?: string | null;
    outcome: string;
    startedAt: Date;
    endedAt?: Date;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  const endedAt = input.endedAt ?? new Date();
  try {
    await db.auditEvent.create({
      data: {
        action: MACHINE_COMPLETED,
        entity_type: 'cron',
        entity_id: 'one-cycle',
        user_type: 'system',
        user_id: null,
        changes: {
          run_id: input.runId,
          execution_type: input.executionType,
          member: input.member ?? null,
          outcome: input.outcome,
          started_at: input.startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_ms: endedAt.getTime() - input.startedAt.getTime(),
          ...(input.extra ?? {}),
        },
      },
    });
  } catch (err) {
    console.error(
      '[machine-claim] completion marker write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
