/// <reference types="jest" />
/**
 * Homepage Featured — Mallan exclusives must headline regardless of the generic
 * curation filters, WITHOUT letting third-party studios in.
 *
 * `buildExclusiveFeaturedParams` derives the exclusives fetch from the base
 * (general) params: it strips the generic bed/price/geo narrowing so a Mallan
 * 0-bed studio (e.g. 400 E 90th #4D / SL-0007) surfaces, but it must NOT mutate
 * the base, so the GENERAL feed still applies minBeds=1 and third-party studios
 * stay excluded. Mallan-only safety of the resulting feed is enforced separately
 * by `/api/listings?exclusive=mallan` (SL-/RL-/website-only identity), covered in
 * lib/search/__tests__/public-listing-db.test.ts.
 */
import { buildExclusiveFeaturedParams } from "@/lib/featured/featured-ordering";

function baseParams(): URLSearchParams {
  return new URLSearchParams({
    type: "sale",
    excludeUndisclosed: "true",
    sort: "newest",
    statuses: "Active,ActiveUnderContract",
    minPrice: "500000",
    maxPrice: "0",
    beds: "1",
    borough: "Manhattan",
    neighborhood: "Upper East Side",
  });
}

describe("buildExclusiveFeaturedParams", () => {
  it("strips the generic bed/price/geo filters so a Mallan 0-bed studio surfaces", () => {
    const ex = buildExclusiveFeaturedParams(baseParams());
    expect(ex.get("beds")).toBeNull();
    expect(ex.get("minPrice")).toBeNull();
    expect(ex.get("maxPrice")).toBeNull();
    expect(ex.get("borough")).toBeNull();
    expect(ex.get("neighborhood")).toBeNull();
  });

  it("preserves type/status/sort and targets the Mallan exclusives feed", () => {
    const ex = buildExclusiveFeaturedParams(baseParams());
    expect(ex.get("type")).toBe("sale");
    expect(ex.get("statuses")).toBe("Active,ActiveUnderContract");
    expect(ex.get("sort")).toBe("newest");
    expect(ex.get("excludeUndisclosed")).toBe("true");
    expect(ex.get("exclusive")).toBe("mallan");
    expect(ex.get("limit")).toBe("12");
  });

  it("does NOT mutate the base params — the general feed keeps minBeds=1 so third-party studios stay excluded", () => {
    const base = baseParams();
    buildExclusiveFeaturedParams(base);
    expect(base.get("beds")).toBe("1");
    expect(base.get("minPrice")).toBe("500000");
    expect(base.get("borough")).toBe("Manhattan");
  });
});
