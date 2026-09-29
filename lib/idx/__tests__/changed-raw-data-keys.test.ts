/// <reference types="jest" />
/**
 * Phase-1 write-amplification forensic — proof that the raw_data changed-key
 * histogram uses the SAME material semantics as the production classifier, NOT
 * a naive JSON.stringify diff. Codex flagged that a stringify diff would
 * falsely blame `Media` on every signed-URL rotation and blame the provenance
 * clocks. These cases prove it does not.
 */
import { changedRawDataMaterialKeys } from "@/lib/idx/write-suppression";

const mediaItem = (
  url: string,
  order = 0,
  extra: Record<string, unknown> = {},
) => ({
  MediaKey: "mk-" + order,
  Order: order,
  MediaCategory: "Photo",
  MediaURL: url,
  ...extra,
});

const base: Record<string, unknown> = {
  ListingKey: "L1",
  ModificationTimestamp: "2026-07-25T00:00:00Z", // provenance clock
  PublicRemarks: "Sunny 2BR",
  // Deprecated legacy provenance copy (commit 7B-2B) — stripped from BOTH
  // sides of canonical comparison. The LIVE Property PCT still drives the
  // incremental fetch filter and the media-sync cursor.
  PhotosChangeTimestamp: "2026-07-20T00:00:00Z",
  Media: [mediaItem("https://api.cotality.com/trestle/media/photo1.jpg?sig=AAA", 0)],
};

describe("changedRawDataMaterialKeys — production material semantics, not stringify", () => {
  it("rotated signed MediaURL only ⇒ Media NOT reported", () => {
    const next = {
      ...base,
      Media: [mediaItem("https://api.cotality.com/trestle/media/photo1.jpg?sig=ZZZ", 0)],
    };
    expect(changedRawDataMaterialKeys(base, next)).toEqual([]);
  });

  it("rotated Thumbnail only ⇒ Media NOT reported", () => {
    const prev = {
      ...base,
      Media: [
        mediaItem("https://api.cotality.com/m/p1.jpg?sig=AAA", 0, {
          Thumbnail: "https://api.cotality.com/t/p1.jpg?sig=AAA",
        }),
      ],
    };
    const next = {
      ...base,
      Media: [
        mediaItem("https://api.cotality.com/m/p1.jpg?sig=AAA", 0, {
          Thumbnail: "https://api.cotality.com/t/p1.jpg?sig=BBB",
        }),
      ],
    };
    expect(changedRawDataMaterialKeys(prev, next)).toEqual([]);
  });

  it("top-level key-order change with identical content ⇒ nothing reported", () => {
    const reordered: Record<string, unknown> = {
      Media: base.Media,
      PhotosChangeTimestamp: base.PhotosChangeTimestamp,
      PublicRemarks: base.PublicRemarks,
      ModificationTimestamp: base.ModificationTimestamp,
      ListingKey: base.ListingKey,
    };
    expect(changedRawDataMaterialKeys(base, reordered)).toEqual([]);
  });

  it("real Media path change (asset replacement) ⇒ Media reported", () => {
    const next = {
      ...base,
      Media: [mediaItem("https://api.cotality.com/trestle/media/photo2.jpg?sig=AAA", 0)],
    };
    expect(changedRawDataMaterialKeys(base, next)).toContain("Media");
  });

  it("real Media order change ⇒ Media reported", () => {
    const prev = {
      ...base,
      Media: [
        mediaItem("https://api.cotality.com/m/a.jpg?sig=A", 0),
        mediaItem("https://api.cotality.com/m/b.jpg?sig=A", 1),
      ],
    };
    const next = {
      ...base,
      Media: [
        mediaItem("https://api.cotality.com/m/a.jpg?sig=A", 1),
        mediaItem("https://api.cotality.com/m/b.jpg?sig=A", 0),
      ],
    };
    expect(changedRawDataMaterialKeys(prev, next)).toContain("Media");
  });

  it("added key ⇒ reported", () => {
    const added = { ...base, ListPrice: 999000 };
    expect(changedRawDataMaterialKeys(base, added)).toEqual(["ListPrice"]);
  });

  it("removed key ⇒ reported", () => {
    const removed: Record<string, unknown> = { ...base };
    delete removed.PublicRemarks;
    expect(changedRawDataMaterialKeys(base, removed)).toEqual(["PublicRemarks"]);
  });

  it("genuine non-media field change ⇒ that key reported (and only it)", () => {
    const next = { ...base, PublicRemarks: "Renovated 2BR" };
    expect(changedRawDataMaterialKeys(base, next)).toEqual(["PublicRemarks"]);
  });

  it("provenance clock (ModificationTimestamp) change alone ⇒ NOT reported", () => {
    const next = { ...base, ModificationTimestamp: "2026-07-26T12:00:00Z" };
    expect(changedRawDataMaterialKeys(base, next)).toEqual([]);
  });

  /**
   * CONTRACT INVERTED 2026-08-07 (commit 7B-2B). This asserted PCT was reported
   * as a changed material key, because at the time the stored value had a real
   * consumer AND the gallery-emptied case had no other reconciliation path.
   *
   * Both premises are gone:
   *   - the stored-value consumer (the SQL eligibility predicate in the legacy,
   *     the retired legacy media-backfill helper) was removed;
   *   - 7B-1's complete fetch + requested-key pre-seeding now reconciles an
   *     emptied gallery, and 7B-2A moved invalidation out of the Listing-write
   *     branch — so PCT no longer has to force a write to keep the system safe.
   *
   * `Property.PhotosChangeTimestamp` is STILL a live sync/media trigger and the
   * media-sync keyset cursor. Only its LEGACY COPY inside `Listing.raw_data` is
   * non-authoritative, and canonical comparison strips it from BOTH sides so a
   * historical row and a canonical slim row compare equal (no backfill, no
   * first-deploy write storm).
   *
   * This is ONE named key — see the sibling tests: every other field, including
   * other timestamps, keeps its existing semantics.
   */
  it("legacy raw_data PhotosChangeTimestamp change ⇒ NOT reported (deprecated)", () => {
    const next = { ...base, PhotosChangeTimestamp: "2026-07-26T00:00:00Z" };
    expect(changedRawDataMaterialKeys(base, next)).toEqual([]);
  });

  it("a row that has DROPPED the legacy key equals one that still carries it", () => {
    // Historical rows keep the key; canonical slim rows no longer write it.
    // These must be equal or the first deploy rewrites the whole table.
    const { PhotosChangeTimestamp: _dropped, ...slim } = base;
    expect(changedRawDataMaterialKeys(base, slim)).toEqual([]);
    expect(changedRawDataMaterialKeys(slim, base)).toEqual([]);
  });

  it("PCT must NOT mask a real field changing in the SAME object", () => {
    // The deprecation strips one key; it must not swallow anything alongside it.
    const next = {
      ...base,
      PhotosChangeTimestamp: "2026-07-26T00:00:00Z",
      PublicRemarks: "Sunny 2BR with new roof",
    };
    expect(changedRawDataMaterialKeys(base, next)).toEqual(["PublicRemarks"]);
  });

  it("non-object input ⇒ empty (fail-open, never throws)", () => {
    expect(changedRawDataMaterialKeys(null, base)).toEqual([]);
    expect(changedRawDataMaterialKeys(base, "x")).toEqual([]);
    expect(changedRawDataMaterialKeys(base, [1, 2])).toEqual([]);
  });
});
