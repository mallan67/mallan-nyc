/// <reference types="jest" />
/**
 * THE FINAL SEARCH UNIVERSE.
 *
 * Everything a broker is shown, counted, paged, sorted, compared, reported on
 * and saved rests on one question: WHICH ROWS ARE THE RESULTS? Until that has a
 * single answer, paging is just moving correctly through the wrong set.
 *
 * What the search did before this module existed:
 *
 *   1. ask Cotality for 200 rows and @odata.count
 *   2. drop rows with no ListingKey
 *   3. drop rows the distribution gates block
 *   4. hand the survivors to the browser
 *   5. the browser filters them AGAIN, pages over what is left, and prints
 *      that array's length as "N Results"
 *
 * A live Manhattan Active-residential search matches 4,622 listings. The broker
 * saw at most 200 of them and was told the total was what fitted on screen.
 * That is not an inflated count, it is a silently truncated one, which is worse
 * for a broker: it reads as "this inventory does not exist."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CHAIN, IN ORDER. Each step can only remove rows, and each removal has to
 * be attributable:
 *
 *   provider matching universe   (@odata.count — PRE-FINAL, never a result count)
 *     -> ListingKey integrity     (a row nobody can address is not a result)
 *     -> distribution gates       (owner opt-out, participant-only, internet
 *                                  display, closed >24h)
 *     -> canonical dedupe         (one listing, not a provider twin, counted once)
 *   = FINAL SEARCH UNIVERSE
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COUNT CARRIES ITS OWN MEANING. A bare number cannot say whether it is
 * exact, so this returns the meaning alongside it. `EXACT` is only permitted
 * when the whole provider universe was traversed. Otherwise the number is a
 * declared LOWER BOUND and says so — the one thing forbidden is an approximation
 * that looks exact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY PAGES CANNOT JUST FORWARD THE PROVIDER'S SKIP. If provider rows 4, 9 and
 * 10 are gated, forwarding skip=50 for page 2 gives the broker a 47-row page 1
 * and then silently steps over provider row 51's neighbours. Pages must be cut
 * from the FINAL universe, so a gated row pulls the next survivor forward
 * instead of leaving a hole.
 */
import { keysetResumePredicate } from '@/lib/search/canonical/sort-contract';
import {
  assembleFinalUniverse,
  CountMeaning,
  MoreResults,
  PageCompleteness,
  providerBudgetFor,
  type ProviderPage,
} from '@/lib/search/final-universe';

/** A provider row, reduced to what the chain actually reasons about. */
type Row = { ListingKey: string | null; gated?: string; twinOf?: string };

/**
 * A fake provider that hands out rows in pages, exactly as OData does, and
 * counts how many times it was asked — because "did we fetch more than we
 * needed" is part of the contract, not an implementation detail.
 */
function fakeProvider(rows: Row[], providerPageSize = 50) {
  let calls = 0;
  const fetchPage = async (skip: number, top: number): Promise<ProviderPage<Row>> => {
    calls += 1;
    const slice = rows.slice(skip, skip + Math.min(top, providerPageSize));
    return {
      records: slice,
      providerMatched: rows.length,
      exhausted: skip + slice.length >= rows.length,
    };
  };
  return { fetchPage, calls: () => calls };
}

const key = (r: Row) => r.ListingKey;
const gateOf = (r: Row) => (r.gated ? { displayable: false, reason: r.gated } : { displayable: true });
const canonical = (r: Row) => r.twinOf ?? r.ListingKey ?? '';

const rows = (n: number, mutate: (r: Row, i: number) => void = () => {}): Row[] =>
  Array.from({ length: n }, (_, i) => {
    const r: Row = { ListingKey: `K${String(i).padStart(4, '0')}` };
    mutate(r, i);
    return r;
  });

const assemble = (all: Row[], page: number, pageSize: number, budget = 10_000) =>
  assembleFinalUniverse<Row>({
    fetchPage: fakeProvider(all).fetchPage,
    identity: key,
    gate: gateOf,
    providerRowKey: canonical,
    page,
    pageSize,
    providerBudget: budget,
  });

