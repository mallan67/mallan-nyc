/**
 * MARKET STATUS → BROKER/CLIENT LABEL. The one presentation helper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM IT SOLVES
 *
 * A broker says "sold" about a sale and "rented" about a rental. Cotality has
 * ONE value for both: `Closed` — "the purchase agreement has been fulfilled or
 * the lease agreement has been executed".
 *
 * Mallan resolved that mismatch by writing its own words into the market-status
 * column: `Sold`, `Rented`, `Leased`. None is a Cotality
 * `Property.StandardStatus` member. That is a PRESENTATION need answered by
 * falsifying a PROVIDER fact — the column stops meaning "what the provider says
 * about this listing" and starts meaning "whatever the last writer felt like".
 *
 * The label is a function of the market status AND the listing type. Deriving it
 * costs nothing and keeps the stored fact honest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE WERE THREE HELPERS AND WHY THIS IS THE FOURTH
 *
 * `statusDisplayLabel` (lib/compliance/status.ts), `getStatusDisplayLabel`
 * (lib/crm/status-mapping.ts) and `STATUS_DISPLAY` (lib/idx/db-to-public-dto.ts)
 * all map a status to a string, and NOT ONE of them takes the listing type. So
 * every one of them shows a closed rental as "Closed" or, worse, relies on the
 * column already containing "Rented" — which is the falsification above.
 *
 * This module is the one that knows about listing type. The others should defer
 * to it rather than grow a fourth private table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LEGACY VALUES STAY READABLE
 *
 * Real rows carry `Sold`, `Rented`, `Leased` and the invented `Cancelled`, and
 * no production backfill is authorized. Every one of them is accepted here and
 * labelled correctly. What changes is that new writes stop adding to the pile.
 */

/** Cotality `Property.StandardStatus` — the live-verified 11 members. */
const COTALITY_STATUS_LABELS: Record<string, string> = {
  Active: "Active",
  ActiveUnderContract: "Active Under Contract",
  Canceled: "Canceled",
  Closed: "Closed", // overridden per listing type below
  ComingSoon: "Coming Soon",
  Delete: "Deleted",
  Expired: "Expired",
  Hold: "On Hold",
  Incomplete: "Incomplete",
  Pending: "Pending",
  Withdrawn: "Withdrawn",
};

/**
 * Values that appear on REAL ROWS but are not Cotality members.
 *
 * `Draft` is a Mallan-local sentinel (see `isMallanLocalSentinelStatus`).
 * `Sold`/`Rented`/`Leased` are historical writes of the business word into the
 * provider column. `Cancelled` (two Ls) is the invented spelling.
 */
const LEGACY_LABELS: Record<string, string> = {
  Draft: "Draft",
  Sold: "Sold",
  Rented: "Rented",
  Leased: "Leased",
  Cancelled: "Canceled",
};

/**
 * The listing type as it comes off a row. Deliberately accepts any string:
 * `Listing.listing_type` is a constrained string column, not an enum, so a
 * caller passing the raw column must not need a cast — and an unexpected value
 * simply falls through to the sale-side default rather than throwing.
 */
export type ListingKind = string | null | undefined;

/**
 * The label a broker or client should see.
 *
 * @param status       the stored market status
 * @param listingType  "sale" | "rent" — decides how `Closed` reads
 */
export function marketStatusLabel(status: unknown, listingType: ListingKind): string {
  const raw = typeof status === "string" ? status.trim() : "";
  if (!raw) return "";

  // The whole reason this helper takes a listing type. One provider fact, two
  // business words.
  if (raw === "Closed") {
    return listingType === "rent" ? "Rented" : "Sold";
  }

  return COTALITY_STATUS_LABELS[raw] ?? LEGACY_LABELS[raw] ?? raw;
}

/**
 * The market status to PERSIST for a business outcome a broker selects.
 *
 * A broker's CRM says "mark this Sold". The provider fact that expresses it is
 * `Closed`. This is the one place that translation happens, so no route has to
 * remember it — and so the API can keep accepting the broker's vocabulary while
 * the column keeps the provider's.
 *
 * `Draft` translates to NULL for the same reason in the opposite direction: it
 * is the broker's word for "take this back off the market", and the truthful
 * column value for that is the ABSENCE of a market status, not a Mallan word
 * sitting in the provider's field. The Mallan-side meaning of "draft" is
 * recorded in `Listing.compliance.mallan_publication`.
 *
 * Anything already Cotality-valid passes through untouched.
 */
export function marketStatusForBusinessOutcome(requested: string): string | null {
  if (requested === "Sold" || requested === "Rented" || requested === "Leased") {
    return "Closed";
  }
  if (requested === "Draft") return null;
  return requested;
}

/**
 * TRUE for the legacy Mallan sentinel that still sits on real rows.
 *
 * `Draft` meant "Mallan has not published this listing yet". Cotality has no
 * such value: `Incomplete` is a statement about a COTALITY record that has not
 * been finished in the MLS, and a Mallan-local listing is not a Cotality record
 * at all. Substituting it would be exactly the guess this architecture forbids.
 *
 * RESOLVED 2026-08-27 (authorized schema correction). `Listing.status` is now
 * nullable with no default, and NULL means exactly one thing: THIS LISTING HAS
 * NO MARKET STATUS YET. Both create paths write NULL, and the Mallan
 * publication/review state lives only in `Listing.compliance.mallan_publication`.
 *
 * Nothing writes `Draft` into the column any more. This predicate remains
 * because real rows created before that change still carry it and NO PRODUCTION
 * BACKFILL IS AUTHORIZED — a stored `Draft` and a NULL must reach the same
 * decision at every gate, forever. The boundary that made the sentinel honest
 * still holds for those rows:
 *   - it only ever appears on a Mallan-authored row (`mls_id` null);
 *   - it is never sent to Cotality in any request;
 *   - it is not publicly displayable.
 */
export function isMallanLocalSentinelStatus(status: unknown): boolean {
  return status === "Draft";
}

/**
 * TRUE when a row has no market status at all — the NULL the column now stores,
 * or the legacy `Draft` sentinel that means the same thing on older rows.
 *
 * The no-backfill invariant in one predicate: callers that need "is this listing
 * off-market-because-it-was-never-on-market" ask here rather than testing for
 * null and forgetting the legacy spelling.
 */
export function hasNoMarketStatus(status: unknown): boolean {
  if (status == null) return true;
  if (typeof status === "string" && status.trim() === "") return true;
  return isMallanLocalSentinelStatus(status);
}

/** Every value this helper knows how to label, for exhaustiveness tests. */
export const KNOWN_STATUS_VALUES: readonly string[] = Object.freeze([
  ...Object.keys(COTALITY_STATUS_LABELS),
  ...Object.keys(LEGACY_LABELS),
]);
