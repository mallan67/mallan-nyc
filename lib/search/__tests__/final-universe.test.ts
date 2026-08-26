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
import {
  assembleFinalUniverse,
  CountMeaning,
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
