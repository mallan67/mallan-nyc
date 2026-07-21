/**
 * Unified system — Phase 1, Task 6: media:system-health invariant monitor.
 *
 * Permanent, read-only invariant checks over the media inventory. Phase 1 wires
 * the identity/key invariants; later-phase sections report "n/a" until built.
 * Pure + injected readers — no DB/network here.
 */
import { runSystemHealth, type MediaInventoryRow } from "@/lib/ops/media-system-health";

const row = (over: Partial<MediaInventoryRow>): MediaInventoryRow => ({
  id: "1",
  listingId: "L1",
  mediaKey: "MK1",
  status: "active",
  canonicalType: "Photo",
  r2ObjectKey: "photos/L1/MK1/100.jpg",
  isHero: false,
  ...over,
});

const idOf = (id: string) => (c: { id: string }) => c.id === id;

describe("runSystemHealth — identity/key invariants", () => {
  it("clean inventory → 0 red", async () => {
    const report = await runSystemHealth({
      readInventory: () => [
        row({ id: "1", mediaKey: "MK1", r2ObjectKey: "photos/L1/MK1/1.jpg", isHero: true }),
        row({ id: "2", mediaKey: "MK2", r2ObjectKey: "photos/L1/MK2/1.jpg" }),
        row({ id: "3", mediaKey: "MK3", canonicalType: "FloorPlan", r2ObjectKey: "floorplans/L1/MK3/1.jpg" }),
      ],
    });
    expect(report.red).toBe(0);
  });

  it("duplicate active media_key → red", async () => {
    const report = await runSystemHealth({
      readInventory: () => [
        row({ id: "1", mediaKey: "DUP", r2ObjectKey: "photos/L1/DUP/1.jpg" }),
        row({ id: "2", mediaKey: "DUP", r2ObjectKey: "photos/L1/DUP/2.jpg" }),
      ],
    });
    const check = report.checks.find(idOf("identity.no_duplicate_active_media_key"));
    expect(check?.status).toBe("red");
    expect(report.red).toBeGreaterThanOrEqual(1);
  });

  it("deleted duplicate media_key does NOT trip the active-duplicate check", async () => {
    const report = await runSystemHealth({
      readInventory: () => [
        row({ id: "1", mediaKey: "MK1", r2ObjectKey: "photos/L1/MK1/1.jpg" }),
        row({ id: "2", mediaKey: "MK1", status: "deleted", r2ObjectKey: null }),
      ],
    });
    const check = report.checks.find(idOf("identity.no_duplicate_active_media_key"));
    expect(check?.status).toBe("green");
  });

  it("two active rows sharing an r2_object_key → red (collision)", async () => {
    const report = await runSystemHealth({
      readInventory: () => [
        row({ id: "1", mediaKey: "MK1", r2ObjectKey: "photos/L1/COLLIDE.jpg" }),
        row({ id: "2", mediaKey: "MK2", r2ObjectKey: "photos/L1/COLLIDE.jpg" }),
      ],
    });
    const check = report.checks.find(idOf("identity.no_shared_r2_object_key"));
    expect(check?.status).toBe("red");
  });

  it("a non-Photo used as hero → red (hero must be a Photo)", async () => {
    const report = await runSystemHealth({
      readInventory: () => [
        row({ id: "1", mediaKey: "MK1", canonicalType: "FloorPlan", isHero: true, r2ObjectKey: "floorplans/L1/MK1/1.jpg" }),
      ],
    });
    const check = report.checks.find(idOf("identity.hero_is_photo_only"));
    expect(check?.status).toBe("red");
  });

  it("later-phase sections report n/a (not red) until built", async () => {
    const report = await runSystemHealth({ readInventory: () => [] });
    expect(report.checks.some((c) => c.status === "n/a")).toBe(true);
    expect(report.red).toBe(0);
  });
});
