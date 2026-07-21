/**
 * Fail-closed gallery reconciliation for one listing.
 *
 * THE DEFECT THIS REPLACES: the prior pipeline treated an empty/partial Media
 * response as "this listing has no media" and tombstoned the gallery — an
 * empty-200 or a truncated page wiped real seller photos. This state machine
 * refuses to destroy on any suspect signal and requires a SECOND independent
 * fetch to confirm an absence-based removal.
 *
 * Decisions (in guard order):
 *   1. incoming === null (fetch failed / 5xx / timeout)         → fail closed
 *   2. fetchComplete === false (pagination truncated)           → fail closed
 *   3. no live incoming rows while photos exist / PhotosCount>0  → fail closed
 *   4. abrupt shrink (live < 50% of existing active)            → fail closed
 *   5. mass destruction (> MASS_TOMBSTONE_ROWS vanished)        → fail closed (breaker)
 *   otherwise (healthy fetch):
 *     - present + identical (identity comparator, URL excluded) → skipUnchanged
 *     - present + changed identity                             → updateChanged
 *     - present + not in DB                                    → insert
 *     - incoming row explicitly MediaStatus='Deleted'          → explicitTombstone (always)
 *     - existing active row absent from incoming, first time   → pendingRemoval (stamp runId)
 *     - existing active row absent AND flagged in a PRIOR run  → confirmedTombstone
 *
 * Pure — no DB, no network. The caller applies the returned buckets.
 */
import { mediaRowUnchanged, type ComparableMediaRow } from "@/lib/media/media-identity";

/** Max absence-based removals per listing before the breaker aborts the run. */
export const MASS_TOMBSTONE_ROWS = 25;
/** A live gallery must retain at least this fraction of its existing size. */
export const MIN_RETAINED_FRACTION = 0.5;

/** A stored row, plus the second-fetch confirmation stamp. */
export interface ExistingMediaRow extends ComparableMediaRow {
  pending_removal_run: string | null;
}

/** A feed row for this listing (carries the raw Trestle MediaStatus). */
export interface IncomingMedia extends ComparableMediaRow {
  /** Trestle MediaStatus: 'Active' | 'Deleted' | 'Other' | null. */
  media_status: string | null;
}

export interface ReconcileInput {
  existing: ExistingMediaRow[];
  /** Feed rows for this listing; null = the fetch itself failed/was unavailable. */
  incoming: IncomingMedia[] | null;
  /** Was Media pagination COMPLETE for this listing? */
  fetchComplete: boolean;
  /** Property.PhotosCount corroboration, or null if unknown. */
  photosCount: number | null;
  /** This run's id — stamped onto newly pending_removal rows. */
  runId: string;
}

export interface ReconcileResult {
  insert: IncomingMedia[];
  updateChanged: IncomingMedia[];
  skipUnchanged: ExistingMediaRow[];
  explicitTombstone: ExistingMediaRow[];
  pendingRemoval: ExistingMediaRow[];
  confirmedTombstone: ExistingMediaRow[];
  /** The runId to stamp on pendingRemoval rows (echoed for the caller). */
  pendingRemovalRun: string;
  failClosed: boolean;
  reason?: string;
}

const empty = (input: ReconcileInput, failClosed: boolean, reason?: string): ReconcileResult => ({
  insert: [],
  updateChanged: [],
  skipUnchanged: [],
  explicitTombstone: [],
  pendingRemoval: [],
  confirmedTombstone: [],
  pendingRemovalRun: input.runId,
  failClosed,
  reason,
});

const isDeleted = (m: IncomingMedia): boolean =>
  (m.media_status ?? "").toLowerCase() === "deleted";

export function reconcileGallery(input: ReconcileInput): ReconcileResult {
  const { existing, incoming, fetchComplete, photosCount, runId } = input;

  // ── Guard 1: the fetch itself is untrustworthy ──────────────────────────
  if (incoming === null) return empty(input, true, "fetch_unavailable");
  if (!fetchComplete) return empty(input, true, "incomplete_pagination");

  const existingActive = existing.filter((r) => r.status === "active");
  const incomingLive = incoming.filter((m) => !isDeleted(m));

  // ── Guard 2: an empty (or all-deleted) response that contradicts state ───
  if (incomingLive.length === 0) {
    if (existingActive.length > 0) return empty(input, true, "empty_response_with_existing");
    if ((photosCount ?? 0) > 0) return empty(input, true, "photoscount_contradicts_empty");
    // Genuinely no media, and nothing contradicts it → clean no-op.
    return empty(input, false);
  }

  // ── Guard 3: abrupt shrink — a live gallery that lost more than half ─────
  if (
    existingActive.length > 0 &&
    incomingLive.length < MIN_RETAINED_FRACTION * existingActive.length
  ) {
    return empty(input, true, "abrupt_shrink");
  }

  // ── Healthy fetch: classify each row ─────────────────────────────────────
  const existingByKey = new Map(existing.map((r) => [r.media_key, r]));
  const incomingByKey = new Map(incoming.map((m) => [m.media_key, m]));

  const result = empty(input, false);

  for (const m of incoming) {
    if (isDeleted(m)) {
      const ex = existingByKey.get(m.media_key);
      if (ex && ex.status === "active") result.explicitTombstone.push(ex);
      continue;
    }
    const ex = existingByKey.get(m.media_key);
    if (!ex) result.insert.push(m);
    else if (mediaRowUnchanged(ex, m)) result.skipUnchanged.push(ex);
    else result.updateChanged.push(m);
  }

  // Absence-based removals: existing ACTIVE rows the feed no longer lists at all.
  const vanished = existingActive.filter((ex) => !incomingByKey.has(ex.media_key));

  // ── Guard 4: mass-tombstone circuit breaker ─────────────────────────────
  if (vanished.length > MASS_TOMBSTONE_ROWS) {
    return empty(input, true, `mass_tombstone_breaker:${vanished.length}`);
  }

  for (const ex of vanished) {
    // Confirmed only when a DIFFERENT prior run already flagged it and it is
    // STILL absent now — two independent fetches agree it is gone.
    if (ex.pending_removal_run != null && ex.pending_removal_run !== runId) {
      result.confirmedTombstone.push(ex);
    } else {
      result.pendingRemoval.push(ex);
    }
  }

  return result;
}
