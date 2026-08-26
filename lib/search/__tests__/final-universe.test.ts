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
import { KeysetPhase, keysetResumePredicate } from '@/lib/search/canonical/sort-contract';
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
  /**
   * KEPT AS NEGATIVE EVIDENCE ONLY.
   *
   * The engine no longer HAS an offset resume — `providerOffset`, `startOffset`
   * and `providerOffsetReached` are gone, so a future engineer cannot reactivate
   * the broken model by accident. What remains here is the demonstration of WHY
   * it was retired, expressed against a plain array rather than the engine.
   */
  const rowsAt = (n: number) =>
    Array.from({ length: n }, (_, i) => String(1146011469 + i));

  it('a removal ahead of the boundary makes an offset SKIP a row', () => {
    const before = rowsAt(200);
    const emittedThrough = 20;
    const nextByOffset = before[emittedThrough];

    const after = rowsAt(200);
    after.splice(5, 1); // a listing ahead of the boundary is withdrawn

    // The offset still says 20, but position 20 now holds a DIFFERENT row.
    expect(after[emittedThrough]).not.toBe(nextByOffset);
    // Concretely: the row that should have led the next page is stepped over.
    expect(after.slice(emittedThrough, emittedThrough + 20)).not.toContain(nextByOffset);
  });

  it('an insertion ahead of the boundary makes an offset REPEAT a row', () => {
    const before = rowsAt(200);
    const emittedThrough = 20;
    const alreadySeen = before.slice(0, emittedThrough);

    const after = rowsAt(200);
    after.splice(3, 0, 'NEWLY_LISTED'); // a new listing enters ahead

    // Position 20 now holds a row the broker was already shown.
    expect(alreadySeen).toContain(after[emittedThrough]);
  });

  it('the keyset predicate names a POSITION, so neither shift moves it', () => {
    const predicate = keysetResumePredicate(
      'price_desc',
      KeysetPhase.KNOWN,
      5_000_000,
      '1146011469',
    );
    expect(predicate).toContain('ListPrice lt 5000000');
    expect(predicate).toContain("ListingKey gt '1146011469'");
    expect(predicate).not.toMatch(/skip/i);
    // And it scopes to the KNOWN phase, so a null-valued row cannot silently
    // fall outside the comparison and vanish from the sequence.
    expect(predicate).toContain('ListPrice ne null');
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

/**
 * WHAT KEYSET ACTUALLY GUARANTEES — AND WHAT IT CANNOT.
 *
 * Keyset fixes DISTANCE-FROM-START instability. It does not, and cannot, create
 * a frozen snapshot of a live provider.
 *
 * Verified live 2026-08-26: the Cotality service exposes EntitySets only. There
 * is no $delta, no deltatoken, no snapshot endpoint; the only OData annotations
 * returned are @odata.context and @odata.nextLink, and nextLink is a plain
 * `$skip=N`. So snapshot isolation is UNAVAILABLE from this provider, and any
 * "no duplicates, no gaps" promise that ignores that is a promise Mallan cannot
 * keep.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT, stated so it can be relied on:
 *
 *   PROVIDER UNIVERSE STABLE BETWEEN REQUESTS
 *     -> no duplicate, no gap. Guaranteed.
 *
 *   PROVIDER MUTATES BETWEEN REQUESTS
 *     -> a live-moving universe. A row whose SORT VALUE moves behind the
 *        boundary is missed; one whose sort value moves ahead of it is seen,
 *        possibly a second time. Inherent to paging a live feed without
 *        snapshot isolation — not a Mallan defect, and not something a better
 *        cursor removes.
 *
 * ModificationTimestamp sorts are the sharpest case: a modification is itself
 * the thing being sorted on, so any edit moves that row to the front of a
 * `desc` traversal.
 *
 * CONSEQUENCE FOR COMPARE / CMA: a selection must be durable by ListingKey, not
 * by position. A broker who ticks a listing on page 1 must still have it after
 * the feed moves under them.
 */
describe('keyset under a mutating feed — the honest matrix', () => {
  const priceRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ListingKey: String(1146011469 + i),
      ListPrice: 1_000_000 - i * 1_000,
    })) as any[];

  /** Emulate the provider applying the keyset predicate over a sorted array. */
  function providerAfter(rows: any[], boundaryValue: number, boundaryKey: string) {
    return rows
      .slice()
      .sort((a, b) => b.ListPrice - a.ListPrice || a.ListingKey.localeCompare(b.ListingKey))
      .filter(
        (r) =>
          r.ListPrice < boundaryValue ||
          (r.ListPrice === boundaryValue && r.ListingKey > boundaryKey),
      );
  }

  it('STABLE FEED: no duplicate and no gap', async () => {
    const all = priceRows(100);
    const page1 = all
      .slice()
      .sort((a, b) => b.ListPrice - a.ListPrice)
      .slice(0, 20);
    const boundary = page1[page1.length - 1];
    const page2 = providerAfter(all, boundary.ListPrice, boundary.ListingKey).slice(0, 20);
    const seen = [...page1, ...page2].map((r) => r.ListingKey);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(
      all
        .slice()
        .sort((a, b) => b.ListPrice - a.ListPrice)
        .slice(0, 40)
        .map((r) => r.ListingKey),
    );
  });

  it('AN UNSEEN ROW RAISES ITS PRICE ABOVE THE BOUNDARY: it is missed', async () => {
    // It moved into territory the traversal has already passed. No cursor design
    // recovers this without a snapshot.
    const all = priceRows(100);
    const page1 = all.slice(0, 20);
    const boundary = page1[19];
    const mutated = priceRows(100);
    mutated[60].ListPrice = 5_000_000; // was far below the boundary
    const page2 = providerAfter(mutated, boundary.ListPrice, boundary.ListingKey).slice(0, 20);
    expect(page2.map((r) => r.ListingKey)).not.toContain(mutated[60].ListingKey);
  });

  it('AN ALREADY-SEEN ROW DROPS ITS PRICE BELOW THE BOUNDARY: it repeats', async () => {
    const all = priceRows(100);
    const page1 = all.slice(0, 20);
    const boundary = page1[19];
    const mutated = priceRows(100);
    mutated[3].ListPrice = 1; // was on page 1, now the cheapest row in the set
    // The whole remaining sequence, not a slice: a row repriced to the bottom
    // reappears at the END of the traversal, which is exactly the point — the
    // broker sees it twice, pages apart, with nothing marking it as a repeat.
    const rest = providerAfter(mutated, boundary.ListPrice, boundary.ListingKey);
    expect(rest.map((r) => r.ListingKey)).toContain(mutated[3].ListingKey);
  });

  it('A NEW LISTING ENTERS AHEAD OF THE BOUNDARY: it is missed this pass', async () => {
    const all = priceRows(100);
    const boundary = all[19];
    const mutated = [{ ListingKey: '9999999999', ListPrice: 9_000_000 }, ...priceRows(100)];
    const page2 = providerAfter(mutated, boundary.ListPrice, boundary.ListingKey).slice(0, 20);
    expect(page2.map((r) => r.ListingKey)).not.toContain('9999999999');
  });

  it('A NEW LISTING ENTERS BEHIND THE BOUNDARY: it is picked up', async () => {
    const all = priceRows(100);
    const boundary = all[19];
    const mutated = [...priceRows(100), { ListingKey: '9999999998', ListPrice: 979_500 }];
    const page2 = providerAfter(mutated, boundary.ListPrice, boundary.ListingKey).slice(0, 30);
    expect(page2.map((r) => r.ListingKey)).toContain('9999999998');
  });

  it('A ROW LEAVES THE UNIVERSE: the sequence closes over it, no gap', async () => {
    // A status change removing a row is the benign case — keyset simply does
    // not emit it, and nothing after it shifts, because position is not a count.
    const all = priceRows(100);
    const boundary = all[19];
    const mutated = priceRows(100).filter((r) => r.ListingKey !== String(1146011469 + 25));
    const page2 = providerAfter(mutated, boundary.ListPrice, boundary.ListingKey).slice(0, 20);
    expect(page2.map((r) => r.ListingKey)).not.toContain(String(1146011469 + 25));
    expect(new Set(page2.map((r) => r.ListingKey)).size).toBe(page2.length);
  });

  it('AN EQUAL-VALUE TIE IS TRAVERSED BY KEY, not skipped', async () => {
    // Ties are where an unstable sort loses rows. The ListingKey tie-break makes
    // the order total, so both rows at the same price are reachable.
    const tied = [
      { ListingKey: '1146011470', ListPrice: 500_000 },
      { ListingKey: '1146011471', ListPrice: 500_000 },
      { ListingKey: '1146011472', ListPrice: 400_000 },
    ] as any[];
    const after = providerAfter(tied, 500_000, '1146011470');
    expect(after.map((r) => r.ListingKey)).toEqual(['1146011471', '1146011472']);
  });
});

