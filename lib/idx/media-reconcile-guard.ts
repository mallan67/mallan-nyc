// lib/idx/media-reconcile-guard.ts
//
// Phase 2A · CODE-2 — pure two-strike reconciliation decision engine (spec §4.3).
//
// Given a listing's freshly-fetched COMPLETE feed set (already validity-gated +
// hashed by media-set-hash.ts) and the persisted per-listing sync-state, decide
// what the media-sync loop should do. This module is PURE (no Prisma, no IO) so
// the fixed reconciliation truth table (§12.5) is unit-testable in isolation and
// the caller (media-sync.ts) only has to execute the returned decision.
//
// SAFETY DOCTRINE (all encoded below, proven by property tests):
//   - An UNSAFE set (invalid hash) is NEVER destructive.
//   - An IMPLICIT disappearance (a previously-active feed MediaKey absent from the
//     candidate set, with no explicit keyed removal) is confirmed ONLY by two
//     identical complete observations in TWO DISTINCT natural cycles, with
//     non-regressing PhotosChangeTimestamp AND source ModificationTimestamp.
//   - A same-cycle re-observation can NEVER confirm (prevents overlapping
//     executions double-counting).
//   - Additions / material updates / explicit keyed removals are always safe and
//     never gated by the two-strike rule.

import type { MediaSetHashResult } from "./media-set-hash";

/** Persisted observed pending-candidate state (mirrors listing_media_sync_state
 *  pending_* columns). Distinct from the successfully-reconciled checkpoint. */
export interface PendingCandidateState {
  candidateSetHash: string | null;
  candidateMediaCount: number | null;
  missingMediaCount: number | null;
  photosChangeTimestamp: Date | null;
  sourceModificationTs: Date | null;
  firstObservedAt: Date | null;
  lastObservationRunId: string | null;
  confirmationCount: number;
}

export interface ReconcileGuardInput {
  listingKey: string;
  /** The current natural One-Cycle run id (never a concurrent duplicate's id). */
  cycleRunId: string;
  /** Result of stableMediaSetHash over the COMPLETE candidate feed set. */
  hashResult: MediaSetHashResult;
  /** Active, non-crm feed MediaKeys currently stored for the listing. */
  previousActiveFeedKeys: string[];
  /** MediaKeys in the (valid) candidate feed set. */
  candidateFeedKeys: string[];
  /** Persisted pending state, or null when none. */
  pending: PendingCandidateState | null;
  /** Property.PhotosChangeTimestamp observed this cycle. */
  observedPct: Date | null;
  /** Source ModificationTimestamp observed this cycle. */
  observedSourceModTs: Date | null;
  /** last_complete_media_set_hash from the successful checkpoint (or null). */
  lastCheckpointHash: string | null;
  /** Test seam — wall clock for firstObservedAt. */
  now: Date;
}

export type ReconcileAction =
  | "unsafe_retry" // §4.3b validity failed — no destructive action, retry
  | "reconcile_normal" // no implicit disappearance — safe to reconcile + checkpoint
  | "record_pending" // strike 1, or a non-confirming re-observation
  | "confirm_removal" // strike 2 confirmed — tombstone the missing feed rows
  | "no_op"; // candidate == confirmed checkpoint, nothing to do

export interface ReconcileDecision {
  action: ReconcileAction;
  /** Pass as `tombstoneVanished` to upsertListingMedia (true ONLY when safe). */
  tombstoneVanishedFeed: boolean;
  /** Whether to update the hero/photo-count summary. */
  updateSummary: boolean;
  /** Whether to write the successful checkpoint (last_* fields). */
  advanceCheckpoint: boolean;
  /** The hash to checkpoint (when advanceCheckpoint). */
  checkpointHash: string | null;
  /** Pending-candidate row to persist; null ⇒ clear pending. */
  pendingWrite: PendingCandidateState | null;
  /** Revalidate caches — ONLY after the DB transaction commits. */
  invalidateCachesAfterCommit: boolean;
  /** Short machine reason for telemetry. */
  reason: string;
}

