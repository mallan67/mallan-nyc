/// <reference types="jest" />
/**
 * NEON WAKE DISCRIMINATOR — does a poll open Neon exactly when Mallan has work?
 *
 * TWO failure directions, both pinned here:
 *   (A) it must FAIL if the preflight wakes Neon when Mallan has nothing to do;
 *   (B) it must FAIL if the preflight SKIPS while Mallan does have something to
 *       do — including the freshness backstop, which is never traded away.
 *
 * THE DEFECT UNDER TEST. `success` (app/api/cron/one-cycle/route.ts) is
 * `complete && every required member 'ok'`. The media member reports 'partial'
 * for `rows_failed > 0 || r2_failed > 0` (lib/idx/media-sync-member.ts).
 * `rows_failed` is a runMediaSync PHASE 1 source->Neon row-write failure that
 * FREEZES the media keyset watermark (it pushes `ok:false` into `processed`,
 * which halts `pickKeysetWatermark`); `r2_failed` is a PHASE 3 R2 MIRROR
 * failure raised strictly AFTER the PHASE 2 cursor checkpoint has committed
 * via `advanceMediaSyncCursor`, so it provably cannot affect source traversal.
 * Yet both collapsed into the same `success:false`, which set `forceRun` AND
 * froze `lastSuccessfulFullCycleAt` — a latch that disables every future skip
 * until a perfectly clean cycle happens, while the R2 work is ALREADY scheduled
 * on the bounded media-backlog cadence. Double-scheduled.
 *
 * PROVENANCE OF THE DEFECT - stated exactly, not overstated. It is proven from
 * the code paths above and from the RED runs of the tests in section (A); it is
 * NOT proven from a production log. An earlier version of this header cited
 * artifacts/.wake-redis-samples.jsonl line 9 (2026-08-14T22:48:05Z:
 * modChanged=false, phoChanged=false, forceRun=true, `forced_retry`) as an
 * instance. That citation is WITHDRAWN: the same record carries
 * `backlogPending=false`, and `mediaBacklog` (one-cycle-preflight.ts, the
 * `backlogPending` derivation) includes `r2_failed > 0` - so r2_failed===0 in
 * that cycle and its forceRun had some other cause, one that this exemption
 * still forces. All 13 consecutive samples in that file show
 * backlogPending=false, so the FREQUENCY of r2_failed>0 in production is
 * UNMEASURED, not "routine". What is proven is that the state is reachable and
 * that, when it occurs, it latched.
 */
import type {
  OneCycleCompletionInput,
  OneCycleExecutionPlan,
  OneCyclePreflightDecision,
  OneCyclePreflightState,
  SourceSnapshot,
} from '@/lib/idx/one-cycle-preflight';

const redisGet = jest.fn();
const redisSet = jest.fn();
const fetchFromTrestle = jest.fn();

jest.mock('@/lib/redis', () => ({
  redis: { get: (...a: unknown[]) => redisGet(...a), set: (...a: unknown[]) => redisSet(...a) },
  default: { get: (...a: unknown[]) => redisGet(...a), set: (...a: unknown[]) => redisSet(...a) },
}));
jest.mock('@/lib/idx/fetch', () => ({
  fetchFromTrestle: (...a: unknown[]) => fetchFromTrestle(...a),
}));

const preflight = require('@/lib/idx/one-cycle-preflight') as typeof import('@/lib/idx/one-cycle-preflight');

const NOW = new Date('2026-08-20T12:00:00.000Z');
const HB_MS = preflight.ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const snapshot: SourceSnapshot = {
  modification: { timestamp: '2026-08-20T11:52:00.000Z', listingKey: 'M-9', populationAtHead: 1 },
  photos: { timestamp: '2026-08-20T11:52:00.000Z', listingKey: 'M-9', populationAtHead: 1 },
  capturedAt: '2026-08-20T11:53:00.000Z',
};

/** Prior state written by a healthy cycle 5 minutes ago. */
const healthyState = (over: Partial<OneCyclePreflightState> = {}): OneCyclePreflightState => ({
  version: 1,
  snapshot,
  forceRun: false,
  backlogPending: false,
  nextBacklogRunAt: null,
  lastCompletedAt: ago(5 * 60_000),
  lastSuccessfulFullCycleAt: ago(5 * 60_000),
  lastOutcome: 'success',
  ...over,
});

