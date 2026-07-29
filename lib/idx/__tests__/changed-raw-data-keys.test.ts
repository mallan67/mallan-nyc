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
  PhotosChangeTimestamp: "2026-07-20T00:00:00Z", // NOT a provenance clock (deliberate)
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

  it("PhotosChangeTimestamp (now an approved provenance clock) ⇒ NOT reported", () => {
    // Phase 1A (2026-07-29): PCT joined RAW_DATA_PROVENANCE_CLOCK_KEYS once the
    // legacy writers gained complete-response reconciliation. This forensic
    // helper answers "which raw_data keys caused a raw_data_only write?" — a
    // clock that always moves is never the cause, so it is excluded.
    const next = { ...base, PhotosChangeTimestamp: "2026-07-26T00:00:00Z" };
    expect(changedRawDataMaterialKeys(base, next)).toEqual([]);
  });

  it("a genuine content key alongside a PCT bump is still reported", () => {
    const next = { ...base, PhotosChangeTimestamp: "2026-07-26T00:00:00Z", ListPrice: 749000 };
    expect(changedRawDataMaterialKeys(base, next)).toEqual(["ListPrice"]);
  });

  it("non-object input ⇒ empty (fail-open, never throws)", () => {
    expect(changedRawDataMaterialKeys(null, base)).toEqual([]);
    expect(changedRawDataMaterialKeys(base, "x")).toEqual([]);
    expect(changedRawDataMaterialKeys(base, [1, 2])).toEqual([]);
  });
});
