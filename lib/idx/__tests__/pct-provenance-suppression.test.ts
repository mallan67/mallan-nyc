/// <reference types="jest" />
/**
 * Phase 1A — PhotosChangeTimestamp as a raw-data PROVENANCE clock.
 *
 * Cotality bumps Property.PhotosChangeTimestamp without bumping any visible
 * field. Until now PCT was deliberately excluded from
 * RAW_DATA_PROVENANCE_CLOCK_KEYS because the batch-media reconcile loop only
 * processed listings that RETURNED media rows — a listing whose gallery the
 * provider emptied to zero never entered the map, so its stored media was never
 * cleared, and suppressing the PCT-driven invalidation would have hidden that.
 *
 * The legacy writers now implement complete-response reconciliation (an
 * authoritatively empty gallery reconciles to []), so that precondition is met
 * and PCT can be treated as provenance.
 *
 * The critical detail: adding PCT to the clock set alone would fix
 * CLASSIFICATION while leaving the PHYSICAL write in place, because
 * `listingUpdateMateriallyUnchanged` compares raw_data through
 * `rawDataMateriallyEqual` (clocks included). Both call sites must use the
 * provenance-stripped comparison or the Neon write amplification survives.
 */

import {
  RAW_DATA_PROVENANCE_CLOCK_KEYS,
  listingUpdateMateriallyUnchanged,
  changedMaterialListingFields,
  classifyListingChangeReasons,
} from "@/lib/idx/write-suppression";

const MT = new Date("2026-07-01T00:00:00.000Z");
const MT_LATER = new Date("2026-07-02T00:00:00.000Z");

function rawData(over: Record<string, unknown> = {}) {
  return {
    ListingId: "RLS100001",
    StandardStatus: "Active",
    ListPrice: 750000,
    PublicRemarks: "A nice apartment.",
    ModificationTimestamp: "2026-07-01T00:00:00Z",
    PhotosChangeTimestamp: "2026-07-01T00:00:00Z",
    ...over,
  };
}

/** A full listing update payload as the mapper would produce it. */
function payload(over: Record<string, unknown> = {}) {
  return {
    status: "Active",
    list_price: 750000,
    modification_timestamp: MT,
    raw_data: rawData(),
    ...over,
  };
}

describe("PhotosChangeTimestamp is an approved raw-data provenance clock", () => {
  it("is present in RAW_DATA_PROVENANCE_CLOCK_KEYS", () => {
    expect(RAW_DATA_PROVENANCE_CLOCK_KEYS.has("PhotosChangeTimestamp")).toBe(true);
  });

  it("keeps the pre-existing clocks", () => {
    expect(RAW_DATA_PROVENANCE_CLOCK_KEYS.has("ModificationTimestamp")).toBe(true);
    expect(RAW_DATA_PROVENANCE_CLOCK_KEYS.has("OriginalEntryTimestamp")).toBe(true);
  });

  it("does NOT swallow status/price clocks, which move with their typed field", () => {
    expect(RAW_DATA_PROVENANCE_CLOCK_KEYS.has("StatusChangeTimestamp")).toBe(false);
    expect(RAW_DATA_PROVENANCE_CLOCK_KEYS.has("PriceChangeTimestamp")).toBe(false);
  });
});

// ── CASE A: raw PCT only, typed modification_timestamp unchanged ──────────

describe("CASE A — raw PCT-only delta produces NO physical listing write", () => {
  const existing = payload();
  const update = payload({
    raw_data: rawData({ PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }),
  });

  it("the PHYSICAL write comparator reports materially unchanged", () => {
    // This is the assertion that matters: classification alone is not enough.
    expect(listingUpdateMateriallyUnchanged(update, existing)).toBe(true);
  });

  it("no material field is reported as changed", () => {
    expect(changedMaterialListingFields(update, existing)).toEqual([]);
  });

  it("classifies as no-change (nothing to invalidate)", () => {
    expect(classifyListingChangeReasons(update, existing)).toEqual([]);
  });
});

// ── CASE B: raw PCT + typed modification_timestamp, nothing visible ───────

describe("CASE B — PCT plus the typed source clock is a provenance write only", () => {
  const existing = payload();
  const update = payload({
    modification_timestamp: MT_LATER,
    raw_data: rawData({
      PhotosChangeTimestamp: "2026-07-09T12:00:00Z",
      ModificationTimestamp: "2026-07-02T00:00:00Z",
    }),
  });

  it("still writes — the typed source revision clock stays material", () => {
    expect(listingUpdateMateriallyUnchanged(update, existing)).toBe(false);
  });

  it("reports ONLY modification_timestamp as changed, never raw_data", () => {
    const changed = changedMaterialListingFields(update, existing);
    expect(changed).toEqual(["modification_timestamp"]);
    expect(changed).not.toContain("raw_data");
  });

  it("classifies as modification_timestamp_only, so nothing is invalidated", () => {
    expect(classifyListingChangeReasons(update, existing)).toEqual(["modification_timestamp_only"]);
  });
});

// ── CASE C: PCT alongside a genuine content change stays material ─────────

describe("CASE C — PCT plus a real change remains fully material", () => {
  const existing = payload();

  const cases: Array<[string, Record<string, unknown>]> = [
    ["price", { list_price: 700000, raw_data: rawData({ ListPrice: 700000, PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
    ["status", { status: "Closed", raw_data: rawData({ StandardStatus: "Closed", PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
    ["remarks", { raw_data: rawData({ PublicRemarks: "Renovated kitchen.", PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
    ["address", { raw_data: rawData({ StreetNumber: "402", PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
    ["permissions", { raw_data: rawData({ InternetEntireListingDisplayYN: false, PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
    ["attribution", { raw_data: rawData({ ListAgentFullName: "New Agent", PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
    ["media identity", { raw_data: rawData({ Media: [{ MediaKey: "m1", MediaURL: "https://x/1.jpg" }], PhotosChangeTimestamp: "2026-07-09T12:00:00Z" }) }],
  ];

  it.each(cases)("a %s change alongside PCT still writes", (_label, over) => {
    const update = payload(over);
    expect(listingUpdateMateriallyUnchanged(update, existing)).toBe(false);
    expect(changedMaterialListingFields(update, existing).length).toBeGreaterThan(0);
    expect(classifyListingChangeReasons(update, existing)).not.toEqual(["modification_timestamp_only"]);
  });
});

// ── Fail-closed ───────────────────────────────────────────────────────────

describe("malformed or unverifiable raw_data fails closed (writes rather than hides)", () => {
  const existing = payload();

  it("a null raw_data on either side is treated as changed", () => {
    expect(listingUpdateMateriallyUnchanged(payload({ raw_data: null }), existing)).toBe(false);
    expect(listingUpdateMateriallyUnchanged(payload(), payload({ raw_data: null }))).toBe(false);
  });

  it("an array-shaped raw_data is treated as changed", () => {
    expect(listingUpdateMateriallyUnchanged(payload({ raw_data: [] }), existing)).toBe(false);
  });

  it("a field absent from the existing row is unverifiable and forces a write", () => {
    const thin = { status: "Active" };
    expect(listingUpdateMateriallyUnchanged(payload(), thin)).toBe(false);
  });

  it("stripping the clocks never hides a REAL key that only differs by clock name", () => {
    // A key merely CONTAINING a clock name must not be stripped.
    const update = payload({ raw_data: rawData({ PhotosChangeTimestampNote: "x" }) });
    expect(listingUpdateMateriallyUnchanged(update, existing)).toBe(false);
  });
});