/**
 * KNOWN -> NULLS MUST ACTUALLY EXECUTE AS TWO PHASES.
 *
 * phaseScopeClause() defined the buckets correctly and then nothing called it.
 * The initial request used the ordinary unphased sort, and the engine had no
 * transition, so exhausting the CURRENT query was treated as exhausting the
 * PROVIDER. For ListingContractDate that is a live silent truncation: the
 * non-null bucket ends, MoreResults.NO is reported, and 9,771 null-dated
 * listings are never walked.
 *
 * The engine owns the transition because the engine owns the result universe.
 * Putting it in the route would be a second pagination authority.
 */
describe('the traversal walks KNOWN then NULLS', () => {
  type PhasedRow = { ListingKey: string; sortValue: string | null };

  /** 100 rows with a value, then 25 with none — the bucket the old code lost. */
  const population = (known: number, nulls: number): PhasedRow[] => [
    ...Array.from({ length: known }, (_, i) => ({
      ListingKey: String(1146011469 + i),
      sortValue: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
    ...Array.from({ length: nulls }, (_, i) => ({
      ListingKey: String(1146012000 + i),
      sortValue: null,
    })),
  ];

  /** A provider that honours the phase scope, as Cotality does. */
  function phasedProvider(all: PhasedRow[]) {
    return async (skip: number, top: number, ks?: { scope?: string }) => {
      const bucket =
        ks?.scope === 'NULLS'
          ? all.filter((r) => r.sortValue === null)
          : all.filter((r) => r.sortValue !== null);
      const slice = bucket.slice(skip, skip + top);
      return {
        records: slice,
        providerMatched: bucket.length,
        exhausted: skip + slice.length >= bucket.length,
      };
    };
  }

  const phases = [
    { label: 'KNOWN', scope: 'KNOWN', orderBy: 'X desc, ListingKey asc' },
    { label: 'NULLS', scope: 'NULLS', orderBy: 'ListingKey asc' },
  ];

  const assemblePhased = (all: PhasedRow[], page: number, pageSize: number) =>
    assembleFinalUniverse<PhasedRow>({
      fetchPage: phasedProvider(all),
      identity: (r) => r.ListingKey,
      gate: () => ({ displayable: true }),
      providerRowKey: (r) => r.ListingKey,
      page,
      pageSize,
      providerBudget: 10_000,
      phases,
    });

  it('100 known + 25 null pages as one 125-row universe', async () => {
    const all = population(100, 25);
    const seen: string[] = [];
    for (let p = 1; p <= 3; p += 1) {
      const res = await assemblePhased(all, p, 50);
      seen.push(...res.rows.map((r) => r.ListingKey));
    }
    expect(seen).toHaveLength(125);
    expect(new Set(seen).size).toBe(125);
    expect(seen).toEqual(all.map((r) => r.ListingKey));
  });

  it('page 3 is the NULL bucket, and only then is there no more', async () => {
    const all = population(100, 25);
    const p2 = await assemblePhased(all, 2, 50);
    expect(p2.more).not.toBe(MoreResults.NO);
    const p3 = await assemblePhased(all, 3, 50);
    expect(p3.rows).toHaveLength(25);
    expect(p3.rows.every((r) => r.sortValue === null)).toBe(true);
    // NO only after the LAST phase is exhausted — this is the assertion the old
    // engine would have failed at page 2.
    expect(p3.more).toBe(MoreResults.NO);
    expect(p3.count).toBe(125);
    expect(p3.countMeaning).toBe(CountMeaning.EXACT);
  });

  it('A PAGE MAY CROSS THE BOUNDARY: 37 known + 13 null in one page', async () => {
    const all = population(37, 30);
    const p1 = await assemblePhased(all, 1, 50);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows.filter((r) => r.sortValue !== null)).toHaveLength(37);
    expect(p1.rows.filter((r) => r.sortValue === null)).toHaveLength(13);

    const p2 = await assemblePhased(all, 2, 50);
    expect(p2.rows).toHaveLength(17);
    expect(p2.more).toBe(MoreResults.NO);

    const seen = [...p1.rows, ...p2.rows].map((r) => r.ListingKey);
    expect(new Set(seen).size).toBe(67);
    expect(seen).toEqual(all.map((r) => r.ListingKey));
  });

  it('an all-NULL universe still pages', async () => {
    // The KNOWN bucket is empty, so the transition must happen immediately
    // rather than concluding the universe is empty.
    const all = population(0, 12);
    const res = await assemblePhased(all, 1, 50);
    expect(res.rows).toHaveLength(12);
    expect(res.more).toBe(MoreResults.NO);
  });

  it('an all-KNOWN universe does not invent a null page', async () => {
    const all = population(20, 0);
    const res = await assemblePhased(all, 1, 50);
    expect(res.rows).toHaveLength(20);
    expect(res.more).toBe(MoreResults.NO);
    expect(res.count).toBe(20);
  });

  it('an exact count traverses BOTH buckets', async () => {
    const all = population(100, 25);
    const res = await assembleFinalUniverse<PhasedRow>({
      fetchPage: phasedProvider(all),
      identity: (r) => r.ListingKey,
      gate: () => ({ displayable: true }),
      providerRowKey: (r) => r.ListingKey,
      page: 1,
      pageSize: 10,
      providerBudget: 10_000,
      phases,
      exactCount: true,
    });
    expect(res.count).toBe(125);
    expect(res.countMeaning).toBe(CountMeaning.EXACT);
  });
});
