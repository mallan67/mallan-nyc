import { Prisma } from '@prisma/client';

import { resolveRetentionCap } from './retention-canary';

export const MEDIA_TOMBSTONE_RETENTION_DAYS = 30;
export const MEDIA_TOMBSTONE_BATCH_SIZE = 2000;
export const MEDIA_TOMBSTONE_MAX_PER_INVOCATION = 10000;

export interface MediaTombstoneCompactionClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export interface MediaTombstoneCompactionResult {
  rows: number;
  bytes: number;
  batches: number;
  stopped: 'drained' | 'invocation_cap' | 'error';
  error?: string;
}

export function mediaTombstoneCutoff(now: Date): Date {
  return new Date(now.getTime() - MEDIA_TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Compact deleted listing_media rows without deleting their audit identity.
 *
 * Each statement locks a bounded oldest-first victim set, measures the payload
 * being removed, clears only delivery fields, and commits independently.
 */
export async function compactExpiredMediaTombstones(
  db: MediaTombstoneCompactionClient,
  now: Date,
  options: { maxRows?: number; batchSize?: number } = {},
): Promise<MediaTombstoneCompactionResult> {
  const batchSize = options.batchSize ?? MEDIA_TOMBSTONE_BATCH_SIZE;
  // Canary-by-default, same contract as the diagnostic purge: unset env =>
  // 100 rows. RETENTION_TOMBSTONE_MAX_ROWS raises it, clamped to the
  // reviewed MEDIA_TOMBSTONE_MAX_PER_INVOCATION.
  const maxRows =
    options.maxRows ??
    resolveRetentionCap('RETENTION_TOMBSTONE_MAX_ROWS', MEDIA_TOMBSTONE_MAX_PER_INVOCATION);
  if (!Number.isInteger(batchSize) || batchSize <= 0 || !Number.isInteger(maxRows) || maxRows <= 0) {
    return { rows: 0, bytes: 0, batches: 0, stopped: 'error', error: 'invalid_bounds' };
  }

  const cutoff = mediaTombstoneCutoff(now);
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
          SELECT id,
                 COALESCE(pg_column_size(media_url_original), 0) +
                 COALESCE(pg_column_size(media_url_cached), 0) +
                 COALESCE(pg_column_size(r2_key), 0) AS payload_bytes
          FROM listing_media
          WHERE status = 'deleted'
            AND updated_at < ${cutoff}
            AND (
              media_url_original IS NOT NULL OR
              media_url_cached IS NOT NULL OR
              r2_key IS NOT NULL OR
              width IS NOT NULL OR
              height IS NOT NULL
            )
          ORDER BY updated_at, id
          LIMIT ${take}
          FOR UPDATE SKIP LOCKED
        ),
        compacted AS (
          UPDATE listing_media m
          SET media_url_original = NULL,
              media_url_cached = NULL,
              r2_key = NULL,
              width = NULL,
              height = NULL
          FROM victims v
          WHERE m.id = v.id
            AND m.status = 'deleted'
          RETURNING v.payload_bytes
        )
        SELECT count(*)::int AS rows,
               COALESCE(sum(payload_bytes), 0)::bigint AS bytes
        FROM compacted
      `);
      batchRows = result[0]?.rows ?? 0;
      batchBytes = Number(result[0]?.bytes ?? 0);
    } catch (err) {
      return {
        rows,
        bytes,
        batches,
        stopped: 'error',
        error: err instanceof Error ? err.name : 'unknown_error',
      };
    }

    if (batchRows > take) {
      return { rows, bytes, batches, stopped: 'error', error: 'batch_overshoot' };
    }

    batches += 1;
    rows += batchRows;
    bytes += batchBytes;
    if (batchRows < take) {
      return { rows, bytes, batches, stopped: 'drained' };
    }
  }

  return { rows, bytes, batches, stopped: 'invocation_cap' };
}
