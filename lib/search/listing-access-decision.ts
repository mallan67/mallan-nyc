import { Prisma } from "@prisma/client";
import {
  ACTIVE_DISPLAY_VALUES,
  normalizeStatus,
  type StatusValue,
} from "@/lib/compliance/status";
import {
  affirmPermission,
  evaluateDisplayGate,
  isAddressDisplayable,
  type GateResult,
  type PermissionInput,
} from "@/lib/compliance/gates";

export const SEARCH_DISPLAY_GATE: Prisma.ListingWhereInput = {
  idx_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
};

/**
 * CANONICAL public-eligibility contract — the ONE policy every public
 * listing reader shares (Maya 2026-07-23: no surface may invent its own
 * visibility policy). TWO branches:
 *
 *   1. RLS/Cotality operational-copy rows: `rls_eligible` + the fail-closed
 *      feed distribution gates (SEARCH_DISPLAY_GATE).
 *   2. Website-only Mallan publications (`rls_eligible = false`, SL-/RL-
 *      exclusives published directly by Mallan Real Estate Inc.): publicly
 *      active status + positive price + address present + owner opt-out
 *      honored. Feed-only display fields (idx_display_yn,
 *      internet_entire_listing_display_yn, participant_only) do NOT govern
 *      a direct Mallan publication and are deliberately not required here.
 *
 * Consumers spread this as the OR of a Listing where-clause. It does NOT
 * broaden access to nonpublic CRM listings: drafts/withdrawn/closed rows
 * fail the status condition on both branches.
 */
export const PUBLIC_LISTING_ELIGIBILITY_OR: Prisma.ListingWhereInput[] = [
  {
    rls_eligible: true,
    ...SEARCH_DISPLAY_GATE,
  },
  {
    rls_eligible: false,
    owner_opt_out: false,
    status: { in: [...ACTIVE_DISPLAY_VALUES] },
    list_price: { gt: 0 },
    address: { not: Prisma.DbNull },
  },
];

// Distribution-gate filter for the listing_search_projection table.
//
// Four of the five Listing-side gate columns are mirrored on the projection
// (rls_eligible, idx_display_yn, internet_entire_listing_display_yn,
// participant_only_yn). The fifth — owner_opt_out — was deliberately not
// mirrored in PR 5A's bounded schema, so we close the gap by filtering it
// via the FK relation to listings. The relation traversal still uses the
// same Postgres index path (FK + b-tree on listings.owner_opt_out), so the
// query planner can combine the projection scan with the owner_opt_out
// filter without any extra round-trip.
//
// Fail-closed semantics are preserved exactly:
//   - idx_display_yn === true                   (null/false excluded)
//   - internet_entire_listing_display_yn === true (null/false excluded)
//   - participant_only_yn === false             (null/true excluded — null is "unknown", treated as not-displayable)
//   - rls_eligible === true                     (matches the existing search posture; website-only rls_eligible=false rows are out of scope for this reader's surface)
//   - listing.owner_opt_out === false           (canonical Listing-side gate)
export const PROJECTION_DISPLAY_GATE: Prisma.ListingSearchProjectionWhereInput = {
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  participant_only_yn: false,
  // owner_opt_out is not on the projection — apply via the FK relation.
  listing: { owner_opt_out: false },
};

const ACTIVE_DISPLAY_SET = new Set<StatusValue>(ACTIVE_DISPLAY_VALUES);

export function normalizeSearchStatuses(input: unknown): StatusValue[] {
  if (input === undefined || input === null) {
    return [...ACTIVE_DISPLAY_VALUES];
  }

  const rawValues = Array.isArray(input) ? input : [input];
  const statuses = rawValues
    .map((value) => normalizeStatus(value))
    .filter((value): value is StatusValue => value !== null)
    .filter((value) => ACTIVE_DISPLAY_SET.has(value));

  return [...new Set(statuses)];
}

export function buildSearchDisplayWhere(statusInput?: unknown): Prisma.ListingWhereInput {
  const statuses = normalizeSearchStatuses(statusInput);

  return {
    ...SEARCH_DISPLAY_GATE,
    status: statuses.length > 0 ? { in: statuses } : { in: [] },
  };
}

/**
 * Projection analog of `buildSearchDisplayWhere`. Returns the where-shape
 * for `listing_search_projection` that enforces the same fail-closed
 * distribution gates plus the active-status filter, with `mls_status`
 * standing in for `status` (mirrored by the projection builder).
 */
export function buildProjectionSearchWhere(
  statusInput?: unknown,
): Prisma.ListingSearchProjectionWhereInput {
  const statuses = normalizeSearchStatuses(statusInput);

  return {
    ...PROJECTION_DISPLAY_GATE,
    mls_status: statuses.length > 0 ? { in: statuses } : { in: [] },
  };
}

export function decideListingAccess(input: PermissionInput): GateResult {
  return evaluateDisplayGate(input);
}

export function isListingDisplayable(input: PermissionInput): boolean {
  if (!affirmPermission(input.idx_display_yn)) return false;
  return evaluateDisplayGate(input).displayable;
}

export function canDisplayListingAddress(input: PermissionInput): boolean {
  return isAddressDisplayable(input);
}