/** Both live heads UNCHANGED — the provider did not move. */
function mockUnchangedHeads() {
  fetchFromTrestle.mockImplementation(async (o: { select?: string[] }) => {
    const field = o.select?.[1];
    const head = field === 'ModificationTimestamp' ? snapshot.modification : snapshot.photos;
    return {
      records: [{ ListingKey: head.listingKey, [field as string]: head.timestamp }],
      totalFetched: 1,
      hasMore: false,
      odataCount: head.populationAtHead,
    };
  });
}

/** A head MOVED — Mallan definitely has source work. */
function mockMovedHead(which: 'modification' | 'photos' | 'both') {
  fetchFromTrestle.mockImplementation(async (o: { select?: string[]; filter?: string }) => {
    const field = o.select?.[1] as string;
    const isMod = field === 'ModificationTimestamp';
    const moved = which === 'both' || (which === 'modification') === isMod;
    const base = isMod ? snapshot.modification : snapshot.photos;
    const ts = moved ? '2026-08-20T11:59:00.000Z' : base.timestamp;
    return {
      records: [{ ListingKey: moved ? 'M-10' : base.listingKey, [field]: ts }],
      totalFetched: 1,
      hasMore: false,
      odataCount: 1,
    };
  });
}

const decisionFor = (
  plan: OneCycleExecutionPlan,
  priorState: OneCyclePreflightState | null,
): OneCyclePreflightDecision => ({
  shouldRun: true,
  reason: 'source_changed',
  snapshot,
  snapshotTrusted: true,
  priorState,
  executionPlan: plan,
  headDelta: { modification: true, photos: true },
  planReasons: ['modification_head_moved', 'photos_head_moved'],
});

/**
 * A cycle in which the SOURCE lane is clean and the ONLY imperfection is R2
 * mirroring — the exact shape media-sync.ts:3391-3397 calls `partial`.
 */
const r2OnlyPartial: OneCycleCompletionInput = {
  success: false,
  complete: true,
  outcome: 'partial',
  members: [
    { member: 'idx-sync', status: 'ok', summary: { total_fetched: 6, listings_fetched: 6 } },
    {
      member: 'media-sync',
      status: 'partial',
      summary: { rows_failed: 0, r2_failed: 3, backlog_remaining: 3, time_budget_exhausted: false },
    },
  ],
};

/**
 * THE SAME SHAPE, but the PHASE-3 drain also ran out of wall clock.
 *
 * `time_budget_exhausted` is NOT a source signal. lib/idx/media-sync.ts sets it
 * as `exit_reason === "budget_phase2"`, and `budget_phase2` is assignable ONLY
 * while `exitReason === "completed"` — i.e. it is POSITIVE PROOF that the
 * PHASE-1 source loop consumed its whole batch without breaking out. It says
 * "the R2 backlog drain stopped between chunks", nothing more. Pinned in
 * section (D) below against the real media-sync source.
 *
 * This is also the shape a large, partly-failing R2 backlog produces most
 * often: failed mirror attempts are the slowest units in the drain, so
 * `r2_failed > 0` and `budget_phase2` correlate POSITIVELY. Blocking on it left
 * the fix inert in exactly the scenario it was built for.
 */
const r2OnlyPartialPhase3BudgetCut: OneCycleCompletionInput = {
  success: false,
  complete: true,
  outcome: 'partial',
  members: [
    { member: 'idx-sync', status: 'ok', summary: { total_fetched: 6, listings_fetched: 6 } },
    {
      member: 'media-sync',
      status: 'partial',
      summary: { rows_failed: 0, r2_failed: 3, backlog_remaining: 7, time_budget_exhausted: true },
    },
  ],
};

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
  fetchFromTrestle.mockReset();
  redisSet.mockResolvedValue('OK');
  delete process.env.ONE_CYCLE_BACKLOG_INTERVAL_SECONDS;
});

