import { UNSUPPORTED_AMENITIES } from "@/lib/search/types";
import {
  applyPublicListingPostFilters,
  buildPublicListingDbSearch,
} from "@/lib/search/public-listing-db";

describe("buildPublicListingDbSearch", () => {
  it("applies the shared fail-closed RLS gate while preserving website-only path", () => {
    const { where, orderBy } = buildPublicListingDbSearch(new URLSearchParams("type=sale"));

    expect(where).toMatchObject({
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon"] },
      listing_type: "sale",
      OR: [
        {
          rls_eligible: true,
          idx_display_yn: true,
          owner_opt_out: false,
          participant_only: false,
          internet_entire_listing_display_yn: true,
        },
        { rls_eligible: false },
      ],
    });
    expect(orderBy).toEqual({ list_price: "desc" });
  });

  it("translates public filter params into DB filters", () => {
    const { where, orderBy } = buildPublicListingDbSearch(new URLSearchParams({
      minPrice: "1000000",
      maxPrice: "2000000",
      beds: "2",
      maxBeds: "4",
      minBaths: "1.5",
      maxBaths: "3",
      minSqft: "900",
      maxSqft: "1800",
      borough: "Manhattan",
      zipCodes: "10021,10022",
      statuses: "Active,Closed,ComingSoon",
      propertySubTypes: "Co-op,New Development",
      sort: "newest",
    }));

    expect(where.list_price).toEqual({ gte: 1000000, lte: 2000000 });
    expect(where.bedrooms_total).toEqual({ gte: 2, lte: 4 });
    // Baths are a NORMALISED total (full + half/2), not a flat `bathrooms_full`
    // range — see minBathsCondition/maxBathsCondition. The old flat predicate
    // rejected a 2-full/0-half unit for minBaths=1.5 and admitted a 1.5-bath
    // unit for maxBaths=1.
    expect(JSON.stringify(where)).toContain("bathrooms_full");
    expect(where.living_area).toEqual({ gte: 900, lte: 1800 });
    expect(where.borough).toEqual({ contains: "Manhattan", mode: "insensitive" });
    expect(where.postal_code).toEqual({ in: ["10021", "10022"] });
    expect(where.status).toEqual({ in: ["Active", "ComingSoon"] });
    // `Co-op` routes to the OWNERSHIP filter (CommonInterest), and
    // "New Development" is the provider boolean NewConstructionYN — neither is
    // a live `PropertySubType` member, so neither may reach this predicate.
    // `Condo`/`SingleFamilyTownhouse`/`NewConstruction` are rejected by the
    // provider with HTTP 400.
    expect(where.property_sub_type).toBeUndefined();
    expect(orderBy).toEqual({ listing_contract_date: "desc" });
  });

  it("pushes address search into JSON conditions so pagination remains DB-backed", () => {
    const { where } = buildPublicListingDbSearch(new URLSearchParams("address=400 East 90th Street"));

    // PR #106 (audit-fix A · Fix 2) wrapped each address segment in an
    // OR-of-{PascalCase, camelCase} for defensive dual-key support. The
    // production DB stores PascalCase (21,983/21,983 rows verified); the
    // camelCase branch is inert today but prevents the audit's claimed
    // failure mode if a future writer ever skews shape. The assertion
    // checks both branches survive in each OR member.
    expect(where.AND).toEqual(expect.arrayContaining([
      {
        OR: expect.arrayContaining([
          { address: { path: ["StreetNumber"], equals: "400" } },
          { address: { path: ["streetNumber"], equals: "400" } },
        ]),
      },
      {
        OR: expect.arrayContaining([
          { address: { path: ["StreetName"], string_contains: "90" } },
          { address: { path: ["streetName"], string_contains: "90" } },
        ]),
      },
    ]));
  });

  it("applies special public sorts with their required filters", () => {
    const exclusives = buildPublicListingDbSearch(new URLSearchParams("sort=exclusives"));
    expect(exclusives.where.agent_id).toEqual({ not: null });
    expect(exclusives.orderBy).toEqual({ modification_timestamp: "desc" });

    // New development is `NewConstructionYN` (a live filterable BOOLEAN, true on
    // 950 live Active listings). The previous `property_sub_type IN
    // ("NewConstruction","New Construction")` matched NOTHING — neither string
    // is a member of the live PropertySubType enum.
    const newDev = buildPublicListingDbSearch(new URLSearchParams("sort=new-development"));
    expect(newDev.where.property_sub_type).toBeUndefined();
    expect(JSON.stringify(newDev.where)).toContain("NewConstructionYN");
    expect(newDev.orderBy).toEqual({ modification_timestamp: "desc" });
  });

  it("restricts exclusive=mallan to TRUE Mallan exclusives (SL-/RL- or website-only), never agent_id", () => {
    // Requirement: the homepage exclusives feed must be provably Mallan-only.
    // syncAgentHistory stamps agent_id onto THIRD-PARTY (buyer-side) Trestle rows
    // (lib/idx/fetch.ts:427 matches BuyerAgentMlsId), so agent_id != null is unsafe.
    const { where } = buildPublicListingDbSearch(
      new URLSearchParams("type=sale&exclusive=mallan"),
    );

    // Identity is an AND-ed OR over the robust CRM/website-only signal.
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { listing_id: { startsWith: "SL-" } },
            { listing_id: { startsWith: "RL-" } },
            { rls_eligible: false },
          ],
        },
      ]),
    );
    // It must NOT fall back to agent_id (which can be set on third-party IDX rows).
    expect(where.agent_id).toBeUndefined();
  });

  it("keeps the general-feed minBeds floor (third-party studios excluded)", () => {
    // The general Featured feed passes beds=1 (minBeds); a 0-bed third-party
    // studio is filtered out at the DB by bedrooms_total >= 1.
    const { where } = buildPublicListingDbSearch(
      new URLSearchParams("type=sale&beds=1"),
    );
    expect(where.bedrooms_total).toEqual({ gte: 1 });
  });
});

