/**
 * THE ONE OPEN HOUSE EXECUTION CONTRACT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Before this module there were two half-implementations and one hole:
 *
 *   - `/api/listings` (public) built its own OData filter from its own date
 *     helpers, including a `getNextWeekend()` that read the SERVER's local
 *     timezone and, asked on a Sunday, rolled forward to the FOLLOWING
 *     Saturday — hiding the open houses happening that afternoon.
 *   - the authenticated broker Search had no Open House code at all, and the
 *     UI disabled the controls saying the backend did not support it.
 *
 * Adding a third implementation for the broker path would have made the
 * divergence permanent. So the provider query lives here once, both callers use
 * it, and the window arithmetic comes from `open-house-window.ts`, which is
 * timezone-correct for New York and tested on all seven weekdays.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVIDER FACTS THIS RELIES ON — probed live 2026-09-01, api.cotality.com
 *
 *   OpenHouse                                          HTTP 200, @odata.count 1993
 *   OpenHouseDate ge <today> and le <+30d>             HTTP 200, count 1970
 *   ... and OpenHouseStatus eq 'Active'                HTTP 200, accepted
 *   $orderby OpenHouseDate asc                         HTTP 200
 *   Property.ListingKey eq <OpenHouse.ListingKey>      count 1
 *   Property.ListingId  eq <OpenHouse.ListingKey>      count 0
 *
 * The last two are why membership reconciles on ListingKey and never on
 * ListingId: the domains do not overlap, so the wrong one returns an empty 200
 * that reads exactly like "no listing has an open house".
 */
import { getAccessToken } from '@/lib/idx/auth';
import {
  readOpenHouseMembership,
  type OpenHouseMembership,
} from '@/lib/search/open-house-membership';
import type { OpenHouseWindow } from '@/lib/search/open-house-window';

/** Rows per provider page. The traversal ends on nextLink, not on this. */
const PAGE_SIZE = 500;

/**
 * A ceiling on PAGES, so one search cannot walk the resource forever.
 *
 * Reaching it produces `unavailable`, NOT a smaller set — see
 * open-house-membership.ts. A truncated membership set removes real listings
 * from a real search and cannot be told apart from a correct answer.
 */
const MAX_PAGES = 40;

/**
 * The OData filter for one window.
 *
 * `le` on the upper bound, not `lt` on the following day. The window is
 * inclusive at both ends by contract, and expressing that by adding a day
 * required a second piece of date arithmetic — which is where the public
 * implementation's off-by-one lived.
 */
export function openHouseWindowFilter(window: OpenHouseWindow): string {
  const clauses = [`OpenHouseDate ge ${window.from}`];
  if (window.to) clauses.push(`OpenHouseDate le ${window.to}`);
  // Cancelled/withdrawn open houses are not open houses a broker can attend.
  clauses.push("OpenHouseStatus eq 'Active'");
  return clauses.join(' and ');
}

/**
 * The COMPLETE set of ListingKeys with an active open house in the window, or
 * an explicit refusal.
 *
 * Never a partial set, and never an empty one standing in for a failure: a
 * provider error throws out of `fetchPage`, which the membership reader turns
 * into `unavailable` so the caller can refuse the criterion instead of
 * answering it wrongly.
 */
export async function readOpenHouseMembershipForWindow(
  window: OpenHouseWindow,
): Promise<OpenHouseMembership> {
  const api = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

  const params = new URLSearchParams();
  // ListingKey ONLY — this query settles membership, nothing else. Selecting
  // display fields here would invite a second, competing source for facts the
  // Property row already owns.
  params.set('$select', 'ListingKey');
  params.set('$filter', openHouseWindowFilter(window));
  params.set('$top', String(PAGE_SIZE));
  const firstUrl = `${api}/odata/OpenHouse?${params.toString()}`;

  return readOpenHouseMembership({
    maxPages: MAX_PAGES,
    fetchPage: async (nextLink) => {
      const token = await getAccessToken();
      const res = await fetch(nextLink ?? firstUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      // THROWN, NOT SWALLOWED. A non-OK response is a failure to establish
      // membership. Degrading it to an empty page would read as "nothing has an
      // open house" and return an empty search under an HTTP 200.
      if (!res.ok) throw new Error(`OpenHouse HTTP ${res.status}`);
      const data = await res.json();
      return {
        keys: (data.value || []).map((r: Record<string, unknown>) => String(r.ListingKey)),
        nextLink: (data['@odata.nextLink'] as string | undefined) ?? null,
      };
    },
  });
}