// ===========================================================================
// (A) MUST NOT WAKE NEON WHEN MALLAN HAS NOTHING TO DO
// ===========================================================================
describe('A. no Mallan work => no Neon wake', () => {
  it('an R2-mirror-only imperfection does not force an immediate retry', () => {
    const f = preflight.deriveOneCycleFollowup(r2OnlyPartial, true, NOW);
    expect(f.forceRun).toBe(false);
  });

  it('the R2 work is NOT dropped — it stays on the bounded backlog cadence', () => {
    const f = preflight.deriveOneCycleFollowup(r2OnlyPartial, true, NOW);
    expect(f.backlogPending).toBe(true);
    expect(f.nextBacklogRunAt).toBe(new Date(NOW.getTime() + 3_600_000).toISOString());
  });

  it('an R2-mirror-only cycle still advances the freshness heartbeat', async () => {
    await preflight.finalizeOneCyclePreflight(
      decisionFor('idx_then_media', healthyState()),
      r2OnlyPartial,
      NOW,
    );
    const written = redisSet.mock.calls.at(-1)?.[1] as OneCyclePreflightState;
    expect(written.lastSuccessfulFullCycleAt).toBe(NOW.toISOString());
  });

  it('an R2-only imperfection whose PHASE-3 DRAIN hit its time budget does not force a retry', () => {
    const f = preflight.deriveOneCycleFollowup(r2OnlyPartialPhase3BudgetCut, true, NOW);
    expect(f.forceRun).toBe(false);
  });

  it('a PHASE-3 budget cut still keeps the R2 work on the bounded backlog cadence', () => {
    const f = preflight.deriveOneCycleFollowup(r2OnlyPartialPhase3BudgetCut, true, NOW);
    expect(f.backlogPending).toBe(true);
    expect(f.nextBacklogRunAt).toBe(new Date(NOW.getTime() + 3_600_000).toISOString());
  });

  it('a PHASE-3 budget cut still advances the freshness heartbeat', async () => {
    await preflight.finalizeOneCyclePreflight(
      decisionFor('idx_then_media', healthyState()),
      r2OnlyPartialPhase3BudgetCut,
      NOW,
    );
    const written = redisSet.mock.calls.at(-1)?.[1] as OneCyclePreflightState;
    expect(written.lastSuccessfulFullCycleAt).toBe(NOW.toISOString());
  });

  it('END TO END: after an R2-only PHASE-3 budget cut, an unchanged-head poll SKIPS Neon', async () => {
    await preflight.finalizeOneCyclePreflight(
      decisionFor('idx_then_media', healthyState()),
      r2OnlyPartialPhase3BudgetCut,
      NOW,
    );
    const persisted = redisSet.mock.calls.at(-1)?.[1] as OneCyclePreflightState;
    // The latch is released in the PERSISTED state, which is what the next poll
    // reads. Asserting this as well as the decision distinguishes "the machine
    // is no longer latched" from "the decision happened to come out this way".
    expect(persisted.forceRun).toBe(false);
    expect(persisted.backlogPending).toBe(true); // the R2 work is still owed

    redisGet.mockResolvedValue(persisted);
    mockUnchangedHeads();
    // 10 minutes on: heads unchanged, backlog not yet due, heartbeat not yet
    // expired. Pre-fix this poll returned `forced_retry` and woke Neon.
    const d = await preflight.decideOneCyclePreflight(new Date(NOW.getTime() + 600_000));
    expect(d.reason).toBe('source_unchanged_no_backlog_due');
    expect(d.shouldRun).toBe(false);
    expect(d.executionPlan).toBe('skip');
  });

  it('the deferred R2 work is drained by the hourly authoritative sweep, never orphaned', async () => {
    await preflight.finalizeOneCyclePreflight(
      decisionFor('idx_then_media', healthyState()),
      r2OnlyPartialPhase3BudgetCut,
      NOW,
    );
    const persisted = redisSet.mock.calls.at(-1)?.[1] as OneCyclePreflightState;
    // Heartbeat and backlog deadline are BOTH written at NOW + 3600 s, and the
    // heartbeat is evaluated first — so the backlog branch is never the reason
    // from this state. That is not a hole: `full_safety` requires BOTH members
    // (requiredMembersForPlan), so the sweep runs media and drains the backlog.
    expect(persisted.nextBacklogRunAt).toBe(new Date(NOW.getTime() + 3_600_000).toISOString());
    redisGet.mockResolvedValue(persisted);
    mockUnchangedHeads();
    const d = await preflight.decideOneCyclePreflight(new Date(NOW.getTime() + 3_600_000));
    expect(d.shouldRun).toBe(true);
    expect(d.reason).toBe('freshness_heartbeat_due');
    expect(preflight.requiredMembersForPlan(d.executionPlan)).toContain('media-sync');
  });

  it('END TO END: after an R2-only partial, an unchanged-head poll SKIPS Neon', async () => {
    // 1. finalize the R2-only cycle exactly as the route does
    await preflight.finalizeOneCyclePreflight(
      decisionFor('idx_then_media', healthyState()),
      r2OnlyPartial,
      NOW,
    );
    const persisted = redisSet.mock.calls.at(-1)?.[1];
    // 2. feed that state back to the next poll, 10 minutes later, heads unchanged
    redisGet.mockResolvedValue(persisted);
    mockUnchangedHeads();
    const next = new Date(NOW.getTime() + 600_000);
    const d = await preflight.decideOneCyclePreflight(next);
    expect(d.reason).toBe('source_unchanged_no_backlog_due');
    expect(d.shouldRun).toBe(false);
    expect(d.executionPlan).toBe('skip');
  });
});