describe('the chain removes rows in order and attributes every removal', () => {
  it('drops rows with no identity and says how many', async () => {
    const all = rows(10, (r, i) => {
      if (i === 3 || i === 7) r.ListingKey = null;
    });
    const res = await assemble(all, 1, 50);
    expect(res.rows).toHaveLength(8);
    expect(res.exclusions.identityless).toBe(2);
  });

  it('drops gated rows and attributes them BY REASON', async () => {
    // "12 excluded" is not attributable. Which gate fired is what makes a
    // count defensible when a broker asks why a listing is missing.
    const all = rows(10, (r, i) => {
      if (i === 2) r.gated = 'Owner opted out';
      if (i === 5) r.gated = 'Participant-only listing';
      if (i === 6) r.gated = 'Owner opted out';
    });
    const res = await assemble(all, 1, 50);
    expect(res.rows).toHaveLength(7);
    expect(res.exclusions.gated).toEqual({
      'Owner opted out': 2,
      'Participant-only listing': 1,
    });
  });

  it('counts a canonical duplicate once and keeps the first occurrence', async () => {
    const all = rows(6);
    all[4].twinOf = 'K0001';
    const res = await assemble(all, 1, 50);
    expect(res.rows.map(key)).toEqual(['K0000', 'K0001', 'K0002', 'K0003', 'K0005']);
    expect(res.exclusions.providerDuplicates).toBe(1);
  });

  it('an identityless row is never reached by the gate', async () => {
    // Order is load-bearing: a row with no key cannot be addressed, gated or
    // deduped, so it must leave the chain first.
    const all = rows(4, (r, i) => {
      if (i === 1) {
        r.ListingKey = null;
        r.gated = 'Owner opted out';
      }
    });
    const res = await assemble(all, 1, 50);
    expect(res.exclusions.identityless).toBe(1);
    expect(res.exclusions.gated).toEqual({});
  });
});

