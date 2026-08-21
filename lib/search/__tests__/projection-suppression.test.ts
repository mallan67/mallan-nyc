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

  it("STRUCTURAL ONLY: the local-admitting arms are present in the relation", () => {
    // Anti-regression, NOT behavioural proof. An earlier version of this test
    // asserted these strings and was described as proving "local Mallan listings
    // are admitted". It proves no such thing — see the source-class tests below,
    // which show website-only local inventory is in fact EXCLUDED by the
    // top-level gate.
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

/**
 * SOURCE-CLASS BEHAVIOUR — what the gate actually admits, evaluated per row.
 *
 * The previous test asserted that the serialized `where` CONTAINED "SL-" and
 * concluded "local Mallan listings are admitted". That is a string assertion, not
 * row behaviour, and the conclusion was wrong for part of the corpus.
 *
 * These evaluate the real predicate against concrete rows.
 */
describe("source-class eligibility under the projection gate", () => {
  type Row = {
    rls_eligible: boolean;
    idx_display_yn: boolean;
    internet_entire_listing_display_yn: boolean;
    participant_only_yn: boolean;
    listing: { owner_opt_out: boolean; listing_id: string; list_office_mls_id: string | null; rls_eligible: boolean };
  };

  /** Evaluate the generated projection `where` against one row. */
  const admits = (row: Row): boolean => {
    const w = buildProjectionSearchWhere() as Record<string, unknown>;
    for (const [k, v] of Object.entries(w)) {
      if (k === "listing" || k === "mls_status") continue;
      if ((row as unknown as Record<string, unknown>)[k] !== v) return false;
    }
    const rel = (w.listing ?? {}) as Record<string, unknown>;
    if (rel.owner_opt_out !== undefined && row.listing.owner_opt_out !== rel.owner_opt_out) return false;
    const or = rel.OR as Array<Record<string, unknown>> | undefined;
    if (!or) return true;
    return or.some((arm) => {
      if ("rls_eligible" in arm) return row.listing.rls_eligible === arm.rls_eligible;
      if ("list_office_mls_id" in arm) {
        const spec = arm.list_office_mls_id as unknown;
        if (spec === null) return row.listing.list_office_mls_id === null;
        if (typeof spec === "object" && spec && "notIn" in (spec as Record<string, unknown>)) {
          const notIn = (spec as { notIn: string[] }).notIn;
          return row.listing.list_office_mls_id !== null && !notIn.includes(row.listing.list_office_mls_id);
        }
      }
      if ("listing_id" in arm) {
        const spec = arm.listing_id as { startsWith?: string };
        return spec.startsWith ? row.listing.listing_id.startsWith(spec.startsWith) : false;
      }
      return false;
    });
  };

  const row = (o: Partial<Row["listing"]> & Partial<Row>): Row => ({
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    participant_only_yn: false,
    ...(o as Partial<Row>),
    listing: {
      owner_opt_out: false,
      listing_id: "RLS123",
      list_office_mls_id: "9999",
      rls_eligible: true,
      ...(o as Partial<Row["listing"]>),
    },
  });

  it("third-party Cotality inventory is ADMITTED", () => {
    expect(admits(row({ listing_id: "RLS777", list_office_mls_id: "9999" }))).toBe(true);
  });

  it("a Mallan-office representation is EXCLUDED", () => {
    expect(admits(row({ listing_id: "RLS20099289", list_office_mls_id: "7041" }))).toBe(false);
  });

  it("an RLS-eligible Mallan local SL- listing is ADMITTED", () => {
    expect(admits(row({ listing_id: "SL-0004", list_office_mls_id: "7041" }))).toBe(true);
  });

  it("a WEBSITE-ONLY Mallan local listing is EXCLUDED by the top-level gate", () => {
    // THE CORRECTION. rls_eligible=false fails the projection's own
    // `rls_eligible: true` before the relation is ever consulted. The gate was
    // shaped for alert replay and public redistribution, and it structurally
    // excludes Mallan's own website-only canonical inventory.
    //
    // Recorded as a cutover gap, NOT patched here: authenticated Search needs a
    // source-class/audience policy, and client-alert eligibility must not define
    // what the broker can search.
    expect(admits(row({ rls_eligible: false, listing_id: "SL-0009", list_office_mls_id: null }))).toBe(false);
  });

  it("unknown provenance keeps normal treatment", () => {
    expect(admits(row({ listing_id: "RLS555", list_office_mls_id: null }))).toBe(true);
  });

  it("owner opt-out is still enforced through the same relation", () => {
    expect(admits(row({ owner_opt_out: true, listing_id: "RLS888" }))).toBe(false);
  });
});
