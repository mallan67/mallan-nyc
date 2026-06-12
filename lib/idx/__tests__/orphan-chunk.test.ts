/**
 * P1C6b — deterministic orphan-chunk selection (RED→GREEN: module absent
 * before this amendment).
 */

import {
  selectOrphanChunk,
  ORPHAN_CHUNK_SIZE,
  ORPHAN_TOTAL_SANITY_CAP,
} from "../orphan-chunk";

const row = (id: string) => ({ ListingId: id });

describe("P1C6b — selectOrphanChunk", () => {
  it("deterministic, documented order: ListingId ascending (stable across runs)", () => {
    const a = selectOrphanChunk([row("RLS3"), row("RLS1"), row("RLS2")], new Set(), 2);
    const b = selectOrphanChunk([row("RLS2"), row("RLS3"), row("RLS1")], new Set(), 2);
    expect(a.chunk.map((r) => r.ListingId)).toEqual(["RLS1", "RLS2"]);
    expect(b.chunk.map((r) => r.ListingId)).toEqual(["RLS1", "RLS2"]);
  });

  it("bounds the chunk and reports the remainder", () => {
    const ids = Array.from({ length: 7 }, (_, i) => row(`RLS${i}`));
    const r = selectOrphanChunk(ids, new Set(), 3);
    expect(r.chunk).toHaveLength(3);
    expect(r.totalEligible).toBe(7);
    expect(r.remainingAfter).toBe(4);
  });

  it("archive-overlap ids are EXCLUDED from import and counted (Maya rule, even at 0 today)", () => {
    const r = selectOrphanChunk(
      [row("RLS1"), row("RLS-ARCHIVED"), row("RLS2")],
      new Set(["RLS-ARCHIVED"]),
      10,
    );
    expect(r.chunk.map((x) => x.ListingId)).toEqual(["RLS1", "RLS2"]);
    expect(r.archiveOverlap).toBe(1);
    expect(r.totalEligible).toBe(2);
  });

  it("shrinking-set landing forecast: probe positions 514/550/649 land on nights 2-3 at chunk=300", () => {
    // Simulate the probe's deterministic ordering with synthetic ids whose
    // sort positions match the probe (zero-padded so lexicographic = numeric).
    const ids = Array.from({ length: 1361 }, (_, i) => row(`RLS${String(i).padStart(6, "0")}`));
    const ghostPositions = [514, 550, 649];

    const night1 = selectOrphanChunk(ids, new Set(), 300);
    const night1Ids = new Set(night1.chunk.map((r) => r.ListingId));
    expect(ghostPositions.every((p) => !night1Ids.has(ids[p].ListingId))).toBe(true);

    const after1 = ids.filter((r) => !night1Ids.has(r.ListingId));
    const night2 = selectOrphanChunk(after1, new Set(), 300);
    const night2Ids = new Set(night2.chunk.map((r) => r.ListingId));
    // positions 514 and 550 shift to 214/250 → night 2; 649 → 349 → night 3
    expect(night2Ids.has(ids[514].ListingId)).toBe(true);
    expect(night2Ids.has(ids[550].ListingId)).toBe(true);
    expect(night2Ids.has(ids[649].ListingId)).toBe(false);

    const after2 = after1.filter((r) => !night2Ids.has(r.ListingId));
    const night3 = selectOrphanChunk(after2, new Set(), 300);
    expect(new Set(night3.chunk.map((r) => r.ListingId)).has(ids[649].ListingId)).toBe(true);
  });

  it("constants pinned: chunk=300 (Maya 2026-06-12), sanity cap=5000 (probe truth 1,361)", () => {
    expect(ORPHAN_CHUNK_SIZE).toBe(300);
    expect(ORPHAN_TOTAL_SANITY_CAP).toBe(5000);
  });
});
