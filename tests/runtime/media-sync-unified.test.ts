/**
 * Unified system — Phase 2, Task 10: flag-gated unified media pipeline adapter.
 *
 * Pure adapter that bridges the media-sync data into the fail-closed reconciler,
 * strict classifier, identity comparator, and hero resolver — behind
 * UNIFIED_MEDIA_PIPELINE (default OFF, no behavior change on merge). Tests the
 * seven required protections. No DB/network.
 */
import {
  isUnifiedPipelineEnabled,
  buildPropertyScopedMediaQuery,
  planUnifiedReconcile,
  resolveHeroFromFeed,
  UNIFIED_NON_FEED_PREFIX,
} from "@/lib/idx/unified-media-reconcile";
import type { ExistingMediaRow, IncomingMedia } from "@/lib/sync/gallery-reconcile";

const RUN = "run-2026-07-21";

const existing = (o: Partial<ExistingMediaRow>): ExistingMediaRow => ({
  listing_id: "L1", resource_record_key: "L1", resource_record_id: null,
  media_key: "MK1", source_revision: 100, media_category: "Photo",
  media_classification: null, media_type: "Photo", order: 1,
  preferred_photo_yn: false, status: "active", pending_removal_run: null, ...o,
});
const incoming = (o: Partial<IncomingMedia>): IncomingMedia => ({
  listing_id: "L1", resource_record_key: "L1", resource_record_id: null,
  media_key: "MK1", source_revision: 100, media_category: "Photo",
  media_classification: null, media_type: "Photo", order: 1,
  preferred_photo_yn: false, status: "active", media_status: "Active", ...o,
});
const base = { photosCount: null as number | null, runId: RUN };

describe("Task 10 — flag gate + Property-scoped query", () => {
  it("flag defaults OFF; only 'true' enables it (no behavior change on merge)", () => {
    expect(isUnifiedPipelineEnabled({})).toBe(false);
    expect(isUnifiedPipelineEnabled({ UNIFIED_MEDIA_PIPELINE: "false" })).toBe(false);
    expect(isUnifiedPipelineEnabled({ UNIFIED_MEDIA_PIPELINE: "true" })).toBe(true);
  });

  it("Media query is Property-scoped and selects MediaType + ResourceName", () => {
    const q = buildPropertyScopedMediaQuery("L1");
    expect(q.get("$filter")).toContain("ResourceName eq 'Property'");
    expect(q.get("$filter")).toContain("ResourceRecordKey eq 'L1'");
    expect(q.get("$select")).toContain("MediaType");
    expect(q.get("$select")).toContain("ResourceName");
  });
});

describe("Task 10 — reconciliation protections", () => {
  it("[complete chain] a rotated-URL-only re-run performs ZERO writes (all skipUnchanged)", () => {
    const ex = [existing({ media_key: "A" })];
    // Same identity, only the (excluded) URL differs.
    const inc = [incoming({ media_key: "A", media_url_original: "https://img.cotality.com/ROTATED.jpg" })];
    const r = planUnifiedReconcile({ ...base, existing: ex, incoming: inc, pageChainComplete: true });
    expect(r.failClosed).toBe(false);
    expect(r.insert).toHaveLength(0);
    expect(r.updateChanged).toHaveLength(0);
    expect(r.explicitTombstone.length + r.pendingRemoval.length + r.confirmedTombstone.length).toBe(0);
    expect(r.skipUnchanged.map((x) => x.media_key)).toEqual(["A"]);
  });

  it("[incomplete chain] pageChainComplete=false → fail closed, ZERO destructive action", () => {
    const ex = [existing({ media_key: "A" }), existing({ media_key: "B", order: 2 })];
    const r = planUnifiedReconcile({ ...base, existing: ex, incoming: [incoming({ media_key: "A" })], pageChainComplete: false });
    expect(r.failClosed).toBe(true);
    expect(r.pendingRemoval).toHaveLength(0);
    expect(r.confirmedTombstone).toHaveLength(0);
    expect(r.explicitTombstone).toHaveLength(0);
  });

  it("[empty/shrink] empty response with existing photos → fail closed, ZERO tombstones", () => {
    const ex = [existing({ media_key: "A" }), existing({ media_key: "B", order: 2 })];
    const r = planUnifiedReconcile({ ...base, existing: ex, incoming: [], pageChainComplete: true });
    expect(r.failClosed).toBe(true);
    expect(r.pendingRemoval.length + r.confirmedTombstone.length).toBe(0);
  });

  it("[feed provenance] a non-Cotality (locally-uploaded) row absent from the feed is NEVER tombstoned", () => {
    const nonFeedKey = `${UNIFIED_NON_FEED_PREFIX}local-1`;
    const ex = [
      existing({ media_key: "A" }),
      existing({ media_key: "B", order: 2 }),
      existing({ media_key: nonFeedKey, order: 3 }), // locally uploaded, not in feed
    ];
    const inc = [incoming({ media_key: "A" }), incoming({ media_key: "B", order: 2 })];
    const r = planUnifiedReconcile({ ...base, existing: ex, incoming: inc, pageChainComplete: true });
    const destructiveKeys = [...r.pendingRemoval, ...r.confirmedTombstone, ...r.explicitTombstone].map((x) => x.media_key);
    expect(destructiveKeys).not.toContain(nonFeedKey);
    expect(r.protectedNonFeed.map((x) => x.media_key)).toEqual([nonFeedKey]);
  });

  it("[all-status distinction] an all-deleted gallery + empty feed stays a clean no-op (rows preserved, not re-touched)", () => {
    const ex = [existing({ media_key: "A", status: "deleted" }), existing({ media_key: "B", status: "deleted" })];
    const r = planUnifiedReconcile({ ...base, photosCount: 0, existing: ex, incoming: [], pageChainComplete: true });
    expect(r.failClosed).toBe(false); // no ACTIVE rows → not a wipe scenario
    // the deleted rows are not resurrected, re-tombstoned, or otherwise touched:
    expect(r.insert.length + r.updateChanged.length + r.explicitTombstone.length + r.pendingRemoval.length + r.confirmedTombstone.length).toBe(0);
  });
});

describe("Task 10 — hero never a FloorPlan/Document", () => {
  it("a FloorPlan at a lower Order than the photos is NEVER the hero", () => {
    const inc = [
      incoming({ media_key: "FP", media_category: "FloorPlan", media_type: "Pdf", order: 0 }),
      incoming({ media_key: "P1", media_category: "Photo", media_type: "Jpeg", order: 5 }),
      incoming({ media_key: "P2", media_category: "Photo", media_type: "Jpeg", order: 6 }),
    ];
    const hero = resolveHeroFromFeed(inc);
    expect(hero?.canonicalType).toBe("Photo");
    expect(hero?.mediaKey).toBe("P1");
  });

  it("a Document-only gallery yields NO hero (never promotes a non-photo)", () => {
    const inc = [incoming({ media_key: "D1", media_category: "Disclosure", media_type: "Pdf", order: 0 })];
    expect(resolveHeroFromFeed(inc)).toBeNull();
  });
});
