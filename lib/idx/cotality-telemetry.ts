/**
 * Cotality (Trestle) request telemetry — RUN-SCOPED via AsyncLocalStorage.
 *
 * Purpose: make the per-sync-member Cotality API load MEASURABLE (idx-sync /
 * media-sync run every 10 minutes under One Cycle). Each member invocation runs
 * its work inside `runWithCotalityTelemetry(collector, fn)`; the fetch/auth
 * layer increments the CURRENT context's collector. The member route snapshots
 * the collector into its durable audit event, correlated with the One Cycle
 * run_id.
 *
 * ISOLATION (why AsyncLocalStorage, not a module singleton): a concurrent
 * public page render, a manual trigger, or any other Cotality caller runs in a
 * DIFFERENT async context — its record* calls resolve to a DIFFERENT collector
 * (or none) and CANNOT alter a sync member's counters. A caller outside any
 * telemetry context is a no-op (never contaminates an active member context).
 *
 * Safety: this module ONLY counts. It never changes the Cotality endpoint,
 * credentials, mapping, filters, or authorization contract.
 *
 * SCOPE NOTE: the counters are PER-MEMBER (the sync member's own Cotality
 * volume), NOT a system-wide total across every live Cotality caller.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface CotalityCounters {
  /** Logical property fetch operations (fetchFromTrestle / single / by-address). */
  property_requests: number;
  /** HTTP pages fetched against the Property resource (incl. thrown attempts). */
  property_pages: number;
  /** Logical media fetch operations (fetchListingMedia). */
  media_requests: number;
  /** HTTP pages fetched against the Media resource (incl. thrown attempts). */
  media_pages: number;
  /** OAuth token-endpoint calls. */
  token_requests: number;
  /** Forced token re-acquisitions (cache invalidation after a 401). */
  token_refreshes: number;
  /** Backoff retries performed (5xx). */
  retries: number;
  /** HTTP 429 responses observed. */
  http_429_count: number;
  /** Max Retry-After (seconds) observed on a 429, if supplied. */
  retry_after_seconds: number;
  /** Total wall-clock in Cotality HTTP calls (ms) — incl. calls that threw. */
  cotality_duration_ms: number;
  /** Every attempted HTTP call to Cotality (property + media + token), incl.
   *  attempts that threw before returning a Response. */
  total_cotality_requests: number;
}

/** One isolated collector per member invocation. */
export interface CotalityCollector {
  member: string;
  one_cycle_run_id: string | null;
  counters: CotalityCounters;
}

function zero(): CotalityCounters {
  return {
    property_requests: 0,
    property_pages: 0,
    media_requests: 0,
    media_pages: 0,
    token_requests: 0,
    token_refreshes: 0,
    retries: 0,
    http_429_count: 0,
    retry_after_seconds: 0,
    cotality_duration_ms: 0,
    total_cotality_requests: 0,
  };
}

const als = new AsyncLocalStorage<CotalityCollector>();

/** Create a fresh, isolated collector for one member invocation. */
export function createCotalityCollector(
  member: string,
  oneCycleRunId: string | null,
): CotalityCollector {
  return { member, one_cycle_run_id: oneCycleRunId, counters: zero() };
}

/** Run `fn` (the member's work) with `collector` as the active telemetry context. */
export function runWithCotalityTelemetry<T>(
  collector: CotalityCollector,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(collector, fn);
}

/** Immutable snapshot of a collector (call after the run — success OR error). */
export function snapshotCollector(collector: CotalityCollector): CotalityCounters {
  return { ...collector.counters };
}

/** The current context's counters, or null when called outside any member run. */
function current(): CotalityCounters | null {
  const c = als.getStore();
  return c ? c.counters : null;
}

/**
 * Record one raw Cotality HTTP call. `status === 0` marks an attempt that THREW
 * before returning a Response (network error / abort / timeout) — still counted
 * toward total + duration + pages. `url` decides property vs media pages.
 */
export function recordCotalityHttp(args: {
  url: string;
  durationMs: number;
  status: number;
  retryAfterSeconds?: number | null;
}): void {
  const c = current();
  if (!c) return; // outside a member context — never contaminate
  c.total_cotality_requests++;
  c.cotality_duration_ms += Math.max(0, Math.round(args.durationMs));
  if (/\/odata\/Media(\?|$|\/)/i.test(args.url)) {
    c.media_pages++;
  } else {
    c.property_pages++;
  }
  if (args.status === 429) {
    c.http_429_count++;
    if (
      typeof args.retryAfterSeconds === 'number' &&
      Number.isFinite(args.retryAfterSeconds) &&
      args.retryAfterSeconds > c.retry_after_seconds
    ) {
      c.retry_after_seconds = args.retryAfterSeconds;
    }
  }
}

export function recordPropertyRequest(): void {
  const c = current();
  if (c) c.property_requests++;
}
export function recordMediaRequest(): void {
  const c = current();
  if (c) c.media_requests++;
}
/** A token-endpoint call (also counts toward total + duration). */
export function recordTokenRequest(durationMs: number): void {
  const c = current();
  if (!c) return;
  c.token_requests++;
  c.total_cotality_requests++;
  c.cotality_duration_ms += Math.max(0, Math.round(durationMs));
}
/** A forced token re-acquisition (cache invalidated after a 401). */
export function recordTokenRefresh(): void {
  const c = current();
  if (c) c.token_refreshes++;
}
export function recordRetry(): void {
  const c = current();
  if (c) c.retries++;
}

/** Parse a Retry-After header (seconds form) → seconds, or null. */
export function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const n = Number(headerValue.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
