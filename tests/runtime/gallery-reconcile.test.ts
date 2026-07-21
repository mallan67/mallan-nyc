/**
 * Unified system — Phase 2, Task 8: fail-closed gallery reconciliation.
 *
 * The state machine that decides insert/update/skip/tombstone for one listing's
 * gallery. It NEVER wipes on an empty/incomplete/contradicted fetch, requires a
 * SECOND independent fetch to confirm an absence-based removal, and trips a
 * circuit breaker on mass destruction. Pure — no DB/network.
 */
import {
  reconcileGallery,
  type ExistingMediaRow,
  type IncomingMedia,
} from "@/lib/sync/gallery-reconcile";

const existing = (over: Partial<ExistingMediaRow>): ExistingMediaRow => ({
  listing_id: "L1",
  resource_record_key: "L1",
  resource_record_id: null,
  media_key: "MK1",
  source_revision: 100,
  media_category: "Photo",
  media_classification: null,
  media_type: "Photo",
  order: 1,
  preferred_photo_yn: false,
  status: "active",
  pending_removal_run: null,
  ...over,
});

const incoming = (over: Partial<IncomingMedia>): IncomingMedia => ({
  listing_id: "L1",
  resource_record_key: "L1",
  resource_record_id: null,
  media_key: "MK1",
  source_revision: 100,
  media_category: "Photo",
  media_classification: null,
  media_type: "Photo",
  order: 1,
  preferred_photo_yn: false,
  status: "active",
  media_status: "Active",
  ...over,
});

const RUN = "run-2026-07-21T10:00";

const base = { fetchComplete: true, photosCount: null as number | null, runId: RUN };

describe("reconcileGallery — fetch integrity fail-closed", () => {
  it("incoming null (fetch failed) → failClosed, zero destructive action", () => {
    const r = reconcileGallery({ ...base, existing: [existing({})], incoming: null });
    expect(r.failClosed).toBe(true);
    expect(r.pendingRemoval).toHaveLength(0);
    expect(r.confirmedTombstone).toHaveLength(0);
    expect(r.explicitTombstone).toHaveLength(0);
  });

  it("incomplete pagination → failClosed", () => {
    const r = reconcileGallery({ ...base, fetchComplete: false, existing: [existing({})], incoming: [incoming({})] });
    expect(r.failClosed).toBe(true);
    expect(r.reason).toContain("incomplete");
  });

  it("empty-200 while existing photos remain → failClosed, zero tombstones", () => {
    const r = reconcileGallery({ ...base, existing: [existing({}), existing({ media_key: "MK2" })], incoming: [] });
    expect(r.failClosed).toBe(true);
    expect(r.pendingRemoval).toHaveLength(0);
    expect(r.confirmedTombstone).toHaveLength(0);
  });

  it("PhotosCount>0 while incoming empty → failClosed", () => {
    const r = reconcileGallery({ ...base, photosCount: 5, existing: [], incoming: [] });
    expect(r.failClosed).toBe(true);
    expect(r.reason).toContain("photoscount");
  });

  it("empty + no existing + photoscount 0 → clean no-op (not failClosed)", () => {
    const r = reconcileGallery({ ...base, photosCount: 0, existing: [], incoming: [] });
    expect(r.failClosed).toBe(false);
    expect(r.insert).toHaveLength(0);
  });

  it("abrupt shrink 20→3 → failClosed", () => {
    const ex = Array.from({ length: 20 }, (_, i) => existing({ media_key: `MK${i}` }));
    const inc = Array.from({ length: 3 }, (_, i) => incoming({ media_key: `MK${i}` }));
    const r = reconcileGallery({ ...base, existing: ex, incoming: inc });
    expect(r.failClosed).toBe(true);
    expect(r.reason).toContain("shrink");
  });

  it("mass-tombstone circuit breaker: >25 vanished rows → failClosed breaker", () => {
    // 60 existing, 34 still present (no shrink trip: 34 >= 30), 26 vanished → breaker.
    const ex = Array.from({ length: 60 }, (_, i) => existing({ media_key: `MK${i}` }));
    const inc = Array.from({ length: 34 }, (_, i) => incoming({ media_key: `MK${i}` }));
    const r = reconcileGallery({ ...base, existing: ex, incoming: inc });
    expect(r.failClosed).toBe(true);
    expect(r.reason).toContain("breaker");
  });
});

describe("reconcileGallery — healthy fetch actions", () => {
  it("explicit MediaStatus='Deleted' → tombstone that row always (healthy gallery)", () => {
    const ex = [existing({ media_key: "A" }), existing({ media_key: "B", order: 2 })];
    const inc = [incoming({ media_key: "A" }), incoming({ media_key: "B", order: 2, media_status: "Deleted" })];
    const r = reconcileGallery({ ...base, existing: ex, incoming: inc });
    expect(r.failClosed).toBe(false);
    expect(r.explicitTombstone.map((x) => x.media_key)).toEqual(["B"]);
    expect(r.skipUnchanged.map((x) => x.media_key)).toEqual(["A"]);
  });

  it("vanished row seen once → pendingRemoval (stamped with runId), NOT tombstoned", () => {
    const ex = [existing({ media_key: "A" }), existing({ media_key: "B", order: 2 }), existing({ media_key: "C", order: 3 })];
    const inc = [incoming({ media_key: "A" }), incoming({ media_key: "B", order: 2 })]; // C vanished
    const r = reconcileGallery({ ...base, existing: ex, incoming: inc });
    expect(r.failClosed).toBe(false);
    expect(r.pendingRemoval.map((x) => x.media_key)).toEqual(["C"]);
    expect(r.confirmedTombstone).toHaveLength(0);
    expect(r.pendingRemovalRun).toBe(RUN);
  });

  it("vanished row already flagged in a PRIOR run → confirmedTombstone (second-fetch confirmation)", () => {
    const ex = [existing({ media_key: "A" }), existing({ media_key: "C", order: 3, pending_removal_run: "run-EARLIER" })];
    const inc = [incoming({ media_key: "A" })]; // C still vanished — but only 1/2 present = shrink? 1 < 1 false → ok
    const r = reconcileGallery({ ...base, existing: ex, incoming: inc });
    expect(r.failClosed).toBe(false);
    expect(r.confirmedTombstone.map((x) => x.media_key)).toEqual(["C"]);
    expect(r.pendingRemoval).toHaveLength(0);
  });

  it("new incoming key → insert; changed identity → updateChanged; unchanged → skip", () => {
    const ex = [existing({ media_key: "A" }), existing({ media_key: "B", order: 2, source_revision: 100 })];
    const inc = [
      incoming({ media_key: "A" }), // unchanged
      incoming({ media_key: "B", order: 2, source_revision: 200 }), // revision bump = changed
      incoming({ media_key: "NEW", order: 3 }), // new
    ];
    const r = reconcileGallery({ ...base, existing: ex, incoming: inc });
    expect(r.skipUnchanged.map((x) => x.media_key)).toEqual(["A"]);
    expect(r.updateChanged.map((x) => x.media_key)).toEqual(["B"]);
    expect(r.insert.map((x) => x.media_key)).toEqual(["NEW"]);
  });
});
