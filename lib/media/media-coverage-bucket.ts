// lib/media/media-coverage-bucket.ts
//
// READ-ONLY media-coverage bucketing for the 2026-07-16 media remediation packet.
//
// PURE function over per-listing metrics — NO IO. The audit gathers the metrics
// read-only (via the repo's CANONICAL helpers) and feeds them here; the dry-run
// planner reuses the SAME classifier so scope can never drift.
//
// Ownership mirrors the repo's canonical `isMallanExclusiveListing`
// (lib/listings/exclusive-agent-assignment.ts): SL-/RL- listing_id OR
// rls_eligible === false — NEVER agent_id (syncAgentHistory stamps it on
// third-party rows).

import { isMallanExclusiveListing } from '@/lib/listings/exclusive-agent-assignment';

export type MediaCoverageBucket =
  | 'A'         // active relational usable photos exist
  | 'B_NEW'     // third-party, DB-empty, NO relational rows ever → Cotality has photos → INSERTS
  | 'B_INACTIVE'// third-party, DB-empty, inactive/deleted rows exist → Cotality has photos → RESTORES/UPDATES
  | 'C'         // legacy JSON has usable photos → render fix already serves it
  | 'D'         // no media in DB and Cotality CONFIRMED zero
  | 'E'         // Mallan-owned authoritative deletion (rows existed, none active)
  | 'F'         // hidden / withdrawn / non-displayable
  | 'U';        // UNKNOWN — Cotality probe not run / errored → cannot decide B vs D

export const BUCKET_LABEL: Record<MediaCoverageBucket, string> = {
  A: 'active relational usable photos exist',
  B_NEW: 'third-party, no relational rows ever, Cotality HAS photos → backfill inserts',
  B_INACTIVE: 'third-party, inactive/deleted relational rows, Cotality HAS photos → restores/updates',
  C: 'legacy JSON has usable photos → render fix already serves it',
  D: 'no media in DB and Cotality CONFIRMED zero',
  E: 'Mallan-owned authoritative deletion (rows existed, none active) — never backfill',
  F: 'hidden / withdrawn / non-displayable',
  U: 'UNKNOWN — Cotality probe not run/errored; cannot classify B vs D',
};

/**
 * Tri-state live-Cotality probe result. A timeout / OAuth error / provider
 * failure / skipped probe is `unknown` — it must NEVER be coerced to a zero count
 * (which would mislabel a backfillable listing as Bucket D).
 */
export type CotalityProbe =
  | { status: 'confirmed'; photoCount: number }
  | { status: 'unknown'; reason: string };

/** Per-listing coverage metrics — every field is READ (read-only) via the repo's
 *  canonical helpers by the audit/dry-run before being passed here. */
export interface ListingCoverageInput {
  listingId: string;
  /** Prisma `rls_eligible` — one of the two canonical Mallan-ownership signals. */
  rlsEligible?: boolean | null;
  /** Publicly displayable per the CANONICAL display gate (isListingDisplayable). */
  displayable: boolean;
  /** Count of ACTIVE relational rows that resolve to a usable PHOTO, counted with
   *  the SAME production classifier (resolveListingMediaFromRows → class 'photo'). */
  activeUsablePhotoCount: number;
  /** Count of `listing_media` rows across ALL statuses (existence signal). */
  allStatusRowCount: number;
  /** Count of legacy `Listing.media` JSON items that resolve to a usable PHOTO
   *  (production classifier, photos only — NOT every JSON item). */
  legacyUsablePhotoCount: number;
  /** Tri-state live-Cotality probe. */
  cotality: CotalityProbe;
}

function isMallanOwned(input: ListingCoverageInput): boolean {
  return isMallanExclusiveListing({ listing_id: input.listingId, rls_eligible: input.rlsEligible });
}

/**
 * Classify one listing into exactly one bucket. Precedence:
 *
 *   F  non-displayable
 *   A  active usable photos > 0
 *   E  Mallan-owned AND relational rows existed (any status) → authoritative deletion
 *   C  legacy JSON usable photos > 0 → render fix serves it
 *   U  DB-empty AND Cotality UNKNOWN (probe skipped/errored) → cannot decide
 *   B_NEW / B_INACTIVE  DB-empty, third-party, Cotality CONFIRMED photos > 0
 *   D  DB-empty, Cotality CONFIRMED zero
 */
export function classifyMediaCoverage(input: ListingCoverageInput): MediaCoverageBucket {
  if (!input.displayable) return 'F';
  if (input.activeUsablePhotoCount > 0) return 'A';

  const mallan = isMallanOwned(input);
  if (mallan && input.allStatusRowCount > 0) return 'E';       // authoritative deletion

  if (input.legacyUsablePhotoCount > 0) return 'C';            // render fix serves legacy

  // DB has no usable media (0 active photos, 0 legacy usable photos).
  if (input.cotality.status === 'unknown') return 'U';        // NEVER coerce to D
  if (input.cotality.photoCount > 0) {
    if (mallan) return 'E';                                   // never pull Cotality onto a Mallan listing
    return input.allStatusRowCount === 0 ? 'B_NEW' : 'B_INACTIVE';
  }
  return 'D';                                                 // Cotality CONFIRMED zero
}

/** The dry-run/backfill eligibility guard. Only third-party, displayable, DB-empty
 *  listings whose media Cotality CONFIRMED (> 0) are eligible. Never Mallan-owned,
 *  never non-displayable, never on an unknown probe. */
export function isBucketBBackfillEligible(input: ListingCoverageInput): boolean {
  const b = classifyMediaCoverage(input);
  return b === 'B_NEW' || b === 'B_INACTIVE';
}

export type BucketTally = Record<MediaCoverageBucket, number>;

export function emptyTally(): BucketTally {
  return { A: 0, B_NEW: 0, B_INACTIVE: 0, C: 0, D: 0, E: 0, F: 0, U: 0 };
}

export function tallyBuckets(inputs: ListingCoverageInput[]): BucketTally {
  const t = emptyTally();
  for (const i of inputs) t[classifyMediaCoverage(i)] += 1;
  return t;
}
