/**
 * Change-reason attribution (failing-first TDD) — Maya directive 2026-07-24.
 *
 * Production question being answered: WHY are 83–95% of fetched listings
 * "materially changed" every cycle? `modification_timestamp` is deliberately
 * material (a source revision must persist), so a feed-side timestamp bump
 * with zero visible field changes still writes — and, before this change,
 * also invalidated the listing/building/search caches and triggered a full
 * 9-shard manifest warm.
 *
 * Contract proven here:
 *   1. Exclusive buckets: a change whose ONLY material delta is
 *      `modification_timestamp` classifies as `modification_timestamp_only`;
 *      raw_data (± modification_timestamp) and nothing else classifies as
 *      `raw_data_only`.
 *   2. Category buckets (non-exclusive): status/price/address/
 *      display_permissions/media_identity/attribution/other, keyed off the
 *      SAME comparison seams as listingUpdateMateriallyUnchanged (rotating
 *      signed MediaURLs inside raw_data are still non-identity).
 *   3. `isProvenanceOnlyChange` is true ONLY for the
 *      modification_timestamp_only bucket — raw_data changes keep
 *      invalidation FAIL-CLOSED (raw_data feeds public detail DTOs).
 *   4. Classification never throws; unclassifiable input fails closed to
 *      ["other"].
 */

import {
  classifyListingChangeReasons,
  changedMaterialListingFields,
  isProvenanceOnlyChange,
  newListingChangeReasonCounters,
  newProjectionChangeReasonCounters,
  LISTING_CHANGE_REASON_KEYS,
  PROJECTION_CHANGE_REASON_KEYS,
} from "../write-suppression";

const T0 = new Date("2026-07-20T10:00:00.000Z");
const T1 = new Date("2026-07-24T10:00:00.000Z");

/** Minimal existing row: every key the update carries must exist here or the
 *  comparator fails closed (that fail-closed path is itself asserted below). */
function existingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "Active",
    sync_status: "active",
    list_price: 1_250_000,
    address: { StreetNumber: "400", StreetName: "EAST 90 STREET", PostalCode: "10128" },
    borough: "Manhattan",
    neighborhood: "Upper East Side",
    city: "New York",
    postal_code: "10128",
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    participant_only: false,
    owner_opt_out: false,
    agent_id: null,
    list_agent_full_name: "Jane Broker",
    list_office_mls_id: "OFF1",
    raw_data: { ListingId: "RLS1", StandardStatus: "Active" },
    modification_timestamp: T0,
    last_synced_from_trestle: T0,
    ...overrides,
  };
}

/** An update payload that would be a pure no-op against existingRow() except
 *  for the provided overrides. */
function updatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...existingRow(),
    last_synced_from_trestle: T1, // local telemetry clock — never material
    ...overrides,
  };
}

describe("counter factories — required reason-key shapes", () => {
  it("listing reason counters carry exactly the directed keys, all zero", () => {
    const c = newListingChangeReasonCounters();
    expect(Object.keys(c).sort()).toEqual([...LISTING_CHANGE_REASON_KEYS].sort());
    expect(Object.values(c).every((v) => v === 0)).toBe(true);
    expect(LISTING_CHANGE_REASON_KEYS).toEqual(
      expect.arrayContaining([
        "modification_timestamp_only",
        "raw_data_only",
        "status",
        "price",
        "address",
        "display_permissions",
        "media_identity",
        "attribution",
        "other",
      ]),
    );
  });

  it("projection reason counters carry source_timestamp_only + search_visible_fields", () => {
    const c = newProjectionChangeReasonCounters();
    expect(Object.keys(c).sort()).toEqual([...PROJECTION_CHANGE_REASON_KEYS].sort());
    expect(PROJECTION_CHANGE_REASON_KEYS).toEqual(
      expect.arrayContaining(["source_timestamp_only", "search_visible_fields"]),
    );
  });
});

