// P1C6b: pure deterministic orphan-chunk selection for feed-reconcile.
//
// Probe-sized (operator-run 2026-06-12): 1,361 eligible Pending orphans —
// a pre-seed cohort (2025-10..12) plus the May-2026 incident-era leak (406 in
// 2026-05 vs 1 in healthy April; the writer-loop fixes closed the go-forward
// path, this drains the residue). Abort-all on the orphan side would block
// the catch-up forever; chunked import bounds writes per nightly run instead.
// The DESTRUCTIVE ghost direction keeps abort-all semantics (route, untouched).
//
// DETERMINISTIC ORDER (documented, stable, replayable): ListingId ascending,
// localeCompare with 'en' + numeric:false — pure code-point-stable string
// ordering. The set shrinks front-first each night, so positions are
// monotone: probe positions 514/550/649 (the 3 known ghosts) land on nightly
// runs 2-3 at chunkSize=300.

export interface OrphanChunkInput {
  ListingId: string;
}

export interface OrphanChunkResult<T> {
  /** Eligible after archive exclusion — drives total_eligible. */
  totalEligible: number;
  /** Ids present in listings_archive — EXCLUDED from import (Maya rule: even at 0 today). */
  archiveOverlap: number;
  /** The bounded, deterministically-ordered import set for THIS run. */
  chunk: T[];
  /** total_eligible - chunk.length (what later nights will see, modulo feed drift). */
  remainingAfter: number;
}

export const ORPHAN_CHUNK_SIZE = 300;

/**
 * SANITY cap on the eligible total — a count this large signals a feed reset
 * or a broken local-id read, not a real backlog (probe truth: 1,361). The
 * route aborts-all above this, same spirit as the ghost cap.
 */
export const ORPHAN_TOTAL_SANITY_CAP = 5000;

export function selectOrphanChunk<T extends OrphanChunkInput>(
  orphanRows: T[],
  archivedIds: ReadonlySet<string>,
  chunkSize: number = ORPHAN_CHUNK_SIZE,
): OrphanChunkResult<T> {
  const eligible: T[] = [];
  let archiveOverlap = 0;
  for (const row of orphanRows) {
    if (archivedIds.has(row.ListingId)) archiveOverlap++;
    else eligible.push(row);
  }
  eligible.sort((a, b) => a.ListingId.localeCompare(b.ListingId, "en", { numeric: false }));
  const chunk = eligible.slice(0, chunkSize);
  return {
    totalEligible: eligible.length,
    archiveOverlap,
    chunk,
    remainingAfter: eligible.length - chunk.length,
  };
}
