/**
 * OPEN HOUSE MEMBERSHIP IS SETTLED BEFORE COUNT AND BEFORE THE PAGE CUT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THESE TESTS EXIST FOR
 *
 * The authenticated broker Search never implemented Open House at all. The UI
 * disabled Today / This Weekend / Next 7 / Next 30 / Custom with the message
 * "Open House date range not supported by the search backend", and that message
 * was literally true: `app/api/idx/search/route.ts` and `crm-idx-filter.ts`
 * contained no OpenHouse code.
 *
 * The provider does support it. Probed live 2026-09-01 against api.cotality.com:
 * the OpenHouse resource answers `$count` (1993 rows), accepts
 * `OpenHouseDate ge X and OpenHouseDate le Y` (1970), accepts that plus
 * `OpenHouseStatus eq 'Active'`, and honours `$orderby OpenHouseDate asc`.
 * `OpenHouse.ListingKey` resolves to `Property.ListingKey` (count 1) and NOT to
 * `Property.ListingId` (count 0).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY "BEFORE" IS THE WHOLE TEST
 *
 * The tempting implementation intersects the CURRENT PAGE with the open-house
 * set. That answers a different question — "does page 1 happen to contain an
 * open house" — and it produces three lies at once: a count describing the
 * unfiltered universe, pages that shrink unpredictably, and open-house listings
 * that exist but can never be reached because they sit on page 4.
 *
 * So membership is a CORPUS filter: it decides who is in the universe, and the
 * count and the page are both computed from what survives it.
 */
import { assembleFinalUniverse, CountMeaning } from '../final-universe';

type Row = { ListingKey: string };

const row = (k: string): Row => ({ ListingKey: k });

/** Twelve listings; the even-numbered ones have an open house. */
const ALL = Array.from({ length: 12 }, (_, i) => row(`K${i + 1}`));
const WITH_OPEN_HOUSE = new Set(ALL.filter((_, i) => i % 2 === 1).map((r) => r.ListingKey));

function base(overrides: Record<string, unknown> = {}) {
  return {
    fetchPage: async (skip: number, top: number) => ({
      records: ALL.slice(skip, skip + top),
      providerMatched: ALL.length,
      exhausted: skip + top >= ALL.length,
    }),
    identity: (r: Row) => r.ListingKey,
    gate: () => ({ displayable: true }) as const,
    providerRowKey: (r: Row) => r.ListingKey,
    page: 1,
    pageSize: 3,
    providerBudget: 500,
    exactCount: true,
    ...overrides,
  };
}

describe('open-house membership is a corpus filter, not a page filter', () => {
  it('the COUNT describes the open-house-filtered universe, not the whole one', async () => {
    const u = await assembleFinalUniverse<Row>(
      base({ corpusFilter: (r: Row) => WITH_OPEN_HOUSE.has(r.ListingKey) }) as never,
    );
    // 6 of 12 have an open house. A count of 12 would be the unfiltered
    // universe wearing the filter's name.
    expect(u.count).toBe(6);
    expect(u.countMeaning).toBe(CountMeaning.EXACT);
  });

  it('a listing that belongs in the universe but sits past page 1 is still reachable', async () => {
    // K12 is the LAST open-house listing. Under the page-intersect bug it can
    // never be shown: it is not on provider page 1, and the filter only ever
    // looked at the page it was handed.
    const u = await assembleFinalUniverse<Row>(
      base({ page: 2, corpusFilter: (r: Row) => WITH_OPEN_HOUSE.has(r.ListingKey) }) as never,
    );
    const keys = u.rows.map((r) => r.ListingKey);
    expect(keys).toEqual(['K8', 'K10', 'K12']);
  });

  it('every page holds a FULL page of open houses — no silent shrinking', async () => {
    for (const [page, expected] of [
      [1, ['K2', 'K4', 'K6']],
      [2, ['K8', 'K10', 'K12']],
    ] as const) {
      const u = await assembleFinalUniverse<Row>(
        base({ page, corpusFilter: (r: Row) => WITH_OPEN_HOUSE.has(r.ListingKey) }) as never,
      );
      // Page-intersect would return 1-2 rows here: it cuts a 3-row page from the
      // raw sequence and THEN removes the non-members.
      expect(u.rows.map((r) => r.ListingKey)).toEqual([...expected]);
    }
  });

  it('no page repeats a listing the previous page already showed', async () => {
    const seen: string[] = [];
    for (const page of [1, 2]) {
      const u = await assembleFinalUniverse<Row>(
        base({ page, corpusFilter: (r: Row) => WITH_OPEN_HOUSE.has(r.ListingKey) }) as never,
      );
      seen.push(...u.rows.map((r) => r.ListingKey));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('several open houses on ONE listing produce ONE result row', async () => {
    // The membership set is keyed by ListingKey, so a listing holding a Saturday
    // AND a Sunday open house is one listing. Joining rows instead of testing
    // membership would duplicate the property.
    const many = new Set(['K2', 'K2', 'K4']);
    const u = await assembleFinalUniverse<Row>(
      base({ corpusFilter: (r: Row) => many.has(r.ListingKey) }) as never,
    );
    expect(u.rows.map((r) => r.ListingKey)).toEqual(['K2', 'K4']);
    expect(u.count).toBe(2);
  });

  it('WITHOUT a corpusFilter the universe is unchanged — the hook is opt-in', async () => {
    const u = await assembleFinalUniverse<Row>(base() as never);
    expect(u.count).toBe(12);
    expect(u.rows.map((r) => r.ListingKey)).toEqual(['K1', 'K2', 'K3']);
  });

  it('an excluded row is not miscounted as a gate exclusion', async () => {
    // Attribution matters: "removed because it has no open house" and "blocked
    // by a distribution gate" are different facts, and a compliance review reads
    // the second one as a display-permission problem.
    const u = await assembleFinalUniverse<Row>(
      base({ corpusFilter: (r: Row) => WITH_OPEN_HOUSE.has(r.ListingKey) }) as never,
    );
    expect(Object.keys(u.exclusions.gated ?? {})).toEqual([]);
  });
});
