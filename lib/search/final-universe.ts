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
 *     -> provider-row dedupe      a repeated PROVIDER row counted once
 *   = FINAL SEARCH UNIVERSE
 *
 * That last step is deliberately NOT called canonical reconciliation. Deduping
 * two Cotality rows that share a ListingKey is provider-row hygiene. Mallan
 * canonical listing identity is a different domain — a Mallan-authored listing
 * and its Cotality return-copy are ONE canonical Mallan listing, and the
 * provider copy is SUPPRESSED as a competing listing rather than deduped
 * against a twin, by office, at the provider boundary.
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
  /**
   * The PROVIDER ROW identity used to drop a repeated provider row.
   *
   * Deliberately NOT called `canonicalKey`. This dedupes provider rows against
   * each other — two Cotality rows carrying the same ListingKey — and that is
   * the whole of what it proves. It is NOT Mallan canonical listing
   * reconciliation, which is a different identity domain: a Mallan-authored
   * listing and its Cotality return-copy are ONE canonical Mallan listing, and
   * the provider copy is suppressed as a competing listing rather than deduped
   * against a twin. That suppression happens upstream, by office, at the
   * provider boundary — see trestleExcludeMallanReturnCopiesClause.
   */
  readonly providerRowKey: (record: T) => string;
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
  /**
   * The last page number, or NULL when it is not knowable yet.
   *
   * "1000+ Results / Page 1 of 5" is a self-contradiction: the `+` says more
   * inventory may exist and `of 5` says page 5 is the end. Only an EXACT count
   * has traversed far enough to know where the universe stops, so a LOWER_BOUND
   * reports null and the UI navigates open-endedly until exhaustion proves the
   * final page.
   */
  readonly totalPages: number | null;
  readonly hasMore: boolean;
  readonly hasPrevious: boolean;
  /** `@odata.count`, kept and kept SEPARATE. Never a result count. */
  readonly providerMatched: number | null;
  readonly truncatedAtBudget: boolean;
  readonly providerRowsRead: number;
  readonly exclusions: {
    readonly identityless: number;
    /** Gated rows BY REASON — "12 excluded" is not an answer to "why". */
    readonly gated: Readonly<Record<string, number>>;
    /** Repeated PROVIDER rows. Not Mallan canonical reconciliation. */
    readonly providerDuplicates: number;
  };
}


/**
 * Absolute runaway guard on provider rows read in one request.
 *
 * Deliberately far above any real REBNY result universe: the biggest live
 * filter observed is 591,292 rows for `Permission eq 'IDX'`, and an ordinary
 * broker search is in the thousands. This exists so a pathological request
 * cannot crawl forever, NOT to bound how much inventory is searchable.
 */
export const PROVIDER_READ_CEILING = 60_000;

/** Never read less than this, so a shallow page still absorbs exclusions. */
const PROVIDER_MIN_READ = 1_000;

/**
 * Headroom over the rows a page strictly needs, to absorb identityless, gated
 * and duplicate rows without a second round of reasoning.
 *
 * Four is generous on purpose: even if THREE QUARTERS of a provider universe
 * were excluded, the requested page would still be reachable. A budget derived
 * from page*pageSize alone would fail the moment exclusions became common,
 * which is exactly when a broker most needs the count to be right.
 */
const PROVIDER_OVERSHOOT = 4;

/**
 * How many provider rows one request may read to serve a given page.
 *
 * THE BUDGET SCALES WITH THE PAGE. A flat ceiling made deep pages unreachable:
 * under a 1,000-row cap, a universe of 4,622 matches could honestly report
 * "1000+ Results" and never return result 1,001, because page 21 at 50 rows a
 * page needs the 1,001st survivor. A read budget may bound work per request; it
 * may not become a hidden maximum searchable inventory.
 *
 * Stateless rescan is affordable because provider latency is round-trip
 * dominated rather than row-count dominated. Measured live 2026-08-26:
 * $top=200 -> 1,801ms, $top=1000 -> 2,077ms, $top=5000 -> 2,134ms. Reading
 * 5,000 rows costs about as much as reading 200, so re-walking from the top for
 * a deep page needs no cursor, no cache and no schema — and a stateless rescan
 * resumes identically on a cold serverless instance, which an in-memory cursor
 * could not promise.
 */
export function providerBudgetFor(page: number, pageSize: number): number {
  const rowsNeeded = page * pageSize + 1;
  return Math.min(PROVIDER_READ_CEILING, Math.max(PROVIDER_MIN_READ, rowsNeeded * PROVIDER_OVERSHOOT));
}

/**
 * Rows requested per provider round trip.
 *
 * 5,000 is measured-safe and returns in ~2.1s, so an ordinary result universe
 * arrives in a single request instead of ninety-three.
 */
const DEFAULT_PROVIDER_PAGE_SIZE = 5_000;

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
    providerRowKey,
    page,
    pageSize,
    providerBudget,
    exactCount = true,
    providerPageSize = DEFAULT_PROVIDER_PAGE_SIZE,
  } = options;

  const survivors: T[] = [];
  const seenProviderRows = new Set<string>();
  const gated: Record<string, number> = {};
  let identityless = 0;
  let providerDuplicates = 0;

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

      // 3. PROVIDER-ROW DEDUPE. First occurrence wins, so the order stays the
      //    provider's. This removes a repeated PROVIDER row and nothing more —
      //    Mallan canonical reconciliation is a separate concern handled by
      //    office suppression at the provider boundary, and calling this step
      //    "canonical" would hide that distinction.
      const rowKey = providerRowKey(record);
      if (seenProviderRows.has(rowKey)) {
        providerDuplicates += 1;
        continue;
      }
      seenProviderRows.add(rowKey);

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
    // NULL, not a fabricated number, when the traversal stopped early.
    totalPages: countMeaning === CountMeaning.EXACT
      ? Math.max(1, Math.ceil(count / pageSize))
      : null,
    hasMore: count > page * pageSize,
    hasPrevious: page > 1,
    providerMatched,
    truncatedAtBudget,
    providerRowsRead,
    exclusions: { identityless, gated, providerDuplicates },
  };
}