// ===========================================================================
// (B) MUST NOT SKIP WHEN MALLAN DOES HAVE WORK
// ===========================================================================
describe('B. Mallan work present => Neon must be woken', () => {
  const cases: Array<[string, OneCycleCompletionInput]> = [
    ['media Phase-1 row writes failed (source cursor frozen)', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { rows_failed: 4, r2_failed: 0, time_budget_exhausted: false } },
      ],
    }],
    ['media row AND R2 failures together', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { rows_failed: 1, r2_failed: 5, time_budget_exhausted: false } },
      ],
    }],
    // A PHASE-3 budget cut is NOT on this list any more: it is not a source
    // condition (see the fixture comment and section D). What must still force
    // a retry is a SOURCE failure that happens to coincide with one.
    ['media Phase-1 row writes failed AND the Phase-3 drain hit its budget', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { rows_failed: 2, r2_failed: 2, time_budget_exhausted: true } },
      ],
    }],
    ['a Phase-3 budget cut with NO r2_failed to explain the partial', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { rows_failed: 0, r2_failed: 0, time_budget_exhausted: true } },
      ],
    }],
    ['a Phase-3 budget cut with rows_failed ABSENT — absence is not proof of zero', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { r2_failed: 3, time_budget_exhausted: true } },
      ],
    }],
    ['the IDX listing lane was partial (errors > 0)', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'partial', summary: { total_fetched: 9 } },
        { member: 'media-sync', status: 'ok', summary: { r2_failed: 0, rows_failed: 0 } },
      ],
    }],
    ['a member timed out', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'timed_out', summary: { rows_failed: 0, r2_failed: 0 } },
      ],
    }],
    ['a member failed outright', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'failed', summary: {} },
        { member: 'media-sync', status: 'budget_skipped', summary: {} },
      ],
    }],
    ['a member threw', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'member_error', summary: {} },
      ],
    }],
    ['the cycle was incomplete', {
      success: false, complete: false, outcome: 'incomplete',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'budget_skipped', summary: {} },
      ],
    }],
    ['media partial with NO r2_failed to explain it', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { rows_failed: 0, r2_failed: 0 } },
      ],
    }],
    ['media partial with rows_failed ABSENT — absence is not proof of zero', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'partial', summary: { r2_failed: 3 } },
      ],
    }],
    ['success:false with nothing in the member ledger to explain it', {
      success: false, complete: true, outcome: 'partial',
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 2 } },
        { member: 'media-sync', status: 'ok', summary: { rows_failed: 0, r2_failed: 0 } },
      ],
    }],
  ];

  it.each(cases)('forces a retry when %s', (_label, completion) => {
    expect(preflight.deriveOneCycleFollowup(completion, true, NOW).forceRun).toBe(true);
  });

  it.each(cases)('does NOT advance the freshness heartbeat when %s', async (_label, completion) => {
    const prior = healthyState({ lastSuccessfulFullCycleAt: ago(120_000) });
    await preflight.finalizeOneCyclePreflight(decisionFor('idx_then_media', prior), completion, NOW);
    const written = redisSet.mock.calls.at(-1)?.[1] as OneCyclePreflightState;
    expect(written.lastSuccessfulFullCycleAt).toBe(ago(120_000));
  });

  it('an untrusted snapshot still forces a retry even on a clean R2-only cycle', () => {
    expect(preflight.deriveOneCycleFollowup(r2OnlyPartial, false, NOW).forceRun).toBe(true);
  });

  it('a full 500-row listing batch still forces a retry on a clean R2-only cycle', () => {
    const capped: OneCycleCompletionInput = {
      ...r2OnlyPartial,
      members: [
        { member: 'idx-sync', status: 'ok', summary: { total_fetched: 500, listings_fetched: 500 } },
        r2OnlyPartial.members[1],
      ],
    };
    expect(preflight.deriveOneCycleFollowup(capped, true, NOW).forceRun).toBe(true);
  });

  it.each([
    ['modification', 'idx_only'],
    ['photos', 'media_only'],
    ['both', 'idx_then_media'],
  ] as const)('runs when the %s head moved', async (which, plan) => {
    redisGet.mockResolvedValue(healthyState());
    mockMovedHead(which);
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
    expect(d.executionPlan).toBe(plan);
  });

  it('runs when the media backlog reaches its bounded due time', async () => {
    redisGet.mockResolvedValue(healthyState({
      backlogPending: true,
      nextBacklogRunAt: ago(1_000),
    }));
    mockUnchangedHeads();
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
    expect(d.reason).toBe('backlog_due');
    expect(d.executionPlan).toBe('media_only');
  });
});

