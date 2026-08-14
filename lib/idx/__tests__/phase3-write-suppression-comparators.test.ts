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
  rawDataMateriallyEqual,
  isRotatingFeedAssetUrl,
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
  it("initializes all seven required counters to zero", () => {
    // `rows_suppressed_provenance_only` (2026-08-13) is a SUBSET of
    // rows_suppressed_unchanged, broken out so the Neon write-amplification
    // reduction stays measurable: ~95% of production updates classified
    // `modification_timestamp_only` and previously still issued a physical
    // UPDATE. Merging it into the general suppressed count would make the fix
    // unprovable from telemetry alone.
    expect(newWritePathCounters()).toEqual({
      rows_checked: 0,
      rows_materially_changed: 0,
      rows_suppressed_unchanged: 0,
      rows_suppressed_provenance_only: 0,
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

  /**
   * CONTRACT INVERTED 2026-08-07 (commit 7B-2B): a PCT-only raw_data delta no
   * longer forces a heavyweight Listing write. Its stored-value consumer was
   * removed, and 7B-1 + 7B-2A now provide the emptied-gallery guarantee that PCT
   * materiality was standing in for.
   */
  it("raw_data change that is ONLY a legacy PhotosChangeTimestamp bump → UNCHANGED", () => {
    expect(
      listingUpdateMateriallyUnchanged(
        { ...base, raw_data: { ...base.raw_data, PhotosChangeTimestamp: "2026-07-03" } },
        existing,
      ),
    ).toBe(true);
  });

  it("PCT must NOT mask a real raw_data change in the SAME payload → CHANGED", () => {
    // CRITICAL: the deprecation strips one key. If it swallowed the rest of the
    // object, a price or remarks change riding alongside a PCT bump would be
    // silently suppressed — a data-staleness bug wearing a write-saving costume.
    expect(
      listingUpdateMateriallyUnchanged(
        {
          ...base,
          raw_data: {
            ...base.raw_data,
            PhotosChangeTimestamp: "2026-07-03",
            PublicRemarks: "Materially different remarks",
          },
        },
        existing,
      ),
    ).toBe(false);
  });

  it("a GENUINE raw_data content change (no PCT involved) → CHANGED", () => {
    expect(
      listingUpdateMateriallyUnchanged(
        { ...base, raw_data: { ...base.raw_data, PublicRemarks: "Different" } },
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
  // Same asset, same provider origin+path — only the signed query rotates.
  const trestleA = (n: number) =>
    `https://api.cotality.com/trestle/Media/x/${n}.jpg?sig=AAAA`;
  const trestleB = (n: number) =>
    `https://api.cotality.com/trestle/Media/x/${n}.jpg?sig=BBBB-rotated`;
  const r2 = (n: number) => `https://media.mallan.nyc/photos/L1/${n}.jpg`;

  it("same count/type/order + same provider origin/path with ROTATED signature → EQUAL (only the signature is non-identity)", () => {
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

  it("DIFFERENT provider pathname at same type/order → CHANGED (asset replacement at the same slot is material)", () => {
    const stored = [{ url: "https://api.cotality.com/trestle/Media/x/0.jpg?sig=A", mediaType: "Photo", order: 0 }];
    const next = [{ url: "https://api.cotality.com/trestle/Media/REPLACED/9.jpg?sig=B", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("hero replacement at the SAME order (-1) → CHANGED (different asset path)", () => {
    const stored = [{ url: "https://api.cotality.com/trestle/Media/hero-old/0.jpg?sig=A", mediaType: "Photo", order: -1 }];
    const next = [{ url: "https://api.cotality.com/trestle/Media/hero-new/0.jpg?sig=B", mediaType: "Photo", order: -1 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("provider HOST migration (corelogic → cotality) → CHANGED (origin is part of identity; rewrites once)", () => {
    const stored = [{ url: "https://api-trestle.corelogic.com/trestle/Media/x/0.jpg?sig=A", mediaType: "Photo", order: 0 }];
    const next = [{ url: "https://api.cotality.com/trestle/Media/x/0.jpg?sig=B", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("stable MediaKey wins when BOTH sides carry it: same key + rotated URL → EQUAL; different key → CHANGED", () => {
    const storedSame = [{ url: trestleA(0), mediaKey: "MK-1", mediaType: "Photo", order: 0 }];
    const nextSame = [{ url: trestleB(0), mediaKey: "MK-1", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(storedSame, nextSame)).toBe(true);

    const storedDiff = [{ url: trestleA(0), mediaKey: "MK-1", mediaType: "Photo", order: 0 }];
    const nextDiff = [{ url: trestleA(0), mediaKey: "MK-2", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(storedDiff, nextDiff)).toBe(false);
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

describe("rawDataMateriallyEqual — raw_data with rotating Media[].MediaURL values", () => {
  // The raw-data keep-set preserves `Media` (lib/compliance/raw-data-keep-fields.ts:175),
  // including signed MediaURL values that rotate per request when $expand=Media
  // is in play. Only that known rotating query/signature may be canonicalized;
  // every other raw_data change is material.
  const base = () => ({
    ListPrice: 750000,
    StandardStatus: "Active",
    PhotosChangeTimestamp: "2026-07-01T00:00:00Z",
    Media: [
      { MediaURL: "https://api.cotality.com/trestle/Media/a/0.jpg?token=SIG-A", MediaCategory: "Photo", Order: 0, PreferredPhotoYN: true },
      { MediaURL: "https://api.cotality.com/trestle/Media/a/1.jpg?token=SIG-A", MediaCategory: "Photo", Order: 1 },
    ],
  });

  it("identical except rotated Media[].MediaURL signatures → EQUAL", () => {
    const b = base();
    b.Media = b.Media.map((m) => ({ ...m, MediaURL: m.MediaURL.replace("SIG-A", "SIG-B-ROTATED") }));
    expect(rawDataMateriallyEqual(base(), b)).toBe(true);
  });

  it("Media path change (asset replaced) → CHANGED", () => {
    const b = base();
    b.Media[0] = { ...b.Media[0], MediaURL: "https://api.cotality.com/trestle/Media/REPLACED/0.jpg?token=SIG-B" };
    expect(rawDataMateriallyEqual(base(), b)).toBe(false);
  });

  it("Media count change → CHANGED", () => {
    const b = base();
    b.Media = b.Media.slice(0, 1);
    expect(rawDataMateriallyEqual(base(), b)).toBe(false);
  });

  it("Media order / metadata change → CHANGED", () => {
    const order = base();
    order.Media[1] = { ...order.Media[1], Order: 5 };
    expect(rawDataMateriallyEqual(base(), order)).toBe(false);

    const cat = base();
    cat.Media[1] = { ...cat.Media[1], MediaCategory: "FloorPlan" };
    expect(rawDataMateriallyEqual(base(), cat)).toBe(false);
  });

  /**
   * SPLIT 2026-08-07 (commit 7B-2B). This bundled ListPrice and PCT into one
   * "non-media raw_data change → CHANGED" assertion. They now have DIFFERENT
   * contracts, so bundling them would have hidden a regression in either:
   * deleting the case would have dropped ListPrice coverage entirely.
   */
  it("non-media raw_data change (ListPrice) → CHANGED", () => {
    expect(rawDataMateriallyEqual(base(), { ...base(), ListPrice: 749000 })).toBe(false);
  });

  it("legacy PhotosChangeTimestamp-only change → UNCHANGED (deprecated key)", () => {
    expect(
      rawDataMateriallyEqual(base(), { ...base(), PhotosChangeTimestamp: "2026-07-02T00:00:00Z" }),
    ).toBe(true);
  });

  it("PCT + ListPrice together → CHANGED (PCT never masks a material field)", () => {
    expect(
      rawDataMateriallyEqual(base(), {
        ...base(),
        PhotosChangeTimestamp: "2026-07-02T00:00:00Z",
        ListPrice: 749000,
      }),
    ).toBe(false);
  });

  it("stable non-feed MediaURL query change → CHANGED (canonicalization is provider-scoped)", () => {
    const a = { Media: [{ MediaURL: "https://cdn.example.com/p.jpg?v=1", Order: 0 }] };
    const b = { Media: [{ MediaURL: "https://cdn.example.com/p.jpg?v=2", Order: 0 }] };
    expect(rawDataMateriallyEqual(a, b)).toBe(false);
  });

  it("malformed input fails closed → CHANGED, never throws", () => {
    expect(rawDataMateriallyEqual({ Media: "not-an-array" }, base())).toBe(false);
    expect(rawDataMateriallyEqual(null, base())).toBe(false);
    expect(rawDataMateriallyEqual("junk", base())).toBe(false);
  });

  it("both sides identical (no Media key at all) → EQUAL", () => {
    expect(rawDataMateriallyEqual({ ListPrice: 1 }, { ListPrice: 1 })).toBe(true);
  });
});

// ── Provider detection MUST be hostname-scoped (Maya re-review, 2026-07-21) ──
//
// Substring matching over the WHOLE URL misclassified: stable URLs whose PATH
// contains a provider-looking token ("trestle-building.jpg"), URLs whose QUERY
// smuggles a provider host ("?redirect=api.cotality.com"), and look-alike
// hosts ("notcotality.com"). Detection must parse the URL and inspect
// URL.hostname ONLY, matching exact provider domains or dot-boundary
// subdomains. Allowlist grounding:
//   - `api.cotality.com` — LIVE-OBSERVED (the only host in the 2026-07-21
//     authenticated probes: docs/superpowers/specs/evidence/
//     2026-07-21-live-cotality-{contract,pagination}-probe.json on #544).
//   - `*.corelogic.com` — DEFENSIVE/UNOBSERVED legacy (the production media
//     proxy allowlists api-trestle.corelogic.com / api-prod.corelogic.com;
//     deprecated hosts under the Cotality 2026 warranty — NOT seen in the
//     live probes).

describe("isRotatingFeedAssetUrl — hostname-scoped provider detection", () => {
  it("live-observed provider host api.cotality.com → rotating provider", () => {
    expect(isRotatingFeedAssetUrl("https://api.cotality.com/trestle/Media/x/0.jpg?sig=A")).toBe(true);
  });

  it("defensive legacy CoreLogic hosts (proxy-allowlisted, unobserved in live probes) → rotating provider", () => {
    expect(isRotatingFeedAssetUrl("https://api-trestle.corelogic.com/trestle/Media/x/0.jpg?sig=A")).toBe(true);
    expect(isRotatingFeedAssetUrl("https://api-prod.corelogic.com/trestle/Media/x/0.jpg?sig=A")).toBe(true);
  });

  it("provider-looking PATH token on a stable host → NOT a provider URL", () => {
    expect(isRotatingFeedAssetUrl("https://cdn.example.com/photos/trestle-building.jpg?v=1")).toBe(false);
  });

  it("provider host smuggled in the QUERY → NOT a provider URL", () => {
    expect(isRotatingFeedAssetUrl("https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=1")).toBe(false);
  });

  it("look-alike hosts (no dot boundary) → NOT provider URLs", () => {
    expect(isRotatingFeedAssetUrl("https://notcotality.com/photo.jpg?sig=A")).toBe(false);
    expect(isRotatingFeedAssetUrl("https://evilcorelogic.com/photo.jpg?sig=A")).toBe(false);
  });

  it("malformed URL → NOT a provider URL (falls back to exact compare → fail-closed CHANGED)", () => {
    expect(isRotatingFeedAssetUrl("not a url at all")).toBe(false);
  });
});

describe("hostname-scoped detection flows through the comparators", () => {
  it("mediaArraysMateriallyEqual: stable host with 'trestle' in the PATH, ?v=1 vs ?v=2 → CHANGED", () => {
    const stored = [{ url: "https://cdn.example.com/photos/trestle-building.jpg?v=1", mediaType: "Photo", order: 0 }];
    const next = [{ url: "https://cdn.example.com/photos/trestle-building.jpg?v=2", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("mediaArraysMateriallyEqual: provider host smuggled in the QUERY, &v=1 vs &v=2 → CHANGED", () => {
    const stored = [{ url: "https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=1", mediaType: "Photo", order: 0 }];
    const next = [{ url: "https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=2", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("mediaArraysMateriallyEqual: look-alike host rotation is NOT treated as provider rotation → CHANGED", () => {
    const stored = [{ url: "https://notcotality.com/x/0.jpg?sig=A", mediaType: "Photo", order: 0 }];
    const next = [{ url: "https://notcotality.com/x/0.jpg?sig=B", mediaType: "Photo", order: 0 }];
    expect(mediaArraysMateriallyEqual(stored, next)).toBe(false);
  });

  it("rawDataMateriallyEqual: stable-host Media URL with provider-looking path, ?v=1 vs ?v=2 → CHANGED", () => {
    const a = { Media: [{ MediaURL: "https://cdn.example.com/photos/trestle-building.jpg?v=1", Order: 0 }] };
    const b = { Media: [{ MediaURL: "https://cdn.example.com/photos/trestle-building.jpg?v=2", Order: 0 }] };
    expect(rawDataMateriallyEqual(a, b)).toBe(false);
  });

  it("rawDataMateriallyEqual: query-smuggled provider host, &v=1 vs &v=2 → CHANGED", () => {
    const a = { Media: [{ MediaURL: "https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=1", Order: 0 }] };
    const b = { Media: [{ MediaURL: "https://cdn.example.com/photo.jpg?redirect=api.cotality.com&v=2", Order: 0 }] };
    expect(rawDataMateriallyEqual(a, b)).toBe(false);
  });
});
