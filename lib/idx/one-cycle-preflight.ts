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

export interface OneCyclePreflightState {
  version: typeof ONE_CYCLE_PREFLIGHT_VERSION;
  snapshot: SourceSnapshot;
  /** Immediate retry: failed/incomplete cycle or listing batch hit its cap. */
  forceRun: boolean;
  /** Media/R2 backlog still exists, but is drained on a bounded lower cadence. */
  backlogPending: boolean;
  nextBacklogRunAt: string | null;
  lastCompletedAt: string | null;
  lastOutcome: 'success' | 'partial' | 'incomplete' | null;
}

export interface OneCyclePreflightDecision {
  shouldRun: boolean;
  reason:
    | 'external_state_unavailable'
    | 'state_missing_or_invalid'
    | 'source_probe_failed'
    | 'forced_retry'
    | 'source_changed'
    | 'backlog_due'
    | 'source_unchanged_no_backlog_due';
  snapshot: SourceSnapshot | null;
  snapshotTrusted: boolean;
  priorState: OneCyclePreflightState | null;
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
    lastOutcome,
  };
}

function headEqual(a: SourceHead, b: SourceHead): boolean {
  return a.timestamp === b.timestamp &&
    a.listingKey === b.listingKey &&
    a.populationAtHead === b.populationAtHead;
}

export function sourceSnapshotChanged(prior: SourceSnapshot, current: SourceSnapshot): boolean {
  return !headEqual(prior.modification, current.modification) || !headEqual(prior.photos, current.photos);
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
export async function decideOneCyclePreflight(now: Date = new Date()): Promise<OneCyclePreflightDecision> {
  if (!redis) {
    return {
      shouldRun: true,
      reason: 'external_state_unavailable',
      snapshot: null,
      snapshotTrusted: false,
      priorState: null,
    };
  }

  let priorState: OneCyclePreflightState | null = null;
  try {
    priorState = parseOneCyclePreflightState(
      await redis.get<unknown>(ONE_CYCLE_PREFLIGHT_KEY),
    );
  } catch {
    return {
      shouldRun: true,
      reason: 'external_state_unavailable',
      snapshot: null,
      snapshotTrusted: false,
      priorState: null,
    };
  }

  let snapshot: SourceSnapshot;
  try {
    snapshot = await captureSourceSnapshot(priorState?.snapshot ?? null, now);
  } catch (err) {
    console.warn(
      '[one-cycle-preflight] source probe failed; running full cycle fail-open:',
      err instanceof Error ? err.name : 'unknown_error',
    );
    return {
      shouldRun: true,
      reason: 'source_probe_failed',
      snapshot: priorState?.snapshot ?? null,
      snapshotTrusted: false,
      priorState,
    };
  }

  if (!priorState) {
    return {
      shouldRun: true,
      reason: 'state_missing_or_invalid',
      snapshot,
      snapshotTrusted: true,
      priorState: null,
    };
  }
  if (priorState.forceRun) {
    return {
      shouldRun: true,
      reason: 'forced_retry',
      snapshot,
      snapshotTrusted: true,
      priorState,
    };
  }
  if (sourceSnapshotChanged(priorState.snapshot, snapshot)) {
    return {
      shouldRun: true,
      reason: 'source_changed',
      snapshot,
      snapshotTrusted: true,
      priorState,
    };
  }

  const backlogDue = priorState.backlogPending && (
    priorState.nextBacklogRunAt === null ||
    new Date(priorState.nextBacklogRunAt).getTime() <= now.getTime()
  );
  if (backlogDue) {
    return {
      shouldRun: true,
      reason: 'backlog_due',
      snapshot,
      snapshotTrusted: true,
      priorState,
    };
  }

  return {
    shouldRun: false,
    reason: 'source_unchanged_no_backlog_due',
    snapshot,
    snapshotTrusted: true,
    priorState,
  };
}

function summaryNumber(summary: Record<string, unknown> | undefined, key: string): number {
  const value = summary?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function summaryBoolean(summary: Record<string, unknown> | undefined, key: string): boolean {
  return summary?.[key] === true;
}

export function deriveOneCycleFollowup(
  completion: OneCycleCompletionInput,
  snapshotTrusted: boolean,
  now: Date = new Date(),
): Pick<OneCyclePreflightState, 'forceRun' | 'backlogPending' | 'nextBacklogRunAt'> {
  const idx = completion.members.find((m) => m.member === 'idx-sync');
  const media = completion.members.find((m) => m.member === 'media-sync');

  const listingBatchFull = summaryNumber(idx?.summary, 'total_fetched') >= ONE_CYCLE_SOURCE_BATCH_LIMIT;
  const mediaBacklog =
    summaryNumber(media?.summary, 'backlog_remaining') > 0 ||
    summaryNumber(media?.summary, 'failures') > 0 ||
    summaryNumber(media?.summary, 'r2_failed') > 0 ||
    summaryBoolean(media?.summary, 'time_budget_exhausted');

  const forceRun = !completion.success || !completion.complete || !snapshotTrusted || listingBatchFull;
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
): Promise<void> {
  if (!redis || !decision.snapshot) return;
  const followup = deriveOneCycleFollowup(completion, decision.snapshotTrusted, now);
  const state: OneCyclePreflightState = {
    version: ONE_CYCLE_PREFLIGHT_VERSION,
    snapshot: decision.snapshot,
    ...followup,
    lastCompletedAt: now.toISOString(),
    lastOutcome: completion.outcome,
  };
  try {
    await redis.set(ONE_CYCLE_PREFLIGHT_KEY, state);
  } catch (err) {
    console.warn(
      '[one-cycle-preflight] completion state write failed; next poll will fail open:',
      err instanceof Error ? err.name : 'unknown_error',
    );
  }
}