describe('pages are cut from the FINAL universe, not the provider page', () => {
  /** 120 rows with provider rows 4, 9 and 10 gated — the named difficult case. */
  const gappy = () =>
    rows(120, (r, i) => {
      if (i === 4 || i === 9 || i === 10) r.gated = 'Participant-only listing';
    });

  it('page 1 is FULL even though three rows inside it are gated', async () => {
    // The defect this replaces: a 47-row page 1 that looks like the search
    // simply found fewer listings.
    const res = await assemble(gappy(), 1, 50);
    expect(res.rows).toHaveLength(50);
  });

  it('page 2 continues from the next SURVIVOR, not from provider row 51', async () => {
    const p1 = await assemble(gappy(), 1, 50);
    const p2 = await assemble(gappy(), 2, 50);
    const survivors = gappy().filter((r) => !r.gated);
    expect(p1.rows.map(key)).toEqual(survivors.slice(0, 50).map(key));
    expect(p2.rows.map(key)).toEqual(survivors.slice(50, 100).map(key));
  });

  it('no row appears on two pages and none is skipped', async () => {
    const all = gappy();
    const seen: (string | null)[] = [];
    for (let p = 1; p <= 3; p += 1) {
      seen.push(...(await assemble(all, p, 50)).rows.map(key));
    }
    const survivors = all.filter((r) => !r.gated).map(key);
    expect(seen).toEqual(survivors);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('every page is full except the last', async () => {
    const all = gappy(); // 117 survivors
    const sizes: number[] = [];
    for (let p = 1; p <= 3; p += 1) sizes.push((await assemble(all, p, 50)).rows.length);
    expect(sizes).toEqual([50, 50, 17]);
  });
});

describe('the boundary sizes', () => {
  it.each([
    // One page, containing nothing. An empty universe is still an answer, and
    // the page machinery must present it as page 1 of 1 rather than page 0.
    ['empty', 0, 1, [0]],
    ['one row', 1, 1, [1]],
    ['pageSize-1', 9, 1, [9]],
    ['exactly pageSize', 10, 1, [10]],
    ['pageSize+1', 11, 2, [10, 1]],
    ['past the provider page', 220, 22, undefined],
  ])('%s', async (_label, total, expectedPages, expectedSizes) => {
    const all = rows(total);
    const first = await assemble(all, 1, 10);
    expect(first.totalPages).toBe(expectedPages);
    if (expectedSizes) {
      const sizes: number[] = [];
      for (let p = 1; p <= expectedPages; p += 1) {
        sizes.push((await assemble(all, p, 10)).rows.length);
      }
      expect(sizes).toEqual(expectedSizes);
    }
  });

  it('a page past the end is empty rather than an error', async () => {
    const res = await assemble(rows(5), 9, 10);
    expect(res.rows).toEqual([]);
    expect(res.hasMore).toBe(false);
  });

  it('consecutive gated rows spanning a page boundary do not shift the page', async () => {
    // Six in a row straddling the cut is where an off-by-one hides.
    const all = rows(60, (r, i) => {
      if (i >= 8 && i <= 13) r.gated = 'Owner opted out';
    });
    const survivors = all.filter((r) => !r.gated);
    const p1 = await assemble(all, 1, 10);
    const p2 = await assemble(all, 2, 10);
    expect(p1.rows.map(key)).toEqual(survivors.slice(0, 10).map(key));
    expect(p2.rows.map(key)).toEqual(survivors.slice(10, 20).map(key));
  });
});

describe('the count declares what it means', () => {
  it('is EXACT only when the whole provider universe was traversed', async () => {
    const all = rows(30, (r, i) => {
      if (i < 4) r.gated = 'Owner opted out';
    });
    const res = await assemble(all, 1, 10);
    expect(res.count).toBe(26);
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
  });

  it('is a declared LOWER BOUND when the budget stopped the traversal', async () => {
    // The forbidden outcome is an approximation that looks exact. A bound that
    // says it is a bound is honest and usable.
    const res = await assemble(rows(5_000), 1, 10, 200);
    expect(res.countMeaning).toBe(CountMeaning.LOWER_BOUND);
    expect(res.count).toBeLessThanOrEqual(200);
    expect(res.truncatedAtBudget).toBe(true);
  });

  it('never reports the provider count as the result count', async () => {
    // @odata.count is the PROVIDER matching universe. It is kept, and it is
    // kept separate: it is 30 here while only 26 rows are results.
    const all = rows(30, (r, i) => {
      if (i < 4) r.gated = 'Owner opted out';
    });
    const res = await assemble(all, 1, 10);
    expect(res.providerMatched).toBe(30);
    expect(res.count).not.toBe(res.providerMatched);
  });

  it('an exact count equals the rows actually pageable', async () => {
    // The count and the pages must describe the same universe, or the last
    // page number lies.
    const all = rows(47, (r, i) => {
      if (i % 7 === 0) r.gated = 'Participant-only listing';
    });
    const res = await assemble(all, 1, 10);
    let paged = 0;
    for (let p = 1; p <= res.totalPages; p += 1) {
      paged += (await assemble(all, p, 10)).rows.length;
    }
    expect(paged).toBe(res.count);
  });

  it('hasMore agrees with the count and the page', async () => {
    const all = rows(25);
    expect((await assemble(all, 1, 10)).hasMore).toBe(true);
    expect((await assemble(all, 2, 10)).hasMore).toBe(true);
    expect((await assemble(all, 3, 10)).hasMore).toBe(false);
  });
});

describe('the provider is not read more than the contract needs', () => {
  it('stops as soon as the page is filled and hasMore is known', async () => {
    // An exact count is expensive; page 1 of a huge universe must not pay for
    // it when the caller only asked for a page.
    const provider = fakeProvider(rows(5_000));
    const res = await assembleFinalUniverse<Row>({
      fetchPage: provider.fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 10,
      providerBudget: 5_000,
      exactCount: false,
    });
    expect(res.rows).toHaveLength(10);
    expect(res.countMeaning).toBe(CountMeaning.LOWER_BOUND);
    expect(provider.calls()).toBeLessThanOrEqual(2);
  });

  it('an exact count is opt-in and traverses everything', async () => {
    const provider = fakeProvider(rows(300));
    const res = await assembleFinalUniverse<Row>({
      fetchPage: provider.fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 10,
      providerBudget: 5_000,
      exactCount: true,
    });
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
    expect(res.count).toBe(300);
    expect(provider.calls()).toBe(6);
  });
});

describe('order is preserved exactly as the provider sorted it', () => {
  it('the chain never reorders survivors', async () => {
    // Sort is the provider's job; this module must be order-preserving or a
    // stable sort contract cannot be built on top of it.
    const all = rows(40, (r, i) => {
      if (i % 3 === 0) r.gated = 'Owner opted out';
    });
    const res = await assemble(all, 1, 50);
    expect(res.rows.map(key)).toEqual(all.filter((r) => !r.gated).map(key));
  });
});

/**
 * P0 — A READ BUDGET MAY BOUND WORK PER REQUEST. IT MAY NOT BOUND INVENTORY.
 *
 * The route walked the provider from row zero for every broker page under a
 * flat ceiling of 1,000 provider rows. A universe of 4,622 matches could
 * therefore report "1000+ Results" and be physically incapable of returning
 * result 1,001: at 50 rows a page, page 21 needs the 1,001st survivor, and the
 * request was forbidden from reading that far.
 *
 * Truthfully admitting that more inventory exists while making it unreachable
 * is not acceptable pagination.
 *
 * Measured live 2026-08-26, which is what makes a stateless rescan viable:
 * $top=200 -> 1,801ms, $top=1000 -> 2,077ms, $top=5000 -> 2,134ms. Latency is
 * round-trip dominated, not row-count dominated, so the whole 4,622-row
 * universe is ONE request. No cursor, no cache, no schema.
 */
describe('deep pages are reachable', () => {
  it('page 21 at pageSize 50 returns the 1,001st survivor', async () => {
    const all = rows(4_622);
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 21,
      pageSize: 50,
      providerBudget: providerBudgetFor(21, 50),
      exactCount: false,
    });
    expect(res.rows).toHaveLength(50);
    expect(res.rows[0].ListingKey).toBe(all[1_000].ListingKey);
  });

  it('page 6 at pageSize 200 is reachable too', async () => {
    const all = rows(4_622);
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 6,
      pageSize: 200,
      providerBudget: providerBudgetFor(6, 200),
      exactCount: false,
    });
    expect(res.rows).toHaveLength(200);
    expect(res.rows[0].ListingKey).toBe(all[1_000].ListingKey);
  });

  it('the budget still scales with the page rather than being unbounded', () => {
    // A ceiling must still exist — it just must not masquerade as the maximum
    // searchable inventory.
    expect(providerBudgetFor(1, 50)).toBeLessThan(providerBudgetFor(21, 50));
    expect(providerBudgetFor(1, 50)).toBeGreaterThanOrEqual(50);
  });

  it('the absolute ceiling is a runaway guard, not an inventory cap', () => {
    // Big enough that no real REBNY result universe hits it by accident.
    expect(providerBudgetFor(10_000, 200)).toBeGreaterThanOrEqual(50_000);
  });

  it('a deep page still survives heavy exclusions', async () => {
    // Half the universe gated: reaching survivor 1,001 now needs ~2,002
    // provider rows, so a budget derived only from page*pageSize would fail.
    const all = rows(4_622, (r, i) => {
      if (i % 2 === 1) r.gated = 'Owner opted out';
    });
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 21,
      pageSize: 50,
      providerBudget: providerBudgetFor(21, 50),
      exactCount: false,
    });
    expect(res.rows).toHaveLength(50);
    expect(res.rows[0].ListingKey).toBe(all[2_000].ListingKey);
  });
});

