/**
 * CONTENT VERIFICATION — the bounded recurrence detector behind RC3.
 *
 * STALE HEADER CORRECTED 2026-08-20. This box used to read "CONTRACT SURFACE (behaviour not yet
 * implemented) … Every function throws NOT_IMPLEMENTED". That has been false since the module was
 * wired into `runMediaSync` Phase 3.5: every function here is live code on the cron path, and a
 * reader who believed the header would have concluded the sweep could not be the source of a
 * production defect. It still migrates nothing — `content_check_at` / `content_check_state` are
 * already in `prisma/schema.prisma` (:2456, :2463) and no DDL is issued from here.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────
 * Item 4 closed as OUTCOME B: no recurrence model is possible with the current storage state. A
 * repaired row ends with BOTH delivery pointers populated, so it is excluded by
 * `buildR2MirrorableBacklogUniverseWhere` (lib/idx/media-sync.ts:2618) and self-certifies through the
 * existence-only reuse at :3148-3177 — i.e. a repaired row is exactly as unreachable as the legacy row
 * it replaced. RC3 is not closed by repair; it is RELOCATED to a new address.
 *
 * ── THE MINIMUM SCHEMA CLAIM (NOT YET AUTHORIZED — CLAUDE.md §C HOLD) ────────────────────────────
 *   listing_media.content_check_at    DateTime?
 *   listing_media.content_check_state ContentCheckState?   // NULL | VERIFIED | MISMATCH | INDETERMINATE
 *
 * ONE field is insufficient: a truthful "verified_at" cannot advance on mismatch, so the row is
 * permanently overdue; advancing it anyway makes the name a lie.
 * TWO TIMESTAMPS are also insufficient: they fix MISMATCH starvation and leave INDETERMINATE
 * starvation open — the closed census produced 8 CURRENT_PROVIDER_UNAVAILABLE + 1 UNVERIFIABLE, and
 * every transient 429 behaves identically.
 * A THIRD "last verified" timestamp is unjustified: when state = VERIFIED, `content_check_at` IS the
 * latest successful verification time.
 *
 * ── SEPARATION FROM THE R2 BACKLOG (load-bearing, Gate 5) ────────────────────────────────────────
 * Verification MUST NOT be OR-ed into `buildR2MirrorableBacklogUniverseWhere`. That function defines
 * outstanding R2 MIRROR work and its count feeds backlog_remaining -> backlogPending ->
 * nextBacklogRunAt -> another One Cycle wake. Mixing "due for verification" into it makes verification
 * indistinguishable from missing-R2 work and recreates the wake loop Item 4 rejected two models for.
 * Verification is a SEPARATE bounded selector inside the EXISTING media member, piggybacking the
 * already-authorized hourly heartbeat. It never contributes to backlog_remaining.
 */

import { createHash } from 'node:crypto';

import { CRM_MEDIA_KEY_PREFIX, isCrmMediaKey } from '@/lib/media/crm-media';

/** Bounded work per eligible cycle — verification never exceeds this. */
export const MAX_VERIFICATION_ROWS_PER_CYCLE = 60;

const DAY_MS = 86_400_000;