function missingKeys(prev: string[], candidate: string[]): string[] {
  const c = new Set(candidate);
  return prev.filter((k) => !c.has(k));
}

/** True when `a` does not regress before `b`. A null prior bound never blocks;
 *  a regression to null (had a bound, now none) DOES block (fail-closed). */
function nonRegressing(a: Date | null, b: Date | null): boolean {
  if (b == null) return true;
  if (a == null) return false;
  return a.getTime() >= b.getTime();
}

export function decideReconcile(input: ReconcileGuardInput): ReconcileDecision {
  // 1. Unsafe set → never destructive; keep any existing pending untouched.
  if (!input.hashResult.ok) {
    return {
      action: "unsafe_retry",
      tombstoneVanishedFeed: false,
      updateSummary: false,
      advanceCheckpoint: false,
      checkpointHash: null,
      pendingWrite: input.pending,
      invalidateCachesAfterCommit: false,
      reason: `invalid:${input.hashResult.reasons.join(",")}`,
    };
  }

  const candHash = input.hashResult.hash;
  const missing = missingKeys(input.previousActiveFeedKeys, input.candidateFeedKeys);

  // 2. No implicit disappearance (candidate ⊇ previously-active feed).
  if (missing.length === 0) {
    // Already the confirmed checkpoint → true no-op (no cache work).
    if (input.lastCheckpointHash === candHash) {
      return {
        action: "no_op",
        tombstoneVanishedFeed: false,
        updateSummary: false,
        advanceCheckpoint: false,
        checkpointHash: candHash,
        pendingWrite: null,
        invalidateCachesAfterCommit: false,
        reason: "unchanged_confirmed",
      };
    }
    // Safe to reconcile normally: tombstoneVanished is harmless (nothing implicitly
    // vanished) and still applies explicit keyed removals; reset any pending.
    return {
      action: "reconcile_normal",
      tombstoneVanishedFeed: true,
      updateSummary: true,
      advanceCheckpoint: true,
      checkpointHash: candHash,
      pendingWrite: null,
      invalidateCachesAfterCommit: true,
      reason: "no_implicit_disappearance",
    };
  }

  // 3. Implicit disappearance → two-strike on the candidate.
  const p = input.pending;
  const priorStrike = p != null && p.confirmationCount > 0 && p.candidateSetHash != null;
  const sameCandidate = !!priorStrike && p!.candidateSetHash === candHash;

  const confirms =
    sameCandidate &&
    p!.lastObservationRunId !== input.cycleRunId && // (1) distinct natural cycle
    nonRegressing(input.observedPct, p!.photosChangeTimestamp) && // (6) PCT non-regress
    nonRegressing(input.observedSourceModTs, p!.sourceModificationTs); // (7) src ts non-regress

  if (confirms) {
    return {
      action: "confirm_removal",
      tombstoneVanishedFeed: true,
      updateSummary: true,
      advanceCheckpoint: true,
      checkpointHash: candHash,
      pendingWrite: null,
      invalidateCachesAfterCommit: true,
      reason: "strike2_confirmed",
    };
  }

  // Strike 1, or a non-confirming re-observation (same cycle / different candidate
  // / regressing ts) → record/refresh pending; NO tombstone, NO checkpoint.
  const pendingWrite: PendingCandidateState = {
    candidateSetHash: candHash,
    candidateMediaCount: input.candidateFeedKeys.length,
    missingMediaCount: missing.length,
    photosChangeTimestamp: input.observedPct,
    sourceModificationTs: input.observedSourceModTs,
    firstObservedAt: sameCandidate ? p!.firstObservedAt ?? input.now : input.now,
    lastObservationRunId: input.cycleRunId,
    confirmationCount: sameCandidate ? p!.confirmationCount : 1,
  };
  return {
    action: "record_pending",
    tombstoneVanishedFeed: false,
    updateSummary: false,
    advanceCheckpoint: false,
    checkpointHash: null,
    pendingWrite,
    invalidateCachesAfterCommit: false,
    reason: sameCandidate ? "pending_refresh" : "strike1_recorded",
  };
}