/**
 * P0 — A LOWER BOUND CANNOT NAME THE LAST PAGE.
 *
 * These two statements contradict each other:
 *
 *     1000+ Results
 *     Page 1 of 5
 *
 * The `+` says more inventory may exist; `of 5` says page 5 is the end. Only an
 * EXACT count knows where the universe stops, so totalPages is null until the
 * traversal proves exhaustion, and navigation is open-ended until then.
 */
describe('totalPages is only knowable from an exact count', () => {
  it('an exact count names the last page', async () => {
    const res = await assemble(rows(30), 1, 10);
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
    expect(res.totalPages).toBe(3);
  });

  it('a lower bound reports totalPages as UNKNOWN, not a fabricated number', async () => {
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(rows(5_000)).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 10,
      providerBudget: 200,
      exactCount: false,
    });
    expect(res.countMeaning).toBe(CountMeaning.LOWER_BOUND);
    expect(res.totalPages).toBeNull();
  });

  it('open-ended navigation is still fully described', async () => {
    // Without a last page, Prev/Next still need to be correct.
    const provider = fakeProvider(rows(5_000));
    const opts = (page: number) => ({
      fetchPage: provider.fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page,
      pageSize: 10,
      providerBudget: 200,
      exactCount: false,
    });
    const p1 = await assembleFinalUniverse<Row>(opts(1));
    const p3 = await assembleFinalUniverse<Row>(opts(3));
    expect(p1.hasPrevious).toBe(false);
    expect(p1.hasMore).toBe(true);
    expect(p3.hasPrevious).toBe(true);
    expect(p3.hasMore).toBe(true);
  });

  it('reaching the end turns a lower bound into an exact total', async () => {
    // The traversal itself proves exhaustion, which is the only thing that may
    // license a final page number.
    const res = await assemble(rows(25), 3, 10);
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
    expect(res.totalPages).toBe(3);
    expect(res.hasMore).toBe(false);
    expect(res.hasPrevious).toBe(true);
  });
});

