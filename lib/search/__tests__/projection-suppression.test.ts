/**
 * PROJECTION-BOUNDARY SUPPRESSION.
 *
 * `buildSearchDisplayWhere` (the Listing path) applies
 * `excludeMallanRlsReturnCopies()`. `buildProjectionSearchWhere` did NOT — and it
 * feeds `criteriaToProjectionWhere` -> `runProjectionListingSearch` -> Saved
 * Search count -> Saved Search execute -> the search-alerts cron.
 *
 * So a Mallan-office Cotality representation could surface as its own listing on
 * every one of those, including being EMAILED to a client by alert replay.
 *
 * The correction reuses the ONE canonical authority through the projection's
 * existing `listing` relation — the same traversal already used to enforce
 * `owner_opt_out`, which is not on the projection either. No office constant is
 * duplicated into the projection model; a second copy of that rule is how the two
 * paths would drift apart again.
 */
import { buildProjectionSearchWhere } from "@/lib/search/listing-access-decision";
import { criteriaToProjectionWhere } from "@/lib/search/criteria-to-prisma";

const listingRelation = (w: Record<string, unknown>) =>
  (w.listing ?? {}) as Record<string, unknown>;

describe("the projection gate suppresses Mallan-office representations", () => {
  it("reaches the canonical authority through the listing relation", () => {
    const where = buildProjectionSearchWhere() as Record<string, unknown>;
    const rel = listingRelation(where);
    // The relation must carry the suppression predicate, not just owner_opt_out.
    expect(rel).toHaveProperty("owner_opt_out", false);
    expect(JSON.stringify(rel)).toContain("list_office_mls_id");
  });

  it("does NOT duplicate the office constant into the projection model", () => {
    const where = buildProjectionSearchWhere() as Record<string, unknown>;
    // The office id may appear ONLY inside the listing relation, never as a
    // projection-side copy of the rule.
    const { listing, ...projectionSide } = where;
    void listing;
    expect(JSON.stringify(projectionSide)).not.toContain("7041");
    expect(JSON.stringify(projectionSide)).not.toContain("list_office_mls_id");
  });

  it("admits Mallan LOCAL listings — suppression must not hide our own inventory", () => {
    // The failure that would be worse than the defect: excluding by office and
    // thereby dropping the canonical local listing too.
    const rel = JSON.stringify(listingRelation(buildProjectionSearchWhere() as Record<string, unknown>));
    expect(rel).toContain("SL-");
    expect(rel).toContain("RL-");
    expect(rel).toContain("rls_eligible");
  });

  it("keeps normal treatment for rows of unknown provenance", () => {
    // Fail-closed on SUPPRESSION, not on display: a row with no office id keeps
    // ordinary treatment rather than vanishing.
    const rel = JSON.stringify(listingRelation(buildProjectionSearchWhere() as Record<string, unknown>));
    expect(rel).toContain("null");
  });

  it("applies to the criteria path too, so count and findMany share it", () => {
    // `runProjectionListingSearch` passes ONE predicate to both findMany and
    // count. Suppression therefore lands before pagination — page-local
    // filtering would leave totals describing the unsuppressed population.
    const where = criteriaToProjectionWhere({ type: "sale" }) as Record<string, unknown>;
    expect(JSON.stringify(where)).toContain("list_office_mls_id");
  });

  it("survives alongside user criteria", () => {
    const where = criteriaToProjectionWhere({
      type: "rent",
      minPrice: 3000,
      amenities: ["elevator"],
    }) as Record<string, unknown>;
    const s = JSON.stringify(where);
    expect(s).toContain("list_office_mls_id");
    expect(s).toContain("amenity_keys");
  });
});
