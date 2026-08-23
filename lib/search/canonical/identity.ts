/**
 * identity.ts — canonical entity identity references (PURE, A1).
 *
 * Reserves the shape a Search-Document row uses to reference canonical property
 * intelligence. Realistic partial resolution: `canonical_listing_id`
 * (`listingId`) is ALWAYS present; property/building/unit IDs are present only
 * when applicable and resolved; otherwise the row records its
 * `IdentityResolutionStatus`. This is a type reservation only — the surrogate
 * IDs, BBL association, and backfill are B1b (a separate, approval-gated PR).
 *
 * Internal vocabulary — no Cotality live binding. NOT WIRED in A1.
 */

export const IDENTITY_COTALITYLUTION_STATUSES = Object.freeze([
  'resolved',
  'partial',
  'ambiguous',
  'unresolved',
] as const);
export type IdentityResolutionStatus = (typeof IDENTITY_COTALITYLUTION_STATUSES)[number];
export function isIdentityResolutionStatus(v: unknown): v is IdentityResolutionStatus {
  return typeof v === 'string' && (IDENTITY_COTALITYLUTION_STATUSES as readonly string[]).includes(v);
}

/**
 * A reference from a listing/observation to canonical entities. `listingId`
 * (canonical_listing_id) and `sourceRecordId` are always present; the
 * property/building/unit surrogate IDs are optional (present when resolved).
 */
export interface CanonicalEntityReference {
  /** canonical_listing_id — always present. */
  listingId: string;
  /** source-specific record id (Cotality ListingKey, supplemental id, …). */
  sourceRecordId: string;
  propertyId?: string;
  buildingId?: string;
  unitId?: string;
}

export function isCanonicalEntityReference(v: unknown): v is CanonicalEntityReference {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.listingId !== 'string' || r.listingId.length === 0) return false;
  if (typeof r.sourceRecordId !== 'string' || r.sourceRecordId.length === 0) return false;
  for (const k of ['propertyId', 'buildingId', 'unitId'] as const) {
    if (r[k] !== undefined && typeof r[k] !== 'string') return false;
  }
  return true;
}
