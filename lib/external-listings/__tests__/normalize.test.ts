import {
  normalizeExternalListingInput,
  normalizeExternalListingFamilyVisible,
  normalizeExternalListingUrl,
  serializeExternalListingComment,
  validateExternalListingInput,
} from "@/lib/external-listings/normalize";

describe("external listing normalization", () => {
  it("normalizes http URLs without treating them as IDX listings", () => {
    const url = normalizeExternalListingUrl("HTTPS://WWW.StreetEasy.com/building/unit#photos");

    expect(url).toEqual({
      url: "HTTPS://WWW.StreetEasy.com/building/unit#photos",
      normalized_url: "https://www.streeteasy.com/building/unit",
      source_host: "streeteasy.com",
    });
  });

  it("requires a valid http(s) URL or an address", () => {
    const input = normalizeExternalListingInput({ url: "javascript:alert(1)" });

    expect(input.normalized_url).toBeNull();
    expect(validateExternalListingInput(input)).toBe("Provide either a valid http(s) listing URL or an address.");
  });

  it("accepts address-only submissions", () => {
    const input = normalizeExternalListingInput({
      address: "123 Main St, Apt 4B",
      action_bucket: "liked",
      status: "reviewing",
    });

    expect(validateExternalListingInput(input)).toBeNull();
    expect(input).toMatchObject({
      address: "123 Main St, Apt 4B",
      action_bucket: "liked",
      status: "reviewing",
    });
  });

  it("defaults unsafe bucket/status values", () => {
    const input = normalizeExternalListingInput({
      address: "123 Main St",
      action_bucket: "delete",
      status: "published",
    });

    expect(input.action_bucket).toBe("saved");
    expect(input.status).toBe("submitted");
  });

  it("normalizes family visibility values fail-closed by default", () => {
    expect(normalizeExternalListingFamilyVisible(true)).toBe(true);
    expect(normalizeExternalListingFamilyVisible("shared")).toBe(true);
    expect(normalizeExternalListingFamilyVisible("private")).toBe(false);
    expect(normalizeExternalListingFamilyVisible("maybe")).toBeNull();
    expect(normalizeExternalListingInput({ address: "123 Main St" }).family_visible).toBe(false);
  });

  it("labels external-listing comment authors by buyer and family context", () => {
    const base = {
      id: BigInt(1),
      external_listing_id: BigInt(2),
      agent_id: null,
      body: "What do you think?",
      request_type: "comment",
      created_at: new Date("2026-04-29T08:00:00.000Z"),
    };

    expect(serializeExternalListingComment({
      ...base,
      lead_id: BigInt(10),
      lead: { id: BigInt(10), first_name: "Buyer", last_name: "One", email: "buyer@example.com" },
      agent: null,
    }, { ownerLeadId: BigInt(10) }).author?.type).toBe("buyer");

    expect(serializeExternalListingComment({
      ...base,
      lead_id: BigInt(11),
      lead: { id: BigInt(11), first_name: "Family", last_name: "One", email: "family@example.com" },
      agent: null,
    }, { ownerLeadId: BigInt(10) }).author?.type).toBe("family");
  });
});
