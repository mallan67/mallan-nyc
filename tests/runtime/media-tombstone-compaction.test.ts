/// <reference types="jest" />
import { Prisma } from '@prisma/client';
import {
  compactExpiredMediaTombstones,
  mediaTombstoneCutoff,
  MEDIA_TOMBSTONE_BATCH_SIZE,
  MEDIA_TOMBSTONE_MAX_PER_INVOCATION,
  MEDIA_TOMBSTONE_RETENTION_DAYS,
} from '@/lib/retention/media-tombstone-compaction';

const NOW = new Date('2026-08-02T07:00:00.000Z');

function makeClient(batchCounts: number[]) {
  const captured: Prisma.Sql[] = [];
  let i = 0;
  return {
    captured,
    client: {
      $queryRaw: async (query: Prisma.Sql) => {
        captured.push(query);
        const rows = batchCounts[i] ?? 0;
        i += 1;
        return [{ rows, bytes: BigInt(rows * 500) }];
      },
    },
  };
}

const text = (q: Prisma.Sql) => q.strings.join('').replace(/\s+/g, ' ');

describe('media tombstone compaction', () => {
  it('uses the exact deleted-status and 30-day predicates', async () => {
    const { client, captured } = makeClient([0]);
    await compactExpiredMediaTombstones(client, NOW);
    const sql = text(captured[0]);
    expect(sql).toContain("status = 'deleted'");
    expect(sql).toContain('updated_at <');
    expect(captured[0].values[0]).toEqual(mediaTombstoneCutoff(NOW));
    expect(NOW.getTime() - mediaTombstoneCutoff(NOW).getTime()).toBe(
      MEDIA_TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it('never hard-deletes and clears only delivery payload fields', async () => {
    const { client, captured } = makeClient([0]);
    await compactExpiredMediaTombstones(client, NOW);
    const sql = text(captured[0]);
    expect(sql).not.toContain('DELETE FROM listing_media');
    for (const field of ['media_url_original', 'media_url_cached', 'r2_key', 'width', 'height']) {
      expect(sql).toContain(`${field} = NULL`);
    }
    for (const retained of ['media_key', 'listing_id', 'media_type', 'media_category', 'status']) {
      expect(sql).not.toContain(`${retained} = NULL`);
    }
  });

  it('orders oldest-first and uses SKIP LOCKED', async () => {
    const { client, captured } = makeClient([0]);
    await compactExpiredMediaTombstones(client, NOW);
    const sql = text(captured[0]);
    expect(sql).toContain('ORDER BY updated_at, id');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('is bounded per statement and per invocation', async () => {
    const { client, captured } = makeClient(new Array(20).fill(MEDIA_TOMBSTONE_BATCH_SIZE));
    const result = await compactExpiredMediaTombstones(client, NOW);
    expect(result.rows).toBe(MEDIA_TOMBSTONE_MAX_PER_INVOCATION);
    expect(result.stopped).toBe('invocation_cap');
    const requested = captured.reduce((sum, q) => sum + Number(q.values[1]), 0);
    expect(requested).toBe(MEDIA_TOMBSTONE_MAX_PER_INVOCATION);
  });

  it('stops on a short final batch and reports actual payload bytes', async () => {
    const { client, captured } = makeClient([2000, 37]);
    const result = await compactExpiredMediaTombstones(client, NOW);
    expect(result).toMatchObject({ rows: 2037, bytes: 2037 * 500, batches: 2, stopped: 'drained' });
    expect(captured).toHaveLength(2);
  });

  it('fails closed on invalid bounds', async () => {
    const { client, captured } = makeClient([1]);
    const result = await compactExpiredMediaTombstones(client, NOW, { maxRows: 0 });
    expect(result).toMatchObject({ rows: 0, stopped: 'error', error: 'invalid_bounds' });
    expect(captured).toHaveLength(0);
  });
});

describe('retention schedule', () => {
  const config = JSON.parse(require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../vercel.json'), 'utf8'));
  it('reuses the existing nightly wake and activates only the approved diagnostic policy', () => {
    expect(config.crons).toContainEqual({ path: '/api/cron/data-retention-finalize', schedule: '0 3 * * *' });
    expect(config.crons.find((c: { path: string }) => c.path === '/api/cron/data-retention')).toBeUndefined();
    expect(config.env.DIAGNOSTIC_RETENTION_ENABLED).toBe('true');
    expect(config.functions['app/api/cron/data-retention-finalize/route.ts'].maxDuration).toBe(120);
  });
});
