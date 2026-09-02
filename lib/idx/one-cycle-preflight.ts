import { fetchFromTrestle } from '@/lib/idx/fetch';
import { redis } from '@/lib/redis';

/**
 * External shadow state for the 10-minute One Cycle poll.
 *
 * This key deliberately lives outside Neon. A no-change poll must be able to
 * prove that there is no source work without opening a PostgreSQL connection.
 * Neon remains authoritative for cursors and writes once a real cycle starts;
 * this state is only a conservative hint. Any missing, malformed, unavailable,
 * or uncertain state FAILS OPEN to the normal Neon-backed cycle.
 */
export const ONE_CYCLE_PREFLIGHT_KEY = 'mallan:one-cycle:preflight:v1';
export const ONE_CYCLE_PREFLIGHT_VERSION = 1 as const;

/** The incremental listing member is capped at 500 rows per scheduled run. */
export const ONE_CYCLE_SOURCE_BATCH_LIMIT = 500;
/** Media/R2 backlog work is allowed to wake Neon hourly while source polling remains 10-minute. */
export const DEFAULT_BACKLOG_INTERVAL_SECONDS = 60 * 60;
const MIN_BACKLOG_INTERVAL_SECONDS = 10 * 60;
const MAX_BACKLOG_INTERVAL_SECONDS = 24 * 60 * 60;

/**
 * FRESHNESS HEARTBEAT — maximum silence before an authoritative Neon-backed
 * One Cycle is forced, even when every Cotality probe reports "unchanged".
 *
 * WHY THIS EXISTS. The seven fail-open branches below cover ERRORS. They do
 * not cover a probe that succeeds and is silently WRONG: a persistent false
 * "unchanged" would skip Neon forever, and REBNY UCBA Art. I §6 requires
 * Trestle status changes to propagate within 24h. This is the backstop.
 *
 * WHY ONE HOUR — measured, not guessed. Over 7 days / 147 natural quiet runs
 * on this feed (2026-08-02):
 *     average quiet run  18.7 min
 *     p95                40 min
 *     longest observed   120 min (once)
 *     runs >= 60 min     6 of 147  (4%)
 *     runs >= 240 min    0
 * One hour sits above p95, so ~96% of genuine quiet periods are never
 * interrupted, while leaving 24x margin under the regulatory bound. 30 min
 * would fire through a large share of normal quiet and erode the saving;
 * 2h would gain almost nothing (one run in seven days) while doubling how
 * long a false-unchanged defect could persist.
 *
 * DELIBERATELY NOT CONFIGURABLE. No env override: the compliance guarantee
 * must not depend on an unreviewed Vercel setting that could be widened to
 * days. Change it here, in review, or not at all.
 */
export const ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS = 60 * 60;

const SOURCE_FIELDS = ['ModificationTimestamp', 'PhotosChangeTimestamp'] as const;
type SourceField = (typeof SOURCE_FIELDS)[number];

export interface SourceHead {
  timestamp: string | null;
  listingKey: string | null;
  /** Number of rows at the current maximum timestamp. */
  populationAtHead: number;
}

export interface SourceSnapshot {
  modification: SourceHead;
  photos: SourceHead;
  capturedAt: string;
}

/** Which heads moved, reported separately rather than collapsed to one boolean. */
export interface SourceHeadDelta {
  modification: boolean;
  photos: boolean;
}

/**
 * The One Cycle members, in their authority order: listings are written before
 * media, always. Media resolves against listing rows, so the reverse order can
 * attach photos to a stale or absent listing.
 */
// The member IDENTITIES. These string literals appear exactly once in the
// codebase; everything else — the ordered list, plan selection, the route's
// runner map, budget validation and completion membership — derives from them.
//
// Declaring them separately (rather than only as array elements) is what makes
// the single authority real: `requiredMembersForPlan` used to re-type
// 'idx-sync'/'media-sync' in every switch branch and the route re-typed them
// again in its runner table, so three files each carried their own copy and
// "add a member in one place" was not true.
export const ONE_CYCLE_MEMBER_IDX = 'idx-sync' as const;
export const ONE_CYCLE_MEMBER_MEDIA = 'media-sync' as const;

/**
 * The canonical ORDER — listings before media, always. Media resolves against
 * listing rows, so the reverse order can attach photos to a stale or absent
 * listing. Every consumer iterates THIS array rather than its own list.
 */
export const ONE_CYCLE_MEMBERS = [ONE_CYCLE_MEMBER_IDX, ONE_CYCLE_MEMBER_MEDIA] as const;
export type OneCycleMember = (typeof ONE_CYCLE_MEMBERS)[number];

/**
 * What this poll will actually execute.
 *
 * `full_safety` is the fail-open plan: it runs the complete machine and is what
 * every uncertainty (no Redis, unreadable state, failed source probe, forced
 * retry, expired freshness heartbeat) resolves to.
 */
