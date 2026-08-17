/// <reference types="jest" />
/**
 * DEFECT A — external-state failures must be distinguishable AT RUNTIME.
 *
 * Production showed 4/4 preflights reporting one generic reason and 0
 * skip_neon events, so the CPU-saving preflight delivered nothing while
 * hiding WHICH failure was happening. The subtypes have entirely different
 * remediations:
 *
 *   redis_client_missing        env vars absent or mis-scoped   -> env fix
 *   redis_read_failed           client exists, call threw       -> endpoint/auth/DNS
 *   state_missing_or_invalid    read succeeded, nothing stored  -> normal cold start
 *   source_probe_failed         Cotality probe threw            -> feed/transport
 *   redis_write_failed          POST-cycle persist failed       -> looks healthy, never skips
 *
 * WHY THIS FILE LOOKS LIKE THIS
 * -----------------------------
 * The previous version of this file read lib/idx/one-cycle-preflight.ts as a
 * STRING and asserted on source text (`expect(src).toContain("reason: '...'")`).
 * That proves the literals are spelled correctly and nothing else: a refactor
 * that preserved the strings but inverted a branch, dropped a `shouldRun`, or
 * short-circuited the client check would still pass. Every test below imports
 * and CALLS the real functions, driving the real fail-open branches by making
 * the mocked Redis client absent / rejecting and the mocked Trestle probe throw.
 *
 * lib/redis.ts exports `null` when UPSTASH_* is absent (it does not throw), so
 * a null client is modelled exactly, via a getter on the mocked module.
 */
import type {
  OneCycleCompletionInput,
  OneCyclePreflightDecision,
  OneCyclePreflightState,
  SourceSnapshot,
} from '@/lib/idx/one-cycle-preflight';

const redisGet = jest.fn();
const redisSet = jest.fn();
const fetchFromTrestle = jest.fn();

/**
 * Swapped per test. `null` is the real production shape when the UPSTASH_*
 * env vars are missing — lib/redis.ts exports null and consumers must fail open.
 * A getter is used so the value can change between tests without re-requiring
 * the module under test (the source reads `redis` at every call site).
 */
let mockRedisClient: { get: jest.Mock; set: jest.Mock } | null = null;

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

const preflight =
  require('@/lib/idx/one-cycle-preflight') as typeof import('@/lib/idx/one-cycle-preflight');

const NOW = new Date('2026-08-02T07:00:00.000Z');

const snapshot: SourceSnapshot = {
  modification: {
    timestamp: '2026-08-02T06:55:00.000Z',
    listingKey: 'M-2',
    populationAtHead: 2,
  },
  photos: {
    timestamp: '2026-08-02T06:50:00.000Z',
    listingKey: 'P-1',
    populationAtHead: 1,
  },
  capturedAt: '2026-08-02T06:56:00.000Z',
};

/** Healthy stored state: fresh heartbeat, no force, no backlog. */
const validState: OneCyclePreflightState = {
  version: 1,
  snapshot,
  forceRun: false,
  backlogPending: false,
  nextBacklogRunAt: null,
  lastCompletedAt: '2026-08-02T06:56:30.000Z',
  lastSuccessfulFullCycleAt: '2026-08-02T06:56:30.000Z',
  lastOutcome: 'success',
};

const completion: OneCycleCompletionInput = {
  success: true,
  complete: true,
  outcome: 'success',
  members: [
    { member: 'idx-sync', status: 'ok', summary: { total_fetched: 1 } },
    { member: 'media-sync', status: 'ok', summary: { backlog_remaining: 0 } },
  ],
};

/**
 * A secret-shaped error. Any path that logs `err.message` instead of `err.name`
 * leaks the endpoint and token into Vercel logs, so the tests assert on the
 * absence of these substrings in real captured console output.
 */
const SECRET_URL = 'https://leaky-endpoint.upstash.io';
const SECRET_TOKEN = 'AX7fSUPERSECRETTOKENvalue';
function secretBearingError(name: string): Error {
  const err = new Error(`connect ECONNREFUSED ${SECRET_URL} token=${SECRET_TOKEN}`);
  err.name = name;
  return err;
}

/** Probe returns exactly the stored heads => a genuine "unchanged" verdict. */
function mockSameHeads() {
  fetchFromTrestle.mockImplementation(async (options: { select?: string[] }) => {
    const field = options.select?.[1];
    if (field === 'ModificationTimestamp') {
      return {
        records: [{ ListingKey: 'M-2', ModificationTimestamp: snapshot.modification.timestamp }],
        totalFetched: 1,
        hasMore: false,
        odataCount: 2,
      };
    }
    return {
      records: [{ ListingKey: 'P-1', PhotosChangeTimestamp: snapshot.photos.timestamp }],
      totalFetched: 1,
      hasMore: false,
      odataCount: 1,
    };
  });
}

