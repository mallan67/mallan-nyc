/**
 * COMMIT 8A — the pre-Neon skip boundary.
 *
 * `/api/cron/one-cycle-preflight` is the SCHEDULED entrypoint (vercel.json,
 * every 10 minutes). The Prisma-backed `/api/cron/one-cycle` route is reached
 * ONLY through a dynamic import, and only when the preflight decides the source
 * may have changed.
 *
 * WHAT THIS TEST IS FOR
 * ---------------------
 * A skip that still *evaluates* the Neon-backed module has not skipped Neon in
 * the sense that matters: module evaluation constructs the Prisma client and
 * pulls in the machine. So this asserts the IMPORT BOUNDARY itself, not merely
 * that no query ran.
 *
 * The Neon-backed route is mocked with a factory that RECORDS whether it was
 * evaluated. `jest.mock` factories are lazy, so the counter increments only if
 * something actually imports the module. Asserting "factory never called" is
 * therefore a real proof that the module was not loaded — which a test that
 * imported it up front could not give.
 *
 * FAIL-OPEN IS A SAFETY PROPERTY, NOT A BUG: every uncertain condition
 * (source changed, provider probe failure, missing/invalid external state,
 * heartbeat due, backlog due) must run the full machine. Freshness wins over
 * cost.
 */

import { NextRequest } from 'next/server';

/** Incremented ONLY if the Prisma-backed module is actually evaluated. */
let oneCycleModuleEvaluations = 0;
const runOneCycleMock = jest.fn(
  async (_req?: unknown) => new Response(JSON.stringify({ success: true }), { status: 200 }),
);

jest.mock('@/app/api/cron/one-cycle/route', () => {
  // Lazy factory: this body runs on FIRST import of the module, so a skip that
  // never imports it leaves the counter at 0.
  oneCycleModuleEvaluations += 1;
  return { GET: (req: unknown) => runOneCycleMock(req as never) };
});

const mockDecide = jest.fn();
const mockFinalize = jest.fn(async () => undefined);

jest.mock('@/lib/idx/one-cycle-preflight', () => ({
  decideOneCyclePreflight: (...a: unknown[]) => mockDecide(...(a as [])),
  finalizeOneCyclePreflight: (...a: unknown[]) => mockFinalize(...(a as [])),
}));

const CRON_SECRET = 'test-cron-secret';

function request(): NextRequest {
  return new NextRequest('https://mallan.nyc/api/cron/one-cycle-preflight', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

async function callRoute() {
  const { GET } = await import('@/app/api/cron/one-cycle-preflight/route');
  return GET(request());
}

beforeEach(() => {
  jest.clearAllMocks();
  oneCycleModuleEvaluations = 0;
  jest.resetModules();
  process.env.CRON_SECRET = CRON_SECRET;
});

describe('SKIP — a trusted unchanged poll never reaches the Neon machine', () => {
  beforeEach(() => {
    mockDecide.mockResolvedValue({
      shouldRun: false,
      reason: 'source_unchanged',
      snapshotTrusted: true,
      snapshot: { capturedAt: '2026-08-07T00:00:00Z' },
    });
  });

  it('the Prisma-backed one-cycle module is NEVER evaluated', async () => {
    await callRoute();
    expect(oneCycleModuleEvaluations).toBe(0);
  });

  it('the one-cycle handler is never invoked', async () => {
    await callRoute();
    expect(runOneCycleMock).not.toHaveBeenCalled();
  });

  it('responds skipped:true with neon_touched:false', async () => {
    const res = await callRoute();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(body.neon_touched).toBe(false);
    expect(body.reason).toBe('source_unchanged');
  });

  it('does NOT finalize external state on a skip (nothing ran to finalize)', async () => {
    await callRoute();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it('the route carries NO static import of prisma or the machine', async () => {
    const src = require('fs')
      .readFileSync(
        require('path').resolve(__dirname, '../../app/api/cron/one-cycle-preflight/route.ts'),
        'utf8',
      )
      .replace(/\r\n?/g, '\n');
    const staticImports = src.split('\n').filter((l: string) => /^import\s/.test(l)).join('\n');
    expect(staticImports).not.toMatch(/@\/lib\/prisma/);
    expect(staticImports).not.toMatch(/one-cycle\/route/);
    // ...and the machine is reached only via a dynamic import.
    expect(src).toMatch(/await import\(['"]@\/app\/api\/cron\/one-cycle\/route['"]\)/);
  });
});

describe('FAIL OPEN — every uncertain condition runs the full machine', () => {
  const runCases: Array<[string, Record<string, unknown>]> = [
    ['source changed', { shouldRun: true, reason: 'source_changed', snapshotTrusted: true }],
    ['provider probe failed', { shouldRun: true, reason: 'probe_failed', snapshotTrusted: false }],
    ['external state missing', { shouldRun: true, reason: 'state_unavailable', snapshotTrusted: false }],
    ['external state invalid', { shouldRun: true, reason: 'state_invalid', snapshotTrusted: false }],
    ['freshness heartbeat due', { shouldRun: true, reason: 'heartbeat_due', snapshotTrusted: true }],
    ['backlog due', { shouldRun: true, reason: 'backlog_due', snapshotTrusted: true }],
  ];

  it.each(runCases)('%s -> the machine IS evaluated and invoked', async (_label, decision) => {
    mockDecide.mockResolvedValue({ snapshot: null, ...decision });
    await callRoute();
    expect(oneCycleModuleEvaluations).toBe(1);
    expect(runOneCycleMock).toHaveBeenCalledTimes(1);
  });

  it('a decision that throws must not silently skip', async () => {
    // A preflight failure is uncertainty; uncertainty must never look like
    // "unchanged". The route surfaces the error rather than returning skipped.
    mockDecide.mockRejectedValue(new Error('redis unreachable'));
    await expect(callRoute()).rejects.toThrow();
    expect(runOneCycleMock).not.toHaveBeenCalled();
    // NOTE: this documents CURRENT behaviour — the throw propagates rather than
    // being caught into a run. The scheduled caller retries on the next fire, and
    // no skip was recorded, so freshness is not silently lost.
  });
});

describe('AUTH — an unauthorized poll touches nothing', () => {
  it('401s without evaluating the machine or the decision', async () => {
    const { GET } = await import('@/app/api/cron/one-cycle-preflight/route');
    const res = await GET(
      new NextRequest('https://mallan.nyc/api/cron/one-cycle-preflight'),
    );
    expect(res.status).toBe(401);
    expect(oneCycleModuleEvaluations).toBe(0);
    expect(mockDecide).not.toHaveBeenCalled();
  });
});
