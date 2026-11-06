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
    // STRUCTURED, like the two success paths above. This was an unstructured
    // console.warn, which meant the one outcome that matters most — the
    // completion state failed to persist, so every subsequent poll fails open
    // and Neon is never skipped — was the ONLY outcome not queryable by
    // `tag`/`event`. A log filter looking for external_state_finalize events
    // would see nothing and read that as "no problem".
    //
    // Error CLASS only, never the message: the Upstash failure carries the REST
    // URL and can carry the token, and this line is shipped to runtime logs.
    console.log(JSON.stringify({
      tag: 'one_cycle_preflight',
      event: 'external_state_finalize',
      outcome: 'parse_or_finalize_threw',
      decision_reason: decision.reason,
      error_class: err instanceof Error ? err.name : 'unknown_error',
    }));
  }
  await followLinkedListings(polledAt);
  return response;
}

/**
 * Mallan listings linked to an RLS ID follow their Cotality record (lib/listings/rls-follow-run.ts). It runs HERE, after the cycle, and only on the path that already reached Neon: a
 * verified no-change poll returns above without loading it, so the skip path stays Neon-free, and there is no second schedule. It never changes the cycle's answer: it runs after the
 * finalize, inside its own try/catch, and only if the cycle left time (a cycle may use most of this route's 300 s; what is not done now is done by the next run).
 */
const ROUTE_BUDGET_MS = 300_000;
const FOLLOW_MIN_LEFT_MS = 30_000;
const FOLLOW_MAX_MS = 45_000;

async function followLinkedListings(startedAt: Date): Promise<void> {
  const left = ROUTE_BUDGET_MS - (Date.now() - startedAt.getTime());
  if (left < FOLLOW_MIN_LEFT_MS + 15_000) {
    console.log(JSON.stringify({ tag: 'rls_follow', event: 'skipped_no_time_left', left_ms: left }));
    return;
  }
  try {
    const { runRlsFollow } = await import('@/lib/listings/rls-follow-run');
    const { httpStatus, summary } = await runRlsFollow({ budgetMs: Math.min(FOLLOW_MAX_MS, left - FOLLOW_MIN_LEFT_MS) });
    console.log(JSON.stringify({
      tag: 'rls_follow',
      event: 'ran',
      http_status: httpStatus,
      linked: summary.linked,
      changed: summary.changed,
      unchanged: summary.unchanged,
      skipped: summary.skipped.length,
      failed: summary.failed.length,
      duplicate_links: summary.duplicateLinks.length,
      not_the_same_unit: summary.notTheSameUnit.length,
      status_mismatch: summary.statusMismatch.length,
      time_budget_reached: summary.timeBudgetReached,
    }));
  } catch (err) {
    console.log(JSON.stringify({ tag: 'rls_follow', event: 'threw', error_class: err instanceof Error ? err.name : 'unknown_error' }));
  }
}
