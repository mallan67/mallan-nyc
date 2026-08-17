/// <reference types="jest" />
/**
 * TASK 1 — One Cycle must emit a real EXECUTION PLAN, not a boolean wake.
 *
 * The preflight already probes two Cotality Property heads separately:
 *   - ModificationTimestamp  — the listing record changed
 *   - PhotosChangeTimestamp  — the photo set changed
 *
 * `sourceSnapshotChanged()` collapsed both into one boolean and then launched
 * the ENTIRE Neon-backed machine (idx-sync AND media-sync) for either signal.
 *
 * The member mapping is authorized by the canonical compliance index, not by
 * inference from field naming:
 *   docs/compliance/COMPLIANCE-CANONICAL-INDEX.md:118 (§8 Fail-closed row)
 *   "Two-tier timestamp sync: Property.PhotosChangeTimestamp (high-level
 *    trigger) -> Media.ModificationTimestamp (per-row)."
 * PhotosChangeTimestamp is therefore the photo/media trigger, and
 * ModificationTimestamp is the listing-record trigger.
 *
 * Residual risk is bounded by the existing hourly freshness heartbeat: a media
 * change that somehow does not move PhotosChangeTimestamp is still swept by the
 * next `full_safety` cycle within ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS.
 *
 * Every uncertainty (no Redis, unreadable state, failed source probe, forced
 * retry) must still fail OPEN to the full machine.
 */
import type {
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

const NOW = new Date('2026-08-02T07:00:00.000Z');

const MOD_HEAD = { timestamp: '2026-08-02T06:55:00.000Z', listingKey: 'M-2', populationAtHead: 2 };
const PHOTO_HEAD = { timestamp: '2026-08-02T06:50:00.000Z', listingKey: 'P-1', populationAtHead: 1 };

const snapshot: SourceSnapshot = {
  modification: MOD_HEAD,
  photos: PHOTO_HEAD,
  capturedAt: '2026-08-02T06:56:00.000Z',
};

/** Healthy prior state: nothing forced, no backlog, heartbeat fresh. */
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

type Head = { timestamp: string; listingKey: string; populationAtHead: number };

/**
 * Drive both head probes independently. queryHead() may issue a second
 * `eq`-filtered request when a head moves; returning the same shape for both
 * calls satisfies either path.
 */
function mockHeads(mod: Head, photo: Head) {
  fetchFromTrestle.mockImplementation(async (options: { select?: string[] }) => {
    const field = options.select?.[1];
    const head = field === 'ModificationTimestamp' ? mod : photo;
    return {
      records: [{ ListingKey: head.listingKey, [field as string]: head.timestamp }],
      totalFetched: 1,
      hasMore: false,
      odataCount: head.populationAtHead,
    };
  });
}

const advanced = (head: Head, iso: string): Head => ({ ...head, timestamp: iso });

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  fetchFromTrestle.mockReset();
  delete process.env.ONE_CYCLE_BACKLOG_INTERVAL_SECONDS;
});

describe('One Cycle execution plan — source-change matrix', () => {
  it('runs IDX only when the listing head moved and the photo head did not', async () => {
    redisGet.mockResolvedValue(state);
    mockHeads(advanced(MOD_HEAD, '2026-08-02T06:59:00.000Z'), PHOTO_HEAD);

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('idx_only');
    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe('source_changed');
  });

  it('runs Media only when the photo head moved and the listing head did not', async () => {
    redisGet.mockResolvedValue(state);
    mockHeads(MOD_HEAD, advanced(PHOTO_HEAD, '2026-08-02T06:59:00.000Z'));

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('media_only');
    expect(decision.shouldRun).toBe(true);
  });

  it('runs IDX then Media when both heads moved', async () => {
    redisGet.mockResolvedValue(state);
    mockHeads(
      advanced(MOD_HEAD, '2026-08-02T06:59:00.000Z'),
      advanced(PHOTO_HEAD, '2026-08-02T06:59:30.000Z'),
    );

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('idx_then_media');
  });

  it('detects a same-timestamp population change on the photo head alone', async () => {
    redisGet.mockResolvedValue(state);
    mockHeads(MOD_HEAD, { ...PHOTO_HEAD, populationAtHead: 5 });

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('media_only');
  });

  it('skips Neon entirely when neither head moved and nothing else is due', async () => {
    redisGet.mockResolvedValue(state);
    mockHeads(MOD_HEAD, PHOTO_HEAD);

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('skip');
    expect(decision.shouldRun).toBe(false);
    expect(decision.reason).toBe('source_unchanged_no_backlog_due');
  });

  it('drains the media backlog without waking IDX', async () => {
    redisGet.mockResolvedValue({
      ...state,
      backlogPending: true,
      nextBacklogRunAt: '2026-08-02T06:00:00.000Z',
    });
    mockHeads(MOD_HEAD, PHOTO_HEAD);

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('media_only');
    expect(decision.reason).toBe('backlog_due');
  });
});

