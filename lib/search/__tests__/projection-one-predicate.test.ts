/**
 * ONE PREDICATE for findMany AND count — proven by execution, not by reading source.
 *
 * If the two diverged, suppression could remove rows from the page while `total`
 * still described the unsuppressed population — the same class of defect as
 * filtering after pagination, and invisible to any source-string assertion.
 *
 * `runProjectionListingSearch` takes its db handle as a parameter, so this needs
 * no module mocking: a recording double is passed straight in.
 */
import { runProjectionListingSearch } from "@/lib/search/core";

function recordingDb() {
  const calls: { findMany: unknown[]; count: unknown[] } = { findMany: [], count: [] };
  const db = {
    listingSearchProjection: {
      findMany: async (args: unknown) => {
        calls.findMany.push(args);
        return [];
      },
      count: async (args: unknown) => {
        calls.count.push(args);
        return 0;
      },
    },
  };
  return { db, calls };
}

describe("findMany and count share exactly one canonical predicate", () => {
  it("passes an EQUAL where to both", async () => {
    const { db, calls } = recordingDb();
    await runProjectionListingSearch(db as never, { type: "sale", minPrice: 500000 }, { limit: 20, offset: 0 });

    expect(calls.findMany).toHaveLength(1);
    expect(calls.count).toHaveLength(1);

    const findWhere = (calls.findMany[0] as { where: unknown }).where;
    const countWhere = (calls.count[0] as { where: unknown }).where;
    expect(countWhere).toEqual(findWhere);
  });

  it("that shared predicate carries the suppression authority", async () => {
    const { db, calls } = recordingDb();
    await runProjectionListingSearch(db as never, { type: "rent" }, { limit: 10, offset: 0 });

    for (const args of [calls.findMany[0], calls.count[0]]) {
      expect(JSON.stringify((args as { where: unknown }).where)).toContain("list_office_mls_id");
    }
  });

  it("suppression is IN the predicate, not applied after skip/take", async () => {
    const { db, calls } = recordingDb();
    await runProjectionListingSearch(db as never, { type: "sale" }, { limit: 25, offset: 50 });

    const find = calls.findMany[0] as Record<string, unknown>;
    const cnt = calls.count[0] as Record<string, unknown>;

    // Pagination sits ALONGSIDE the predicate on findMany...
    expect(find.skip).toBe(50);
    expect(find.take).toBe(25);
    expect(JSON.stringify(find.where)).toContain("list_office_mls_id");
    // ...and count carries the predicate with NO pagination, so `total`
    // describes the suppressed universe rather than a page of it.
    expect(cnt.skip).toBeUndefined();
    expect(cnt.take).toBeUndefined();
    expect(JSON.stringify(cnt.where)).toContain("list_office_mls_id");
  });

  it("user criteria and suppression coexist in the same predicate", async () => {
    const { db, calls } = recordingDb();
    await runProjectionListingSearch(db as never, { type: "rent", amenities: ["elevator"] }, { limit: 5 });
    const s = JSON.stringify((calls.findMany[0] as { where: unknown }).where);
    expect(s).toContain("list_office_mls_id");
    expect(s).toContain("amenity_keys");
  });
});
