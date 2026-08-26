/**
 * THE FINAL SEARCH UNIVERSE.
 *
 * One module owns the answer to "which rows are the results", because until
 * that has a single answer, counting, paging, sorting, comparing and reporting
 * are all describing different sets and only one of them can be right.
 *
 * The chain, in order. Each step only ever REMOVES rows, and every removal is
 * attributable:
 *
 *   provider matching universe   @odata.count — PRE-FINAL, never a result count
 *     -> ListingKey integrity     a row nobody can address is not a result
 *     -> distribution gates       owner opt-out, participant-only, internet
 *                                 display, closed >24h
 *     -> canonical dedupe         one listing, not a provider twin, counted once
 *   = FINAL SEARCH UNIVERSE
 *
 * The order is load-bearing rather than stylistic: a row with no identity
 * cannot be gated, deduped, addressed on a later page, or explained to a broker
 * who asks why it is missing.
 *
 * WHAT THIS REPLACES. The search asked Cotality for 200 rows, dropped the
 * identityless and gated ones, handed the survivors to the browser, and the
 * browser printed that array's length as "N Results". A live Manhattan
 * Active-residential search matches 4,622 listings; the broker saw at most 200
 * and was told that was the total. A silently truncated count is worse for a
 * broker than an inflated one — it reads as "this inventory does not exist."
 *
 * PAGES ARE CUT FROM THE FINAL UNIVERSE. Forwarding the provider's skip is what
 * produces a 47-row page 1 when provider rows 4, 9 and 10 are gated, and then
 * steps over their neighbours on page 2. A gated row must pull the next
 * survivor forward, not leave a hole.
 *
 * THE COUNT CARRIES ITS MEANING. A bare number cannot say whether it is exact.
 * EXACT is returned only when the whole provider universe was traversed;
 * otherwise the number is a declared LOWER BOUND. An approximation that looks
 * exact is the one outcome this module will not produce.
 */

/** What a count is allowed to claim about itself. */
export enum CountMeaning {
  /** The entire provider universe was traversed and gated. This is the total. */
  EXACT = 'EXACT_FINAL_UNIVERSE',
  /**
   * Traversal stopped early — the caller asked only for a page, or the budget
   * ran out. The number is a floor, and it says so.
   */
  LOWER_BOUND = 'LOWER_BOUND_TRUNCATED',
}

/** One page of provider records, shaped the way OData actually answers. */
export interface ProviderPage<T> {
  readonly records: readonly T[];
  /** `@odata.count` — the PROVIDER matching universe, before any Mallan rule. */
  readonly providerMatched: number | null;
  /** True when this page reached the end of the provider universe. */
  readonly exhausted: boolean;
}

export interface GateVerdict {
  readonly displayable: boolean;
  readonly reason?: string;
}

export interface AssembleOptions<T> {
  /** Reads one provider page. `skip`/`top` are PROVIDER coordinates. */
  readonly fetchPage: (skip: number, top: number) => Promise<ProviderPage<T>>;
  /** The row's provider identity. Null/blank means the row cannot be a result. */
  readonly identity: (record: T) => string | null | undefined;
  /** The distribution/compliance decision for one row. */
  readonly gate: (record: T) => GateVerdict;
  /** The key a provider twin shares with the listing it duplicates. */
  readonly canonicalKey: (record: T) => string;
  /** 1-based page of the FINAL universe. */
  readonly page: number;
  readonly pageSize: number;
  /** Hard ceiling on provider rows read, so one search cannot run away. */
  readonly providerBudget: number;
  /**
   * Traverse the whole universe to produce an EXACT count. Defaults to true:
   * a count is a promise to the broker, and the caller should have to opt OUT
   * of keeping it rather than remember to opt in.
   */
  readonly exactCount?: boolean;
  readonly providerPageSize?: number;
}