describe('One Cycle execution plan — fail-open safety', () => {
  it('runs the full machine when the freshness heartbeat expires', async () => {
    redisGet.mockResolvedValue({
      ...state,
      lastSuccessfulFullCycleAt: '2026-08-02T05:00:00.000Z',
    });
    mockHeads(MOD_HEAD, PHOTO_HEAD);

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('full_safety');
    expect(decision.reason).toBe('freshness_heartbeat_due');
  });

  it('runs the full machine on a forced retry', async () => {
    redisGet.mockResolvedValue({ ...state, forceRun: true });
    mockHeads(MOD_HEAD, PHOTO_HEAD);

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('full_safety');
    expect(decision.reason).toBe('forced_retry');
  });

  it('runs the full machine when external state is missing or unreadable', async () => {
    redisGet.mockResolvedValue(null);
    mockHeads(MOD_HEAD, PHOTO_HEAD);

    const missing = await preflight.decideOneCyclePreflight(NOW);
    expect(missing.executionPlan).toBe('full_safety');
    expect(missing.reason).toBe('state_missing_or_invalid');

    redisGet.mockRejectedValue(new Error('redis down'));
    const failed = await preflight.decideOneCyclePreflight(NOW);
    expect(failed.executionPlan).toBe('full_safety');
    expect(failed.reason).toBe('redis_read_failed');
  });

  it('runs the full machine when the Cotality source probe fails', async () => {
    redisGet.mockResolvedValue(state);
    fetchFromTrestle.mockRejectedValue(new Error('cotality unreachable'));

    const decision = await preflight.decideOneCyclePreflight(NOW);

    expect(decision.executionPlan).toBe('full_safety');
    expect(decision.reason).toBe('source_probe_failed');
    expect(decision.snapshotTrusted).toBe(false);
  });
});

describe('requiredMembersForPlan — completion must follow the plan, not a constant', () => {
  it('requires only the members the plan actually selected', () => {
    expect(preflight.requiredMembersForPlan('skip')).toEqual([]);
    expect(preflight.requiredMembersForPlan('idx_only')).toEqual(['idx-sync']);
    expect(preflight.requiredMembersForPlan('media_only')).toEqual(['media-sync']);
  });

  it('keeps IDX strictly before Media whenever both are selected', () => {
    expect(preflight.requiredMembersForPlan('idx_then_media')).toEqual(['idx-sync', 'media-sync']);
    expect(preflight.requiredMembersForPlan('full_safety')).toEqual(['idx-sync', 'media-sync']);
  });

  it('does not mark a deliberate media-only cycle incomplete', () => {
    // The trap this guards: a constant required-member list makes an
    // intentionally IDX-free cycle look incomplete, which sets forceRun and
    // permanently prevents any future skip.
    const followup = preflight.deriveOneCycleFollowup(
      {
        success: true,
        complete: true,
        outcome: 'success',
        members: [{ member: 'media-sync', status: 'ok', summary: {} }],
      },
      true,
      NOW,
    );

    expect(followup.forceRun).toBe(false);
  });
});
