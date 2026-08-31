/**
 * THE CANONICAL GEOGRAPHY CONTRACT — one meaning, proven against the live feed.
 *
 * Geography was HELD (48978094) because the equivalence between Cotality's
 * several geography facts and the Mallan Borough/Neighborhood concepts was not
 * proven. Holding it was right at the time. Deleting the criteria would have
 * been wrong: borough and neighborhood are the two most-used narrowing controls
 * in NYC brokerage, and "this is hard to map" is not a reason to remove a core
 * capability.
 *
 * LIVE EVIDENCE (probed api.cotality.com 2026-08-26, this session):
 *
 *   CityRegion       Edm.String(150), FILTERABLE (not provider-suppressed).
 *                    Complete vocabulary and population:
 *                      Manhattan     397,769
 *                      Brooklyn      151,392
 *                      Queens         32,927
 *                      Bronx           8,424
 *                      StatenIsland      781
 *                    Sum 591,293 of 591,303 Property rows; the remaining 10
 *                    carry a NULL CityRegion and match neither a positive nor a
 *                    negative filter (OData three-valued logic).
 *
 *   SubdivisionName  Edm.String(150), FILTERABLE. 2,000 sampled active rows were
 *                    100% populated across 178 distinct values, e.g.
 *                    "Murray Hill" 13,432 and "Bedford-Stuyvesant" 6,378.
 *
 *   MLSAreaMajor / MLSAreaMinor  null on every sampled row. Not used.
 *   CountyOrParish   a COUNTY (New York / Kings / Queens / Bronx / Richmond),
 *                    NOT a borough. Never substituted for one.
 *
 * THE SPELLING TRAP THIS EXISTS TO CLOSE
 *
 * The provider spells it `StatenIsland`; every Mallan surface spells it
 * `Staten Island`. Passing the human spelling through gives a syntactically
 * valid filter that matches ZERO rows under HTTP 200 — a whole borough silently
 * missing, with nothing to indicate it. That is the same failure shape as
 * PENDING -> ActiveUnderContract, and it is why this mapping is explicit and
 * tested rather than assumed.
 */
import {
  boroughToCityRegion,
  boroughOData,
  neighborhoodOData,
  UnsupportedGeographyError,
  CITY_REGION_MEMBERS,
} from "@/lib/search/canonical/geography";

describe("borough -> CityRegion", () => {
  it("maps every Mallan borough spelling to the live provider token", () => {
    expect(boroughToCityRegion("Manhattan")).toBe("Manhattan");
    expect(boroughToCityRegion("Brooklyn")).toBe("Brooklyn");
    expect(boroughToCityRegion("Queens")).toBe("Queens");
    expect(boroughToCityRegion("Bronx")).toBe("Bronx");
  });

  it("maps the human 'Staten Island' to the provider's 'StatenIsland'", () => {
    // The whole point. Without this the borough returns 0 rows, silently.
    expect(boroughToCityRegion("Staten Island")).toBe("StatenIsland");
    expect(boroughToCityRegion("StatenIsland")).toBe("StatenIsland");
    expect(boroughToCityRegion("staten island")).toBe("StatenIsland");
  });

  it("tolerates the common 'The Bronx' spelling", () => {
    expect(boroughToCityRegion("The Bronx")).toBe("Bronx");
  });

  it("returns null for anything that is not a live CityRegion member", () => {
    expect(boroughToCityRegion("Hoboken")).toBeNull();
    expect(boroughToCityRegion("")).toBeNull();
    expect(boroughToCityRegion(null)).toBeNull();
  });

  it("exposes exactly the five live members, in provider spelling", () => {
    expect([...CITY_REGION_MEMBERS].sort()).toEqual(
      ["Bronx", "Brooklyn", "Manhattan", "Queens", "StatenIsland"].sort(),
    );
  });
});

describe("borough OData", () => {
  it("renders a single borough as a bare equality", () => {
    expect(boroughOData(["Manhattan"])).toBe("CityRegion eq 'Manhattan'");
  });

  it("renders Staten Island with the provider spelling", () => {
    expect(boroughOData(["Staten Island"])).toBe("CityRegion eq 'StatenIsland'");
  });

  it("renders multiple boroughs as one parenthesised disjunction", () => {
    // The browser previously left criteria.borough UNSET for a multi-borough
    // selection, which emitted no geography param at all and silently answered
    // all of NYC under HTTP 200. A disjunction is the honest answer.
    expect(boroughOData(["Manhattan", "Brooklyn"])).toBe(
      "(CityRegion eq 'Manhattan' or CityRegion eq 'Brooklyn')",
    );
  });

  it("de-duplicates rather than repeating a member", () => {
    expect(boroughOData(["Manhattan", "Manhattan"])).toBe("CityRegion eq 'Manhattan'");
  });

  it("FAILS CLOSED on an unknown borough instead of dropping it", () => {
    // Dropping it would widen the search to every borough while returning 200.
    expect(() => boroughOData(["Hoboken"])).toThrow(UnsupportedGeographyError);
  });

  it("fails the whole request when only one of several boroughs is unknown", () => {
    expect(() => boroughOData(["Manhattan", "Hoboken"])).toThrow(UnsupportedGeographyError);
  });

  it("names the rejected value so the broker can repair the search", () => {
    try {
      boroughOData(["Hoboken"]);
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as Error).message).toContain("Hoboken");
    }
  });
});