describe("exclusive provenance buckets", () => {
  it("modification_timestamp alone → [modification_timestamp_only]", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({ modification_timestamp: T1 }),
      existingRow(),
    );
    expect(reasons).toEqual(["modification_timestamp_only"]);
    expect(isProvenanceOnlyChange(reasons)).toBe(true);
  });

  it("raw_data alone → [raw_data_only]", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({ raw_data: { ListingId: "RLS1", StandardStatus: "Active", PrivateRemark: "x" } }),
      existingRow(),
    );
    expect(reasons).toEqual(["raw_data_only"]);
  });

  it("raw_data + modification_timestamp (nothing else) → [raw_data_only]", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({
        raw_data: { ListingId: "RLS1", StandardStatus: "Active", PrivateRemark: "x" },
        modification_timestamp: T1,
      }),
      existingRow(),
    );
    expect(reasons).toEqual(["raw_data_only"]);
  });

  it("raw_data_only is NOT provenance-only (fail-closed: raw_data feeds public DTOs)", () => {
    expect(isProvenanceOnlyChange(["raw_data_only"])).toBe(false);
  });

  it("no material delta at all → [] (and [] is not provenance-only)", () => {
    const reasons = classifyListingChangeReasons(updatePayload(), existingRow());
    expect(reasons).toEqual([]);
    expect(isProvenanceOnlyChange(reasons)).toBe(false);
  });

  it("PRODUCTION SHAPE: a feed clock bump changes BOTH the column AND raw_data.ModificationTimestamp — still modification_timestamp_only", () => {
    // Every real re-emit moves raw_data.ModificationTimestamp alongside the
    // mirrored column. Without the provenance-clock carve-out this would
    // classify raw_data_only and keep invalidating caches on every bump.
    const reasons = classifyListingChangeReasons(
      updatePayload({
        modification_timestamp: T1,
        raw_data: {
          ListingId: "RLS1",
          StandardStatus: "Active",
          ModificationTimestamp: "2026-07-24T10:00:00Z",
        },
      }),
      existingRow({
        raw_data: {
          ListingId: "RLS1",
          StandardStatus: "Active",
          ModificationTimestamp: "2026-07-20T10:00:00Z",
        },
      }),
    );
    expect(reasons).toEqual(["modification_timestamp_only"]);
    expect(isProvenanceOnlyChange(reasons)).toBe(true);
  });

  /**
   * CONTRACT INVERTED 2026-08-07 (commit 7B-2B).
   *
   * The original justification was explicit and, at the time, correct:
   *   "The batch-media reconcile loop only processes listings that RETURN media
   *    rows: a gallery emptied to zero upstream never enters mediaByListing, so
   *    PCT is the ONLY signal for that case."
   *
   * 7B-1 removed that premise. The batch fetch now proves completeness via the
   * shared `paginateMedia` and PRE-SEEDS every requested ResourceRecordKey, so a
   * complete-zero result arrives as `[]` and IS reconciled. 7B-2A then moved
   * invalidation out of the Listing-write branch into one shared owner, so a
   * media change expires listing + building + manifest without needing a Listing
   * write to carry it.
   *
   * So the safety property is unchanged; a different, stronger mechanism now
   * provides it — proven end-to-end in
   * tests/runtime/sync-change-attribution-behavior.test.ts.
   *
   * NOTE ON THE EMPTY RESULT: `[]` means "no MATERIAL listing change to
   * classify". It is deliberately NOT `modification_timestamp_only`, and
   * `isProvenanceOnlyChange([])` staying false is correct — there is simply
   * nothing to classify, which is different from classifying a provenance-only
   * change.
   */
  it("legacy PhotosChangeTimestamp-only raw_data delta ⇒ NO material change to classify", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({
        raw_data: { ListingId: "RLS1", StandardStatus: "Active", PhotosChangeTimestamp: "2026-07-24T09:00:00Z" },
      }),
      existingRow({
        raw_data: { ListingId: "RLS1", StandardStatus: "Active", PhotosChangeTimestamp: "2026-07-19T09:00:00Z" },
      }),
    );
    expect(reasons).toEqual([]);
  });

  it("a GENUINE raw_data content change is still raw_data_only and still fail-closed", () => {
    // Guards the inversion above from over-reaching: only the one deprecated key
    // is ignored, and real raw_data content still forces the write + invalidation.
    const reasons = classifyListingChangeReasons(
      updatePayload({
        raw_data: { ListingId: "RLS1", StandardStatus: "Active", PublicRemarks: "New roof" },
      }),
      existingRow({
        raw_data: { ListingId: "RLS1", StandardStatus: "Active", PublicRemarks: "Old roof" },
      }),
    );
    expect(reasons).toEqual(["raw_data_only"]);
    expect(isProvenanceOnlyChange(reasons)).toBe(false);
  });

  it("clock bump + real raw_data content change → raw_data_only (fail-closed: still invalidates)", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({
        modification_timestamp: T1,
        raw_data: {
          ListingId: "RLS1",
          StandardStatus: "Active",
          ModificationTimestamp: "2026-07-24T10:00:00Z",
          PublicRemarks: "Newly renovated",
        },
      }),
      existingRow({
        raw_data: {
          ListingId: "RLS1",
          StandardStatus: "Active",
          ModificationTimestamp: "2026-07-20T10:00:00Z",
          PublicRemarks: "Charming prewar",
        },
      }),
    );
    expect(reasons).toEqual(["raw_data_only"]);
    expect(isProvenanceOnlyChange(reasons)).toBe(false);
  });

  it("rotating signed MediaURL inside raw_data.Media is NOT a change (same seam as suppression)", () => {
    const mediaA = [{ MediaKey: "M1", MediaURL: "https://api.cotality.com/trestle/media/1.jpg?sig=aaa", Order: 0 }];
    const mediaB = [{ MediaKey: "M1", MediaURL: "https://api.cotality.com/trestle/media/1.jpg?sig=bbb", Order: 0 }];
    const reasons = classifyListingChangeReasons(
      updatePayload({ raw_data: { ListingId: "RLS1", StandardStatus: "Active", Media: mediaB } }),
      existingRow({ raw_data: { ListingId: "RLS1", StandardStatus: "Active", Media: mediaA } }),
    );
    expect(reasons).toEqual([]);
  });
});

