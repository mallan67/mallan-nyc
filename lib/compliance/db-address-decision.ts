/**
 * ONE canonical public-address decision for DB-backed listing rows.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Every DB-backed public surface decided independently whether a listing's
 * address could be displayed, and — separately — whether it could enter the URL
 * slug. Those two decisions could disagree, producing the worst pairing:
 *
 *     address DTO suppressed   +   canonical URL containing the street
 *
 * `generateListingSlug` suppresses only on an explicit `=== false`, so a
 * null/undefined flag falls through to an address-based slug, while
 * `isAddressDisplayable()` (DB default) uses `affirmPermission` and fails closed
 * on null. Same listing, opposite answers, and the slug is the one that gets
 * indexed. `lib/listing-slug.ts` warns that address leakage via the URL path is
 * an "incurable UCBA penalty".
 *
 * The fix is NOT to change `generateListingSlug` globally — raw pre-filtered
 * Trestle records legitimately use the other convention. The fix is to make ONE
 * decision here and feed it to BOTH the address fields and the slug input.
 *
 * NULL SEMANTICS ARE ALREADY SETTLED IN-REPO — `lib/compliance/gates.ts:166-171`:
 *
 *   "Use `idxPlusPreFiltered: true` ONLY for raw Trestle records on the live
 *    `/api/idx/search` path ... DB-row callers (db-to-public-dto, sitemap,
 *    listing-access-decision) leave the default `false` so any drift from the
 *    recovered `internet_entire_listing_display_yn=true` baseline still
 *    fails-closed defensively."
 *
 * So for a DB row, null/undefined => NOT displayable. This module is for DB
 * rows only; raw Trestle records are governed by `checkDistributionGates`.
 *
 * THE RULE
 * --------
 *   WEBSITE-ONLY (`rls_eligible === false`)
 *     Mallan's own non-RLS inventory. The IDX display booleans do not bind;
 *     the approved first-party policy applies.
 *
 *   RLS-BACKED (`rls_eligible !== false`) — INCLUDING RLS-eligible `SL-`/`RL-`
 *     `internet_entire_listing_display_yn` AND `internet_address_display_yn`
 *     must BOTH permit. Null/undefined fails closed.
 *
 * A listing-id PREFIX is provenance, never permission. Only an explicit
 * `rls_eligible === false` exempts a row, so unknown provenance fails closed.
 */

import { isAddressDisplayable } from './gates';

export interface DbAddressDecisionInput {
  listing_id: string;
  /** `false` = website-only (non-RLS). Anything else is treated as RLS-backed. */
  rls_eligible?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  internet_address_display_yn?: boolean | null;
}

export interface DbAddressDecision {
  /** May the street address, unit and coordinates be published? */
  addressDisplayable: boolean;
  /** Convenience inverse — the shape existing call sites already use. */
  suppressAddress: boolean;
  /** True when the row is RLS redistribution inventory. */
  isRlsBacked: boolean;
}

/** Is this row RLS redistribution inventory? Only an explicit `false` exempts. */
export function isRlsBackedRow(
  input: Pick<DbAddressDecisionInput, 'rls_eligible'>,
): boolean {
  return input.rls_eligible !== false;
}

/**
 * THE canonical decision. Its result must drive ALL of:
 *   street number · street name · unit · latitude · longitude
 *   · `generateListingSlug({ internetAddressDisplayYN })`
 *
 * Driving them from one value is what makes "address hidden but slug leaks it"
 * structurally impossible rather than merely unlikely.
 */
export function decideDbPublicAddress(
  input: DbAddressDecisionInput,
): DbAddressDecision {
  const isRlsBacked = isRlsBackedRow(input);

  // Website-only inventory is not RLS content, so the IDX display booleans do
  // not bind. Every other control (owner_opt_out, participant_only, status)
  // lives in its own gate and is unaffected by this decision.
  if (!isRlsBacked) {
    return { addressDisplayable: true, suppressAddress: false, isRlsBacked };
  }

  // RLS-backed: default (fail-closed) gate options — NO idxPlusPreFiltered.
  // `isAddressDisplayable` already requires `isInternetEntireListingDisplayable`
  // first, so an entire-listing block suppresses the address even when the
  // address flag itself is true.
  const addressDisplayable = isAddressDisplayable(input);
  return { addressDisplayable, suppressAddress: !addressDisplayable, isRlsBacked };
}