// ===========================================================================
// (C) FRESHNESS IS NOT TRADED AWAY
// ===========================================================================
describe('C. required Cotality freshness is preserved', () => {
  it('the heartbeat bound is unchanged at one hour and is not env-overridable', () => {
    expect(preflight.ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS).toBe(3600);
    process.env.ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS = '86400';
    // `jest.resetModules()` is LOAD-BEARING. Without it the re-`require` below
    // returns the module instance already in the registry, whose constant was
    // evaluated before the env var existed — so the assertion would hold no
    // matter what the module does, and could never fail. With it, the module is
    // re-evaluated WITH the env var set, so an env-reading constant goes red.
    jest.resetModules();
    try {
      const reread = require('@/lib/idx/one-cycle-preflight') as typeof import('@/lib/idx/one-cycle-preflight');
      expect(reread.ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS).toBe(3600);
    } finally {
      delete process.env.ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS;
      jest.resetModules();
    }
  });

  it('an R2-only-partial state still forces an authoritative cycle at the hour', async () => {
    redisGet.mockResolvedValue(healthyState({
      lastSuccessfulFullCycleAt: ago(HB_MS),
      backlogPending: true,
      nextBacklogRunAt: new Date(NOW.getTime() + 600_000).toISOString(),
    }));
    mockUnchangedHeads();
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.reason).toBe('freshness_heartbeat_due');
    expect(d.executionPlan).toBe('full_safety');
  });

  it('one second inside the bound still skips; exactly at it, it runs', async () => {
    mockUnchangedHeads();
    redisGet.mockResolvedValue(healthyState({ lastSuccessfulFullCycleAt: ago(HB_MS - 1000) }));
    expect((await preflight.decideOneCyclePreflight(NOW)).shouldRun).toBe(false);
    redisGet.mockResolvedValue(healthyState({ lastSuccessfulFullCycleAt: ago(HB_MS) }));
    expect((await preflight.decideOneCyclePreflight(NOW)).shouldRun).toBe(true);
  });

  it('a PARTIAL plan never advances the heartbeat, even when traversal is sound', async () => {
    const prior = healthyState({ lastSuccessfulFullCycleAt: ago(120_000) });
    const mediaOnly: OneCycleCompletionInput = {
      success: true, complete: true, outcome: 'success',
      members: [{ member: 'media-sync', status: 'ok', summary: { rows_failed: 0, r2_failed: 0, backlog_remaining: 0 } }],
    };
    await preflight.finalizeOneCyclePreflight(decisionFor('media_only', prior), mediaOnly, NOW);
    const written = redisSet.mock.calls.at(-1)?.[1] as OneCyclePreflightState;
    expect(written.lastSuccessfulFullCycleAt).toBe(ago(120_000));
  });

  it('every uncertainty still fails open to the complete machine', async () => {
    redisGet.mockResolvedValue(healthyState());
    fetchFromTrestle.mockRejectedValue(new Error('provider unreachable'));
    const d = await preflight.decideOneCyclePreflight(NOW);
    expect(d.shouldRun).toBe(true);
    expect(d.reason).toBe('source_probe_failed');
    expect(d.executionPlan).toBe('full_safety');
  });
});

