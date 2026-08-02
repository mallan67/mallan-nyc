import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GET as runDataRetention } from '@/app/api/cron/data-retention/route';
import prisma from '@/lib/prisma';
import { compactExpiredMediaTombstones } from '@/lib/retention/media-tombstone-compaction';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    cronSecret &&
    authHeader &&
    authHeader.length === ('Bearer ' + cronSecret).length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from('Bearer ' + cronSecret)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runs the existing compliance retention job, then uses the SAME Neon wake to
 * compact old deleted-media payload. No additional scheduled database wake is
 * introduced.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseResponse = await runDataRetention(req);
  if (!baseResponse.ok) return baseResponse;

  let baseBody: Record<string, unknown> = {};
  try {
    const parsed = await baseResponse.clone().json();
    if (isRecord(parsed)) baseBody = parsed;
  } catch {
    // The underlying route currently returns JSON. If that ever changes, keep
    // the retention result authoritative and report only the compaction data.
  }

  const compacted = await compactExpiredMediaTombstones(prisma, new Date());
  const result = {
    ...baseBody,
    media_tombstones_compacted: compacted.rows,
    media_tombstone_payload_bytes_removed: compacted.bytes,
    media_tombstone_compaction_batches: compacted.batches,
    media_tombstone_compaction_stopped: compacted.stopped,
    ...(compacted.error ? { media_tombstone_compaction_error: compacted.error } : {}),
  };

  console.log(JSON.stringify({ tag: 'media_tombstone_compaction', ...compacted }));
  return NextResponse.json(result, { status: 200 });
}
