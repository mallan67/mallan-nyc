/**
 * MALLAN-LOCAL OPEN HOUSE MEMBERSHIP — the one contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * A Mallan-authored listing (SL-/RL-) has no Cotality ListingKey, so it can
 * never be a member of the provider OpenHouse set. Its open houses live in the
 * `showings` table, keyed on the internal `Listing.id`. The registry has always
 * said so — `open_house` declares
 *
 *     authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }
 *
 * — and only the cotality half was implemented, so a Mallan listing with a real
 * open house could not appear under the criterion at all.
 *
 * TWO readers already query `showings` for open houses:
 *
 *     app/api/open-houses/route.ts            fetchLocalOpenHouses()
 *     lib/open-houses/upcoming-open-houses.ts fetchLocalUpcoming()
 *
 * Both build PUBLIC DTOs. Neither answers "which Mallan listings have an open
 * house in THIS window", and adding a third `prisma.showing.findMany()` inside
 * the Search route would make the divergence permanent. The rule lives here
 * once, as a pure function over rows; the caller supplies the rows.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIFECYCLE DECISION, MADE RATHER THAN INHERITED
 *
 * `Showing.status` is "requested" | "confirmed" | "completed" | "cancelled" and
 * DEFAULTS to "requested". The public readers use `status != 'cancelled'`,
 * which admits "requested" and "completed".
 *
 * Authenticated broker Search uses CONFIRMED ONLY:
 *
 *   - the CRM writes `status: "confirmed"` on every agent-created showing
 *     (app/api/crm/showings/route.ts:171 — "Agent-created showings are
 *     auto-confirmed"), so the stricter rule excludes nothing a broker booked;
 *   - "requested" is a proposal nobody confirmed, and a broker searching open
 *     houses is deciding where to send a client;
 *   - "completed" is a past event, which is not an UPCOMING open house even on
 *     today's date.
 *
 * That is stricter than the public readers, and their behaviour is deliberately
 * left alone: a shared extraction that quietly changed the public site would be
 * a regression smuggled in behind a Search fix.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY — AND WHAT MAY NEVER LEAVE THIS MODULE
 *
 *     Showing.listing_id  -> Listing.id          internal BigInt FK
 *     Listing.listing_id  -> "SL-…" / "RL-…"     canonical Mallan search identity
 *
 * Membership is keyed by the CANONICAL identity, never the internal row id.
 * Neither is a Cotality ListingKey, and neither may ever be sent to the
 * provider or manufactured into one.
 */
import { isMallanOwnedLocalListing } from '@/lib/open-houses/upcoming-open-houses';
import {
  openHouseWindowUtcBounds,
  type OpenHouseWindow,
} from '@/lib/search/open-house-window';

/**
 * The only `Showing.status` that means "a broker can rely on this open house".
 *
 * Declared as a set so widening it is a deliberate edit with a test that fails
 * by name, rather than a `!= 'cancelled'` that silently admits new states.
 */
export const BROKER_SEARCH_OPEN_HOUSE_STATUSES = ['confirmed'] as const;

/**
 * The event types that ARE an open house for this criterion.
 *
 * `brokersopen` is deliberately excluded. It is plausibly relevant to a broker,
 * but it is a different event with different access rules, and folding it in
 * here would widen what "Open House" means without anyone deciding to. That is
 * a product question, not an implementation detail.
 */
export const BROKER_SEARCH_OPEN_HOUSE_TYPES = ['openhouse'] as const;

/** One `showings` row joined to the canonical fields of its listing. */
export interface LocalShowingRow {
  readonly date: Date;
  readonly type: string;
  readonly status: string;
  readonly listing: {
    readonly listing_id: string | null;
    readonly rls_eligible?: boolean | null;
    readonly status?: string | null;
  } | null;
}

export type LocalOpenHouseMembership =
  | {
      readonly state: 'resolved';
      /** Canonical Mallan identities (SL-/RL-) with a qualifying open house. */
      readonly listingIds: ReadonlySet<string>;
      readonly rowsRead: number;
    }
  | {
      readonly state: 'unavailable';
      /** Why membership could not be established — surfaced, never swallowed. */
      readonly reason: string;
    };

/** The New York calendar date of an instant, as `YYYY-MM-DD`. */
function nyDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Membership from rows already read.
 *
 * PURE, so every lifecycle state and every window boundary is testable without
 * a database — which also means none of this needs a Production probe to prove.
 *
 * The window is the SAME `OpenHouseWindow` the provider side resolves, so there
 * is exactly one implementation of "this weekend" across both halves of the
 * criterion. A second local date calculation is precisely the parallel truth
 * this contract exists to prevent.
 */
