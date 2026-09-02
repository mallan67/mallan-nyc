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

/**
 * THE canonical visibility fragment for any public or client-facing listing set.
 *
 * `SEARCH_DISPLAY_GATE` is only HALF a visibility decision — the four gate
 * columns. A public set also needs MALLAN RLS RETURN-COPY SUPPRESSION
 * (CHARTER Section 1A): Mallan's own listing returns through Cotality as an
 * `RLS*` row carrying Mallan's `ListOfficeMlsId`, so one property exists as two
 * rows. The local `SL-`/`RL-` row stays canonical; the returned copy is kept for
 * audit and must never surface as a second public listing.
 *
 * WHY THIS EXISTS AS ITS OWN EXPORT. The suppression used to live only inside
 * `buildSearchDisplayWhere`, while `SEARCH_DISPLAY_GATE` was exported alongside
 * it and spread directly by seven surfaces. Each of those then had to remember
 * to re-add the suppression by hand. Exactly one did
 * (app/api/listings/similar/route.ts, with a comment explaining why). Four
 * client-facing surfaces did not, and every Mallan listing that had round-tripped
 * through RLS was counted twice in each of them: the CMA a broker hands a seller,
 * neighborhood market medians, buyer recommendations, and portal comparables.
 *
 * Suppression lands INSIDE the query so it happens BEFORE `count`, `skip` and
 * `take`. Filtering afterwards is page-local: a local row on one page and its
 * twin on another lets the twin surface, and `total`/`hasMore` describe the
 * pre-suppression population.
 *
 * DELIBERATELY NO STATUS. A CMA needs closed comps; market-pulse needs a period;
 * search needs the active-display set. Bundling one status here is what would
 * push callers back onto the bare gate — which is how this happened.
 *
 * Fail-closed on SUPPRESSION, not on display: a row with unknown provenance (no
 * `list_office_mls_id`) keeps normal public treatment rather than vanishing.
 */
export function publicListingVisibilityWhere(): Prisma.ListingWhereInput {
  return {
    ...SEARCH_DISPLAY_GATE,
    AND: [excludeMallanRlsReturnCopies()],
  };
}

export function buildSearchDisplayWhere(statusInput?: unknown): Prisma.ListingWhereInput {
  const statuses = normalizeSearchStatuses(statusInput);

  return {
    ...publicListingVisibilityWhere(),
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
