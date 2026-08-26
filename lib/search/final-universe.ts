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


/**
 * WHETHER MORE RESULTS EXIST BEYOND THIS PAGE — and whether we actually know.
 *
 * `count > page * pageSize` is a sound conclusion only when a survivor beyond
 * the page was OBSERVED, or the provider was EXHAUSTED. If traversal stopped at
 * the read budget before either was established, "no" is an unsupported claim,
 * and it is the dangerous direction: a broker reads it as "that is all the
 * inventory". Mallan choosing not to read farther is not evidence that the
 * universe ended.
 */
export enum MoreResults {
  /** A survivor past this page was actually seen. */
  YES = 'MORE_SURVIVOR_PROVEN',
  /** The provider universe ended. This is the only licence to say "no". */
  NO = 'PROVIDER_EXHAUSTED',
  /** The budget stopped the traversal first. Nothing was proven either way. */
  UNKNOWN = 'BUDGET_EXHAUSTED_UNRESOLVED',
}


/**
 * WHETHER THIS PAGE WAS FINISHED — a different question from whether the
 * UNIVERSE has more.
 *
 * Ask for 50, have the read budget end after 20 survivors with the provider not
 * exhausted, and handing back 20 rows plus a continuation makes the browser's
 * next move page 2. Nothing is duplicated and nothing is lost, but the page
 * boundaries become a fiction: page 1 was never finished, it was abandoned. A
 * work budget ending is not a statement about the shape of the result set.
 */
export enum PageCompleteness {
  /** The requested number of rows was delivered. */
  COMPLETE = 'PAGE_COMPLETE',
  /** Short because the universe ended here. Legitimately the last page. */
  FINAL_PARTIAL = 'FINAL_PARTIAL_PAGE',
  /** Short because WE stopped reading. Not a finished page. */
  INCOMPLETE_BUDGET = 'PAGE_INCOMPLETE_BUDGET',
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
  readonly fetchPage: (
    skip: number,
    top: number,
    phase?: { scope: string; orderBy: string; predicate: string | null },
  ) => Promise<ProviderPage<T>>;
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
  /**
   * RESUME A SEQUENTIAL TRAVERSAL instead of re-walking from row zero.
   *
   * Without this, every deep page pays the whole prefix again and the read
   * budget becomes a hidden maximum searchable inventory. With it, the budget
   * bounds the WORK of one request and nothing else.
   *
   * `tail` seeds the dedupe set with the provider-row keys immediately before
   * the boundary. That is sufficient rather than approximate: every canonical
   * sort ends with `ListingKey asc`, so rows sharing a ListingKey are adjacent
   * in the sequence and a duplicate can only straddle the boundary within a
   * short tail of it.
   */
  /**
   * What a resumed traversal carries forward.
   *
   * `providerOffset` is GONE. It was the resume authority until it was proven
   * unstable under a live feed — a withdrawal ahead of the boundary skips a
   * row, an insertion repeats one — and leaving it in the types would let a
   * future engineer reactivate the broken model by accident. Position is the
   * keyset's job now; this carries only what the keyset cannot.
   */
  readonly resume?: {
    /** Final-universe rows already emitted by earlier requests. */
    readonly survivorsConsumed: number;
    /** Boundary provider-row keys, so a twin straddling the seam is deduped. */
    readonly tail: readonly string[];
  };
  /**
   * THE ORDERED PHASES OF THIS SORT.
   *
   * A sort field that can be null has TWO buckets, and which comes first is a
   * Mallan policy rather than something the provider will tell you: known
   * values in the requested order, then unknown values by ListingKey.
   *
   * The ENGINE owns the transition because the engine owns the result universe.
   * Before this existed, phaseScopeClause() defined the buckets correctly and
   * nothing called it — the walk used one unphased query and treated exhausting
   * THAT query as exhausting the PROVIDER. For ListingContractDate that is a
   * live silent truncation: the non-null bucket ends, "no more results" is
   * reported, and 9,771 null-dated listings are never walked.
   *
   * A single-phase sort simply passes one entry.
   */
  readonly phases?: ReadonlyArray<{
    readonly label: string;
    readonly scope: string;
    readonly orderBy: string;
  }>;
  /** Which phase a resumed traversal is in. */
  readonly startPhaseIndex?: number;
  /**
   * KEYSET RESUME within the starting phase — the provider is asked to begin
   * after a position rather than at a distance from the start.
   *
   * Null means START OF PHASE. That is represented explicitly rather than with
   * a sentinel key: inventing a ListingKey to mean "the beginning" would put a
   * value the provider never issued into a filter, and a non-numeric one
   * returns HTTP 500.
   */
  readonly startPredicate?: string | null;
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
  /**
   * Fail-SAFE convenience: true whenever more results may exist, which includes
   * the UNRESOLVED case. Offering another page costs one request; denying one
   * tells a broker inventory does not exist. Read `more` for the precise state.
   */
  readonly hasMore: boolean;
  readonly more: MoreResults;
  /** Whether THIS page was finished — see PageCompleteness. */
  readonly pageCompleteness: PageCompleteness;
  readonly hasPrevious: boolean;
  /** `@odata.count`, kept and kept SEPARATE. Never a result count. */
  readonly providerMatched: number | null;
  readonly truncatedAtBudget: boolean;
  readonly providerRowsRead: number;
  /** Survivors emitted BEFORE this page, carried through from a resume. */
  readonly survivorsConsumedBefore: number;
  /** Provider-row keys of this page's rows, in order, for the next tail. */
  readonly pageRowKeys: readonly string[];
  /** The LAST row emitted on this page — the boundary for the next keyset. */
  readonly boundaryRow: T | null;
  /** Which phase the boundary row sits in, so a resume starts in the right bucket. */
  readonly boundaryPhaseIndex: number;
  readonly exclusions: {
    readonly identityless: number;
    /** Gated rows BY REASON — "12 excluded" is not an answer to "why". */
    readonly gated: Readonly<Record<string, number>>;
    /** Repeated PROVIDER rows. Not Mallan canonical reconciliation. */
    readonly providerDuplicates: number;
  };
  /**
   * Rows that PASSED the gates, counted BEFORE dedupe.
   *
   * Kept separate because deriving gate failures from the post-dedupe count
   * charges provider duplicates to the distribution gates — telemetry that has
   * a compliance investigation reading a gate rejecting rows it never saw.
   */
  readonly gatePassedBeforeDedupe: number;
}


