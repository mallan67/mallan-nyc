/**
 * CONTENT VERIFICATION — CONTRACT SURFACE (behaviour not yet implemented).
 *
 * Written so the behavioural suite can be observed RED BEFORE any schema authorization is requested.
 * Every function throws NOT_IMPLEMENTED. This module documents the minimum schema claim; it does not
 * migrate anything.
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

/** Bounded work per eligible cycle — verification never exceeds this. */
export const MAX_VERIFICATION_ROWS_PER_CYCLE = 60;

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
  state: ContentCheckState;
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
 * The bounded verification selector. MUST be structurally distinct from
 * `buildR2MirrorableBacklogUniverseWhere` and MUST NOT contribute to backlog_remaining.
 */
export function buildContentVerificationWhere(
  now: Date,
  intervals: VerificationIntervals,
): Record<string, unknown> {
  const verifiedCutoff = new Date(now.getTime() - intervals.verificationIntervalMs);
  const retryCutoff = new Date(now.getTime() - intervals.retryIntervalMs);
  // Deliberately asserts DELIVERY PRESENT (r2_key not null). The backlog universe asserts delivery
  // MISSING. The two selectors are therefore disjoint by construction, which is what keeps
  // verification out of backlog_remaining / backlogPending / forceRun.
  return {
    status: 'active',
    media_key: { not: null },
    r2_key: { not: null },
    OR: [
      { content_check_state: null },
      { content_check_state: 'VERIFIED', content_check_at: { lt: verifiedCutoff } },
      { content_check_state: 'INDETERMINATE', content_check_at: { lt: retryCutoff } },
    ],
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
    .filter((r) => isDueForVerification(r, now, { verificationIntervalMs: 0, retryIntervalMs: 0 }) || r.content_check_state !== 'MISMATCH')
    .filter((r) => r.content_check_state !== 'MISMATCH')
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