/**
 * P0 — "WE STOPPED LOOKING" IS NOT "THERE IS NOTHING MORE".
 *
 * hasMore was computed as `count > page * pageSize`. That is a sound conclusion
 * only when one of two facts has actually been established:
 *
 *   A. a survivor beyond this page was observed, or
 *   B. the provider universe was exhausted.
 *
 * If traversal stopped at the read budget before either was proven, `false` is
 * an unsupported claim — and it is the dangerous direction, because a broker
 * reads it as "that is all the inventory".
 *
 * The worst shape is a budget-exhausted traversal that found NO survivors at
 * all: zero rows, count zero, hasMore false, presented as an authoritative
 * empty search, while hundreds of thousands of provider rows sit untraversed.
 * Mallan choosing not to read farther is not evidence that the universe ended.
 */
describe('budget exhaustion is never reported as "no more results"', () => {
  /** 100,000 rows where the first 60,000 are gated and survivors follow. */
  const hostile = () =>
    rows(100_000, (r, i) => {
      if (i < 60_000) r.gated = 'Owner opted out';
    });

  it('a budget-exhausted traversal with zero survivors is UNRESOLVED, not empty', async () => {
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(hostile(), 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 10_000,
      exactCount: false,
    });
    expect(res.rows).toHaveLength(0);
    expect(res.count).toBe(0);
    // The claim that must never be made.
    expect(res.more).toBe(MoreResults.UNKNOWN);
    expect(res.truncatedAtBudget).toBe(true);
  });

  it('hasMore stays TRUE while the question is unresolved', async () => {
    // Fail-safe direction: offering another page costs a request; denying one
    // tells a broker inventory does not exist.
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(hostile(), 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 10_000,
      exactCount: false,
    });
    expect(res.hasMore).toBe(true);
  });

  it('only an exhausted provider may say NO', async () => {
    const res = await assemble(rows(30), 3, 10);
    expect(res.more).toBe(MoreResults.NO);
    expect(res.hasMore).toBe(false);
  });

  it('an observed survivor beyond the page says YES', async () => {
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(rows(5_000)).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 10,
      providerBudget: 1_000,
      exactCount: false,
    });
    expect(res.more).toBe(MoreResults.YES);
    expect(res.hasMore).toBe(true);
  });

  it('a genuinely empty universe is still an answer', async () => {
    // The distinction has to cut both ways or it just blocks real zero results.
    const res = await assemble(rows(0), 1, 10);
    expect(res.count).toBe(0);
    expect(res.more).toBe(MoreResults.NO);
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
  });

  it('every row gated, provider EXHAUSTED, is a real empty universe', async () => {
    const all = rows(40, (r) => {
      r.gated = 'Owner opted out';
    });
    const res = await assemble(all, 1, 10);
    expect(res.count).toBe(0);
    expect(res.more).toBe(MoreResults.NO);
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
  });

  it('a deep page whose exclusions outrun the 4x overshoot is UNRESOLVED, not short', async () => {
    // "Four times should be enough" is a performance heuristic, not a
    // correctness proof. At 95% exclusion the headroom is nowhere near enough,
    // and the answer must say so rather than quietly return a short page.
    const all = rows(100_000, (r, i) => {
      if (i % 20 !== 0) r.gated = 'Participant-only listing';
    });
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 21,
      pageSize: 50,
      providerBudget: providerBudgetFor(21, 50),
      exactCount: false,
    });
    if (res.rows.length < 50) {
      expect(res.more).toBe(MoreResults.UNKNOWN);
    } else {
      expect(res.rows).toHaveLength(50);
    }
  });
});