export type OneCycleExecutionPlan =
  | 'skip'
  | 'idx_only'
  | 'media_only'
  | 'idx_then_media'
  | 'full_safety';

/**
 * The members a given plan is REQUIRED to complete.
 *
 * Completion must be judged against this, never against a constant member list.
 * With a constant list an intentionally IDX-free cycle looks `incomplete`, which
 * sets `forceRun`, which makes every subsequent poll fail open — so the machine
 * would never skip again and the whole optimisation would silently do nothing.
 *
 * The returned order is load-bearing: IDX strictly before Media.
 */
export function requiredMembersForPlan(plan: OneCycleExecutionPlan): OneCycleMember[] {
  switch (plan) {
    case 'skip':
      return [];
    case 'idx_only':
      return [ONE_CYCLE_MEMBER_IDX];
    case 'media_only':
      return [ONE_CYCLE_MEMBER_MEDIA];
    case 'idx_then_media':
    case 'full_safety':
      // Spread the canonical ordered list rather than re-typing the pair, so
      // the order here can never diverge from the order the route executes.
      return [...ONE_CYCLE_MEMBERS];
    default: {
      // Unreachable while the union is exhaustive. If a new plan is added and
      // this switch is not updated, fail CLOSED to the full machine rather than
      // silently running nothing.
      const _exhaustive: never = plan;
      void _exhaustive;
      return [...ONE_CYCLE_MEMBERS];
    }
  }
}

/**
 * Did this plan run the complete authoritative machine?
 *
 * Only a full plan may advance the freshness heartbeat. If a partial plan could
 * advance it, one photo-only cycle per hour would satisfy the clock forever and
 * the hourly authoritative sweep — the compliance guarantee — would never run.
 */
export function planIsAuthoritative(plan: OneCycleExecutionPlan): boolean {
  return plan === 'idx_then_media' || plan === 'full_safety';
}

export interface OneCyclePreflightState {
  version: typeof ONE_CYCLE_PREFLIGHT_VERSION;
  snapshot: SourceSnapshot;
  /** Immediate retry: failed/incomplete cycle or listing batch hit its cap. */
  forceRun: boolean;
  /** Media/R2 backlog still exists, but is drained on a bounded lower cadence. */
  backlogPending: boolean;
  nextBacklogRunAt: string | null;
  /** Last cycle that FINISHED, whatever its outcome. Not the heartbeat. */
  lastCompletedAt: string | null;
  /**
   * Last cycle that finished SUCCESSFULLY AND COMPLETELY. This is the
   * heartbeat clock. Kept separate from `lastCompletedAt` because that
   * field advances on partial and incomplete outcomes too, so it cannot
   * express "the machine is definitely healthy". A partial cycle must not
   * buy another hour of silence.
   */
  lastSuccessfulFullCycleAt: string | null;
  lastOutcome: 'success' | 'partial' | 'incomplete' | null;
}

/**
 * Outcome of persisting completion state. Deliberately separate from the
 * decision reason union: this happens after the cycle, so conflating the two
 * would report post-cycle write failures as pre-cycle decisions.
 */
export type OneCycleFinalizeOutcome =
  | 'ok'
  | 'redis_client_missing'
  | 'redis_write_failed'
  | 'no_snapshot';

export interface OneCyclePreflightDecision {
  shouldRun: boolean;
  reason:
    // Retained for existing telemetry matchers. New code emits one of the
    // specific subtypes below: a single reason made "no client configured"
    // indistinguishable from "the read threw", and those differ in remedy.
    | 'external_state_unavailable'
    | 'redis_client_missing'
    | 'redis_read_failed'
    | 'state_missing_or_invalid'
    | 'source_probe_failed'
    | 'forced_retry'
    | 'source_changed'
  | 'freshness_heartbeat_due'
    | 'backlog_due'
    | 'source_unchanged_no_backlog_due';
  snapshot: SourceSnapshot | null;
  snapshotTrusted: boolean;
  priorState: OneCyclePreflightState | null;
  /**
   * WHAT to run, as opposed to `shouldRun`, which only said whether to run.
   * `shouldRun` is retained and is exactly `executionPlan !== 'skip'`.
   */
  executionPlan: OneCycleExecutionPlan;
  /** Which heads moved. Null when the snapshot could not be trusted/compared. */
  headDelta: SourceHeadDelta | null;
  /** Why this plan, in structured form, for runtime observability. */
  planReasons: string[];
}

