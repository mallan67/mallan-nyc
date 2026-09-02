/// <reference types="jest" />
import type {
  OneCycleCompletionInput,
  OneCyclePreflightState,
  SourceSnapshot,
} from '@/lib/idx/one-cycle-preflight';

const redisGet = jest.fn();
const redisSet = jest.fn();
const fetchFromTrestle = jest.fn();

jest.mock('@/lib/redis', () => ({
  redis: { get: (...args: unknown[]) => redisGet(...args), set: (...args: unknown[]) => redisSet(...args) },
  default: { get: (...args: unknown[]) => redisGet(...args), set: (...args: unknown[]) => redisSet(...args) },
}));
jest.mock('@/lib/idx/fetch', () => ({
  fetchFromTrestle: (...args: unknown[]) => fetchFromTrestle(...args),
}));

const preflight = require('@/lib/idx/one-cycle-preflight') as typeof import('@/lib/idx/one-cycle-preflight');

const PREFLIGHT_NOW = new Date('2026-08-02T07:00:00.000Z');
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

const state: OneCyclePreflightState = {
  version: 1,
  snapshot,
  forceRun: false,
  backlogPending: false,
  nextBacklogRunAt: null,
  lastCompletedAt: '2026-08-02T06:56:30.000Z',
  lastSuccessfulFullCycleAt: '2026-08-02T06:56:30.000Z',
  lastOutcome: 'success',
};

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  fetchFromTrestle.mockReset();
  delete process.env.ONE_CYCLE_BACKLOG_INTERVAL_SECONDS;
});

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

describe('one-cycle preflight state', () => {
  it('rejects malformed external state instead of trusting it', () => {
    expect(preflight.parseOneCyclePreflightState({ version: 1 })).toBeNull();
    expect(preflight.parseOneCyclePreflightState('{bad json')).toBeNull();
  });

  it('detects timestamp, key, and same-timestamp population changes', () => {
    expect(preflight.sourceSnapshotChanged(snapshot, snapshot)).toBe(false);
    expect(preflight.sourceSnapshotChanged(snapshot, {
      ...snapshot,
      modification: { ...snapshot.modification, populationAtHead: 3 },
    })).toBe(true);
    expect(preflight.sourceSnapshotChanged(snapshot, {
      ...snapshot,
      photos: { ...snapshot.photos, listingKey: 'P-2' },
    })).toBe(true);
  });

  it('skips Neon only when source is unchanged and no backlog is due', async () => {
    redisGet.mockResolvedValue(state);
    mockSameHeads();
    const decision = await preflight.decideOneCyclePreflight(PREFLIGHT_NOW);
    expect(decision).toMatchObject({
      shouldRun: false,
      reason: 'source_unchanged_no_backlog_due',
      snapshotTrusted: true,
    });
  });

  it('fails open when the source probe fails', async () => {
    redisGet.mockResolvedValue(state);
    fetchFromTrestle.mockRejectedValue(new Error('source unavailable'));
    const decision = await preflight.decideOneCyclePreflight(PREFLIGHT_NOW);
    expect(decision).toMatchObject({
      shouldRun: true,
      reason: 'source_probe_failed',
      snapshotTrusted: false,
    });
  });

  it('runs when a pending media backlog reaches its bounded due time', async () => {
    redisGet.mockResolvedValue({
      ...state,
      backlogPending: true,
      nextBacklogRunAt: '2026-08-02T06:59:00.000Z',
    });
    mockSameHeads();
    const decision = await preflight.decideOneCyclePreflight(PREFLIGHT_NOW);
    expect(decision).toMatchObject({ shouldRun: true, reason: 'backlog_due' });
  });
});

