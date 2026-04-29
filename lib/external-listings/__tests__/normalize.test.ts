import {
  normalizeExternalListingInput,
  normalizeExternalListingUrl,
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
});
