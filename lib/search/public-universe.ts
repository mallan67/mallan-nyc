/**
 * ONE PUBLIC RESULT UNIVERSE, SETTLED BEFORE COUNT AND PAGINATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS OWNS
 *
 * The public search cut a page with Prisma `skip`/`take` and only then decided
 * membership: display eligibility, Mallan reconciliation, ownership/year/
 * furnished/amenity/keyword filters and the Open House intersection all ran on
 * rows that were already a page. Three separate wrong answers came out of that
 * one ordering:
 *
 *   RAGGED PAGES     a page of 50 rendering 31, because 19 were removed after
 *                    the slice. The next page starts at 51 regardless, so the
 *                    19 are not pulled forward — they are LOST, not deferred.
 *   A COUNT THAT     `total` came from `prisma.count(where)`, which never saw
 *   DESCRIBES        the JS filters. The number above the cards and the cards
 *   ANOTHER SET      themselves described different populations.
 *   PAGE-LOCAL       a Mallan exclusive on page 1 could not suppress its IDX
 *   RECONCILIATION   twin on page 4, so one physical unit occupied two
 *                    identities in the public universe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT JUST OVER-FETCH
 *
 * The tempting fix is to read `(skip + limit) * k` rows and hope k is generous.
 * That is the same defect with a bigger constant: it still cannot prove it read
 * far enough, and the moment exclusions exceed the multiple it silently drops
 * rows again — most likely on deep pages, where nobody looks. A read budget may
 * bound the WORK of one request. It may never masquerade as the end of the
 * inventory, so a truncated traversal reports LOWER_BOUND and says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ORDER, AND WHY EACH STEP SITS WHERE IT DOES
 *
 *   candidates (SQL-ordered, gates and suppression already in the predicate)
 *     -> reconcile        GLOBAL. A twin two batches away must still be seen.
 *     -> corpus filters   Row-local, but run after reconcile so the surviving
 *                         identity is the one tested — the same relative order
 *                         the route applied before, now over the whole corpus.
 *     -> count            EXACT only if the traversal was exhausted.
 *     -> page             cut LAST, from settled membership.
 *
 * Sorting is not a step here: candidates arrive in the global SQL order and
 * every stage preserves relative order, so the page is a window on a globally
 * sorted set rather than a locally sorted page.
 */

/** Whether the count describes the whole universe or only what was reached. */
export enum PublicCountMeaning {
  /** The traversal reached the end. The number is the universe. */
  EXACT = "exact",
  /** The budget ended first. At least this many; possibly more. */
  LOWER_BOUND = "lower_bound",
}

export interface PublicUniverseInput<TRow, TDto> {
  /**
   * Reads candidates in the GLOBAL sort order. `skip`/`take` are candidate
   * coordinates, never page coordinates — this walks the universe, and the
   * broker's page is cut from what survives it.
   */
  readonly readBatch: (skip: number, take: number) => Promise<TRow[]>;
  /** Maps a batch of rows to public DTOs. */
  readonly toDtos: (rows: TRow[]) => TDto[] | Promise<TDto[]>;
  /**
   * Mallan listing authority. Collapses one physical listing to one identity.
   * Runs ONCE over the accumulated corpus, never per batch: a CRM exclusive in
   * the last batch must still suppress its IDX twin from the first.
   */
  readonly reconcile: (dtos: TDto[]) => TDto[];
  /** Complete-corpus business filters (ownership, year, furnished, amenities, keywords, open house). */
  readonly corpusFilter: (dtos: TDto[]) => TDto[] | Promise<TDto[]>;
  /** 1-based page of the FINAL universe. */
  readonly page: number;
  readonly pageSize: number;
  /** Hard ceiling on candidate rows read, so one request cannot run away. */
  readonly budget: number;
  /** Rows per candidate read. */
  readonly batchSize?: number;
  /**
   * READ ONE PAGE INSTEAD OF THE UNIVERSE — only when membership cannot change.
   *
   * Walking the corpus is what makes the count and the page agree, but when no
   * stage can remove or move a row it is pure cost: the first live measurement
   * of the corrected path read 7,125 candidates to return 5 rows and took 11.5s
   * cold, against 0.2s warm. Correct and unusably slow is not a fix.
   *
   * The caller must PROVE the precondition, because one part of it cannot be
   * checked from a page: `reconcile` collapses twins, and a twin can sit outside
   * any single page, so only a corpus-wide fact ("no Mallan-authored row matches
   * this predicate") licenses skipping the walk. `count` is then the predicate
   * count, which is exact precisely because nothing downstream removes anything.
   *
   * What CAN be checked here is checked: if `toDtos`, `reconcile` or
   * `corpusFilter` change the page after all, the precondition was wrong and
   * this falls back to the full traversal rather than serving a page whose
   * count no longer describes it.
   */
  readonly singlePageWhenSettled?: {
    /** Caller-proven: no stage can change membership for this request. */
    readonly proven: boolean;
    /** The predicate count, which IS the membership count under that proof. */
    readonly count: number;
  };
}