/**
 * SEARCH P0 — corpus-level filtering contract.
 *
 * Encodes the 2026-08-19 incident so it cannot recur. Every number below was
 * measured against PRODUCTION and verified against the LIVE Cotality API in
 * the same session; none of it is inferred.
 *
 *   BEFORE  `ownershipTypes`, `yearBuilt`, `furnished`, `keywords` and
 *           `amenities` ran AFTER pagination, so they filtered the fetched
 *           page rather than the corpus, and `total` reported the UNFILTERED
 *           count. Production returned, for `yearBuilt=pre-war`:
 *             limit=10 -> 2 items · limit=50 -> 16 · limit=200 -> 100,
 *           every one of them labelled "8,159 found". True corpus count: 3,460.
 *
 *   AFTER   the same predicates are Prisma `where` clauses, so Postgres
 *           evaluates them over every row and `count()` shares the predicate.
 *           Verified equivalent to hand-written SQL inside one transaction
 *           snapshot, 8/8 exact.
 */
describe("corpus-level filters live in the WHERE, never in a post-filter", () => {
  const whereFor = (qs: string) => JSON.stringify(buildPublicListingDbSearch(new URLSearchParams(qs)).where);

  it("filters the CORPUS, so the predicate reaches the database", () => {
    // The regression this guards: a predicate that is absent from `where` is
    // necessarily applied after pagination, which is what broke `total`.
    expect(whereFor("yearBuilt=pre-war")).toContain("YearBuilt");
    expect(whereFor("furnished=true")).toContain("Furnished");
    expect(whereFor("keywords=penthouse")).toContain("PublicRemarks");
    expect(whereFor("ownershipTypes=condo")).toContain("CommonInterest");
    expect(whereFor("amenities=elevator")).toContain("BuildingFeatures");
  });

  it("post-filtering is an identity pass — nothing may narrow the page", () => {
    const listings = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const params = new URLSearchParams("yearBuilt=pre-war&ownershipTypes=condo&keywords=penthouse");
    expect(applyPublicListingPostFilters(listings, new Map(), params)).toHaveLength(3);
  });

  it("accepts ownership casing the UI actually sends", () => {
    // `condo` (lowercase) previously fell through the exact-case map and
    // returned ZERO results with no error. Live: Condominium 3,795.
    for (const variant of ["condo", "Condo", "CONDO", "condominium"]) {
      expect(whereFor(`ownershipTypes=${variant}`)).toContain("Condominium");
    }
    for (const variant of ["Co-op", "co-op", "COOP", "co op"]) {
      expect(whereFor(`ownershipTypes=${variant}`)).toContain("StockCooperative");
    }
  });

  it("distinguishes Condop from Condo — a real fifth live value (146 rows)", () => {
    const condop = whereFor("ownershipTypes=condop");
    expect(condop).toContain("Condop");
    expect(condop).not.toContain("Condominium");
  });

  it("fails CLOSED when an ownership value cannot be mapped", () => {
    // Returning the whole corpus for an unrecognised filter is the dangerous
    // direction: the user asked to narrow and got everything.
    expect(whereFor("ownershipTypes=nonsense")).toContain('"in":[]');
  });

  it("matches pets by exact TOKEN, never by substring", () => {
    // "BuildingYes,No" = the building permits pets, the UNIT does not.
    // A substring test on "Yes" matches it anyway and inflated the live result
    // from 4,304 to 6,861 — 2,557 listings a renter with a dog cannot rent.
    const w = whereFor("amenities=pet-friendly");
    expect(w).toContain('"string_starts_with":"Yes,"');
    expect(w).toContain('"string_contains":",Yes,"');
    expect(w).toContain('"string_ends_with":",Yes"');
    expect(w).toContain('"equals":"Yes"');
  });

  it("matches a boolean amenity field as a boolean", () => {
    // `FireplaceYN` is a JSON boolean (861 true live). The previous mapping
    // ran a substring test against `InteriorFeatures`, which has no fireplace
    // token in its 45-token live vocabulary — so it matched 0 rows corpus-wide.
    const w = whereFor("amenities=fireplace");
    expect(w).toContain("FireplaceYN");
    expect(w).toContain('"equals":true');
  });

  it("finds in-unit laundry, which lives in LaundryFeatures not Appliances", () => {
    // `LaundryFeatures.InUnit` is 4,119 live rows and was previously unqueried.
    const w = whereFor("amenities=washer-dryer");
    expect(w).toContain("LaundryFeatures");
    expect(w).toContain("InUnit");
  });

  it("searches keywords case-insensitively — remarks are free prose", () => {
    expect(whereFor("keywords=PENTHOUSE")).toContain('"mode":"insensitive"');
  });

  it("ANDs multiple keywords rather than widening", () => {
    const w = whereFor("keywords=penthouse,terrace");
    expect(w).toContain("penthouse");
    expect(w).toContain("terrace");
  });

  it("never silently applies an amenity with no live provider data", () => {
    // These are rejected with 400 at the route. Should one reach the builder,
    // it must not widen the result set by being ignored.
    for (const key of ["no-fee", "renovated", "natural-light", "quiet"]) {
      expect(UNSUPPORTED_AMENITIES.has(key)).toBe(true);
    }
  });
});

