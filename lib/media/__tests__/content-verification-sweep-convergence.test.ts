/**
 * D3-fix — SWEEP TERMINATION, SCHEDULING AND CONVERGENCE.
 *
 * ── WHAT THE PREVIOUS REVISION GOT WRONG, AND HOW IT WAS PROVEN ─────────────────────────
 * Two defects were reproduced by driving the SHIPPED exported functions in a full-loop
 * simulation (`buildContentVerificationWhere` -> window -> `advanceSweepState`), NOT by
 * reading the code:
 *
 * DEFECT 1 — THE COMPLETION SIGNAL WAS A DUE-NESS SIGNAL.
 *   `sweepComplete = selected < cap && processedKeys.length === selected`, where `selected`
 *   was the number of rows DUE AT THIS INSTANT beyond the cursor. That equals "the key range
 *   is exhausted" ONLY during the cold-start pass, when every row is `content_check_state IS
 *   NULL`. From pass two the rows carry staggered clocks, so a short page means "nothing more
 *   is due YET" — and the code turned that into `cursor := null` plus a full interval of idle.
 *   Observed (universe 1207, cap 60, cadence 10-60min, 6 intervals, budget breaks on):
 *       t=  0.579d SWEEP COMPLETE at key 001199 of 001206     <- honest exhaustion
 *       t=244.019d SWEEP COMPLETE at key 000029 of 001206     <- 30 of 1207 rows visited
 *       t=488.473d SWEEP COMPLETE at key 001199 of 001206
 *       t=732.528d SWEEP COMPLETE at key 001169 of 001206
 *       checks-per-row: {4:487, 5:660, 6:60}   (6 required for EVERY row)
 *       worst observed gap between checks: 488.02d against a 244d interval  -> EXCEEDS
 *
 * DEFECT 2 — TERMINAL STALL, WITH THE IDLE GATE DEFEATED AND NO WATCHDOG.
 *   When a cycle returned exactly `cap` rows and nothing beyond the cursor later became due,
 *   `sweepComplete` was false so the cursor pinned; every later cycle selected 0 rows, and
 *   `advanceSweepState` returned early on `processedKeys.length === 0`, so the cursor never
 *   reset and `nextSweepEligibleAt` stayed null — while `shouldRunVerificationCycle` returned
 *   true forever because `cursor !== null`. Observed at universe 1200 (= 20 * cap), 5 intervals:
 *       cycles=50260 queries=50260 emptyQueries=50240 sweepCompletions=0
 *       checks-per-row: {1:1200}      cursor pinned at 001199, nextEligible null
 *       worst observed gap: 1220.00d (the whole horizon) -> EXCEEDS
 *   The emitted telemetry could not tell that state from a healthy idle one.
 *
 * ── WHAT THIS SUITE PROVES ──────────────────────────────────────────────────────────────
 * The harness below is a faithful in-memory mirror of `runMediaSync` Phase 3.5: it calls the
 * SAME exported functions in the SAME order the cron does, over several derived intervals of
 * simulated wall clock. The convergence assertion is not "most rows were checked enough
 * times" but the strongest available statement: THE WORST GAP BETWEEN CONSECUTIVE CHECKS,
 * TAKEN OVER EVERY ROW, IS AT MOST THE DERIVED INTERVAL — including at production scale, at
 * the guaranteed floor cadence, and across an adversarial cadence swing between passes.
 */

import {
  buildContentVerificationWhere,
  shouldRunVerificationCycle,
  sweepStartFor,
  advanceSweepState,
  describeSweepHealth,
  emptySweepState,
  parseSweepState,
  serializeSweepState,
  isDueInSweep,
  maxVerificationSweepDurationMs,
  verificationSweepGapMs,
  verificationCapacityShortfallMs,
  verificationSweepStallAfterMs,
  VERIFICATION_SWEEP_STALL_CYCLES,
  VERIFICATION_UNIVERSE_MEASURED,
  VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
  VERIFICATION_UTILIZATION_TARGET,
  MAX_VERIFICATION_ROWS_PER_CYCLE,
  NOT_APPLIED_INDEX_DDL,
  type VerifiableRow,
  type VerificationIntervals,
  type VerificationSweepState,
} from '../content-verification';
import {
  CONTENT_VERIFICATION_INTERVAL_MS,
  CONTENT_VERIFICATION_RETRY_MS,
  CONTENT_VERIFICATION_MAX_SWEEP_MS,
  CONTENT_VERIFICATION_SWEEP_GAP_MS,
  CONTENT_VERIFICATION_CAPACITY_SHORTFALL_MS,
} from '@/lib/idx/media-sync';