export interface OneCycleCompletionInput {
  success: boolean;
  complete: boolean;
  outcome: 'success' | 'partial' | 'incomplete';
  members: Array<{
    member: string;
    status: string;
    summary: Record<string, unknown>;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function validIsoOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseHead(value: unknown): SourceHead | null {
  if (!isRecord(value)) return null;
  const timestamp = validIsoOrNull(value.timestamp);
  if (timestamp === undefined) return null;
  const listingKey = value.listingKey === null
    ? null
    : typeof value.listingKey === 'string'
      ? value.listingKey
      : undefined;
  if (listingKey === undefined) return null;
  const populationAtHead = finiteNonNegativeInteger(value.populationAtHead);
  if (populationAtHead === null) return null;
  if (timestamp === null && (listingKey !== null || populationAtHead !== 0)) return null;
  return { timestamp, listingKey, populationAtHead };
}

function parseSnapshot(value: unknown): SourceSnapshot | null {
  if (!isRecord(value)) return null;
  const modification = parseHead(value.modification);
  const photos = parseHead(value.photos);
  const capturedAt = validIsoOrNull(value.capturedAt);
  if (!modification || !photos || capturedAt == null) return null;
  return { modification, photos, capturedAt };
}

export function parseOneCyclePreflightState(value: unknown): OneCyclePreflightState | null {
  if (typeof value === 'string') {
    try {
      return parseOneCyclePreflightState(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || value.version !== ONE_CYCLE_PREFLIGHT_VERSION) return null;
  const snapshot = parseSnapshot(value.snapshot);
  if (!snapshot) return null;
  if (typeof value.forceRun !== 'boolean' || typeof value.backlogPending !== 'boolean') return null;
  const nextBacklogRunAt = validIsoOrNull(value.nextBacklogRunAt);
  const lastCompletedAt = validIsoOrNull(value.lastCompletedAt);
  if (nextBacklogRunAt === undefined || lastCompletedAt === undefined) return null;
  // Absent on state written before the heartbeat shipped. Treated as null,
  // which forces one authoritative cycle — the safe direction — so no state
  // version bump (and no forced cold start) is required.
  const lastSuccessfulFullCycleAt =
    value.lastSuccessfulFullCycleAt === undefined
      ? null
      : validIsoOrNull(value.lastSuccessfulFullCycleAt);
  if (lastSuccessfulFullCycleAt === undefined) return null;
  const lastOutcome = value.lastOutcome;
  if (
    lastOutcome !== null &&
    lastOutcome !== 'success' &&
    lastOutcome !== 'partial' &&
    lastOutcome !== 'incomplete'
  ) return null;
  return {
    version: ONE_CYCLE_PREFLIGHT_VERSION,
    snapshot,
    forceRun: value.forceRun,
    backlogPending: value.backlogPending,
    nextBacklogRunAt,
    lastCompletedAt,
    lastSuccessfulFullCycleAt,
    lastOutcome,
  };
}

function headEqual(a: SourceHead, b: SourceHead): boolean {
  return a.timestamp === b.timestamp &&
    a.listingKey === b.listingKey &&
    a.populationAtHead === b.populationAtHead;
}

/**
 * Which Cotality heads moved, kept SEPARATE.
 *
 * The two heads mean different things and select different members. Per the
 * canonical compliance index (docs/compliance/COMPLIANCE-CANONICAL-INDEX.md:118,
 * §8 Fail-closed row): "Two-tier timestamp sync: Property.PhotosChangeTimestamp
 * (high-level trigger) -> Media.ModificationTimestamp (per-row)."
 *
 * So PhotosChangeTimestamp is the media trigger and ModificationTimestamp is
 * the listing-record trigger. Collapsing them with `||` — which is what this
 * module did before — meant a photo-only change woke the entire listing sync,
 * and a listing-only change woke the entire media sync.
 */
export function sourceHeadsChanged(
  prior: SourceSnapshot,
  current: SourceSnapshot,
): SourceHeadDelta {
  return {
    modification: !headEqual(prior.modification, current.modification),
    photos: !headEqual(prior.photos, current.photos),
  };
}

/**
 * Retained as the union of {@link sourceHeadsChanged}. Existing telemetry and
 * tests depend on this exact boolean; it is now derived rather than duplicated
 * so the two can never disagree.
 */
export function sourceSnapshotChanged(prior: SourceSnapshot, current: SourceSnapshot): boolean {
  const delta = sourceHeadsChanged(prior, current);
  return delta.modification || delta.photos;
}

function normalizeTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function queryHead(field: SourceField, prior: SourceHead | null): Promise<SourceHead> {
  const initialFilter = prior?.timestamp
    ? `${field} ge ${prior.timestamp}`
    : `${field} ne null`;
  const first = await fetchFromTrestle({
    filter: initialFilter,
    select: ['ListingKey', field],
    top: 1,
    maxTotal: 1,
    orderby: `${field} desc,ListingKey desc`,
    count: prior?.timestamp != null,
  });
  const row = first.records[0];
  if (!row) return { timestamp: null, listingKey: null, populationAtHead: 0 };

  const timestamp = normalizeTimestamp(row[field]);
  if (!timestamp) throw new Error(`preflight_invalid_${field}`);
  const listingKey = row.ListingKey == null ? null : String(row.ListingKey);

  // When the maximum timestamp did not move, the >= query's count is exactly
  // the population at that head. A count change catches late same-timestamp
  // additions/removals even when the maximum ListingKey itself is unchanged.
  if (prior?.timestamp === timestamp && typeof first.odataCount === 'number') {
    return { timestamp, listingKey, populationAtHead: first.odataCount };
  }

  // New baseline or a newer head: normalize the population to the NEW maximum
  // timestamp. Carrying the old >= population forward would cause a false
  // change on the next poll when the filter advances to the new head.
  const exact = await fetchFromTrestle({
    filter: `${field} eq ${timestamp}`,
    select: ['ListingKey', field],
    top: 1,
    maxTotal: 1,
    orderby: 'ListingKey desc',
    count: true,
  });
  const exactRow = exact.records[0];
  return {
    timestamp,
    listingKey: exactRow?.ListingKey == null ? listingKey : String(exactRow.ListingKey),
    populationAtHead: typeof exact.odataCount === 'number' ? exact.odataCount : exact.records.length,
  };
}

export async function captureSourceSnapshot(
  prior: SourceSnapshot | null,
  now: Date = new Date(),
): Promise<SourceSnapshot> {
  const [modification, photos] = await Promise.all([
    queryHead('ModificationTimestamp', prior?.modification ?? null),
    queryHead('PhotosChangeTimestamp', prior?.photos ?? null),
  ]);
  return { modification, photos, capturedAt: now.toISOString() };
}

function backlogIntervalSeconds(): number {
  const raw = Number(process.env.ONE_CYCLE_BACKLOG_INTERVAL_SECONDS);
  if (!Number.isFinite(raw)) return DEFAULT_BACKLOG_INTERVAL_SECONDS;
  return Math.max(
    MIN_BACKLOG_INTERVAL_SECONDS,
    Math.min(MAX_BACKLOG_INTERVAL_SECONDS, Math.trunc(raw)),
  );
}

/**
 * Decide whether this 10-minute poll must open Neon.
 *
 * Safe skip requires ALL of:
 *   - external Redis state is available and valid;
 *   - both Cotality source heads are unchanged (including head population);
 *   - the previous cycle did not fail or fill the 500-row listing batch;
 *   - media backlog is not yet due for its bounded drain cadence.
 *
 * Every uncertainty fails open to the existing Neon-backed machine.
 */
/**
 * Every uncertainty resolves here: run the COMPLETE machine. A partial plan is
 * only ever chosen from a trusted comparison against known prior state.
 */
function failOpenDecision(
  reason: OneCyclePreflightDecision['reason'],
  snapshot: SourceSnapshot | null,
  snapshotTrusted: boolean,
  priorState: OneCyclePreflightState | null,
  planReasons: string[],
): OneCyclePreflightDecision {
  return {
    shouldRun: true,
    reason,
    snapshot,
    snapshotTrusted,
    priorState,
    executionPlan: 'full_safety',
    headDelta: null,
    planReasons,
  };
}

export async function decideOneCyclePreflight(now: Date = new Date()): Promise<OneCyclePreflightDecision> {
  if (!redis) {
    return failOpenDecision('redis_client_missing', null, false, null, ['external_state_client_missing']);
  }

  let priorState: OneCyclePreflightState | null = null;
  try {
    priorState = parseOneCyclePreflightState(
      await redis.get<unknown>(ONE_CYCLE_PREFLIGHT_KEY),
    );
  } catch (err) {
    // Client EXISTS and the call failed: dead endpoint, auth rejection, DNS or
    // transport. Distinct from a missing client, and from a successful read
    // that returned nothing (state_missing_or_invalid).
    console.warn(
      '[one-cycle-preflight] external state read failed:',
      err instanceof Error ? err.name : 'unknown_error',
    );
    return failOpenDecision('redis_read_failed', null, false, null, ['external_state_read_failed']);
  }

  let snapshot: SourceSnapshot;
  try {
    snapshot = await captureSourceSnapshot(priorState?.snapshot ?? null, now);
  } catch (err) {
    console.warn(
      '[one-cycle-preflight] source probe failed; running full cycle fail-open:',
      err instanceof Error ? err.name : 'unknown_error',
    );
    return failOpenDecision(
      'source_probe_failed',
      priorState?.snapshot ?? null,
      false,
      priorState,
      ['source_probe_failed'],
    );
  }

  if (!priorState) {
    return failOpenDecision('state_missing_or_invalid', snapshot, true, null, ['no_prior_state']);
  }
  if (priorState.forceRun) {
    // forceRun is a single boolean, so the specific cause (failed cycle,
    // incomplete cycle, untrusted snapshot, or a full listing batch) is not
    // recoverable here. Restoring a known-good state therefore means the full
    // machine — narrowing it would require distinguishing causes in persisted
    // state, which is a separate change.
    return failOpenDecision('forced_retry', snapshot, true, priorState, ['forced_retry']);
  }

  // ── FRESHNESS HEARTBEAT ─────────────────────────────────────────────
  // MOVED AHEAD OF THE SOURCE COMPARISON. It used to sit after it, which was
  // harmless while any change ran the whole machine. Now that a source change
  // can select a PARTIAL plan, an overdue heartbeat evaluated later could be
  // satisfied forever by idx_only/media_only cycles and the hourly
  // authoritative sweep would never run again.
  //
  // Forces an authoritative cycle when
  // the last SUCCESSFUL FULL cycle is missing, unparseable, in the future,
  // or older than the bound. A future timestamp is treated as defective
  // rather than "very recent" — otherwise a clock skew or a corrupted
  // write could buy unlimited silence, which is the exact failure this
  // guard exists to prevent.
  const heartbeatAt = priorState.lastSuccessfulFullCycleAt;
  const heartbeatMs = heartbeatAt ? Date.parse(heartbeatAt) : NaN;
  const heartbeatExpired =
    !Number.isFinite(heartbeatMs) ||
    heartbeatMs > now.getTime() ||
    now.getTime() - heartbeatMs >= ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS * 1000;
  if (heartbeatExpired) {
    return failOpenDecision(
      'freshness_heartbeat_due',
      snapshot,
      true,
      priorState,
      ['freshness_heartbeat_expired'],
    );
  }

  // ── PLAN SELECTION ──────────────────────────────────────────────────
  // From here the snapshot is trusted and the prior state is known, so a
  // PARTIAL plan is legitimate. Members are selected by signal:
  //   ModificationTimestamp moved -> the listing record changed  -> idx-sync
  //   PhotosChangeTimestamp moved -> the photo set changed       -> media-sync
  //   media backlog due           -> drain remaining media work  -> media-sync
  // The backlog is unioned in rather than being its own branch: a listing-only
  // change while a backlog is due needs BOTH members, and an earlier
  // `if (backlogDue)` branch would have hidden that.
  const headDelta = sourceHeadsChanged(priorState.snapshot, snapshot);
  const backlogDue = priorState.backlogPending && (
    priorState.nextBacklogRunAt === null ||
    new Date(priorState.nextBacklogRunAt).getTime() <= now.getTime()
  );

  const needsIdx = headDelta.modification;
  const needsMedia = headDelta.photos || backlogDue;

  if (!needsIdx && !needsMedia) {
    return {
      shouldRun: false,
      reason: 'source_unchanged_no_backlog_due',
      snapshot,
      snapshotTrusted: true,
      priorState,
      executionPlan: 'skip',
      headDelta,
      planReasons: ['source_unchanged', 'no_backlog_due', 'heartbeat_fresh'],
    };
  }

  const planReasons: string[] = [];
  if (headDelta.modification) planReasons.push('modification_head_moved');
  if (headDelta.photos) planReasons.push('photos_head_moved');
  if (backlogDue) planReasons.push('media_backlog_due');

  const executionPlan: OneCycleExecutionPlan =
    needsIdx && needsMedia ? 'idx_then_media' : needsIdx ? 'idx_only' : 'media_only';

  return {
    shouldRun: true,
    // Reason preserves the existing telemetry vocabulary: any head movement is
    // still `source_changed`; a pure backlog drain is still `backlog_due`.
    reason: headDelta.modification || headDelta.photos ? 'source_changed' : 'backlog_due',
    snapshot,
    snapshotTrusted: true,
    priorState,
    executionPlan,
    headDelta,
    planReasons,
  };
}

function summaryNumber(summary: Record<string, unknown> | undefined, key: string): number {
  const value = summary?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function summaryBoolean(summary: Record<string, unknown> | undefined, key: string): boolean {
  return summary?.[key] === true;
}

/**
 * Present AND numeric. Deliberately NOT {@link summaryNumber}, which folds an
 * ABSENT counter into 0 — correct for "is there a backlog", wrong for "prove
 * this lane had no failures". Absence is not evidence of zero.
 */
function summaryCounterAtLeastZero(
  summary: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = summary?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Did the SOURCE → NEON traversal itself succeed?
 *
 * WHY THIS EXISTS — the latch it removes.
 *
 * `completion.success` (app/api/cron/one-cycle/route.ts) is
 * `complete && every required member 'ok'`, and the media member reports
 * 'partial' for `rows_failed > 0 || r2_failed > 0`
 * (lib/idx/media-sync-member.ts). Those two counters are not the same kind of
 * fact:
 *
 *   - `rows_failed` is incremented in `runMediaSync` PHASE 1 (source ingest),
 *     which also pushes `ok:false` into `processed` — and that HALTS
 *     `pickKeysetWatermark`. The media keyset cursor therefore does NOT advance
 *     past the failure, so the run must be retried or those rows are only
 *     revisited if the provider head happens to move again.
 *   - `r2_failed` is incremented in PHASE 3 (R2 enrichment backlog), which runs
 *     strictly AFTER the PHASE 2 cursor checkpoint has already committed via
 *     `advanceMediaSyncCursor`. It provably cannot affect source traversal, and
 *     the failed row stays in the R2 backlog — which ALREADY has its own bounded
 *     drain schedule right here (`backlogPending` + `nextBacklogRunAt`,
 *     DEFAULT_BACKLOG_INTERVAL_SECONDS).
 *   (Phase ordering verified against lib/idx/media-sync.ts at the `── PHASE n`
 *   banners; exact line numbers deliberately omitted — that file is large and
 *   moves, the phase order is the invariant.)
 *
 * Collapsing both into `success:false` therefore DOUBLE-SCHEDULED the R2 lane:
 * once as a bounded hourly drain, and again as `forceRun`, an immediate
 * full-machine retry on the very next poll. Worse, it LATCHED in two places at
 * once — `forceRun` is cleared only by a cycle with `success:true`, and
 * `lastSuccessfulFullCycleAt` advances only on `success:true`. So any run of
 * cycles carrying a non-zero `r2_failed` for longer than one hour disabled
 * skipping outright: `forced_retry` on the next poll, then
 * `freshness_heartbeat_due` on every poll after that, until one perfectly
 * clean cycle happened.
 *
 * PROVENANCE, STATED EXACTLY. The latch is proven from these code paths and
 * from the RED runs of the direct tests; it is NOT proven from a production
 * log, and an earlier version of this comment wrongly said it was. The cited
 * sample (artifacts/.wake-redis-samples.jsonl, 2026-08-14T22:48:05Z — heads
 * unchanged, `forceRun:true`, `forced_retry`) carries `backlogPending:false`
 * in the SAME atomically-written state object, and `mediaBacklog` below
 * includes `r2_failed > 0` — so `r2_failed === 0` in that cycle and its
 * `forceRun` had another cause, one this exemption still forces. All 13
 * consecutive samples in that file show `backlogPending:false`. The FREQUENCY
 * of `r2_failed > 0` in production is therefore UNMEASURED — not "routine".
 * What is established is that the state is reachable and that it latched.
 *
 * WHAT IS NOT RELAXED. Every source-side failure still fails closed: an
 * incomplete cycle; any member that is not `ok` or `partial` (failed /
 * member_error / timed_out / skipped / budget_skipped); ANY `rows_failed`; a
 * partial IDX lane; and a `success:false` that no member in the ledger
 * explains. Evidence must be PRESENT to earn the exemption — a missing
 * `rows_failed` or `r2_failed` counter counts as unproven, never as zero.
 *
 * WHAT IS *NOT* GUARDED, SAID PLAINLY. The one thing that genuinely leaves
 * source work unconsumed is a PHASE-1 budget cut, `exit_reason ===
 * "budget_phase1"`. It is not guarded here, for two reasons, and neither is an
 * oversight:
 *   1. It is not observable. `exit_reason` matches none of the prefixes in
 *      SUMMARY_KEY_PREFIXES (app/api/cron/one-cycle/route.ts), so it never
 *      reaches this function. Do not infer it from `time_budget_exhausted` —
 *      that flag means the opposite (see below).
 *   2. Guarding it HERE ONLY would be incoherent. A `budget_phase1` cut with
 *      clean counters already yields media status `ok` → `success:true`, which
 *      advances the heartbeat and clears `forceRun` today and always has.
 *      Blocking it solely on the `r2_failed > 0` path would make that path
 *      stricter than the `r2_failed === 0` path — reinstating exactly the
 *      asymmetry this predicate exists to remove. It is also cursor-safe:
 *      PHASE 2 advances the watermark only over rows PHASE 1 actually
 *      processed, so the remainder is durably queued behind the cursor, not
 *      lost. If it should be treated as unsound, that must be decided for BOTH
 *      paths, which means surfacing `exit_reason` first.
 * Pinned as a deliberate, recorded gap by
 * tests/runtime/one-cycle-neon-wake-discriminator.test.ts section (D).
 *
 * COMPLIANCE. The hourly heartbeat guarantees an authoritative Neon-backed
 * traversal of the SOURCE inside the REBNY §2.05 24-hour window (closed-listing
 * display removed within 24h — a listing-lane status-propagation duty; see
 * docs/compliance/COMPLIANCE-CANONICAL-INDEX.md:178, the §14 Fail-closed row). An R2 mirror failure is
 * photo delivery to our own CDN; it does not falsify that traversal. Nor did
 * the old predicate make the guarantee stronger: it made the "hourly sweep"
 * fire on EVERY poll, which is not a bound, it is a constant.
 */
export function cycleTraversalSound(completion: OneCycleCompletionInput): boolean {
  // "Every member the PLAN required ran to settlement" is already decided by
  // the route and carried here as `complete`.
  if (!completion.complete) return false;

  let exemptedMembers = 0;
  for (const member of completion.members) {
    if (member.status === 'ok') continue;
    // failed / member_error / timed_out / skipped / budget_skipped — the work
    // did not settle cleanly, and none of them is an R2-lane condition.
    if (member.status !== 'partial') return false;
    // Only the media lane HAS a downstream mirror lane with its own schedule.
    // A partial IDX lane means `errors > 0` in syncListings, which freezes the
    // Property keyset cursor exactly the way a media row failure does.
    if (member.member !== ONE_CYCLE_MEMBER_MEDIA) return false;

    const rowsFailed = summaryCounterAtLeastZero(member.summary, 'rows_failed');
    const r2Failed = summaryCounterAtLeastZero(member.summary, 'r2_failed');
    if (rowsFailed === null || r2Failed === null) return false; // unproven ≠ clean
    if (rowsFailed > 0) return false;                            // source cursor frozen
    // NO `time_budget_exhausted` GUARD HERE — deliberately. This corrects a
    // factual error in the first version of this predicate, which read the flag
    // as "the budget ran out mid-traversal, so the source was not fully
    // consumed" and returned false on it.
    //
    // The flag means the opposite. lib/idx/media-sync.ts defines it as
    // `exit_reason === "budget_phase2"`, and `budget_phase2` is assignable ONLY
    // while `exitReason === "completed"` — so it is POSITIVE evidence that the
    // PHASE-1 source loop consumed its whole batch without breaking out. It
    // reports that the PHASE-3 R2 drain stopped between chunks. Blocking on it
    // left this exemption inert for the shape it most needs to cover: failed
    // mirror attempts are the slowest units in the drain, so `r2_failed > 0`
    // and `budget_phase2` correlate POSITIVELY, and a chronically large,
    // partly-failing R2 backlog produces both together.
    //
    // The same field is read CORRECTLY ~60 lines below in `mediaBacklog`, as
    // "the drain stopped early, so work remains" — which is what keeps those
    // R2 rows on the bounded hourly cadence rather than dropping them.
    // Pinned against the real media-sync source by
    // tests/runtime/one-cycle-neon-wake-discriminator.test.ts section (D).
    // `partial` with nothing in the R2 counter is an UNEXPLAINED partial.
    if (r2Failed <= 0) return false;
    exemptedMembers++;
  }

  // `success:false` over an all-`ok` member ledger cannot be reconciled from
  // here. The route should not be able to produce it; if it ever does, the safe
  // reading is that something failed which the ledger did not record.
  if (!completion.success && exemptedMembers === 0) return false;

  return true;
}

export function deriveOneCycleFollowup(
  completion: OneCycleCompletionInput,
  snapshotTrusted: boolean,
  now: Date = new Date(),
  options: {
    executionPlan?: OneCycleExecutionPlan;
    priorState?: OneCyclePreflightState | null;
  } = {},
): Pick<OneCyclePreflightState, 'forceRun' | 'backlogPending' | 'nextBacklogRunAt'> {
  const idx = completion.members.find((m) => m.member === ONE_CYCLE_MEMBER_IDX);
  const media = completion.members.find((m) => m.member === ONE_CYCLE_MEMBER_MEDIA);

  const listingBatchFull = summaryNumber(idx?.summary, 'total_fetched') >= ONE_CYCLE_SOURCE_BATCH_LIMIT;
  // `cycleTraversalSound` subsumes `completion.complete` and everything
  // `!completion.success` used to cover EXCEPT the one case the bounded media
  // backlog already schedules — see its doc comment. `snapshotTrusted` and
  // `listingBatchFull` are unchanged and still force an immediate retry.
  const forceRun = !cycleTraversalSound(completion) || !snapshotTrusted || listingBatchFull;

  // ── BACKLOG PRESERVATION ────────────────────────────────────────────
  // Only a media run that ACTUALLY REPORTED may change the backlog state.
  //
  // This function used to derive `backlogPending` purely from the current
  // completion's media member. That was safe only while every cycle ran media:
  // the member was always present, so its absence never had to be distinguished
  // from "media ran and found nothing". Partial plans broke that assumption.
  //
  // The bug it caused: prior state carries backlogPending=true with
  // nextBacklogRunAt an hour out (the default interval); the modification head
  // moves inside that hour; the planner correctly selects idx_only; the
  // completion contains no media member; `mediaBacklog` computes false; and
  // finalize overwrites a real pending backlog with false/null. The queued
  // media work is silently dropped.
  //
  // The discriminator is MEMBER EVIDENCE, not the plan, because it covers both
  // ways media can fail to report: the plan never selected it, AND the plan
  // selected it but the budget guard skipped it before it started. A skip is
  // not evidence the backlog drained.
  const mediaReported = media !== undefined && media.status !== 'budget_skipped';

  if (!mediaReported) {
    // Carry the prior state through UNCHANGED — including the original
    // deadline. Recomputing `nextBacklogRunAt` from `now` here would let a
    // stream of idx_only cycles push the backlog out indefinitely.
    return {
      forceRun,
      backlogPending: options.priorState?.backlogPending ?? false,
      nextBacklogRunAt: options.priorState?.nextBacklogRunAt ?? null,
    };
  }

  const mediaBacklog =
    summaryNumber(media?.summary, 'backlog_remaining') > 0 ||
    // `failures` is DEAD TODAY and deliberately kept. It is an exact alias of
    // `r2_failed` (declared as such in lib/idx/media-sync.ts), but it reaches
    // nothing: SUMMARY_KEY_PREFIXES (app/api/cron/one-cycle/route.ts) contains
    // 'failed', and 'failures'.startsWith('failed') is FALSE, so the executor
    // filters the key out before this function sees it. `summaryNumber` folds
    // the absent key to 0, so the term is inert and the decision below is
    // identical with or without it. Deleting it would silently drop an input
    // the moment the alias stops holding; the honest fix is to make the
    // deadness a PINNED FACT instead — see
    // tests/runtime/one-cycle-neon-wake-discriminator.test.ts section (D),
    // which fails loud if `failures` ever becomes observable here.
    summaryNumber(media?.summary, 'failures') > 0 ||
    summaryNumber(media?.summary, 'r2_failed') > 0 ||
    summaryBoolean(media?.summary, 'time_budget_exhausted');

  return {
    forceRun,
    backlogPending: mediaBacklog,
    nextBacklogRunAt: mediaBacklog
      ? new Date(now.getTime() + backlogIntervalSeconds() * 1000).toISOString()
      : null,
  };
}

/**
 * Persist completion state after the Neon-backed cycle settles.
 * Best-effort only: failure leaves the next invocation fail-open.
 */
export async function finalizeOneCyclePreflight(
  decision: OneCyclePreflightDecision,
  completion: OneCycleCompletionInput,
  now: Date = new Date(),
): Promise<OneCycleFinalizeOutcome> {
  // Separated: "no client" is an env problem, "no snapshot" is a normal
  // fail-open cycle that had nothing to persist. Collapsing them hid the former.
  if (!redis) return 'redis_client_missing';
  if (!decision.snapshot) return 'no_snapshot';
  // priorState is load-bearing: when this cycle did not run media, the followup
  // must carry the previous backlog forward rather than assert it is gone.
  const followup = deriveOneCycleFollowup(completion, decision.snapshotTrusted, now, {
    executionPlan: decision.executionPlan,
    priorState: decision.priorState,
  });
  const state: OneCyclePreflightState = {
    version: ONE_CYCLE_PREFLIGHT_VERSION,
    snapshot: decision.snapshot,
    ...followup,
    lastCompletedAt: now.toISOString(),
    // Heartbeat advances ONLY on an AUTHORITATIVE cycle whose SOURCE→NEON
    // traversal was sound. An incomplete run, a failed/timed-out member, a
    // frozen cursor or a partial listing lane must not buy another hour of
    // silence — those carry the prior value forward (or stay null), so the next
    // poll keeps forcing a run until the machine is genuinely healthy again.
    //
    // `planIsAuthoritative` is what makes partial plans safe: a successful
    // idx_only or media_only cycle is a real success, but it did NOT run the
    // whole machine, so it must not reset the compliance clock. Without it, one
    // photo-only cycle per hour would satisfy the heartbeat forever and the
    // hourly authoritative sweep would silently stop happening.
    //
    // `cycleTraversalSound` replaces the previous `completion.success &&
    // completion.complete`. It keeps every source-side failure frozen and
    // exempts ONLY a downstream R2-mirror failure, which is already scheduled
    // on the bounded media backlog — see its doc comment. Under the old
    // predicate a chronic `r2_failed` froze this clock permanently, so the
    // hourly bound degenerated into "run on every poll" and the guarantee
    // stopped being a guarantee.
    lastSuccessfulFullCycleAt:
      cycleTraversalSound(completion) && planIsAuthoritative(decision.executionPlan)
        ? now.toISOString()
        : decision.priorState?.lastSuccessfulFullCycleAt ?? null,
    lastOutcome: completion.outcome,
  };
  try {
    await redis.set(ONE_CYCLE_PREFLIGHT_KEY, state);
    return 'ok';
  } catch (err) {
    // Runs AFTER the Neon cycle, so this is NOT a decision reason and must
    // never be reported as one. It is still load-bearing: a failed write means
    // the next poll finds no state and forces another full cycle, so silently
    // swallowing it looks exactly like a healthy machine that never skips —
    // which is indistinguishable from the production symptom being chased.
    console.warn(
      '[one-cycle-preflight] completion state write failed; next poll will fail open:',
      err instanceof Error ? err.name : 'unknown_error',
    );
    return 'redis_write_failed';
  }
}
