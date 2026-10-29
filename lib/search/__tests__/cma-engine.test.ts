/**
 * CMA engine on live Cotality — pure parts: the comparable built from a mapped listing, the
 * automatic search parameters (which go through the Agent Search mapping layer) and the valuation.
 */
import { compFromListing, compSearchParams, estimateValue, type CmaInput } from "@/lib/cma/engine";
import { buildCrmIdxQuery } from "@/lib/search/crm-idx-filter";
import { inventoryFromPairs } from "@/lib/idx/geography";

const subject: CmaInput = { property_address: "333 E 46TH STREET", unit: "2G", listing_type: "sale", property_type: "StockCooperative",
  neighborhood: "Turtle Bay", bedrooms: 1, bathrooms: 1, living_area: 700, floor: 2, months: 6 };

describe("compFromListing", () => {
  it("uses the close price of a closed listing and adjusts to the subject", () => {
    const comp = compFromListing(subject, { wid: "123", lid: "RLS1", address: "333 E 46TH STREET", unit: "5C", neighborhood: "Turtle Bay", borough: "Manhattan",
      status: "CLOSED", price: 800000, closePrice: 750000, closedDate: "2026-08-01T00:00:00Z", beds: 2, baths: 1, intSqft: 900, floor: 5, dom: 40 });
    expect(comp.list_price).toBe(750000);
    expect(comp.close_price).toBe(750000);
    expect(comp.close_date).toBe("2026-08-01");
    expect(comp.price_per_sqft).toBe(833);
    // one bedroom more than the subject (−5%), 200 sqft more (−4%), three floors higher (−3%)
    expect(comp.adjustments.map((a) => a.field)).toEqual(["bedrooms", "living_area", "floor"]);
    expect(comp.adjusted_price).toBe(Math.round(750000 - 37500 - 30000 - 22500));
    expect(comp.similarity_score).toBe(50 + 10 + 10); // same baths, closed; beds differ; size 28% off
    expect(comp.days_on_market).toBe(40);
  });
  it("uses the list price for an on-market listing and nulls what Cotality did not give", () => {
    const comp = compFromListing(subject, { wid: "9", lid: "RLS9", status: "ACTIVE", price: 700000, closePrice: null, beds: 1, baths: 1, intSqft: null, floor: "" });
    expect(comp.list_price).toBe(700000);
    expect(comp.close_price).toBeNull();
    expect(comp.living_area).toBeNull();
    expect(comp.price_per_sqft).toBeNull();
    expect(comp.floor).toBeNull();
    expect(comp.adjustments).toEqual([]);
    expect(comp.similarity_score).toBe(75);
  });
});

describe("compSearchParams through the Agent Search mapping layer", () => {
  const geo = inventoryFromPairs([{ borough: "Manhattan", name: "Turtle Bay", sale: 10 }, { borough: "Manhattan", name: "TURTLE BAY", sale: 1 }]);
  it("searches closed listings of the subject's side, neighborhood (every live spelling), ownership and bedrooms ±1 within the window", () => {
    const q = buildCrmIdxQuery(compSearchParams(subject, true), geo);
    expect(q.refused).toEqual([]);
    expect(q.filter).toContain("PropertyType eq 'Residential'");
    expect(q.filter).toContain("StandardStatus eq 'Closed'");
    expect(q.filter).toContain("(SubdivisionName eq 'Turtle Bay' or SubdivisionName eq 'TURTLE BAY')");
    expect(q.filter).toContain("CommonInterest eq 'StockCooperative'");
    expect(q.filter).toContain("BedroomsTotal ge 0");
    expect(q.filter).toContain("BedroomsTotal le 2");
    expect(q.filter).toMatch(/CloseDate ge \d{4}-\d{2}-\d{2}/);
  });
  it("refuses an ownership value Cotality does not carry so the engine can retry without it", () => {
    const q = buildCrmIdxQuery(compSearchParams({ ...subject, property_type: "Condo" }, true), geo);
    expect(q.refused.map((r) => r.field)).toEqual(["CommonInterest"]);
    expect(buildCrmIdxQuery(compSearchParams({ ...subject, property_type: "Condo" }, false), geo).refused).toEqual([]);
  });
  it("includes on-market listings only when asked, and rentals search the lease side", () => {
    const p = compSearchParams({ ...subject, listing_type: "rental", include_active: true }, false);
    expect(p.get("type")).toBe("rental");
    expect(p.get("status")).toBe("Closed,Active,Pending");
  });
});

describe("estimateValue", () => {
  it("weights adjusted prices by similarity with a ±5% range", () => {
    const comps = [
      { adjusted_price: 1_000_000, similarity_score: 100 },
      { adjusted_price: 500_000, similarity_score: 50 },
    ] as unknown as Parameters<typeof estimateValue>[0];
    const v = estimateValue(comps);
    expect(v.estimated).toBe(833333);
    expect(v.low).toBe(791667);
    expect(v.high).toBe(875000);
    expect(estimateValue([])).toEqual({ estimated: 0, low: 0, high: 0 });
  });
});