const DAY = 86_400_000;
const MIN = 60_000;
const CAP = MAX_VERIFICATION_ROWS_PER_CYCLE;
const INTERVALS: VerificationIntervals = {
  verificationIntervalMs: CONTENT_VERIFICATION_INTERVAL_MS,
  retryIntervalMs: CONTENT_VERIFICATION_RETRY_MS,
};
const NOW = new Date('2026-08-20T12:00:00.000Z');

// ─────────────────────────────────────────────────────────────────────────────────────────
// A small, faithful interpreter for the Prisma `where` shapes this module emits. The window
// is applied through THIS, not through a hand-written key comparison, so a change to the
// selector that broke the range would break the simulation too.
// ─────────────────────────────────────────────────────────────────────────────────────────
function matchWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') { if (!(v as Record<string, unknown>[]).some((w) => matchWhere(row, w))) return false; continue; }
    if (k === 'AND') { if (!(v as Record<string, unknown>[]).every((w) => matchWhere(row, w))) return false; continue; }
    if (k === 'NOT') { if (matchWhere(row, v as Record<string, unknown>)) return false; continue; }
    const actual = row[k];
    if (v === null) { if (actual !== null && actual !== undefined) return false; continue; }
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      for (const [op, arg] of Object.entries(v as Record<string, unknown>)) {
        if (op === 'not') {
          if (arg === null) { if (actual === null || actual === undefined) return false; }
          else if (actual === arg) return false;
        } else if (op === 'gt') {
          if (!(actual !== null && actual !== undefined && (actual as string) > (arg as string))) return false;
        } else if (op === 'lt') {
          if (!(actual !== null && actual !== undefined && (actual as string) < (arg as string))) return false;
        } else if (op === 'startsWith') {
          if (typeof actual !== 'string' || !actual.startsWith(String(arg))) return false;
        } else {
          throw new Error(`matchWhere: unhandled operator ${op}`);
        }
      }
      continue;
    }
    if (actual !== v) return false;
  }
  return true;
}

/** Deterministic PRNG — a flaky convergence proof would be worthless. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimOptions {
  universe: number;
  /** Extra Mallan-local keys appended after the numeric ones (they sort last). */
  crmRows?: number;
  horizonMs: number;
  /** Cycle spacing, uniform in [minGapMs, maxGapMs]. */
  minGapMs: number;
  maxGapMs: number;
  /** Alternate between the two cadences whenever a sweep completes (the adversarial case). */
  swingCadence?: boolean;
  /** Emulate the phase-2 reserve breaking the row loop. */
  budgetBreakEvery?: number;
  seed?: number;
}

interface SimResult {
  cycles: number;
  queries: number;
  emptyWindows: number;
  completions: number;
  checksPerRow: number[];
  /** Worst gap, over EVERY row, between consecutive checks (horizon start/end included). */
  worstGapMs: number;
  worstGapKey: string;
  minChecks: number;
  maxChecks: number;
  providerCalls: number;
  crmProviderCalls: number;
  finalState: VerificationSweepState;
  everStalled: boolean;
}

/**
 * A faithful mirror of `runMediaSync` Phase 3.5:
 *   shouldRunVerificationCycle -> buildContentVerificationWhere(cursor) -> take(cap)
 *   -> per row: isDueInSweep ? verify : decline, both EXAMINED -> advanceSweepState.
 */
