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
      expect(out).toMatchObject({ resolved: true, authority: "cotality" });
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
      authority: "cotality",
    });
    expect(resolve("provider_lineage", "mallan_office_representation")).toMatchObject({
      resolved: true,
      authority: "cotality",
    });
  });

  it("provider identifiers stay provider facts even on a Mallan listing", () => {
    // A genuine Cotality ListingKey attached to a Mallan canonical listing is
    // still Cotality's fact — `fixed` must ignore listing kind entirely.
    for (const kind of ["mallan_local", "mallan_office_representation", "provider_third_party"] as const) {
      expect(resolve("listing_key", kind)).toMatchObject({ resolved: true, authority: "cotality" });
    }
  });

  it("Mallan-derived facts stay Mallan-derived on third-party listings", () => {
    // Geocoding a provider address does not make Cotality the author of the
    // coordinate.
    for (const kind of ["mallan_local", "provider_third_party"] as const) {
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
    expect(localProviderFact).toMatchObject({ authority: "cotality" });
    const localDerived = resolve("building_identity", "mallan_local");
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

/**
 * SOURCE-PERMISSION — the representation may supply provider evidence, nothing else.
 *
 * The hole this closes: the representation was checked only inside
 * `by_listing_authority`, so `mallan_derived` resolved BEFORE the check ever ran.
 * A suppressed row could therefore still produce `geo`, `building_identity`,
 * `total_monthly_cost` and `comp_set` — re-entering Map, Building Search, CMA and
 * Reports through the side door while its authorable fields were blocked.
 */
describe("a suppressed representation supplies provider evidence and nothing else", () => {
  const REFUSED = [
    ["list_price", "authorable listing fact"],
    ["address", "authorable listing fact"],
    ["building_identity", "Mallan-derived — would re-enter Building Search"],
    ["total_monthly_cost", "Mallan-derived analytic"],
    ["comp_set", "Mallan-derived — would re-enter CMA"],
    ["achieved_rent", "unresolved field contract"],
    ["mallan_exclusive", "Mallan CRM state"],
    // CORRECTED 2026-08-21: this used to sit in ALLOWED. Letting a suppressed
    // representation supply the canonical REFERENCE is exactly how a provider row
    // stands in for the Mallan listing. The provider's own ListingId is available
    // as `provider_listing_id`, which IS evidence.
    ["listing_id_canonical", "Mallan canonical reference — resolve the local twin first"],
    ["listing_object_identity", "Mallan canonical object identity"],
    ["acris_sale_history", "ACRIS fact reaching through another source"],
  ] as const;

  it.each(REFUSED)("%s is refused (%s)", (key) => {
    const out = resolve(key, "mallan_office_representation");
    expect(out.resolved).toBe(false);
    if (!out.resolved) expect(out.reason).toBe("NON_CANONICAL_SOURCE");
  });

  const ALLOWED = ["listing_key", "provider_listing_id", "provider_lineage", "mls_status", "permission"] as const;

  it.each(ALLOWED)("%s DOES resolve as provider evidence", (key) => {
    const out = resolve(key, "mallan_office_representation");
    expect(out).toMatchObject({ resolved: true, authority: "cotality" });
  });

  it("the same Mallan-derived facts resolve normally on a LOCAL listing", () => {
    // Proving the refusal is about the SOURCE, not the field: geo and building
    // identity are perfectly resolvable once the canonical local listing is the
    // one being asked about.
    for (const key of ["building_identity"]) {
      expect(resolve(key, "mallan_local")).toMatchObject({ resolved: true, authority: "mallan_derived" });
      expect(resolve(key, "provider_third_party")).toMatchObject({ resolved: true, authority: "mallan_derived" });
    }
  });

  it("refusal is never mistaken for a missing field contract", () => {
    // Two different failures: NON_CANONICAL_SOURCE means the contract is fine and
    // the source is not permitted. Collapsing them would hide a real integrity
    // defect behind "we never mapped that field".
    const sourceRefusal = resolve("building_identity", "mallan_office_representation");
    const contractGap = resolve("building_identity", "mallan_local");
    expect(sourceRefusal.resolved).toBe(false);
    if (!sourceRefusal.resolved) expect(sourceRefusal.reason).toBe("NON_CANONICAL_SOURCE");
    expect(contractGap.resolved).toBe(true);
  });
});
