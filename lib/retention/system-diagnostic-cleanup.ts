/**
 * Bounded, resumable cleanup of expired high-volume system diagnostics.
 *
 * WHY BOUNDED. The eligible backlog measured on production 2026-07-29 is 46,103
 * rows / ~30 MB. Deleting that in ONE `deleteMany` would hold a single
 * transaction over ~50k rows of a compliance-governed table, inside a cron with
 * a 60s budget — a long lock, a large WAL burst, and nothing to resume from if
 * it timed out halfway. This module deletes in small independently-committed
 * batches instead, so an interrupted run simply resumes on the next invocation.
 *
 * SAFETY PROPERTIES, all enforced in the ONE statement below:
 *
 *   - allowlist only — `action = ANY($actions)`, bound as a text[] PARAMETER.
 *     No SQL is ever constructed from action strings.
 *   - age only — `created_at < $cutoff`, also a parameter.
 *   - deterministic order — `ORDER BY created_at, id`; `id` is the stable
 *     BigInt primary key, so the order is total and a resumed run continues
 *     from the oldest remaining row without skipping or repeating.
 *   - bounded — `LIMIT $batchSize` per statement, plus a per-invocation cap.
 *   - concurrency-safe — `FOR UPDATE SKIP LOCKED` means two overlapping cron
 *     invocations claim disjoint rows rather than blocking or double-deleting.
 *   - measurable — the statement RETURNS the row count and the payload bytes
 *     it actually removed, so progress is reported from what the database did,
 *     not from what we asked for.
 *
 * The dry-run count uses the SAME predicate (same allowlist, same cutoff), so a
 * dry run can never report a different population than the delete would touch.
 */
import { Prisma } from "@prisma/client";
import { SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS } from "./system-diagnostic-actions";

/** Retention window. See the route's step 2b for why 30 and not 90. */
export const DIAGNOSTIC_RETENTION_DAYS = 30;
/** Rows per independently-committed statement. */
export const DIAGNOSTIC_BATCH_SIZE = 2000;
/** Hard ceiling for a single cron invocation. */
export const DIAGNOSTIC_MAX_PER_INVOCATION = 10000;

/** The retention cutoff for a given clock. Shared by dry-run and delete. */
export function diagnosticCutoff(now: Date): Date {
  return new Date(now.getTime() - DIAGNOSTIC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Minimal client surface — keeps this unit testable without a full Prisma client. */
export interface DiagnosticCleanupClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export interface DiagnosticPurgeResult {
  /** Rows actually deleted, summed from what the database returned. */
  rows: number;
  /** Payload bytes actually removed (pg_column_size of `changes`). */
  bytes: number;
  /** Independently-committed batches executed. */
  batches: number;
  /**
   * Why the loop ended:
   *   `drained`          — no eligible rows left
   *   `invocation_cap`   — hit DIAGNOSTIC_MAX_PER_INVOCATION; more remain
   *   `dry_run`          — counted only, nothing deleted
   *   `error`            — stopped on a database error; see `error`
   */
  stopped: "drained" | "invocation_cap" | "dry_run" | "error";
  /** Sanitized error label when `stopped === "error"`. Never a payload. */
  error?: string;
}

/** The allowlist as a plain array, bound as a single text[] parameter. */
function actionParams(): string[] {
  return [...SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS];
}

/**
 * DRY RUN. Counts exactly what `purgeExpiredDiagnostics` would delete — same
 * allowlist, same cutoff, no ordering/limit because it counts the whole
 * eligible population rather than one batch.
 */
export async function countExpiredDiagnostics(
  db: DiagnosticCleanupClient,
  now: Date,
): Promise<{ rows: number; bytes: number }> {
  const rows = await db.$queryRaw<Array<{ rows: number; bytes: bigint }>>(Prisma.sql`
    SELECT count(*)::int AS rows,
           COALESCE(sum(pg_column_size(changes)), 0)::bigint AS bytes
    FROM audit_events
    WHERE action = ANY(${actionParams()}::text[])
      AND created_at < ${diagnosticCutoff(now)}
  `);
  const first = rows[0];
  return { rows: first?.rows ?? 0, bytes: Number(first?.bytes ?? 0) };
}

/**
 * Delete expired diagnostics in bounded, independently-committed batches.
 *
 * Each iteration is ONE statement: claim up to `batchSize` oldest eligible rows
 * with SKIP LOCKED, delete exactly those, and return what was removed. Because
 * it is a single statement executed outside an explicit transaction, each batch
 * commits on its own — an interruption loses at most the in-flight batch.
 */
export async function purgeExpiredDiagnostics(
  db: DiagnosticCleanupClient,
  now: Date,
  options: { dryRun?: boolean; maxRows?: number; batchSize?: number } = {},
): Promise<DiagnosticPurgeResult> {
  const batchSize = options.batchSize ?? DIAGNOSTIC_BATCH_SIZE;
  const maxRows = options.maxRows ?? DIAGNOSTIC_MAX_PER_INVOCATION;

  if (options.dryRun) {
    const counted = await countExpiredDiagnostics(db, now);
    return { rows: counted.rows, bytes: counted.bytes, batches: 0, stopped: "dry_run" };
  }

  const cutoff = diagnosticCutoff(now);
  const actions = actionParams();
  let rows = 0;
  let bytes = 0;
  let batches = 0;

  while (rows < maxRows) {
    // Never let the last batch overshoot the per-invocation ceiling.
    const take = Math.min(batchSize, maxRows - rows);
    let batchRows = 0;
    let batchBytes = 0;
    try {
      const result = await db.$queryRaw<Array<{ rows: number; bytes: bigint }>>(Prisma.sql`
        WITH victims AS (
          SELECT id
          FROM audit_events
          WHERE action = ANY(${actions}::text[])
            AND created_at < ${cutoff}
          ORDER BY created_at, id
          LIMIT ${take}
          FOR UPDATE SKIP LOCKED
        ),
        removed AS (
          DELETE FROM audit_events a
          USING victims v
          WHERE a.id = v.id
          RETURNING pg_column_size(a.changes) AS payload_bytes
        )
        SELECT count(*)::int AS rows,
               COALESCE(sum(payload_bytes), 0)::bigint AS bytes
        FROM removed
      `);
      batchRows = result[0]?.rows ?? 0;
      batchBytes = Number(result[0]?.bytes ?? 0);
    } catch (err) {
      // Stop immediately: FK violation, statement timeout, connection/health
      // error. Only the error NAME is surfaced — never a message that could
      // carry row data.
      return {
        rows, bytes, batches,
        stopped: "error",
        error: err instanceof Error ? err.name : "unknown_error",
      };
    }

    // Defensive: LIMIT makes this impossible, so a violation means the
    // statement is not what we think it is. Stop rather than keep deleting.
    if (batchRows > take) {
      return {
        rows, bytes, batches,
        stopped: "error",
        error: "batch_overshoot",
      };
    }

    batches += 1;
    rows += batchRows;
    bytes += batchBytes;

    // A short batch means the eligible population is exhausted (or the rest is
    // locked by a concurrent invocation, which will handle it).
    if (batchRows < take) {
      return { rows, bytes, batches, stopped: "drained" };
    }
  }

  return { rows, bytes, batches, stopped: "invocation_cap" };
}
