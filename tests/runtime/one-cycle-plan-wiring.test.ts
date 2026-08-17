/// <reference types="jest" />
/**
 * TASK 1 SEAM — the execution plan must actually REACH One Cycle.
 *
 * lib/idx/one-cycle-preflight.ts decides the plan and tests/runtime/
 * one-cycle-execution-plan.test.ts proves that decision. This file proves the
 * other half: that the preflight route forwards the plan across the dynamic
 * import boundary, so One Cycle can select members from it.
 *
 * Without this the decision is inert — the preflight would compute `media_only`
 * and One Cycle would still run the whole machine, and every unit test would
 * still pass.
 */
import { NextRequest, NextResponse } from 'next/server';
import type {
  OneCycleCompletionInput,
  OneCyclePreflightDecision,
  OneCycleExecutionPlan,
  SourceSnapshot,
} from '@/lib/idx/one-cycle-preflight';

const runOneCycle: jest.MockedFunction<(req: NextRequest) => Promise<NextResponse>> = jest.fn(
  async (_req: NextRequest) => NextResponse.json({
    success: true,
    complete: true,
    outcome: 'success',
    members: [{ member: 'media-sync', status: 'ok', summary: { backlog_remaining: 0 } }],
  }),
);
const decidePreflight: jest.MockedFunction<(now?: Date) => Promise<OneCyclePreflightDecision>> = jest.fn();
const finalizePreflight = jest.fn(async () => undefined);

jest.mock('@/app/api/cron/one-cycle/route', () => ({
  GET: (req: NextRequest) => runOneCycle(req),
}));
jest.mock('@/lib/idx/one-cycle-preflight', () => ({
  decideOneCyclePreflight: (now?: Date) => decidePreflight(now),
  finalizeOneCyclePreflight: (
    _decision: OneCyclePreflightDecision,
    _completion: OneCycleCompletionInput,
    _now?: Date,
  ) => finalizePreflight(),
}));

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

const makeReq = () =>
  new NextRequest('https://mallan.nyc/api/cron/one-cycle-preflight', {
    headers: { authorization: AUTH },
  });

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

/** The plan One Cycle actually received, read off the forwarded request. */
function forwardedPlan(): string | null {
  const req = runOneCycle.mock.calls[0]?.[0];
  return req ? req.nextUrl.searchParams.get('plan') : null;
}

beforeEach(() => {
  runOneCycle.mockClear();
  decidePreflight.mockReset();
  finalizePreflight.mockClear();
});

describe('execution plan reaches One Cycle', () => {
  it.each<OneCycleExecutionPlan>(['idx_only', 'media_only', 'idx_then_media', 'full_safety'])(
    'forwards %s across the dynamic import boundary',
    async (plan) => {
      decidePreflight.mockResolvedValue(decisionFor(plan));

      await GET(makeReq());

      expect(runOneCycle).toHaveBeenCalledTimes(1);
      expect(forwardedPlan()).toBe(plan);
    },
  );

  it('preserves the authorization header on the forwarded request', async () => {
    decidePreflight.mockResolvedValue(decisionFor('media_only'));

    await GET(makeReq());

    // One Cycle authorises on this header alone. Rebuilding the request to add
    // the query param must not drop it, or every planned cycle 401s.
    expect(runOneCycle.mock.calls[0][0].headers.get('authorization')).toBe(AUTH);
  });

  it('never invokes One Cycle at all when the plan is skip', async () => {
    decidePreflight.mockResolvedValue({ ...decisionFor('skip'), reason: 'source_unchanged_no_backlog_due' });

    const response = await GET(makeReq());
    const body = await response.json();

    expect(runOneCycle).not.toHaveBeenCalled();
    expect(body.neon_touched).toBe(false);
    expect(body.execution_plan).toBe('skip');
  });
});
