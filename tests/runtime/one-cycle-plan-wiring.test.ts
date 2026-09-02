/// <reference types="jest" />
/**
 * TASK 1 SEAM — the execution plan must reach One Cycle WITHOUT being
 * caller-controllable.
 *
 * REVIEW FINDING (2026-08-16), corrected here. The first implementation carried
 * the plan as `?plan=` on the forwarded request. Even though the route requires
 * the cron bearer token, that made member selection a CALLER-SUPPLIED input:
 * anything able to reach the route could ask for a narrowed cycle, and a
 * narrowed cycle silently skips a member. Trusted internal state must not make
 * a round trip through an untrusted-shaped surface.
 *
 * The plan now travels through an AsyncLocalStorage channel that only the
 * preflight can set, and it FAILS CLOSED: any caller outside the channel —
 * every direct HTTP request, including one that still passes `?plan=` — gets
 * `full_safety`, the complete machine.
 */
import { NextRequest, NextResponse } from 'next/server';
import type {
  OneCycleCompletionInput,
  OneCyclePreflightDecision,
  OneCycleExecutionPlan,
  SourceSnapshot,
} from '@/lib/idx/one-cycle-preflight';
import {
  currentExecutionPlan,
  runWithExecutionPlan,
} from '@/lib/idx/one-cycle-plan-channel';

/** The plan visible INSIDE One Cycle at the moment it is invoked. */
let observedPlan: OneCycleExecutionPlan | null = null;

const runOneCycle: jest.MockedFunction<(req: NextRequest) => Promise<NextResponse>> = jest.fn(
  async (_req: NextRequest) => {
    observedPlan = currentExecutionPlan();
    return NextResponse.json({
      success: true,
      complete: true,
      outcome: 'success',
      members: [{ member: 'media-sync', status: 'ok', summary: { backlog_remaining: 0 } }],
    });
  },
);
const decidePreflight: jest.MockedFunction<(now?: Date) => Promise<OneCyclePreflightDecision>> = jest.fn();
const finalizePreflight = jest.fn(async () => undefined);

jest.mock('@/app/api/cron/one-cycle/route', () => ({
  GET: (req: NextRequest) => runOneCycle(req),
}));
jest.mock('@/lib/idx/one-cycle-preflight', () => {
  const actual = jest.requireActual('@/lib/idx/one-cycle-preflight');
  return {
    ...actual,
    decideOneCyclePreflight: (now?: Date) => decidePreflight(now),
    finalizeOneCyclePreflight: (
      _decision: OneCyclePreflightDecision,
      _completion: OneCycleCompletionInput,
      _now?: Date,
    ) => finalizePreflight(),
  };
});

process.env.CRON_SECRET = 'unit-secret';
const AUTH = 'Bearer unit-secret';
const { GET } = require('@/app/api/cron/one-cycle-preflight/route') as {
  GET: (req: NextRequest) => Promise<NextResponse>;
};

const snapshot: SourceSnapshot = {
  modification: { timestamp: '2026-08-02T06:55:00.000Z', listingKey: 'M-2', populationAtHead: 2 },
  photos: { timestamp: '2026-08-02T06:50:00.000Z', listingKey: 'P-1', populationAtHead: 1 },
  capturedAt: '2026-08-02T06:56:00.000Z',
};

const makeReq = (url = 'https://mallan.nyc/api/cron/one-cycle-preflight') =>
  new NextRequest(url, { headers: { authorization: AUTH } });

function decisionFor(plan: OneCycleExecutionPlan): OneCyclePreflightDecision {
  return {
    shouldRun: plan !== 'skip',
    reason: 'source_changed',
    snapshot,
    snapshotTrusted: true,
    priorState: null,
    executionPlan: plan,
    headDelta: { modification: plan !== 'media_only', photos: plan !== 'idx_only' },
    planReasons: ['unit'],
  };
}

beforeEach(() => {
  runOneCycle.mockClear();
  decidePreflight.mockReset();
  finalizePreflight.mockClear();
  observedPlan = null;
});

describe('the plan channel fails closed', () => {
  it('reports full_safety outside any channel scope', () => {
    // This is the guarantee for every direct HTTP caller of One Cycle.
    expect(currentExecutionPlan()).toBe('full_safety');
  });

  it('reports the scoped plan inside the channel, and restores afterwards', async () => {
    const inside = await runWithExecutionPlan('media_only', async () => currentExecutionPlan());
    expect(inside).toBe('media_only');
    expect(currentExecutionPlan()).toBe('full_safety');
  });

  it('never lets a caller narrow the cycle to skip', async () => {
    // Reaching One Cycle at all means a run was intended. Honouring "skip"
    // there would run zero members and report a vacuous success.
    const inside = await runWithExecutionPlan('skip', async () => currentExecutionPlan());
    expect(inside).toBe('full_safety');
  });
});

describe('execution plan reaches One Cycle internally', () => {
  it.each<OneCycleExecutionPlan>(['idx_only', 'media_only', 'idx_then_media', 'full_safety'])(
    'delivers %s through the channel, not the URL',
    async (plan) => {
      decidePreflight.mockResolvedValue(decisionFor(plan));

      await GET(makeReq());

      expect(runOneCycle).toHaveBeenCalledTimes(1);
      expect(observedPlan).toBe(plan);
      // The plan must NOT appear as a request parameter.
      expect(runOneCycle.mock.calls[0][0].nextUrl.searchParams.get('plan')).toBeNull();
    },
  );

  it('ignores a caller-supplied ?plan= entirely', async () => {
    // The attack shape: a caller that reaches the preflight with its own plan
    // must not influence member selection. The preflight's decision wins, and
    // the parameter is never read.
    decidePreflight.mockResolvedValue(decisionFor('idx_then_media'));

    await GET(makeReq('https://mallan.nyc/api/cron/one-cycle-preflight?plan=media_only'));

    expect(observedPlan).toBe('idx_then_media');
  });

  it('preserves the authorization header on the forwarded request', async () => {
    decidePreflight.mockResolvedValue(decisionFor('media_only'));

    await GET(makeReq());

    expect(runOneCycle.mock.calls[0][0].headers.get('authorization')).toBe(AUTH);
  });

  it('never invokes One Cycle at all when the plan is skip', async () => {
    decidePreflight.mockResolvedValue({
      ...decisionFor('skip'),
      reason: 'source_unchanged_no_backlog_due',
    });

    const response = await GET(makeReq());
    const body = await response.json();

    expect(runOneCycle).not.toHaveBeenCalled();
    expect(body.neon_touched).toBe(false);
    expect(body.execution_plan).toBe('skip');
  });
});
