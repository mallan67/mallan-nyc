/**
 * PROVIDER ROWS AND MALLAN-AUTHORED ROWS ARE ONE UNIVERSE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS PREVENTS
 *
 * Authenticated Search reads Cotality and nothing else. The obvious way to make
 * a Mallan-authored open house appear is to fetch local rows when `openHouse`
 * is set and append them to the results. That would be wrong in a way that is
 * worse than the gap it closes:
 *
 *   normal search      -> the Mallan listing is absent
 *   open-house search  -> the same listing suddenly exists
 *
 * A listing that blinks into existence when a filter is applied is a second
 * truth about what Mallan sells. And appending after the page is cut recreates
 * exactly the defect Open House was just fixed for: the count describes one
 * universe, the page shows another.
 *
 * So local rows enter the SAME universe as provider rows — merged in canonical
 * sort order, before the count and before the page cut. Open House is then one
 * corpus constraint over that universe, not a source of its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ORDERING PROBLEM, STATED
 *
 * The canonical tie-break is `ListingKey asc` — and a Mallan-authored listing
 * has no ListingKey. A mixed sort therefore needs a tie-break both sources can
 * answer. The comparator below falls back to (source rank, canonical identity),
 * which is deterministic and, critically, REDUCES TO THE EXISTING ORDER when
 * every row is a provider row.
 */
import { assembleFinalUniverse, CountMeaning } from '../final-universe';

type Row = { key: string; price: number; local?: boolean };

const provider = (key: string, price: number): Row => ({ key, price });
const local = (key: string, price: number): Row => ({ key, price, local: true });

/** Price descending, then local-after-provider, then identity — deterministic. */
const byPriceDesc = (a: Row, b: Row): number =>
  b.price - a.price
  || Number(Boolean(a.local)) - Number(Boolean(b.local))
  || a.key.localeCompare(b.key);

/** Eight provider listings, 800k down to 100k. */
const PROVIDER = [
  provider('K1', 800_000), provider('K2', 700_000), provider('K3', 600_000),
  provider('K4', 500_000), provider('K5', 400_000), provider('K6', 300_000),
  provider('K7', 200_000), provider('K8', 100_000),
];

function base(overrides: Record<string, unknown> = {}) {
  return {
    fetchPage: async (skip: number, top: number) => ({
      records: PROVIDER.slice(skip, skip + top),
      providerMatched: PROVIDER.length,
      exhausted: skip + top >= PROVIDER.length,
    }),
    identity: (r: Row) => r.key,
    gate: () => ({ displayable: true }) as const,
    providerRowKey: (r: Row) => r.key,
    page: 1,
    pageSize: 3,
    providerBudget: 500,
    exactCount: true,
    ...overrides,
  };
}

const merge = (rows: Row[]) => ({ mergeRows: { rows, compare: byPriceDesc } });

describe('local rows join the universe in sort position, not at the end', () => {
  it('a Mallan listing priced between two provider listings lands BETWEEN them', () => {
    const u = assembleFinalUniverse<Row>(
      base({ ...merge([local('SL-0007', 650_000)]) }) as never,
    );
    return u.then((r) => {
      // Appending would have put SL-0007 last. Sort position is the whole point.
      expect(r.rows.map((x) => x.key)).toEqual(['K1', 'K2', 'SL-0007']);
    });
  });

  it('the COUNT describes the merged universe, not the provider half', async () => {
    const u = await assembleFinalUniverse<Row>(
      base({ ...merge([local('SL-0007', 650_000), local('RL-0002', 250_000)]) }) as never,
    );
    expect(u.count).toBe(10); // 8 provider + 2 local
    expect(u.countMeaning).toBe(CountMeaning.EXACT);
  });

  it('page 2 continues the MERGED sequence with no gap and no repeat', async () => {
    const rows: string[] = [];
    for (const page of [1, 2, 3, 4]) {
      const u = await assembleFinalUniverse<Row>(
        base({ page, ...merge([local('SL-0007', 650_000), local('RL-0002', 250_000)]) }) as never,
      );
      rows.push(...u.rows.map((x) => x.key));
    }
    expect(rows).toEqual([
      'K1', 'K2', 'SL-0007',   // 800, 700, 650
      'K3', 'K4', 'K5',        // 600, 500, 400
      'K6', 'RL-0002', 'K7',   // 300, 250, 200
      'K8',                    // 100
    ]);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('a local row that sorts LAST is still reachable on the final page', async () => {
    const u = await assembleFinalUniverse<Row>(
      base({ page: 3, ...merge([local('SL-0009', 50_000)]) }) as never,
    );
    expect(u.rows.map((x) => x.key)).toEqual(['K7', 'K8', 'SL-0009']);
  });

  it('a local row that sorts FIRST takes page 1 position 1', async () => {
    const u = await assembleFinalUniverse<Row>(
      base({ ...merge([local('SL-0001', 999_000)]) }) as never,
    );
    expect(u.rows[0].key).toBe('SL-0001');
  });
});

describe('the merge is inert when there is nothing to merge', () => {
  it('an EMPTY local set leaves the provider universe byte-identical', async () => {
    const withEmpty = await assembleFinalUniverse<Row>(base({ ...merge([]) }) as never);
    const without = await assembleFinalUniverse<Row>(base() as never);
    expect(withEmpty.rows.map((r) => r.key)).toEqual(without.rows.map((r) => r.key));
    expect(withEmpty.count).toBe(without.count);
  });

  it('NO mergeRows option at all behaves exactly as before', async () => {
    const u = await assembleFinalUniverse<Row>(base() as never);
    expect(u.count).toBe(8);
    expect(u.rows.map((r) => r.key)).toEqual(['K1', 'K2', 'K3']);
  });
});

describe('one property is one row, whichever authority describes it', () => {
  it('a local row is dropped when a provider row for the same listing survives', async () => {
    // A Mallan listing whose Cotality return-copy was NOT suppressed would
    // otherwise appear twice — once from each authority. The merge takes the
    // canonical Mallan row and drops the provider twin, because the Mallan
    // record is the editable canonical one.
    const u = await assembleFinalUniverse<Row>(
      base({
        mergeRows: {
          rows: [local('SL-0007', 650_000)],
          compare: byPriceDesc,
          // The provider row K3 is this Mallan listing's return-copy.
          supersedesProviderRow: (localRow: Row, provRow: Row) =>
            localRow.key === 'SL-0007' && provRow.key === 'K3',
        },
      }) as never,
    );
    const keys = u.rows.map((r) => r.key);
    expect(keys).toContain('SL-0007');
    expect(keys).not.toContain('K3');
    expect(u.count).toBe(8); // 8 provider - 1 superseded + 1 local
  });
});

describe('a mixed universe refuses to pretend a provider cursor covers it', () => {
  it('resuming a mixed-source traversal is REFUSED, not silently wrong', async () => {
    // The continuation token is a provider keyset over ListingKey. Local rows
    // have no ListingKey and cannot be positioned in it, so a resumed mixed
    // search would silently skip or repeat them. Refusing is honest; carrying
    // on is not.
    await expect(assembleFinalUniverse<Row>(
      base({
        ...merge([local('SL-0007', 650_000)]),
        resume: { survivorsConsumed: 3, tail: ['K3'] },
      }) as never,
    )).rejects.toThrow(/mixed|continuation|resume/i);
  });
});