/**
 * P0 — EXCLUSION ACCOUNTING MUST BALANCE.
 *
 * Telemetry is evidence. If provider duplicates are folded into the gate
 * failures, a compliance or missing-result investigation reads a distribution
 * gate rejecting rows it never saw.
 */
describe('the traversed prefix accounts for every row it read', () => {
  it('rows read = identityless + gated + duplicates + survivors', async () => {
    const all = rows(200, (r, i) => {
      if (i % 17 === 0) r.ListingKey = null;
      else if (i % 11 === 0) r.gated = 'Owner opted out';
      else if (i % 23 === 0) r.twinOf = 'K0001';
    });
    const res = await assemble(all, 1, 50);
    const gated = Object.values(res.exclusions.gated).reduce((a, b) => a + b, 0);
    expect(
      res.exclusions.identityless + gated + res.exclusions.providerDuplicates + res.count,
    ).toBe(res.providerRowsRead);
  });

  it('gate passes are counted BEFORE dedupe', async () => {
    // universe.count is post-dedupe, so deriving gate failures from it would
    // charge provider duplicates to the distribution gates.
    const all = rows(10);
    all[3].twinOf = 'K0001';
    const res = await assemble(all, 1, 50);
    expect(res.exclusions.providerDuplicates).toBe(1);
    expect(res.gatePassedBeforeDedupe).toBe(10);
    expect(res.count).toBe(9);
  });
});

/**
 * RESUME — the budget bounds WORK, not INVENTORY.
 *
 * Without continuation, every deep page re-walks the whole prefix and stops at
 * the same ceiling, so result 60,001 is permanently unreachable. With it, one
 * request reads one segment and hands on its position.
 */
describe('a resumed traversal reaches past the read ceiling', () => {
  const HUGE = 200_000;

  it('resuming at provider offset 60,000 returns real rows', async () => {
    const all = rows(HUGE);
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 10_000,
      exactCount: false,
      resume: { providerOffset: 60_000, survivorsConsumed: 60_000, tail: [] },
    });
    expect(res.rows).toHaveLength(50);
    expect(res.rows[0].ListingKey).toBe(all[60_000].ListingKey);
    // The running count includes what earlier requests already emitted.
    expect(res.count).toBeGreaterThan(60_000);
  });

  it('a resumed segment only pays for its own rows', async () => {
    // The point of the whole mechanism: a deep page must not cost the prefix.
    const provider = fakeProvider(rows(HUGE), 5_000);
    await assembleFinalUniverse<Row>({
      fetchPage: provider.fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 60_000,
      exactCount: false,
      resume: { providerOffset: 150_000, survivorsConsumed: 150_000, tail: [] },
    });
    expect(provider.calls()).toBe(1);
  });

  it('hands on the position the next request needs', async () => {
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(rows(HUGE), 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 10_000,
      exactCount: false,
      resume: { providerOffset: 60_000, survivorsConsumed: 60_000, tail: [] },
    });
    expect(res.providerOffsetReached).toBeGreaterThan(60_000);
    expect(res.survivorsConsumedBefore).toBe(60_000);
    expect(res.pageRowKeys).toHaveLength(50);
  });

  it('a twin straddling the boundary is still deduped', async () => {
    // Every canonical sort ends with ListingKey asc, so rows sharing a key are
    // adjacent — a boundary tail closes this exactly rather than approximately.
    const all = rows(100);
    all[0].twinOf = 'BOUNDARY';
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 10,
      providerBudget: 1_000,
      exactCount: false,
      resume: { providerOffset: 0, survivorsConsumed: 5, tail: ['BOUNDARY'] },
    });
    expect(res.exclusions.providerDuplicates).toBe(1);
    expect(res.rows.map(key)).not.toContain(all[0].ListingKey);
  });

  it('hasPrevious follows the survivors already consumed', async () => {
    const opts = (consumed: number) => ({
      fetchPage: fakeProvider(rows(1_000)).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 10,
      providerBudget: 1_000,
      exactCount: false,
      resume: { providerOffset: 0, survivorsConsumed: consumed, tail: [] as string[] },
    });
    expect((await assembleFinalUniverse<Row>(opts(0))).hasPrevious).toBe(false);
    expect((await assembleFinalUniverse<Row>(opts(50))).hasPrevious).toBe(true);
  });

  it('no duplicate or gap across a continuation boundary', async () => {
    // Walk the universe in segments and prove the sequence is exactly the
    // survivors, once each.
    const all = rows(500, (r, i) => {
      if (i % 7 === 0) r.gated = 'Owner opted out';
    });
    const survivors = all.filter((r) => !r.gated).map(key);
    const seen: (string | null)[] = [];
    let offset = 0;
    let consumed = 0;
    let tail: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await assembleFinalUniverse<Row>({
        fetchPage: fakeProvider(all, 60).fetchPage,
        identity: key,
        gate: gateOf,
        providerRowKey: canonical,
        page: 1,
        pageSize: 40,
        providerBudget: 60,
        exactCount: false,
        resume: { providerOffset: offset, survivorsConsumed: consumed, tail },
      });
      seen.push(...res.rows.map(key));
      offset = res.providerOffsetReached;
      consumed += res.rows.length;
      tail = [...tail, ...res.pageRowKeys].slice(-8);
      if (offset >= all.length) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(survivors.slice(0, seen.length));
  });
});