describe('completion follow-up', () => {
  const completed = (
    idxSummary: Record<string, unknown>,
    mediaSummary: Record<string, unknown> = {},
  ): OneCycleCompletionInput => ({
    success: true,
    complete: true,
    outcome: 'success',
    members: [
      { member: 'idx-sync', status: 'ok', summary: idxSummary },
      { member: 'media-sync', status: 'ok', summary: mediaSummary },
    ],
  });

  it('forces an immediate retry when the 500-row listing cap is filled', () => {
    expect(preflight.deriveOneCycleFollowup(completed({ total_fetched: 500 }), true, PREFLIGHT_NOW).forceRun).toBe(true);
    expect(preflight.deriveOneCycleFollowup(completed({ total_fetched: 499 }), true, PREFLIGHT_NOW).forceRun).toBe(false);
  });

  it('forces retry on incomplete, failed, or untrusted cycles', () => {
    expect(preflight.deriveOneCycleFollowup({ ...completed({}), success: false, outcome: 'partial' }, true, PREFLIGHT_NOW).forceRun).toBe(true);
    expect(preflight.deriveOneCycleFollowup(completed({}), false, PREFLIGHT_NOW).forceRun).toBe(true);
  });

  it('defers a remaining media backlog without weakening 10-minute source checks', () => {
    const next = preflight.deriveOneCycleFollowup(
      completed({}, { backlog_remaining: 25 }),
      true,
      PREFLIGHT_NOW,
    );
    expect(next.forceRun).toBe(false);
    expect(next.backlogPending).toBe(true);
    expect(next.nextBacklogRunAt).toBe('2026-08-02T08:00:00.000Z');
  });

  it('persists only after a finalizable completed cycle', async () => {
    redisSet.mockResolvedValue('OK');
    await preflight.finalizeOneCyclePreflight(
      {
        shouldRun: true,
        reason: 'source_changed',
        snapshot,
        snapshotTrusted: true,
        priorState: state,
        executionPlan: 'idx_then_media',
        headDelta: { modification: true, photos: true },
        planReasons: ['modification_head_moved', 'photos_head_moved'],
      },
      completed({ total_fetched: 0 }),
      PREFLIGHT_NOW,
    );
    expect(redisSet).toHaveBeenCalledTimes(1);
    expect(redisSet.mock.calls[0][1]).toMatchObject({
      version: 1,
      forceRun: false,
      backlogPending: false,
      lastOutcome: 'success',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FRESHNESS HEARTBEAT (REBNY UCBA Art. I §6 backstop)
//
// The seven fail-open branches cover ERRORS. They do not cover a probe that
// succeeds and is silently WRONG — a persistent false "unchanged" would skip
// Neon forever. These tests pin the bound, both directions of the boundary,
// every defective-state case, and the write semantics.
//
// All fixed dates. No wall-clock dependence.
// ─────────────────────────────────────────────────────────────────────────
describe('freshness heartbeat', () => {
  const HB = preflight.ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS;
  const NOW = new Date('2026-08-02T12:00:00.000Z');
  const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

  /** Everything else quiet, so ONLY the heartbeat can force a run. */
  const quietState = (lastSuccessfulFullCycleAt: unknown): unknown => ({
    version: 1,
    snapshot,
    forceRun: false,
    backlogPending: false,
    nextBacklogRunAt: null,
    lastCompletedAt: at(0),
    lastSuccessfulFullCycleAt,
    lastOutcome: 'success',
  });

  beforeEach(() => {
    redisGet.mockReset();
    redisSet.mockReset();
    fetchFromTrestle.mockReset();
    // Reuse the file's existing helper so the probe returns exactly the
    // stored heads — i.e. a genuine "unchanged" verdict. That isolates the
    // heartbeat as the ONLY thing that can force a run in these tests.
    mockSameHeads();
  });

  it('is bounded at one hour and is not environment-configurable', () => {
    expect(HB).toBe(60 * 60);
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/idx/one-cycle-preflight.ts'),
      'utf8',
    ) as string;
    // The bound must be a literal, never read from process.env.
    expect(src).toMatch(/export const ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS = 60 \* 60;/);
    const heartbeatEnv = src.match(/process\.env\.[A-Z_]*HEARTBEAT[A-Z_]*/g) ?? [];
    expect(heartbeatEnv).toEqual([]);
  });

  it.each([
    ['absent',      undefined],
    ['null',        null],
    ['malformed',   'not-a-date'],
    ['empty',       ''],
  ])('forces a cycle when the heartbeat timestamp is %s', async (_label, value) => {
    redisGet.mockResolvedValue(quietState(value));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
  });

  it('forces a cycle when the heartbeat timestamp is in the FUTURE', async () => {
    // Clock skew or a corrupted write must not buy unlimited silence.
    redisGet.mockResolvedValue(quietState(at(-60 * 60 * 1000)));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
    expect(d.reason).toBe('freshness_heartbeat_due');
  });

  it('SKIPS at 59m59s old — everything else unchanged', async () => {
    redisGet.mockResolvedValue(quietState(at(HB * 1000 - 1000)));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(false);
    expect(d.reason).toBe('source_unchanged_no_backlog_due');
  });

  it('RUNS at exactly 60m old (boundary is inclusive)', async () => {
    redisGet.mockResolvedValue(quietState(at(HB * 1000)));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
    expect(d.reason).toBe('freshness_heartbeat_due');
  });

  it('RUNS when older than 60m', async () => {
    redisGet.mockResolvedValue(quietState(at(HB * 1000 + 60_000)));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
    expect(d.reason).toBe('freshness_heartbeat_due');
  });

  it('a SKIPPED poll never refreshes the heartbeat', async () => {
    redisGet.mockResolvedValue(quietState(at(HB * 1000 - 1000)));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(false);
    // The skip path must not write state at all.
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('a successful COMPLETE cycle advances the heartbeat', async () => {
    redisGet.mockResolvedValue(quietState(at(HB * 1000 + 1000)));
    const decision = await preflight.decideOneCyclePreflight(NOW);
    const completion: OneCycleCompletionInput = {
      success: true, complete: true, outcome: 'success',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 1 } },
        { member: 'media-sync', status: 'ok', summary: { backlog_remaining: 0 } },
      ],
    };
    await preflight.finalizeOneCyclePreflight(decision, completion, NOW);
    const written = redisSet.mock.calls.at(-1)?.[1] as { lastSuccessfulFullCycleAt: string };
    expect(written.lastSuccessfulFullCycleAt).toBe(NOW.toISOString());
  });

  it.each([
    ['partial',    { success: true,  complete: false, outcome: 'partial' as const }],
    ['incomplete', { success: false, complete: false, outcome: 'incomplete' as const }],
  ])('a %s cycle does NOT advance the heartbeat — it cannot buy another hour', async (_l, o) => {
    const stale = at(HB * 1000 + 1000);
    redisGet.mockResolvedValue(quietState(stale));
    const decision = await preflight.decideOneCyclePreflight(NOW);
    await preflight.finalizeOneCyclePreflight(decision, {
      ...o,
      members: [
        { member: 'idx-sync', status: 'error', summary: {} },
        { member: 'media-sync', status: 'skipped', summary: {} },
      ],
    }, NOW);
    const written = redisSet.mock.calls.at(-1)?.[1] as {
      lastSuccessfulFullCycleAt: string | null; forceRun: boolean;
    };
    expect(written.lastSuccessfulFullCycleAt).toBe(stale);
    expect(written.forceRun).toBe(true);
  });
});
