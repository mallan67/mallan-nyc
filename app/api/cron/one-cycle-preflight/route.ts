import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GET as runOneCycle } from '@/app/api/cron/one-cycle/route';
import {
  decideOneCyclePreflight,
  finalizeOneCyclePreflight,
  type OneCycleCompletionInput,
} from '@/lib/idx/one-cycle-preflight';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

function completionFromBody(body: unknown): OneCycleCompletionInput | null {
  if (!isRecord(body) || !Array.isArray(body.members)) return null;
  if (typeof body.success !== 'boolean' || typeof body.complete !== 'boolean') return null;
  if (body.outcome !== 'success' && body.outcome !== 'partial' && body.outcome !== 'incomplete') {
    return null;
  }

  const members: OneCycleCompletionInput['members'] = [];
  for (const raw of body.members) {
    if (!isRecord(raw) || typeof raw.member !== 'string' || typeof raw.status !== 'string') {
      return null;
    }
    members.push({
      member: raw.member,
      status: raw.status,
      summary: isRecord(raw.summary) ? raw.summary : {},
    });
  }

  return {
    success: body.success,
    complete: body.complete,
    outcome: body.outcome,
    members,
  };
}

/**
 * Scheduled 10-minute entrypoint.
 *
 * The lightweight Cotality + Redis preflight runs before importing any Prisma
 * work. A verified no-change poll returns here with `neon_touched:false`:
 * no advisory lock, no sync cursor read, no audit row, and no Neon wake.
 * Every uncertain condition fails open to the existing proven One Cycle route,
 * which remains the sole owner of claims, member ordering, writes, and audits.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const polledAt = new Date();
  const decision = await decideOneCyclePreflight(polledAt);
  if (!decision.shouldRun) {
    const result = {
      success: true,
      skipped: true,
      neon_touched: false,
      reason: decision.reason,
      polled_at: polledAt.toISOString(),
      source_captured_at: decision.snapshot?.capturedAt ?? null,
    };
    console.log(JSON.stringify({ tag: 'one_cycle_preflight', event: 'skip_neon', ...result }));
    return NextResponse.json(result, { status: 200 });
  }

  console.log(JSON.stringify({
    tag: 'one_cycle_preflight',
    event: 'run_neon_cycle',
    reason: decision.reason,
    polled_at: polledAt.toISOString(),
    snapshot_trusted: decision.snapshotTrusted,
  }));

  const response = await runOneCycle(req);
  try {
    const body = await response.clone().json();
    const completion = completionFromBody(body);
    if (completion) {
      await finalizeOneCyclePreflight(decision, completion, new Date());
    } else {
      console.warn('[one-cycle-preflight] cycle response was not finalizable; next poll remains fail-open');
    }
  } catch (err) {
    console.warn(
      '[one-cycle-preflight] cycle response parse/finalize failed; next poll remains fail-open:',
      err instanceof Error ? err.name : 'unknown_error',
    );
  }
  return response;
}