/**
 * A PAGE THAT RAN OUT OF BUDGET IS NOT A FINISHED PAGE.
 *
 * The three-state `more` contract says whether the UNIVERSE has more. It says
 * nothing about whether THIS PAGE was finished, and those are different
 * questions with different consequences.
 *
 * Ask for 50, have the budget end after 20 survivors with the provider not
 * exhausted, and the old contract handed back 20 rows plus a continuation. The
 * browser's next move is page 2, so the broker gets:
 *
 *     Page 1 = rows 1-20
 *     Page 2 = rows 21-70
 *
 * Nothing is duplicated and nothing is lost, but the page boundaries are a
 * fiction: page 1 was never finished, it was abandoned. A work budget ending is
 * not a statement about the shape of the result set.
 */
describe('page completeness is separate from universe completeness', () => {
  it('a full page is COMPLETE', async () => {
    const res = await assemble(rows(500), 1, 50);
    expect(res.rows).toHaveLength(50);
    expect(res.pageCompleteness).toBe(PageCompleteness.COMPLETE);
  });

  it('a short LAST page with an exhausted provider is legitimately final', async () => {
    // 30 rows, 50 to a page: page 1 is short because that is all there is.
    const res = await assemble(rows(30), 1, 50);
    expect(res.rows).toHaveLength(30);
    expect(res.pageCompleteness).toBe(PageCompleteness.FINAL_PARTIAL);
    expect(res.more).toBe(MoreResults.NO);
  });

  it('a short page because the BUDGET ended is INCOMPLETE, not final', async () => {
    // The distinction that matters: same row count, completely different claim.
    const all = rows(100_000, (r, i) => {
      if (i % 50 !== 0) r.gated = 'Owner opted out';
    });
    const res = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 1_000,
      exactCount: false,
    });
    expect(res.rows.length).toBeLessThan(50);
    expect(res.pageCompleteness).toBe(PageCompleteness.INCOMPLETE_BUDGET);
    expect(res.more).toBe(MoreResults.UNKNOWN);
  });

  it('an empty page from an exhausted provider is final, not incomplete', async () => {
    const res = await assemble(rows(0), 1, 50);
    expect(res.pageCompleteness).toBe(PageCompleteness.FINAL_PARTIAL);
  });

  it('resuming finishes the SAME page rather than starting the next', async () => {
    // pageSize 50; segment 1 is budget-limited, segment 2 supplies the rest.
    // The completed page 1 must be the first 50 survivors, in order, once each.
    const all = rows(100_000, (r, i) => {
      if (i % 10 !== 0) r.gated = 'Participant-only listing';
    });
    const survivors = all.filter((r) => !r.gated).map(key);

    const seg1 = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 200).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      pageSize: 50,
      providerBudget: 200,
      exactCount: false,
    });
    expect(seg1.pageCompleteness).toBe(PageCompleteness.INCOMPLETE_BUDGET);

    const seg2 = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(all, 5_000).fetchPage,
      identity: key,
      gate: gateOf,
      providerRowKey: canonical,
      page: 1,
      // Only the REMAINDER of page 1 is still owed.
      pageSize: 50 - seg1.rows.length,
      providerBudget: 5_000,
      exactCount: false,
      resume: {
        providerOffset: seg1.providerOffsetReached,
        survivorsConsumed: seg1.rows.length,
        tail: seg1.pageRowKeys,
      },
    });

    const page1 = [...seg1.rows.map(key), ...seg2.rows.map(key)];
    expect(page1).toHaveLength(50);
    expect(new Set(page1).size).toBe(50);
    expect(page1).toEqual(survivors.slice(0, 50));
  });
});