/**
 * ── D3: SCOPE, PACING AND ORDERING ──────────────────────────────────────────────────────
 *
 * THE MEASUREMENT (frozen snapshot .cache/r2-census/DB-2026-08-18T13-20-59-918Z.ndjson,
 * sha256 79340bee…2bf7 — no production SQL was run to obtain it):
 *     listing_media                                                 352,411
 *     status='active'                                               316,206
 *     status='active' AND media_key NOT NULL AND r2_key NOT NULL     280,543  <- the selector
 *     of those, media_key LIKE 'crm:%'                                   41  <- removed, D2
 *   =>                                                              280,502  <- the real universe
 *
 * THE CADENCE. `/api/cron/one-cycle-preflight` fires every 10 minutes (vercel.json), which
 * is a CEILING of 144 polls/day, but the media member only runs when the photo head moved,
 * the R2 backlog is due, or the hourly freshness heartbeat expires
 * (ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS = 3600). The GUARANTEED floor is therefore 24
 * cycles/day. Pacing is derived from the FLOOR because the two failure modes are not
 * symmetric: an interval that is too SHORT makes the verifier permanently over-subscribed
 * and it never completes a single pass (the shipped defect), while an interval that is too
 * LONG merely leaves the verifier idle between sweeps.
 *
 * WHY 30 DAYS COULD NEVER WORK. 280,543 / 60 = 4,676 cycles per pass = 32.5 days at the
 * ceiling and 194.8 days at the floor. Steady-state demand at the ceiling was 64.9
 * rows/cycle against a hard cap of 60 — a permanent 100% duty cycle with the interval
 * slipping further behind every day, and not one full pass ever completed.
 *
 * WHAT WOULD LET THE INTERVAL COME BACK DOWN — NOT APPLIED, NEEDS MAYA'S AUTHORIZATION:
 *   1. Raise the per-cycle cap. It is bounded by wall-clock, not by the database: each row
 *      costs three sequential round trips (provider metadata, provider bytes, R2 bytes) and
 *      the loop re-checks the phase-2 reserve before every row. Running the verifier at the
 *      already-production-proven R2_MIRROR_CONCURRENCY = 5 would multiply the cap by ~5 and
 *      divide the interval by ~5. That is a behaviour change to the media member's time
 *      budget and is deliberately NOT taken here.
 *   2. A metered sweep (one that throttles rows/cycle so a pass takes exactly `interval`
 *      regardless of cadence) would hold the period at exactly `interval` instead of the
 *      `duration + gap` this design produces, at the cost of two more persisted numbers.
 *      NOT taken: the phase-2 reserve, not the schedule, is the real throughput limiter, so
 *      the extra state would buy a precision the runtime cannot honour anyway.
 *   3. NO INDEX IS REQUIRED — the previous revision's proposal is WITHDRAWN. The cycle window
 *      is now a PURE KEY RANGE (`media_key > cursor`, `ORDER BY media_key ASC`, `LIMIT cap`)
 *      with no time predicate at all, so the existing `media_key` UNIQUE btree
 *      (schema.prisma:2388) serves it as a bounded forward range. `NOT_APPLIED_INDEX_DDL`
 *      below carries the exact DDL that WOULD be requested if a time predicate ever returns
 *      to SQL. It is exported as TEXT and nothing applies it. Any index is a migration and
 *      migrations are HELD (CLAUDE.md §C).
 *
 * ── WHY `selected < cap` WAS THE WRONG COMPLETION SIGNAL ─────────────────────────────────
 * The previous revision asked ONE question of the database — "give me up to `cap` rows past
 * the cursor that are DUE" — and then read a short answer as "the key range is exhausted".
 * Those are different questions and they coincide only during the cold-start pass, when every
 * row is `content_check_state IS NULL` and therefore always due. From pass two on the rows
 * carry staggered `content_check_at`, so a short page means "nothing more is due YET", and the
 * code converted that into `cursor := null` plus a full re-arm interval of idle.
 * Reproduced by driving the SHIPPED functions (universe 1207, cap 60, cadence 10-60min):
 *     t=  0.579d SWEEP COMPLETE at key 001199 of 001206   <- honest: the range WAS exhausted
 *     t=244.019d SWEEP COMPLETE at key 000029 of 001206   <- 30 of 1207 rows visited
 *     checks-per-row over 6 intervals: {4:487, 5:660, 6:60}   (6 required for EVERY row)
 *     worst observed gap between checks: 488.02d against a 244d interval
 *
 * THE SEPARATION. The two questions are now asked separately, of different mechanisms:
 *   RANGE EXHAUSTION is a question about KEYS. The window query carries NO time predicate, so
 *     a page shorter than `cap` means there are fewer than `cap` in-scope rows left beyond the
 *     cursor. That answer is stable in time and cannot oscillate with the clocks.
 *   DUE-NESS is a question about CLOCKS. It is answered in memory, per row, by `isDueInSweep`,
 *     AFTER the window has been read. A row that is not due is still EXAMINED — the cursor
 *     advances past it — it is simply not fetched from the provider.
 * A cycle therefore always makes forward progress over the key space whatever the clocks say,
 * which is what makes the sweep terminate.
 *
 * ── THE SCHEDULE, AND THE BOUND IT PROVES ───────────────────────────────────────────────
 * Let D be the wall-clock duration of one sweep and G the gap between one sweep ENDING and the
 * next STARTING. Sweep N runs [S, S+D_N]; sweep N+1 starts at S + D_N + G. A row at fraction f
 * of the key space is visited at S + f*D_N and again at S + D_N + G + f*D_{N+1}, so
 *
 *     age(f) = D_N*(1-f) + D_{N+1}*f + G        =>        max age = max(D_N, D_{N+1}) + G
 *
 * D is bounded above by the GUARANTEED FLOOR cadence: D <= ceil(universe/cap)/24 days = 195d.
 * Choosing G = interval - Dmax = 244 - 195 = 49 days therefore bounds the age of EVERY row by
 * `interval`, for ANY cadence at or above the floor and for ANY change of cadence between two
 * consecutive sweeps.
 *
 * END-ANCHORED ON PURPOSE. The previous revision armed the gate from the sweep's START
 * (`sweepStartedAt + interval`), which leaves max age at interval + (D_slow - D_fast) — up to
 * 244 + 195 - 32 = 407d when the cadence swings between the floor and the ceiling across two
 * consecutive passes. Anchoring to the END removes the cadence term from the bound.
 *
 * The duty cycle that falls out is D/(D+G) — at the floor that is 195/244 = 0.8, i.e. exactly
 * `VERIFICATION_UTILIZATION_TARGET`. The utilization target and the idle gap are the same
 * number seen from two sides, which is why G is derived from them and not written down.
 */

