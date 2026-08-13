/// <reference types="jest" />
/**
 * The `external_state_finalize` log event must carry the REAL finalize outcome.
 *
 * WHY A SECOND FILE
 * -----------------
 * `tests/runtime/one-cycle-preflight-neon-boundary.test.ts` mocks
 * `@/lib/idx/one-cycle-preflight` wholesale and stubs finalize as
 * `async () => undefined`, so it can prove the import boundary but can never
 * prove which outcome value is emitted — every outcome would log `undefined`
 * and the assertion would still pass. This file therefore runs the REAL
 * `decideOneCyclePreflight` / `finalizeOneCyclePreflight` and drives the four
 * outcomes from the outside, by making the mocked Redis client absent, its
 * `set` reject, or the Cotality probe throw.
 *
 * WHY IT MATTERS
 * --------------
 * `outcome` is the ONLY signal that separates "the machine is healthy and had
 * nothing to skip" (0 skip_neon events, everything fine) from "the completion
 * state never persisted, so every poll forces a full Neon cycle" (0 skip_neon
 * events, silently burning Neon CPU). Both look identical in the logs without
 * it, and that ambiguity is the production symptom this event was added for.
 *
 * No production source is touched by this file.
 */
import { NextRequest } from 'next/server';

const redisGet = jest.fn();
const redisSet = jest.fn();
const fetchFromTrestle = jest.fn();

/** null models lib/redis.ts with the UPSTASH_* env vars absent. */
let mockRedisClient: { get: jest.Mock; set: jest.Mock } | null = null;
/** Body the (mocked) Neon-backed One Cycle route returns. */
let mockCycleBody: unknown = {};

jest.mock('@/lib/redis', () => ({
  get redis() {
    return mockRedisClient;
  },
  get default() {
    return mockRedisClient;
  },
}));
jest.mock('@/lib/idx/fetch', () => ({
  fetchFromTrestle: (...args: unknown[]) => fetchFromTrestle(...args),
}));
// The Prisma-backed machine must never be evaluated for real in a unit test.
jest.mock('@/app/api/cron/one-cycle/route', () => ({
  GET: async () => new Response(JSON.stringify(mockCycleBody), { status: 200 }),
}));

const CRON_SECRET = 'test-cron-secret';

const SECRET_TOKEN = 'AX7fSUPERSECRETTOKENvalue';
const SECRET_URL = 'https://leaky-endpoint.upstash.io';
function secretBearingError(name: string): Error {
  const err = new Error(`connect ECONNREFUSED ${SECRET_URL} token=${SECRET_TOKEN}`);
  err.name = name;
  return err;
}

const HEAD_MODIFICATION = '2026-08-02T06:55:00.000Z';
const HEAD_PHOTOS = '2026-08-02T06:50:00.000Z';

/** Probe echoes the stored heads back => a genuine "unchanged" verdict. */
function mockSameHeads() {
  fetchFromTrestle.mockImplementation(async (options: { select?: string[] }) => {
    const field = options.select?.[1];
    if (field === 'ModificationTimestamp') {
      return {
        records: [{ ListingKey: 'M-2', ModificationTimestamp: HEAD_MODIFICATION }],
        totalFetched: 1,
        hasMore: false,
        odataCount: 2,
      };
    }
    return {
      records: [{ ListingKey: 'P-1', PhotosChangeTimestamp: HEAD_PHOTOS }],
      totalFetched: 1,
      hasMore: false,
      odataCount: 1,
    };
  });
}

/**
 * The route calls `decideOneCyclePreflight(new Date())` with the real clock, so
 * the heartbeat timestamp is anchored to now rather than to a fixed fixture.
 */
function storedState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    snapshot: {
      modification: { timestamp: HEAD_MODIFICATION, listingKey: 'M-2', populationAtHead: 2 },
      photos: { timestamp: HEAD_PHOTOS, listingKey: 'P-1', populationAtHead: 1 },
      capturedAt: '2026-08-02T06:56:00.000Z',
    },
    forceRun: false,
    backlogPending: false,
    nextBacklogRunAt: null,
    lastCompletedAt: new Date(Date.now() - 60_000).toISOString(),
    lastSuccessfulFullCycleAt: new Date(Date.now() - 60_000).toISOString(),
    lastOutcome: 'success',
    ...overrides,
  };
}

const VALID_COMPLETION = {
  success: true,
  complete: true,
  outcome: 'success',
  members: [
    { member: 'idx-sync', status: 'ok', summary: { total_fetched: 1 } },
    { member: 'media-sync', status: 'ok', summary: { backlog_remaining: 0 } },
  ],
};

let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  fetchFromTrestle.mockReset();
  mockRedisClient = { get: redisGet, set: redisSet };
  mockCycleBody = VALID_COMPLETION;
  process.env.CRON_SECRET = CRON_SECRET;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

