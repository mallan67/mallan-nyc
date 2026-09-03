/// <reference types="jest" />
/**
 * THREE IDENTITIES, NOT ONE.
 *
 * `listing_id_canonical` was declared `fixed` / `cotality` while its own note
 * said the stored value may be a Cotality `ListingId` OR a Mallan `SL-`/`RL-`
 * identifier. A Mallan-generated identifier cannot be Cotality-authored, so the
 * entry asserted something false on half its own domain.
 *
 * PROVEN FROM THE SCHEMA (`prisma/schema.prisma`, model `Listing`):
 *
 *   id          BigInt @id @default(autoincrement())   <- canonical OBJECT identity,
 *                                                         Mallan-generated, no provider
 *                                                         involvement whatsoever
 *   listing_id  String @unique                         <- canonical REFERENCE, DUAL-DOMAIN
 *
 * So the contract needs three separated concepts:
 *
 *   listing_object_identity  Mallan canonical object identity      (fixed, mallan_crm)
 *   listing_id_canonical     Mallan canonical reference, dual-domain (by_listing_authority)
 *   provider_listing_id      Cotality ListingId as provider evidence (fixed, cotality)
 *   listing_key              Cotality ListingKey, incl. the media join (fixed, cotality)
 */
import { FIELD_REGISTRY } from "../canonical/field-registry";
import { resolveFactualAuthority } from "../canonical/resolve-factual-authority";

const spec = (key: string) => FIELD_REGISTRY.find((f) => f.canonicalKey === key)!;
const resolve = (key: string, kind: string) =>
  resolveFactualAuthority(spec(key), kind as never);

describe("the canonical OBJECT identity is Mallan's, with no provider input", () => {
  it("exists and is Mallan-authored on every listing", () => {
    const e = spec("listing_object_identity");
    expect(e).toBeDefined();
    expect(e.authorityResolution).toBe("fixed");
    expect(e.sourceAuthority).toBe("mallan_crm");
  });

  it("maps to Listing.id and names no Cotality field", () => {
    expect(spec("listing_object_identity").dbColumn).toBe("id");
    expect(spec("listing_object_identity").cotalityField).toBeNull();
  });

  it("is NEVER supplied by a suppressed Cotality representation", () => {
    const out = resolve("listing_object_identity", "mallan_office_representation");
    expect(out.resolved).toBe(false);
  });
});

describe("the canonical REFERENCE is dual-domain, so authority follows the listing", () => {
  it("is by_listing_authority, not fixed to the provider", () => {
    expect(spec("listing_id_canonical").authorityResolution).toBe("by_listing_authority");
  });

  it("carries no static sourceAuthority — no single value could be truthful", () => {
    expect(spec("listing_id_canonical").sourceAuthority).toBeUndefined();
  });

  it("a Mallan-authored SL-/RL- listing gets MALLAN authority, never Cotality", () => {
    const out = resolve("listing_id_canonical", "mallan_local");
    expect(out).toMatchObject({ resolved: true, authority: "mallan_crm" });
  });

  it("third-party inventory gets Cotality authority for the same field", () => {
    expect(resolve("listing_id_canonical", "provider_third_party")).toMatchObject({
      resolved: true,
      authority: "cotality",
    });
  });

  it("a suppressed Cotality representation may NOT supply the canonical reference", () => {
    // This is the identity-integrity rule: resolve the local twin first. A
    // suppressed representation supplying the canonical reference would let the
    // provider row stand in for the Mallan listing.
    const out = resolve("listing_id_canonical", "mallan_office_representation");
    expect(out.resolved).toBe(false);
    if (!out.resolved) expect(out.reason).toBe("NON_CANONICAL_SOURCE");
  });
});

describe("the provider's ListingId is separate, and IS provider evidence", () => {
  it("exists as its own criterion pointing at Cotality ListingId", () => {
    const e = spec("provider_listing_id");
    expect(e).toBeDefined();
    expect(e.cotalityField).toBe("ListingId");
  });

  it("is fixed Cotality authority on every listing kind", () => {
    expect(spec("provider_listing_id").authorityResolution).toBe("fixed");
    expect(spec("provider_listing_id").sourceAuthority).toBe("cotality");
  });

  it("MAY be supplied by a suppressed representation — that is what evidence means", () => {
    expect(resolve("provider_listing_id", "mallan_office_representation")).toMatchObject({
      resolved: true,
      authority: "cotality",
    });
  });

  it("is never presented as the Mallan canonical reference", () => {
    expect(spec("provider_listing_id").canonicalKey).not.toBe(spec("listing_id_canonical").canonicalKey);
    expect(spec("provider_listing_id").dbColumn).not.toBe("listing_id");
  });
});