export interface PublicUniverse<TDto> {
  /** The requested page, cut from settled membership. */
  readonly rows: TDto[];
  /** Size of the final universe, under `countMeaning`. */
  readonly count: number;
  readonly countMeaning: PublicCountMeaning;
  /** True only when the candidate traversal actually reached the end. */
  readonly exhausted: boolean;
  readonly candidatesRead: number;
  /** Kept separate so a missing-listing investigation can see WHICH stage removed it. */
  readonly exclusions: {
    readonly reconciled: number;
    readonly corpusFiltered: number;
  };
  /** NULL when the count is a lower bound — "1000+ results / page 1 of 5" is a contradiction. */
  readonly totalPages: number | null;
  readonly hasMore: boolean;
  readonly hasPrevious: boolean;
}

const DEFAULT_BATCH = 500;

export async function assemblePublicUniverse<TRow, TDto>(
  input: PublicUniverseInput<TRow, TDto>,
): Promise<PublicUniverse<TDto>> {
  const pageSize = Math.max(1, input.pageSize);
  const page = Math.max(1, input.page);
  const batchSize = Math.max(1, input.batchSize ?? DEFAULT_BATCH);

  const settled = input.singlePageWhenSettled;
  if (settled?.proven) {
    const start = (page - 1) * pageSize;
    const rows = await input.readBatch(start, pageSize);
    const dtos = await input.toDtos(rows);
    const reconciled = input.reconcile(dtos);
    const survivors = await input.corpusFilter(reconciled);

    // THE PRECONDITION, VERIFIED RATHER THAN TRUSTED.
    //
    // Under the proof no stage may remove a row, so any shrinkage means the
    // proof was wrong — a display gate disagreeing with the SQL predicate, or a
    // filter that was supposed to be inactive. Serving this page would publish a
    // count that no longer describes it, so fall through to the honest walk.
    if (survivors.length === rows.length) {
      return {
        rows: survivors,
        count: settled.count,
        countMeaning: PublicCountMeaning.EXACT,
        exhausted: true,
        candidatesRead: rows.length,
        exclusions: { reconciled: 0, corpusFiltered: 0 },
        totalPages: Math.max(1, Math.ceil(settled.count / pageSize)),
        hasMore: start + survivors.length < settled.count,
        hasPrevious: page > 1,
      };
    }
  }

  const candidates: TDto[] = [];
  let candidatesRead = 0;
  let exhausted = false;

  while (candidatesRead < input.budget) {
    const take = Math.min(batchSize, input.budget - candidatesRead);
    const rows = await input.readBatch(candidatesRead, take);
    candidatesRead += rows.length;

    if (rows.length > 0) {
      candidates.push(...(await input.toDtos(rows)));
    }

    // A SHORT BATCH IS THE END; A FULL ONE PROVES NOTHING.
    //
    // Asking for `take` and receiving fewer is the reader's own statement that
    // it ran out. Receiving exactly `take` says only that the batch was filled,
    // so the loop goes round again rather than guessing.
    if (rows.length < take) {
      exhausted = true;
      break;
    }
  }

  // GLOBAL, in this order, and only now that the corpus is whole.
  const beforeReconcile = candidates.length;
  const reconciled = input.reconcile(candidates);
  const afterReconcile = reconciled.length;

  const survivors = await input.corpusFilter(reconciled);

  const count = survivors.length;
  const countMeaning = exhausted
    ? PublicCountMeaning.EXACT
    : PublicCountMeaning.LOWER_BOUND;

  const start = (page - 1) * pageSize;
  const rows = survivors.slice(start, start + pageSize);

  return {
    rows,
    count,
    countMeaning,
    exhausted,
    candidatesRead,
    exclusions: {
      reconciled: beforeReconcile - afterReconcile,
      corpusFiltered: afterReconcile - count,
    },
    // Withheld unless the traversal PROVED the end. A last-page number derived
    // from a lower bound is a promise the universe may not keep.
    totalPages: exhausted ? Math.max(1, Math.ceil(count / pageSize)) : null,
    // Fail-SAFE: more may exist either because the page does not reach the end
    // of what we counted, or because the count itself is only a floor.
    hasMore: !exhausted || start + rows.length < count,
    hasPrevious: page > 1,
  };
}