// ===========================================================================
// (D) CROSS-MODULE CONTRACT - what the exemption is allowed to assume
//
// `cycleTraversalSound` reasons about media-sync counters it does not own. The
// previous version of this fix mis-read one of them: it treated
// `time_budget_exhausted` as "the SOURCE traversal was cut short", blocked the
// exemption on it, and thereby left the latch in place for the single most
// likely shape of the problem it was written to fix.
//
// These pins make that class of error fail LOUD instead of silently reversing
// the predicate. They are static assertions about a DEFINITION - not a
// behavioural claim; the behaviour of `exit_reason` itself is proven in
// lib/idx/__tests__/media-sync-orchestration.test.ts ("Phase 1 stops when
// remaining time < phase1ReserveMs and reports exit_reason='budget_phase1'" and
// "Phase 3 stops between CHUNKS ... exit_reason='budget_phase2'").
// ===========================================================================
describe('D. media-sync counter contract the exemption depends on', () => {
  const read = (rel: string) =>
    require('fs').readFileSync(require('path').resolve(__dirname, '..', '..', rel), 'utf8') as string;

  it('time_budget_exhausted has exactly ONE computed definition, and it is exit_reason === "budget_phase2"', () => {
    const src = read('lib/idx/media-sync.ts');
    const rhs = (src.match(/time_budget_exhausted:[^,\r\n]+/g) ?? [])
      .map((d) => d.trim().replace(/^time_budget_exhausted:\s*/, ''));
    // Three sites, and only one of them computes anything:
    //   `boolean;`                       - the RunMediaSyncResult field declaration
    //   `false`                          - the source_error EARLY RETURN (so a
    //                                      source failure can never masquerade
    //                                      as a Phase-3 budget cut)
    //   `exitReason === "budget_phase2"` - the ONLY computed value
    expect(rhs.sort()).toEqual([
      'boolean;',
      'exitReason === "budget_phase2"',
      'false',
    ]);
  });

  it('budget_phase2 is reachable ONLY from exitReason "completed" - so it PROVES Phase 1 finished', () => {
    const lines = read('lib/idx/media-sync.ts').split(/\r?\n/);
    const at = lines.findIndex((l) => /^\s*exitReason = "budget_phase2";\s*$/.test(l));
    expect(at).toBeGreaterThan(0);
    // The immediately enclosing condition must require exitReason === "completed",
    // i.e. Phase 1 did NOT break out early with "budget_phase1".
    expect(lines[at - 1]).toContain('exitReason === "completed"');
  });

  it('exitReason has exactly two mutation sites: budget_phase1 (Phase 1) and budget_phase2 (Phase 3)', () => {
    const src = read('lib/idx/media-sync.ts');
    const muts = src.match(/^\s*exitReason = "[a-z0-9_]+";/gm) ?? [];
    expect(muts.map((m) => m.trim()).sort()).toEqual([
      'exitReason = "budget_phase1";',
      'exitReason = "budget_phase2";',
    ]);
  });

  it('RECORDED GAP: the real source cut (budget_phase1) reaches the preflight through NO counter', () => {
    // `exit_reason` matches none of the One Cycle summary prefixes, so a
    // Phase-1 budget cut is invisible here. That is DELIBERATE and symmetric
    // with the pre-existing baseline: budget_phase1 with clean counters yields
    // media status "ok" -> success:true, which already advances the heartbeat
    // and clears forceRun. Guarding it only inside the R2 exemption would make
    // the r2_failed>0 path stricter than the r2_failed===0 path - reinstating
    // the exact asymmetry this predicate exists to remove.
    //
    // If this test ever fails because `exit_reason` became observable, that is
    // the moment to decide the question deliberately for BOTH paths.
    const route = read('app/api/cron/one-cycle/route.ts');
    const block = route.match(/const SUMMARY_KEY_PREFIXES = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const prefixes = (block![1].match(/'([^']+)'/g) ?? []).map((q) => q.slice(1, -1));
    expect(prefixes.length).toBeGreaterThan(0);
    expect(prefixes.some((p) => 'exit_reason'.startsWith(p))).toBe(false);
  });

  it('RECORDED DEAD READ: the `failures` alias is filtered out before the preflight sees it', () => {
    // `mediaBacklog` reads `failures`, an exact alias of `r2_failed`. The
    // allowlist carries 'failed', and 'failures'.startsWith('failed') is false,
    // so the key never arrives and the term is inert. The decision is identical
    // either way (r2_failed IS carried, by the 'r2_' prefix, on the next line).
    // Pinned so the deadness is a FACT rather than a trap: if someone widens the
    // allowlist this goes red, and whoever does it learns the read comes alive.
    const route = read('app/api/cron/one-cycle/route.ts');
    const block = route.match(/const SUMMARY_KEY_PREFIXES = \[([\s\S]*?)\];/);
    const prefixes = (block![1].match(/'([^']+)'/g) ?? []).map((q) => q.slice(1, -1));
    expect(prefixes.some((p) => 'failures'.startsWith(p))).toBe(false);
    expect(prefixes.some((p) => 'r2_failed'.startsWith(p))).toBe(true);
  });
});
