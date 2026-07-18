/**
 * N2 — projectionRowUnchanged comparator (write suppression for the
 * listing_search_projection dual-write in lib/idx/sync.ts).
 *
 * Contract: the projection upsert is skipped iff EVERY column
 * buildProjectionUpsertPayload would write is already equal on the existing
 * row — strings/booleans/numbers/bigint strict null-safe, modified_at by
 * epoch (never Date identity), amenity_keys/feature_flags by deep equality
 * on normalized JSON. PROJECTION_COMPARE_SELECT must stay in lock-step with
 * the payload field list.
 */

import {
  buildListingSearchProjectionFromListing,
  buildProjectionUpsertPayload,
  projectionRowUnchanged,
  PROJECTION_COMPARE_SELECT,
  type ListingSearchProjectionCompareSnapshot,
  type ListingSearchProjectionRow,
} from "../listing-search-projection";

function fixtureProjection(): ListingSearchProjectionRow {
  return buildListingSearchProjectionFromListing({
    listing_id: "RLS-N2-P1",
    status: "Active",
    listing_type: "rent",
    property_type: "Residential Lease",
    property_sub_type: "Apartment",
    list_price: "4500",
    bedrooms_total: 1,
    bathrooms_full: 1,
    bathrooms_half: 0,
    living_area: 650,
    borough: "Manhattan",
    neighborhood: "Yorkville",
    city: "New York",
    postal_code: "10128",
    rls_eligible: true,
    commercial_sub_type: null,
    idx_display_yn: true,
    internet_entire_listing_display_yn: null,
    internet_address_display_yn: null,
    participant_only: false,
    agent_id: null,
    modification_timestamp: new Date("2026-07-01T12:00:00Z"),
    address: { StreetNumber: "400", StreetName: "East 90th Street", City: "New York", Latitude: 40.779, Longitude: -73.947 },
    features: { PublicRemarks: "Sunny one-bed with elevator and laundry.", PetsAllowed: "CatsOK", Furnished: "Unfurnished" },
    media: [{ MediaCategory: "Photo", MediaURL: "https://cdn.example.com/1.jpg" }],
  });
}

/** DB snapshot exactly matching `row` (jsonb round-trip, fresh Date instances). */
function snapshotOf(row: ListingSearchProjectionRow): ListingSearchProjectionCompareSnapshot {
  const { listing_id: _lid, ...rest } = row;
  return {
    ...rest,
    amenity_keys: rest.amenity_keys === null ? null : JSON.parse(JSON.stringify(rest.amenity_keys)),
    feature_flags: rest.feature_flags === null ? null : JSON.parse(JSON.stringify(rest.feature_flags)),
    modified_at: rest.modified_at === null ? null : new Date(rest.modified_at.getTime()),
  } as ListingSearchProjectionCompareSnapshot;
}

describe("projectionRowUnchanged", () => {
  it("identical snapshot (distinct Date/JSON instances) ⇒ unchanged", () => {
    const row = fixtureProjection();
    expect(projectionRowUnchanged(snapshotOf(row), row)).toBe(true);
  });

  it("JSON key order does not matter (jsonb does not preserve key order)", () => {
    const row = fixtureProjection();
    const snap = snapshotOf(row);
    const flags = snap.feature_flags as Record<string, boolean>;
    const reversed: Record<string, boolean> = {};
    for (const k of Object.keys(flags).reverse()) reversed[k] = flags[k];
    snap.feature_flags = reversed;
    expect(projectionRowUnchanged(snap, row)).toBe(true);
  });

  it.each<[string, (s: ListingSearchProjectionCompareSnapshot) => void]>([
    ["mls_status", (s) => { s.mls_status = "Pending"; }],
    ["listing_type", (s) => { s.listing_type = "sale"; }],
    ["borough", (s) => { s.borough = "Brooklyn"; }],
    ["neighborhood", (s) => { s.neighborhood = "Carnegie Hill"; }],
    ["list_price (bigint)", (s) => { s.list_price = 4600n; }],
    ["bedrooms", (s) => { s.bedrooms = 2; }],
    ["bathrooms", (s) => { s.bathrooms = 1.5; }],
    ["latitude", (s) => { s.latitude = 40.0; }],
    ["is_exclusive", (s) => { s.is_exclusive = true; }],
    ["is_rental", (s) => { s.is_rental = false; }],
    ["rls_eligible", (s) => { s.rls_eligible = false; }],
    ["idx_display_yn (gate)", (s) => { s.idx_display_yn = false; }],
    ["internet_entire_listing_display_yn (gate, null↔true)", (s) => { s.internet_entire_listing_display_yn = true; }],
    ["internet_address_display_yn (gate, null↔false)", (s) => { s.internet_address_display_yn = false; }],
    ["participant_only_yn (gate)", (s) => { s.participant_only_yn = true; }],
    ["searchable_text", (s) => { s.searchable_text = "different text"; }],
    ["amenity_keys (array member)", (s) => { s.amenity_keys = ["doorman"]; }],
    ["amenity_keys (null vs array)", (s) => { s.amenity_keys = null; }],
    ["feature_flags (value flip)", (s) => {
      s.feature_flags = { ...(s.feature_flags as Record<string, boolean>), is_pet_friendly: false };
    }],
    ["modified_at (epoch difference)", (s) => { s.modified_at = new Date("2026-07-02T12:00:00Z"); }],
    ["modified_at (null vs date)", (s) => { s.modified_at = null; }],
  ])("stale %s ⇒ changed", (_name, mutate) => {
    const row = fixtureProjection();
    const snap = snapshotOf(row);
    mutate(snap);
    expect(projectionRowUnchanged(snap, row)).toBe(false);
  });

  it("modified_at compares by epoch, never Date identity", () => {
    const row = fixtureProjection();
    const snap = snapshotOf(row);
    snap.modified_at = new Date(row.modified_at!.getTime());
    expect(snap.modified_at).not.toBe(row.modified_at);
    expect(projectionRowUnchanged(snap, row)).toBe(true);
  });

  it("PROJECTION_COMPARE_SELECT stays in lock-step with the upsert payload fields", () => {
    const row = fixtureProjection();
    const payload = buildProjectionUpsertPayload(row);
    const payloadFields = Object.keys(payload.update).filter((k) => k !== "listing_id");
    const selectFields = Object.keys(PROJECTION_COMPARE_SELECT);
    expect([...payloadFields].sort()).toEqual([...selectFields].sort());
  });
});