describe("category buckets", () => {
  it("status flip (+ its lifecycle clocks + provenance) → [status] only", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({
        status: "Closed",
        sync_status: "terminal",
        modification_timestamp: T1,
        raw_data: { ListingId: "RLS1", StandardStatus: "Closed" },
      }),
      existingRow(),
    );
    expect(reasons).toEqual(["status"]);
  });

  it("price change → [price]", () => {
    expect(
      classifyListingChangeReasons(updatePayload({ list_price: 1_200_000 }), existingRow()),
    ).toEqual(["price"]);
  });

  it("zero-safe: price 0 vs null IS a change (§J.5)", () => {
    expect(
      classifyListingChangeReasons(updatePayload({ list_price: 0 }), existingRow({ list_price: null })),
    ).toEqual(["price"]);
  });

  it("address JSON change → [address]", () => {
    expect(
      classifyListingChangeReasons(
        updatePayload({ address: { StreetNumber: "402", StreetName: "EAST 90 STREET", PostalCode: "10128" } }),
        existingRow(),
      ),
    ).toEqual(["address"]);
  });

  it("display gate flip → [display_permissions]", () => {
    expect(
      classifyListingChangeReasons(updatePayload({ idx_display_yn: false }), existingRow()),
    ).toEqual(["display_permissions"]);
  });

  it("attribution change → [attribution]", () => {
    expect(
      classifyListingChangeReasons(
        updatePayload({ list_agent_full_name: "New Agent" }),
        existingRow(),
      ),
    ).toEqual(["attribution"]);
  });

  it("multiple categories surface together (price + status), sorted deterministically", () => {
    const reasons = classifyListingChangeReasons(
      updatePayload({ status: "ActiveUnderContract", list_price: 1_199_000, modification_timestamp: T1 }),
      existingRow(),
    );
    expect([...reasons].sort()).toEqual(["price", "status"]);
  });

  it("unmapped material field → [other]", () => {
    expect(
      classifyListingChangeReasons(
        updatePayload({ some_future_field: "x" }),
        existingRow({ some_future_field: "y" }),
      ),
    ).toEqual(["other"]);
  });

  it("field missing from the existing selection fails closed into its category", () => {
    // `list_price` present in update but absent from existing → unverifiable
    // → counted changed (same seam as listingUpdateMateriallyUnchanged).
    const existing = existingRow();
    delete existing.list_price;
    expect(classifyListingChangeReasons(updatePayload(), existing)).toEqual(["price"]);
  });
});

describe("changedMaterialListingFields — raw field list", () => {
  it("skips non-material telemetry fields and undefined values", () => {
    const changed = changedMaterialListingFields(
      updatePayload({ modification_timestamp: T1, list_price: undefined }),
      existingRow(),
    );
    expect(changed).toEqual(["modification_timestamp"]);
  });

  it("never throws on hostile input — classification fails closed to [other]", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile");
        },
        getOwnPropertyDescriptor() {
          throw new Error("hostile");
        },
      },
    ) as Record<string, unknown>;
    expect(classifyListingChangeReasons(hostile, existingRow())).toEqual(["other"]);
  });
});
