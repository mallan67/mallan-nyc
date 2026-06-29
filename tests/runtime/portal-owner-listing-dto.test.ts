/// <reference types="jest" />
/**
 * sanitizeOwnedListingForOwner — an owner must see their OWN listing regardless of the
 * public-dissemination gates (owner_opt_out / participant_only / internet_entire_listing_display_yn).
 * The public portal DTO (sanitizeListingForPortal) fail-closes those to `null`; the owner DTO does
 * not (the owner's own authenticated view is not public dissemination), while still applying the same
 * safe field allow-list. Ownership is enforced by the caller (owner_client_id filter), not here.
 *
 * Uses the REAL dto (no mocks) so the gate behavior is exercised end-to-end.
 */
import { sanitizeListingForPortal, sanitizeOwnedListingForOwner } from "@/lib/compliance/dto";

// A CRM exclusive (SL-) the owner has opted out of public display on, with internet flag null.
const optedOutExclusive = {
  id: 5n,
  listing_id: "SL-0001",
  status: "Active",
  listing_type: "sale",
  property_type: "Condo",
  property_sub_type: null,
  list_price: 1_000_000,
  bedrooms_total: 2,
  bathrooms_full: 2,
  bathrooms_half: null,
  living_area: 1000,
  borough: "Manhattan",
  neighborhood: "Upper East Side",
  address: { streetNumber: "1", streetName: "Main St" },
  features: {},
  media: [],
  agent_info: {},
  list_office_name: "Mallan Real Estate Inc.",
  internet_address_display_yn: true,
  internet_entire_listing_display_yn: null, // CRM exclusive → null → fail-closed for PUBLIC display
  participant_only: true,
  owner_opt_out: true,
} as unknown as Parameters<typeof sanitizeListingForPortal>[0];

describe("owner sees their own listing regardless of public-display gates", () => {
  it("PUBLIC portal DTO DROPS an opted-out / exclusive listing (returns null)", () => {
    expect(sanitizeListingForPortal(optedOutExclusive, "seller")).toBeNull();
  });

  it("OWNER DTO SHOWS the same listing (non-null, with id + status)", () => {
    const out = sanitizeOwnedListingForOwner(optedOutExclusive, "seller");
    expect(out).not.toBeNull();
    expect(out.listing_id).toBe("SL-0001");
    expect(out.status).toBe("Active");
  });

  it("OWNER DTO does not over-expose: credential/internal fields never appear (allow-list)", () => {
    const out = sanitizeOwnedListingForOwner(
      { ...(optedOutExclusive as object), password_hash: "x", portal_token: "y", raw_data: { secret: 1 } } as unknown as Parameters<typeof sanitizeOwnedListingForOwner>[0],
      "seller",
    );
    expect(out.password_hash).toBeUndefined();
    expect(out.portal_token).toBeUndefined();
    expect(out.raw_data).toBeUndefined();
  });
});
