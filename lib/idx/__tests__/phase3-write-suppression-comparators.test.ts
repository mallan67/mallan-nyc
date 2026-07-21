/**
 * Phase 3 write-suppression — pure comparator layer (failing-first TDD).
 *
 * Root problem (2026-07 Neon write-churn forensic): the IDX sync pipeline and
 * the recurring scorers perform UNCONDITIONAL upserts/updates every run even
 * when nothing material changed, generating constant WAL/page write churn.
 *
 * Material identity rules proven here:
 *   - `last_synced_from_trestle` (local fetch wall-clock) is NEVER material.
 *   - Prisma-managed `updated_at`/`created_at` are NEVER material.
 *   - `modification_timestamp` (the Trestle source-revision clock) IS material.
 *   - Rotating Trestle/Cotality signed MediaURLs are NEVER material identity
 *     (same lesson as PR #547's media-row comparator — do not duplicate that
 *     comparator; this one covers the LEGACY `listings.media` JSON batch path).
 *   - Unknown/unverifiable fields FAIL CLOSED → treated as changed → write.
 */

import {
  newWritePathCounters,
  materialValuesEqual,
  listingUpdateMateriallyUnchanged,
  mediaArraysMateriallyEqual,
  LISTING_NON_MATERIAL_UPDATE_FIELDS,
} from "../write-suppression";

// A Prisma.Decimal stand-in: object with toNumber/toString like decimal.js.
function decimalLike(v: string | number) {
  return {
    toNumber: () => Number(v),
    toString: () => String(v),
  };
}

describe("newWritePathCounters — required counter shape", () => {
  it("initializes all six required counters to zero", () => {
    expect(newWritePathCounters()).toEqual({
      rows_checked: 0,
      rows_materially_changed: 0,
      rows_suppressed_unchanged: 0,
      rows_inserted: 0,
      rows_updated: 0,
      rows_failed: 0,
    });
  });
});