/**
 * Absolute runaway guard on provider rows read in ONE REQUEST.
 *
 * This is a work bound, and — since continuation exists — nothing more. A
 * sequential traversal resumes past it via `resume`, so it can no longer act as
 * a hidden maximum searchable inventory. That distinction matters: the biggest
 * live filter observed is 591,292 rows for `Permission eq 'IDX'`, which is an
 * order of magnitude past this number, and historical/CMA workflows genuinely
 * need to traverse populations that size.
 *
 * What it still does is stop a single pathological request crawling forever.
 * When it bites, the response says BUDGET_EXHAUSTED_UNRESOLVED rather than
 * pretending the universe ended.
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
    resume,
    phases = [{ label: 'SINGLE', scope: '', orderBy: '' }],
    startPhaseIndex = 0,
    startPredicate = null,
  } = options;

  const survivorsConsumedBefore = resume?.survivorsConsumed ?? 0;

  const survivors: T[] = [];
  // Seeded from the boundary tail so a twin straddling a continuation boundary
  // is still deduped.
  const seenProviderRows = new Set<string>(resume?.tail ?? []);
  const gated: Record<string, number> = {};
  let identityless = 0;
  let providerDuplicates = 0;
  let gatePassedBeforeDedupe = 0;

  let providerMatched: number | null = null;
  let providerRowsRead = 0;
  let exhausted = false;
  let truncatedAtBudget = false;

  /**
   * How many survivors settle the question. One PAST the requested page is
   * enough to know whether a next page exists, so a caller asking for page 1 of
   * a huge universe does not pay for an exact count it did not request.
   */
  // Resuming, only THIS page's worth is needed — the prefix was already walked
  // by the requests that produced the continuation. That is the whole reason a
  // deep page stops costing the entire prefix again.
  const neededForPage = resume ? pageSize + 1 : page * pageSize + 1;

  // WHICH PHASE EACH SURVIVOR CAME FROM, so a resume starts in the right bucket
  // rather than restarting the KNOWN walk after crossing into NULLS.
  const survivorPhases: number[] = [];

  let phaseIndex = startPhaseIndex;
  // Only the FIRST phase of a resumed traversal continues from a keyset
  // position. Every phase after it starts at its own beginning.
  let phasePredicate: string | null = startPredicate;
  let phaseRowsRead = 0;
  let phaseExhausted = false;

  while (providerRowsRead < providerBudget) {
    if (!exactCount && survivors.length >= neededForPage) break;

    // PHASE TRANSITION. Exhausting the current bucket is not exhausting the
    // provider — it is the end of one bucket. Only running out of PHASES ends
    // the universe.
    if (phaseExhausted) {
      if (phaseIndex >= phases.length - 1) {
        exhausted = true;
        break;
      }
      phaseIndex += 1;
      phasePredicate = null;
      phaseRowsRead = 0;
      phaseExhausted = false;
    }

    const remainingBudget = providerBudget - providerRowsRead;
    const top = Math.min(providerPageSize, remainingBudget);
    const current = phases[phaseIndex];
    // The query is narrowed to this phase, and further narrowed by the keyset
    // when resuming, so the walk always starts at offset 0 of what it asked
    // for. Adding a numeric offset on top would skip rows the predicate has
    // already excluded.
    const providerPage = await fetchPage(phaseRowsRead, top, {
      scope: current.scope,
      orderBy: current.orderBy,
      predicate: phasePredicate,
    });

    if (providerPage.providerMatched != null) providerMatched = providerPage.providerMatched;
    providerRowsRead += providerPage.records.length;
    phaseRowsRead += providerPage.records.length;
    phaseExhausted = providerPage.exhausted;

    let rowsConsumedThisPage = providerRowsRead - providerPage.records.length;
    for (const record of providerPage.records) {
      rowsConsumedThisPage += 1;
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
      gatePassedBeforeDedupe += 1;

      const rowKey = providerRowKey(record);
      if (seenProviderRows.has(rowKey)) {
        providerDuplicates += 1;
        continue;
      }
      seenProviderRows.add(rowKey);

      survivors.push(record);
      survivorPhases.push(phaseIndex);
    }

    // The records were empty but the provider did not say it was done. Treat it
    // as the end of THIS phase rather than of the universe, so a provider that
    // answers nothing cannot silently swallow the phases after it.
    if (providerPage.records.length === 0) phaseExhausted = true;
  }

  // Exhaustion of the LAST phase is the only thing that ends the universe.
  if (phaseExhausted && phaseIndex >= phases.length - 1) exhausted = true;
  if (!exhausted && providerRowsRead >= providerBudget) truncatedAtBudget = true;

  // On a resumed traversal the survivors seen so far are only THIS segment, so
  // the running total has to include what earlier requests already emitted.
  const count = survivorsConsumedBefore + survivors.length;
  const countMeaning = exhausted ? CountMeaning.EXACT : CountMeaning.LOWER_BOUND;

  // THREE STATES, NEVER TWO.
  //
  // A survivor past the page was seen -> YES. The provider ended -> NO. The
  // budget stopped us first -> UNKNOWN, and UNKNOWN must never be flattened
  // into NO, which is what `count > page * pageSize` alone would have done.
  const survivorBeyondPage = resume
    ? survivors.length > pageSize
    : count > page * pageSize;
  const more = survivorBeyondPage
    ? MoreResults.YES
    : exhausted
      ? MoreResults.NO
      : MoreResults.UNKNOWN;

  const start = resume ? 0 : (page - 1) * pageSize;
  const rows = survivors.slice(start, start + pageSize);

  // The keyset boundary is the LAST EMITTED row, not the last row READ. A
  // segment can read 60 rows, find 51 survivors and return 40 — resuming from
  // the read position would skip the 11 found but never shown, a gap the broker
  // would never see.
  const lastEmitted = start + rows.length - 1;

  // A short page is only FINAL if the universe ended. If the budget ended, the
  // page is unfinished and the caller must finish it before moving on.
  const pageCompleteness =
    rows.length >= pageSize
      ? PageCompleteness.COMPLETE
      : exhausted
        ? PageCompleteness.FINAL_PARTIAL
        : PageCompleteness.INCOMPLETE_BUDGET;

  return {
    rows,
    page,
    pageSize,
    pageCompleteness,
    count,
    countMeaning,
    // NULL, not a fabricated number, when the traversal stopped early.
    totalPages: countMeaning === CountMeaning.EXACT
      ? Math.max(1, Math.ceil(count / pageSize))
      : null,
    hasMore: more !== MoreResults.NO,
    more,
    hasPrevious: resume ? survivorsConsumedBefore > 0 : page > 1,
    providerMatched,
    truncatedAtBudget,
    providerRowsRead,
    survivorsConsumedBefore,
    pageRowKeys: rows.map((r) => providerRowKey(r)),
    // Deliberately the RAW provider record, never a mapped DTO: the next
    // boundary value is fed straight back to Cotality, and a value that has been
    // through a renderer is a different value.
    boundaryRow: rows.length > 0 ? rows[rows.length - 1] : null,
    boundaryPhaseIndex: rows.length > 0 ? survivorPhases[lastEmitted] : phaseIndex,
    exclusions: { identityless, gated, providerDuplicates },
    gatePassedBeforeDedupe,
  };
}