export function localOpenHouseMembershipFrom(
  rows: readonly LocalShowingRow[],
  window: OpenHouseWindow,
): LocalOpenHouseMembership {
  const statuses = new Set<string>(BROKER_SEARCH_OPEN_HOUSE_STATUSES);
  const types = new Set<string>(BROKER_SEARCH_OPEN_HOUSE_TYPES);
  const listingIds = new Set<string>();

  for (const row of rows) {
    if (!types.has(row.type)) continue;
    if (!statuses.has(row.status)) continue;

    const listing = row.listing;
    if (!listing) continue;

    // A provider-sourced row living in the same table belongs to the Cotality
    // half of the universe and is resolved by ListingKey. Admitting it here
    // would count one property from two authorities.
    if (!isMallanOwnedLocalListing(listing)) continue;

    const identity = String(listing.listing_id ?? '').trim();
    // Not `||`: an empty identity is dropped, never used as a key.
    if (!identity) continue;

    // Judged by its NEW YORK date. A showing at 21:00 on the 13th is 01:00 UTC
    // on the 14th; reading the UTC date would push it out of the window and
    // lose an event that is happening tonight.
    const day = nyDate(row.date);
    if (day < window.from) continue;
    if (window.to && day > window.to) continue;

    // A listing holding a Saturday AND a Sunday event is ONE member. This is a
    // set, so several open houses cannot duplicate the property.
    listingIds.add(identity);
  }

  return { state: 'resolved', listingIds, rowsRead: rows.length };
}

/**
 * The Prisma `where` for the rows this contract needs, BOUNDED BY THE WINDOW.
 *
 * Exported so a caller cannot invent its own predicate and drift from the
 * lifecycle decision above.
 *
 * The date bound is derived from the SAME New York authority as the membership
 * check, via `openHouseWindowUtcBounds`. An earlier version deliberately left
 * the date out of the query and filtered in JS, reasoning that `Showing.date`
 * is a timestamp and the window is a calendar range. The timezone reasoning
 * was right and the execution was not: it made every Open House search read
 * the entire lifetime of confirmed showings and discard most of it, which is
 * needless Neon compute on every request and walks into the row ceiling as
 * history grows.
 *
 * The pure NY-date check in `localOpenHouseMembershipFrom` is KEPT as a
 * defensive boundary. The query narrows; the membership check decides. Two
 * expressions of one truth, not two truths.
 */
export function brokerSearchOpenHouseWhere(window: OpenHouseWindow): {
  type: { in: string[] };
  status: { in: string[] };
  date?: { gte: Date; lt?: Date };
} {
  const bounds = openHouseWindowUtcBounds(window);
  return {
    type: { in: [...BROKER_SEARCH_OPEN_HOUSE_TYPES] },
    status: { in: [...BROKER_SEARCH_OPEN_HOUSE_STATUSES] },
    date: {
      gte: bounds.startUtc,
      // EXCLUSIVE upper bound. `lte` on 23:59:59.999 would drop an event
      // stamped in the final millisecond of the last day.
      ...(bounds.endUtcExclusive ? { lt: bounds.endUtcExclusive } : {}),
    },
  };
}

/**
 * Membership for a window, from an injected reader.
 *
 * The reader is injected rather than importing prisma here so the failure
 * behaviour is testable: a database failure must produce `unavailable`, and may
 * NEVER become an empty set. An empty set says "no Mallan listing has an open
 * house", which is a confident answer, and a broker cannot tell it apart from
 * a correct one.
 */
export async function readLocalOpenHouseMembership(input: {
  readonly window: OpenHouseWindow;
  readonly findShowings: () => Promise<readonly LocalShowingRow[]>;
  /**
   * Ceiling on rows read. Reaching it means the answer may be incomplete, which
   * is `unavailable` rather than a smaller set — a truncated membership removes
   * real listings from a real search and looks exactly like a correct answer.
   */
  readonly maxRows?: number;
}): Promise<LocalOpenHouseMembership> {
  const { window, findShowings, maxRows = 5_000 } = input;
  let rows: readonly LocalShowingRow[];
  try {
    rows = await findShowings();
  } catch (err) {
    return {
      state: 'unavailable',
      reason: `Mallan open-house read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (rows.length >= maxRows) {
    return {
      state: 'unavailable',
      reason: `Mallan open-house read hit its ${maxRows}-row ceiling; membership may be incomplete`,
    };
  }
  return localOpenHouseMembershipFrom(rows, window);
}