/**
 * The index the PREVIOUS revision proposed, kept as TEXT for the authorization request and
 * NOT applied. It is not needed by this design (the window is a pure key range) — it would
 * only matter if a time predicate ever moved back into SQL. Recorded so the request is exact
 * if it is ever made. Creating it is a migration; migrations are HELD (CLAUDE.md §C).
 */
export const NOT_APPLIED_INDEX_DDL = [
  'CREATE INDEX CONCURRENTLY listing_media_content_check_due_idx',
  '  ON listing_media (media_key)',
  '  INCLUDE (r2_key, content_check_at, content_check_state)',
  "  WHERE status = 'active' AND r2_key IS NOT NULL AND media_key IS NOT NULL;",
].join('\n');

/** The measured eligible universe, `crm:` rows excluded. Frozen census 2026-08-18. */
export const VERIFICATION_UNIVERSE_MEASURED = 280_502;
/** Guaranteed media-member cycles per day: the hourly One Cycle freshness heartbeat. */
export const VERIFICATION_GUARANTEED_CYCLES_PER_DAY = 24;
/** Ceiling: the `*​/10` preflight poll. Recorded for reporting; pacing uses the FLOOR. */
export const VERIFICATION_CEILING_CYCLES_PER_DAY = 144;
/** Headroom left for INDETERMINATE re-visits and universe growth. */
export const VERIFICATION_UTILIZATION_TARGET = 0.8;

/** Cycles needed to visit every row of `universeRows` once, at `rowsPerCycle`. */
export function verificationSweepCycles(universeRows: number, rowsPerCycle: number): number {
  return Math.ceil(universeRows / rowsPerCycle);
}

/** Wall-clock days for one complete sweep. */
export function verificationSweepDays(
  universeRows: number,
  rowsPerCycle: number,
  cyclesPerDay: number,
): number {
  return verificationSweepCycles(universeRows, rowsPerCycle) / cyclesPerDay;
}

/** Rows/cycle a given re-arm interval DEMANDS. Compare against the cap to see over-subscription. */
export function verificationDemandRowsPerCycle(
  universeRows: number,
  intervalMs: number,
  cyclesPerDay: number,
): number {
  return universeRows / (intervalMs / DAY_MS) / cyclesPerDay;
}

/** The shortest re-arm interval that a given capacity can actually honour, in whole days. */
export function requiredVerificationIntervalMs(
  universeRows: number,
  rowsPerCycle: number,
  cyclesPerDay: number,
  utilization: number,
): number {
  const days = universeRows / (rowsPerCycle * cyclesPerDay * utilization);
  return Math.ceil(days) * DAY_MS;
}

/** TRUE when a full sweep fits inside one re-arm interval at the given capacity. */
export function isVerificationConvergent(
  intervalMs: number,
  universeRows: number,
  rowsPerCycle: number,
  cyclesPerDay: number,
): boolean {
  return verificationSweepDays(universeRows, rowsPerCycle, cyclesPerDay) * DAY_MS <= intervalMs;
}

/**
 * The LONGEST a full sweep can take: the whole universe at the cap, at the GUARANTEED FLOOR
 * cadence. This is the `Dmax` of the bound proof above — the only sweep duration the schedule
 * is allowed to assume, because a faster cadence can only shorten D.
 */
export function maxVerificationSweepDurationMs(
  universeRows: number,
  rowsPerCycle: number,
  cyclesPerDay: number,
): number {
  return Math.ceil(verificationSweepDays(universeRows, rowsPerCycle, cyclesPerDay)) * DAY_MS;
}

/**
 * Gap between one sweep ENDING and the next STARTING, so that `max(D_N, D_{N+1}) + G` — the
 * worst age any row can reach — is at most `intervalMs`.
 *
 * Clamped at zero: when capacity cannot cover the universe within the interval at all
 * (`maxSweepDurationMs > intervalMs`) the correct behaviour is to sweep continuously, and the
 * shortfall is reported by `verificationCapacityShortfallMs` rather than hidden in a gap.
 */
export function verificationSweepGapMs(intervalMs: number, maxSweepDurationMs: number): number {
  return Math.max(0, intervalMs - maxSweepDurationMs);
}

/**
 * How far the guaranteed worst case overshoots the interval, in ms. Zero means the schedule
 * proves the bound. A positive value means the universe has outgrown the cap at the floor
 * cadence and the interval can no longer be honoured — a capacity fact, not a bug, and one
 * that must be visible rather than silently absorbed.
 */
export function verificationCapacityShortfallMs(
  intervalMs: number,
  maxSweepDurationMs: number,
): number {
  return Math.max(0, maxSweepDurationMs - intervalMs);
}

