/**
 * The spellings a terminal listing status is STORED under.
 *
 * `listings.status` is written two ways. The Cotality sync stores the feed's StandardStatus verbatim
 * (lib/idx/trestle-mapper.ts `status: raw.StandardStatus`, pinned by
 * lib/idx/__tests__/raw-mapper-characterization.test.ts), and the live Cotality list spells the
 * cancelled status "Canceled" with one L (data/cotality-enums.live.json, StandardStatus). Every CRM
 * writer passes the status through normalizeStandardStatus first, which folds it to "Cancelled" with
 * two. A query or comparison made against the stored column therefore has to name BOTH spellings, or
 * it silently skips every synced cancelled listing (issue #449: the retention and DOM-reset crons, the
 * archive predicate and the monitors did exactly that).
 *
 * Code that already holds a normalized status (normalizeStandardStatus output) keeps using
 * TERMINAL_STATUSES from lib/idx/trestle-mapper.ts; this module is for the stored column.
 * tests/runtime/terminal-status-spellings.test.ts holds every list that has to agree with these.
 */

/** Both spellings of the cancelled status: the CRM's "Cancelled" and Cotality's "Canceled". */
export const CANCELLED_STATUS_SPELLINGS = ["Cancelled", "Canceled"] as const;

/** True for a stored status that is the cancelled status under either spelling (exact case, as stored). */
export function isCancelledStatus(status: unknown): boolean {
  return typeof status === "string" && (CANCELLED_STATUS_SPELLINGS as readonly string[]).includes(status);
}

/** Every spelling a terminal status can be stored under: the mapper's TERMINAL_STATUSES plus Cotality's "Canceled". */
export const TERMINAL_STATUS_SPELLINGS = [
  "Closed",
  "Sold",
  "Leased",
  "Rented",
  "Withdrawn",
  "Expired",
  ...CANCELLED_STATUS_SPELLINGS,
] as const;

/** The statuses whose 30 consecutive days start the DOM reset (UCBA 2026 Art. I Sec. 11). */
export const DOM_RESET_STATUS_SPELLINGS = ["Withdrawn", ...CANCELLED_STATUS_SPELLINGS] as const;
