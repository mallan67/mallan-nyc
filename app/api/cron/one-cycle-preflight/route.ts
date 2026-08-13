import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
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
    const summary = isRecord(raw.summary) ? { ...raw.summary } : {};
    if (
      raw.member === 'idx-sync' &&
      typeof summary.listings_fetched === 'number' &&
      typeof summary.total_fetched !== 'number'
    ) {
      summary.total_fetched = summary.listings_fetched;
    }
    members.push({ member: raw.member, status: raw.status, summary });
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
 * The lightweight Cotality + Redis preflight runs before Prisma is even
 * imported. A verified no-change poll returns with `neon_touched:false`: no
 * client instantiation, advisory lock, cursor read, audit row, or Neon wake.
 * Every uncertain condition dynamically loads the existing proven One Cycle,
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

  // Dynamic by design: the skip path must not evaluate the Prisma-backed route.
  const { GET: runOneCycle } = await import('@/app/api/cron/one-cycle/route');
  const response = await runOneCycle(req);
  try {
    const body = await response.clone().json();
    const completion = completionFromBody(body);
    if (completion) {
      // The finalize outcome is the ONLY signal that distinguishes "the machine
      // is healthy and had nothing to skip" from "the completion state never
      // persisted, so every poll forces a full Neon cycle." Production shows
      // 0 skip_neon events; without this the two look identical in the logs.
      // Emitted as its own event, never as a decision reason — this runs AFTER
      // the Neon-backed cycle.
      const outcome = await finalizeOneCyclePreflight(decision, completion, new Date());
      console.log(JSON.stringify({
        tag: 'one_cycle_preflight',
        event: 'external_state_finalize',
        outcome,
        decision_reason: decision.reason,
      }));
    } else {
      console.log(JSON.stringify({
        tag: 'one_cycle_preflight',
        event: 'external_state_finalize',
        outcome: 'not_finalizable',
        decision_reason: decision.reason,
      }));
    }
  } catch (err) {
    console.warn(
      '[one-cycle-preflight] cycle response parse/finalize failed; next poll remains fail-open:',
      err instanceof Error ? err.name : 'unknown_error',
    );
  }
  return response;
}