async function callRoute(): Promise<Response> {
  const { GET } = await import('@/app/api/cron/one-cycle-preflight/route');
  return GET(
    new NextRequest('https://mallan.nyc/api/cron/one-cycle-preflight', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
}

function emittedEvents(): Array<Record<string, unknown>> {
  const parsed: Array<Record<string, unknown>> = [];
  for (const call of logSpy.mock.calls) {
    const line = call[0];
    if (typeof line !== 'string') continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object') parsed.push(obj as Record<string, unknown>);
    } catch {
      // Not a structured line; the assertions below only care about JSON ones.
    }
  }
  return parsed;
}

function finalizeEvent(): Record<string, unknown> | undefined {
  return emittedEvents().find((e) => e.event === 'external_state_finalize');
}

describe('the route emits the REAL finalize outcome, end to end', () => {
  it("logs outcome 'ok' when the completion state actually persists", async () => {
    redisGet.mockResolvedValue(storedState({ forceRun: true }));
    mockSameHeads();
    redisSet.mockResolvedValue('OK');

    await callRoute();

    expect(finalizeEvent()).toMatchObject({
      tag: 'one_cycle_preflight',
      event: 'external_state_finalize',
      outcome: 'ok',
      decision_reason: 'forced_retry',
    });
    expect(redisSet).toHaveBeenCalledTimes(1);
  });

  it("logs outcome 'redis_write_failed' when the post-cycle write throws", async () => {
    // The dangerous case: the cycle succeeded, the response is a normal 200, and
    // only this event reveals that nothing was persisted.
    redisGet.mockResolvedValue(storedState({ forceRun: true }));
    mockSameHeads();
    redisSet.mockRejectedValue(secretBearingError('UpstashWriteError'));

    const res = await callRoute();

    expect(res.status).toBe(200);
    expect(finalizeEvent()).toMatchObject({
      outcome: 'redis_write_failed',
      decision_reason: 'forced_retry',
    });
  });

  it("logs outcome 'redis_client_missing' when no client is configured", async () => {
    mockRedisClient = null;
    mockSameHeads();

    await callRoute();

    expect(finalizeEvent()).toMatchObject({
      outcome: 'redis_client_missing',
      decision_reason: 'redis_client_missing',
    });
  });

  it("logs outcome 'no_snapshot' when a fail-open cycle had nothing to persist", async () => {
    // Read succeeds but returns nothing, and the probe then throws, so there is
    // no snapshot to carry forward. Normal, and must not read as a write failure.
    redisGet.mockResolvedValue(null);
    fetchFromTrestle.mockRejectedValue(secretBearingError('TrestleProbeError'));

    await callRoute();

    expect(finalizeEvent()).toMatchObject({
      outcome: 'no_snapshot',
      decision_reason: 'source_probe_failed',
    });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("logs outcome 'not_finalizable' when the cycle body is not a completion", async () => {
    redisGet.mockResolvedValue(storedState({ forceRun: true }));
    mockSameHeads();
    mockCycleBody = { unexpected: 'shape' };

    await callRoute();

    expect(finalizeEvent()).toMatchObject({
      outcome: 'not_finalizable',
      decision_reason: 'forced_retry',
    });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('the emitted outcomes are all different — the event is not a constant', async () => {
    const outcomes: unknown[] = [];

    const run = async (arrange: () => void) => {
      redisGet.mockReset();
      redisSet.mockReset();
      fetchFromTrestle.mockReset();
      logSpy.mockClear();
      mockRedisClient = { get: redisGet, set: redisSet };
      mockCycleBody = VALID_COMPLETION;
      arrange();
      await callRoute();
      outcomes.push(finalizeEvent()?.outcome);
    };

    await run(() => {
      redisGet.mockResolvedValue(storedState({ forceRun: true }));
      mockSameHeads();
      redisSet.mockResolvedValue('OK');
    });
    await run(() => {
      redisGet.mockResolvedValue(storedState({ forceRun: true }));
      mockSameHeads();
      redisSet.mockRejectedValue(new Error('write down'));
    });
    await run(() => {
      redisGet.mockResolvedValue(null);
      fetchFromTrestle.mockRejectedValue(new Error('probe down'));
    });
    await run(() => {
      mockRedisClient = null;
      mockSameHeads();
    });

    expect(outcomes).toEqual(['ok', 'redis_write_failed', 'no_snapshot', 'redis_client_missing']);
    expect(new Set(outcomes).size).toBe(4);
  });
});

describe('the finalize event stays scoped and safe', () => {
  it('is NOT emitted on a skip — nothing ran, so nothing is finalizable', async () => {
    redisGet.mockResolvedValue(storedState());
    mockSameHeads();

    const res = await callRoute();
    const body = await res.json();

    expect(body).toMatchObject({ skipped: true, neon_touched: false });
    expect(finalizeEvent()).toBeUndefined();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('never leaks the Redis endpoint or token into any log line', async () => {
    redisGet.mockResolvedValue(storedState({ forceRun: true }));
    mockSameHeads();
    redisSet.mockRejectedValue(secretBearingError('UpstashWriteError'));

    await callRoute();

    const everything = [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((call) => call.map((a: unknown) => String(a)).join(' '))
      .join('\n');
    expect(everything).toContain('external_state_finalize');
    expect(everything).not.toContain(SECRET_TOKEN);
    expect(everything).not.toContain(SECRET_URL);
  });

  it('carries the decision reason so skip-rate and write failures correlate', async () => {
    redisGet.mockResolvedValue(
      storedState({ backlogPending: true, nextBacklogRunAt: new Date(Date.now() - 1000).toISOString() }),
    );
    mockSameHeads();
    redisSet.mockResolvedValue('OK');

    await callRoute();

    // A real, non-default reason from the real decision function.
    expect(finalizeEvent()).toMatchObject({ outcome: 'ok', decision_reason: 'backlog_due' });
  });
});