describe("neighborhood -> SubdivisionName", () => {
  it("renders a live SubdivisionName value as an exact match", () => {
    expect(neighborhoodOData(["Murray Hill"])).toContain("SubdivisionName eq 'Murray Hill'");
  });

  it("does NOT expand a selection into neighbouring neighbourhoods", () => {
    // REVERSED 2026-08-31 against live Cotality. This previously asserted that
    // `East Village` must also emit `Alphabet City`, on the reasoning that the
    // alias file maps 593 variants onto 72 canonical polygons and a short
    // expansion means a short universe.
    //
    // The premise was wrong. That file maps provider names onto POLYGON SHAPES
    // for map rendering — a grouping, not an identity — and reversing it into
    // Search merged distinct neighbourhoods. Measured live:
    //
    //   Williamsburg       191 rows -> 331, adding Bushwick (109) and
    //                      Ridgewood (16), which is in QUEENS
    //   Downtown Brooklyn   88 -> 431, adding Flatbush, Bay Ridge, Midwood
    //   Prospect Heights    19 -> 149, adding Stuyvesant Heights (67), Bed-Stuy
    //   Bayside              2 ->  92, adding Jamaica (36)
    //
    // A broker selecting Williamsburg was handed Bushwick and Ridgewood under
    // HTTP 200 with nothing to say so. A short universe is a visible problem; a
    // silently WIDE one is answered confidently and wrongly.
    const filter = neighborhoodOData(["East Village"]);
    expect(filter).toContain("SubdivisionName eq 'East Village'");
    expect(filter).not.toContain("Alphabet City");
  });

  it("still groups genuine CASE variants of one name", () => {
    // The part of the old expansion that was real. SoHo, Soho and SOHO are one
    // neighbourhood spelled three ways in the feed (48 + 6 + 1 rows), and losing
    // the last two would be a genuinely short universe. Resolution is
    // case-insensitive against the live vocabulary, so this needs no alias table:
    // every term is a value the provider itself carries.
    const filter = neighborhoodOData(["SoHo"]);
    expect(filter).toContain("SubdivisionName eq 'SoHo'");
    expect(filter).toContain("SubdivisionName eq 'Soho'");
    expect(filter).toContain("SubdivisionName eq 'SOHO'");
    // …and nothing else. Case variants only, never adjacency.
    expect(filter).not.toContain("Hudson Square");
  });

  it("reaches live neighbourhoods the retired alias file never knew", () => {
    // 18 live SubdivisionName values were absent from the alias file entirely,
    // including Yorkville, Hudson Yards, Gramercy Park and Two Bridges.
    for (const name of ["Yorkville", "Hudson Yards", "Gramercy Park", "Two Bridges"]) {
      expect(neighborhoodOData([name])).toContain(`SubdivisionName eq '${name}'`);
    }
  });

  it("REFUSES a name the live feed does not carry, instead of returning an empty set", () => {
    // The failure this closes. `Gramercy`, `Stuyvesant Town` and `Union Square`
    // expanded ENTIRELY to spellings the feed does not carry, so selecting one
    // produced a syntactically valid filter matching zero rows under HTTP 200 —
    // indistinguishable from "no listings match your criteria". Meanwhile
    // `Gramercy Park` sat in the feed with real inventory, unreachable.
    //
    // A criterion that can only ever match zero rows must fail loudly.
    expect(() => neighborhoodOData(["Gramercy"])).toThrow(/Gramercy/);
    expect(() => neighborhoodOData(["Stuyvesant Town"])).toThrow();
    expect(() => neighborhoodOData(["Nonexistent Heights"])).toThrow();
  });

  it("ORs multiple neighborhoods into one clause", () => {
    const filter = neighborhoodOData(["Murray Hill", "Tribeca"]);
    expect(filter).toContain("SubdivisionName eq 'Murray Hill'");
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
    expect(filter).toMatch(/^\(.*\)$/);
  });

  it("escapes a single quote rather than breaking the filter", () => {
    // Hell's Kitchen is a real NYC neighborhood and a real OData injection risk.
    expect(neighborhoodOData(["Hell's Kitchen"])).toContain("Hell''s Kitchen");
  });

  it("de-duplicates variants shared between two selected neighborhoods", () => {
    const filter = neighborhoodOData(["East Village", "East Village"]);
    const occurrences = (filter.match(/SubdivisionName eq 'East Village'/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it("rejects an empty selection rather than emitting an empty group", () => {
    expect(neighborhoodOData([])).toBeNull();
  });
});