export interface FinalUniverseResult<T> {
  readonly rows: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  /** Size of the final universe, with `countMeaning` saying what that means. */
  readonly count: number;
  readonly countMeaning: CountMeaning;
  readonly totalPages: number;
  readonly hasMore: boolean;
  /** `@odata.count`, kept and kept SEPARATE. Never a result count. */
  readonly providerMatched: number | null;
  readonly truncatedAtBudget: boolean;
  readonly providerRowsRead: number;
  readonly exclusions: {
    readonly identityless: number;
    /** Gated rows BY REASON — "12 excluded" is not an answer to "why". */
    readonly gated: Readonly<Record<string, number>>;
    readonly duplicates: number;
  };
}

const DEFAULT_PROVIDER_PAGE_SIZE = 50;

/**
 * Walk the provider, apply the chain, and cut one page out of what survives.
 *
 * Order-preserving by construction: sorting is the provider's job, and a stable
 * sort contract cannot be built on top of something that reorders.
 */
export async function assembleFinalUniverse<T>(
  options: AssembleOptions<T>,
): Promise<FinalUniverseResult<T>> {
  const {
    fetchPage,
    identity,
    gate,
    canonicalKey,
    page,
    pageSize,
    providerBudget,
    exactCount = true,
    providerPageSize = DEFAULT_PROVIDER_PAGE_SIZE,
  } = options;

  const survivors: T[] = [];
  const seenCanonical = new Set<string>();
  const gated: Record<string, number> = {};
  let identityless = 0;
  let duplicates = 0;

  let providerMatched: number | null = null;
  let providerRowsRead = 0;
  let exhausted = false;
  let truncatedAtBudget = false;

  /**
   * How many survivors settle the question. One PAST the requested page is
   * enough to know whether a next page exists, so a caller asking for page 1 of
   * a huge universe does not pay for an exact count it did not request.
   */
  const neededForPage = page * pageSize + 1;

  while (!exhausted && providerRowsRead < providerBudget) {
    if (!exactCount && survivors.length >= neededForPage) break;

    const remainingBudget = providerBudget - providerRowsRead;
    const top = Math.min(providerPageSize, remainingBudget);
    const providerPage = await fetchPage(providerRowsRead, top);

    if (providerPage.providerMatched != null) providerMatched = providerPage.providerMatched;
    providerRowsRead += providerPage.records.length;
    exhausted = providerPage.exhausted;

    for (const record of providerPage.records) {
      // 1. IDENTITY. First, because a row with no key cannot be gated, deduped
      //    or addressed later — and must not be reported as a gate exclusion,
      //    which would misattribute why it is absent.
      const id = identity(record);
      if (id == null || String(id).trim() === '') {
        identityless += 1;
        continue;
      }

      // 2. DISTRIBUTION GATES, attributed by reason.
      const verdict = gate(record);
      if (!verdict.displayable) {
        const reason = verdict.reason || 'unknown';
        gated[reason] = (gated[reason] || 0) + 1;
        continue;
      }

      // 3. CANONICAL DEDUPE. First occurrence wins, so order stays the
      //    provider's and a twin cannot displace the listing it duplicates.
      const canonical = canonicalKey(record);
      if (seenCanonical.has(canonical)) {
        duplicates += 1;
        continue;
      }
      seenCanonical.add(canonical);

      survivors.push(record);
    }

    // The records were empty but the provider did not say it was done: stop
    // rather than loop forever on a provider that keeps answering nothing.
    if (providerPage.records.length === 0) break;
  }

  if (!exhausted && providerRowsRead >= providerBudget) truncatedAtBudget = true;

  const count = survivors.length;
  const countMeaning = exhausted ? CountMeaning.EXACT : CountMeaning.LOWER_BOUND;

  const start = (page - 1) * pageSize;
  const rows = survivors.slice(start, start + pageSize);

  return {
    rows,
    page,
    pageSize,
    count,
    countMeaning,
    // A page count over a LOWER_BOUND is itself a lower bound; `countMeaning`
    // is what tells a caller which it is holding.
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    hasMore: count > page * pageSize,
    providerMatched,
    truncatedAtBudget,
    providerRowsRead,
    exclusions: { identityless, gated, duplicates },
  };
}