/** Probe returns a newer modification head => a genuine "changed" verdict. */
function mockChangedHeads() {
  fetchFromTrestle.mockImplementation(async (options: { select?: string[] }) => {
    const field = options.select?.[1];
    if (field === 'ModificationTimestamp') {
      return {
        records: [{ ListingKey: 'M-9', ModificationTimestamp: '2026-08-02T06:59:00.000Z' }],
        totalFetched: 1,
        hasMore: false,
        odataCount: 1,
      };
    }
    return {
      records: [{ ListingKey: 'P-1', PhotosChangeTimestamp: snapshot.photos.timestamp }],
      totalFetched: 1,
      hasMore: false,
      odataCount: 1,
    };
  });
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  fetchFromTrestle.mockReset();
  mockRedisClient = { get: redisGet, set: redisSet };
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  delete process.env.ONE_CYCLE_BACKLOG_INTERVAL_SECONDS;
});

afterEach(() => {
  warnSpy.mockRestore();
});

function warnOutput(): string {
  return warnSpy.mock.calls.map((call) => call.map((a: unknown) => String(a)).join(' ')).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// SCENARIO TABLE — every reachable decision branch, driven through the real
// function. Used by the distinguishability, dead-reason, and fail-open suites
// so none of them can drift apart.
// ─────────────────────────────────────────────────────────────────────────
interface Scenario {
  label: string;
  reason: OneCyclePreflightDecision['reason'];
  arrange: () => void;
}

const SCENARIOS: Scenario[] = [
  {
    label: 'no Redis client is configured at all',
    reason: 'redis_client_missing',
    arrange: () => {
      mockRedisClient = null;
    },
  },
  {
    label: 'the client exists but the read throws',
    reason: 'redis_read_failed',
    arrange: () => {
      redisGet.mockRejectedValue(secretBearingError('UpstashReadError'));
      mockSameHeads();
    },
  },
  {
    label: 'the read succeeds but the Cotality probe throws',
    reason: 'source_probe_failed',
    arrange: () => {
      redisGet.mockResolvedValue(validState);
      fetchFromTrestle.mockRejectedValue(secretBearingError('TrestleProbeError'));
    },
  },
  {
    label: 'the read succeeds and returns nothing stored',
    reason: 'state_missing_or_invalid',
    arrange: () => {
      redisGet.mockResolvedValue(null);
      mockSameHeads();
    },
  },
  {
    label: 'the prior cycle demanded an immediate retry',
    reason: 'forced_retry',
    arrange: () => {
      redisGet.mockResolvedValue({ ...validState, forceRun: true });
      mockSameHeads();
    },
  },
  {
    label: 'the source head moved',
    reason: 'source_changed',
    arrange: () => {
      redisGet.mockResolvedValue(validState);
      mockChangedHeads();
    },
  },
  {
    label: 'the freshness heartbeat expired',
    reason: 'freshness_heartbeat_due',
    arrange: () => {
      redisGet.mockResolvedValue({
        ...validState,
        lastSuccessfulFullCycleAt: '2026-08-02T05:00:00.000Z',
      });
      mockSameHeads();
    },
  },
  {
    label: 'a bounded media backlog came due',
    reason: 'backlog_due',
    arrange: () => {
      redisGet.mockResolvedValue({
        ...validState,
        backlogPending: true,
        nextBacklogRunAt: '2026-08-02T06:59:00.000Z',
      });
      mockSameHeads();
    },
  },
  {
    label: 'everything is genuinely quiet',
    reason: 'source_unchanged_no_backlog_due',
    arrange: () => {
      redisGet.mockResolvedValue(validState);
      mockSameHeads();
    },
  },
];

async function decideWith(scenario: Scenario): Promise<OneCyclePreflightDecision> {
  scenario.arrange();
  return preflight.decideOneCyclePreflight(NOW);
}

// ─────────────────────────────────────────────────────────────────────────
describe('decision-time subtypes are distinguishable BY BEHAVIOUR', () => {
  it('a null client returns redis_client_missing without touching Redis or Cotality', async () => {
    mockRedisClient = null;

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision).toMatchObject({
      shouldRun: true,
      reason: 'redis_client_missing',
      snapshot: null,
      snapshotTrusted: false,
      priorState: null,
    });
    // The short-circuit must happen BEFORE any I/O: a missing client cannot be
    // allowed to spend a Cotality probe on every 10-minute poll.
    expect(redisGet).not.toHaveBeenCalled();
    expect(fetchFromTrestle).not.toHaveBeenCalled();
  });

  it('a throwing read returns redis_read_failed and fails open', async () => {
    redisGet.mockRejectedValue(secretBearingError('UpstashReadError'));
    mockSameHeads();

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision).toMatchObject({
      shouldRun: true,
      reason: 'redis_read_failed',
      snapshot: null,
      snapshotTrusted: false,
      priorState: null,
    });
    expect(redisGet).toHaveBeenCalledWith(preflight.ONE_CYCLE_PREFLIGHT_KEY);
  });

  it('a throwing read logs the error NAME and never the message', async () => {
    redisGet.mockRejectedValue(secretBearingError('UpstashReadError'));
    mockSameHeads();

    await preflight.decideOneCyclePreflight(NOW);

    const logged = warnOutput();
    expect(logged).toContain('UpstashReadError');
    expect(logged).not.toContain(SECRET_TOKEN);
    expect(logged).not.toContain(SECRET_URL);
  });

  it('a throwing Cotality probe returns source_probe_failed, distinct from the Redis subtypes', async () => {
    redisGet.mockResolvedValue(validState);
    fetchFromTrestle.mockRejectedValue(secretBearingError('TrestleProbeError'));

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision).toMatchObject({
      shouldRun: true,
      reason: 'source_probe_failed',
      snapshotTrusted: false,
    });
    // The Redis read SUCCEEDED here, so the prior state survives — that is the
    // observable difference from redis_read_failed, which discards it.
    expect(decision.priorState).not.toBeNull();
    expect(decision.snapshot).toEqual(snapshot);

    const logged = warnOutput();
    expect(logged).toContain('TrestleProbeError');
    expect(logged).not.toContain(SECRET_TOKEN);
  });

  it.each([
    ['an empty read', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['unparseable JSON', '{bad json'],
    ['a wrong state version', { ...validState, version: 99 }],
    ['a state with no snapshot', { ...validState, snapshot: null }],
    ['a state with a corrupt snapshot head', {
      ...validState,
      snapshot: { ...snapshot, modification: { timestamp: 'not-a-date', listingKey: 'M-2', populationAtHead: 2 } },
    }],
  ])('%s returns state_missing_or_invalid with a TRUSTED fresh snapshot', async (_label, stored) => {
    redisGet.mockResolvedValue(stored);
    mockSameHeads();

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision).toMatchObject({
      shouldRun: true,
      reason: 'state_missing_or_invalid',
      priorState: null,
    });
    // The probe succeeded, so the freshly captured snapshot IS trustworthy and
    // can be persisted. This is what separates a cold start from a probe error.
    expect(decision.snapshotTrusted).toBe(true);
    expect(decision.snapshot).not.toBeNull();
  });

  it('the four external-state failure modes produce four DIFFERENT reasons', async () => {
    const failureLabels = [
      'redis_client_missing',
      'redis_read_failed',
      'source_probe_failed',
      'state_missing_or_invalid',
    ];
    const observed: string[] = [];
    for (const scenario of SCENARIOS.filter((s) => failureLabels.includes(s.reason))) {
      redisGet.mockReset();
      fetchFromTrestle.mockReset();
      mockRedisClient = { get: redisGet, set: redisSet };
      observed.push((await decideWith(scenario)).reason);
    }
    expect(observed).toEqual(failureLabels);
    expect(new Set(observed).size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('finalize returns a real, actionable outcome', () => {
  const decisionWithSnapshot: OneCyclePreflightDecision = {
    shouldRun: true,
    reason: 'source_changed',
    snapshot,
    snapshotTrusted: true,
    priorState: validState,
    // Both heads moved, so this is the authoritative plan. These assertions are
    // about finalize's write outcome, and an authoritative plan keeps the
    // pre-existing heartbeat expectations intact.
    executionPlan: 'idx_then_media',
    headDelta: { modification: true, photos: true },
    planReasons: ['modification_head_moved', 'photos_head_moved'],
  };

  it("a successful write returns 'ok' and actually persists state", async () => {
    redisSet.mockResolvedValue('OK');

    const outcome = await preflight.finalizeOneCyclePreflight(decisionWithSnapshot, completion, NOW);

    expect(outcome).toBe('ok');
    expect(redisSet).toHaveBeenCalledTimes(1);
    expect(redisSet.mock.calls[0][0]).toBe(preflight.ONE_CYCLE_PREFLIGHT_KEY);
  });

  it("a throwing write returns 'redis_write_failed' and never throws at the caller", async () => {
    redisSet.mockRejectedValue(secretBearingError('UpstashWriteError'));

    const outcome = await preflight.finalizeOneCyclePreflight(decisionWithSnapshot, completion, NOW);

    expect(outcome).toBe('redis_write_failed');
    const logged = warnOutput();
    expect(logged).toContain('UpstashWriteError');
    expect(logged).not.toContain(SECRET_TOKEN);
    expect(logged).not.toContain(SECRET_URL);
  });

  it("a null client returns 'redis_client_missing' and attempts no write", async () => {
    mockRedisClient = null;

    const outcome = await preflight.finalizeOneCyclePreflight(decisionWithSnapshot, completion, NOW);

    expect(outcome).toBe('redis_client_missing');
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("a decision with no snapshot returns 'no_snapshot' and attempts no write", async () => {
    redisSet.mockResolvedValue('OK');

    const outcome = await preflight.finalizeOneCyclePreflight(
      { ...decisionWithSnapshot, reason: 'source_probe_failed', snapshot: null, snapshotTrusted: false },
      completion,
      NOW,
    );

    expect(outcome).toBe('no_snapshot');
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('the four finalize outcomes are four distinct values', async () => {
    const outcomes: string[] = [];

    redisSet.mockResolvedValue('OK');
    outcomes.push(await preflight.finalizeOneCyclePreflight(decisionWithSnapshot, completion, NOW));

    redisSet.mockReset();
    redisSet.mockRejectedValue(new Error('write down'));
    outcomes.push(await preflight.finalizeOneCyclePreflight(decisionWithSnapshot, completion, NOW));

    redisSet.mockReset();
    redisSet.mockResolvedValue('OK');
    outcomes.push(
      await preflight.finalizeOneCyclePreflight({ ...decisionWithSnapshot, snapshot: null }, completion, NOW),
    );

    mockRedisClient = null;
    outcomes.push(await preflight.finalizeOneCyclePreflight(decisionWithSnapshot, completion, NOW));

    expect(outcomes).toEqual(['ok', 'redis_write_failed', 'no_snapshot', 'redis_client_missing']);
    expect(new Set(outcomes).size).toBe(4);
  });

  it('a post-cycle write failure is NEVER reported as a decision reason', async () => {
    // The write happens AFTER the Neon cycle. If it leaked into the decision
    // union, a post-cycle problem would be read as a pre-cycle one.
    const finalizeOnly = new Set(['ok', 'redis_write_failed', 'no_snapshot']);
    for (const scenario of SCENARIOS) {
      redisGet.mockReset();
      redisSet.mockReset();
      fetchFromTrestle.mockReset();
      mockRedisClient = { get: redisGet, set: redisSet };
      // Make every write fail, so a leaked write-outcome would surface.
      redisSet.mockRejectedValue(new Error('write down'));
      const { reason } = await decideWith(scenario);
      expect(finalizeOnly.has(reason)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("'external_state_unavailable' is dead — nothing can emit it", () => {
  it('is not returned by ANY reachable decision path', async () => {
    for (const scenario of SCENARIOS) {
      redisGet.mockReset();
      redisSet.mockReset();
      fetchFromTrestle.mockReset();
      mockRedisClient = { get: redisGet, set: redisSet };
      const { reason } = await decideWith(scenario);
      expect(reason).not.toBe('external_state_unavailable');
    }
  });

  it('every reachable path emits one of the specific subtypes instead', async () => {
    const observed: string[] = [];
    for (const scenario of SCENARIOS) {
      redisGet.mockReset();
      redisSet.mockReset();
      fetchFromTrestle.mockReset();
      mockRedisClient = { get: redisGet, set: redisSet };
      observed.push((await decideWith(scenario)).reason);
    }
    expect(observed).toEqual(SCENARIOS.map((s) => s.reason));
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('FAIL OPEN — uncertainty must never look like "nothing to do"', () => {
  it('every failure subtype returns shouldRun: true', async () => {
    const failures = SCENARIOS.filter((s) =>
      ['redis_client_missing', 'redis_read_failed', 'source_probe_failed', 'state_missing_or_invalid'].includes(
        s.reason,
      ),
    );
    expect(failures).toHaveLength(4);
    for (const scenario of failures) {
      redisGet.mockReset();
      fetchFromTrestle.mockReset();
      mockRedisClient = { get: redisGet, set: redisSet };
      const decision = await decideWith(scenario);
      expect({ reason: decision.reason, shouldRun: decision.shouldRun }).toEqual({
        reason: scenario.reason,
        shouldRun: true,
      });
    }
  });

  it('the ONLY skip is a proven-quiet source with no backlog due', async () => {
    for (const scenario of SCENARIOS) {
      redisGet.mockReset();
      fetchFromTrestle.mockReset();
      mockRedisClient = { get: redisGet, set: redisSet };
      const decision = await decideWith(scenario);
      // shouldRun is FALSE for exactly one reason and TRUE for all the others.
      expect(decision.shouldRun).toBe(decision.reason !== 'source_unchanged_no_backlog_due');
    }
  });

  it('a skip is only ever reached with a trusted snapshot', async () => {
    redisGet.mockResolvedValue(validState);
    mockSameHeads();

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.shouldRun).toBe(false);
    expect(decision.snapshotTrusted).toBe(true);
    expect(decision.snapshot).not.toBeNull();
    // A skip must not write anything: nothing ran, so nothing is finalizable.
    expect(redisSet).not.toHaveBeenCalled();
  });
});