function simulateSweepLoop(o: SimOptions): SimResult {
  const rnd = mulberry32(o.seed ?? 1);
  const n = o.universe;
  const crm = o.crmRows ?? 0;
  const width = Math.max(6, String(n - 1).length);
  const keyOf = (i: number) => String(i).padStart(width, '0');
  // Ordered key space: numeric keys first, then the `crm:` namespace (which sorts after them).
  const crmKeyOf = (i: number) => `crm:SL-000${i}/17798984342${i}`;
  const total = n + crm;
  const lastCheck = new Float64Array(total).fill(Number.NaN);
  const checkCount = new Int32Array(total);
  const worstGap = new Float64Array(total);
  const stateByIdx = new Uint8Array(total); // 0 NULL, 1 VERIFIED

  const T0 = Date.UTC(2026, 7, 20);
  let t = T0;
  let state: VerificationSweepState = emptySweepState();
  let cycles = 0, queries = 0, emptyWindows = 0, completions = 0;
  let providerCalls = 0, crmProviderCalls = 0, everStalled = false;
  let fast = false;

  const materialize = (idx: number): VerifiableRow & Record<string, unknown> => ({
    media_key: idx < n ? keyOf(idx) : crmKeyOf(idx - n),
    listing_id: 'RLS20012345',
    status: 'active',
    r2_key: `photos/${idx}.jpg`,
    media_url_original: 'https://api.cotality.com/trestle/Media/x',
    content_check_at: Number.isNaN(lastCheck[idx]) ? null : new Date(lastCheck[idx]),
    content_check_state: stateByIdx[idx] === 1 ? 'VERIFIED' : null,
  });

  /** Index of the first key strictly greater than `cursor`, in the ordered key space. */
  const firstAfter = (cursor: string | null): number => {
    if (cursor === null) return 0;
    if (cursor.startsWith('crm:')) {
      let lo = n, hi = total;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (crmKeyOf(mid - n) > cursor) hi = mid; else lo = mid + 1; }
      return lo;
    }
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (keyOf(mid) > cursor) hi = mid; else lo = mid + 1; }
    return lo;
  };

  while (t - T0 < o.horizonMs) {
    cycles++;
    const now = new Date(t);
    const health = describeSweepHealth(state, now);
    if (health.stalled) everStalled = true;

    const queried = shouldRunVerificationCycle(state, now);
    const sweepStartedAt = sweepStartFor(state, now);
    const where = buildContentVerificationWhere(state.cursor);
    const window: number[] = [];
    if (queried) {
      queries++;
      for (let i = firstAfter(state.cursor); i < total && window.length < CAP; i++) {
        if (matchWhere(materialize(i), where)) window.push(i);
      }
      if (window.length === 0) emptyWindows++;
    }

    const scannedKeys = window.map((i) => materialize(i).media_key);
    const processedKeys: string[] = [];
    const take =
      o.budgetBreakEvery && cycles % o.budgetBreakEvery === 0
        ? Math.floor(window.length / 2)
        : window.length;
    for (let j = 0; j < take; j++) {
      const idx = window[j];
      const row = materialize(idx);
      if (isDueInSweep(row, sweepStartedAt, now, INTERVALS)) {
        providerCalls++;
        if (row.media_key.startsWith('crm:')) crmProviderCalls++;
        const prev = Number.isNaN(lastCheck[idx]) ? T0 : lastCheck[idx];
        if (t - prev > worstGap[idx]) worstGap[idx] = t - prev;
        lastCheck[idx] = t;
        stateByIdx[idx] = 1;
        checkCount[idx]++;
      }
      processedKeys.push(row.media_key); // EXAMINED either way — the cursor must move
    }

    const before = state.cursor;
    state = advanceSweepState(state, now, {
      queried,
      scannedKeys,
      processedKeys,
      cap: CAP,
      gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    if (queried && before !== null && state.cursor === null && state.nextSweepEligibleAt !== null) {
      completions++;
      if (o.swingCadence) fast = !fast;
    }

    const lo = o.swingCadence && fast ? o.minGapMs : o.swingCadence ? o.maxGapMs : o.minGapMs;
    const hi = o.swingCadence && fast ? o.minGapMs : o.swingCadence ? o.maxGapMs : o.maxGapMs;
    t += Math.floor(lo + rnd() * (hi - lo));
  }

  // Close every row's open interval at the horizon so a row that stopped being checked
  // cannot hide behind "its last gap was short".
  let worst = 0, worstKey = '';
  for (let i = 0; i < n; i++) {
    const prev = Number.isNaN(lastCheck[i]) ? T0 : lastCheck[i];
    if (T0 + o.horizonMs - prev > worstGap[i]) worstGap[i] = T0 + o.horizonMs - prev;
    if (worstGap[i] > worst) { worst = worstGap[i]; worstKey = keyOf(i); }
  }
  const counts = Array.from({ length: n }, (_, i) => checkCount[i]);
  // Reduced, not spread: `Math.min(...counts)` blows the call stack at production scale.
  let minChecks = Infinity, maxChecks = -Infinity;
  for (const c of counts) { if (c < minChecks) minChecks = c; if (c > maxChecks) maxChecks = c; }
  return {
    cycles, queries, emptyWindows, completions,
    checksPerRow: counts,
    worstGapMs: worst,
    worstGapKey: worstKey,
    minChecks,
    maxChecks,
    providerCalls, crmProviderCalls,
    finalState: state,
    everStalled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('the schedule is DERIVED, and the derivation is the proof', () => {
  it('the longest possible sweep is the universe at the cap at the GUARANTEED FLOOR', () => {
    expect(CONTENT_VERIFICATION_MAX_SWEEP_MS).toBe(
      maxVerificationSweepDurationMs(
        VERIFICATION_UNIVERSE_MEASURED,
        MAX_VERIFICATION_ROWS_PER_CYCLE,
        VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
      ),
    );
    expect(CONTENT_VERIFICATION_MAX_SWEEP_MS / DAY).toBe(195); // ceil(4676 / 24)
  });

  it('the gap is interval - maxSweep, so max(D_N, D_N+1) + G <= interval for ANY cadence', () => {
    expect(CONTENT_VERIFICATION_SWEEP_GAP_MS).toBe(
      verificationSweepGapMs(CONTENT_VERIFICATION_INTERVAL_MS, CONTENT_VERIFICATION_MAX_SWEEP_MS),
    );
    expect(CONTENT_VERIFICATION_SWEEP_GAP_MS / DAY).toBe(49); // 244 - 195
    // the bound, stated as arithmetic rather than as prose
    expect(CONTENT_VERIFICATION_MAX_SWEEP_MS + CONTENT_VERIFICATION_SWEEP_GAP_MS)
      .toBeLessThanOrEqual(CONTENT_VERIFICATION_INTERVAL_MS);
  });

  it('the duty cycle at the floor IS the utilization target — the two are one number', () => {
    const duty =
      CONTENT_VERIFICATION_MAX_SWEEP_MS /
      (CONTENT_VERIFICATION_MAX_SWEEP_MS + CONTENT_VERIFICATION_SWEEP_GAP_MS);
    expect(duty).toBeCloseTo(VERIFICATION_UTILIZATION_TARGET, 2);
  });

  it('capacity is sufficient — the shortfall channel exists and reads zero', () => {
    expect(CONTENT_VERIFICATION_CAPACITY_SHORTFALL_MS).toBe(0);
    // and it is not hard-coded to zero: a universe capacity cannot cover reports the overshoot
    expect(verificationCapacityShortfallMs(30 * DAY, 195 * DAY)).toBe(165 * DAY);
    expect(verificationSweepGapMs(30 * DAY, 195 * DAY)).toBe(0); // never negative — sweep continuously
  });

  it('NO INDEX IS APPLIED — the withdrawn DDL is carried as text for the authorization request', () => {
    expect(NOT_APPLIED_INDEX_DDL).toContain('CREATE INDEX CONCURRENTLY');
    expect(NOT_APPLIED_INDEX_DDL).toContain('listing_media_content_check_due_idx');
    // and the shipped window needs none of it: no time predicate, so the media_key btree serves it
    expect(JSON.stringify(buildContentVerificationWhere('K'))).not.toContain('content_check');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('DEFECT 1 — the completion signal means RANGE EXHAUSTION, never "nothing is due yet"', () => {
  it('the window carries NO time predicate, so a short page can only mean exhaustion', () => {
    const head = buildContentVerificationWhere(null);
    const mid = buildContentVerificationWhere('001000');
    expect(head.media_key).toEqual({ not: null });
    expect(mid.media_key).toEqual({ not: null, gt: '001000' });
    for (const w of [head, mid]) {
      expect(JSON.stringify(w)).not.toContain('content_check_at');
      expect(JSON.stringify(w)).not.toContain('content_check_state');
      expect(w).toMatchObject({ status: 'active', r2_key: { not: null }, NOT: { media_key: { startsWith: 'crm:' } } });
    }
  });

  it('a FULL window never completes the sweep, however few of its rows were due', () => {
    // This is the exact shape the old rule got wrong: it saw a short DUE page and concluded
    // the key range was finished. A full window is unambiguous — there is more range.
    const state: VerificationSweepState = {
      cursor: '000100', sweepStartedAt: NOW, nextSweepEligibleAt: null, progressAt: NOW,
    };
    const scannedKeys = Array.from({ length: CAP }, (_, i) => `0002${String(i).padStart(2, '0')}`);
    const next = advanceSweepState(state, NOW, {
      queried: true, scannedKeys, processedKeys: scannedKeys, cap: CAP,
      gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next.cursor).toBe(scannedKeys[CAP - 1]);
    expect(next.nextSweepEligibleAt).toBeNull();
  });

  it('NEGATIVE — five rows examined out of a FULL window does NOT complete the sweep', () => {
    // The pre-fix rule read `selected < cap` where `selected` was the due count, so a cycle
    // that concluded 5 rows and saw 5 due rows reset the cursor to null and shut the gate for
    // a whole interval after visiting 105 of 280,502 rows. It cannot now.
    const state: VerificationSweepState = {
      cursor: '000100', sweepStartedAt: NOW, nextSweepEligibleAt: null, progressAt: NOW,
    };
    const scannedKeys = Array.from({ length: CAP }, (_, i) => `0002${String(i).padStart(2, '0')}`);
    const next = advanceSweepState(state, NOW, {
      queried: true, scannedKeys, processedKeys: scannedKeys.slice(0, 5), cap: CAP,
      gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next.cursor).toBe(scannedKeys[4]);          // moved only past what it examined
    expect(next.nextSweepEligibleAt).toBeNull();       // gate NOT shut
  });

  it('a SHORT window whose rows were all examined completes the sweep and arms the gate FROM THE END', () => {
    const started = new Date(NOW.getTime() - 120 * DAY);
    const state: VerificationSweepState = {
      cursor: '900000', sweepStartedAt: started, nextSweepEligibleAt: null, progressAt: started,
    };
    const next = advanceSweepState(state, NOW, {
      queried: true, scannedKeys: ['900001', '900002'], processedKeys: ['900001', '900002'],
      cap: CAP, gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next.cursor).toBeNull();
    // END-anchored: gap from NOW, not `sweepStartedAt + interval`. Anchoring to the start is
    // what leaves the worst-case row age at interval + (D_slow - D_fast).
    expect(next.nextSweepEligibleAt).toEqual(new Date(NOW.getTime() + CONTENT_VERIFICATION_SWEEP_GAP_MS));
    expect(next.sweepStartedAt).toEqual(started);
    expect(shouldRunVerificationCycle(next, NOW)).toBe(false);
    expect(shouldRunVerificationCycle(next, new Date(NOW.getTime() + CONTENT_VERIFICATION_SWEEP_GAP_MS))).toBe(true);
  });

  it('a SHORT window cut off by the phase-2 reserve does NOT complete the sweep', () => {
    const state: VerificationSweepState = {
      cursor: '900000', sweepStartedAt: NOW, nextSweepEligibleAt: null, progressAt: NOW,
    };
    const next = advanceSweepState(state, NOW, {
      queried: true, scannedKeys: ['900001', '900002', '900003'], processedKeys: ['900001'],
      cap: CAP, gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next.cursor).toBe('900001');
    expect(next.nextSweepEligibleAt).toBeNull();
  });

  it('an IDLE cycle observed nothing, so it can never complete a sweep', () => {
    const idle: VerificationSweepState = {
      cursor: null,
      sweepStartedAt: new Date(NOW.getTime() - 100 * DAY),
      nextSweepEligibleAt: new Date(NOW.getTime() + DAY),
      progressAt: new Date(NOW.getTime() - 10 * DAY),
    };
    expect(shouldRunVerificationCycle(idle, NOW)).toBe(false);
    const next = advanceSweepState(idle, NOW, {
      queried: false, scannedKeys: [], processedKeys: [], cap: CAP,
      gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next).toEqual(idle); // byte-identical: the no-op guard still holds, no churn write
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('DEFECT 2 — no terminal stall; the state machine recovers itself and says so', () => {
  it('an EMPTY window completes the sweep — the exact-multiple case that used to pin the cursor', () => {
    const state: VerificationSweepState = {
      cursor: '001199', sweepStartedAt: new Date(NOW.getTime() - 50 * DAY),
      nextSweepEligibleAt: null, progressAt: new Date(NOW.getTime() - MIN),
    };
    const next = advanceSweepState(state, NOW, {
      queried: true, scannedKeys: [], processedKeys: [], cap: CAP,
      gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next.cursor).toBeNull();
    expect(next.nextSweepEligibleAt).toEqual(new Date(NOW.getTime() + CONTENT_VERIFICATION_SWEEP_GAP_MS));
    expect(shouldRunVerificationCycle(next, NOW)).toBe(false); // the gate is no longer defeated
  });

  it('a stalled sweep is a DIFFERENT PHASE from a healthy idle one — not the same telemetry', () => {
    const stallMs = verificationSweepStallAfterMs();
    expect(stallMs).toBe((VERIFICATION_SWEEP_STALL_CYCLES / VERIFICATION_GUARANTEED_CYCLES_PER_DAY) * DAY);

    const pinned: VerificationSweepState = {
      cursor: '001199', sweepStartedAt: new Date(NOW.getTime() - 60 * DAY),
      nextSweepEligibleAt: null, progressAt: new Date(NOW.getTime() - stallMs),
    };
    const idle: VerificationSweepState = {
      cursor: null, sweepStartedAt: new Date(NOW.getTime() - 60 * DAY),
      nextSweepEligibleAt: new Date(NOW.getTime() + DAY), progressAt: new Date(NOW.getTime() - 60 * DAY),
    };
    const running: VerificationSweepState = { ...pinned, progressAt: new Date(NOW.getTime() - MIN) };

    expect(describeSweepHealth(pinned, NOW).phase).toBe('stalled');
    expect(describeSweepHealth(idle, NOW).phase).toBe('idle');
    expect(describeSweepHealth(running, NOW).phase).toBe('in_flight');
    expect(describeSweepHealth(emptySweepState(), NOW).phase).toBe('ready');
    // an idle sweep is NEVER reported as stalled however long it has sat
    expect(describeSweepHealth(idle, new Date(NOW.getTime() + 10 * 365 * DAY)).stalled).toBe(false);
  });

  it('a stalled sweep RESETS ITSELF to the head of the key space', () => {
    const stallMs = verificationSweepStallAfterMs();
    const pinned: VerificationSweepState = {
      cursor: '001199', sweepStartedAt: new Date(NOW.getTime() - 60 * DAY),
      nextSweepEligibleAt: null, progressAt: new Date(NOW.getTime() - stallMs),
    };
    const next = advanceSweepState(pinned, NOW, {
      queried: true, scannedKeys: Array.from({ length: CAP }, (_, i) => `9${i}`), processedKeys: [],
      cap: CAP, gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    });
    expect(next.cursor).toBeNull();
    expect(next.sweepStartedAt).toBeNull();
    expect(next.nextSweepEligibleAt).toBeNull();       // a RESET, not a completion
    expect(next.progressAt).toEqual(NOW);              // watchdog clock re-stamped
    expect(shouldRunVerificationCycle(next, NOW)).toBe(true);
  });

  it('the watchdog does not fire early, and a no-progress cycle STARTS the clock it needs', () => {
    const fresh: VerificationSweepState = {
      cursor: 'K', sweepStartedAt: NOW, nextSweepEligibleAt: null, progressAt: null,
    };
    const report = {
      queried: true, scannedKeys: Array.from({ length: CAP }, (_, i) => `9${i}`), processedKeys: [],
      cap: CAP, gapMs: CONTENT_VERIFICATION_SWEEP_GAP_MS,
    };
    // A legacy payload has no watchdog clock; it must not be declared instantly stalled.
    expect(describeSweepHealth(fresh, NOW).stalled).toBe(false);
    const stamped = advanceSweepState(fresh, NOW, report);
    expect(stamped.cursor).toBe('K');
    expect(stamped.progressAt).toEqual(NOW);
    // one minute later it is still healthy
    const soon = new Date(NOW.getTime() + MIN);
    expect(advanceSweepState(stamped, soon, report)).toEqual(stamped);
    expect(describeSweepHealth(stamped, soon).phase).toBe('in_flight');
  });

  it('state written before the watchdog existed still parses, and round-trips with it', () => {
    const legacy = JSON.stringify({ c: 'K', s: NOW.toISOString(), n: null });
    expect(parseSweepState(legacy)).toEqual({
      cursor: 'K', sweepStartedAt: NOW, nextSweepEligibleAt: null, progressAt: null,
    });
    const full: VerificationSweepState = {
      cursor: 'K', sweepStartedAt: NOW, nextSweepEligibleAt: new Date(NOW.getTime() + DAY), progressAt: NOW,
    };
    expect(parseSweepState(serializeSweepState(full))).toEqual(full);
    expect(parseSweepState('not json')).toEqual(emptySweepState());
    expect(shouldRunVerificationCycle(parseSweepState('not json'), NOW)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('due-ness is SWEEP-RELATIVE, so every row gets exactly one check per pass', () => {
  const base = (over: Partial<VerifiableRow> = {}): VerifiableRow => ({
    media_key: '2005470401678', listing_id: 'RLS1', r2_key: 'photos/1.jpg',
    media_url_original: 'https://p/x', content_check_at: null, content_check_state: null, ...over,
  });
  const SWEEP_START = new Date(NOW.getTime() - DAY);

  it('a row concluded in a PREVIOUS sweep is due; one concluded in THIS sweep is not', () => {
    expect(isDueInSweep(base({ content_check_state: 'VERIFIED', content_check_at: new Date(SWEEP_START.getTime() - 1) }), SWEEP_START, NOW, INTERVALS)).toBe(true);
    expect(isDueInSweep(base({ content_check_state: 'VERIFIED', content_check_at: new Date(SWEEP_START.getTime() + 1) }), SWEEP_START, NOW, INTERVALS)).toBe(false);
  });

  it('a never-checked row is always due', () => {
    expect(isDueInSweep(base(), SWEEP_START, NOW, INTERVALS)).toBe(true);
  });

  it('NEGATIVE: MISMATCH is never verifier work, and `crm:` is never a Cotality question', () => {
    expect(isDueInSweep(base({ content_check_state: 'MISMATCH', content_check_at: new Date(0) }), SWEEP_START, NOW, INTERVALS)).toBe(false);
    expect(isDueInSweep(base({ media_key: 'crm:SL-0004/1779898434281' }), SWEEP_START, NOW, INTERVALS)).toBe(false);
  });

  it('the 24h retry constant survives as a FLOOR under INDETERMINATE, nothing more', () => {
    const justRetried = base({ content_check_state: 'INDETERMINATE', content_check_at: new Date(NOW.getTime() - DAY / 2) });
    const aged = base({ content_check_state: 'INDETERMINATE', content_check_at: new Date(SWEEP_START.getTime() - 2 * DAY) });
    expect(isDueInSweep(justRetried, SWEEP_START, NOW, INTERVALS)).toBe(false);
    expect(isDueInSweep(aged, SWEEP_START, NOW, INTERVALS)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('CONVERGENCE — the full loop, driven through the shipped functions', () => {
  const SIX = 6 * CONTENT_VERIFICATION_INTERVAL_MS;

  it('D1 REGRESSION: steady state over 6 derived intervals — EVERY row, not most', () => {
    const r = simulateSweepLoop({
      universe: 1207, crmRows: 2, horizonMs: SIX,
      minGapMs: 10 * MIN, maxGapMs: 60 * MIN, budgetBreakEvery: 37, seed: 12345,
    });
    // the pre-fix run produced {4:487, 5:660, 6:60} and a 488.02d worst gap
    expect(r.worstGapMs).toBeLessThanOrEqual(CONTENT_VERIFICATION_INTERVAL_MS);
    expect(r.minChecks).toBeGreaterThanOrEqual(6);
    expect(r.maxChecks - r.minChecks).toBeLessThanOrEqual(1); // uniform: one visit per pass
    expect(r.completions).toBeGreaterThan(6);
    expect(r.everStalled).toBe(false);
    // D2 scope holds through the whole loop: not one provider call for a Mallan-local key
    expect(r.crmProviderCalls).toBe(0);
  });

  it('D2 REGRESSION: a universe that is an EXACT multiple of the cap does not stall', () => {
    const r = simulateSweepLoop({
      universe: 20 * CAP, horizonMs: 5 * CONTENT_VERIFICATION_INTERVAL_MS,
      minGapMs: 10 * MIN, maxGapMs: 60 * MIN, seed: 999,
    });
    // pre-fix: completions 0, checksPerRow {1:1200}, cursor pinned at 001199 forever
    expect(r.completions).toBeGreaterThan(5);
    expect(r.minChecks).toBeGreaterThanOrEqual(5);
    expect(r.worstGapMs).toBeLessThanOrEqual(CONTENT_VERIFICATION_INTERVAL_MS);
    expect(r.everStalled).toBe(false);
    // and the idle gate is doing its job: the window is not issued on most cycles
    expect(r.queries).toBeLessThan(r.cycles / 2);
    expect(r.finalState.cursor === null || r.finalState.nextSweepEligibleAt !== null).toBe(true);
  });

  it('PRODUCTION SCALE at the GUARANTEED FLOOR — the tightest case the bound has to survive', () => {
    // 280,502 rows / 60 = 4,676 cycles = 194.8d at 24 cycles/day; + 49d gap = 243.8d period.
    const r = simulateSweepLoop({
      universe: VERIFICATION_UNIVERSE_MEASURED, horizonMs: 4 * CONTENT_VERIFICATION_INTERVAL_MS,
      minGapMs: 60 * MIN, maxGapMs: 60 * MIN, seed: 7,
    });
    expect(r.worstGapMs).toBeLessThanOrEqual(CONTENT_VERIFICATION_INTERVAL_MS);
    expect(r.minChecks).toBeGreaterThanOrEqual(4);
    expect(r.maxChecks - r.minChecks).toBeLessThanOrEqual(1);
    expect(r.everStalled).toBe(false);
  }, 120_000);

  it('ADVERSARIAL CADENCE SWING between passes — the case a START-anchored gate cannot survive', () => {
    // Cadence flips between the 10-minute ceiling and the 60-minute floor at every sweep
    // boundary, so D_N and D_N+1 differ by up to 6x. `max(D_N, D_N+1) + G <= interval` still
    // holds because G is derived from the WORST duration, not from the measured one.
    const r = simulateSweepLoop({
      universe: 4 * CAP, horizonMs: 8 * CONTENT_VERIFICATION_INTERVAL_MS,
      minGapMs: 10 * MIN, maxGapMs: 60 * MIN, swingCadence: true, budgetBreakEvery: 11, seed: 4242,
    });
    expect(r.worstGapMs).toBeLessThanOrEqual(CONTENT_VERIFICATION_INTERVAL_MS);
    expect(r.minChecks).toBeGreaterThanOrEqual(8);
    expect(r.maxChecks - r.minChecks).toBeLessThanOrEqual(1);
    expect(r.everStalled).toBe(false);
  });
});