describe("materialValuesEqual — canonical value comparison", () => {
  it("null and undefined are mutually equal (absent == SQL NULL)", () => {
    expect(materialValuesEqual(null, undefined)).toBe(true);
    expect(materialValuesEqual(null, null)).toBe(true);
    expect(materialValuesEqual(undefined, undefined)).toBe(true);
  });

  it("null vs a value differs", () => {
    expect(materialValuesEqual(null, 0)).toBe(false);
    expect(materialValuesEqual("x", null)).toBe(false);
  });

  it("Dates compare by instant, tolerating ISO-string counterparts", () => {
    const d = new Date("2026-07-01T00:00:00.000Z");
    expect(materialValuesEqual(d, new Date(d.getTime()))).toBe(true);
    expect(materialValuesEqual(d, "2026-07-01T00:00:00.000Z")).toBe(true);
    expect(materialValuesEqual(d, new Date("2026-07-02T00:00:00.000Z"))).toBe(false);
  });

  it("Prisma Decimal vs the mapper's string price compare numerically", () => {
    expect(materialValuesEqual(decimalLike("500000"), "500000")).toBe(true);
    expect(materialValuesEqual(decimalLike("500000.5"), "500000.50")).toBe(true);
    expect(materialValuesEqual(decimalLike("500000"), "500001")).toBe(false);
    expect(materialValuesEqual(decimalLike("500000"), 500000)).toBe(true);
  });

  it("a legitimate 0 is not equal to null (zero-safe, §J.5)", () => {
    expect(materialValuesEqual(0, null)).toBe(false);
    expect(materialValuesEqual(decimalLike("0"), 0)).toBe(true);
  });

  it("booleans compare strictly", () => {
    expect(materialValuesEqual(false, false)).toBe(true);
    expect(materialValuesEqual(false, true)).toBe(false);
    // Fail-closed: boolean vs non-boolean is a change.
    expect(materialValuesEqual(false, 0)).toBe(false);
  });

  it("JSON objects compare deeply and key-order-independently", () => {
    expect(
      materialValuesEqual(
        { a: 1, b: { c: [1, 2] } },
        { b: { c: [1, 2] }, a: 1 },
      ),
    ).toBe(true);
    expect(materialValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(materialValuesEqual({ a: 1 }, { a: 1, b: 1 })).toBe(false);
    expect(materialValuesEqual([1, 2], [2, 1])).toBe(false);
  });

  it("nested absent key == nested undefined (JSON round-trip tolerance)", () => {
    expect(materialValuesEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});

describe("listingUpdateMateriallyUnchanged — listings upsert identity", () => {
  const base = {
    status: "Active",
    list_price: "750000",
    neighborhood: "Tribeca",
    raw_data: { ListPrice: 750000, StandardStatus: "Active" },
    modification_timestamp: new Date("2026-07-01T00:00:00Z"),
    last_synced_from_trestle: new Date("2026-07-20T10:00:00Z"),
    sync_status: "synced",
  };
  const existing = {
    status: "Active",
    list_price: decimalLike("750000"),
    neighborhood: "Tribeca",
    raw_data: { ListPrice: 750000, StandardStatus: "Active" },
    modification_timestamp: new Date("2026-07-01T00:00:00Z"),
    // A much older local sync clock — must NOT force a write by itself.
    last_synced_from_trestle: new Date("2026-06-01T00:00:00Z"),
    sync_status: "synced",
  };

  it("identical material fields + differing last_synced_from_trestle → UNCHANGED", () => {
    expect(listingUpdateMateriallyUnchanged(base, existing)).toBe(true);
  });

  it("price change → CHANGED", () => {
    expect(
      listingUpdateMateriallyUnchanged({ ...base, list_price: "760000" }, existing),
    ).toBe(false);
  });

  it("status change → CHANGED", () => {
    expect(
      listingUpdateMateriallyUnchanged({ ...base, status: "Pending" }, existing),
    ).toBe(false);
  });

  it("source-revision change (modification_timestamp) → CHANGED", () => {
    expect(
      listingUpdateMateriallyUnchanged(
        { ...base, modification_timestamp: new Date("2026-07-02T00:00:00Z") },
        existing,
      ),
    ).toBe(false);
  });

  it("raw_data change (e.g. PhotosChangeTimestamp bump) → CHANGED", () => {
    expect(
      listingUpdateMateriallyUnchanged(
        { ...base, raw_data: { ...base.raw_data, PhotosChangeTimestamp: "2026-07-03" } },
        existing,
      ),
    ).toBe(false);
  });

  it("field present in the update but MISSING from the existing select → fail-closed CHANGED", () => {
    const { neighborhood: _n, ...existingWithoutNeighborhood } = existing;
    expect(listingUpdateMateriallyUnchanged(base, existingWithoutNeighborhood)).toBe(false);
  });

  it("comparison failure (poisoned getter) → fail-closed CHANGED, never throws", () => {
    const poisoned = Object.defineProperty({ ...existing }, "neighborhood", {
      get() {
        throw new Error("boom");
      },
      enumerable: true,
    });
    expect(listingUpdateMateriallyUnchanged(base, poisoned)).toBe(false);
  });

  it("the non-material exclusion set names the telemetry clocks explicitly", () => {
    expect(LISTING_NON_MATERIAL_UPDATE_FIELDS.has("last_synced_from_trestle")).toBe(true);
    expect(LISTING_NON_MATERIAL_UPDATE_FIELDS.has("updated_at")).toBe(true);
    expect(LISTING_NON_MATERIAL_UPDATE_FIELDS.has("created_at")).toBe(true);
    // The Trestle source-revision clock is MATERIAL — never excluded.
    expect(LISTING_NON_MATERIAL_UPDATE_FIELDS.has("modification_timestamp")).toBe(false);
  });
});

describe("mediaArraysMateriallyEqual — legacy listings.media batch identity", () => {
  const trestleA = (n: number) =>
    `https://api-trestle.corelogic.com/trestle/Media/x/${n}.jpg?sig=AAAA`;
  const trestleB = (n: number) =>
    `https://api.cotality.com/trestle/Media/x/${n}.jpg?sig=BBBB-rotated`;
  const r2 = (n: number) => `https://media.mallan.nyc/photos/L1/${n}.jpg`;

  it("same count/type/order with ROTATED signed Trestle URLs → EQUAL (rotation is never identity)", () => {
    const stored = [
      { url: trestleA(0), mediaType: "Photo", order: -1 },
      { url: trestleA(1), mediaType: "Photo", order: 1 },
    ];
    const next = [
      { url: trestleB(0), mediaType: "Photo", order: -1 },
      { url: trestleB(1), mediaType: "Photo", order: 1 },
    ];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(true);
  });

  it("true insert (count grows) → NOT equal", () => {
    const stored = [{ url: trestleA(0), mediaType: "Photo", order: 0 }];
    const next = [
      { url: trestleB(0), mediaType: "Photo", order: 0 },
      { url: trestleB(1), mediaType: "Photo", order: 1 },
    ];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("deletion (count shrinks) → NOT equal", () => {
    const stored = [
      { url: trestleA(0), mediaType: "Photo", order: 0 },
      { url: trestleA(1), mediaType: "Photo", order: 1 },
    ];
    const next = [{ url: trestleB(0), mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("ordering change → NOT equal", () => {
    const stored = [
      { url: trestleA(0), mediaType: "Photo", order: 0 },
      { url: trestleA(1), mediaType: "Photo", order: 1 },
    ];
    const next = [
      { url: trestleB(0), mediaType: "Photo", order: 1 },
      { url: trestleB(1), mediaType: "Photo", order: 0 },
    ];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("hero change (preferred order -1 moves) → NOT equal", () => {
    const stored = [
      { url: trestleA(0), mediaType: "Photo", order: -1 },
      { url: trestleA(1), mediaType: "Photo", order: 1 },
    ];
    const next = [
      { url: trestleB(0), mediaType: "Photo", order: 0 },
      { url: trestleB(1), mediaType: "Photo", order: -1 },
    ];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("media_type change (Photo → FloorPlan) → NOT equal", () => {
    const stored = [{ url: trestleA(0), mediaType: "Photo", order: 0 }];
    const next = [{ url: trestleB(0), mediaType: "FloorPlan", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("delivery-state change (stored R2 URL vs incoming Trestle URL) → NOT equal", () => {
    const stored = [{ url: r2(0), mediaType: "Photo", order: 0 }];
    const next = [{ url: trestleB(0), mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("stable non-Trestle URLs compare exactly", () => {
    const stored = [{ url: r2(0), mediaType: "Photo", order: 0 }];
    expect(
      mediaArraysMateriallyEqual(stored, [{ url: r2(0), mediaType: "Photo", order: 0 }]),
    ).toBe(true);
    expect(
      mediaArraysMateriallyEqual(stored, [{ url: r2(1), mediaType: "Photo", order: 0 }]),
    ).toBe(false);
  });

  it("fail-closed: stored media not an array / malformed rows → NOT equal (write proceeds)", () => {
    const next = [{ url: trestleB(0), mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(null, next)).toBe(false);
    expect(mediaArraysMateriallyEqual({ PhotosCount: 3 }, next)).toBe(false);
    expect(mediaArraysMateriallyEqual(["not-an-object"], next)).toBe(false);
  });

  it("empty vs empty → equal (repeated empty writes are suppressed)", () => {
    expect(mediaArraysMateriallyEqual([], [])).toBe(true);
  });
});
