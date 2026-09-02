import {
  isCanonicalStatus,
  isMallanPublicationEligibleStatus,
} from '@/lib/compliance/status';
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
 * Which publication contract binds this row.
 *
 * `rls_eligible` is `Boolean @default(true)` (NON-NULL) in the Prisma schema,
 * so these two branches are exhaustive.
 */
export type PublicDetailSourceClass = 'rls-backed' | 'mallan-website-only';

export type PublicDetailRefusal =
  /** Status is not publication-eligible (Draft/Incomplete/unknown, or terminal). */
  | 'status-not-publication-eligible'
  /** RLS distribution gate refused: idx_display_yn / opt-out / participant-only. */
  | 'distribution-gate';

export type PublicDetailAccess =
  | { retrievable: true; sourceClass: PublicDetailSourceClass }
  | { retrievable: false; sourceClass: PublicDetailSourceClass; reason: PublicDetailRefusal };

export function publicDetailSourceClass(input: { rls_eligible?: unknown }): PublicDetailSourceClass {
  return input.rls_eligible === false ? 'mallan-website-only' : 'rls-backed';
}

export interface PublicDetailAccessInput extends PermissionInput {
  rls_eligible?: unknown;
}

/**
 * Read the status the way `gates.ts` does, so a Trestle-shaped record and a DB
 * row cannot get different answers out of the same decision.
 */
function readAccessStatus(input: PublicDetailAccessInput): unknown {
  for (const key of ['status', 'StandardStatus', 'standardStatus', 'MlsStatus'] as const) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * THE canonical answer to "may this row be served at its PUBLIC DETAIL URL?".
 *
 * ONE decision, SOURCE-CLASS AWARE, called from the SHARED listing-resolution
 * path — before a `PublicListingDTO` is built, returned or cached. That
 * placement is the point: `generateMetadata`, the page component and the Full
 * Route Cache all consume the same resolver, so a decision made in only one of
 * them is not a visibility rule, it is a race. A Draft that was refused by the
 * page but not by the resolver still had its address, price, remarks, canonical
 * URL and OpenGraph/Twitter cards built from it.
 *
 * The two conditions do NOT bind the two source classes equally:
 *
 *   1. PUBLICATION STATUS — binds BOTH classes. Canonical and non-terminal
 *      (see `isPubliclyRetrievableStatus`). Keeps Mallan `Draft`/`Incomplete`
 *      private — creation is not publication (MALLAN-PLATFORM-MASTER-PLAN
 *      §4.1/§4.2/§5.1) — and stops a terminal row in EITHER class from keeping
 *      a public page. Deliberately NOT `isActiveDisplayStatus`: that is public
 *      SEARCH membership and would 404 `Pending`, which detail intentionally
 *      serves.
 *
 *   2. THE REBNY/RLS DISTRIBUTION GATES — bind ONLY RLS-backed rows. They must
 *      not be applied to website-only inventory: `computeGateColumns` computes
 *      `idx_display_yn = rls_eligible && …`, so EVERY `rls_eligible === false`
 *      row carries `idx_display_yn: false` by construction. Requiring the RLS
 *      gate of them would 404 all Mallan website-only inventory. Their
 *      publication contract is Mallan's own, and it is carried by status —
 *      exactly as `lib/crm/listing-publish-contract.ts` already models it
 *      (`exclusiveEligible = !isTerminal`).
 *
 * Returns a REASON rather than a bare boolean so the caller can distinguish a
 * pre-publication refusal from a permission refusal without re-deriving either.
 *
 * `isListingDisplayable` is unchanged: it answers the gate question for the
 * portal and other authenticated consumers, which legitimately see
 * pre-publication and off-market rows.
 */
export function decidePublicDetailAccess(input: PublicDetailAccessInput): PublicDetailAccess {
  const sourceClass = publicDetailSourceClass(input);
  const status = readAccessStatus(input);

  // 1. VOCABULARY — binds BOTH classes.
  //    Kills the Mallan pre-publication values (`Draft`, `Incomplete`), the
  //    live-but-unmodelled provider values (`Delete`), and anything unknown.
  //    This is the half that closes the Draft leak.
  if (!isCanonicalStatus(status)) {
    return { retrievable: false, sourceClass, reason: 'status-not-publication-eligible' };
  }

  // 2. THE SOURCE-CLASS CONTRACT — deliberately NOT the same test twice.
  if (sourceClass === 'rls-backed') {
    // The REBNY/RLS gate is the SINGLE OWNER of terminality for RLS inventory,
    // and it is more precise than a flat status set: it keeps a just-Closed
    // listing servable for 24h after CloseDate per UCBA Art. I §6 ("removed OR
    // MARKED CLOSED within 24hrs"). Re-testing terminal here would delete that.
    if (!isListingDisplayable(input)) {
      return { retrievable: false, sourceClass, reason: 'distribution-gate' };
    }
    return { retrievable: true, sourceClass };
  }

  // Website-only (`rls_eligible === false`): no REBNY gate governs this row —
  // and none CAN, because `computeGateColumns` computes
  // `idx_display_yn = rls_eligible && …`, so the column is false by
  // construction and carries zero publication information here. Mallan's own
  // contract applies, and it ends at terminal.
  if (!isMallanPublicationEligibleStatus(status)) {
    return { retrievable: false, sourceClass, reason: 'status-not-publication-eligible' };
  }

  return { retrievable: true, sourceClass };
}