/**
 * Guaranteed-floor cycles a sweep may make ZERO forward progress before the watchdog calls it
 * stalled. 48 cycles is two days at the hourly heartbeat — long enough that no ordinary
 * phase-2 budget break can trip it, short enough that a pinned cursor is caught inside a
 * single on-call rotation.
 */
export const VERIFICATION_SWEEP_STALL_CYCLES = 48;

/** Wall-clock a sweep may sit at one cursor before `describeSweepHealth` reports `stalled`. */
export function verificationSweepStallAfterMs(
  stallCycles: number = VERIFICATION_SWEEP_STALL_CYCLES,
  cyclesPerDay: number = VERIFICATION_GUARANTEED_CYCLES_PER_DAY,
): number {
  return Math.ceil((stallCycles / cyclesPerDay) * DAY_MS);
}

/**
 * ── THE SWEEP ───────────────────────────────────────────────────────────────────────────
 *
 * ORDERING DEFECT IT REPLACES. `ORDER BY media_key ASC LIMIT 60` with no cursor made every
 * cycle re-scan the already-verified prefix; the prefix grows monotonically through a pass,
 * so scan depth grew toward the whole table (280K heap visits) on EVERY one of up to 144
 * cycles a day. Adding `media_key > cursor` turns that into a forward range scan on the
 * existing `media_key` UNIQUE btree: each cycle visits the rows it is about to process plus
 * the not-yet-due rows interleaved with them, and the whole table is visited ONCE PER SWEEP
 * instead of once per cycle.
 *
 * STARVATION DEFECT IT REPLACES. Selection was state-blind, so INDETERMINATE rows re-arming
 * on a 24h clock kept re-appearing in the low-key region and consumed capacity that
 * never-checked rows in the high-key region needed. A forward sweep gives every row exactly
 * ONE visit per pass, whatever its state, so the 24h clock can no longer out-pace the 30x
 * slower one. The retry constant survives only as a floor.
 *
 * IDLE GATE. When a sweep finishes, the next one may start `gapMs` later — END-anchored, so
 * the bound `max(D_N, D_{N+1}) + G <= interval` holds for any cadence at or above the floor.
 * Without a gate the window query would be issued on every cycle for the whole idle window;
 * with a START-anchored gate the bound picks up a cadence term (see the header).
 *
 * PERSISTENCE. The state is one opaque JSON string, so it occupies ONE existing TEXT column
 * (`media_sync_state.last_listing_key` on a row of its own) and needs no migration. The
 * properly-named columns are part of the standing authorization request.
 */
export interface VerificationSweepState {
  /** Highest media_key already EXAMINED in the CURRENT sweep; null = not in flight. */
  cursor: string | null;
  /** When the current (or last) sweep began. Also the "already concluded" watermark. */
  sweepStartedAt: Date | null;
  /** Earliest instant a NEW sweep may begin. Null while a sweep is in flight. */
  nextSweepEligibleAt: Date | null;
  /**
   * WATCHDOG CLOCK. The last instant the sweep MOVED — cursor advanced, sweep completed, or
   * the watchdog reset it. Without this a pinned cursor is indistinguishable from a healthy
   * idle one: both emit `selected:0`, both advance nothing, and neither raises anything.
   */
  progressAt: Date | null;
}

export function emptySweepState(): VerificationSweepState {
  return { cursor: null, sweepStartedAt: null, nextSweepEligibleAt: null, progressAt: null };
}

export function serializeSweepState(state: VerificationSweepState): string {
  return JSON.stringify({
    c: state.cursor,
    s: state.sweepStartedAt ? state.sweepStartedAt.toISOString() : null,
    n: state.nextSweepEligibleAt ? state.nextSweepEligibleAt.toISOString() : null,
    p: state.progressAt ? state.progressAt.toISOString() : null,
  });
}

/**
 * Total and non-throwing. Anything unreadable degrades to the empty state, which STARTS a
 * sweep rather than skipping one — an unreadable cursor must never silence verification.
 * A payload written before `p` existed parses with `progressAt: null`, which starts the
 * watchdog clock on the next no-progress cycle rather than declaring an instant stall.
 */
export function parseSweepState(raw: string | null | undefined): VerificationSweepState {
  if (!raw) return emptySweepState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptySweepState();
  }
  if (!parsed || typeof parsed !== 'object') return emptySweepState();
  const o = parsed as Record<string, unknown>;
  const date = (v: unknown): Date | null => {
    if (typeof v !== 'string') return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  return {
    cursor: typeof o.c === 'string' && o.c.length > 0 ? o.c : null,
    sweepStartedAt: date(o.s),
    nextSweepEligibleAt: date(o.n),
    progressAt: date(o.p),
  };
}

/** May this cycle run the verification query at all? */
export function shouldRunVerificationCycle(state: VerificationSweepState, now: Date): boolean {
  if (state.cursor !== null) return true;               // a sweep is in flight — never gated
  if (!state.nextSweepEligibleAt) return true;          // cold start / unreadable — run
  return now.getTime() >= state.nextSweepEligibleAt.getTime();
}

