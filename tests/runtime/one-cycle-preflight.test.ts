/// <reference types="jest" />

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

const NOW = new Date('2026-08-02T07:00:00.000Z');
const snapshot = {
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

const state = {
  version: 1,
  snapshot,
  forceRun: false,
  backlogPending: false,
  nextBacklogRunAt: null,
  lastCompletedAt: '2026-08-02T06:56:30.000Z',
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
    const decision = await preflight.decideOneCyclePreflight(NOW);
    expect(decision).toMatchObject({
      shouldRun: false,
      reason: 'source_unchanged_no_backlog_due',
      snapshotTrusted: true,
    });
  });

  it('fails open when the source probe fails', async () => {
    redisGet.mockResolvedValue(state);
    fetchFromTrestle.mockRejectedValue(new Error('source unavailable'));
    const decision = await preflight.decideOneCyclePreflight(NOW);
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
    const decision = await preflight.decideOneCyclePreflight(NOW);
    expect(decision).toMatchObject({ shouldRun: true, reason: 'backlog_due' });
  });
});

describe('completion follow-up', () => {
  const completed = (idxSummary: Record<string, unknown>, mediaSummary: Record<string, unknown> = {}) => ({
    success: true,
    complete: true,
    outcome: 'success' as const,
    members: [
      { member: 'idx-sync', status: 'ok', summary: idxSummary },
      { member: 'media-sync', status: 'ok', summary: mediaSummary },
    ],
  });

  it('forces an immediate retry when the 500-row listing cap is filled', () => {
    expect(preflight.deriveOneCycleFollowup(completed({ total_fetched: 500 }), true, NOW).forceRun).toBe(true);
    expect(preflight.deriveOneCycleFollowup(completed({ total_fetched: 499 }), true, NOW).forceRun).toBe(false);
  });

  it('forces retry on incomplete, failed, or untrusted cycles', () => {
    expect(preflight.deriveOneCycleFollowup({ ...completed({}), success: false, outcome: 'partial' }, true, NOW).forceRun).toBe(true);
    expect(preflight.deriveOneCycleFollowup(completed({}), false, NOW).forceRun).toBe(true);
  });

  it('defers a remaining media backlog without weakening 10-minute source checks', () => {
    const next = preflight.deriveOneCycleFollowup(
      completed({}, { backlog_remaining: 25 }),
      true,
      NOW,
    );
    expect(next.forceRun).toBe(false);
    expect(next.backlogPending).toBe(true);
    expect(next.nextBacklogRunAt).toBe('2026-08-02T08:00:00.000Z');
  });

  it('persists only after a finalizable completed cycle', async () => {
    redisSet.mockResolvedValue('OK');
    await preflight.finalizeOneCyclePreflight(
      { shouldRun: true, reason: 'source_changed', snapshot, snapshotTrusted: true, priorState: state },
      completed({ total_fetched: 0 }),
      NOW,
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