/**
 * BATHROOM TOTALS — behavioural proof, not shape assertions.
 *
 * A tiny evaluator runs the generated predicate against concrete (full, half)
 * rows so each case is positive/negative/boundary-proven. The defects being
 * guarded, both reported against the live contract on 2026-08-19:
 *
 *   minBaths=1.5 previously required `full>=1 AND half>=1`, so a 2-full/0-half
 *   apartment — unambiguously more than 1.5 baths — was EXCLUDED.
 *
 *   maxBaths=1 previously compared only `full<=1`, so a 1-full/1-half unit
 *   (1.5 baths) PASSED a "maximum 1 bath" filter.
 */
describe("bathroom totals are normalised (full + half/2)", () => {
  type Row = { bathrooms_full: number; bathrooms_half: number | null };

  const matches = (node: any, row: Row): boolean => {
    if (!node || typeof node !== "object") return true;
    if (Array.isArray(node.OR)) return node.OR.some((n: any) => matches(n, row));
    if (Array.isArray(node.AND)) return node.AND.every((n: any) => matches(n, row));
    if (node.id?.in?.length === 0) return false;
    for (const key of ["bathrooms_full", "bathrooms_half"] as const) {
      if (!(key in node)) continue;
      const spec = node[key];
      const actual = row[key];
      if (spec === null) { if (actual !== null) return false; continue; }
      if (typeof spec === "number") { if (actual !== spec) return false; continue; }
      if (typeof spec === "object") {
        if (spec.gte !== undefined && !(actual !== null && actual >= spec.gte)) return false;
        if (spec.lte !== undefined && !(actual !== null && actual <= spec.lte)) return false;
      }
    }
    return true;
  };

  const admits = (qs: string, row: Row): boolean => {
    const { where } = buildPublicListingDbSearch(new URLSearchParams(qs));
    const clauses = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    // Only the bath clauses mention these columns; other gates are unrelated.
    const bathClauses = clauses.filter((c) => JSON.stringify(c).includes("bathrooms_"));
    expect(bathClauses.length).toBeGreaterThan(0);
    return bathClauses.every((c) => matches(c, row));
  };

  const r = (full: number, half: number | null = 0): Row => ({ bathrooms_full: full, bathrooms_half: half });

  it("minBaths=1.5 admits two full baths — the exact regression", () => {
    expect(admits("minBaths=1.5", r(2, 0))).toBe(true);
    expect(admits("minBaths=1.5", r(2, null))).toBe(true);
  });

  it("minBaths=1.5 boundary: 1full+1half qualifies, 1full+0half does not", () => {
    expect(admits("minBaths=1.5", r(1, 1))).toBe(true);
    expect(admits("minBaths=1.5", r(1, 0))).toBe(false);
    expect(admits("minBaths=1.5", r(1, null))).toBe(false);
  });

  it("maxBaths=1 EXCLUDES a 1.5-bath listing", () => {
    expect(admits("maxBaths=1", r(1, 0))).toBe(true);
    expect(admits("maxBaths=1", r(1, null))).toBe(true);
    expect(admits("maxBaths=1", r(1, 1))).toBe(false);
    expect(admits("maxBaths=1", r(2, 0))).toBe(false);
  });

  it("treats a NULL half-bath count as zero, not as unknown-so-admit", () => {
    expect(admits("maxBaths=1.5", r(1, null))).toBe(true);
    expect(admits("minBaths=2", r(1, null))).toBe(false);
  });

  it("integer minimums behave exactly", () => {
    expect(admits("minBaths=2", r(2, 0))).toBe(true);
    expect(admits("minBaths=2", r(1, 2))).toBe(true);  // 1 + 2*0.5 = 2
    expect(admits("minBaths=2", r(1, 1))).toBe(false); // 1.5 < 2
  });

  it("a min/max range admits only the closed interval", () => {
    expect(admits("minBaths=1.5&maxBaths=2", r(1, 1))).toBe(true);
    expect(admits("minBaths=1.5&maxBaths=2", r(2, 0))).toBe(true);
    expect(admits("minBaths=1.5&maxBaths=2", r(1, 0))).toBe(false);
    expect(admits("minBaths=1.5&maxBaths=2", r(3, 0))).toBe(false);
  });
});