/**
 * ADVERSARIAL: THE FEED CHANGES BETWEEN TWO PAGE REQUESTS.
 *
 * Every continuation test above uses a static array, which proves correctness
 * against a frozen feed and nothing else. A live REBNY feed is not frozen: a
 * listing ahead of the boundary can change price, be added, or be withdrawn
 * between a broker pressing Next.
 *
 * These tests demonstrate WHY numeric-offset resume is not deterministic under
 * those conditions, which is the evidence behind moving to a keyset predicate.
 * They are written to FAIL LOUDLY if someone ever concludes `$skip` is stable —
 * a conclusion the static tests would happily support.
 */
describe('numeric offset resume is NOT stable under a live feed', () => {
  const base = () => rows(200);

  it('a removal ahead of the boundary makes an offset SKIP a row', async () => {
    const before = base();
    // Page 1: rows 0..19 emitted, resume offset lands at 20.
    const p1 = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(before, 50).fetchPage,
      identity: key, gate: gateOf, providerRowKey: canonical,
      page: 1, pageSize: 20, providerBudget: 1_000, exactCount: false,
    });
    expect(p1.rows).toHaveLength(20);
    const resumeAt = p1.providerOffsetReached;

    // A listing ahead of the boundary is withdrawn. Everything after it shifts
    // one position toward the front.
    const after = base();
    after.splice(5, 1);

    const p2 = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(after, 50).fetchPage,
      identity: key, gate: gateOf, providerRowKey: canonical,
      page: 1, pageSize: 20, providerBudget: 1_000, exactCount: false,
      resume: { providerOffset: resumeAt, survivorsConsumed: 20, tail: p1.pageRowKeys },
    });

    // The row that SHOULD have led page 2 is the one after the last emitted.
    const expectedNext = before[20].ListingKey;
    // It does not, because the offset now points one row further along.
    expect(p2.rows[0].ListingKey).not.toBe(expectedNext);
    // Concretely: a listing is skipped and the broker never sees it.
    expect(p2.rows.map(key)).not.toContain(expectedNext);
  });

  it('an insertion ahead of the boundary makes an offset REPEAT a row', async () => {
    const before = base();
    const p1 = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(before, 50).fetchPage,
      identity: key, gate: gateOf, providerRowKey: canonical,
      page: 1, pageSize: 20, providerBudget: 1_000, exactCount: false,
    });
    const resumeAt = p1.providerOffsetReached;

    const after = base();
    after.splice(3, 0, { ListingKey: 'NEWLY_LISTED' });

    const p2 = await assembleFinalUniverse<Row>({
      fetchPage: fakeProvider(after, 50).fetchPage,
      identity: key, gate: gateOf, providerRowKey: canonical,
      page: 1, pageSize: 20, providerBudget: 1_000, exactCount: false,
      // Tail deliberately EMPTY: the boundary tail is 8 keys, so it masks a
      // one-row shift. This isolates the offset itself, which is the mechanism
      // under test.
      resume: { providerOffset: resumeAt, survivorsConsumed: 20, tail: [] },
    });

    // A row already shown on page 1 comes back on page 2.
    const page1Keys = new Set(p1.rows.map(key));
    expect(p2.rows.some((r) => page1Keys.has(key(r)))).toBe(true);
  });

  it('the keyset predicate names a POSITION, so neither shift moves it', () => {
    // The replacement. `ListPrice lt 5000000 or (eq and key gt ...)` describes
    // where in the ORDER to resume, so inserting or withdrawing a listing ahead
    // of the boundary cannot move it — there is no "distance from the start"
    // left to be wrong.
    const predicate = keysetResumePredicate('price_desc', 5_000_000, 'K0019');
    expect(predicate).toContain('ListPrice lt 5000000');
    expect(predicate).toContain("ListingKey gt 'K0019'");
    expect(predicate).not.toMatch(/skip/i);
  });
});
