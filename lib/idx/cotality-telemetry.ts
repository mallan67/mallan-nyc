/**
 * Cotality (Trestle) request telemetry — durable, queryable usage counters.
 *
 * Purpose: make the Cotality API load MEASURABLE now that One Cycle runs the
 * feed/media members every 10 minutes (IDX 48→144/day, media 24→144/day). The
 * fetch/auth layer increments a per-run singleton; the idx-sync / media-sync
 * cron routes RESET it before their work and SNAPSHOT it after, writing the
 * snapshot into their durable audit event (idx_sync_cron / media_sync_cron)
 * correlated with the One Cycle run_id.
 *
 * Safety: this module ONLY counts. It never changes the Cotality endpoint,
 * credentials, mapping, filters, or authorization contract. The singleton is
 * safe because sync runs are strictly sequential (One Cycle awaits idx before
 * media; the overlap guard prevents concurrent cycles) — reset/snapshot bracket
 * each member's work.
 */

export interface CotalityCounters {
  /** Logical property fetch operations (fetchFromTrestle / single / by-address). */
  property_requests: number;
  /** HTTP pages fetched against the Property resource. */
  property_pages: number;
  /** Logical media fetch operations (fetchListingMedia). */
  media_requests: number;
  /** HTTP pages fetched against the Media resource. */
  media_pages: number;
  /** OAuth token-endpoint calls. */
  token_requests: number;
  /** Forced token re-acquisitions (cache invalidation after a 401). */
  token_refreshes: number;
  /** Backoff retries performed (5xx). */
  retries: number;
  /** HTTP 429 responses observed. */
  http_429_count: number;
  /** Max Retry-After (seconds) observed on a 429, if the header was supplied. */
  retry_after_seconds: number;
  /** Total wall-clock spent in Cotality HTTP calls (ms). */
  cotality_duration_ms: number;
  /** Every HTTP call to Cotality (property + media + token). */
  total_cotality_requests: number;
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

let counters: CotalityCounters = zero();

/** Reset counters at the start of a member's Cotality work. */
export function resetCotalityTelemetry(): void {
  counters = zero();
}

/** Immutable snapshot of the current counters (for the member audit event). */
export function snapshotCotalityTelemetry(): CotalityCounters {
  return { ...counters };
}

/**
 * Record one raw Cotality HTTP call. `url` decides property vs media pages
 * (the Media resource path is `/odata/Media`). 429s are counted and the
 * Retry-After (seconds) is captured when present.
 */
export function recordCotalityHttp(args: {
  url: string;
  durationMs: number;
  status: number;
  retryAfterSeconds?: number | null;
}): void {
  counters.total_cotality_requests++;
  counters.cotality_duration_ms += Math.max(0, Math.round(args.durationMs));
  if (/\/odata\/Media(\?|$|\/)/i.test(args.url)) {
    counters.media_pages++;
  } else {
    counters.property_pages++;
  }
  if (args.status === 429) {
    counters.http_429_count++;
    if (
      typeof args.retryAfterSeconds === 'number' &&
      Number.isFinite(args.retryAfterSeconds) &&
      args.retryAfterSeconds > counters.retry_after_seconds
    ) {
      counters.retry_after_seconds = args.retryAfterSeconds;
    }
  }
}

export function recordPropertyRequest(): void {
  counters.property_requests++;
}
export function recordMediaRequest(): void {
  counters.media_requests++;
}
/** A token-endpoint call (also counts toward total + duration). */
export function recordTokenRequest(durationMs: number): void {
  counters.token_requests++;
  counters.total_cotality_requests++;
  counters.cotality_duration_ms += Math.max(0, Math.round(durationMs));
}
/** A forced token re-acquisition (cache invalidated after a 401). */
export function recordTokenRefresh(): void {
  counters.token_refreshes++;
}
export function recordRetry(): void {
  counters.retries++;
}

/** Parse a Retry-After header (seconds form) → seconds, or null. */
export function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const n = Number(headerValue.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