/**
 * The instant the sweep THIS cycle belongs to began. A null cursor means the cycle is working
 * the HEAD of the key space, i.e. it BEGINS a sweep, so the clock restarts at `now`.
 *
 * Exported because the caller needs the identical value the state machine will use: it is
 * also the "already concluded in this sweep" watermark that `isDueInSweep` compares against.
 * Two different answers to that question would make a row either re-checked or skipped.
 */
export function sweepStartFor(state: VerificationSweepState, now: Date): Date {
  return state.cursor === null ? now : (state.sweepStartedAt ?? now);
}

/** What a cycle observed. `queried:false` means the idle gate suppressed the query entirely. */
export interface SweepCycleReport {
  /**
   * FALSE when the idle gate suppressed the query. A cycle that OBSERVED NOTHING must never
   * be read as a completion signal — that is how an idle window would be mistaken for an
   * exhausted key range.
   */
  queried: boolean;
  /**
   * Keys the window returned, ascending. The window carries NO time predicate, so
   * `scannedKeys.length < cap` is exactly "fewer than `cap` in-scope rows remain beyond the
   * cursor" — RANGE EXHAUSTION, not "nothing is due yet".
   */
  scannedKeys: string[];
  /**
   * Keys this cycle EXAMINED — checked, or deliberately declined by `isDueInSweep`. An
   * ascending prefix of `scannedKeys`; shorter only when the phase-2 reserve broke the loop,
   * and advancing past a scanned-but-unexamined row would skip it for the rest of the sweep.
   */
  processedKeys: string[];
  cap: number;
  /** Gap from the END of a completed sweep to the start of the next. See `verificationSweepGapMs`. */
  gapMs: number;
  /** Override for tests; defaults to `verificationSweepStallAfterMs()`. */
  stallAfterMs?: number;
}

export type SweepPhase = 'ready' | 'in_flight' | 'idle' | 'stalled';

export interface SweepHealth {
  phase: SweepPhase;
  inFlight: boolean;
  /** A sweep is in flight AND has not moved for `stallAfterMs`. Never true of an idle sweep. */
  stalled: boolean;
  /** ms since the sweep last moved; null while the watchdog clock has never been stamped. */
  sinceProgressMs: number | null;
  cursor: string | null;
}

/**
 * The observability half of the terminal-stall fix. `sweep_idle` alone could not tell a
 * healthy between-passes idle from a cursor pinned forever: both report `selected:0` and
 * `sweep_cursor_advanced:false`. Phase is derived from the state, so the two are now
 * different values of the same field.
 */
export function describeSweepHealth(
  state: VerificationSweepState,
  now: Date,
  stallAfterMs: number = verificationSweepStallAfterMs(),
): SweepHealth {
  const inFlight = state.cursor !== null;
  const sinceProgressMs = state.progressAt ? now.getTime() - state.progressAt.getTime() : null;
  const stalled = inFlight && sinceProgressMs !== null && sinceProgressMs >= stallAfterMs;
  const idle =
    !inFlight &&
    state.nextSweepEligibleAt !== null &&
    now.getTime() < state.nextSweepEligibleAt.getTime();
  return {
    phase: stalled ? 'stalled' : inFlight ? 'in_flight' : idle ? 'idle' : 'ready',
    inFlight,
    stalled,
    sinceProgressMs,
    cursor: state.cursor,
  };
}

/**
 * Advance the sweep after a cycle.
 *
 * THREE OUTCOMES, in the order they are decided:
 *
 *  1. THE CYCLE OBSERVED NOTHING (`queried:false`). The state is returned untouched. An idle
 *     cycle carries no evidence about the key range and must never complete a sweep.
 *
 *  2. THE RANGE IS EXHAUSTED AND THE CYCLE REACHED ITS END. The window came back short
 *     (`scannedKeys.length < cap`) AND every scanned key was examined. Only then is the sweep
 *     complete. `scannedKeys.length === 0` is the ordinary way a sweep whose universe is an
 *     exact multiple of the cap ends — the previous revision could not express that at all,
 *     which is why a universe of exactly 20*cap pinned the cursor forever: `processedKeys`
 *     was empty, the function returned early, and `shouldRunVerificationCycle` kept saying
 *     yes because `cursor !== null`.
 *
 *  3. OTHERWISE THE SWEEP STAYS IN FLIGHT. The cursor moves to the last EXAMINED key. If
 *     nothing was examined the cursor cannot move, so the watchdog clock is consulted: a
 *     sweep that has not moved for `stallAfterMs` is reset to the head of the key space,
 *     which is the self-recovery. Re-examining already-checked rows is idempotent and
 *     bounded; a pinned cursor is neither.
 */
