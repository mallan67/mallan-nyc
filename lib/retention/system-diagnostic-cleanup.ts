/**
 * Bounded, resumable cleanup of expired high-volume system diagnostics.
 *
 * Policy authority:
 *   docs/compliance/OPERATIONAL-DIAGNOSTIC-RETENTION.md
 *
 * Only the exact write-only operational allowlist is eligible. Business,
 * consumer, compliance, access, unsubscribe, transaction, and per-run machine
 * events remain outside this cleanup and keep their existing retention rules.
 */
import { Prisma } from "@prisma/client";
import { SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS } from "./system-diagnostic-actions";
import { resolveRetentionCap } from "./retention-canary";

/**
 * Explicit gate. The approved deployment sets this to "true" in vercel.json;
 * removing it or setting any other value stops deletion without a code change.
 */
export function diagnosticRetentionEnabled(): boolean {
  return process.env.DIAGNOSTIC_RETENTION_ENABLED === "true";
}

export const DIAGNOSTIC_RETENTION_DAYS = 30;
export const DIAGNOSTIC_BATCH_SIZE = 2000;
export const DIAGNOSTIC_MAX_PER_INVOCATION = 10000;

export function diagnosticCutoff(now: Date): Date {
  return new Date(now.getTime() - DIAGNOSTIC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export interface DiagnosticCleanupClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export interface DiagnosticPurgeResult {
  rows: number;
  bytes: number;
  batches: number;
  stopped: "drained" | "invocation_cap" | "dry_run" | "compliance_gate_closed" | "error";
  error?: string;
}

function actionParams(): string[] {
  return [...SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS];
}

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

export async function purgeExpiredDiagnostics(
  db: DiagnosticCleanupClient,
  now: Date,
  options: { dryRun?: boolean; maxRows?: number; batchSize?: number } = {},
): Promise<DiagnosticPurgeResult> {
  // Canary-by-default: unset env => 100 rows. RETENTION_DIAGNOSTIC_MAX_ROWS
  // raises it, clamped to the reviewed DIAGNOSTIC_MAX_PER_INVOCATION.
  const batchSize = options.batchSize ?? DIAGNOSTIC_BATCH_SIZE;
  const maxRows =
    options.maxRows ??
    resolveRetentionCap('RETENTION_DIAGNOSTIC_MAX_ROWS', DIAGNOSTIC_MAX_PER_INVOCATION);

  if (options.dryRun) {
    const counted = await countExpiredDiagnostics(db, now);
    return { rows: counted.rows, bytes: counted.bytes, batches: 0, stopped: "dry_run" };
  }
  if (!diagnosticRetentionEnabled()) {
    return { rows: 0, bytes: 0, batches: 0, stopped: "compliance_gate_closed" };
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0 || !Number.isInteger(maxRows) || maxRows <= 0) {
    return { rows: 0, bytes: 0, batches: 0, stopped: "error", error: "invalid_bounds" };
  }

  const cutoff = diagnosticCutoff(now);
  const actions = actionParams();
  let rows = 0;
  let bytes = 0;
  let batches = 0;

  while (rows < maxRows) {
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
      return {
        rows,
        bytes,
        batches,
        stopped: "error",
        error: err instanceof Error ? err.name : "unknown_error",
      };
    }

    if (batchRows > take) {
      return { rows, bytes, batches, stopped: "error", error: "batch_overshoot" };
    }

    batches += 1;
    rows += batchRows;
    bytes += batchBytes;
    if (batchRows < take) {
      return { rows, bytes, batches, stopped: "drained" };
    }
  }

  return { rows, bytes, batches, stopped: "invocation_cap" };
}
