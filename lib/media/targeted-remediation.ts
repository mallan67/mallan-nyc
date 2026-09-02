/**
 * TARGETED MEDIA REMEDIATION — CONTRACT SURFACE (behaviour not yet implemented).
 *
 * This module exists so the behavioural suite can be written FIRST and observed RED. Every function
 * throws `NOT_IMPLEMENTED`; implementing them is what turns the suite green.
 *
 * ── WHY THIS IS A SEPARATE PATH, NOT A CHANGE TO `mirrorMediaToR2` ─────────────────────────────
 * `mirrorMediaToR2` resolves `existingKey ?? buildMediaR2Key(...)` (lib/idx/media-sync.ts:2977) and
 * returns `reused` as soon as `existsInR2(key)` is true (:3148-3177) WITHOUT reading provider bytes.
 * That existing-key preference is the deliberate PR #583 mass-re-upload guard and is locked by 43
 * tests in lib/idx/__tests__/media-sync-r2.test.ts (see :213 and :347). Remediation therefore runs
 * OUTSIDE it. `buildMediaR2Key` and the existing-key preference are NOT modified.
 *
 * ── DELIVERY IDENTITY ─────────────────────────────────────────────────────────────────────────
 * MediaKey stays the canonical ASSET identity (`listing_media.media_key`, untouched). The repaired
 * DELIVERY object carries a content version:
 *     {folder}/{encodeR2Segment(listing_id)}/{encodeR2Segment(media_key)}.{sha256_8}.jpg
 * SEPARATOR IS `.` — `encodeR2Segment` passes `-` through unescaped but can never emit `.`, so
 * `{encKey}.{sha8}` is injective by construction and `{encKey}-{sha8}` is not.
 * The version lives INSIDE `r2_key`; `media_url_cached` is always derived as `getR2PublicUrl(r2_key)`.
 * No schema change.
 *
 * ── ADDRESSING ────────────────────────────────────────────────────────────────────────────────
 * Rows are addressed by `media_key` ONLY. Legacy keys are NOT uniformly `photos/{id}/1.jpg` — 104 of
 * the 1,356 bad heroes carry ordinals 2–23 — so any legacy-key-shape match silently misses rows.
 *
 * ── UNIT OF WORK ──────────────────────────────────────────────────────────────────────────────
 * The unit is the LISTING (1,357 units over 1,383 media rows). `closeMediaWrite` runs EXACTLY ONCE
 * per unit, after every replacement object is uploaded AND content-verified and every pointer for
 * that listing is reconciled. The unit set is the UNION of bad-hero and bad-sibling listings —
 * RLS20093163 has a clean hero and a bad sibling, so hero-driven iteration would skip it.
 */

export type RemediationEvidenceClass =
  | 'CURRENT_PROVIDER_BYTES_DIFFER'
  | 'CONTAINS_FLOORPLAN_BYTES'
  | 'CONTAINS_OTHER_MEDIA_BYTES';

/** Classes that are NEVER eligible for automated repair. */
export type RemediationIneligibleClass =
  | 'MATCH_CURRENT_PHOTO'
  | 'CURRENT_PROVIDER_UNAVAILABLE'
  | 'UNVERIFIABLE'
  | 'SIBLING_OK';

export interface RemediationTargetRow {
  media_key: string;
  listing_id: string;
  kind: 'hero' | 'sibling';
  media_type: string;
  evidenceClass: RemediationEvidenceClass;
  /** The row's CURRENT (legacy) r2_key. Never used for addressing — recorded for proof only. */
  legacyR2Key: string;
  /** Freshly resolved current provider locator for THIS MediaKey. */
  freshProviderUrl: string;
}

export interface RemediationUnit {
  listing_id: string;
  listing_type: 'sale' | 'rent';
  rows: RemediationTargetRow[];
}

export type PlanValidation =
  | { ok: true }
  | { ok: false; reason: 'INCOMPLETE_UNIT' | 'INELIGIBLE_ROW' | 'ADMISSION_REFUSED'; detail: string; missing: string[] };