export function advanceSweepState(
  state: VerificationSweepState,
  now: Date,
  report: SweepCycleReport,
): VerificationSweepState {
  if (!report.queried) return state;

  const startedAt = sweepStartFor(state, now);
  const rangeExhausted = report.scannedKeys.length < report.cap;
  const reachedEnd = rangeExhausted && report.processedKeys.length === report.scannedKeys.length;

  if (reachedEnd) {
    return {
      cursor: null,
      sweepStartedAt: startedAt,
      // END-anchored: `gapMs` from NOW, the instant this sweep finished.
      nextSweepEligibleAt: new Date(now.getTime() + report.gapMs),
      progressAt: now,
    };
  }

  if (report.processedKeys.length > 0) {
    return {
      cursor: report.processedKeys[report.processedKeys.length - 1],
      sweepStartedAt: startedAt,
      nextSweepEligibleAt: null,
      progressAt: now,
    };
  }

  // No forward progress. Start the watchdog clock if it has never been stamped (a state
  // written before `progressAt` existed, or a sweep that has never moved), then fire.
  if (state.progressAt === null) return { ...state, progressAt: now };
  const stallAfterMs = report.stallAfterMs ?? verificationSweepStallAfterMs();
  if (now.getTime() - state.progressAt.getTime() >= stallAfterMs) {
    return { cursor: null, sweepStartedAt: null, nextSweepEligibleAt: null, progressAt: now };
  }
  return state;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export type ContentCheckState = 'VERIFIED' | 'MISMATCH' | 'INDETERMINATE';

export interface VerifiableRow {
  media_key: string;
  listing_id: string;
  r2_key: string | null;
  media_url_original: string | null;
  content_check_at: Date | null;
  content_check_state: ContentCheckState | null;
}

export interface VerificationIntervals {
  /** How long a VERIFIED row stays clean before it is due again. */
  verificationIntervalMs: number;
  /** Separate, independent pacing for INDETERMINATE rows. */
  retryIntervalMs: number;
}

export interface VerificationDeps {
  /** Fresh current provider locator resolved BY MediaKey. Null when the provider has none. */
  resolveFreshLocator(mediaKey: string): Promise<string | null>;
  /** Fetch provider bytes. Throws on transient failure after bounded retry. */
  fetchProviderBytes(url: string): Promise<Buffer>;
  /** Read the currently-delivered R2 object. Throws when unreadable. */
  readR2Bytes(key: string): Promise<Buffer>;
  /** Persist the outcome. The ONLY write a verifier may perform. */
  recordCheck(mediaKey: string, at: Date, state: ContentCheckState): Promise<void>;
}

export interface VerificationOutcome {
  media_key: string;
  /**
   * NULL is NOT a persisted state — it means NO CHECK WAS APPLICABLE and nothing was
   * written. It exists so a Mallan-local `crm:` row can be declined without being recorded
   * as INDETERMINATE, which would re-arm it on the 24h clock forever (D2). Callers must
   * count it as SKIPPED; treating it as indeterminate would reproduce the defect in the
   * telemetry instead of the database.
   */
  state: ContentCheckState | null;
  /** Set only when `state` is null. */
  skipped?: 'mallan_local';
  /** Present only when both sides were obtained and hashed. */
  hashes?: { provider: string; delivered: string };
  reason?: string;
}

/** A durable snapshot of verifier progress, for interruption/restart. */
export interface VerifierCursor {
  lastMediaKey: string | null;
  processed: number;
}

/**
 * due = state IS NULL
 *    OR (VERIFIED      AND content_check_at < now - verificationIntervalMs)
 *    OR (INDETERMINATE AND content_check_at < now - retryIntervalMs)
 * MISMATCH is NEVER verifier work.
 */
export function isDueForVerification(
  row: VerifiableRow,
  now: Date,
  intervals: VerificationIntervals,
): boolean {
  const state = row.content_check_state;
  if (state === null || state === undefined) return true;          // never checked
  if (state === 'MISMATCH') return false;                          // NEVER verifier work
  const at = row.content_check_at;
  if (!at) return true;                                            // state without a clock — re-check
  const age = now.getTime() - at.getTime();
  if (state === 'VERIFIED') return age >= intervals.verificationIntervalMs;
  if (state === 'INDETERMINATE') return age >= intervals.retryIntervalMs;
  return true;
}

/**
 * SWEEP-RELATIVE due-ness: has this row already been concluded during the CURRENT sweep?
 *
 * WHY NOT THE PER-ROW CLOCK. `isDueForVerification` compares each row's age against a fixed
 * 244-day interval. In steady state a keyset sweep passes each row at an age of almost exactly
 * that interval, so the comparison sits permanently on a razor's edge: jitter of minutes
 * decides whether a row is checked this pass or waits a whole further pass. That is what
 * produced `{4:487, 5:660, 6:60}` — most rows short of the required six checks — and a
 * 488-day worst gap. Asking instead "was this row concluded since THIS sweep began" makes the
 * answer yes for every row on every pass, so checks-per-row is exactly one per pass for EVERY
 * row and the schedule, not the jitter, sets the period.
 *
 * The per-row clock is not weakened: it survives as `isDueForVerification` and still governs
 * the in-memory harness and the MISMATCH / INDETERMINATE rules below.
 */
export function isDueInSweep(
  row: VerifiableRow,
  sweepStartedAt: Date,
  now: Date,
  intervals: VerificationIntervals,
): boolean {
  // D2 — Mallan-local media is never a Cotality question. Belt and braces with `verifyRow`.
  if (isCrmMediaKey(row.media_key)) return false;
  // MISMATCH is NEVER verifier work — it is handed to human-gated targeted remediation.
  if (row.content_check_state === 'MISMATCH') return false;
  const at = row.content_check_at;
  if (!at) return true;                                             // never checked / clockless
  // The 24h retry constant survives only as a FLOOR on INDETERMINATE re-visits.
  if (
    row.content_check_state === 'INDETERMINATE' &&
    now.getTime() - at.getTime() < intervals.retryIntervalMs
  ) {
    return false;
  }
  return at.getTime() < sweepStartedAt.getTime();
}

/**
 * The bounded verification WINDOW. MUST be structurally distinct from
 * `buildR2MirrorableBacklogUniverseWhere` and MUST NOT contribute to backlog_remaining.
 *
 * IT CARRIES NO TIME PREDICATE, DELIBERATELY. Two things follow, and both are the point:
 *   1. `rows returned < cap` means RANGE EXHAUSTION and nothing else. With a due predicate in
 *      SQL a short page also meant "nothing is due yet", and the two were indistinguishable —
 *      the shipped defect (see the header block).
 *   2. It is a pure forward range on the existing `media_key` UNIQUE btree, bounded by `take`.
 *      No index is required, and no scan can grow with the size of the verified prefix. The
 *      former due predicate had NO index behind it, so a "nothing is due" answer cost a filter
 *      scan toward the end of the table.
 * Due-ness moved to `isDueInSweep`, applied in memory to the <= `cap` rows this returns.
 */
export function buildContentVerificationWhere(cursor: string | null = null): Record<string, unknown> {
  // Deliberately asserts DELIVERY PRESENT (r2_key not null). The backlog universe asserts delivery
  // MISSING. The two selectors are therefore disjoint by construction, which is what keeps
  // verification out of backlog_remaining / backlogPending / forceRun.
  return {
    status: 'active',
    // D3 ORDERING — THE KEYSET. `gt` turns this into a forward RANGE on the existing
    // `media_key` UNIQUE btree instead of a filter scan over an ever-growing verified
    // prefix, and it gives every row exactly ONE visit per sweep, which is what stops a
    // 24h-re-arming INDETERMINATE row out-pacing a never-checked one.
    media_key: cursor === null ? { not: null } : { not: null, gt: cursor },
    r2_key: { not: null },
    // D2 SCOPE — LIVE-PROVEN, not assumed (probes 2026-08-20, raw bodies + sha256 in
    // .cache/cotality-authority/d2-crm-namespace/):
    //   GET /odata/Media?$filter=startswith(MediaKey,'crm:')&$count=true
    //     -> HTTP 200, "@odata.count": 0        (SUPPORTED, and a real zero — not an error)
    //   GET /odata/Media?$filter=MediaKey eq 'crm:SL-0004:0123456789abcdef'
    //     -> HTTP 200, "value": []              (empty set, NOT PROVIDER_REJECTED)
    //   live MediaKeys are 13-digit numerics ("2004688460477"); the `crm:` namespace is
    //   minted locally by lib/media/crm-media.ts:70.
    // So `resolveFreshLocator` returns null for every such row, `verifyRow` concludes
    // INDETERMINATE, and the row re-arms on the 24h retry clock forever. The same namespace
    // is already excluded from the Cotality tombstone path at media-sync.ts:1531 and :1537.
    NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } },
  };
}

