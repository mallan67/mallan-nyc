/**
 * OPEN HOUSE MEMBERSHIP, OR NOTHING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 *
 * The public route answered "which listings have an open house" with a single
 * `$top=500` read of the OpenHouse resource and then intersected it with rows
 * that had ALREADY been cut into a page. Two independent wrong answers:
 *
 *   1. 500 rows is not the resource. If the range holds 501 open houses, the
 *      501st listing silently has no open house — a NARROWING no one is told
 *      about, and narrowing is indistinguishable from "no results" on screen.
 *
 *   2. The read was wrapped in `try { … } catch { console.warn }`. When the
 *      provider failed, the filter simply did not run and the response carried
 *      the UNFILTERED listing set under an Open House request — a broker asks
 *      for open houses and is shown listings that have none, with a 200 and no
 *      indication anything went wrong. That is the worst shape a failure can
 *      take: silent widening.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE HERE
 *
 * A membership set is either COMPLETE for the requested range or it does not
 * exist. There is no partial answer, because a partial open-house set removes
 * real listings from a real search and cannot be told apart from a correct one.
 *
 * So exhaustion is proved by the provider's own `@odata.nextLink` disappearing.
 * A budget that runs out BEFORE that is `unavailable`, not a smaller set — the
 * caller must then refuse the criterion rather than answer it wrongly.
 */

/** One page of the OpenHouse resource, as the caller's transport returns it. */
export interface OpenHousePage {
  /** ListingKeys on this page. */
  readonly keys: readonly string[];
  /** The provider's own statement that more follows. Null means nothing does. */
  readonly nextLink: string | null;
}

export type OpenHouseMembership =
  | {
      readonly state: "resolved";
      /** The COMPLETE set of listing keys with an open house in the range. */
      readonly listingKeys: ReadonlySet<string>;
      readonly pagesRead: number;
      readonly keysRead: number;
    }
  | {
      readonly state: "unavailable";
      /** Why the criterion cannot be answered — surfaced, never swallowed. */
      readonly reason: string;
    };

export interface OpenHouseMembershipInput {
  /**
   * Reads one page. Throwing or returning a rejected promise is a provider
   * failure and produces `unavailable` — it may never degrade into an empty
   * set, which would read as "no listing has an open house".
   */
  readonly fetchPage: (nextLink: string | null) => Promise<OpenHousePage>;
  /** Hard ceiling on pages read, so one request cannot walk forever. */
  readonly maxPages: number;
}

export async function readOpenHouseMembership(
  input: OpenHouseMembershipInput,
): Promise<OpenHouseMembership> {
  const listingKeys = new Set<string>();
  let nextLink: string | null = null;
  let pagesRead = 0;
  let keysRead = 0;

  while (pagesRead < input.maxPages) {
    let page: OpenHousePage;
    try {
      page = await input.fetchPage(nextLink);
    } catch (err) {
      // FAIL CLOSED. The alternative — returning the keys gathered so far — is a
      // silently narrowed search; the alternative the route used to take —
      // skipping the filter — is a silently widened one. Both are wrong answers
      // wearing a 200.
      return {
        state: "unavailable",
        reason: `OpenHouse read failed after ${pagesRead} page(s): ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    pagesRead += 1;
    for (const key of page.keys) {
      if (key) {
        listingKeys.add(String(key));
        keysRead += 1;
      }
    }

    // EXHAUSTION IS THE PROVIDER'S STATEMENT, NOT OUR ARITHMETIC. The absence of
    // a nextLink is the only thing that licenses "this is the whole range".
    if (!page.nextLink) {
      return { state: "resolved", listingKeys, pagesRead, keysRead };
    }
    nextLink = page.nextLink;
  }

  return {
    state: "unavailable",
    reason:
      `OpenHouse range not exhausted within ${input.maxPages} pages; ` +
      `a partial open-house set would silently drop listings that do have one.`,
  };
}