export interface RemediationDeps {
  /** Fresh provider bytes for a locator. Rejects/throws on provider failure. */
  fetchProviderBytes(url: string): Promise<Buffer>;
  /** PUT to R2. Never overwrites a legacy key — callers pass only versioned keys. */
  uploadToR2(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read back what R2 actually stored, for post-upload content verification. */
  readR2Bytes(key: string): Promise<Buffer>;
  /** Reconcile one row's delivery pointers, addressed by media_key. */
  updateRowPointers(mediaKey: string, patch: { r2_key: string; media_url_cached: string }): Promise<void>;
  /** THE canonical post-media-write closure. Fail-soft: returns ok:false, never throws. */
  closeMediaWrite(listingId: string, options: { galleryMutated: boolean }): Promise<{ ok: boolean }>;
  /** Re-evaluated at EXECUTION time against a freshly read listing, not the frozen manifest. */
  admissionScope(listingId: string): Promise<'hero_only' | 'none'>;
}

export interface RepairedRow {
  media_key: string;
  previousR2Key: string;
  newR2Key: string;
  newMediaUrlCached: string;
  sha256_8: string;
}

export type RemediationOutcome =
  | { status: 'repaired'; listing_id: string; rows: RepairedRow[]; closureOk: true }
  | { status: 'incomplete'; listing_id: string; retryable: boolean; reason: string; rows: RepairedRow[] }
  | { status: 'refused'; listing_id: string; reason: string };

import {
  buildVersionedDeliveryKeyImpl,
  validateRemediationUnitImpl,
  buildRemediationUnitsImpl,
  remediateListingUnitImpl,
  countCompletedRemediationsImpl,
} from './targeted-remediation-impl';

/**
 * Build the content-versioned DELIVERY key. Separator is `.`.
 */
export function buildVersionedDeliveryKey(
  listingId: string,
  mediaType: string,
  mediaKey: string,
  sha256Hex: string,
): string {
  return buildVersionedDeliveryKeyImpl(listingId, mediaType, mediaKey, sha256Hex);
}

/**
 * Reject a unit that omits any known verified-bad ACTIVE row for that listing, or that includes an
 * ineligible row. Detection lives HERE, before any write — never inside `closeMediaWrite`, which is
 * a post-write summary/invalidation seam and must not acquire byte adjudication.
 */
export function validateRemediationUnit(
  unit: RemediationUnit,
  knownBadRowsForListing: RemediationTargetRow[],
  ineligibleRows?: Array<{ media_key: string; klass: RemediationIneligibleClass }>,
): PlanValidation {
  return validateRemediationUnitImpl(unit, knownBadRowsForListing, ineligibleRows);
}

/**
 * Build the unit set as the UNION of bad-hero and bad-sibling listings.
 */
export function buildRemediationUnits(rows: RemediationTargetRow[]): RemediationUnit[] {
  return buildRemediationUnitsImpl(rows);
}

/**
 * Repair ONE listing unit. Contract:
 *   - validate the plan first; refuse on failure without any write
 *   - fetch fresh provider bytes, upload to a versioned key, read back and CONTENT-VERIFY
 *   - only then reconcile that row's pointers
 *   - never overwrite or delete the legacy object
 *   - call closeMediaWrite EXACTLY ONCE, after all rows for the listing are reconciled
 *   - closure ok:false ⇒ status 'incomplete', retryable, NOT counted as completed remediation
 */
export async function remediateListingUnit(
  unit: RemediationUnit,
  knownBadRowsForListing: RemediationTargetRow[],
  deps: RemediationDeps,
): Promise<RemediationOutcome> {
  return remediateListingUnitImpl(unit, knownBadRowsForListing, deps);
}

/**
 * Completed-remediation accounting. A unit counts as completed ONLY when every verified-bad row for
 * that listing was reconciled after content verification AND the closure returned ok:true.
 */
export function countCompletedRemediations(outcomes: RemediationOutcome[]): number {
  return countCompletedRemediationsImpl(outcomes);
}