/**
 * Verify ONE row. Performs NO repair of any kind — detection is strictly separated from mutation.
 * The only permitted write is `recordCheck`.
 */
export async function verifyRow(
  row: VerifiableRow,
  deps: VerificationDeps,
  now: Date,
): Promise<VerificationOutcome> {
  const conclude = async (state: ContentCheckState, extra: Partial<VerificationOutcome> = {}) => {
    await deps.recordCheck(row.media_key, now, state);
    return { media_key: row.media_key, state, ...extra } as VerificationOutcome;
  };

  // D2 — MALLAN-LOCAL MEDIA IS NEVER A COTALITY QUESTION.
  //
  // Defence in depth: `buildContentVerificationWhere` already excludes the namespace, so
  // this is unreachable from the production selector. It exists because the cost of the
  // selector ever being widened is a permanent 24h retry loop against MediaKeys Cotality
  // cannot hold — and because NO Cotality request may be issued for a key the provider
  // never issued. It returns WITHOUT calling any dep, so nothing is fetched and nothing is
  // written: an INDETERMINATE here would be a lie about the provider AND a re-arm.
  if (isCrmMediaKey(row.media_key)) {
    return {
      media_key: row.media_key,
      state: null,
      skipped: 'mallan_local',
      reason: 'Mallan-local media — not a Cotality record; no provider lookup is possible',
    };
  }

  // Absence of a delivered object is NOT equivalence.
  if (!row.r2_key) return conclude('INDETERMINATE', { reason: 'no r2_key — nothing delivered to compare' });

  let locator: string | null;
  try {
    locator = await deps.resolveFreshLocator(row.media_key);
  } catch (e) {
    return conclude('INDETERMINATE', { reason: `locator resolution failed: ${e instanceof Error ? e.message : String(e)}` });
  }
  if (!locator) return conclude('INDETERMINATE', { reason: 'provider has no current MediaURL for this MediaKey' });

  let providerBytes: Buffer;
  try {
    providerBytes = await deps.fetchProviderBytes(locator);
  } catch (e) {
    return conclude('INDETERMINATE', { reason: `provider fetch failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  let deliveredBytes: Buffer;
  try {
    deliveredBytes = await deps.readR2Bytes(row.r2_key);
  } catch (e) {
    return conclude('INDETERMINATE', { reason: `R2 read failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  const provider = sha256(providerBytes);
  const delivered = sha256(deliveredBytes);
  return conclude(provider === delivered ? 'VERIFIED' : 'MISMATCH', { hashes: { provider, delivered } });
}

/**
 * Run a bounded batch. Returns the outcomes plus a durable cursor. Must never emit anything that can
 * influence backlogPending, forceRun, or backlog_remaining.
 *
 * NOT THE PRODUCTION PATH — stated plainly so nobody reads a green test here as a claim about the
 * cron. `runMediaSync` Phase 3.5 does the selection IN THE DATABASE (`buildContentVerificationWhere`
 * + the sweep cursor + `take`) and calls `verifyRow` directly, because materialising 280K rows in
 * memory to filter them is exactly the scan this design exists to avoid. This helper is the
 * in-memory contract harness for the batching rules; `verifyRow`, the selector and the sweep
 * helpers are the shared code both paths actually run.
 */
export async function runBoundedVerificationPass(
  rows: VerifiableRow[],
  limit: number,
  deps: VerificationDeps,
  now: Date,
  cursor?: VerifierCursor,
): Promise<{ outcomes: VerificationOutcome[]; cursor: VerifierCursor; backlogDelta: number }> {
  const cap = Math.min(limit, MAX_VERIFICATION_ROWS_PER_CYCLE);
  const after = cursor?.lastMediaKey ?? null;
  const eligible = rows
    // MISMATCH is never verifier work (see `isDueForVerification`). The preceding
    // `isDueForVerification(row, now, {0, 0}) || state !== 'MISMATCH'` clause was inert —
    // with both intervals at 0 it was true for every non-MISMATCH row and the very next
    // filter already removed the MISMATCH rows — so it changed no outcome while implying a
    // second, different eligibility rule existed. Removed rather than left to be read as one.
    .filter((r) => r.content_check_state !== 'MISMATCH')
    // Mallan-local rows are out of scope entirely (D2) — `verifyRow` also refuses them.
    .filter((r) => !isCrmMediaKey(r.media_key))
    .filter((r) => (after === null ? true : r.media_key > after))
    .sort((a, b) => (a.media_key < b.media_key ? -1 : a.media_key > b.media_key ? 1 : 0));

  const batch = eligible.slice(0, cap);
  const outcomes: VerificationOutcome[] = [];
  for (const r of batch) {
    // One row must never stop the batch.
    try {
      outcomes.push(await verifyRow(r, deps, now));
    } catch (e) {
      outcomes.push({ media_key: r.media_key, state: 'INDETERMINATE', reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return {
    outcomes,
    cursor: {
      lastMediaKey: batch.length ? batch[batch.length - 1].media_key : (cursor?.lastMediaKey ?? null),
      processed: (cursor?.processed ?? 0) + batch.length,
    },
    // Verification writes only content_check_*; it can never move outstanding R2 mirror work.
    backlogDelta: 0,
  };
}

/**
 * After a successful targeted repair AND its R2 read-back verification, a MISMATCH row becomes
 * VERIFIED at `now`, so it ages back into ordinary verification. This is the Gate 11 closure.
 */
export function applyRepairVerified(
  _row: VerifiableRow,
  now: Date,
): Pick<VerifiableRow, 'content_check_at' | 'content_check_state'> {
  return { content_check_at: now, content_check_state: 'VERIFIED' };
}
