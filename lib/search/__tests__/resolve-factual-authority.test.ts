/**
 * NEGATIVE PROOFS for instance-level factual authority.
 *
 * These are the six cases that must hold no matter how the registry grows. Each
 * is a way authorship could be laundered from one party to another.
 */
import {
  resolveFactualAuthority,
  type ListingAuthorityKind,
} from "@/lib/search/canonical/resolve-factual-authority";
import { FIELD_REGISTRY } from "@/lib/search/canonical/field-registry";

const spec = (key: string) => FIELD_REGISTRY.find((f) => f.canonicalKey === key)!;
const resolve = (key: string, kind: ListingAuthorityKind) => resolveFactualAuthority(spec(key), kind);

describe("factual authority resolves per listing, not per field", () => {
  it("a third-party listing resolves authorable facts to Cotality", () => {
    for (const key of ["list_price", "address", "bedrooms", "ownership"]) {
      const out = resolve(key, "provider_third_party");
      expect(out).toMatchObject({ resolved: true, authority: "cotality_rebny" });
    }
  });

  it("a local Mallan listing resolves those SAME facts to Mallan", () => {
    // The exact case a static per-field authority got wrong.
    for (const key of ["list_price", "address", "bedrooms", "ownership"]) {
      const out = resolve(key, "mallan_local");
      expect(out).toMatchObject({ resolved: true, authority: "mallan_crm" });
    }
  });

  it("a suppressed representation can NEVER supply an authorable canonical fact", () => {
    // STRONGER than "never transfers authority to Cotality". An earlier version
    // resolved these to `mallan_crm` — which correctly refused to credit the
    // provider, and then let the SUPPRESSED row become the SOURCE of the value.
    // A consumer could read the representation's ListPrice, receive
    // `authority: mallan_crm`, and proceed as though it held a valid canonical
    // fact — defeating suppression precisely where the local record is missing.
    //
    // Authorship and permission to act as a canonical value source are
    // different things.
    for (const key of ["list_price", "address", "bedrooms", "ownership"]) {
      const out = resolve(key, "mallan_office_representation");
      expect(out.resolved).toBe(false);
      if (!out.resolved) expect(out.reason).toBe("NON_CANONICAL_SOURCE");
    }
  });

  it("refusal is NOT the provider claiming authorship", () => {
    // The refusal must not be mistaken for "Cotality authored it".
    const out = resolve("list_price", "mallan_office_representation");
    expect(out.resolved).toBe(false);
    if (!out.resolved) {
      expect(out.reason).not.toBe("UNRESOLVED_FIELD_CONTRACT");
      expect(out.because).toMatch(/local twin/i);
    }
  });

  it("the canonical value comes from the LOCAL row, resolved as mallan_local", () => {
    // The required path: representation -> twin resolution -> read the LOCAL
    // row -> resolve THAT as mallan_local. Twin resolution stays in the existing
    // machinery; this resolver does not grow a second reconciliation system.
    for (const key of ["list_price", "address", "bedrooms", "ownership"]) {
      expect(resolve(key, "mallan_local")).toMatchObject({ resolved: true, authority: "mallan_crm" });
    }
  });

  it("provider evidence on the SAME representation still resolves normally", () => {
    // Suppression removes its right to supply Mallan canonical values. It does
    // not erase the provider's own facts, which are retained for reconciliation.
    expect(resolve("listing_key", "mallan_office_representation")).toMatchObject({
      resolved: true,
      authority: "cotality_rebny",
    });
    expect(resolve("provider_lineage", "mallan_office_representation")).toMatchObject({
      resolved: true,
      authority: "cotality_rebny",
    });
  });

  it("provider identifiers stay provider facts even on a Mallan listing", () => {
    // A genuine Cotality ListingKey attached to a Mallan canonical listing is
    // still Cotality's fact — `fixed` must ignore listing kind entirely.
    for (const kind of ["mallan_local", "mallan_office_representation", "provider_third_party"] as const) {
      expect(resolve("listing_key", kind)).toMatchObject({ resolved: true, authority: "cotality_rebny" });
    }
  });

  it("Mallan-derived facts stay Mallan-derived on third-party listings", () => {
    // Geocoding a provider address does not make Cotality the author of the
    // coordinate.
    for (const kind of ["mallan_local", "provider_third_party"] as const) {
      expect(resolve("geo", kind)).toMatchObject({ resolved: true, authority: "mallan_derived" });
      expect(resolve("building_identity", kind)).toMatchObject({ resolved: true, authority: "mallan_derived" });
    }
  });

  it("unresolved facts CANNOT acquire authority by fallback", () => {
    // The failure mode that produced achieved_rent = mallan_derived before
    // anyone looked at LeaseAmount or TotalActualRent.
    for (const key of ["achieved_rent", "assessment", "price_per_sqft", "owner_opt_out"]) {
      // On a representation the refusal is NON_CANONICAL_SOURCE and takes
      // precedence; on the other kinds it is the missing field contract.
      for (const kind of ["mallan_local", "provider_third_party"] as const) {
        const out = resolve(key, kind);
        expect(out.resolved).toBe(false);
        if (!out.resolved) expect(out.reason).toBe("UNRESOLVED_FIELD_CONTRACT");
      }
    }
  });

  it("local-ness does not make every fact Mallan-authored", () => {
    // The guard against by_listing_authority degrading into
    // "row is local => everything is mallan_crm".
    const localProviderFact = resolve("listing_key", "mallan_local");
    expect(localProviderFact).toMatchObject({ authority: "cotality_rebny" });
    const localDerived = resolve("geo", "mallan_local");
    expect(localDerived).toMatchObject({ authority: "mallan_derived" });
    const localUnresolved = resolve("assessment", "mallan_local");
    expect(localUnresolved.resolved).toBe(false);
  });

  it("every resolution states WHY, so provenance is auditable", () => {
    for (const kind of ["mallan_local", "mallan_office_representation", "provider_third_party"] as const) {
      const out = resolve("list_price", kind);
      expect(out.because.length).toBeGreaterThan(10);
    }
  });
});
