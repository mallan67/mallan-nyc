/**
 * CROSS-READER CONTRACT — a criterion the UI emits must be honoured by whichever
 * engine executes it, or explicitly refused. It may never be silently dropped.
 *
 * TRACE: UI serializer -> Trestle OData builder -> route post-filter.
 *
 * `useListings` serializes `propertySubTypes`, and the Search UI offers
 * STRUCTURAL values (Loft, Duplex, Triplex, Townhouse, Multi-Family,
 * Single Family) alongside OWNERSHIP values (Condo, Co-op, Condop).
 *
 * At 438b9993 the Trestle builder emitted clauses only for ownership labels
 * (via `CommonInterest`) and New Development (via `NewConstructionYN`). It
 * emitted NOTHING for structural values. The route then declared
 * "sub-types are pushed to the provider" and did no route-side filtering
 * (`const subTypeFiltered = amenityFiltered;`).
 *
 * Net effect: a user asking for Lofts on the fallback path received unfiltered
 * inventory — the worst failure mode, because the request looks honoured.
 *
 * Live-verified: `PropertySubType eq 'Loft'` is SUPPORTED and returns 83 Active,
 * and multi-value ORs are SUPPORTED — so there is no provider reason to drop it.
 */
import { buildPublicListingTrestleFilter } from "@/lib/search/public-listing-trestle";
import { PROPERTY_SUB_TYPES } from "@/lib/search/types";

/** UI label -> the live PropertySubType member it must reach. */
const STRUCTURAL: Array<[string, string]> = [
  ["Loft", "Loft"],
  ["Duplex", "Duplex"],
  ["Triplex", "Triplex"],
  ["Townhouse", "Townhouse"],
  ["Multi-Family", "MultiFamily"],
  ["Single Family", "SingleFamilyResidence"],
];

describe("structural propertySubTypes reach the provider, never silently dropped", () => {
  it.each(STRUCTURAL)("UI '%s' emits PropertySubType '%s'", (label, member) => {
    const filter = buildPublicListingTrestleFilter(new URLSearchParams(`propertySubTypes=${encodeURIComponent(label)}`));
    expect(filter).toContain(`PropertySubType eq '${member}'`);
  });

  it("does NOT emit a label that is not a live member", () => {
    // Mallan labels differ from provider members — `Single Family` is not a
    // member, `SingleFamilyResidence` is. Emitting the label would be HTTP 400.
    const filter = buildPublicListingTrestleFilter(new URLSearchParams("propertySubTypes=Single Family"));
    expect(filter).not.toContain("'Single Family'");
  });

  it("combines structural and ownership values in one OR group", () => {
    // Condo is CommonInterest; Loft is PropertySubType. Both must survive.
    const filter = buildPublicListingTrestleFilter(new URLSearchParams("propertySubTypes=Condo,Loft"));
    expect(filter).toContain("CommonInterest eq 'Condominium'");
    expect(filter).toContain("PropertySubType eq 'Loft'");
  });

  it("every UI sub-type label resolves to SOME provider clause", () => {
    // The completeness gate: no offered control may vanish between layers.
    for (const label of PROPERTY_SUB_TYPES) {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams(`propertySubTypes=${encodeURIComponent(label)}`));
      const emitsSomething =
        filter.includes("PropertySubType eq") ||
        filter.includes("CommonInterest eq") ||
        filter.includes("NewConstructionYN eq");
      expect({ label, emitsSomething }).toEqual({ label, emitsSomething: true });
    }
  });
});
