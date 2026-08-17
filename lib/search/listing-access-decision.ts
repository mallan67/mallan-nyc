import { isPubliclyRetrievableStatus } from '@/lib/compliance/status';
import type { Prisma } from "@prisma/client";
import { excludeMallanRlsReturnCopies } from "@/lib/listings/mallan-source-identity";
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
 * DB-side predicate for `excludeUndisclosed=true`: keep only listings whose
 * canonical PUBLIC address is displayable.
 *
 * WHAT THIS REPLACES
 * ------------------
 * `/api/listings` previously used:
 *
 *     OR: [ { listing_id: { startsWith: 'SL-' } },
 *           { listing_id: { startsWith: 'RL-' } },
 *           { internet_address_display_yn: true } ]
 *
 * so an `SL-`/`RL-` PREFIX satisfied the filter regardless of the address flag.
 * A prefix is PROVENANCE; it is never address permission. An RLS-eligible Mallan
 * exclusive whose seller opted out of address display was returned by a filter
 * whose entire purpose is "only listings whose address I may show".
 *
 * THE RULE
 * --------
 *   WEBSITE-ONLY (`rls_eligible: false`) — not RLS inventory, so the IDX address
 *     flag does not bind; Mallan's own first-party policy applies.
 *   RLS-BACKED (`rls_eligible: true`) — `internet_address_display_yn` must be true.
 *
 * `rls_eligible` is `Boolean @default(true)` (NON-NULL) in the Prisma schema, so
 * these two branches are exhaustive — no nullable-provenance semantics are
 * invented for this query.
 *
 * idx_display_yn, owner_opt_out, participant_only and entire-listing display are
 * already enforced for RLS-backed rows by `SEARCH_DISPLAY_GATE` in the base
 * where-clause. This narrows further and is ANDed BEFORE pagination, so DB-side
 * paging stays correct — it is deliberately NOT a JS post-filter.
 */
export const ADDRESS_DISCLOSED_GATE: Prisma.ListingWhereInput = {
  OR: [
    { rls_eligible: false },
    { internet_address_display_yn: true },
  ],
};

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
    // MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A.
    //
    // Mallan's own listing returns through Cotality as an `RLS*` row. The LOCAL
    // `SL-`/`RL-` row stays canonical; the returned copy is retained internally
    // for audit/reconciliation but is never a PUBLIC listing.
    //
    // Applied HERE, inside the canonical public gate, so it lands BEFORE
    // `count`, `skip` and `take` in every caller. Filtering after pagination is
    // page-local: a local row on one page and its twin on another would let the
    // twin surface, and `total`/`hasMore` would describe the pre-suppression
    // population. One owner, so no emitter can forget it.
    //
    // Fail-closed on SUPPRESSION, not on display — a row with unknown
    // provenance (no `list_office_mls_id`) keeps normal public treatment.
    AND: [excludeMallanRlsReturnCopies()],
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

/**
 * THE canonical answer to "may this listing be served at its PUBLIC DETAIL
 * URL?". One helper, so status checks are not spread across routes.
 *
 * Two independent conditions, both required:
 *
 *   1. PUBLICATION ELIGIBILITY — the status must be a recognised canonical
 *      status. This is what keeps a Mallan `Draft` private: creation is not
 *      publication (MALLAN-PLATFORM-MASTER-PLAN §4.1/§4.2/§5.1), and `Draft`
 *      is not in the canonical Status vocabulary, so it fails closed here.
 *      Deliberately NOT `isActiveDisplayStatus` — that is public SEARCH
 *      membership, and it excludes `Pending`, which detail intentionally serves.
 *
 *   2. THE DISTRIBUTION GATES — unchanged, and still the authority on
 *      idx_display_yn / owner opt-out / participant-only / internet-display.
 *      Terminal statuses are already handled there via idx_display_yn.
 *
 * `isListingDisplayable` is left exactly as it was: it answers the gate
 * question for the portal and other authenticated consumers, which legitimately
 * see pre-publication rows.
 */
export function isListingPubliclyRetrievable(
  input: PermissionInput & { status?: unknown },
): boolean {
  if (!isPubliclyRetrievableStatus(input.status)) return false;
  return isListingDisplayable(input);
}
